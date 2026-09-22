// ─── Palette de style « g » (EPIC-035, refondue EPIC-041) ──────────────────
// Popover ancré à la ligne focusée — Éparpillé **ou** Source Data : les deux
// listes contiennent des morceaux, `g` tagge celui qui est surligné (le
// scope est résolu par commands/style.ts, la palette reçoit un fullpath).
//
// Il fait DEUX choses, toutes deux immédiates (vérifiables au scan suivant,
// plus besoin d'attendre une passe hors navigateur) :
//
//   1. choisir un STYLE  → écrit le genre dans le tag du morceau (TCON/GENRE/
//      ©gen) via POST /styles/apply, puis pose le choix de session (rangement) ;
//   2. choisir une ANNÉE → écrit l'année dans le tag (TDRC/TYER/DATE/©day) via
//      POST /years/apply, ce qui résout aussi la tranche de destination.
//
// Avant EPIC-041, la palette ne touchait AUCUN tag : le style n'atteignait le
// TCON qu'après un aperçu « e » (copie) puis `apply_styles.py --review`, hors
// navigateur, et l'année n'était jamais écrite (la tranche ne servait qu'à
// choisir le dossier cible).
//
// Affichage : TOUT est visible d'un coup — la liste complète des styles
// (hotkey + volume, scrollable si la taxonomie est très longue) et la liste
// complète des années (grille 1970→2026, jamais tronquée), sans étape cachée.
// Clavier : lettre = style, 4 chiffres + Enter = année, Échap ferme,
// ⌫ retire le choix de rangement (le tag, lui, se défait par le journal :
// `apply_styles.py --undo` / `apply_years.py --undo`).
//
// Choix de SESSION (`state.styleChoices`, consommé par l'aperçu `e`) : réservé
// aux cibles épars. Un morceau déjà rangé (Source Data) est tagué, jamais
// re-planifié — il n'a pas de destination à calculer.

import { api } from '../api.js';
import { setStatus } from '../core/feedback.js';
import { byCountThenId, fmtCount } from '../core/format.js';
import { focusItemByElement, navigateFocus } from '../focus.js';
import { state } from '../state.js';
import { parseArtistTitle, type Suggestion, suggestStyle } from '../styleSuggest.js';
import { deriveHotkeys, findEparsEntry, type StyleChoice, trancheOf, yearOf } from '../styles.js';
import { currentTaxonomy, refreshSourceStyleCells, refreshStyleCells, updateStyleRecap } from './styleCell.js';

let _el: HTMLElement | null = null;
let _targets: string[] = [];
let _anchor: HTMLElement | null = null;
/** Style retenu pour les cibles (le tag est déjà écrit quand il est posé). */
let _style: string | null = null;
/** Suggestions/années : état d'affichage seulement. */
let _suggestion: Suggestion | null = null;
let _hotkeyToStyle = new Map<string, string>();
let _yearBuffer = '';
/** Années proposées : tout ce qu'on peut raisonnablement taguer. */
export const YEAR_MIN = 1970;
export const YEAR_MAX = 2026;

export function isStylePaletteOpen(): boolean {
  return _el !== null;
}

function eparsContainer(): HTMLElement | null {
  return document.getElementById('epars-container');
}

interface TagEntry {
  path: string;
  year: string | null;
  genre?: string | null;
}

/** Entrée de l'index SOURCE DATA portant ce fullpath (le fichier est rangé :
 *  sa seule raison d'être ici est un tag à corriger).
 *  Comparaison sur slashes normalisés : la racine est jointe telle quelle
 *  partout ailleurs (`…/style//techno_1990` quand la config porte un slash
 *  final) — ici on veut retrouver l'entrée quel que soit le nombre de slashes,
 *  le chemin venant de la ligne DOM ou d'un dataset. */
function normPath(p: string): string {
  return p.replace(/\/+/g, '/');
}

function findSourceEntry(fullpath: string): TagEntry | null {
  const wanted = normPath(fullpath);
  for (const [dir, files] of Object.entries(state.sourceFiles)) {
    for (const entry of Object.values(files)) {
      if (normPath(`${dir}/${entry.path}`) === wanted) return entry as TagEntry;
    }
  }
  return null;
}

/** Vrai si le chemin appartient à la liste Éparpillé (rangement en cours). */
export function isEparsTarget(fullpath: string): boolean {
  return findEparsEntry(state.eparsFiles, fullpath) !== null;
}

/** En-tête (année, genre) d'une cible, épars ou source. */
function entryOf(fullpath: string): TagEntry | null {
  return findEparsEntry(state.eparsFiles, fullpath)?.entry ?? findSourceEntry(fullpath);
}

/** Toutes les lignes DOM portant ce chemin (les deux colonnes). */
function rowsByPath(fullpath: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.file-row')].filter(r => r.dataset.focuspath === fullpath);
}

/** Conteneur de la ligne ancre (retour de focus / chaîne de tri). */
function anchorContainer(): HTMLElement | null {
  return (_anchor?.closest('#epars-container, #source-container') as HTMLElement | null) ?? eparsContainer();
}

/** Cibles sans année dans le tag (pour l'indication « année manquante »). */
function targetsWithoutYear(): string[] {
  return _targets.filter(fp => yearOf(entryOf(fp) ?? undefined) === null);
}

/** Cibles épars (rangement) — les seules qui alimentent le choix de session. */
function eparsTargets(): string[] {
  return _targets.filter(isEparsTarget);
}

function setHint(text: string): void {
  const hint = _el?.querySelector('.sp-dest');
  if (hint) hint.textContent = text;
}

/** Reflète une année écrite dans l'UI locale : index (épars ou source) +
 *  cellule Année de TOUTES les lignes portant ce chemin. */
function setYearLocally(fullpath: string, year: string): void {
  const found = findEparsEntry(state.eparsFiles, fullpath)?.entry ?? findSourceEntry(fullpath);
  if (!found) return;
  found.year = year;
  for (const row of rowsByPath(fullpath)) {
    const td = row.querySelector('td.year');
    if (td) td.textContent = year;
  }
}

function setGenreLocally(fullpath: string, genre: string): void {
  const found = findEparsEntry(state.eparsFiles, fullpath)?.entry ?? findSourceEntry(fullpath);
  if (found) found.genre = genre;
  // EPIC-046 : un `g` sur un fichier RANGÉ n'a pas de cellule côté épars — sans
  // ce rafraîchissement, l'écriture du tag restait invisible (signalement
  // « g ne met toujours pas à jour »).
  refreshSourceStyleCells([fullpath]);
}

/** Écrit le style dans le tag (immédiat) pour une liste de cibles — l'échec
 *  n'annule pas le choix de session (le rangement reste possible), il est
 *  signalé dans la barre d'état. Une seule requête : le serveur journalise et
 *  remet l'index à jour (EPIC-050). */
async function writeStyleTagFor(styleId: string, targets: string[]): Promise<boolean> {
  if (targets.length === 0) return false;
  try {
    const res = await api<{
      ok: boolean;
      written: number;
      count: number;
      results: Array<{ path: string; ok: boolean; error?: string; old?: string | null }>;
    }>('/styles/apply', { method: 'POST', body: JSON.stringify({ targets, style: styleId }) });
    for (const r of res.results ?? []) if (r.ok) setGenreLocally(r.path, styleId);
    const failed = (res.results ?? []).filter(r => !r.ok);
    if (failed.length) {
      setStatus(`⚠ style écrit sur ${res.written}/${res.count} — ${failed[0].error ?? 'échec'}`);
      return false;
    }
    setStatus(
      `✓ style « ${styleId} » écrit dans le tag (${res.written} fichier${res.written > 1 ? 's' : ''}) — annuler : apply_styles.py --undo`,
    );
    return true;
  } catch (err) {
    setStatus(`⚠ style non écrit : ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function writeStyleTag(styleId: string): Promise<boolean> {
  return writeStyleTagFor(styleId, _targets);
}

/** Un fichier RANGÉ est DANS sa déclaration de style : quand `g` tombe sur lui,
 *  le dossier déclare et le tag suit — une frappe, aucun choix à faire (le clic
 *  sur la cellule ouvre la palette pour choisir un AUTRE style). Renvoie false
 *  si la cible est hors des racines Source Data connues. */
export async function alignStyleToFolder(fullpath: string, style: string): Promise<boolean> {
  return writeStyleTagFor(style, [fullpath]);
}

/** Écrit l'année dans le tag (immédiat). */
async function writeYearTag(year: string): Promise<boolean> {
  try {
    const res = await api<{
      ok: boolean;
      written: number;
      count: number;
      results: Array<{ path: string; ok: boolean; error?: string }>;
    }>('/years/apply', { method: 'POST', body: JSON.stringify({ targets: _targets, year }) });
    for (const r of res.results ?? []) if (r.ok) setYearLocally(r.path, year);
    const failed = (res.results ?? []).filter(r => !r.ok);
    if (failed.length) {
      setStatus(`⚠ année écrite sur ${res.written}/${res.count} — ${failed[0].error ?? 'échec'}`);
      return false;
    }
    setStatus(`✓ année ${year} écrite dans le tag (${res.written} fichier${res.written > 1 ? 's' : ''})`);
    return true;
  } catch (err) {
    setStatus(`⚠ année non écrite : ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Pose le choix de session (rangement) pour les cibles ÉPARS. Une cible
 *  Source Data est déjà rangée : elle est taguée, pas re-planifiée → no-op.
 *  `tranche` déduite de l'année du tag (écrite juste avant). */
function commit(styleId: string, tranche: number | null): void {
  const targets = eparsTargets();
  if (targets.length === 0) return;
  const next = new Map<string, StyleChoice>(state.styleChoices);
  for (const fp of targets) next.set(fp, { style: styleId, tranche });
  state.styleChoices = next;
  refreshStyleCells(targets);
  updateStyleRecap();
}

function removeChoices(): void {
  const targets = eparsTargets();
  if (targets.length > 0) {
    const next = new Map(state.styleChoices);
    for (const fp of targets) next.delete(fp);
    state.styleChoices = next;
    refreshStyleCells(targets);
    updateStyleRecap();
  }
  closeStylePalette();
}

/** Tranche déduite de l'année des cibles épars (null si aucune n'a d'année,
 *  ou si tout est déjà rangé) — la destination se résout sans poser de question. */
function derivedTranche(): number | null {
  const years = eparsTargets()
    .map(fp => yearOf(entryOf(fp) ?? undefined))
    .filter((y): y is number => y !== null);
  return years.length ? trancheOf(Math.min(...years)) : null;
}

/** Style choisi (hotkey, clic ou suggestion) → tag écrit tout de suite. */
async function pick(styleId: string): Promise<void> {
  _style = styleId;
  const wrote = await writeStyleTag(styleId);
  commit(styleId, derivedTranche());
  const missing = targetsWithoutYear();
  if (missing.length > 0) {
    // Il reste une décision : l'année (elle est écrite immédiatement aussi).
    highlightYears();
    setHint(
      `${styleId} ✓ ${wrote ? 'écrit dans le tag' : 'non écrit'} — ${missing.length} fichier${missing.length > 1 ? 's' : ''} sans année : tape 4 chiffres (1991) puis Entrée, ou clique dans la liste`,
    );
    return;
  }
  const single = _targets.length === 1;
  closeStylePalette();
  if (single) {
    const container = anchorContainer();
    if (container) navigateFocus(container, 1); // chaîne de tri : ligne suivante
  }
}

/** Année choisie (clic ou saisie) → tag écrit tout de suite + rangement résolu. */
async function pickYear(year: string): Promise<void> {
  _yearBuffer = '';
  const wrote = await writeYearTag(year);
  if (_style) commit(_style, trancheOf(Number(year)));
  refreshStyleCells(_targets);
  setHint(
    `année ${year} ✓ ${wrote ? 'écrite dans le tag' : 'non écrite'} — ${_style ? `style ${_style}` : 'aucun style'} — Échap ferme`,
  );
  // Une seule décision à la fois : on referme après l'année si le style est posé
  // (sinon la palette reste ouverte : l'année seule devait pouvoir être corrigée).
  if (_style) {
    const single = _targets.length === 1;
    closeStylePalette();
    if (single) {
      const container = anchorContainer();
      if (container) navigateFocus(container, 1);
    }
  }
}

function highlightYears(): void {
  _el?.querySelector('.sp-years')?.classList.add('needs-year');
  _el?.querySelectorAll('.sp-year').forEach(b => {
    const fp = _targets[0];
    const cur = fp ? entryOf(fp)?.year?.slice(0, 4) : null;
    b.classList.toggle('current', !!cur && (b as HTMLElement).dataset.year === cur);
  });
}

function refreshYearBufferHint(): void {
  const years = _el?.querySelectorAll('.sp-year');
  years?.forEach(b => {
    b.classList.toggle('pending', (b as HTMLElement).dataset.year === _yearBuffer);
  });
  setHint(
    _yearBuffer
      ? `année saisie : ${_yearBuffer} — Entrée = écrire dans le tag · ⌫ = effacer`
      : _style
        ? `${_style} ✓ — tape 4 chiffres (1991) puis Entrée, ou clique une année`
        : 'Clic = style (écrit dans le tag) · 4 chiffres + Entrée = année · Échap = fermer',
  );
}

function onKeydown(e: KeyboardEvent): void {
  e.stopPropagation(); // le registry ne doit rien voir tant que la palette est ouverte
  if (e.ctrlKey || e.altKey || e.metaKey) return; // raccourcis navigateur (Ctrl+L, F12…) intacts
  // preventDefault SYSTÉMATIQUE : le registry le fait pour ses touches (F5 =
  // copie) ; ici F5 non annulé = RECHARGEMENT de la page (constaté en live
  // headless), Espace = scroll, Tab = sortie de focus.
  e.preventDefault();
  if (e.key === 'Escape') {
    closeStylePalette();
    return;
  }
  if (e.key === 'Backspace') {
    if (_yearBuffer) {
      _yearBuffer = _yearBuffer.slice(0, -1);
      refreshYearBufferHint();
    } else {
      removeChoices();
    }
    return;
  }
  if (e.key === 'Enter') {
    if (/^\d{4}$/.test(_yearBuffer)) void pickYear(_yearBuffer);
    else if (_suggestion && _targets.length === 1 && !_style) void pick(_suggestion.style);
    else if (_style) closeStylePalette();
    return;
  }
  if (/^\d$/.test(e.key)) {
    // 4 chiffres = une année (remplace les anciens « 1-9 = palier » : la tranche
    // se déduit de l'année, elle n'a plus à être demandée).
    _yearBuffer = (_yearBuffer + e.key).slice(-4);
    refreshYearBufferHint();
    return;
  }
  if (e.key.length === 1) {
    const styleId = _hotkeyToStyle.get(e.key.toLowerCase());
    if (styleId) void pick(styleId);
  }
}

function onDocMousedown(e: MouseEvent): void {
  if (_el && !_el.contains(e.target as Node)) closeStylePalette();
}

function position(el: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const width = el.offsetWidth || 560;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  el.style.left = `${left}px`;
  el.style.top = `${r.bottom + 4}px`;
  // Débordement bas : au-dessus de la ligne (mesuré après insertion).
  requestAnimationFrame(() => {
    const h = el.offsetHeight;
    if (r.bottom + 4 + h > window.innerHeight) el.style.top = `${Math.max(8, r.top - 4 - h)}px`;
  });
}

/** Ouvre la palette pour `targets` (fullpaths épars), ancrée à `anchor`
 *  (ligne focusée). Sans taxonomie (pas de racine scannée) → message barre
 *  d'état, rien d'ouvert. */
export function openStylePalette(targets: string[], anchor: HTMLElement): void {
  if (targets.length === 0) return;
  closeStylePalette();
  const tax = currentTaxonomy();
  if (!tax || tax.styles.size === 0) {
    setStatus('Aucun dossier style_année à droite — lance un scan.');
    return;
  }
  _targets = [...targets];
  _anchor = anchor;
  _style = null;
  _yearBuffer = '';
  _suggestion = null;
  // P2 : suggestion unique
  if (targets.length === 1) {
    const found = findEparsEntry(state.eparsFiles, targets[0]);
    if (found) {
      const relPath = found.entry.path;
      const { artist } = parseArtistTitle(found.filename);
      const seg = relPath.indexOf('/') > 0 ? relPath.slice(0, relPath.indexOf('/')) : '';
      const sessionStyles: string[] = [];
      for (const [fp, choice] of state.styleChoices) {
        if (fp.startsWith(`${found.eparDir}/${seg}/`) || (seg === '' && fp.startsWith(`${found.eparDir}/`))) {
          sessionStyles.push(choice.style);
        }
      }
      _suggestion = suggestStyle(relPath, found.entry.genre, artist, state.sourceIndex, sessionStyles, tax);
    }
  }
  const hotkeys = deriveHotkeys(tax);
  _hotkeyToStyle = new Map();
  for (const [id, k] of hotkeys) if (k) _hotkeyToStyle.set(k, id);

  const el = document.createElement('div');
  el.className = 'style-palette';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Choisir un style et une année');

  const title = document.createElement('div');
  title.className = 'sp-title';
  const single = _targets.length === 1;
  const cur = single ? entryOf(_targets[0]) : null;
  const basename = single ? _targets[0].slice(_targets[0].lastIndexOf('/') + 1) : '';
  // Le scope est annoncé : taguer un morceau DÉJÀ RANGÉ (Source Data) ne
  // planifie aucune copie, contrairement à un épars.
  const scope = single && !isEparsTarget(_targets[0]) ? 'Source Data · ' : '';
  title.textContent = single
    ? `${scope}${basename || _targets[0]}${cur ? ` — genre « ${cur.genre ?? '—'} » · année ${cur.year ?? '—'}` : ''}`
    : `${_targets.length} fichiers`;
  if (single) title.title = _targets[0];
  el.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'sp-styles';
  const ordered = [...tax.styles.values()].sort(byCountThenId);
  for (const def of ordered) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp-style';
    b.dataset.style = def.id;
    // EPIC-047 : plus de pavé de touche `<kbd>` dans un bouton CLIQUABLE — le
    // bouton porte le style et son volume, la lettre reste un raccourci
    // (documentée dans le pied et dans le title) qu'on n'a pas à deviner.
    const name = document.createElement('span');
    name.className = 'sp-style-name';
    name.textContent = def.id;
    const count = document.createElement('span');
    count.className = 'sp-style-count';
    count.textContent = fmtCount(def.count);
    b.append(name, count);
    const k = hotkeys.get(def.id);
    b.title = `${def.count} fichier${def.count > 1 ? 's' : ''} rangé${def.count > 1 ? 's' : ''}${k ? ` · touche ${k}` : ''} — clic = style écrit dans le tag`;
    b.onclick = (ev: MouseEvent) => {
      ev.stopPropagation();
      void pick(def.id);
    };
    grid.appendChild(b);
  }
  el.appendChild(grid);

  // Années : TOUTE la plage, pour ne jamais avoir à deviner un palier.
  const years = document.createElement('div');
  years.className = 'sp-years';
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp-year';
    b.dataset.year = String(y);
    b.textContent = String(y);
    b.onclick = (ev: MouseEvent) => {
      ev.stopPropagation();
      void pickYear(String(y));
    };
    years.appendChild(b);
  }
  el.appendChild(years);

  const dest = document.createElement('div');
  dest.className = 'sp-dest';
  if (_suggestion && _targets.length === 1) {
    const pct = Math.round(_suggestion.confidence * 100);
    dest.textContent = `→ ${_suggestion.style} (${pct}%) — Entrée = accepter · Clic = style · Lettre = style · Échap = annuler`;
  } else {
    dest.textContent = 'Clic = style (écrit dans le tag) · 4 chiffres + Entrée = année · Échap = fermer';
  }
  el.appendChild(dest);

  el.addEventListener('keydown', onKeydown);
  document.body.appendChild(el);
  position(el, anchor);
  _el = el;
  highlightYears();
  document.addEventListener('mousedown', onDocMousedown, true);
  el.focus();
}

/** Ferme la palette (idempotent) et rend le focus applicatif à la ligne ancre. */
export function closeStylePalette(): void {
  if (!_el) return;
  document.removeEventListener('mousedown', onDocMousedown, true);
  _el.remove();
  _el = null;
  _style = null;
  _yearBuffer = '';
  const container = anchorContainer();
  if (container && _anchor?.isConnected) focusItemByElement(container, _anchor, { noHistory: true });
  _anchor = null;
  _targets = [];
}
