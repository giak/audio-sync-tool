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

/** Sujet de filtrage d'un fichier : nom, année, codec (tous pliés). */
export interface FilterSubject {
  name: string;
  year: string | null;
  codec: string | null;
}

/** Sujet minimal pour un dossier/groupe : nom seul (plié). */
export function subjectFromName(name: string): FilterSubject {
  return { name, year: null, codec: null };
}

/**
 * Match AND de tokens : chaque token doit matcher au moins un champ.
 * Tokens numériques matchent l'année (ex. « 2023 ») — mais aussi le nom
 * (« 01 - » d'un préfixe de piste), ce qui est le comportement voulu.
 */
export function matchesTokens(foldedTerm: string, subject: FilterSubject): boolean {
  const foldedName = foldText(subject.name);
  const foldedYear = subject.year ? foldText(subject.year) : '';
  const foldedCodec = subject.codec ? foldText(subject.codec) : '';
  const haystack = `${foldedName} ${foldedYear} ${foldedCodec}`.trim();
  if (!haystack) return false;
  return foldedTerm
    .split(/\s+/)
    .filter(t => t.length > 0)
    .every(token => haystack.includes(token));
}

/** Pli + parse du terme : renvoie le terme plié prêt pour matchesTokens. */
export function foldTerm(term: string): string {
  return foldText(term.trim());
}
