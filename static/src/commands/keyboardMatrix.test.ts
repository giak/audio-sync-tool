// ─── Matrice de caractérisation clavier (EPIC-031 P0, mise à jour P1) ──────
// FIGE le comportement du registry et détecte structurellement les deux
// classes de bugs de session (binding mort/shadowé, touche volée dans un
// input). P1 (2026-09-16) : les 4 findings du P0 sont CORRIGÉS — les cellules
// ont été mises à jour CONSCIAMMENT (contrat P0), les nouveaux comportements
// (pile Échap complète, menu contextuel au clavier, ? légende, clavier dups
// déshadowé) sont à leur tour figés ici.
//
// MÉTHODE — zéro dérivation dans les assertions : on reconstruit le monde réel
// (state + DOM focus + event), on passe par le buildContext PRODUCTION et la
// gate modale de script.ts, puis on identifie le gagnant par son INDEX dans
// l'ordre d'enregistrement (= ordre d'import de script.ts). Toute cellule est
// une vérité exécutable : si elle passe, le comportement décrit est celui du
// produit ; si elle rougit après une modification, c'est un signal, pas un
// échec — on met à jour la cellule CONSCIAMMENT (c'est le contrat P0).
//
// Ordre d'enregistrement (2026-09-16, P1 — 58 bindings, vérifié empiriquement) :
//   menu 0-4 · navigation 5-22 · audio 23-27 · copy 28 · filter 29-30 ·
//   rating 31-32 · playlist 33-45 · modals 46-51 · ? 52 · replace 53 · dups 54-57
//
// FINDINGS P0 — tous CORRIGÉS en P1 (les cellules figent désormais le fix) :
//   FINDING 1 — Échap-filtre gardé par activeModal:null : sous une modale,
//               Échap ferme la modale (#49-54 enregistrées après le filtre,
//               qui ne matche plus).
//   FINDING 2 — le fallback « closeContextMenu à l'aveugle » est remplacé par
//               l'Échap-menu #4 (isContextMenuOpen) : plus aucune fermeture
//               souris-only pendant l'édition dans un input.
//   FINDING 3 — Alt+←/→ (#20-21) vivent : les ←/→ sync (#9-12) et épars
//               (#13-14) portent altKey:false.
//   SUSPECT   — audio (#25-29), copy (#30), rating-sidebar (#33) portent
//               page:'sync' : les 4 bindings dups (#56-59) gagnent à nouveau.
//
// Hors périmètre (couche au-dessus du registry, noté P0) : ratingEdit et
// cueEditor interceptent leurs touches via leurs propres listeners DOM avec
// stopPropagation — ils ne passent jamais par cette matrice.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Spies hoistés (les handlers réels ne doivent jamais s'exécuter) ────────
const {
  setActivePanel,
  navigateFocus,
  navigateColumn,
  navigateHistory,
  revalidateFocus,
  focusItemByElement,
  focusItemByPath,
} = vi.hoisted(() => ({
  setActivePanel: vi.fn(),
  navigateFocus: vi.fn(),
  navigateColumn: vi.fn(),
  navigateHistory: vi.fn(),
  revalidateFocus: vi.fn(),
  focusItemByElement: vi.fn(),
  focusItemByPath: vi.fn(),
}));
const { seekAudio, stopPlayer, isAudioPlayingMock } = vi.hoisted(() => ({
  seekAudio: vi.fn(),
  stopPlayer: vi.fn(),
  isAudioPlayingMock: vi.fn(() => false),
}));
const { executeCopy, executeReplace } = vi.hoisted(() => ({
  executeCopy: vi.fn(),
  executeReplace: vi.fn(),
}));
const { startRatingEdit, startSourceRatingEdit, patchPlaylistSourceFile } = vi.hoisted(() => ({
  startRatingEdit: vi.fn(),
  startSourceRatingEdit: vi.fn(),
  patchPlaylistSourceFile: vi.fn(),
}));
const { dupsMoveFocus, dupsApplyFocused, closeDupsMode } = vi.hoisted(() => ({
  dupsMoveFocus: vi.fn(),
  dupsApplyFocused: vi.fn(),
  closeDupsMode: vi.fn(),
}));
const {
  closeAllModals,
  closeContextMenu,
  openModal,
  moveContextMenuHighlight,
  activateContextMenuItem,
  isContextMenuOpenMock,
} = vi.hoisted(() => ({
  closeAllModals: vi.fn(),
  closeContextMenu: vi.fn(),
  openModal: vi.fn(),
  moveContextMenuHighlight: vi.fn(),
  activateContextMenuItem: vi.fn(),
  isContextMenuOpenMock: vi.fn(() => false),
}));
const { focusFilterChip, hideFilterChip } = vi.hoisted(() => ({
  focusFilterChip: vi.fn(),
  hideFilterChip: vi.fn(),
}));
const { toggleSourceDir } = vi.hoisted(() => ({ toggleSourceDir: vi.fn() }));

vi.mock('../focus.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../focus.js')>();
  return {
    ...mod,
    setActivePanel,
    navigateFocus,
    navigateColumn,
    navigateHistory,
    revalidateFocus,
    focusItemByElement,
    focusItemByPath,
  };
});
vi.mock('../audio.js', () => ({
  seekAudio,
  stopPlayer,
  isAudioPlaying: isAudioPlayingMock,
  initAudioUI: vi.fn(),
}));
vi.mock('../actions.js', () => ({
  executeCopy,
  executeReplace,
  refreshDupMatches: vi.fn(),
  createSourceFolder: vi.fn(),
  initApp: vi.fn().mockResolvedValue(undefined),
  initConfigUI: vi.fn(),
  runScan: vi.fn(),
}));
vi.mock('../render/index.js', () => ({
  startRatingEdit,
  startSourceRatingEdit,
  patchPlaylistSourceFile,
  renderEpars: vi.fn(),
  renderSource: vi.fn(),
  renderJournal: vi.fn(),
}));
vi.mock('../render/dupsUI.js', () => ({
  dupsMoveFocus,
  dupsApplyFocused,
  closeDupsMode,
  openDupsMode: vi.fn(),
  refreshDupMatches: vi.fn(),
}));
vi.mock('../ui.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../ui.js')>();
  return {
    ...mod,
    closeAllModals,
    closeContextMenu,
    openModal,
    moveContextMenuHighlight,
    activateContextMenuItem,
    isContextMenuOpen: isContextMenuOpenMock,
  };
});
vi.mock('../render/filterChip.js', () => ({
  focusFilterChip,
  hideFilterChip,
  getFilterTerm: vi.fn(() => ''),
  setFilterTerm: vi.fn(),
  isFilterActive: vi.fn(() => false),
  updateFilterCount: vi.fn(),
  ensureFilterChip: vi.fn(() => document.createElement('div')),
  subjectMatches: vi.fn(() => true),
}));
vi.mock('../render/sourceTree.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../render/sourceTree.js')>();
  return {
    ...mod,
    toggleSourceDir,
  };
});
vi.mock('../playlist.js', () => ({
  addTrack: vi.fn(),
  exportPlaylist: vi.fn(() => ''),
  getActivePlaylistName: vi.fn(() => 'test'),
  getPendingTracks: vi.fn(() => []),
  removeTrack: vi.fn(),
  reorderTrack: vi.fn(),
  savePlaylist: vi.fn().mockResolvedValue(undefined),
  loadPlaylists: vi.fn().mockResolvedValue(undefined),
  setPendingTracks: vi.fn(),
  createNewPlaylist: vi.fn(),
}));

// ── DOM minimal avant les imports de commandes ────────────────────────────
document.body.innerHTML = `
  <div id="epars-container"></div>
  <div id="source-container"></div>
`;

// ── Imports en ordre EXACT de script.ts — c'est lui qui décide des priorités ─
import { state } from '../state.js';
import { buildContext, type CommandContext, registry } from './registry.js';
import './menu.js'; // 0-4 — EN PREMIER : le menu ouvert isole le clavier
import './navigation.js'; // 5-24
import './audio.js'; // 25-29
import './copy.js'; // 30
import './filter.js'; // 31-32
import './rating.js'; // 33-34
import './playlist.js'; // 35-47
import './modals.js'; // 48-54
import './replace.js'; // 55
import './dups.js'; // 56-59

const BINDINGS = registry.list();
// Identités d'enregistrement — utilisées comme espérances lisibles dans les
// cellules. Chaque entrée est DÉRIVÉE du binding lui-même (touche + conditions
// discriminantes), pas codée en dur : la matrice survit à `test:shuffle` (la CI
// mélange l'ordre des fichiers) car les espérances dépendent du CONTENU du
// registry, jamais de l'ordre d'exécution des imports.
const IDX = {
  menuF10: BINDINGS.findIndex(b => b.key === 'F10' && b.shiftKey === true),
  menuDown: BINDINGS.findIndex(b => b.key === 'ArrowDown' && b.isContextMenuOpen === true),
  menuUp: BINDINGS.findIndex(b => b.key === 'ArrowUp' && b.isContextMenuOpen === true),
  menuEnter: BINDINGS.findIndex(b => b.key === 'Enter' && b.isContextMenuOpen === true),
  menuEscape: BINDINGS.findIndex(b => b.key === 'Escape' && b.isContextMenuOpen === true),
  navTabEpars: BINDINGS.findIndex(b => b.key === 'Tab' && b.activePanel === 'epars'),
  navTabSource: BINDINGS.findIndex(b => b.key === 'Tab' && b.activePanel === 'source'),
  navDown: BINDINGS.findIndex(
    b =>
      b.key === 'ArrowDown' &&
      b.page === 'sync' &&
      b.ctrlKey === undefined &&
      b.isAudioPlaying === undefined &&
      b.isFilterInputFocused === undefined,
  ),
  navUp: BINDINGS.findIndex(
    b =>
      b.key === 'ArrowUp' &&
      b.page === 'sync' &&
      b.ctrlKey === undefined &&
      b.isAudioPlaying === undefined &&
      b.isFilterInputFocused === undefined,
  ),
  navLeftSource: BINDINGS.findIndex(b => b.key === 'ArrowLeft' && b.activePanel === 'source'),
  navRightSource: BINDINGS.findIndex(b => b.key === 'ArrowRight' && b.activePanel === 'source'),
  navLeftEpars: BINDINGS.findIndex(b => b.key === 'ArrowLeft' && b.activePanel === 'epars'),
  navRightEpars: BINDINGS.findIndex(b => b.key === 'ArrowRight' && b.activePanel === 'epars'),
  navEnter: BINDINGS.findIndex(b => b.key === 'Enter' && b.playlistMode === false && b.isContextMenuOpen === undefined),
  navSpace: BINDINGS.findIndex(b => b.key === ' ' && b.playlistMode === false),
  navBackspace: BINDINGS.findIndex(b => b.key === 'Backspace' && b.playlistMode === false),
  navCtrlL: BINDINGS.findIndex(b => b.key === 'l' && b.ctrlKey === true),
  navAltLeft: BINDINGS.findIndex(b => b.key === 'ArrowLeft' && b.altKey === true),
  navAltRight: BINDINGS.findIndex(b => b.key === 'ArrowRight' && b.altKey === true),
  filterEscape: BINDINGS.findIndex(b => b.key === 'Escape' && b.isFilterInputFocused === true),
  filterDown: BINDINGS.findIndex(b => b.key === 'ArrowDown' && b.isFilterInputFocused === true),
  filterTab: BINDINGS.findIndex(b => b.key === 'Tab' && b.isFilterInputFocused === true),
  escapeCollapseDir: BINDINGS.findIndex(b => b.key === 'Escape' && b.isExpandedDirFocused === true),
  seekLeft: BINDINGS.findIndex(b => b.key === 'ArrowLeft' && b.isAudioPlaying === true && b.shiftKey === false),
  seekRight: BINDINGS.findIndex(b => b.key === 'ArrowRight' && b.isAudioPlaying === true && b.shiftKey === false),
  seekLeftShift: BINDINGS.findIndex(b => b.key === 'ArrowLeft' && b.isAudioPlaying === true && b.shiftKey === true),
  seekRightShift: BINDINGS.findIndex(b => b.key === 'ArrowRight' && b.isAudioPlaying === true && b.shiftKey === true),
  stopAudio: BINDINGS.findIndex(b => b.key === 'Escape' && b.isAudioPlaying === true),
  copyF5: BINDINGS.findIndex(b => b.key === 'F5'),
  filterF7: BINDINGS.findIndex(b => b.key === 'F7'),
  filterSlash: BINDINGS.findIndex(b => b.key === '/'),
  rateSidebar: BINDINGS.findIndex(b => b.key === 'n' && b.playlistFocus === 'sidebar'),
  rateSource: BINDINGS.findIndex(b => b.key === 'n' && b.playlistFocus === 'source'),
  plTab: BINDINGS.findIndex(b => b.key === 'Tab' && b.playlistMode === true),
  plSpace: BINDINGS.findIndex(b => b.key === ' ' && b.playlistMode === true),
  plDelete: BINDINGS.findIndex(b => b.key === 'Delete'),
  plBackspace: BINDINGS.findIndex(b => b.key === 'Backspace' && b.playlistMode === true),
  plCtrlS: BINDINGS.findIndex(b => b.key === 's' && b.ctrlKey === true),
  plCtrlE: BINDINGS.findIndex(b => b.key === 'e' && b.ctrlKey === true),
  plCtrlUp: BINDINGS.findIndex(b => b.key === 'ArrowUp' && b.ctrlKey === true),
  plCtrlDown: BINDINGS.findIndex(b => b.key === 'ArrowDown' && b.ctrlKey === true),
  plDown: BINDINGS.findIndex(
    b =>
      b.key === 'ArrowDown' &&
      b.playlistMode === true &&
      b.ctrlKey === undefined &&
      b.isFilterInputFocused === undefined,
  ),
  plUp: BINDINGS.findIndex(
    b =>
      b.key === 'ArrowUp' && b.playlistMode === true && b.ctrlKey === undefined && b.isFilterInputFocused === undefined,
  ),
  plEnter: BINDINGS.findIndex(b => b.key === 'Enter' && b.playlistMode === true),
  plLeft: BINDINGS.findIndex(b => b.key === 'ArrowLeft' && b.playlistMode === true),
  plRight: BINDINGS.findIndex(b => b.key === 'ArrowRight' && b.playlistMode === true),
  modalDialog: BINDINGS.findIndex(b => b.key === 'Escape' && b.activeModal === 'dialog'),
  modalConfig: BINDINGS.findIndex(b => b.key === 'Escape' && b.activeModal === 'config'),
  modalLegend: BINDINGS.findIndex(b => b.key === 'Escape' && b.activeModal === 'legend'),
  modalJournal: BINDINGS.findIndex(b => b.key === 'Escape' && b.activeModal === 'journal'),
  modalPlaylists: BINDINGS.findIndex(b => b.key === 'Escape' && b.activeModal === 'playlists'),
  modalCueEditor: BINDINGS.findIndex(b => b.key === 'Escape' && b.activeModal === 'cueEditor'),
  openLegend: BINDINGS.findIndex(b => b.key === '?'),
  replaceR: BINDINGS.findIndex(b => b.key === 'r' && b.page === 'sync'),
  dupsDown: BINDINGS.findIndex(b => b.key === 'ArrowDown' && b.page === 'dups'),
  dupsUp: BINDINGS.findIndex(b => b.key === 'ArrowUp' && b.page === 'dups'),
  dupsR: BINDINGS.findIndex(b => b.key === 'r' && b.page === 'dups'),
  dupsEscape: BINDINGS.findIndex(b => b.key === 'Escape' && b.page === 'dups'),
} as const;

// ── Le dispatch réel de script.ts (gate modale incluse) ───────────────────
// Le harnais importe les modules de commandes DIRECTEMENT (script.ts toucherait
// tout le DOM au top-level) : on attache donc la réplique EXACTE de son routeur
// (script.ts l.78-84). Toute modification du routeur réel doit être répercutée
// ici — c'est le seul code de production non importé tel quel.
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const ctx = buildContext(e);
  if (ctx.activeModal !== null && e.key !== 'Escape') return;
  registry.dispatch(e, ctx);
});

// Capture du contexte AU MOMENT du dispatch (avant tout effet de bord du
// handler gagnant — blur, re-render — qui fausseraient une ré-identification
// a posteriori). Le spy délègue au dispatch réel.
let dispatchedCtx: CommandContext | null = null;
const realDispatch = registry.dispatch.bind(registry);
vi.spyOn(registry, 'dispatch').mockImplementation((e, ctx) => {
  dispatchedCtx = ctx;
  return realDispatch(e, ctx);
});

function winnerIndex(ctx: CommandContext): number | null {
  for (let i = 0; i < BINDINGS.length; i++) {
    if (registry.bindingMatches(BINDINGS[i], ctx)) return i;
  }
  return null;
}

/** Contexte pour les invariants : l'event est dispatché sur l'élément focusé
 *  (comme en réel) uniquement pour que buildContext voie un e.target véridique
 *  — un KeyboardEvent synthétique non dispatché a target=null, ce qui
 *  fausserait isInput. SANS bubbles : aucun listener (dont le routeur) ne
 *  s'exécute — un handler réel blurerait l'input (ex. Échap-filtre) et
 *  corromprait le contexte des mods suivants du sweep. */
function ctxFor(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): CommandContext {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: false,
    cancelable: true,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  });
  target.dispatchEvent(e);
  return buildContext(e);
}

function dispatchReal(e: KeyboardEvent): boolean {
  const ctx = buildContext(e);
  if (ctx.activeModal !== null && e.key !== 'Escape') return false;
  return registry.dispatch(e, ctx);
}

// ── Reconstruction du monde par cellule ───────────────────────────────────
const BASE_DOM = '<div id="epars-container"></div><div id="source-container"></div>';

interface World {
  page?: 'sync' | 'playlist' | 'dups';
  playlistFocus?: 'source' | 'sidebar';
  activePanel?: 'epars' | 'source';
  activeModal?: string | null;
  audio?: boolean;
  /** Focus un input .filter-input (isFilterInputFocused réel). */
  fi?: boolean;
  /** Focus un input ordinaire (isInput réel, isFilterInputFocused faux). */
  input?: boolean;
  /** Menu contextuel ouvert (isContextMenuOpen réel via le spy ui.js). */
  menu?: boolean;
  /** Un dossier déplié .focused existe dans le panel actif
   *  (isExpandedDirFocused réel — le « focus » de l'app est la classe). */
  expandedDir?: boolean;
}

function setWorld(w: World): void {
  state.page = w.page ?? 'sync';
  state.playlistMode = state.page === 'playlist';
  state.playlistFocus = w.playlistFocus ?? 'source';
  state.activePanel = w.activePanel ?? 'epars';
  state.activeModal = w.activeModal ?? null;
  isAudioPlayingMock.mockReturnValue(w.audio ?? false);
  isContextMenuOpenMock.mockReturnValue(w.menu ?? false);
  document.body.innerHTML = BASE_DOM;
  if (w.fi) {
    const el = document.createElement('input');
    el.className = 'filter-input';
    document.body.appendChild(el);
    el.focus();
  } else if (w.input) {
    const el = document.createElement('input');
    document.body.appendChild(el);
    el.focus();
  } else if (w.expandedDir) {
    const host = state.playlistMode
      ? state.playlistFocus === 'source'
        ? document.getElementById('playlist-source-container')!
        : document.getElementById('epars-container')!
      : state.activePanel === 'source'
        ? document.getElementById('source-container')!
        : document.getElementById('epars-container')!;
    const dir = document.createElement('div');
    dir.className = 'directory expanded focused';
    dir.dataset.dirpath = '/src/Techno';
    host.appendChild(dir);
  }
}

/** Joue la cellule et renvoie l'INDEX du binding gagnant, ou null si le
 *  dispatch n'intercepte pas (comportement navigateur).
 *  L'event est dispatché sur l'élément focusé (comme en réel) : e.target
 *  doit être l'input pour que buildContext dérive isInput correctement.
 *  Le verdict est calculé depuis le contexte capturé AU VOL — pas après les
 *  effets du handler (qui mutent le DOM : blur, focus, etc.). */
function win(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): number | null {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  });
  dispatchedCtx = null;
  target.dispatchEvent(e);
  if (!e.defaultPrevented || dispatchedCtx === null) return null;
  return winnerIndex(dispatchedCtx);
}

// ── Les cellules : { nom, monde, touche, modifs, gagnant attendu } ─────────
interface Cell {
  name: string;
  w?: World;
  key: string;
  mods?: { ctrl?: boolean; shift?: boolean; alt?: boolean };
  /** Index attendu, ou null = non intercepté. */
  expect: number | null;
  /** Assertions comportementales optionnelles (spies) après dispatch. */
  check?: () => void;
}

const CELLS: Cell[] = [
  // ── MENU CONTEXTUEL OUVERT — il isole le clavier (importé en 1ᵉʳ) ──────
  {
    name: 'menu ouvert: ↓ déplace la surbrillance (pas la liste)',
    w: { menu: true },
    key: 'ArrowDown',
    expect: IDX.menuDown,
    check: () => expect(moveContextMenuHighlight).toHaveBeenCalledWith(1),
  },
  {
    name: 'menu ouvert: ↑ déplace la surbrillance',
    w: { menu: true },
    key: 'ArrowUp',
    expect: IDX.menuUp,
    check: () => expect(moveContextMenuHighlight).toHaveBeenCalledWith(-1),
  },
  {
    name: 'menu ouvert: Enter active l’item surligné',
    w: { menu: true },
    key: 'Enter',
    expect: IDX.menuEnter,
    check: () => expect(activateContextMenuItem).toHaveBeenCalledTimes(1),
  },
  {
    name: 'menu ouvert: Échap ferme le menu (1ᵉʳ pilier)',
    w: { menu: true },
    key: 'Escape',
    expect: IDX.menuEscape,
    check: () => expect(closeContextMenu).toHaveBeenCalledTimes(1),
  },
  {
    name: 'menu ouvert + audio: Échap ferme le MENU, audio continue (pile)',
    w: { menu: true, audio: true },
    key: 'Escape',
    expect: IDX.menuEscape,
    check: () => {
      expect(closeContextMenu).toHaveBeenCalledTimes(1);
      expect(stopPlayer).not.toHaveBeenCalled();
    },
  },
  {
    name: 'menu ouvert + modale: Échap ferme le MENU d’abord (pile)',
    w: { menu: true, activeModal: 'dialog' },
    key: 'Escape',
    expect: IDX.menuEscape,
    check: () => {
      expect(closeContextMenu).toHaveBeenCalledTimes(1);
      expect(closeAllModals).not.toHaveBeenCalled();
    },
  },
  {
    name: 'menu ouvert: ↓ pendant l’édition d’un input ne vole pas la touche',
    w: { menu: true, input: true },
    key: 'ArrowDown',
    expect: IDX.menuDown,
  },
  {
    name: 'menu ouvert: F5 passe au-dessous (le menu ne capture que ↓↑Enter Échap)',
    w: { menu: true },
    key: 'F5',
    expect: IDX.copyF5,
  },
  {
    name: 'menu fermé: Shift+F10 non intercepté (menu déjà ouvert → pas de réouverture)',
    w: { menu: true },
    key: 'F10',
    mods: { shift: true },
    expect: null,
  },
  {
    name: 'menu fermé: Shift+F10 ouvre le menu de l’élément focusé',
    w: { activePanel: 'source' },
    key: 'F10',
    mods: { shift: true },
    expect: IDX.menuF10,
  },
  // ── SYNC — navigation listes ────────────────────────────────────────────
  { name: 'sync: Tab épars → source', w: { activePanel: 'epars' }, key: 'Tab', expect: IDX.navTabEpars },
  { name: 'sync: Tab source → épars', w: { activePanel: 'source' }, key: 'Tab', expect: IDX.navTabSource },
  { name: 'sync: ↓ épars', key: 'ArrowDown', expect: IDX.navDown },
  { name: 'sync: ↑ épars', key: 'ArrowUp', expect: IDX.navUp },
  { name: 'sync: ← source', w: { activePanel: 'source' }, key: 'ArrowLeft', expect: IDX.navLeftSource },
  { name: 'sync: → source', w: { activePanel: 'source' }, key: 'ArrowRight', expect: IDX.navRightSource },
  { name: 'sync: ← épars (no-op, audio off)', key: 'ArrowLeft', expect: IDX.navLeftEpars },
  { name: 'sync: → épars (no-op, audio off)', key: 'ArrowRight', expect: IDX.navRightEpars },
  { name: 'sync: Enter lit', key: 'Enter', expect: IDX.navEnter },
  { name: 'sync: Espace sélectionne', key: ' ', expect: IDX.navSpace },
  { name: 'sync: Backspace dossier parent', key: 'Backspace', expect: IDX.navBackspace },
  { name: 'sync: Ctrl+L', mods: { ctrl: true }, key: 'l', expect: IDX.navCtrlL },
  {
    name: 'FIX FINDING 3 — Alt+← = historique (live, shadowing tué)',
    mods: { alt: true },
    key: 'ArrowLeft',
    expect: IDX.navAltLeft,
    check: () => expect(navigateHistory).toHaveBeenCalledWith(-1),
  },
  {
    name: 'FIX FINDING 3 — Alt+→ = historique (live, shadowing tué)',
    mods: { alt: true },
    key: 'ArrowRight',
    expect: IDX.navAltRight,
    check: () => expect(navigateHistory).toHaveBeenCalledWith(1),
  },
  // ── SYNC — input filtre (le monde fi est réel : focus DOM) ─────────────
  {
    name: 'sync: Échap dans filtre ferme le chip',
    w: { fi: true },
    key: 'Escape',
    expect: IDX.filterEscape,
    check: () => expect(hideFilterChip).toHaveBeenCalledTimes(1),
  },
  {
    name: 'sync: ↓ dans filtre → panel source',
    w: { fi: true },
    key: 'ArrowDown',
    expect: IDX.filterDown,
    check: () => expect(setActivePanel).toHaveBeenCalledWith('source'),
  },
  {
    name: 'sync: Tab dans filtre → panel épars',
    w: { fi: true },
    key: 'Tab',
    expect: IDX.filterTab,
    check: () => expect(setActivePanel).toHaveBeenCalledWith('epars'),
  },
  { name: 'sync: ← dans filtre = caret (non intercepté)', w: { fi: true }, key: 'ArrowLeft', expect: null },
  { name: 'sync: Espace dans filtre = texte (non intercepté)', w: { fi: true }, key: ' ', expect: null },
  { name: 'sync: n dans filtre = texte (non intercepté)', w: { fi: true }, key: 'n', expect: null },
  // ── SYNC — audio ────────────────────────────────────────────────────────
  {
    name: 'sync+audio: ← seek',
    w: { audio: true },
    key: 'ArrowLeft',
    expect: IDX.seekLeft,
    check: () => expect(seekAudio).toHaveBeenCalledWith(-1),
  },
  { name: 'sync+audio: → seek', w: { audio: true }, key: 'ArrowRight', expect: IDX.seekRight },
  {
    name: 'sync+audio: Shift+← seek',
    w: { audio: true },
    mods: { shift: true },
    key: 'ArrowLeft',
    expect: IDX.seekLeftShift,
  },
  {
    name: 'sync+audio: Shift+→ seek',
    w: { audio: true },
    mods: { shift: true },
    key: 'ArrowRight',
    expect: IDX.seekRightShift,
  },
  {
    name: 'sync+audio: Échap stoppe',
    w: { audio: true },
    key: 'Escape',
    expect: IDX.stopAudio,
    check: () => expect(stopPlayer).toHaveBeenCalledTimes(1),
  },
  {
    name: 'sync+audio+filtre: Échap ferme le FILTRE, audio continue (pile : filtre avant audio)',
    w: { audio: true, fi: true },
    key: 'Escape',
    expect: IDX.filterEscape,
    check: () => {
      expect(hideFilterChip).toHaveBeenCalledTimes(1);
      expect(stopPlayer).not.toHaveBeenCalled();
    },
  },
  {
    name: 'sync+audio+dossier déplié: Échap ferme le DOSSIER, audio continue (pile)',
    w: { audio: true, expandedDir: true, activePanel: 'source' },
    key: 'Escape',
    expect: IDX.escapeCollapseDir,
    check: () => {
      expect(toggleSourceDir).toHaveBeenCalledWith('/src/Techno');
      expect(stopPlayer).not.toHaveBeenCalled();
    },
  },
  {
    name: 'sync+dossier déplié+audio: le stop audio reste vivant une fois le dossier replié',
    w: { audio: true, activePanel: 'source' },
    key: 'Escape',
    expect: IDX.stopAudio,
    check: () => expect(stopPlayer).toHaveBeenCalledTimes(1),
  },
  // ── SYNC — outils ───────────────────────────────────────────────────────
  { name: 'sync: F5 copie', key: 'F5', expect: IDX.copyF5, check: () => expect(executeCopy).toHaveBeenCalledTimes(1) },
  { name: 'sync: F5 dans input ordinaire = non intercepté', w: { input: true }, key: 'F5', expect: null },
  {
    name: 'sync: F7 toggle filtre',
    key: 'F7',
    expect: IDX.filterF7,
    check: () => expect(focusFilterChip).toHaveBeenCalledWith('sync-epars'),
  },
  { name: 'sync: / ouvre filtre', key: '/', expect: IDX.filterSlash },
  { name: 'sync: n sans playlist = rien', key: 'n', expect: null },
  {
    name: 'sync: r sans doublon sélectionné = no-op (garde dupMatches figée)',
    key: 'r',
    expect: IDX.replaceR,
    check: () => expect(executeReplace).not.toHaveBeenCalled(),
  },
  {
    name: 'sync: ? ouvre la légende',
    key: '?',
    expect: IDX.openLegend,
    check: () => expect(openModal).toHaveBeenCalledWith('legend'),
  },
  { name: 'sync: ? dans input ordinaire = texte (non intercepté)', w: { input: true }, key: '?', expect: null },
  // ── ÉCHAP — la pile complète (menu → modale → filtre → dossier → audio) ─
  {
    name: 'sync: Échap sans rien = non intercepté (plus de fallback aveugle)',
    key: 'Escape',
    expect: null,
    check: () => expect(closeContextMenu).not.toHaveBeenCalled(),
  },
  {
    name: 'FIX FINDING 2 — Échap dans input ORDINAIRE = caret/texte (non intercepté)',
    w: { input: true },
    key: 'Escape',
    expect: null,
    check: () => expect(closeContextMenu).not.toHaveBeenCalled(),
  },
  {
    name: 'sync + dossier déplié focusé: Échap referme le dossier',
    w: { activePanel: 'source', expandedDir: true },
    key: 'Escape',
    expect: IDX.escapeCollapseDir,
    check: () => expect(toggleSourceDir).toHaveBeenCalledWith('/src/Techno'),
  },
  {
    name: 'modale dialog: Échap ferme',
    w: { activeModal: 'dialog' },
    key: 'Escape',
    expect: IDX.modalDialog,
    check: () => expect(closeAllModals).toHaveBeenCalledTimes(1),
  },
  { name: 'modale cueEditor: Échap ferme', w: { activeModal: 'cueEditor' }, key: 'Escape', expect: IDX.modalCueEditor },
  {
    name: 'FIX FINDING 1 — modale + filtre focusé: Échap ferme la MODALE',
    w: { activeModal: 'dialog', fi: true },
    key: 'Escape',
    expect: IDX.modalDialog,
    check: () => {
      expect(closeAllModals).toHaveBeenCalledTimes(1);
      expect(hideFilterChip).not.toHaveBeenCalled();
    },
  },
  { name: 'gate modale: F5 sous modale = non intercepté', w: { activeModal: 'dialog' }, key: 'F5', expect: null },
  // ── PLAYLIST ────────────────────────────────────────────────────────────
  { name: 'playlist: Tab source↔sidebar', w: { page: 'playlist' }, key: 'Tab', expect: IDX.plTab },
  { name: 'playlist: Espace ajoute', w: { page: 'playlist' }, key: ' ', expect: IDX.plSpace },
  {
    name: 'playlist: Delete sidebar',
    w: { page: 'playlist', playlistFocus: 'sidebar' },
    key: 'Delete',
    expect: IDX.plDelete,
  },
  {
    name: 'playlist: Backspace sidebar',
    w: { page: 'playlist', playlistFocus: 'sidebar' },
    key: 'Backspace',
    expect: IDX.plBackspace,
  },
  { name: 'playlist: Ctrl+S', w: { page: 'playlist' }, mods: { ctrl: true }, key: 's', expect: IDX.plCtrlS },
  { name: 'playlist: Ctrl+E', w: { page: 'playlist' }, mods: { ctrl: true }, key: 'e', expect: IDX.plCtrlE },
  {
    name: 'playlist: Ctrl+↑ sidebar',
    w: { page: 'playlist', playlistFocus: 'sidebar' },
    mods: { ctrl: true },
    key: 'ArrowUp',
    expect: IDX.plCtrlUp,
  },
  {
    name: 'playlist: Ctrl+↓ sidebar',
    w: { page: 'playlist', playlistFocus: 'sidebar' },
    mods: { ctrl: true },
    key: 'ArrowDown',
    expect: IDX.plCtrlDown,
  },
  { name: 'playlist: ↓ source', w: { page: 'playlist' }, key: 'ArrowDown', expect: IDX.plDown },
  { name: 'playlist: ↑ source', w: { page: 'playlist' }, key: 'ArrowUp', expect: IDX.plUp },
  { name: 'playlist: Enter joue', w: { page: 'playlist' }, key: 'Enter', expect: IDX.plEnter },
  { name: 'playlist: ← source (retirer)', w: { page: 'playlist' }, key: 'ArrowLeft', expect: IDX.plLeft },
  { name: 'playlist: → source', w: { page: 'playlist' }, key: 'ArrowRight', expect: IDX.plRight },
  {
    name: 'playlist: F7 filtre playlist-source',
    w: { page: 'playlist' },
    key: 'F7',
    expect: IDX.filterF7,
    check: () => expect(focusFilterChip).toHaveBeenCalledWith('playlist-source'),
  },
  {
    name: 'playlist sidebar: / filtre playlist-tracks',
    w: { page: 'playlist', playlistFocus: 'sidebar' },
    key: '/',
    expect: IDX.filterSlash,
    check: () => expect(focusFilterChip).toHaveBeenCalledWith('playlist-tracks'),
  },
  {
    name: 'playlist sidebar: n note',
    w: { page: 'playlist', playlistFocus: 'sidebar' },
    key: 'n',
    expect: IDX.rateSidebar,
  },
  { name: 'playlist source: n note', w: { page: 'playlist' }, key: 'n', expect: IDX.rateSource },
  {
    name: 'playlist: Échap = non intercepté (pas de fermeture de page par Échap)',
    w: { page: 'playlist' },
    key: 'Escape',
    expect: null,
  },
  // ── DUPS — FIX SUSPECT : les 4 bindings gagnent à nouveau ───────────────
  {
    name: 'FIX SUSPECT — dups: ↓ = navigation dups',
    w: { page: 'dups' },
    key: 'ArrowDown',
    expect: IDX.dupsDown,
    check: () => expect(dupsMoveFocus).toHaveBeenCalledWith(1),
  },
  {
    name: 'FIX SUSPECT — dups: ↑ = navigation dups',
    w: { page: 'dups' },
    key: 'ArrowUp',
    expect: IDX.dupsUp,
    check: () => expect(dupsMoveFocus).toHaveBeenCalledWith(-1),
  },
  {
    name: 'FIX SUSPECT — dups: r = apply dups',
    w: { page: 'dups' },
    key: 'r',
    expect: IDX.dupsR,
    check: () => expect(dupsApplyFocused).toHaveBeenCalledTimes(1),
  },
  {
    name: 'FIX SUSPECT — dups: Échap = retour sync',
    w: { page: 'dups' },
    key: 'Escape',
    expect: IDX.dupsEscape,
    check: () => expect(closeDupsMode).toHaveBeenCalledTimes(1),
  },
  {
    name: 'dups+audio: Échap retourne en sync (le stop audio est scopé sync)',
    w: { page: 'dups', audio: true },
    key: 'Escape',
    expect: IDX.dupsEscape,
    check: () => expect(closeDupsMode).toHaveBeenCalledTimes(1),
  },
  { name: 'dups: F5 = non intercepté (scopé sync)', w: { page: 'dups' }, key: 'F5', expect: null },
  { name: 'dups: ? ouvre la légende (transverse)', w: { page: 'dups' }, key: '?', expect: IDX.openLegend },
];

// Petit alias car la table ci-dessus est longue — garder les nirs lisibles.
const IDx_CTRL_L = IDX.navCtrlL;
void IDx_CTRL_L;

describe('matrice clavier — vérités exécutables (EPIC-031 P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isContextMenuOpenMock.mockReturnValue(false);
    setWorld({});
  });

  for (const cell of CELLS) {
    it(cell.name, () => {
      // 1. Le verdict — depuis un monde reconstruit à neuf
      setWorld(cell.w ?? {});
      const verdict = win(cell.key, cell.mods);
      expect(verdict).toEqual(cell.expect);

      // 2. Déterminisme : même monde reconstruit à neuf → même verdict
      //    (sans ça, les effets du 1er dispatch (blur…) pollueraient le 2e)
      setWorld(cell.w ?? {});
      expect(win(cell.key, cell.mods)).toEqual(verdict);

      // 3. Effets comportementaux : monde neuf + spies vierges, UN seul dispatch
      //    (les handlers réels s'exécutent — c'est voulu : on vérifie leurs spies)
      setWorld(cell.w ?? {});
      vi.clearAllMocks();
      isContextMenuOpenMock.mockReturnValue(cell.w?.menu ?? false);
      win(cell.key, cell.mods);
      cell.check?.();
    });
  }
});

// ── INVARIANTS STRUCTURELS ────────────────────────────────────────────────
describe('matrice clavier — invariants structurels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isContextMenuOpenMock.mockReturnValue(false);
    setWorld({});
  });

  const WORLDS: World[] = [
    {},
    { activePanel: 'source' },
    { fi: true },
    { input: true },
    { audio: true },
    { menu: true },
    { expandedDir: true, activePanel: 'source' },
    { page: 'playlist' },
    { page: 'playlist', playlistFocus: 'sidebar' },
    { page: 'dups' },
    { activeModal: 'dialog' },
    { activeModal: 'config' },
    { activeModal: 'legend' },
    { activeModal: 'journal' },
    { activeModal: 'playlists' },
    { activeModal: 'cueEditor' },
  ];
  const MODS = [{}, { ctrl: true }, { shift: true }, { alt: true }];

  it('invariant 1 — aucun binding mort : chaque binding matche dans ≥ 1 monde testé', () => {
    const dead: string[] = [];
    BINDINGS.forEach((b, i) => {
      const alive = WORLDS.some(w => {
        setWorld(w);
        return MODS.some(m => registry.bindingMatches(b, ctxFor(b.key, m)));
      });
      if (!alive) dead.push(`#${i} key=${b.key}`);
    });
    expect(dead).toEqual([]);
  });

  it('invariant 2 — aucun binding toujours-shadowé : chaque binding gagne dans ≥ 1 monde', () => {
    // Un binding est "toujours shadowé" s'il existe un monde où il matche
    // mais un binding antérieur y matche aussi, et ce pour TOUS ses mondes.
    // (P1 : les 4 bindings dups vivent — les gardes page:'sync' ont tué le
    // dernier shadowing structurel.)
    const shadowed: number[] = [];
    BINDINGS.forEach((b, i) => {
      let reachable = false; // gagne dans ≥ 1 monde
      let matchesSomewhere = false;
      for (const w of WORLDS) {
        setWorld(w);
        for (const m of MODS) {
          const ctx = ctxFor(b.key, m);
          if (!registry.bindingMatches(b, ctx)) continue;
          matchesSomewhere = true;
          const earlier = BINDINGS.slice(0, i).some(prev => registry.bindingMatches(prev, ctx));
          if (!earlier) {
            reachable = true;
            break;
          }
        }
        if (reachable) break;
      }
      if (matchesSomewhere && !reachable) shadowed.push(i);
    });
    expect(shadowed).toEqual([]);
  });

  it('invariant 3 — la gate modale isole tout sauf Échap (échantillon de touches)', () => {
    setWorld({ activeModal: 'dialog' });
    const KEYS = [
      'Tab',
      'ArrowDown',
      'Enter',
      ' ',
      'Backspace',
      'Delete',
      'F5',
      'F7',
      'F10',
      '/',
      'n',
      'r',
      'l',
      's',
      'e',
      '?',
    ];
    for (const key of KEYS) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      expect(dispatchReal(e)).toBe(false);
    }
  });

  it('invariant 4 — la pile Échap : ordre menu > modale > filtre > dossier > audio (sync)', () => {
    // La pile documentée dans l'EPIC-031, vérifiée d'un bloc : pour chaque
    // monde de plus en plus vide, le gagnant recule d'un pilier.
    expect(win('Escape')).toEqual(null); // rien d'ouvert → non intercepté
    setWorld({ audio: true });
    expect(win('Escape')).toEqual(IDX.stopAudio); // dernier recours
    setWorld({ audio: true, expandedDir: true, activePanel: 'source' });
    expect(win('Escape')).toEqual(IDX.escapeCollapseDir); // dossier avant audio
    setWorld({ audio: true, fi: true });
    expect(win('Escape')).toEqual(IDX.filterEscape); // filtre avant dossier/audio
    setWorld({ audio: true, activeModal: 'dialog' });
    expect(win('Escape')).toEqual(IDX.modalDialog); // modale avant filtre/audio
    setWorld({ audio: true, menu: true });
    expect(win('Escape')).toEqual(IDX.menuEscape); // menu avant tout
  });

  it('invariant 5 — bijection labels ↔ bindings : tout binding porte label + group', () => {
    const unlabeled: string[] = [];
    BINDINGS.forEach((b, i) => {
      if (!b.label) unlabeled.push(`#${i} key=${b.key}`);
      else if (!['sync', 'playlist', 'dups', 'global'].includes(b.group ?? ''))
        unlabeled.push(`#${i} group=${String(b.group)}`);
    });
    expect(unlabeled).toEqual([]);
  });
});
