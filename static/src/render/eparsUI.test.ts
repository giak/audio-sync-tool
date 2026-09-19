// ─── Unit tests: render/eparsUI.ts — epars panel rendering + selection ────
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

const { focusItemByElement, setActivePanel, computeStatus, countAllEparsFiles, makeFileEl, startSourceRatingEdit } =
  vi.hoisted(() => ({
    focusItemByElement: vi.fn(),
    setActivePanel: vi.fn(),
    computeStatus: vi.fn(() => 'nouveau' as const),
    countAllEparsFiles: vi.fn(() => 3),
    makeFileEl: vi.fn(() => {
      const el = document.createElement('div');
      el.className = 'file-row mocked';
      const span = document.createElement('span');
      span.className = 'file nouveau';
      span.dataset.filename = 'test.mp3';
      span.dataset.fullpath = '/dir/test.mp3';
      span.dataset.epardir = '/dir';
      span.onclick = vi.fn();
      el.appendChild(span);
      return el;
    }),
    startSourceRatingEdit: vi.fn(),
  }));

vi.mock('../focus.js', () => ({ focusItemByElement, setActivePanel }));
vi.mock('../utils.js', () => ({ computeStatus, countAllEparsFiles }));
const { makeFileTable } = vi.hoisted(() => ({
  makeFileTable: vi.fn(() => {
    const table = document.createElement('table');
    table.className = 'file-table';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    return table;
  }),
}));
vi.mock('./fileRow.js', () => ({ makeFileEl, makeFileTable }));
vi.mock('./ratingEdit.js', () => ({ startSourceRatingEdit }));

import { renderEpars } from './eparsUI.js';

describe('render/eparsUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    state.eparsFiles = {};
    state.sourceFiles = {};
    state.journal = [];
    state.selectedEparsFiles = new Map();
    state.lastSelectedEparsIndex = null;
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  describe('renderEpars', () => {
    it('renders directory and files from state.eparsFiles', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      state.eparsFiles = {
        '/music': {
          'song.mp3': { path: 'song.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };

      renderEpars();

      const dirs = c.querySelectorAll('.directory');
      expect(dirs.length).toBe(1);
      expect(dirs[0].textContent).toBe('music');
      expect(countAllEparsFiles).toHaveBeenCalled();
    });

    it('renders multiple directories', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      state.eparsFiles = {
        '/music': { 'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null } },
        '/videos': { 'b.mp3': { path: 'b.mp3', year: null, duration: null, codec: null } },
      };

      renderEpars();

      const dirs = c.querySelectorAll('.directory');
      expect(dirs.length).toBe(2);
    });

    it('updates header count', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      const header = document.createElement('span');
      header.id = 'epars-header-count';
      document.body.appendChild(header);

      state.eparsFiles = {
        '/music': {
          'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null },
          'b.mp3': { path: 'b.mp3', year: null, duration: null, codec: null },
        },
      };
      countAllEparsFiles.mockReturnValue(2);

      renderEpars();

      expect(header.textContent).toBe('(2)');
    });

    it('updates status line with counts', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      const statusLine = document.createElement('div');
      statusLine.id = 'epars-status-line';
      document.body.appendChild(statusLine);

      state.eparsFiles = {
        '/music': { 'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null } },
      };

      renderEpars();

      expect(statusLine.innerHTML).toContain('traité');
      expect(statusLine.innerHTML).toContain('reste');
      expect(statusLine.innerHTML).toContain('doublon');
    });

    it('does nothing when epars-container is absent', () => {
      renderEpars();
      // Just shouldn't throw
    });

    it('sorts files alphabetically', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      state.eparsFiles = {
        '/music': {
          'z.mp3': { path: 'z.mp3', year: null, duration: null, codec: null },
          'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null },
        },
      };

      // Reset makeFileEl call tracking
      const calls = (makeFileEl as ReturnType<typeof vi.fn>).mock.calls;
      renderEpars();
      // makeFileEl should be called twice with filenames in order
      const filenames = calls.map(c => c[0]);
      expect(filenames).toEqual(['a.mp3', 'z.mp3']);
    });

    it('colonne Style (EPIC-035) : table épars en 7 colonnes + une .style-cell par ligne', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      state.eparsFiles = {
        '/music': {
          'a.mp3': { path: '_techno/a.mp3', year: '1992', duration: null, codec: null },
          'b.mp3': { path: 'b.mp3', year: null, duration: null, codec: null },
        },
      };
      renderEpars();
      expect(makeFileTable).toHaveBeenCalledWith(false, true);
      const cells = c.querySelectorAll('.file-row .style-cell');
      expect(cells.length).toBe(2);
      expect((cells[0] as HTMLElement).dataset.fullpath).toBe('/music/_techno/a.mp3');
    });

    it('le filtre matche le sous-dossier épars (EPIC-035 : F7 _schranz → lot)', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      state.eparsFiles = {
        '/music': {
          'x.mp3': { path: '_schranz/x.mp3', year: null, duration: null, codec: null },
          'y.mp3': { path: '2008_08/y.mp3', year: null, duration: null, codec: null },
        },
      };
      state.filters = { 'sync-epars': '_schranz' };
      countAllEparsFiles.mockReturnValue(2); // explicite : clearAllMocks ne réinitialise pas les implémentations
      try {
        renderEpars();
        const filenames = (makeFileEl as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
        expect(filenames).toEqual(['x.mp3']);
        expect(document.querySelector('.filter-chip[data-scope="sync-epars"] .filter-count')?.textContent).toBe('1/2');
      } finally {
        state.filters = {};
        document.querySelector('#filter-slot-sync-epars')?.remove();
      }
    });
  });
});
