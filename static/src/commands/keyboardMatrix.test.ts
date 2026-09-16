// ─── Matrice de caractérisation clavier (EPIC-031 P0) ─────────────────────
// FIGE le comportement ACTUEL du registry avant tout refacto et détecte
// structurellement les deux classes de bugs de session (binding mort/shadowé,
// touche volée dans un input).
//
// MÉTHODE — zéro dérivation dans les assertions : on reconstruit le monde réel
// (state + DOM focus + event), on passe par le buildContext PRODUCTION et la
// gate modale de script.ts, puis on identifie le gagnant par son INDEX dans
// l'ordre d'enregistrement (= ordre d'import de script.ts). Toute cellule est
// une vérité exécutable : si elle passe, le comportement décrit est celui du
// produit ; si elle rougit après une modification, c'est un signal, pas un
// échec — on met à jour la cellule CONSCIAMMENT (c'est le contrat P0).
//
// Ordre d'enregistrement (dump du 2026-09-16, 52 bindings — vérifié empiriquement) :
//   navigation 0-16 · audio 17-21 · copy 22 · filter 23-24 · rating 25-26 ·
//   playlist 27-39 · modals 40-46 · replace 47 · dups 48-51
//
// FINDINGS figés par cette matrice (tous candidats fix P1 — la matrice rougira
// quand ils seront corrigés, c'est le contrat : mise à jour CONSCIANTE) :
//   FINDING 1 — modale + filtre focusé : Échap ferme le FILTRE, pas la modale
//               (#14 sans garde activeModal, enregistré avant #40-45)
//   FINDING 2 — Échap dans un input ordinaire → closeContextMenu (#46 sans
//               garde isInput — ferme le menu alors que l'utilisateur édite)
//   FINDING 3 — Alt+←/→ historique (#12-13) shadowés par ←/→ épars (#6-7)
//               sans garde altKey : l'historique est MORT en page sync
//   SUSPECT   — les 4 bindings dups (#48-51) ne gagnent JAMAIS (shadowés par
//               les bindings sync sans garde page) : clavier dups inopérant
//
// Hors périmètre (couche au-dessus du registry, noté pour P1) : ratingEdit et
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
const { toggleTrackInPlaylist, saveCurrentPlaylist, showExportModal } = vi.hoisted(() => ({
  toggleTrackInPlaylist: vi.fn(),
  saveCurrentPlaylist: vi.fn(),
  showExportModal: vi.fn(),
}));
const { dupsMoveFocus, dupsApplyFocused, closeDupsMode } = vi.hoisted(() => ({
  dupsMoveFocus: vi.fn(),
  dupsApplyFocused: vi.fn(),
  closeDupsMode: vi.fn(),
}));
const { closeAllModals, closeContextMenu } = vi.hoisted(() => ({
  closeAllModals: vi.fn(),
  closeContextMenu: vi.fn(),
}));
const { focusFilterChip, hideFilterChip } = vi.hoisted(() => ({
  focusFilterChip: vi.fn(),
  hideFilterChip: vi.fn(),
}));

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
vi.mock('../ui.js', () => ({
  closeAllModals,
  closeContextMenu,
  openModal: vi.fn(),
  confirmDialog: vi.fn(),
  showToast: vi.fn(),
  showError: vi.fn(),
}));
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
import { buildContext, registry, type CommandContext } from './registry.js';
import './navigation.js';
import './audio.js';
import './copy.js';
import './filter.js';
import './rating.js';
import './playlist.js';
import './modals.js';
import './replace.js';
import './dups.js';

const BINDINGS = registry.list();
// Identités d'enregistrement (cf. dump en en-tête) — utilisées comme
// espérances lisibles dans les cellules.
const IDX = {
  navTabEpars: 0,
  navTabSource: 1,
  navDown: 2,
  navUp: 3,
  navLeftSource: 4,
  navRightSource: 5,
  navLeftEpars: 6,
  navRightEpars: 7,
  navEnter: 8,
  navSpace: 9,
  navBackspace: 10,
  navCtrlL: 11,
  navAltLeft: 12,
  navAltRight: 13,
  filterEscape: 14,
  filterDown: 15,
  filterTab: 16,
  seekLeft: 17,
  seekRight: 18,
  seekLeftShift: 19,
  seekRightShift: 20,
  stopAudio: 21,
  copyF5: 22,
  filterF7: 23,
  filterSlash: 24,
  rateSidebar: 25,
  rateSource: 26,
  plTab: 27,
  plSpace: 28,
  plDelete: 29,
  plBackspace: 30,
  plCtrlS: 31,
  plCtrlE: 32,
  plCtrlUp: 33,
  plCtrlDown: 34,
  plDown: 35,
  plUp: 36,
  plEnter: 37,
  plLeft: 38,
  plRight: 39,
  modalDialog: 40,
  modalConfig: 41,
  modalLegend: 42,
  modalJournal: 43,
  modalPlaylists: 44,
  modalCueEditor: 45,
  menuFallback: 46,
  replaceR: 47,
  dupsDown: 48,
  dupsUp: 49,
  dupsR: 50,
  dupsEscape: 51,
} as const;

// ── Le dispatch réel de script.ts (gate modale incluse) ───────────────────
// Le harnais importe les modules de commandes DIRECTEMENT (script.ts toucherait
// tout le DOM au top-level) : on attache donc la réplique EXACTE de son routeur
// (script.ts l.68-74). Toute modification du routeur réel doit être répercutée
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
 *  s'exécute — un handler réel blurerait l'input (ex. #14) et corromprait
 *  le contexte des mods suivants du sweep. */
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
}

function setWorld(w: World): void {
  state.page = w.page ?? 'sync';
  state.playlistMode = state.page === 'playlist';
  state.playlistFocus = w.playlistFocus ?? 'source';
  state.activePanel = w.activePanel ?? 'epars';
  state.activeModal = w.activeModal ?? null;
  isAudioPlayingMock.mockReturnValue(w.audio ?? false);
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
  { name: 'FINDING 3 — Alt+← shadowé par ← épars : historique MORT en sync (figé)', mods: { alt: true }, key: 'ArrowLeft', expect: IDX.navLeftEpars, check: () => expect(navigateHistory).not.toHaveBeenCalled() },
  { name: 'FINDING 3 — Alt+→ shadowé par → épars : historique MORT en sync (figé)', mods: { alt: true }, key: 'ArrowRight', expect: IDX.navRightEpars, check: () => expect(navigateHistory).not.toHaveBeenCalled() },
  // ── SYNC — input filtre (le monde fi est réel : focus DOM) ─────────────
  { name: 'sync: Échap dans filtre ferme le chip', w: { fi: true }, key: 'Escape', expect: IDX.filterEscape, check: () => expect(hideFilterChip).toHaveBeenCalledTimes(1) },
  { name: 'sync: ↓ dans filtre → panel source', w: { fi: true }, key: 'ArrowDown', expect: IDX.filterDown, check: () => expect(setActivePanel).toHaveBeenCalledWith('source') },
  { name: 'sync: Tab dans filtre → panel épars', w: { fi: true }, key: 'Tab', expect: IDX.filterTab, check: () => expect(setActivePanel).toHaveBeenCalledWith('epars') },
  { name: 'sync: ← dans filtre = caret (non intercepté)', w: { fi: true }, key: 'ArrowLeft', expect: null },
  { name: 'sync: Espace dans filtre = texte (non intercepté)', w: { fi: true }, key: ' ', expect: null },
  { name: 'sync: n dans filtre = texte (non intercepté)', w: { fi: true }, key: 'n', expect: null },
  // ── SYNC — audio ────────────────────────────────────────────────────────
  { name: 'sync+audio: ← seek', w: { audio: true }, key: 'ArrowLeft', expect: IDX.seekLeft, check: () => expect(seekAudio).toHaveBeenCalledWith(-1) },
  { name: 'sync+audio: → seek', w: { audio: true }, key: 'ArrowRight', expect: IDX.seekRight },
  { name: 'sync+audio: Shift+← seek', w: { audio: true }, mods: { shift: true }, key: 'ArrowLeft', expect: IDX.seekLeftShift },
  { name: 'sync+audio: Shift+→ seek', w: { audio: true }, mods: { shift: true }, key: 'ArrowRight', expect: IDX.seekRightShift },
  { name: 'sync+audio: Échap stoppe', w: { audio: true }, key: 'Escape', expect: IDX.stopAudio, check: () => expect(stopPlayer).toHaveBeenCalledTimes(1) },
  { name: 'sync+audio+filtre: Échap ferme le FILTRE, audio continue (figé — ordre import)', w: { audio: true, fi: true }, key: 'Escape', expect: IDX.filterEscape, check: () => {
      expect(hideFilterChip).toHaveBeenCalledTimes(1);
      expect(stopPlayer).not.toHaveBeenCalled();
    } },
  // ── SYNC — outils ───────────────────────────────────────────────────────
  { name: 'sync: F5 copie', key: 'F5', expect: IDX.copyF5, check: () => expect(executeCopy).toHaveBeenCalledTimes(1) },
  { name: 'sync: F5 dans input ordinaire = non intercepté', w: { input: true }, key: 'F5', expect: null },
  { name: 'sync: F7 toggle filtre', key: 'F7', expect: IDX.filterF7, check: () => expect(focusFilterChip).toHaveBeenCalledWith('sync-epars') },
  { name: 'sync: / ouvre filtre', key: '/', expect: IDX.filterSlash },
  { name: 'sync: n sans playlist = rien', key: 'n', expect: null },
  { name: 'sync: r sans doublon sélectionné = no-op (garde dupMatches figée)', key: 'r', expect: IDX.replaceR, check: () => expect(executeReplace).not.toHaveBeenCalled() },
  // ── ÉCHAP — la pile réelle ─────────────────────────────────────────────
  { name: 'sync: Échap sans rien = fallback menu contextuel (figé)', key: 'Escape', expect: IDX.menuFallback, check: () => expect(closeContextMenu).toHaveBeenCalledTimes(1) },
  { name: 'FINDING 2 — Échap dans input ORDINAIRE → closeContextMenu (garde isInput absente)', w: { input: true }, key: 'Escape', expect: IDX.menuFallback, check: () => expect(closeContextMenu).toHaveBeenCalledTimes(1) },
  { name: 'modale dialog: Échap ferme', w: { activeModal: 'dialog' }, key: 'Escape', expect: IDX.modalDialog, check: () => expect(closeAllModals).toHaveBeenCalledTimes(1) },
  { name: 'modale cueEditor: Échap ferme', w: { activeModal: 'cueEditor' }, key: 'Escape', expect: IDX.modalCueEditor },
  { name: 'FINDING 1 — modale + filtre focusé: Échap ferme le FILTRE, pas la modale (figé comme bug candidat P1)', w: { activeModal: 'dialog', fi: true }, key: 'Escape', expect: IDX.filterEscape, check: () => {
      expect(hideFilterChip).toHaveBeenCalledTimes(1);
      expect(closeAllModals).not.toHaveBeenCalled();
    } },
  { name: 'gate modale: F5 sous modale = non intercepté', w: { activeModal: 'dialog' }, key: 'F5', expect: null },
  // ── PLAYLIST ────────────────────────────────────────────────────────────
  { name: 'playlist: Tab source↔sidebar', w: { page: 'playlist' }, key: 'Tab', expect: IDX.plTab },
  { name: 'playlist: Espace ajoute', w: { page: 'playlist' }, key: ' ', expect: IDX.plSpace },
  { name: 'playlist: Delete sidebar', w: { page: 'playlist', playlistFocus: 'sidebar' }, key: 'Delete', expect: IDX.plDelete },
  { name: 'playlist: Backspace sidebar', w: { page: 'playlist', playlistFocus: 'sidebar' }, key: 'Backspace', expect: IDX.plBackspace },
  { name: 'playlist: Ctrl+S', w: { page: 'playlist' }, mods: { ctrl: true }, key: 's', expect: IDX.plCtrlS },
  { name: 'playlist: Ctrl+E', w: { page: 'playlist' }, mods: { ctrl: true }, key: 'e', expect: IDX.plCtrlE },
  { name: 'playlist: Ctrl+↑ sidebar', w: { page: 'playlist', playlistFocus: 'sidebar' }, mods: { ctrl: true }, key: 'ArrowUp', expect: IDX.plCtrlUp },
  { name: 'playlist: Ctrl+↓ sidebar', w: { page: 'playlist', playlistFocus: 'sidebar' }, mods: { ctrl: true }, key: 'ArrowDown', expect: IDX.plCtrlDown },
  { name: 'playlist: ↓ source', w: { page: 'playlist' }, key: 'ArrowDown', expect: IDX.plDown },
  { name: 'playlist: ↑ source', w: { page: 'playlist' }, key: 'ArrowUp', expect: IDX.plUp },
  { name: 'playlist: Enter joue', w: { page: 'playlist' }, key: 'Enter', expect: IDX.plEnter },
  { name: 'playlist: ← source (retirer)', w: { page: 'playlist' }, key: 'ArrowLeft', expect: IDX.plLeft },
  { name: 'playlist: → source', w: { page: 'playlist' }, key: 'ArrowRight', expect: IDX.plRight },
  { name: 'playlist: F7 filtre playlist-source', w: { page: 'playlist' }, key: 'F7', expect: IDX.filterF7, check: () => expect(focusFilterChip).toHaveBeenCalledWith('playlist-source') },
  { name: 'playlist sidebar: / filtre playlist-tracks', w: { page: 'playlist', playlistFocus: 'sidebar' }, key: '/', expect: IDX.filterSlash, check: () => expect(focusFilterChip).toHaveBeenCalledWith('playlist-tracks') },
  { name: 'playlist sidebar: n note', w: { page: 'playlist', playlistFocus: 'sidebar' }, key: 'n', expect: IDX.rateSidebar },
  { name: 'playlist source: n note', w: { page: 'playlist' }, key: 'n', expect: IDX.rateSource },
  { name: 'playlist: Échap = fallback menu (sans Échap dédié — figé)', w: { page: 'playlist' }, key: 'Escape', expect: IDX.menuFallback },
  // ── DUPS — LE SUSPECT MAJEUR (bindings 48-51 enregistrés en DERNIER) ────
  // Dérivation : chaque binding dups est précédé d'un binding sync sans garde
  // page qui matche dans le même monde → shadowed. L'exécution tranche ; si
  // les attentes ci-dessous rougissent, la vérité exécutable les remplace.
  { name: 'SUSPECT — dups: ↓ = nav SYNC (dupsMoveFocus mort)', w: { page: 'dups' }, key: 'ArrowDown', expect: IDX.navDown, check: () => expect(dupsMoveFocus).not.toHaveBeenCalled() },
  { name: 'SUSPECT — dups: ↑ = nav SYNC (dupsMoveFocus mort)', w: { page: 'dups' }, key: 'ArrowUp', expect: IDX.navUp, check: () => expect(dupsMoveFocus).not.toHaveBeenCalled() },
  { name: 'SUSPECT — dups: r = replace SYNC (dupsApplyFocused mort)', w: { page: 'dups' }, key: 'r', expect: IDX.replaceR, check: () => expect(dupsApplyFocused).not.toHaveBeenCalled() },
  { name: 'SUSPECT — dups: Échap = fallback menu (closeDupsMode mort)', w: { page: 'dups' }, key: 'Escape', expect: IDX.menuFallback, check: () => expect(closeDupsMode).not.toHaveBeenCalled() },
  { name: 'dups+audio: Échap stoppe audio', w: { page: 'dups', audio: true }, key: 'Escape', expect: IDX.stopAudio },
];

// Petit alias car la table ci-dessus est longue — garder les nirs lisibles.
const IDx_CTRL_L = IDX.navCtrlL;
void IDx_CTRL_L;

describe('matrice clavier — vérités exécutables (EPIC-031 P0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      win(cell.key, cell.mods);
      cell.check?.();
    });
  }
});

// ── INVARIANTS STRUCTURELS ────────────────────────────────────────────────
describe('matrice clavier — invariants structurels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWorld({});
  });

  const WORLDS: World[] = [
    {},
    { activePanel: 'source' },
    { fi: true },
    { input: true },
    { audio: true },
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
  const MODS = [
    {},
    { ctrl: true },
    { shift: true },
    { alt: true },
  ];
  const KEYS = ['Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Backspace', 'Delete', 'Escape', 'F5', 'F7', '/', 'n', 'r', 'l', 's', 'e'];

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

  it('invariant 2 — bindings toujours-shadowés : EXACTEMENT les 4 bindings dups (48-51)', () => {
    // Un binding est "toujours shadowé" s'il existe un monde où il matche
    // mais un binding antérieur y matche aussi, et ce pour TOUS ses mondes.
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
    // Verdict exécutable du suspect majeur : les 4 bindings dups ne gagnent
    // JAMAIS (shadowés par les bindings sync sans garde page). Si ce set
    // change, c'est qu'un fix P1 (gardes page) ou une régression est passé.
    expect(shadowed).toEqual([IDX.dupsDown, IDX.dupsUp, IDX.dupsR, IDX.dupsEscape]);
  });

  it('invariant 3 — la gate modale isole tout sauf Échap (échantillon de touches)', () => {
    setWorld({ activeModal: 'dialog' });
    for (const key of ['Tab', 'ArrowDown', 'Enter', ' ', 'F5', 'F7', 'r', 'n', 'Backspace']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      expect(dispatchReal(e)).toBe(false);
    }
  });
});
