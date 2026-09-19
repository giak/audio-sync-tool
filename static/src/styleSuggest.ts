// ─── Moteur de suggestion de style (P2) — pur, sans DOM ──────────────────
// Pour chaque fichier épars sans choix de session, calcule un score par style
// à partir de 4 signaux pondérés :
//   1. Segment de chemin épars (0.50) — le plus profond aliasable gagne
//   2. Voisinage artiste dans les dossiers source (0.40)
//   3. Historique de session (même sous-dossier épars) (0.20)
//   4. Genre ID3 aliasé (0.15)
// Confiance = score_total / score_max_possible (1.25) → normalisé 0..1.
// Seuil : confidence ≥ 0.30 → suggestion retournée, sinon null.

import type { Taxonomy } from './styles.js';

// ── Alias embarqués ───────────────────────────────────────────────────────

/** Genre ID3 → style. Les valeurs non listées (Electronic, House, Blues…)
 *  sont volontairement absentes : trop larges ou aucun dossier cible unique. */
export const GENRE_ALIASES: Record<string, string> = {
  acid: 'techno_acid',
  'acid techno': 'techno_acid',
  trance: 'trance',
  goa: 'trance',
  'goa trance': 'trance',
  psytrance: 'trance',
  techno: 'techno',
  'hard techno': 'techno',
  'peak time': 'techno',
  driving: 'techno',
  hardcore: 'hardcore',
  gabber: 'hardcore',
  hardstyle: 'hardcore',
  'drum and bass': 'drumbass',
  'drum & bass': 'drumbass',
  dnb: 'drumbass',
  ambient: 'ambient',
  downtempo: 'ambient',
  disco: 'italo_disco',
  'italo disco': 'italo_disco',
  'new beat': 'new_beat',
  'electro clash': 'electro_clash',
  electroclash: 'electro_clash',
};

/** Segment de chemin épars → style. Les accents et underscores sont normalisés
 *  avant lookup. Le segment le plus profond (niveau >) qui matche gagne. */
export const SEGMENT_ALIASES: Record<string, string> = {
  schranz: 'techno_hard',
  goa: 'trance',
  'acid techno': 'techno_acid',
  acid: 'techno_acid',
  techno: 'techno',
  hardcore: 'hardcore',
  trance: 'trance',
  drumbass: 'drumbass',
  drum: 'drumbass',
  dnb: 'drumbass',
  ambient: 'ambient',
  'electro clash': 'electro_clash',
  electroclash: 'electro_clash',
  house: 'house',
  'new beat': 'new_beat',
  'italo disco': 'italo_disco',
};

// ── Helpers ───────────────────────────────────────────────────────────────

/** Normalise un segment pour lookup (minuscule, accents retirés, trim). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Extrait les segments d'un chemin relatif épars, du plus profond au plus
 *  superficiel. `_techno/acid techno/track.mp3` → ['acid techno', '_techno'].
 *  Le premier segment (commençant par `_`) est un dossier de regroupement :
 *  on le normalise sans le `_` leading pour le lookup. */ export function pathSegments(relPath: string): string[] {
  const parts = relPath.split('/').filter(Boolean);
  // Un seul segment = fichier à la racine → aucun dossier
  if (parts.length <= 1) return [];
  // Retirer le nom de fichier (dernier segment)
  parts.pop();
  // Du plus profond au plus superficiel, en retirant le _ leading
  return parts.reverse().map(p => (p.startsWith('_') ? p.slice(1) : p));
}

/** Score d'un style à partir d'une liste de styles observés. */
function scoreFromStyles(styles: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of styles) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

// ── Parse artiste depuis le nom de fichier (miroir app.py _artist_title) ─

const NOISE_RX =
  /\b(remix|remaster(?:ed)?|edit|version|mix|hq|hd|official|video|audio|lyrics?|feat\.?|ft\.?|radio|single|album|club|extended|original|instrumental|acoustic|live|vol\.?\s*\d*|volume)\b/gi;

/** Strip accents (NFD → retrait diacritiques). */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Parse (artiste, titre) depuis un nom de fichier. Portage simplifié de
 *  `_artist_title()` dans app.py — suffisant pour le voisinage artiste. */
export function parseArtistTitle(filename: string): { artist: string | null; title: string | null } {
  let n = stripAccents(filename.replace(/\.[^.]+$/, '').toLowerCase());
  // Pattern [bracket] title
  const mBracket = /^\s*(?:\(\d{1,3}\))?\s*\[([^\]]+)\]\s*(.+)$/.exec(n);
  if (mBracket) {
    const a = mBracket[1].replace(NOISE_RX, ' ').trim();
    const t = mBracket[2].replace(NOISE_RX, ' ').trim();
    return { artist: a || null, title: t || null };
  }
  // Nettoyage
  n = n.replace(/^\s*\d{1,3}[\s._-]+/, '');
  n = n.replace(/\([^)]*\)/g, ' ');
  n = n.replace(/\[[^\]]*\]/g, ' ');
  n = n.replace(/_/g, ' ');
  // Split sur " - " ou "-" unique
  let segs: string[];
  if (n.includes(' - ')) {
    segs = n.split(' - ');
  } else if ((n.match(/-/g) || []).length === 1) {
    segs = n.split(/\s*-\s*/);
  } else {
    segs = [n];
  }
  segs = segs
    .map(s =>
      s
        .replace(/[-_.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(s => s && !/^\d{1,3}$/.test(s));
  if (segs.length === 0) return { artist: null, title: null };
  if (segs.length >= 2) {
    const a = segs[0].replace(/^\d{1,4}\s+/, '');
    return { artist: a || null, title: segs[segs.length - 1] };
  }
  const t = segs[0].replace(/^\d{1,4}\s+/, '');
  const mDash = /^(.{2,40}?)\s+-\s+(.+)$/.exec(t);
  if (mDash) return { artist: mDash[1], title: mDash[2] };
  return { artist: null, title: t };
}

// ── Poids ─────────────────────────────────────────────────────────────────

const W_PATH = 0.5;
const W_ARTIST = 0.4;
const W_SESSION = 0.2;
const W_GENRE = 0.15;
const MAX_SCORE = W_PATH + W_ARTIST + W_SESSION + W_GENRE; // 1.25
const CONFIDENCE_THRESHOLD = 0.25;

// ── Interface ─────────────────────────────────────────────────────────────

export interface Suggestion {
  style: string;
  confidence: number; // 0..1
}

// ── API ───────────────────────────────────────────────────────────────────

/**
 * Suggère un style pour un fichier épars.
 *
 * @param relPath - chemin relatif dans le dossier épars (ex. `_schranz/track.mp3`)
 * @param genre - tag ID3 genre (optionnel)
 * @param artist - artiste normalisé (issu de `artist_title()` côté backend, ou
 *                 null si non parsable)
 * @param sourceIndex - index artiste→styles (servi par `/load`)
 * @param sessionStyles - styles choisis en session pour des fichiers du même
 *                        sous-dossier épars (les plus récents d'abord)
 * @param tax - taxonomie des styles (dossiers source)
 */
export function suggestStyle(
  relPath: string,
  genre: string | null | undefined,
  artist: string | null,
  sourceIndex: Record<string, string[]>,
  sessionStyles: string[],
  tax: Taxonomy,
): Suggestion | null {
  if (tax.styles.size === 0) return null;

  const scores = new Map<string, number>();

  // ── 1. Segments de chemin ─────────────────────────────────────────────
  const segments = pathSegments(relPath);
  let pathStyle: string | null = null;
  for (const seg of segments) {
    const alias = SEGMENT_ALIASES[norm(seg)];
    if (alias) {
      pathStyle = alias;
      break; // le plus profond gagne
    }
  }
  if (pathStyle && tax.styles.has(pathStyle)) {
    scores.set(pathStyle, (scores.get(pathStyle) ?? 0) + W_PATH);
  }

  // ── 2. Voisinage artiste ──────────────────────────────────────────────
  if (artist) {
    const artistNorm = norm(artist);
    const neighborStyles = sourceIndex[artistNorm];
    if (neighborStyles && neighborStyles.length > 0) {
      const counts = scoreFromStyles(neighborStyles);
      for (const [style, freq] of counts) {
        if (tax.styles.has(style)) {
          scores.set(style, (scores.get(style) ?? 0) + W_ARTIST * freq);
        }
      }
    }
  }

  // ── 3. Historique de session ───────────────────────────────────────────
  if (sessionStyles.length > 0) {
    const counts = scoreFromStyles(sessionStyles);
    for (const [style, freq] of counts) {
      if (tax.styles.has(style)) {
        scores.set(style, (scores.get(style) ?? 0) + W_SESSION * freq);
      }
    }
  }

  // ── 4. Genre ID3 ──────────────────────────────────────────────────────
  if (genre) {
    const genreStyle = GENRE_ALIASES[norm(genre)];
    if (genreStyle && tax.styles.has(genreStyle)) {
      scores.set(genreStyle, (scores.get(genreStyle) ?? 0) + W_GENRE);
    }
  }

  // ── Meilleur score ─────────────────────────────────────────────────────
  let bestStyle: string | null = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const [style, score] of scores) {
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestStyle = style;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!bestStyle || bestScore === 0) return null;

  // Ex æquo (score1 === score2) → pas de suggestion
  if (bestScore === secondScore && secondScore > 0) return null;

  const confidence = Math.min(1, bestScore / MAX_SCORE);
  if (confidence < CONFIDENCE_THRESHOLD) return null;

  return { style: bestStyle, confidence };
}
