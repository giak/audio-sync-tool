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
vi.mock('../ui.js', () => ({ showContextMenu }));
vi.mock('../playlist.js', () => ({ getActivePlaylistName, getPendingTracks }));
vi.mock('../utils.js', () => ({ dirHasMatchingDescendant }));
vi.mock('./fileRow.js', () => ({ makeFileEl }));
vi.mock('./ratingEdit.js', () => ({ startSourceRatingEdit }));
vi.mock('./dragDrop.js', () => ({ doDragCopy }));
vi.mock('./batchCopy.js', () => ({ setBatchCopy }));
vi.mock('./cueEditor.js', () => ({ openCueEditor: vi.fn() }));

// ── Import the module under test ──────────────────────────────────────────

import { renderDirTree, renderSource, togglePlaylistSourceDir, toggleSourceDir } from './sourceTree.js';

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
    state.playlistMode = false;
    state.selectedEparsFiles = new Map();
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

    it('in filter mode, renders filtered tree and updates filter count', () => {
      setupContainer();

      const filterCount = document.createElement('div');
      filterCount.id = 'source-filter-count';
      document.body.appendChild(filterCount);

      state.sourceFiles = {
        '/base': {
          'song.mp3': { path: 'Music/song.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };
      state.filterActive = true;
      state.sourceFilter = 'Music';

      // Make dirHasMatchingDescendant return true for the Music node
      (dirHasMatchingDescendant as ReturnType<typeof vi.fn>).mockReturnValue(true);

      renderSource();

      // Filter mode renders directory too
      const dirs = document.querySelectorAll('#source-container .directory');
      expect(dirs.length).toBe(1);
      expect(filterCount.textContent).toBe('1 dossier');

      filterCount.remove();
    });

    it('in filter mode shows "Aucun dossier trouvé" when nothing matches', () => {
      setupContainer();

      const filterCount = document.createElement('div');
      filterCount.id = 'source-filter-count';
      document.body.appendChild(filterCount);

      state.sourceFiles = {
        '/base': {
          'song.mp3': { path: 'Music/song.mp3', year: '2024', duration: 180, codec: 'MP3' },
        },
      };
      state.filterActive = true;
      state.sourceFilter = 'ZZZ';
      // dirHasMatchingDescendant returns false by default

      renderSource();

      expect(filterCount.textContent).toBe('Aucun dossier trouvé');
      filterCount.remove();
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
