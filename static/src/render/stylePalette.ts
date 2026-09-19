// ─── Palette de style « g » (EPIC-035) — couche DOM focusée ────────────────
// Popover ancré à la ligne épars focusée. Chord : lettre (hotkey d'un style)
// → si un des fichiers ciblés n'a pas d'année et que le style est daté :
// chiffre 1-9 (tranche) ou Enter (style seul) → commit. Échap ferme,
// Backspace retire le choix. Le popover porte son propre `keydown` avec
// stopPropagation : le dispatcher du registry (document, phase bubble) ne
// voit rien — même pattern qu'un input (ratingEdit), sans champ de contexte
// ni binding modifié (la matrice EPIC-031 reste intacte).

import { setStatus } from '../core/feedback.js';
import { byCountThenId } from '../core/format.js';
import { focusItemByElement, navigateFocus } from '../focus.js';
import { state } from '../state.js';
import { parseArtistTitle, type Suggestion, suggestStyle } from '../styleSuggest.js';
import { deriveHotkeys, findEparsEntry, type StyleChoice, TRANCHES, yearOf } from '../styles.js';
import { currentTaxonomy, refreshStyleCells, updateStyleRecap } from './styleCell.js';

let _el: HTMLElement | null = null;
let _targets: string[] = [];
let _anchor: HTMLElement | null = null;
/** Style choisi, en attente d'une tranche (fichiers sans année). */
let _pending: string | null = null;
/** Suggestion calculée pour la cible unique (P2). Enter sans hotkey = accepter. */
let _suggestion: Suggestion | null = null;
let _hotkeyToStyle = new Map<string, string>();

export function isStylePaletteOpen(): boolean {
  return _el !== null;
}

function eparsContainer(): HTMLElement | null {
  return document.getElementById('epars-container');
}

function targetsNeedingYear(styleId: string): string[] {
  const tax = currentTaxonomy();
  const def = tax?.styles.get(styleId);
  if (!def || def.timeless) return [];
  return _targets.filter(fp => yearOf(findEparsEntry(state.eparsFiles, fp)?.entry) === null);
}

function setHint(text: string): void {
  const hint = _el?.querySelector('.sp-dest');
  if (hint) hint.textContent = text;
}

function commit(styleId: string, tranche: number | null, needing: string[]): void {
  const next = new Map<string, StyleChoice>(state.styleChoices);
  const noYear = new Set(needing);
  for (const fp of _targets) next.set(fp, { style: styleId, tranche: noYear.has(fp) ? tranche : null });
  state.styleChoices = next;
  refreshStyleCells(_targets);
  updateStyleRecap();
  const single = _targets.length === 1;
  closeStylePalette();
  const container = eparsContainer();
  if (single && container) navigateFocus(container, 1); // chaîne de tri : ligne suivante
}

function removeChoices(): void {
  const next = new Map(state.styleChoices);
  for (const fp of _targets) next.delete(fp);
  state.styleChoices = next;
  refreshStyleCells(_targets);
  updateStyleRecap();
  closeStylePalette();
}

/** Cibles sans année du style en attente (calculées une fois dans pick). */
let _pendingNeeding: string[] = [];

function pick(styleId: string): void {
  const needing = targetsNeedingYear(styleId);
  if (needing.length === 0) {
    commit(styleId, null, []);
    return;
  }
  _pending = styleId;
  _pendingNeeding = needing;
  _el?.classList.add('tranche-step');
  setHint(
    `${styleId} — ${needing.length} fichier${needing.length > 1 ? 's' : ''} sans année : chiffre 1-9 = tranche, Enter = style seul`,
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
    removeChoices();
    return;
  }
  if (_pending) {
    if (e.key === 'Enter') commit(_pending, null, _pendingNeeding);
    else if (/^[1-9]$/.test(e.key)) commit(_pending, TRANCHES[Number(e.key) - 1], _pendingNeeding);
    return;
  }
  // P2 : Enter sur une suggestion unique → accepter la suggestion
  if (e.key === 'Enter' && _suggestion && _targets.length === 1) {
    pick(_suggestion.style);
    return;
  }
  if (e.key.length === 1) {
    const styleId = _hotkeyToStyle.get(e.key.toLowerCase());
    if (styleId) pick(styleId);
  }
}

function onDocMousedown(e: MouseEvent): void {
  if (_el && !_el.contains(e.target as Node)) closeStylePalette();
}

function position(el: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const width = 440;
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
  _pending = null;
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
  el.setAttribute('aria-label', 'Choisir un style');

  const title = document.createElement('div');
  title.className = 'sp-title';
  const single = _targets.length === 1;
  title.textContent = single
    ? (findEparsEntry(state.eparsFiles, _targets[0])?.filename ?? _targets[0])
    : `${_targets.length} fichiers`;
  el.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'sp-styles';
  const ordered = [...tax.styles.values()].sort(byCountThenId);
  for (const def of ordered) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp-style';
    b.dataset.style = def.id;
    const k = hotkeys.get(def.id);
    b.innerHTML = `<kbd>${k ?? '·'}</kbd> `;
    b.appendChild(document.createTextNode(def.id));
    b.title = `${def.count} fichier${def.count > 1 ? 's' : ''} rangé${def.count > 1 ? 's' : ''}`;
    b.onclick = (ev: MouseEvent) => {
      ev.stopPropagation();
      pick(def.id);
    };
    grid.appendChild(b);
  }
  el.appendChild(grid);

  const tr = document.createElement('div');
  tr.className = 'sp-tranches';
  TRANCHES.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sp-tranche';
    b.dataset.tranche = String(t);
    b.innerHTML = `<kbd>${i + 1}</kbd> ${t}`;
    b.onclick = (ev: MouseEvent) => {
      ev.stopPropagation();
      if (_pending) commit(_pending, t, _pendingNeeding);
    };
    tr.appendChild(b);
  });
  el.appendChild(tr);

  const dest = document.createElement('div');
  dest.className = 'sp-dest';
  if (_suggestion && _targets.length === 1) {
    const pct = Math.round(_suggestion.confidence * 100);
    dest.textContent = `→ ${_suggestion.style} (${pct}%) — Enter = accepter · Lettre = style · Échap = annuler · ⌫ = retirer`;
  } else {
    dest.textContent = 'Lettre = style · Échap = annuler · ⌫ = retirer le style';
  }
  el.appendChild(dest);

  el.addEventListener('keydown', onKeydown);
  document.body.appendChild(el);
  position(el, anchor);
  _el = el;
  document.addEventListener('mousedown', onDocMousedown, true);
  el.focus();
}

/** Ferme la palette (idempotent) et rend le focus applicatif à la ligne ancre. */
export function closeStylePalette(): void {
  if (!_el) return;
  document.removeEventListener('mousedown', onDocMousedown, true);
  _el.remove();
  _el = null;
  _pending = null;
  _pendingNeeding = [];
  const container = eparsContainer();
  if (container && _anchor?.isConnected) focusItemByElement(container, _anchor, { noHistory: true });
  _anchor = null;
  _targets = [];
}
