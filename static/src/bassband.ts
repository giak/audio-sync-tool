// ─── Bande d'énergie basse (EPIC-012) — visualisation du kick sous la waveform ──
// Port client du pipeline `analysis.py` : décimation par moyenne (passe-bas),
// biquad RBJ bandpass 40-150 Hz, RMS par fenêtre → barres normalisées 0..1.
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
 * Calcule la bande d'énergie basse d'un signal mono.
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
