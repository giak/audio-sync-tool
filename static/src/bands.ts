// ─── Analyse spectrale 3-bandes (EPIC-020) — low/mid/high en RGB (standard DJ) ─
// Deux méthodes complémentaires :
//  - `computeBassBand` (EPIC-012) : biquad RBJ 40-150 Hz + décimation + RMS — port
//    client conforme du pipeline `analysis.py`, conservé tel quel (API validée).
//  - `computeRGBBands` (EPIC-020) : FFT par fenêtre — la séparation par bandes de
//    bins est quasi parfaite (un biquad RBJ à Q faible laisse fuir ~20-35 % du
//    hors-bande proche : un kick 60 Hz éclaire la bande mid, indésirable pour un
//    rendu RGB fidèle).
// Pur et synchrone : testable sans AudioContext ni réseau (zéro dépendance).

/** Biquad RBJ bandpass (gain crête 0 dB) — copie conforme d'`analysis._biquad_bandpass`. */
function biquadBandpass(samples: Float32Array, fs: number, fLo: number, fHi: number): Float32Array {
  const f0 = Math.sqrt(fLo * fHi);
  const q = f0 / (fHi - fLo);
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;
  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Bande d'énergie basse d'un signal mono (EPIC-012) — API conservée.
 * @param samples  échantillons mono (Float32Array, -1..1)
 * @param sampleRate  fréquence d'échantillonnage (Hz)
 * @param barCount  nombre de barres (résolution de la bande)
 * @returns `barCount` valeurs 0..1 (normalisées par le max), ou [] si signal trop court.
 */
export function computeBassBand(samples: Float32Array, sampleRate: number, barCount = 160): number[] {
  // Garde : il faut au moins ~1 s de signal pour une bande exploitable.
  if (samples.length < sampleRate || barCount < 2) return [];
  // 1) Biquad bandpass 40-150 Hz sur le signal COMPLET (fs réelle) : élimine les
  //    HF (hats/voix) AVANT tout sous-échantillonnage — un filtrage après une
  //    décimation par moyenne laisserait passer le battement des fréquences hors
  //    bande (repliement). Ordre fidèle à analysis.py (résample → filtre).
  const filtered = biquadBandpass(samples, sampleRate, 40, 150);
  // 2) Sous-échantillonnage par prise simple à ~400 Hz : légitime, le signal est
  //    déjà borné à 150 Hz (Nyquist 200 Hz) → aucun repliement.
  const step = Math.max(1, Math.round(sampleRate / 400));
  const nDec = Math.max(1, Math.floor(filtered.length / step));
  if (nDec < 8) return [];
  // 3) RMS par fenêtre → barres.
  const per = Math.max(1, Math.floor(nDec / barCount));
  const bars: number[] = [];
  for (let i = 0; i < barCount; i++) {
    let acc = 0;
    let count = 0;
    const start = i * per;
    const end = Math.min(start + per, nDec);
    for (let j = start; j < end; j++) {
      const v = filtered[j * step];
      acc += v * v;
      count++;
    }
    bars.push(Math.sqrt(acc / count));
  }
  // 4) Normalisation 0..1. Seuil 2 % du plein signal : le résidu hors bande
  //    (hats/voix atténués de ~38 dB par le biquad) ne doit pas être normalisé à
  //    1 — un morceau sans kick affiche une bande plate, pas un faux rythme.
  let max = 0;
  for (const b of bars) if (b > max) max = b;
  if (max < 0.02) return bars.map(() => 0);
  return bars.map(b => b / max);
}

/** Bandes de la waveform RGB — conventions des DJ softs (Serato, rekordbox, Traktor). */
export const RGB_BANDS = {
  low: { fLo: 40, fHi: 150 }, // kick / grosse caisse
  mid: { fLo: 150, fHi: 2000 }, // voix, claps, toms
  high: { fLo: 2000, fHi: 16000 }, // hats, cymbales, air
} as const;

export interface RGBBands {
  low: number[];
  mid: number[];
  high: number[];
}

/** FFT radix-2 itérative (Cooley-Tukey, in-place sur une copie). Retourne les
 *  magnitudes des bins 0..N/2 (spectre unilatéral), N = puissance de 2 ≥ longueur. */
function fftMagnitudes(input: Float32Array): Float32Array {
  const n = 1 << Math.ceil(Math.log2(input.length));
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  re.set(input);
  // Permutation bit-reversal.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  // Boucles butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  const mags = new Float32Array(n / 2 + 1);
  for (let i = 0; i <= n / 2; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  return mags;
}

/** Somme de l'énergie (magnitude²) sur l'intervalle de bins [a, b] (bornes incluses). */
function bandEnergyOf(mags: Float32Array, a: number, b: number): number {
  let s = 0;
  for (let i = a; i <= b; i++) {
    const v = mags[i];
    s += v * v;
  }
  return s;
}

/**
 * Waveform 3-bandes (EPIC-020) : low/mid/high par FFT fenêtrée, chacune
 * normalisée indépendamment (une piste sans kicks mais riche en hats montre une
 * bande low plate, pas un faux rythme). La séparation par bins est quasi parfaite
 * (fenêtre de Hann → saignement spectral négligeable loin des frontières).
 * @param samples  échantillons mono (Float32Array, -1..1)
 * @param sampleRate  fréquence d'échantillonnage (Hz)
 * @param barCount  nombre de barres (résolution, défaut 160)
 */
export function computeRGBBands(samples: Float32Array, sampleRate: number, barCount = 160): RGBBands {
  const empty: RGBBands = { low: [], mid: [], high: [] };
  // Garde : il faut au moins ~1 s de signal, et un minimum de fenêtres.
  if (samples.length < sampleRate || barCount < 2) return empty;
  const winSize = 4096; // ~93 ms à 44.1 kHz — résolution fréquentielle ~10.8 Hz
  const half = winSize / 2;
  const total = samples.length;
  if (total < winSize * 3) return empty;
  // Bins de chaque bande (bornes incluses).
  const bin = (f: number) => Math.min(half, Math.round((f / sampleRate) * winSize));
  const lowBins = [bin(RGB_BANDS.low.fLo), bin(RGB_BANDS.low.fHi)];
  const midBins = [bin(RGB_BANDS.mid.fLo), bin(RGB_BANDS.mid.fHi)];
  const highBins = [bin(RGB_BANDS.high.fLo), bin(RGB_BANDS.high.fHi)];
  // Une barre = segment temporel ; on moyenne 3 fenêtres FFT réparties (0.25/0.5/0.75
  // du segment) pour ne pas manquer une énergie brève (kick) tombée hors d'une
  // fenêtre unique.
  const positions = [0.25, 0.5, 0.75];
  const low = new Array<number>(barCount).fill(0);
  const mid = new Array<number>(barCount).fill(0);
  const high = new Array<number>(barCount).fill(0);
  const segLen = total / barCount;
  for (let i = 0; i < barCount; i++) {
    const segStart = i * segLen;
    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    for (const p of positions) {
      const off = Math.min(total - winSize, Math.max(0, Math.round(segStart + segLen * p - winSize / 2)));
      // Fenêtre de Hann — réduit le saignement spectral (lobes secondaires ~-31 dB).
      const frame = new Float32Array(winSize);
      for (let j = 0; j < winSize; j++) {
        const s = samples[off + j];
        frame[j] = s * 0.5 * (1 - Math.cos((2 * Math.PI * j) / (winSize - 1)));
      }
      const mags = fftMagnitudes(frame);
      lowSum += bandEnergyOf(mags, lowBins[0], lowBins[1]);
      midSum += bandEnergyOf(mags, midBins[0], midBins[1]);
      highSum += bandEnergyOf(mags, highBins[0], highBins[1]);
    }
    low[i] = Math.sqrt(lowSum / positions.length);
    mid[i] = Math.sqrt(midSum / positions.length);
    high[i] = Math.sqrt(highSum / positions.length);
  }
  // Normalisation : chaque bande par son propre max — chaque bande montre sa
  // propre dynamique (une piste kick-lourd garde une bande high lisible). Garde
  // anti-faux-signal : une bande dont le max est < 2 % du max GLOBAL des 3 bandes
  // est considérée vide (résidu spectral/numérique d'un sinus hors bande, ~-60 dB
  // avec Hann) → tout à 0, pas un signal fantôme.
  const globalMax = Math.max(...low, ...mid, ...high);
  const normalize = (bars: number[]): number[] => {
    let max = 0;
    for (const b of bars) if (b > max) max = b;
    if (max === 0 || max < 0.02 * globalMax) return bars.map(() => 0);
    return bars.map(b => b / max);
  };
  return { low: normalize(low), mid: normalize(mid), high: normalize(high) };
}
