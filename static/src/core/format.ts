// ─── core/format.ts — formatage fr-FR partagé (EPIC-036 Phase 1) ──────────
// Remplace les `x.toLocaleString('fr')` éparpillés (27+ sites) et les
// pluriels faits main. Contrat : aucune dépendance, fonctions pures.
// NB : plural suit le comportement existant des sites d'origine — n > 1
// seulement (0 affiche le singulier, ex. « 0 homonyme »), par choix de
// non-régression, pas par ignorance.

/** Nombre formaté fr-FR (séparateur de milliers). */
export function fmtCount(n: number): string {
  return n.toLocaleString('fr');
}

/** Compteur + nom au pluriel : plural(3, 'fichier') → '3 fichiers'. */
export function plural(n: number, word: string, pl = `${word}s`): string {
  return `${fmtCount(n)} ${n > 1 ? pl : word}`;
}

/** Comparateur « volume décroissant puis id alpha » (hotkeys, palette). */
export function byCountThenId<T extends { count: number; id: string }>(a: T, b: T): number {
  return b.count - a.count || a.id.localeCompare(b.id);
}
