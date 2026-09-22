// ─── Unit tests: render/sourceTree.ts — tree toggle, render, filter ────────

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

// JSDOM doesn't implement CSS.escape — polyfill it
(globalThis as any).CSS = { escape: (s: string) => s.replace(/[\s"':[\](){}|+~^$*\\#.]/g, '\\$&') };

// ── Hoist spies so vi.mock factories can reference them ───────────────────

const {
  focusItemByElement,
  setActivePanel,
  showContextMenu,
  confirmDialog,
  showError,
  api,
  getActivePlaylistName,
  getPendingTracks,
  dirHasMatchingDescendant,
  makeFileEl,
  startSourceRatingEdit,
  doDragCopy,
  setBatchCopy,
} = vi.hoisted(() => ({
  focusItemByElement: vi.fn(),
  setActivePanel: vi.fn(),
  showContextMenu: vi.fn(),
  confirmDialog: vi.fn((_msg: string, onConfirm: () => void) => {
    onConfirm();
  }),
  showError: vi.fn(),
  api: vi.fn(),
  getActivePlaylistName: vi.fn(() => 'playlist-1'),
  getPendingTracks: vi.fn(() => []),
  dirHasMatchingDescendant: vi.fn(() => false),
  makeFileEl: vi.fn(() => {
    const el = document.createElement('div');
    el.className = 'file-row mocked';
    el.dataset.focuspath = 'mocked';
    return el;
  }),
  startSourceRatingEdit: vi.fn(),
  doDragCopy: vi.fn(),
  setBatchCopy: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────

vi.mock('../focus.js', () => ({ focusItemByElement, setActivePanel }));
vi.mock('../ui.js', () => ({ showContextMenu, confirmDialog, showError }));
vi.mock('../api.js', () => ({ api }));
vi.mock('../playlist.js', () => ({ getActivePlaylistName, getPendingTracks }));
vi.mock('../utils.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../utils.js')>();
  return {
    ...actual,
    dirHasMatchingDescendant, // spy contrôlable ; dirHasMatchingFile reste réel
  };
});
vi.mock('./fileRow.js', () => ({
  makeFileEl,
  makeFileTable: () => {
    const table = document.createElement('table');
    table.className = 'file-table';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    return table;
  },
}));
vi.mock('./ratingEdit.js', () => ({ startSourceRatingEdit }));
vi.mock('./dragDrop.js', () => ({ doDragCopy }));
vi.mock('./batchCopy.js', () => ({ setBatchCopy }));
vi.mock('./cueEditor.js', () => ({ openCueEditor: vi.fn() }));

// ── Import the module under test ──────────────────────────────────────────

import { ensureFilterChip, setFileFilter, setFilterTerm } from './filterChip.js';
import {
  buildSourceTrees,
  renderDirTree,
  renderSource,
  revealSourceDir,
  togglePlaylistSourceDir,
  toggleSourceDir,
} from './sourceTree.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function setupContainer(id = 'source-container'): HTMLElement {
  const c = document.createElement('div');
  c.id = id;
  document.body.appendChild(c);
  return c;
}

/** Build a TreeNode whose keys are directory names and values have __files__. */
function buildTree(dirs: Record<string, Array<{ filename: string }>>): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const [name, files] of Object.entries(dirs)) {
    const node: Record<string, unknown> = {};
    if (files.length > 0) {
      node.__files__ = files.map(f => ({
        filename: f.filename,
        relPath: f.filename,
        year: '2024',
        duration: 180,
        codec: 'MP3',
        baseDir: '/base',
      }));
    }
    tree[name] = node;
  }
  return tree;
}

/** Create a flat dir node with __files__ (used as child of a tree directory). */
function dirNode(files: Array<{ filename: string }> = []): Record<string, unknown> {
  if (files.length === 0) return {};
  return {
    __files__: files.map(f => ({
      filename: f.filename,
      relPath: f.filename,
      year: '2024',
      duration: 180,
      codec: 'MP3',
      baseDir: '/base',
    })),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('render/sourceTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    // Reset mock implementations (clearAllMocks clears history but not mockReturnValue)
    dirHasMatchingDescendant.mockReset();
    // Reset state
    state.sourceExpanded = new Set();
    state.sourceManuallyExpanded = new Set();
    state.sourceNodeMap = new Map();
    state.sourceFiles = {};
    state.filterActive = false;
    state.sourceFilter = '';
    // Fuite connue : setFilterTerm/setFileFilter écrivent state.filters (état
    // module) et certains tests le laissent pollué (« le ON du test précédent
    // fuiterait sinon »). Sans reset, en shuffle, renderSource prend la branche
    // filtrée → 0 dossier rendu → 3-6 échecs selon la graine.
    state.filters = {};
    state.playlistMode = false;
    state.selectedEparsFiles = new Map();
    state.sourceExtraDirs = new Set();
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  // ── toggleSourceDir ─────────────────────────────────────────────────

  describe('toggleSourceDir', () => {
    it('expands a collapsed directory — adds class, appends children, updates state', () => {
      const c = setupContainer();
      // dirNode creates a raw node with __files__ entries (for buildSourceChildren)
      const rawNode = dirNode([{ filename: 'a.mp3' }]);
      state.sourceNodeMap.set('/base/sub', { node: rawNode as any, baseDir: '/base' });

      const dirEl = document.createElement('div');
      dirEl.className = 'directory';
      dirEl.dataset.dirpath = '/base/sub';
      dirEl.dataset.focuspath = '/base/sub';
      c.appendChild(dirEl);

      toggleSourceDir('/base/sub');

      expect(dirEl.classList.contains('expanded')).toBe(true);
      expect(state.sourceExpanded.has('/base/sub')).toBe(true);
      expect(state.sourceManuallyExpanded.has('/base/sub')).toBe(true);
      const children = dirEl.querySelector('.children');
      expect(children).not.toBeNull();
      // makeFileEl was called to render the file
      expect(makeFileEl).toHaveBeenCalled();
      c.remove();
    });

    it('collapses an expanded directory — removes class, removes children, updates state', () => {
      const c = setupContainer();
      const dirEl = document.createElement('div');
      dirEl.className = 'directory expanded';
      dirEl.dataset.dirpath = '/base/sub';
      const children = document.createElement('div');
      children.className = 'children';
      dirEl.appendChild(children);
      c.appendChild(dirEl);

      state.sourceExpanded = new Set(['/base/sub']);
      state.sourceManuallyExpanded = new Set(['/base/sub']);

      toggleSourceDir('/base/sub');

      expect(dirEl.classList.contains('expanded')).toBe(false);
      expect(state.sourceExpanded.has('/base/sub')).toBe(false);
      expect(state.sourceManuallyExpanded.has('/base/sub')).toBe(false);
      expect(dirEl.querySelector('.children')).toBeNull();
      c.remove();
    });

    it('does nothing when directory element does not exist', () => {
      toggleSourceDir('/nonexistent');
      expect(makeFileEl).not.toHaveBeenCalled();
    });

    it('wires the cue editor access on source file rows', () => {
      const c = setupContainer();
      const rawNode = dirNode([{ filename: 'a.mp3' }]);
      state.sourceNodeMap.set('/base/sub', { node: rawNode as any, baseDir: '/base' });

      const dirEl = document.createElement('div');
      dirEl.className = 'directory';
      dirEl.dataset.dirpath = '/base/sub';
      c.appendChild(dirEl);

      toggleSourceDir('/base/sub');

      const args = vi.mocked(makeFileEl).mock.calls[0];
      expect(args[0]).toBe('a.mp3');
      expect(typeof args[9]).toBe('function'); // onCueEditFn
      c.remove();
    });

    it('uses a custom container selector when provided', () => {
      const c = setupContainer('playlist-source-container');
      const dirEl = document.createElement('div');
      dirEl.className = 'directory';
      dirEl.dataset.dirpath = '/base/sub';
      c.appendChild(dirEl);

      toggleSourceDir('/base/sub', '#playlist-source-container');

      expect(dirEl.classList.contains('expanded')).toBe(true);
      c.remove();
    });

    it('togglePlaylistSourceDir delegates to toggleSourceDir with playlist selector', () => {
      const c = setupContainer('playlist-source-container');
      const dirEl = document.createElement('div');
      dirEl.className = 'directory';
      dirEl.dataset.dirpath = '/base/sub';
      c.appendChild(dirEl);

      togglePlaylistSourceDir('/base/sub');

      expect(dirEl.classList.contains('expanded')).toBe(true);
      c.remove();
    });
  });

  // ── revealSourceDir (auto-expansion mémoire post-copie) ─────────────

  describe('revealSourceDir', () => {
    it('déplie le dossier destination après copie (état persisté)', () => {
      const c = setupContainer();
      const rawNode = dirNode([{ filename: 'new.mp3' }]);
      state.sourceNodeMap.set('/base/sub', { node: rawNode as any, baseDir: '/base' });
      const dirEl = document.createElement('div');
      dirEl.className = 'directory';
      dirEl.dataset.dirpath = '/base/sub';
      c.appendChild(dirEl);

      revealSourceDir('/base/sub');

      expect(dirEl.classList.contains('expanded')).toBe(true);
      expect(state.sourceExpanded.has('/base/sub')).toBe(true);
      expect(state.sourceManuallyExpanded.has('/base/sub')).toBe(true);
      expect(dirEl.querySelector('.children')).not.toBeNull();
      c.remove();
    });

    it('dossier déjà déplié → no-op (jamais de repli accidentel)', () => {
      const c = setupContainer();
      const rawNode = dirNode([{ filename: 'a.mp3' }]);
      state.sourceNodeMap.set('/base/sub', { node: rawNode as any, baseDir: '/base' });
      const dirEl = document.createElement('div');
      dirEl.className = 'directory expanded';
      dirEl.dataset.dirpath = '/base/sub';
      dirEl.appendChild(Object.assign(document.createElement('div'), { className: 'children' }));
      c.appendChild(dirEl);

      revealSourceDir('/base/sub');

      expect(dirEl.classList.contains('expanded')).toBe(true);
      expect(dirEl.querySelectorAll('.children').length).toBe(1); // pas de doublon
      c.remove();
    });

    it('dossier absent du DOM → no-op sans erreur', () => {
      expect(() => revealSourceDir('/nowhere')).not.toThrow();
    });

    it('ne vole PAS le focus (focusFirstChild=false) — la sélection reste', async () => {
      // Draine les rAF pendants des tests antérieurs (délaisés ~16 ms) : leurs
      // callbacks focusItemByElement ne doivent pas polluer l'assertion.
      await new Promise(r => setTimeout(r, 25));
      vi.mocked(focusItemByElement).mockClear();
      const c = setupContainer();
      const rawNode = dirNode([{ filename: 'a.mp3' }]);
      state.sourceNodeMap.set('/base/sub', { node: rawNode as any, baseDir: '/base' });
      const dirEl = document.createElement('div');
      dirEl.className = 'directory';
      dirEl.dataset.dirpath = '/base/sub';
      c.appendChild(dirEl);

      revealSourceDir('/base/sub');
      await new Promise(r => setTimeout(r, 30)); // laisse le rAF du toggle s'exécuter

      expect(focusItemByElement).not.toHaveBeenCalled();
      c.remove();
    });
  });

  // ── renderDirTree ───────────────────────────────────────────────────

  describe('renderDirTree', () => {
    it('renders a flat tree with one directory and files', () => {
      const c = setupContainer();
      const node = buildTree({
        Music: [{ filename: 'song1.mp3' }, { filename: 'song2.mp3' }],
      });

      renderDirTree(node as any, c, '/base');

      const dirs = c.querySelectorAll('.directory');
      expect(dirs.length).toBe(1);
      const dir = dirs[0] as HTMLElement;
      expect(dir.dataset.dirpath).toBe('/base/Music');
      expect(dir.dataset.focuspath).toBe('/base/Music');
      expect(dir.classList.contains('expanded')).toBe(false);

      // Click handler triggers onclick and sets sourceNodeMap
      expect(state.sourceNodeMap.has('/base/Music')).toBe(true);

      c.remove();
    });

    it('renders nested directories', () => {
      const c = setupContainer();
      const node: Record<string, unknown> = {
        Music: buildTree({
          Rock: [{ filename: 'riff.mp3' }],
          Jazz: [{ filename: 'swing.mp3' }],
        }),
      };

      renderDirTree(node as any, c, '/base');

      const dirs = c.querySelectorAll('.directory');
      // Only top-level dirs rendered (children not expanded)
      expect(dirs.length).toBe(1);
      expect((dirs[0] as HTMLElement).dataset.dirpath).toBe('/base/Music');

      c.remove();
    });

    it('renders children when a directory is in sourceExpanded', () => {
      const c = setupContainer();
      const node: Record<string, unknown> = {
        Music: buildTree({
          Rock: [{ filename: 'riff.mp3' }],
        }),
      };
      state.sourceExpanded = new Set(['/base/Music']);

      renderDirTree(node as any, c, '/base');

      const dirs = c.querySelectorAll('.directory');
      // Top-level Music + nested Rock
      expect(dirs.length).toBe(2);
      expect((dirs[0] as HTMLElement).dataset.dirpath).toBe('/base/Music');
      expect((dirs[1] as HTMLElement).dataset.dirpath).toBe('/base/Music/Rock');

      c.remove();
    });

    it('sets up onclick, oncontextmenu, ondragover, ondragleave, ondrop handlers', () => {
      const c = setupContainer();
      const node = buildTree({ Dir: [{ filename: 'f.mp3' }] });

      renderDirTree(node as any, c, '/base');

      const dir = c.querySelector('.directory') as HTMLElement;
      expect(typeof dir.onclick).toBe('function');
      expect(typeof dir.oncontextmenu).toBe('function');
      expect(typeof dir.ondragover).toBe('function');
      expect(typeof dir.ondragleave).toBe('function');
      expect(typeof dir.ondrop).toBe('function');

      c.remove();
    });

    it('click handler toggles the directory', () => {
      const c = setupContainer();
      const node = buildTree({ Dir: [] });

      renderDirTree(node as any, c, '/base');
      const dir = c.querySelector('.directory') as HTMLElement;

      // Click expands
      dir.click();
      expect(state.sourceExpanded.has('/base/Dir')).toBe(true);

      c.remove();
    });

    it('displays file count in dir-count span', () => {
      const c = setupContainer();
      const node = buildTree({
        Dir: [{ filename: 'a.mp3' }, { filename: 'b.mp3' }, { filename: 'c.mp3' }],
      });

      renderDirTree(node as any, c, '/base');

      const countSpan = c.querySelector('.dir-count');
      expect(countSpan).not.toBeNull();
      expect(countSpan!.textContent).toBe('(3)');

      c.remove();
    });

    it('does not show dir-count when directory has no files', () => {
      const c = setupContainer();
      const node = buildTree({ Empty: [] });

      renderDirTree(node as any, c, '/base');

      const countSpan = c.querySelector('.dir-count');
      expect(countSpan).toBeNull();

      c.remove();
    });
  });

  // ── renderSource ────────────────────────────────────────────────────

  // ── Dossiers racine créés via ➕ (extra dirs) ────────────────────

  describe('extra dirs (bouton ➕)', () => {
    it('renderSource displays an empty root folder created via ➕, with (vide) badge', () => {
      const c = setupContainer();
      state.sourceFiles = {
        '/base': {
          'song.mp3': { path: 'Music/song.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };
      state.sourceExtraDirs = new Set(['/base/Vide']);

      renderSource();

      const extra = c.querySelector('.directory[data-extra="1"]') as HTMLElement | null;
      expect(extra).not.toBeNull();
      expect(extra!.dataset.dirpath).toBe('/base/Vide');
      expect(extra!.querySelector('.dir-count')?.textContent).toBe('(vide)');
      // focusable comme les autres dossiers (Tab/↑↓)
      expect(extra!.dataset.focuspath).toBe('/base/Vide');
      c.remove();
    });

    it('extra dir that received files via scan is no longer shown as empty', () => {
      const c = setupContainer();
      state.sourceFiles = {
        '/base': {
          'a.mp3': { path: 'Ambient/a.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };
      state.sourceExtraDirs = new Set(['/base/Ambient']);

      renderSource();

      // Rendu comme dossier normal (pas de marqueur extra, pas de badge vide)
      const normal = c.querySelector('.directory[data-dirpath="/base/Ambient"]') as HTMLElement | null;
      expect(normal).not.toBeNull();
      expect(normal!.dataset.extra).toBeUndefined();
      expect(normal!.querySelector('.dir-count')?.textContent).not.toBe('(vide)');
      expect(c.querySelector('.directory[data-extra="1"]')).toBeNull();
      c.remove();
    });

    it('context menu on extra dir offers "Retirer"; confirm calls DELETE /mkdir', async () => {
      const c = setupContainer();
      state.sourceFiles = { '/base': {} };
      state.sourceExtraDirs = new Set(['/base/Temporaire']);
      api.mockResolvedValueOnce({ ok: true }); // DELETE /mkdir
      api.mockResolvedValueOnce([]); // GET /journal

      renderSource();

      const extra = c.querySelector('.directory[data-extra="1"]') as HTMLElement;
      extra.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(showContextMenu).toHaveBeenCalledTimes(1);
      const items = showContextMenu.mock.calls[0][2] as Array<{ label: string; action: () => void }>;
      expect(items.some(i => i.label.includes('Retirer'))).toBe(true);

      // confirmDialog mocké : exécute onConfirm immédiatement
      const item = items.find(i => i.label.includes('Retirer'))!;
      item.action();
      await vi.waitFor(() => {
        expect(api).toHaveBeenCalledWith('/mkdir', expect.objectContaining({ method: 'DELETE' }));
      });
      await vi.waitFor(() => {
        expect(state.sourceExtraDirs.has('/base/Temporaire')).toBe(false);
      });
      c.remove();
    });

    it('extra dir click focuses it without error (no toggle, no children)', () => {
      const c = setupContainer();
      state.sourceFiles = { '/base': {} };
      state.sourceExtraDirs = new Set(['/base/Vide']);

      renderSource();

      const extra = c.querySelector('.directory[data-extra="1"]') as HTMLElement;
      expect(() => extra.click()).not.toThrow();
      expect(focusItemByElement).toHaveBeenCalledWith(c, extra);
      c.remove();
    });
  });

  describe('renderSource', () => {
    it('renders source tree from state.sourceFiles', () => {
      const c = setupContainer();
      state.sourceFiles = {
        '/base': {
          'song.mp3': { path: 'Music/song.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };

      renderSource();

      const dirs = c.querySelectorAll('.directory');
      expect(dirs.length).toBe(1);
      expect((dirs[0] as HTMLElement).dataset.dirpath).toBe('/base/Music');
    });

    it('renders multiple source directories', () => {
      const c = setupContainer();
      state.sourceFiles = {
        '/src1': {
          'a.mp3': { path: 'Pop/a.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
        '/src2': {
          'b.mp3': { path: 'Rock/b.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };

      renderSource();

      const dirs = c.querySelectorAll('.directory');
      expect(dirs.length).toBe(2);
      // First dir from /src1/Pop, second from /src2/Rock
      // Names are sorted: 'Pop' < 'Rock'
      const nameSpan = dirs[0].querySelector('span');
      expect(nameSpan?.textContent).toBe('Pop');
      const nameSpan2 = dirs[1].querySelector('span');
      expect(nameSpan2?.textContent).toBe('Rock');
    });

    it('updates header count with total file count', () => {
      setupContainer();
      const header = document.createElement('span');
      header.id = 'source-header-count';
      document.body.appendChild(header);

      state.sourceFiles = {
        '/base': {
          'a.mp3': { path: 'Music/a.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };

      renderSource();

      expect(header.textContent).toBe('(1)');
      header.remove();
    });

    it('does nothing when source-container is absent', () => {
      state.sourceFiles = {
        '/base': { 'a.mp3': { path: 'a.mp3', year: null, duration: null, codec: null } },
      };
      // No container in DOM
      renderSource();
      // Just shouldn't throw
    });

    it('in filter mode, renders filtered tree and updates chip count', () => {
      setupContainer();

      state.sourceFiles = {
        '/base': {
          'song.mp3': { path: 'Music/song.mp3', year: '2024', duration: 180, codec: 'MP3' },
          // Fichier racine : compté dans le total, jamais rendu dans l'arbre → count 1/2
          'loose.mp3': { path: 'loose.mp3', year: null, duration: null, codec: null },
        },
      };
      setFilterTerm('sync-source', 'Music');
      // Chip présent (scope 'sync-source') pour que updateFilterCount ait une cible
      const list = document.createElement('div');
      document.body.appendChild(list);
      ensureFilterChip(list, { scope: 'sync-source', onChange: () => {} });

      // Make dirHasMatchingDescendant return true for the Music node
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(true);

      renderSource();

      // Filter mode renders directory too
      const dirs = document.querySelectorAll('#source-container .directory');
      expect(dirs.length).toBe(1);
      const countEl = document.querySelector('.filter-chip[data-scope="sync-source"] .filter-count');
      expect(countEl?.textContent).toBe('1/2');
    });

    it('in filter mode shows empty-state message when nothing matches', () => {
      setupContainer();

      state.sourceFiles = {
        '/base': {
          'song.mp3': { path: 'Music/song.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };
      setFilterTerm('sync-source', 'ZZZ');
      const list = document.createElement('div');
      document.body.appendChild(list);
      ensureFilterChip(list, { scope: 'sync-source', onChange: () => {} });
      // dirHasMatchingDescendant returns false by default

      renderSource();

      const empties = document.querySelectorAll('#source-container .panel-empty');
      expect(empties.length).toBe(1);
      expect(empties[0].textContent).toBe('Aucun dossier trouvé pour ce filtre.');
    });

    it('filtre dossiers (défaut) : le dossier auto-étendu rend TOUS ses fichiers (doublon-check)', () => {
      setupContainer();
      state.sourceFiles = {
        '/base': {
          'a1.mp3': { path: 'techno_2020/a1.mp3', year: null, duration: 180, codec: 'MP3' },
          'b1.mp3': { path: 'techno_2020/b1.mp3', year: null, duration: 181, codec: 'MP3' },
        },
      };
      setFilterTerm('sync-source', 'techno'); // mode dossiers seuls (toggle OFF explicite — état partagé entre tests)
      setFileFilter('sync-source', false);
      // Le filtre matche le NOM du dossier (comportement réel de la garde)
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(true);

      renderSource();

      // Auto-étendu, mais fichiers présents (makeFileEl mocké → .file-row mocked)
      const rows = document.querySelectorAll('#source-container .file-row');
      expect(rows.length).toBe(2);
      state.sourceExpanded.clear();
    });

    it('toggle fichiers ON : mêmes données → fichiers filtrés à lauto-expansion', () => {
      setupContainer();
      state.sourceFiles = {
        '/base': {
          'a1.mp3': { path: 'techno_2020/a1.mp3', year: null, duration: 180, codec: 'MP3' },
          'b1.mp3': { path: 'techno_2020/b1.mp3', year: null, duration: 181, codec: 'MP3' },
        },
      };
      setFilterTerm('sync-source', 'techno');
      setFileFilter('sync-source', true);
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(true);

      renderSource();

      // Comportement historique : l'auto-expansion n'affiche pas les fichiers
      // (filtrage par makeFileEl, mocké ici) → table tbody vide
      const rows = document.querySelectorAll('#source-container .file-row');
      expect(rows.length).toBe(0);
      state.sourceExpanded.clear();
    });

    it('toggle fichiers ON : un terme de fichier rend le dossier et auto-étend (recherche fichier)', () => {
      setupContainer();
      state.sourceFiles = {
        '/base': {
          'omen.mp3': { path: 'techno_2020/omen.mp3', year: null, duration: 180, codec: 'MP3' },
          'autre.mp3': { path: 'techno_2020/autre.mp3', year: null, duration: 181, codec: 'MP3' },
        },
      };
      setFilterTerm('sync-source', 'omen');
      setFileFilter('sync-source', true);
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(false); // aucun nom de dossier ne matche

      renderSource();

      // dirHasMatchingFile (réel) trouve omen.mp3 → dossier visible ET auto-étendu
      const dir = document.querySelector<HTMLElement>('#source-container .directory');
      expect(dir).not.toBeNull();
      expect(dir!.classList.contains('expanded')).toBe(true);
      state.sourceExpanded.clear();
    });

    it('mode dossiers (défaut) : un terme de fichier seul ne fait ressortir aucun dossier', () => {
      setupContainer();
      state.sourceFiles = {
        '/base': {
          'omen.mp3': { path: 'techno_2020/omen.mp3', year: null, duration: 180, codec: 'MP3' },
          'autre.mp3': { path: 'techno_2020/autre.mp3', year: null, duration: 181, codec: 'MP3' },
        },
      };
      setFilterTerm('sync-source', 'omen');
      setFileFilter('sync-source', false);
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(false);

      renderSource();

      expect(document.querySelector('#source-container .directory')).toBeNull();
      expect(document.querySelector('#source-container .panel-empty')).not.toBeNull();
      state.sourceExpanded.clear();
    });

    it('expansion manuelle sous filtre dossiers : fichiers rendus (le bug signalé)', () => {
      setupContainer();
      state.sourceFiles = {
        '/base': {
          'a1.mp3': { path: 'techno_2020/a1.mp3', year: null, duration: 180, codec: 'MP3' },
          'b1.mp3': { path: 'techno_2020/b1.mp3', year: null, duration: 181, codec: 'MP3' },
        },
      };
      setFilterTerm('sync-source', 'techno');
      setFileFilter('sync-source', false); // le ON du test précédent fuiterait sinon
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(false); // nom du dossier matche seul

      renderSource();
      const dir = document.querySelector<HTMLElement>('#source-container .directory')!;
      expect(dir.classList.contains('expanded')).toBe(false); // replié : clic requis
      dir.click(); // toggleSourceDir → buildSourceChildren

      const rows = document.querySelectorAll('#source-container .file-row');
      expect(rows.length).toBe(2);
      state.sourceExpanded.clear();
    });
  });

  // ── Directory onclick behavior ──────────────────────────────────────

  describe('directory click behavior', () => {
    it('clicking a directory toggles it and focuses it', () => {
      const c = setupContainer();
      const node = buildTree({ Dir: [{ filename: 'f.mp3' }] });

      renderDirTree(node as any, c, '/base');

      const dir = c.querySelector('.directory') as HTMLElement;
      dir.click();

      // toggleSourceDir was triggered (directory expanded)
      expect(state.sourceExpanded.has('/base/Dir')).toBe(true);
      // focusItemByElement was called with the container and directory element
      expect(focusItemByElement).toHaveBeenCalledWith(c, dir);
      // setActivePanel('source') was called (container is #source-container)
      expect(setActivePanel).toHaveBeenCalledWith('source');
      c.remove();
    });

    it('clicking a directory in playlist-source-container does not set active panel', () => {
      const c = setupContainer('playlist-source-container');
      const node = buildTree({ Dir: [] });

      renderDirTree(node as any, c, '/base', vi.fn());

      const dir = c.querySelector('.directory') as HTMLElement;
      dir.click();

      // focusItemByElement still called
      expect(focusItemByElement).toHaveBeenCalledWith(c, dir);
      // But setActivePanel NOT called (container is playlist-source-container)
      expect(setActivePanel).not.toHaveBeenCalled();
      c.remove();
    });
  });
});

// ── EPIC-046 : le genre suit l'entrée jusqu'au DOM ────────────────────────
// Régression attrapée en live : la cellule Style de Source Data affichait
// « techno_acid ? » (tag vide) pour un fichier dont le cache disait
// `genre: "techno_acid"` — `buildSourceTrees` construisait ses entrées SANS le
// genre, qui se perdait entre l'index et la ligne.
describe('buildSourceTrees — le genre ne se perd pas (EPIC-046)', () => {
  it('chaque entrée de dossier porte le genre lu au scan', () => {
    const { allTrees } = buildSourceTrees({
      '/src/style': {
        'a.mp3': {
          path: 'techno_acid_1990/a.mp3',
          year: '1990',
          duration: 200,
          codec: 'MP3',
          genre: 'techno_acid',
        },
        'b.mp3': { path: 'techno_acid_1990/b.mp3', year: null, duration: null, codec: null, genre: null },
      },
    });
    const node = allTrees[0].tree.techno_acid_1990 as { __files__: Array<{ genre?: string | null }> };
    expect(node.__files__.map(f => f.genre)).toEqual(['techno_acid', null]);
  });
});
