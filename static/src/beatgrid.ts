// ─── Beat grid — BPM detection + grid math (hors collection) ─────────────
// Traktor 4 n'exporte pas de BEATGRID dans le collection.nml : la grille est
// donc CALCULÉE depuis un BPM détecté sur l'audio (ou saisi manuellement).
// Phase supposée à t=0 (meilleur effort — pas de marker de downbeat).

/** Durée d'un beat en secondes pour un BPM donné. */
export function beatInterval(bpm: number): number {
  return 60 / bpm;
}

/** Positions des beats (secondes) de `startAt` à `duration`, pas = 1 beat. */
export function buildBeats(bpm: number, duration: number, startAt = 0): number[] {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(duration) || duration <= 0) return [];
  const step = beatInterval(bpm);
  const beats: number[] = [];
  for (let t = startAt; t <= duration + 1e-9; t += step) beats.push(t);
  return beats;
}

/** Snap une position sur le beat le plus proche (inchangée si pas de grille). */
export function snapToBeat(t: number, beats: number[]): number {
  if (beats.length === 0 || !Number.isFinite(t)) return t;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const a = beats[lo > 0 ? lo - 1 : 0];
  const b = beats[lo];
  return Math.abs(t - a) <= Math.abs(b - t) ? a : b;
}

/**
 * Autocorrélation centrée (comb pondéré sur 4 harmoniques) de l'enveloppe
 * d'onset → BPM dominant. `onsets` : énergie par frame, `frameRate` : fps.
 * - Signal plat (variance nulle) → 0 : aucune périodicité exploitable.
 * - Le comb (1/k) détecte l'harmonique quand le tempo vrai est hors bornes
 *   (ex. 60 BPM avec min 70 → la corrélation à 120 BPM reste trouvée), tout en
 *   favorisant le tempo vrai dans les cas ambigus (l'octave ne surclasse jamais).
 */
export function detectTempoFromOnsets(onsets: number[], frameRate: number, minBpm = 70, maxBpm = 180): number {
  const n = onsets.length;
  if (n < 20 || frameRate <= 0) return 0;
  // Signal centré : la variance sert de garde (plat → 0) et de dénominateur.
  // Seuil RELATIF à l'énergie : un signal constant a une variance flottante
  // non nulle (ex. 8e-34) qu'il faut quand même traiter comme plat.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onsets[i];
  mean /= n;
  let variance = 0;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const d = onsets[i] - mean;
    variance += d * d;
    energy += onsets[i] * onsets[i];
  }
  if (variance <= energy * 1e-10) return 0;
  const minLag = Math.max(1, Math.floor((frameRate * 60) / maxBpm));
  const maxLag = Math.min(n - 1, Math.ceil((frameRate * 60) / minBpm));
  if (maxLag <= minLag) return 0;
  let bestLag = 0;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let k = 1; k <= 4; k++) {
      const step = lag * k;
      if (step >= n) break;
      const w = 1 / k;
      for (let i = 0; i + step < n; i++) {
        score += w * (onsets[i] - mean) * (onsets[i + step] - mean);
      }
    }
    const s = score / variance;
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestScore <= 0) return 0;
  return +(60 * (frameRate / bestLag)).toFixed(1);
}

/**
 * Détection BPM complète côté navigateur : fetch + decode + enveloppe d'énergie
 * (frame 1024, hop 512, downmix mono) + autocorrélation. Renvoie 0 en échec.
 */
export async function detectBPMFromUrl(url: string): Promise<number> {
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const buf = await res.arrayBuffer();
    const Ctx: typeof AudioContext =
      globalThis.AudioContext || (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return 0;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(buf);
      const channel = audio.getChannelData(0);
      const frameSize = 1024;
      const hop = 512;
      const onsets: number[] = [];
      for (let i = 0; i + frameSize <= channel.length; i += hop) {
        let energy = 0;
        for (let j = 0; j < frameSize; j += 4) {
          const s = channel[i + j];
          energy += s * s;
        }
        onsets.push(Math.sqrt(energy));
      }
      // Différence première half-wave rectifiée → pics d'attaque.
      for (let i = onsets.length - 1; i > 0; i--) {
        onsets[i] = Math.max(0, onsets[i] - onsets[i - 1]);
      }
      return detectTempoFromOnsets(onsets, audio.sampleRate / hop);
    } catch {
      return 0;
    } finally {
      void ctx.close().catch(() => {});
    }
  } catch {
    return 0;
  }
}
