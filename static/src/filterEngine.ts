// ─── Moteur de filtrage partagé (EPIC-030) ─────────────────────────────────
// Pur, sans DOM : match tokens (AND) insensibles casse/accents sur
// nom + année + codec. Utilisé par les chips de toutes les listes.

/** Minuscules + accents strips (NFD → retrait diacritiques). */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Sujet de filtrage d'un fichier : nom, année, codec, genre (tous pliés).
 *  `path` (optionnel, EPIC-035) : chemin relatif dans le dossier épars — permet
 *  de filtrer par sous-dossier (`_schranz`). `genre` (optionnel, P2) : tag ID3
 *  genre. Absent côté source/playlist : la sémantique des arbres est inchangée. */
export interface FilterSubject {
  name: string;
  year: string | null;
  codec: string | null;
  path?: string;
  genre?: string | null;
}

/** Sujet minimal pour un dossier/groupe : nom seul (plié). */
export function subjectFromName(name: string): FilterSubject {
  return { name, year: null, codec: null };
}

/** Token « année plausible » : 4 chiffres 19xx/20xx (ex. « 2020 »).
 *  Un tel token est traité à part dans `matchesTokens` : il vise une ANNÉE
 *  EXACTE, pas une sous-chaîne — sinon « 2020 » gardait les fichiers d'un
 *  sous-dossier daté (`2020_02_25/mix/…`) quelle que soit leur année
 *  (constaté en usage réel : 493 lignes dont 333 d'une autre année, dont
 *  14 × 1993 et 9 × 1997 — EPIC-037). La recherche reste LIBRE : aucun préfixe
 *  à taper, un token non-year-like garde le comportement historique. */
export function isYearLike(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token);
}

/**
 * Match AND de tokens : chaque token doit matcher au moins un champ.
 *
 * Deux régimes :
 *  - token NON year-like (texte, `202`, `_schranz`…) : sous-chaîne sur
 *    l'ensemble nom + année + codec + sous-dossier + genre (historique intact) ;
 *  - token year-like (`1993`, `2020`…) : l'ANNÉE d'abord et exactement, puis le
 *    NOM de fichier (texte explicite), puis le sous-dossier — mais uniquement
 *    si le fichier n'a PAS d'année (fichier non taggé dans un dossier daté).
 *    Le sous-dossier ne peut donc plus faire mentir le filtre par année
 *    (échappatoire pour retrouver un dossier daté : préfixe non year-like,
 *    ex. « 2020_02 »).
 */
export function matchesTokens(foldedTerm: string, subject: FilterSubject): boolean {
  const foldedName = foldText(subject.name);
  const foldedYear = subject.year ? foldText(subject.year) : '';
  const foldedCodec = subject.codec ? foldText(subject.codec) : '';
  const foldedPath = subject.path ? foldText(subject.path) : '';
  const foldedGenre = subject.genre ? foldText(subject.genre) : '';
  const haystack = `${foldedName} ${foldedYear} ${foldedCodec} ${foldedPath} ${foldedGenre}`.trim();
  if (!haystack) return false;
  return foldedTerm
    .split(/\s+/)
    .filter(t => t.length > 0)
    .every(token => {
      if (!isYearLike(token)) return haystack.includes(token);
      if (foldedYear === token) return true;
      if (foldedName.includes(token)) return true;
      if (!foldedYear && foldedPath.includes(token)) return true;
      return false;
    });
}

/** Pli + parse du terme : renvoie le terme plié prêt pour matchesTokens. */
export function foldTerm(term: string): string {
  return foldText(term.trim());
}
