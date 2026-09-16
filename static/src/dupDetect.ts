// ─── DupDetect (EPIC-028 P0) : détection doublons épars ↔ source ──────────
// Matching strict validé : similarité nom ≥ 0,88 ET |Δdurée| ≤ 2 s.
// Pur et sans DOM — 100 % testable, consommé par la couche présentation (P1).
// Source des données : le scan indexe déjà duration (±1 s) et codec+bitrate
// sur les deux colonnes (app.py get_audio_meta).

// ── Types publics ─────────────────────────────────────────────────────────

/** Un fichier indexé tel que le scan le fournit (les deux colonnes). */
export interface DupFileEntry {
  filename: string;
  fullPath: string;
  /** Chemin relatif ou absolu — non utilisé pour le matching, réservé à l'UX. */
  path: string;
  duration: number | null;
  codec: string | null;
}

/** Verdict de qualité d'une paire : qui gagne ? */
export type DupVerdict = 'left-better' | 'equal' | 'right-better';

/** Paire confirmée entre un fichier épars (gauche) et son jumeau rangé (droite). */
export interface DupMatch {
  /** Chemin complet du fichier épars (clé de lookup, stable). */
  eparsFullPath: string;
  /** Chemin complet du fichier rangé (droite). */
  sourceFullPath: string;
  /** Nom du fichier épars (affichage). */
  eparsFilename: string;
  /** Nom du fichier rangé (affichage). */
  sourceFilename: string;
  /** Similarité de nom normalisé, 0..1. */
  sim: number;
  /** Écart de durée en secondes (valeur absolue). */
  delta: number;
  verdict: DupVerdict;
}

/** Résultat complet d'une détection. */
export interface DupResult {
  matches: DupMatch[];
  /** Map de lookup pour l'UX : fullPath épars → match. */
  byEparsPath: Map<string, DupMatch>;
}

// ── Seuils validés (spec 2026-09-15) ──────────────────────────────────────

export const SIM_THRESHOLD = 0.88;
export const DELTA_THRESHOLD_S = 2;

// ── Normalisation de nom ──────────────────────────────────────────────────

/** Bruit courant dans les noms de fichiers audio — retiré avant comparaison. */
const NOISE_PATTERNS: RegExp[] = [
  /\((?:radio|single|album|club|extended|original|instrumental|acoustic|live|remix|mix)\s*(?:edit|version|mix)?\)/gi,
  /\[(?:hq|hd|high\s*quality|official\s*(?:video|audio)|lyrics?|remastered)\]/gi,
  /\((?:hq|hd|official\s*(?:video|audio)|lyrics?|remastered(?:\s*\d{2,4})?)\)/gi,
  /\bfeat\.?\s.+$/i,
  /\bft\.?\s.+$/i,
  /^\d{1,3}[-.\s]+/,
];

/** Normalise un nom de fichier pour comparaison floue. */
export function normalizeName(filename: string): string {
  let name = filename;
  // Extension retirée avant tout (le point n'est pas un séparateur de mots ici)
  const dot = name.lastIndexOf('.');
  if (dot > 0) name = name.slice(0, dot);

  // Minuscules + accents strips (NFD puis retrait des diacritiques)
  name = name.toLowerCase();
  name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Retrait du bruit (2 passes : "(radio edit) (remastered)" existe)
  for (let pass = 0; pass < 2; pass++) {
    for (const rx of NOISE_PATTERNS) {
      name = name.replace(rx, ' ');
    }
  }

  // Séparateurs → espaces, collapse
  name = name.replace(/[_\-.]+/g, ' ');
  name = name.replace(/\s+/g, ' ').trim();
  return name;
}

// ── Similarité ────────────────────────────────────────────────────────────

/** Distance de Levenshtein (DP compacte, O(min(m,n)) mémoire). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Ratio de Levenshtein (0..1), 1 = identique. */
export function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Similarité token-set : tokens communs / tokens totaux (ordre indifférent) —
 *  gère « Artiste - Titre » vs « Titre - Artiste ». */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const total = ta.size + tb.size - common;
  return total === 0 ? 0 : common / total;
}

/** Similarité combinée : max(ratio, token-set) — le meilleur des deux mondes. */
export function nameSimilarity(a: string, b: string): number {
  return Math.max(levenshteinRatio(a, b), tokenSetRatio(a, b));
}

// ── Score qualité ─────────────────────────────────────────────────────────

/** Paliers validés (spec) : lossless 100 / ≥256k 80 / 128-255 60 / <128 40. */
export function qualityScore(codec: string | null): number {
  if (!codec) return 0;
  const c = codec.toLowerCase();
  if (/\b(flac|wav|aiff?|alac)\b/.test(c)) return 100;
  const kbps = /(\d+)\s*kbps/.exec(c);
  if (kbps) {
    const k = parseInt(kbps[1], 10);
    if (k >= 256) return 80;
    if (k >= 128) return 60;
    return 40;
  }
  // Codec lossy sans bitrate indexé : palier moyen par défaut (MP3/AAC/OGG…)
  if (/\b(mp3|aac|ogg|wma|m4a)\b/.test(c)) return 60;
  return 0;
}

/** Compare la qualité gauche (épars) vs droite (rangé). */
export function compareQuality(left: DupFileEntry, right: DupFileEntry): DupVerdict {
  const ql = qualityScore(left.codec);
  const qr = qualityScore(right.codec);
  if (ql > qr) return 'left-better';
  if (qr > ql) return 'right-better';
  // Tie-breaker : durée plus longue (full vs radio edit) — l'épars gagne.
  const dl = left.duration ?? 0;
  const dr = right.duration ?? 0;
  if (dl > dr) return 'left-better';
  if (dr > dl) return 'right-better';
  return 'equal';
}

// ── Détection ─────────────────────────────────────────────────────────────

/** Détecte les doublons : pour chaque fichier épars, cherche son jumeau rangé
 *  (durée ±2 s via bucketing O(n), puis similarité nom ≥ 0,88).
 *  Un épars matche au PLUS un jumeau : le meilleur candidat (sim la plus
 *  haute, puis Δ le plus faible). */
export function detectDuplicates(
  eparsFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
  sourceFiles: Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>,
): DupResult {
  // Index droite : round(duration) → liste de fichiers (bucketing O(n))
  const buckets = new Map<number, Array<DupFileEntry & { baseDir: string }>>();
  for (const [baseDir, files] of Object.entries(sourceFiles)) {
    for (const [filename, data] of Object.entries(files)) {
      if (data.duration == null) continue; // sans durée, pas de bucket fiable
      const key = Math.round(data.duration);
      const entry: DupFileEntry & { baseDir: string } = {
        filename,
        fullPath: `${baseDir}/${data.path}`,
        path: data.path,
        duration: data.duration,
        codec: data.codec ?? null,
        baseDir,
      };
      const list = buckets.get(key);
      if (list) list.push(entry);
      else buckets.set(key, [entry]);
    }
  }

  const matches: DupMatch[] = [];
  for (const [baseDir, files] of Object.entries(eparsFiles)) {
    for (const [filename, data] of Object.entries(files)) {
      if (data.duration == null) continue;
      const eparsEntry: DupFileEntry = {
        filename,
        fullPath: `${baseDir}/${data.path}`,
        path: data.path,
        duration: data.duration,
        codec: data.codec ?? null,
      };
      const eparsNorm = normalizeName(filename);
      const base = Math.round(data.duration);

      // Candidats : buckets base-2..base+2. Écart de clé = round(|Δ|) : un
      // Δ de 2,0 s exact donne des clés distantes de 2 (ex. 200 ↔ 202), donc
      // ±1 ne suffirait pas. Le check précis `delta > DELTA_THRESHOLD_S`
      // ci-dessous reste le gardien (rejette Δ=2.8 entre clés adjacentes).
      let best: { match: DupMatch; sim: number; delta: number } | null = null;
      for (let offset = -2; offset <= 2; offset++) {
        const candidates = buckets.get(base + offset);
        if (!candidates) continue;
        for (const cand of candidates) {
          const delta = Math.abs((data.duration ?? 0) - (cand.duration ?? 0));
          if (delta > DELTA_THRESHOLD_S) continue;
          const sim = nameSimilarity(eparsNorm, normalizeName(cand.filename));
          if (sim < SIM_THRESHOLD) continue;
          const better = !best || sim > best.sim || (sim === best.sim && delta < best.delta);
          if (better) {
            best = {
              sim,
              delta,
              match: {
                eparsFullPath: eparsEntry.fullPath,
                sourceFullPath: cand.fullPath,
                eparsFilename: filename,
                sourceFilename: cand.filename,
                sim,
                delta,
                verdict: compareQuality(eparsEntry, cand),
              },
            };
          }
        }
      }
      if (best) matches.push(best.match);
    }
  }

  const byEparsPath = new Map<string, DupMatch>();
  for (const m of matches) byEparsPath.set(m.eparsFullPath, m);
  return { matches, byEparsPath };
}
