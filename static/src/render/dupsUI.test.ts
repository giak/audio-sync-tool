// ─── Unit tests: render/dupsUI.ts — vue Doublons (EPIC-028 P2) ────────────
// ui.js est mocké (openModal/closeAllModals) ; focus.js et actions.js aussi.
// jsdom n'a pas scrollIntoView → stub sur Element.prototype (pattern connu).

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { openModal, closeAllModals, revalidateFocus, executeReplace, refreshDupMatches } = vi.hoisted(() => ({
  openModal: vi.fn(),
  closeAllModals: vi.fn(),
  revalidateFocus: vi.fn(),
  executeReplace: vi.fn(),
  refreshDupMatches: vi.fn(),
}));

vi.mock('../ui.js', () => ({ openModal, closeAllModals }));
vi.mock('../focus.js', () => ({ revalidateFocus }));
vi.mock('../actions.js', () => ({ executeReplace, refreshDupMatches }));

import { state } from '../state.js';
import { closeDupsMode, dupsMoveFocus, dupsReplaceFocused, openDupsMode, renderDups } from './dupsUI.js';

const MATCH_A = {
  eparsFullPath: '/epars/aaa.flac',
  sourceFullPath: '/source/rock/aaa.mp3',
  eparsFilename: 'aaa.flac',
  sourceFilename: 'aaa.mp3',
  sim: 0.97,
  delta: 0,
  verdict: 'left-better' as const,
};
const MATCH_B = {
  eparsFullPath: '/epars/bbb.flac',
  sourceFullPath: '/source/rock/bbb.mp3',
  eparsFilename: 'bbb.flac',
  sourceFilename: 'bbb.mp3',
  sim: 0.95,
  delta: 1,
  verdict: 'equal' as const,
};

function setupDom(): void {
  document.body.innerHTML = `
    <div id="main-panels"></div>
    <div id="status-text"></div>
    <div id="dups-layout" class="hidden">
      <h2>↔ Doublons <span id="dups-count"></span></h2>
      <div id="dups-list"></div>
    </div>
  `;
  Element.prototype.scrollIntoView = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDom();
  (state as unknown as { activeModal: string | null }).activeModal = null;
  state.dupMatches = new Map();
});

afterAll(() => {
  document.body.innerHTML = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('dupsUI', () => {
  describe('renderDups', () => {
    it('renders empty message when no matches', () => {
      renderDups();
      expect(document.querySelector('.dups-empty')).not.toBeNull();
      expect(document.getElementById('dups-count')!.textContent).toBe('');
    });

    it('renders one row per match with verdict and score', () => {
      state.dupMatches = new Map([
        ['/epars/aaa.flac', MATCH_A],
        ['/epars/bbb.flac', MATCH_B],
      ]);
      renderDups();

      const rows = document.querySelectorAll('.dup-row');
      expect(rows.length).toBe(2);
      expect(document.getElementById('dups-count')!.textContent).toContain('2');
      expect(rows[0].innerHTML).toContain('aaa.flac');
      expect(rows[0].innerHTML).toContain('aaa.mp3');
      expect(rows[0].innerHTML).toContain('épars gagne');
      expect(rows[1].innerHTML).toContain('qualité équivalente');
      expect(rows[1].innerHTML).toContain('sim 95 %');
    });

    it('escapes HTML in filenames', () => {
      const xss = {
        ...MATCH_A,
        eparsFilename: '<img src=x onerror=alert(1)>.flac',
        eparsFullPath: '/epars/<img src=x onerror=alert(1)>.flac',
      };
      state.dupMatches = new Map([['/epars/x.flac', xss]]);
      renderDups();

      expect(document.querySelector('#dups-list img')).toBeNull();
      expect(document.querySelectorAll('.dup-row').length).toBe(1);
    });
  });

  describe('openDupsMode', () => {
    it('refreshes matches, shows layout and sets activeModal via openModal', () => {
      openDupsMode();

      expect(refreshDupMatches).toHaveBeenCalled();
      expect(openModal).toHaveBeenCalledWith('dups');
      expect(document.getElementById('dups-layout')!.classList.contains('hidden')).toBe(false);
      expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(true);
    });
  });

  describe('closeDupsMode', () => {
    it('hides layout, closes modal state and restores sync focus', () => {
      openDupsMode();
      vi.clearAllMocks();

      closeDupsMode();

      expect(closeAllModals).not.toHaveBeenCalled(); // activeModal était null (mock openModal ne le pose pas)
      expect(document.getElementById('dups-layout')!.classList.contains('hidden')).toBe(true);
      expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(false);
    });

    it('calls closeAllModals when the dups modal is the active one', () => {
      (state as unknown as { activeModal: string | null }).activeModal = 'dups';

      closeDupsMode();

      expect(closeAllModals).toHaveBeenCalled();
    });
  });

  describe('dupsMoveFocus', () => {
    it('moves focus within bounds and paints rows', () => {
      state.dupMatches = new Map([
        ['/epars/aaa.flac', MATCH_A],
        ['/epars/bbb.flac', MATCH_B],
      ]);
      renderDups();

      // Depuis « rien de focusé » (index -1), le premier ↓ sélectionne la 1re ligne
      dupsMoveFocus(1);
      expect(document.querySelector('.dup-row[data-index="0"]')!.classList.contains('focused')).toBe(true);

      dupsMoveFocus(1);
      expect(document.querySelector('.dup-row[data-index="1"]')!.classList.contains('focused')).toBe(true);

      dupsMoveFocus(5); // clamp au dernier
      expect(document.querySelector('.dup-row[data-index="1"]')!.classList.contains('focused')).toBe(true);

      dupsMoveFocus(-1);
      expect(document.querySelector('.dup-row[data-index="0"]')!.classList.contains('focused')).toBe(true);
    });

    it('is a no-op with no matches', () => {
      renderDups();
      dupsMoveFocus(1);
      expect(document.querySelector('.dup-row.focused')).toBeNull();
    });
  });

  describe('dupsReplaceFocused', () => {
    it('calls executeReplace with the focused match path', () => {
      state.dupMatches = new Map([
        ['/epars/aaa.flac', MATCH_A],
        ['/epars/bbb.flac', MATCH_B],
      ]);
      renderDups();
      dupsMoveFocus(1); // → index 0 (première ligne)
      dupsMoveFocus(1); // → index 1

      dupsReplaceFocused();
      expect(executeReplace).toHaveBeenCalledWith('/epars/bbb.flac');
    });

    it('does nothing before any focus move', () => {
      state.dupMatches = new Map([['/epars/aaa.flac', MATCH_A]]);
      // openDupsMode reset focusIndex=-1 (entrée réelle dans la vue) — le test
      // précédent laisse un focusIndex résiduel (variable module-level).
      openDupsMode();

      dupsReplaceFocused();
      expect(executeReplace).not.toHaveBeenCalled();
    });
  });
});
