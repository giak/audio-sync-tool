// ─── Cellule « Style » des lignes épars (EPIC-035) ─────────────────────────
// Insérée par l'appelant (eparsUI) devant la cellule .codec : makeFileEl reste
// intact (10 paramètres déjà), la table épars passe à 7 colonnes via
// makeFileTable(false, true). Contenu = choix de session (state.styleChoices)
// + destination calculée en tooltip. Sans choix : cellule vide (la colonne
// est préservée par le colgroup).

import { fmtCount } from '../core/format.js';
import { state } from '../state.js';
import { parseArtistTitle, type Suggestion, suggestStyle } from '../styleSuggest.js';
import { buildTaxonomy, destFor, findEparsEntry, parseFolderName, type Taxonomy, yearOf } from '../styles.js';

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

// ── Cellule « Style » des lignes SOURCE DATA (EPIC-046) ────────────────────
// Le signalement : « j'ai copié un épars vers Source Data […] la mise à jour
// ID3 dans les 2 colonnes ne s'est pas faite ». Vérifié : l'écriture EST faite
// (journal `copy-f5` ×2, relecture mutagen sur l'épars ET la copie) — la table
// de droite n'avait simplement **aucune colonne** où le genre puisse se lire.
// Corollaire : `g` sur un fichier rangé écrivait le tag sans que rien ne
// change à l'écran.
//
// À droite, la référence n'est pas un choix de session mais **le dossier** :
// un fichier rangé est DANS la déclaration de style (EPIC-035/043).
//   `✓ style`  tag == dossier (accord)
//   `style ≠`  tag != dossier (divergence, à corriger : g puis A)
//   `style ?`  aucun genre dans le tag (la cellule dit la cible)

/** Style déclaré par le dossier d'un fichier RANGÉ : 1ᵉʳ segment du chemin
 *  relatif à une racine Source Data connue, même grammaire que partout ailleurs
 *  (`parseFolderName`). null si le fichier n'est sous aucune racine, ou si le
 *  segment ne déclare rien (`_trash`, `2008_08`, dossier capitalisé). */
export function sourceStyleOf(fullpath: string): string | null {
  // Slashes PLIÉS des deux côtés : la racine de la config porte souvent un
  // slash final (`…/select/style/`), donc le chemin joint est `…/style//dossier`
  // — sans ce pliage le 1ᵉʳ segment était vide, la fonction rendait null, la
  // cellule Style restait MUETTE et `g` ouvrait la palette au lieu d'aligner.
  // Mesuré (bac à sable) : racine sans slash → chip « ✓ techno », même fichier
  // avec un slash final → aucune cellule. C'est la forme de la config réelle.
  const path = normSlashes(fullpath);
  for (const root of Object.keys(state.sourceFiles)) {
    const prefix = `${normSlashes(root).replace(/\/+$/, '')}/`;
    if (!path.startsWith(prefix)) continue;
    const seg = path.slice(prefix.length).split('/')[0];
    return seg ? (parseFolderName(seg)?.style ?? null) : null;
  }
  return null;
}

function paintSource(td: HTMLTableCellElement, fullpath: string, entry: { genre?: string | null }): void {
  td.innerHTML = '';
  td.title = '';
  const declared = sourceStyleOf(fullpath);
  if (!declared) return; // dossier hors grammaire : la colonne reste vide
  const tag = entry.genre ?? null;
  const chip = document.createElement('span');
  chip.className = 'style-chip';
  chip.textContent = declared;
  if (tag === declared) {
    chip.classList.add('written');
    chip.textContent = `✓ ${declared}`;
    td.title = `dossier : ${declared} · tag : ${declared} — accord`;
  } else if (tag) {
    chip.classList.add('divergent');
    chip.textContent = `${declared} ≠`;
    td.title = `dossier : ${declared} · tag : ${tag} — g pour écrire « ${declared} », A pour aligner tous les rangés`;
  } else {
    chip.classList.add('missing');
    chip.textContent = `${declared} ?`;
    td.title = `dossier : ${declared} · tag vide — g pour écrire « ${declared} »`;
  }
  td.appendChild(chip);
}

/** Insère la cellule Style d'une ligne SOURCE DATA devant `.codec`. Clic =
 *  palette `g` sur ce fichier (l'écriture est immédiate, comme partout). */
export function insertSourceStyleCell(
  row: HTMLElement,
  fullpath: string,
  entry: { year: string | null; genre?: string | null },
): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'style-cell source-style-cell';
  td.dataset.fullpath = fullpath;
  paintSource(td, fullpath, entry);
  td.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    void import('./stylePalette.js').then(m => m.openStylePalette([fullpath], row));
  };
  row.insertBefore(td, row.querySelector('.codec'));
  return td;
}

/** Index source par chemin NORMALISÉ (slashes pliés : la racine est jointe telle
 *  quelle ailleurs dans l'app — `…/style//techno_1990` quand la config porte un
 *  slash final). Construit UNE fois par passe : un lot de 1 281 alignés ne doit
 *  pas parcourir 1 604 entrées par ligne affichée. */
function sourceByPath(): Map<string, { year: string | null; genre?: string | null }> {
  const map = new Map<string, { year: string | null; genre?: string | null }>();
  for (const [dir, files] of Object.entries(state.sourceFiles)) {
    for (const entry of Object.values(files)) {
      map.set(normSlashes(`${dir}/${entry.path}`), entry);
    }
  }
  return map;
}

/** Reconnaît deux écritures du MÊME chemin (racine jointe avec ou sans slash
 *  final) — pendant de `normPath` (stylePalette). */
function normSlashes(path: string): string {
  return path.replace(/\/+/g, '/');
}

/** Re-rend les cellules Style des lignes SOURCE DATA affichées pour ces chemins
 *  (après une copie ou une écriture depuis la palette) — une passe sur le DOM. */
export function refreshSourceStyleCells(fullpaths: Iterable<string>): void {
  const wanted = new Set([...fullpaths].map(normSlashes));
  if (wanted.size === 0) return;
  let index: Map<string, { year: string | null; genre?: string | null }> | null = null;
  for (const td of document.querySelectorAll<HTMLTableCellElement>('#source-container .source-style-cell')) {
    const fp = normSlashes(td.dataset.fullpath ?? '');
    if (!wanted.has(fp)) continue;
    index ??= sourceByPath();
    paintSource(td, fp, index.get(fp) ?? { genre: null });
  }
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
