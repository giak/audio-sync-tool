// ─── MusicKey (EPIC-032) : clé musicale (artiste, titre) depuis un nom de fichier ──
// Pur et sans DOM — consommé par dupGroups.ts (passe 2 : union par inclusion).
// Validé par prototype sur les vraies données (data/cache.json, 6 522 fichiers) :
// voir docs/superpowers/epics/EPIC-032-matching-doublons-niveaux.md.

// Bruit courant dans les titres — retiré de la clé (déjà présent partiellement
// dans dupDetect.normalizeName, mais en patterns de parenthèses précis ; ici on
// veut une clé MUSICALE : les mentions de mix/version n'identifient pas un morceau).
const TITLE_NOISE: RegExp =
  /\b(remix|remaster(ed)?|edit|version|mix|hq|hd|official|video|audio|lyrics?|feat\.?|ft\.?|radio|single|album|club|extended|original|instrumental|acoustic|live|vol\.?\s*\d*|volume)\b/gi;

/** Tokens trop faibles pour porter une inclusion à eux seuls (vinylrips…). */
const WEAK_TOKENS: ReadonlySet<string> = new Set([
  'a1',
  'a2',
  'a3',
  'b1',
  'b2',
  'b3',
  'c1',
  'c2',
  'd1',
  'd2',
  'untitled',
  'track',
  'audio',
  'track01',
  'track02',
]);

/** Retire les diacritiques (NFD puis retrait des signes combinants). */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Nettoie un segment : séparateurs → espaces, espaces en trop, chiffre seul. */
function cleanSegment(raw: string): string {
  const s = raw
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^\d{1,3}$/.test(s) ? '' : s; // numéro de piste → segment vide
}

/** Retire le bruit de titre + normalise les espaces. */
function stripTitleNoise(s: string): string {
  return s.replace(TITLE_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extrait la clé musicale d'un nom de fichier : (artiste | null, titre).
 * Convention validée sur le corpus : segments séparés par « - », artiste = 1er
 * segment porteur, titre = dernier. Les parenthèses/crochets (mixes, sources,
 * labels) sont retirés AVANT le split — ils ne font jamais partie de la clé.
 */
export function musicKey(filename: string): { artist: string | null; title: string } {
  let name = filename;
  const dot = name.lastIndexOf('.');
  if (dot > 0) name = name.slice(0, dot);

  name = stripAccents(name.toLowerCase());
  name = name.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');

  const segs = name
    .split(' - ')
    .map(cleanSegment)
    .filter(s => s.length > 0);

  if (segs.length === 0) return { artist: null, title: '' };
  if (segs.length === 1) {
    // « 0602-joey_beltram-energy_flash » : artiste jamais séparé. On tente le
    // décollement : numéro de tête retiré, puis « artiste - titre » interne.
    const t = segs[0].replace(/^\d{1,4}\s+/, '');
    const m = t.match(/^(.{2,40}?)\s+-\s+(.+)$/);
    if (m) return { artist: stripTitleNoise(m[1]), title: stripTitleNoise(m[2]) };
    return { artist: null, title: stripTitleNoise(t) };
  }
  return { artist: stripTitleNoise(segs[0]), title: stripTitleNoise(segs[segs.length - 1]) };
}

/** Tokens porteurs d'une clé (hors faibles). */
export function keyTokens(s: string): string[] {
  return s.split(' ').filter(w => w.length > 0 && !WEAK_TOKENS.has(w));
}

/** Les deux artistes sont-ils compatibles (absent, ou inclusion dans un sens) ? */
export function artistsCompatible(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true; // un artiste manquant n'exclut rien
  const ta = new Set(keyTokens(a));
  const tb = new Set(keyTokens(b));
  if (ta.size === 0 || tb.size === 0) return true;
  return containsTokens(ta, tb) || containsTokens(tb, ta);
}

/** L'ensemble `short` est-il inclus dans `long` (tokens porteurs) ? */
export function containsTokens(short: ReadonlySet<string>, long: ReadonlySet<string>): boolean {
  if (short.size === 0) return false;
  for (const w of short) if (!long.has(w)) return false;
  return true;
}
