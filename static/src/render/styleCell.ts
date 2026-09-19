// ─── Cellule « Style » des lignes épars (EPIC-035) ─────────────────────────
// Insérée par l'appelant (eparsUI) devant la cellule .codec : makeFileEl reste
// intact (10 paramètres déjà), la table épars passe à 7 colonnes via
// makeFileTable(false, true). Contenu = choix de session (state.styleChoices)
// + destination calculée en tooltip. Sans choix : cellule vide (la colonne
// est préservée par le colgroup).

import { fmtCount } from '../core/format.js';
import { state } from '../state.js';
import { parseArtistTitle, type Suggestion, suggestStyle } from '../styleSuggest.js';
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

/** Destination résolue d'un choix + libellé du tooltip. `pendingYear` =
 *  style daté sans année ni tranche (la palette doit trancher). `written` =
 *  le genre lu au scan (P2) est déjà le style choisi (P3 : TCON écrit par
 *  apply_styles.py, visible au scan suivant). */
function resolve(
  fullpath: string,
  entry: { year: string | null; genre?: string | null },
): { label: string; pendingYear: boolean; written: boolean } | null {
  const choice = state.styleChoices.get(fullpath);
  if (!choice) return null;
  const tax = currentTaxonomy();
  const written = entry.genre === choice.style;
  const dest = tax ? destFor(tax, choice.style, yearOf(entry), choice.tranche) : null;
  if (!dest) return { label: `→ ${choice.style} (style inconnu des dossiers actuels)`, pendingYear: false, written };
  if (dest.needsYear) {
    return { label: `→ ${dest.name}_? (année manquante — g puis chiffre pour trancher)`, pendingYear: true, written };
  }
  return {
    label: dest.exists ? `→ ${dest.name}` : `→ ➕ ${dest.name} (sera créé)`,
    pendingYear: false,
    written,
  };
}

/** Texte du tooltip de destination pour un choix ('' sans choix). */
export function destinationLabel(fullpath: string, entry: { year: string | null }): string {
  return resolve(fullpath, entry)?.label ?? '';
}

/** Calcule la suggestion pour une cellule épars (sans choix utilisateur). */
function computeSuggestion(fullpath: string, entry: { year: string | null; genre?: string | null }): Suggestion | null {
  const tax = currentTaxonomy();
  if (!tax) return null;
  const found = findEparsEntry(state.eparsFiles, fullpath);
  if (!found) return null;
  const relPath = found.entry.path;
  const { artist } = parseArtistTitle(found.filename);
  // Styles choisis en session pour des fichiers du même sous-dossier épars
  const eparDir = found.eparDir;
  const seg = relPath.indexOf('/') > 0 ? relPath.slice(0, relPath.indexOf('/')) : '';
  const sessionStyles: string[] = [];
  for (const [fp, choice] of state.styleChoices) {
    if (fp.startsWith(`${eparDir}/${seg}/`) || (seg === '' && fp.startsWith(`${eparDir}/`))) {
      sessionStyles.push(choice.style);
    }
  }
  return suggestStyle(relPath, entry.genre, artist, state.sourceIndex, sessionStyles, tax);
}

function paint(
  td: HTMLTableCellElement,
  fullpath: string,
  entry: { year: string | null; genre?: string | null },
): void {
  td.innerHTML = '';
  td.title = '';
  const r = resolve(fullpath, entry);
  if (r) {
    const chip = document.createElement('span');
    chip.className = r.written
      ? 'style-chip chosen written'
      : r.pendingYear
        ? 'style-chip chosen pending-year'
        : 'style-chip chosen';
    chip.textContent = (r.written ? '✓ ' : '') + (state.styleChoices.get(fullpath)?.style ?? '');
    td.title = r.written ? `${r.label} · écrit dans le tag` : r.label;
    td.appendChild(chip);
    return;
  }
  // Pas de choix utilisateur → suggestion (P2)
  const sug = computeSuggestion(fullpath, entry);
  if (!sug) return;
  const chip = document.createElement('span');
  chip.className = 'style-chip suggested';
  chip.textContent = sug.style;
  chip.title = `Suggéré (${Math.round(sug.confidence * 100)}%) — g pour valider`;
  td.appendChild(chip);
}

/** Insère la cellule Style devant `.codec` (ou en fin de ligne à défaut). */
export function insertStyleCell(
  row: HTMLElement,
  fullpath: string,
  entry: { year: string | null; genre?: string | null },
): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'style-cell';
  td.dataset.fullpath = fullpath;
  paint(td, fullpath, entry);
  // Clic = palette à la souris (import dynamique : stylePalette importe ce
  // module — pattern executeReplace dans fileRow.ts).
  td.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    void import('./stylePalette.js').then(m => m.openStylePalette([fullpath], row));
  };
  row.insertBefore(td, row.querySelector('.codec'));
  return td;
}

/** Nombre de choix de session portant sur un fichier épars encore indexé. */
export function countActiveChoices(): number {
  let n = 0;
  for (const fp of state.styleChoices.keys()) if (findEparsEntry(state.eparsFiles, fp)) n++;
  return n;
}

/** Récap « 🏷 N assignés · e = aperçu » dans la ligne d'état épars. Appelé par
 *  renderEpars (après reconstruction de la ligne), par la palette après un
 *  choix et par l'aperçu après apply — aucune souscription supplémentaire. */
export function updateStyleRecap(): void {
  const line = document.getElementById('epars-status-line');
  if (!line) return;
  line.querySelector('.s-style')?.remove();
  const n = countActiveChoices();
  if (n === 0) return;
  const span = document.createElement('span');
  span.className = 's-style';
  span.textContent = `🏷 ${fmtCount(n)} assigné${n > 1 ? 's' : ''} · e = aperçu`;
  line.appendChild(span);
}

/** Re-rend en place les cellules des lignes épars affichées pour `fullpaths`
 *  (après un choix / une copie), sans re-render du panneau. UNE passe sur le
 *  DOM quel que soit le nombre de cibles (lot de 1 347 sur 5 092 lignes) ;
 *  recherche par dataset (chemins avec guillemets, CSS.escape absent de jsdom). */
export function refreshStyleCells(fullpaths: Iterable<string>): void {
  const wanted = new Set(fullpaths);
  if (wanted.size === 0) return;
  for (const td of document.querySelectorAll<HTMLTableCellElement>('#epars-container .style-cell')) {
    const fp = td.dataset.fullpath ?? '';
    if (!wanted.has(fp)) continue;
    const found = findEparsEntry(state.eparsFiles, fp);
    paint(td, fp, found?.entry ?? { year: null });
  }
}

/** Cas unitaire de refreshStyleCells. No-op si la ligne n'est pas affichée. */
export function refreshStyleCell(fullpath: string): void {
  refreshStyleCells([fullpath]);
}
