// ─── Cellule « Style » des lignes épars (EPIC-035) ─────────────────────────
// Insérée par l'appelant (eparsUI) devant la cellule .codec : makeFileEl reste
// intact (10 paramètres déjà), la table épars passe à 7 colonnes via
// makeFileTable(false, true). Contenu = choix de session (state.styleChoices)
// + destination calculée en tooltip. Sans choix : cellule vide (la colonne
// est préservée par le colgroup).

import { state } from '../state.js';
import { buildTaxonomy, destFor, findEparsEntry, type Taxonomy, yearOf } from '../styles.js';

// Mémo : la taxonomie se recalcule seulement quand l'index source ou les
// dossiers ➕ changent (5 092 lignes par render, 1 430 entrées à parcourir).
let _memoSrc: unknown = null;
let _memoExtra: unknown = null;
let _memoTax: Taxonomy | null = null;

/** Taxonomie courante (mémoïsée sur l'identité de state.sourceFiles /
 *  state.sourceExtraDirs). null si aucune racine Source Data scannée. */
export function currentTaxonomy(): Taxonomy | null {
  if (_memoSrc !== state.sourceFiles || _memoExtra !== state.sourceExtraDirs) {
    _memoSrc = state.sourceFiles;
    _memoExtra = state.sourceExtraDirs;
    _memoTax = buildTaxonomy(state.sourceFiles, state.sourceExtraDirs);
  }
  return _memoTax;
}

/** Texte du tooltip de destination pour un choix. */
export function destinationLabel(fullpath: string, entry: { year: string | null }): string {
  const choice = state.styleChoices.get(fullpath);
  if (!choice) return '';
  const tax = currentTaxonomy();
  const dest = tax ? destFor(tax, choice.style, yearOf(entry), choice.tranche) : null;
  if (!dest) return `→ ${choice.style} (style inconnu des dossiers actuels)`;
  if (dest.needsYear) return `→ ${dest.name}_? (année manquante — g puis chiffre pour trancher)`;
  return dest.exists ? `→ ${dest.name}` : `→ ➕ ${dest.name} (sera créé)`;
}

function paint(td: HTMLTableCellElement, fullpath: string, entry: { year: string | null }): void {
  td.innerHTML = '';
  td.title = '';
  const choice = state.styleChoices.get(fullpath);
  if (!choice) return;
  const chip = document.createElement('span');
  chip.className = 'style-chip chosen';
  chip.textContent = choice.style;
  const label = destinationLabel(fullpath, entry);
  if (label.includes('année manquante')) chip.classList.add('pending-year');
  td.title = label;
  td.appendChild(chip);
}

/** Insère la cellule Style devant `.codec` (ou en fin de ligne à défaut). */
export function insertStyleCell(
  row: HTMLElement,
  fullpath: string,
  entry: { year: string | null },
): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'style-cell';
  td.dataset.fullpath = fullpath;
  paint(td, fullpath, entry);
  row.insertBefore(td, row.querySelector('.codec'));
  return td;
}

/** Re-rend en place la cellule d'une ligne épars (après un choix), sans
 *  re-render du panneau. No-op si la ligne n'est pas affichée. */
export function refreshStyleCell(fullpath: string): void {
  // Recherche par dataset (pas de sélecteur d'attribut : chemins avec guillemets,
  // CSS.escape absent de jsdom) — appelé au commit d'un choix, pas au render.
  let td: HTMLTableCellElement | null = null;
  for (const el of document.querySelectorAll<HTMLTableCellElement>('#epars-container .style-cell')) {
    if (el.dataset.fullpath === fullpath) {
      td = el;
      break;
    }
  }
  if (!td) return;
  const found = findEparsEntry(state.eparsFiles, fullpath);
  paint(td, fullpath, found?.entry ?? { year: null });
}
