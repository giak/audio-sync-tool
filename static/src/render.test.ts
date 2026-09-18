// ─── Unit tests for patchSourceFileAfterCopy ─────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './state.js';

// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined') (globalThis as any).CSS = {};
if (!CSS.escape) {
  (CSS as any).escape = (val: string) => String(val).replace(/[^\w-]/g, '\\$&');
}

// Mock all render.ts dependencies BEFORE importing
vi.mock('./utils.js', () => ({
  formatDuration: vi.fn((s: number | null | undefined) => {
    if (!s || s <= 0) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }),
  computeStatus: vi.fn(() => 'doublon' as const),
  countAllEparsFiles: vi.fn(() => 0),
  dirHasMatchingDescendant: vi.fn(() => false),
}));

vi.mock('./audio.js', () => ({
  togglePlay: vi.fn(),
}));

vi.mock('./focus.js', () => ({
  setActivePanel: vi.fn(),
  focusItemByElement: vi.fn(),
  revalidateFocus: vi.fn(),
}));

vi.mock('./ui.js', () => ({
  showContextMenu: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('./batchCopy.js', () => ({
  setBatchCopy: vi.fn(),
}));

vi.mock('./playlist.js', () => ({
  getActivePlaylistName: vi.fn(() => 'test'),
  getPendingTracks: vi.fn(() => [{ fullPath: '/home/Music/Rock/a.mp3' }]),
}));

// Partially mock state.js to spy on on() without breaking state/emit
vi.mock('./state.js', async importOriginal => {
  const mod = await importOriginal();
  return { ...mod, on: vi.fn() };
});

import { setFileFilter, setFilterTerm } from './render/filterChip.js';
import {
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  renderEpars,
  renderJournal,
  renderSource,
  setupRenderSubscriptions,
  togglePlaylistSourceDir,
  toggleSourceDir,
  updatePlaylistLedIndicator,
} from './render.js';
import { on } from './state.js';
import { showContextMenu } from './ui.js';
import { countAllEparsFiles, dirHasMatchingDescendant } from './utils.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function setupSourceDOM(opts: { createDirEl?: boolean; expanded?: boolean; badgeText?: string } = {}): void {
  const { createDirEl = false, expanded = false, badgeText = '' } = opts;
  document.body.innerHTML = `
    <div id="source-container"></div>
    <span id="source-header-count"></span>
    <span id="source-filter-count"></span>
    <span id="epars-header-count"></span>
    <span id="epars-status-line"></span>
    <span id="epars-container"></span>
  `;

  if (createDirEl) {
    const container = document.getElementById('source-container')!;
    const dirEl = document.createElement('div');
    dirEl.className = 'directory';
    dirEl.dataset.dirpath = '/home/Music/Rock';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = 'Rock';
    dirEl.appendChild(nameSpan);
    if (badgeText) {
      const badge = document.createElement('span');
      badge.className = 'dir-count';
      badge.textContent = badgeText;
      dirEl.appendChild(badge);
    }
    if (expanded) {
      const children = document.createElement('div');
      children.className = 'children';
      dirEl.appendChild(children);
    }
    container.appendChild(dirEl);
  }
}

function resetState(): void {
  state.sourceFiles = { '/home/Music': { 'old.mp3': { path: 'Rock/old.mp3' } } };
  state.eparsFiles = {};
  state.journal = [];
  state.filters = {};
  state.sourceExpanded.clear();
  state.sourceNodeMap.clear();
  state.selectedEparsFiles = new Map();
  state.playlistMode = false;
  state.ratings = {};
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('patchSourceFileAfterCopy', () => {
  beforeEach(() => {
    resetState();
  });

  describe('when destDir is visible and expanded', () => {
    beforeEach(() => {
      setupSourceDOM({ createDirEl: true, expanded: true, badgeText: '(3)' });
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: {
          __files__: [
            { filename: 'a.mp3', relPath: 'Rock/a.mp3', year: '2022' },
            { filename: 'b.mp3', relPath: 'Rock/b.mp3', year: '2023' },
            { filename: 'c.mp3', relPath: 'Rock/c.mp3', year: '2024' },
          ],
        },
        baseDir: '/home/Music',
      });
    });

    it('inserts a file row sorted alphabetically', () => {
      const children = document.querySelector('#source-container .children')!;
      ['a.mp3', 'b.mp3', 'c.mp3'].forEach(fn => {
        const row = document.createElement('div');
        row.className = 'file-row';
        const span = document.createElement('span');
        span.className = 'file';
        span.textContent = fn;
        row.appendChild(span);
        children.appendChild(row);
      });

      const result = patchSourceFileAfterCopy('/home/Music/Rock', 'beat.mp3', {
        path: 'Rock/beat.mp3',
        year: '2025',
        duration: 180,
        codec: 'MP3 320kbps',
      });

      expect(result).toBe(true);

      const rows = children.querySelectorAll('.file-row');
      expect(rows.length).toBe(4);

      const labels = [...rows].map(r => r.querySelector('.file')?.textContent);
      expect(labels).toEqual(['a.mp3', 'b.mp3', 'beat.mp3', 'c.mp3']);
    });

    it('creates a file row with correct classes and data', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'x.mp3', {
        path: 'Rock/x.mp3',
        year: '2025',
        duration: 240,
        codec: 'FLAC',
      });

      const rows = document.querySelectorAll('#source-container .file-row');
      const newRow = rows[rows.length - 1] as HTMLElement;
      expect(newRow).not.toBeNull();
      expect(newRow.className).toBe('file-row');
      expect(newRow.dataset.focuspath).toBe('/home/Music/Rock/x.mp3');

      const label = newRow.querySelector('.file')!;
      expect(label.classList.contains('doublon')).toBe(true);
      expect(label.classList.contains('led-doublon')).toBe(true);
      expect(label.textContent).toBe('x.mp3');
      expect((label as HTMLElement).dataset.filename).toBe('x.mp3');
      expect((label as HTMLElement).dataset.fullpath).toBe('/home/Music/Rock/x.mp3');
    });

    it('includes metadata spans when provided', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'meta.mp3', {
        path: 'Rock/meta.mp3',
        year: '2021',
        duration: 195,
        codec: 'MP3 320kbps',
      });

      const rows = [...document.querySelectorAll('#source-container .file-row')];
      const newRow = rows[rows.length - 1] as HTMLElement;
      expect(newRow.querySelector('.year')?.textContent).toBe('2021');
      expect(newRow.querySelector('.codec')?.textContent).toBe('MP3 320kbps');
      expect(newRow.querySelector('.duration')?.textContent).toBe('3:15');
    });

    it('renders empty metadata cells when absent', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'bare.mp3', {
        path: 'Rock/bare.mp3',
        year: null,
        duration: 0,
        codec: '',
      });

      const rows = document.querySelectorAll('#source-container .file-row');
      const newRow = [...rows].find(r => r.querySelector('.file')?.textContent === 'bare.mp3') as HTMLElement;
      expect(newRow.querySelector('.year')?.textContent).toBe('');
      expect(newRow.querySelector('.codec')?.textContent).toBe('');
      expect(newRow.querySelector('.duration')?.textContent).toBe('');
    });

    it('updates the count badge', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'new.mp3', {
        path: 'Rock/new.mp3',
        year: '2025',
        duration: 200,
        codec: 'MP3 320kbps',
      });

      const badge = document.querySelector('#source-container .dir-count');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('(4)');
    });

    it('updates the sourceNodeMap in-memory node', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'mapped.mp3', { path: 'Rock/mapped.mp3', year: '2025' });

      const info = state.sourceNodeMap.get('/home/Music/Rock')!;
      expect(info).not.toBeUndefined();
      expect((info.node as any).__files__.length).toBe(4);
      expect((info.node as any).__files__[3].filename).toBe('mapped.mp3');
    });

    it('creates a count badge when none existed', () => {
      setupSourceDOM({ createDirEl: true, expanded: true });
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: { __files__: [] },
        baseDir: '/home/Music',
      });

      patchSourceFileAfterCopy('/home/Music/Rock', 'first.mp3', { path: 'Rock/first.mp3', year: '2025' });

      const badge = document.querySelector('#source-container .dir-count');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('(1)');
    });
  });

  describe('when destDir is in sourceNodeMap but not in DOM (parent collapsed)', () => {
    beforeEach(() => {
      setupSourceDOM();
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: {
          ACDC: { __files__: [] },
          __files__: [{ filename: 'a.mp3', relPath: 'Rock/a.mp3', year: '2022' }],
        },
        baseDir: '/home/Music',
      });
    });

    it('returns true without touching the DOM', () => {
      const result = patchSourceFileAfterCopy('/home/Music/Rock', 'hidden.mp3', {
        path: 'Rock/hidden.mp3',
        year: '2025',
        duration: 180,
        codec: 'MP3 320kbps',
      });

      expect(result).toBe(true);
      expect(document.querySelector('#source-container .directory')).toBeNull();
      expect(document.querySelector('#source-container .file-row')).toBeNull();
    });

    it('adds the file to the in-memory node', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'phantom.mp3', { path: 'Rock/phantom.mp3', year: '2025' });

      const info = state.sourceNodeMap.get('/home/Music/Rock')!;
      expect((info.node as any).__files__.length).toBe(2);
      expect((info.node as any).__files__[1].filename).toBe('phantom.mp3');
      expect((info.node as any).__files__[1].baseDir).toBe('/home/Music');
    });
  });

  describe('when destDir is deep and parent is collapsed (walk-up needed)', () => {
    beforeEach(() => {
      setupSourceDOM();
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: {
          ACDC: { __files__: [] },
          __files__: [{ filename: 'a.mp3', relPath: 'Rock/a.mp3', year: '2022' }],
        },
        baseDir: '/home/Music',
      });
    });

    it('walks up, traverses down, and returns true', () => {
      const result = patchSourceFileAfterCopy('/home/Music/Rock/ACDC', 'thunder.mp3', {
        path: 'Rock/ACDC/thunder.mp3',
        year: '1990',
        duration: 292,
        codec: 'MP3 320kbps',
      });

      expect(result).toBe(true);
    });

    it('adds the file to the leaf node after traverse-down', () => {
      patchSourceFileAfterCopy('/home/Music/Rock/ACDC', 'thunder.mp3', { path: 'Rock/ACDC/thunder.mp3', year: '1990' });

      const rockInfo = state.sourceNodeMap.get('/home/Music/Rock')!;
      expect((rockInfo.node as any).ACDC.__files__.length).toBe(1);
      expect((rockInfo.node as any).ACDC.__files__[0].filename).toBe('thunder.mp3');
    });

    it('registers intermediate directories in sourceNodeMap', () => {
      patchSourceFileAfterCopy('/home/Music/Rock/ACDC', 'thunder.mp3', { path: 'Rock/ACDC/thunder.mp3', year: '1990' });

      const acdcInfo = state.sourceNodeMap.get('/home/Music/Rock/ACDC')!;
      expect(acdcInfo).not.toBeUndefined();
      expect(acdcInfo.node).toBeDefined();
      expect(acdcInfo.baseDir).toBe('/home/Music');
      expect(acdcInfo.node).toBe(state.sourceNodeMap.get('/home/Music/Rock')!.node.ACDC);
    });

    it('handles multiple missingParts (3+ levels deep)', () => {
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: {
          ACDC: { BackInBlack: { __files__: [] } },
          __files__: [],
        },
        baseDir: '/home/Music',
      });

      const result = patchSourceFileAfterCopy('/home/Music/Rock/ACDC/BackInBlack', 'hib.mp3', {
        path: 'Rock/ACDC/BackInBlack/hib.mp3',
        year: '1980',
      });

      expect(result).toBe(true);
      expect(state.sourceNodeMap.has('/home/Music/Rock/ACDC')).toBe(true);
      expect(state.sourceNodeMap.has('/home/Music/Rock/ACDC/BackInBlack')).toBe(true);

      const leaf = state.sourceNodeMap.get('/home/Music/Rock/ACDC/BackInBlack')!;
      expect((leaf.node as any).__files__.length).toBe(1);
      expect((leaf.node as any).__files__[0].filename).toBe('hib.mp3');
    });

    it('preserves baseDir from the ancestor through all levels', () => {
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: { ACDC: { __files__: [] } },
        baseDir: '/home/Music',
      });

      patchSourceFileAfterCopy('/home/Music/Rock/ACDC', 'base.mp3', { path: 'Rock/ACDC/base.mp3', year: '2025' });

      for (const [, info] of state.sourceNodeMap) {
        expect(info.baseDir).toBe('/home/Music');
      }
    });

    it('inserts file row when deepest path IS in DOM and expanded', () => {
      setupSourceDOM({ createDirEl: true, expanded: true, badgeText: '(1)' });
      const children = document.querySelector('#source-container .children')!;
      const existing = document.createElement('div');
      existing.className = 'file-row';
      const espan = document.createElement('span');
      espan.className = 'file';
      espan.textContent = 'a.mp3';
      existing.appendChild(espan);
      children.appendChild(existing);

      state.sourceNodeMap.set('/home/Music/Rock', {
        node: {
          ACDC: { __files__: [] },
          __files__: [{ filename: 'a.mp3', relPath: 'Rock/a.mp3', year: '2022' }],
        },
        baseDir: '/home/Music',
      });

      patchSourceFileAfterCopy('/home/Music/Rock', 'deep.mp3', {
        path: 'Rock/deep.mp3',
        year: '2025',
        duration: 180,
        codec: 'MP3 320kbps',
      });

      const rows = document.querySelectorAll('#source-container .file-row');
      expect(rows.length).toBe(2);
      expect(rows[1].querySelector('.file')?.textContent).toBe('deep.mp3');
    });
  });

  describe('when no ancestor is found in sourceNodeMap', () => {
    beforeEach(() => {
      setupSourceDOM();
    });

    it('returns false to signal fallback to renderSource()', () => {
      const result = patchSourceFileAfterCopy('/some/unknown/path', 'lost.mp3', { path: 'lost.mp3', year: '2025' });

      expect(result).toBe(false);
      expect(state.sourceNodeMap.size).toBe(0);
    });
  });

  describe('header count update', () => {
    it('updates the source-header-count element', () => {
      setupSourceDOM({ createDirEl: true, expanded: true });
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: { __files__: [] },
        baseDir: '/home/Music',
      });

      patchSourceFileAfterCopy('/home/Music/Rock', 'counted.mp3', { path: 'Rock/counted.mp3', year: '2025' });

      const header = document.getElementById('source-header-count')!;
      expect(header.textContent).toBe('(1)');
    });

    it('handles filter-active header format correctly', () => {
      setupSourceDOM({ createDirEl: true, expanded: true });
      state.sourceNodeMap.set('/home/Music/Rock', {
        node: { __files__: [] },
        baseDir: '/home/Music',
      });
      setFilterTerm('sync-source', 'rock');
      document.getElementById('source-header-count')!.textContent = '(1 / 1)';

      patchSourceFileAfterCopy('/home/Music/Rock', 'filtered.mp3', { path: 'Rock/filtered.mp3', year: '2025' });

      const header = document.getElementById('source-header-count')!;
      expect(header.textContent).toBe('(1 / 1)');
    });
  });
});

describe('patchEparsFileAfterCopy', () => {
  beforeEach(() => {
    resetState();
    // clearAllMocks() garde les implémentations posées par mockReturnValue :
    // un test qui a mis countAllEparsFiles=42 polluerait les suivants (flaky shuffle).
    vi.mocked(countAllEparsFiles).mockReturnValue(0);
  });

  function setupEparsDOM(filename = 'song.mp3', eparDir = '/media/usb', initStatus = 'nouveau'): void {
    document.body.innerHTML = `
      <div id="epars-container">
        <div class="children">
          <div class="file-row" data-focuspath="/media/usb/song.mp3">
            <span class="play-btn">▶</span>
            <span class="file ${initStatus} led-${initStatus}"
              data-filename="${filename}"
              data-epardir="${eparDir}"
              data-fullpath="/media/usb/song.mp3">${filename}</span>
          </div>
        </div>
      </div>
      <span id="epars-header-count">(1)</span>
      <div id="epars-status-line">
        <span class="s-traite">✓ 0 traité</span>
        <span class="s-reste">● 1 reste</span>
        <span class="s-doublon">○ 0 doublon</span>
      </div>
      <span id="source-header-count"></span>
      <span id="source-filter-count"></span>
    `;
    state.eparsFiles[eparDir] = { [filename]: { path: filename, year: '2025', duration: 180, codec: 'MP3 320kbps' } };
    state.sourceFiles = {};
    state.journal = [];
  }

  it('changes status from nouveau to doublon', () => {
    setupEparsDOM('song.mp3', '/media/usb', 'nouveau');
    state.sourceFiles['/home/Music'] = { 'song.mp3': { path: 'Rock/song.mp3' } };

    patchEparsFileAfterCopy('song.mp3', '/media/usb');

    const fileSpan = document.querySelector('#epars-container .file')!;
    expect(fileSpan.classList.contains('doublon')).toBe(true);
    expect(fileSpan.classList.contains('led-doublon')).toBe(true);
    expect(fileSpan.classList.contains('nouveau')).toBe(false);
    expect(fileSpan.classList.contains('led-nouveau')).toBe(false);
  });

  it('removes onclick handler when no longer nouveau', () => {
    setupEparsDOM('song.mp3', '/media/usb', 'nouveau');
    const fileSpan = document.querySelector('#epars-container .file') as HTMLElement;
    fileSpan.onclick = () => {};
    state.sourceFiles['/home/Music'] = { 'song.mp3': { path: 'Rock/song.mp3' } };

    patchEparsFileAfterCopy('song.mp3', '/media/usb');

    expect(fileSpan.onclick).toBeNull();
  });

  it('does nothing when file is not found in DOM', () => {
    setupEparsDOM('song.mp3', '/media/usb', 'nouveau');
    expect(() => patchEparsFileAfterCopy('nonexistent.mp3', '/media/usb')).not.toThrow();
  });

  describe('status counters with multiple files', () => {
    function setupMultiFileDOM(): void {
      document.body.innerHTML = `
        <div id="epars-container">
          <div class="children">
            <div class="file-row" data-focuspath="/media/usb/a.mp3">
              <span class="play-btn">▶</span>
              <span class="file nouveau led-nouveau"
                data-filename="a.mp3"
                data-epardir="/media/usb"
                data-fullpath="/media/usb/a.mp3">a.mp3</span>
            </div>
            <div class="file-row" data-focuspath="/media/usb/b.mp3">
              <span class="play-btn">▶</span>
              <span class="file nouveau led-nouveau"
                data-filename="b.mp3"
                data-epardir="/media/usb"
                data-fullpath="/media/usb/b.mp3">b.mp3</span>
            </div>
            <div class="file-row" data-focuspath="/media/usb/c.mp3">
              <span class="play-btn">▶</span>
              <span class="file doublon led-doublon"
                data-filename="c.mp3"
                data-epardir="/media/usb"
                data-fullpath="/media/usb/c.mp3">c.mp3</span>
            </div>
            <div class="file-row" data-focuspath="/media/usb/d.mp3">
              <span class="play-btn">▶</span>
              <span class="file traite led-traite"
                data-filename="d.mp3"
                data-epardir="/media/usb"
                data-fullpath="/media/usb/d.mp3">d.mp3</span>
            </div>
          </div>
        </div>
        <span id="epars-header-count">(4)</span>
        <div id="epars-status-line">
          <span class="s-traite">✓ 1 traité</span>
          <span class="s-reste">● 2 reste</span>
          <span class="s-doublon">○ 1 doublon</span>
        </div>
        <span id="source-header-count"></span>
        <span id="source-filter-count"></span>
      `;
      state.eparsFiles['/media/usb'] = {
        'a.mp3': { path: 'a.mp3', year: '2025', duration: 180, codec: 'MP3 320kbps' },
        'b.mp3': { path: 'b.mp3', year: '2025', duration: 180, codec: 'MP3 320kbps' },
        'c.mp3': { path: 'c.mp3', year: '2025', duration: 180, codec: 'MP3 320kbps' },
        'd.mp3': { path: 'd.mp3', year: '2025', duration: 180, codec: 'MP3 320kbps' },
      };
      state.sourceFiles = {};
      state.journal = [];
    }

    it('updates counters when a nouveau file becomes doublon', () => {
      setupMultiFileDOM();

      patchEparsFileAfterCopy('b.mp3', '/media/usb');

      const statusLine = document.getElementById('epars-status-line')!;
      expect(statusLine.textContent).toContain('1 reste');
      expect(statusLine.textContent).toContain('2 doublon');
      expect(statusLine.textContent).toContain('1 traité');
    });

    it('updates counters when a doublon file changes (stays doublon)', () => {
      setupMultiFileDOM();

      patchEparsFileAfterCopy('c.mp3', '/media/usb');

      const statusLine = document.getElementById('epars-status-line')!;
      expect(statusLine.textContent).toContain('2 reste');
      expect(statusLine.textContent).toContain('1 doublon');
      expect(statusLine.textContent).toContain('1 traité');
    });

    it('counts only files inside #epars-container', () => {
      setupMultiFileDOM();
      document.body.insertAdjacentHTML(
        'beforeend',
        '<span class="file nouveau led-nouveau" id="stray">stray.mp3</span>',
      );

      patchEparsFileAfterCopy('b.mp3', '/media/usb');

      const statusLine = document.getElementById('epars-status-line')!;
      expect(statusLine.textContent).toContain('1 reste');
      expect(statusLine.textContent).toContain('2 doublon');
      expect(statusLine.textContent).toContain('1 traité');
    });
  });

  describe('header count update', () => {
    it('updates epars-header-count from state.eparsFiles', () => {
      setupEparsDOM('song.mp3', '/media/usb', 'nouveau');
      state.sourceFiles['/home/Music'] = { 'song.mp3': { path: 'Rock/song.mp3' } };
      vi.mocked(countAllEparsFiles).mockReturnValue(42);

      patchEparsFileAfterCopy('song.mp3', '/media/usb');

      expect(document.getElementById('epars-header-count')!.textContent).toBe('(42)');
    });

    it('sets empty header when no files remain', () => {
      setupEparsDOM('song.mp3', '/media/usb', 'nouveau');
      state.sourceFiles['/home/Music'] = { 'song.mp3': { path: 'Rock/song.mp3' } };
      vi.mocked(countAllEparsFiles).mockReturnValue(0);

      patchEparsFileAfterCopy('song.mp3', '/media/usb');

      expect(document.getElementById('epars-header-count')!.textContent).toBe('');
    });
  });
});

describe('toggleSourceDir', () => {
  beforeEach(() => {
    resetState();
  });

  function setupToggleDOM(opts: { initExpanded?: boolean } = {}): void {
    const { initExpanded = false } = opts;
    document.body.innerHTML = `
      <div id="source-container"></div>
      <span id="source-header-count">(5)</span>
      <span id="source-filter-count"></span>
      <span id="epars-header-count"></span>
      <span id="epars-status-line"></span>
      <span id="epars-container"></span>
    `;

    const container = document.getElementById('source-container')!;
    const dirEl = document.createElement('div');
    dirEl.className = `directory${initExpanded ? ' expanded' : ''}`;
    dirEl.dataset.dirpath = '/home/Music/Rock';
    dirEl.dataset.focuspath = '/home/Music/Rock';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = 'Rock';
    dirEl.appendChild(nameSpan);
    const badge = document.createElement('span');
    badge.className = 'dir-count';
    badge.textContent = '(3)';
    dirEl.appendChild(badge);

    if (initExpanded) {
      const children = document.createElement('div');
      children.className = 'children';
      dirEl.appendChild(children);
      state.sourceExpanded.add('/home/Music/Rock');
    }

    container.appendChild(dirEl);

    state.sourceNodeMap.set('/home/Music/Rock', {
      node: {
        ACDC: { __files__: [] },
        Jazz: {
          __files__: [
            { filename: 'cool.mp3', relPath: 'Rock/Jazz/cool.mp3', year: '2024', duration: 300, codec: 'FLAC' },
          ],
        },
        __files__: [
          { filename: 'a.mp3', relPath: 'Rock/a.mp3', year: '2022' },
          { filename: 'b.mp3', relPath: 'Rock/b.mp3', year: '2023' },
          { filename: 'c.mp3', relPath: 'Rock/c.mp3', year: '2024' },
        ],
      },
      baseDir: '/home/Music',
    });
  }

  describe('expand', () => {
    it('adds dirPath to sourceExpanded set', () => {
      setupToggleDOM();
      expect(state.sourceExpanded.has('/home/Music/Rock')).toBe(false);

      toggleSourceDir('/home/Music/Rock');

      expect(state.sourceExpanded.has('/home/Music/Rock')).toBe(true);
    });

    it('adds expanded class to the directory element', () => {
      setupToggleDOM();
      toggleSourceDir('/home/Music/Rock');

      const dirEl = document.querySelector('#source-container .directory')!;
      expect(dirEl.classList.contains('expanded')).toBe(true);
    });

    it('appends a .children div to the directory', () => {
      setupToggleDOM();
      toggleSourceDir('/home/Music/Rock');

      const dirEl = document.querySelector('#source-container .directory')!;
      const children = dirEl.querySelector('.children');
      expect(children).not.toBeNull();
      expect(children!.className).toBe('children');
    });

    it('builds sub-directories inside the children div', () => {
      setupToggleDOM();
      toggleSourceDir('/home/Music/Rock');

      const children = document.querySelector('#source-container .children')!;
      const subDirs = children.querySelectorAll('.directory');
      expect(subDirs.length).toBe(2);

      const names = [...subDirs].map(d => d.querySelector('span')?.textContent);
      expect(names).toContain('ACDC');
      expect(names).toContain('Jazz');
    });

    it('builds file rows inside the children div', () => {
      setupToggleDOM();
      toggleSourceDir('/home/Music/Rock');

      const children = document.querySelector('#source-container .children')!;
      const fileRows = children.querySelectorAll('.file-row');
      expect(fileRows.length).toBe(3);

      const labels = [...fileRows].map(r => r.querySelector('.file')?.textContent).sort();
      expect(labels).toEqual(['a.mp3', 'b.mp3', 'c.mp3']);
    });

    it('adds count badges to sub-directories that have files', () => {
      setupToggleDOM();
      toggleSourceDir('/home/Music/Rock');

      const subDirs = document.querySelectorAll('#source-container .children > .directory');
      const acdc = [...subDirs].find(d => d.querySelector('span')?.textContent === 'ACDC')!;
      const jazz = [...subDirs].find(d => d.querySelector('span')?.textContent === 'Jazz')!;

      expect(acdc.querySelector('.dir-count')).toBeNull();
      expect(jazz.querySelector('.dir-count')?.textContent).toBe('(1)');
    });

    it('does nothing when sourceNodeMap has no entry for dirPath', () => {
      setupToggleDOM();
      state.sourceNodeMap.delete('/home/Music/Rock');

      toggleSourceDir('/home/Music/Rock');

      const dirEl = document.querySelector('#source-container .directory')!;
      expect(dirEl.classList.contains('expanded')).toBe(true);
      expect(dirEl.querySelector('.children')).toBeNull();
    });

    it('filtre dossiers (défaut) : expansion rend TOUS les fichiers (consultation possible)', () => {
      setupToggleDOM();
      setFilterTerm('sync-source', 'rock');
      setFileFilter('sync-source', false);

      toggleSourceDir('/home/Music/Rock');

      const children = document.querySelector('#source-container .children')!;
      const subDirs = children.querySelectorAll('.directory');
      expect(subDirs.length).toBe(2);
      const fileRows = children.querySelectorAll('.file-row');
      expect(fileRows.length).toBe(3);
    });

    it('toggle fichiers ON : expansion masque les fichiers non matchés (comportement historique)', () => {
      setupToggleDOM();
      setFilterTerm('sync-source', 'rock');
      setFileFilter('sync-source', true);

      toggleSourceDir('/home/Music/Rock');

      const children = document.querySelector('#source-container .children')!;
      const fileRows = children.querySelectorAll('.file-row');
      expect(fileRows.length).toBe(0);
    });
  });

  describe('collapse', () => {
    it('removes dirPath from sourceExpanded set', () => {
      setupToggleDOM({ initExpanded: true });
      expect(state.sourceExpanded.has('/home/Music/Rock')).toBe(true);

      toggleSourceDir('/home/Music/Rock');

      expect(state.sourceExpanded.has('/home/Music/Rock')).toBe(false);
    });

    it('removes expanded class from the directory element', () => {
      setupToggleDOM({ initExpanded: true });
      toggleSourceDir('/home/Music/Rock');

      const dirEl = document.querySelector('#source-container .directory')!;
      expect(dirEl.classList.contains('expanded')).toBe(false);
    });

    it('removes the .children div from the DOM', () => {
      setupToggleDOM({ initExpanded: true });
      expect(document.querySelector('#source-container .children')).not.toBeNull();

      toggleSourceDir('/home/Music/Rock');

      expect(document.querySelector('#source-container .children')).toBeNull();
    });
  });

  describe('when dirPath is not in DOM', () => {
    it('returns early without errors', () => {
      setupToggleDOM();

      expect(() => toggleSourceDir('/nonexistent/path')).not.toThrow();
      expect(state.sourceExpanded.has('/nonexistent/path')).toBe(false);
    });
  });

  describe('idempotence', () => {
    it('expanding an already expanded dir collapses it', () => {
      setupToggleDOM({ initExpanded: true });
      toggleSourceDir('/home/Music/Rock');
      expect(state.sourceExpanded.has('/home/Music/Rock')).toBe(false);
      expect(document.querySelector('#source-container .children')).toBeNull();

      toggleSourceDir('/home/Music/Rock');
      expect(state.sourceExpanded.has('/home/Music/Rock')).toBe(true);
      expect(document.querySelector('#source-container .children')).not.toBeNull();
    });
  });

  describe('updateSourceHeaderCount (filter term set)', () => {
    beforeEach(() => {
      // Re-use setupToggleDOM but activate filter
      setupToggleDOM({ initExpanded: true });
      setFilterTerm('sync-source', 'rock');
    });

    it('updates filter count to "N dossier(s)" after toggle', () => {
      toggleSourceDir('/home/Music/Rock');
      const filterCount = document.getElementById('source-filter-count')!;
      expect(filterCount.textContent).toMatch(/\d+ dossier/);
    });

    it('updates the element even when no filter term (legacy element kept)', () => {
      setFilterTerm('sync-source', '');
      toggleSourceDir('/home/Music/Rock');

      const filterCount = document.getElementById('source-filter-count')!;
      expect(filterCount.textContent).toMatch(/\d+ dossier/);
    });
  });
});

describe('togglePlaylistSourceDir', () => {
  beforeEach(() => {
    resetState();
  });

  function setupPlaylistSourceDOM(): void {
    document.body.innerHTML = `
      <div id="playlist-source-container">
        <div class="directory" data-dirpath="/home/Music/Rock" data-focuspath="/home/Music/Rock">
          <span>Rock</span>
        </div>
      </div>
      <span id="source-header-count"></span>
      <span id="source-filter-count"></span>
    `;

    state.sourceNodeMap.set('/home/Music/Rock', {
      node: {
        __files__: [{ filename: 'a.mp3', relPath: 'Rock/a.mp3', year: '2022' }],
      },
      baseDir: '/home/Music',
    });
  }

  it('expands a directory inside #playlist-source-container', () => {
    setupPlaylistSourceDOM();

    togglePlaylistSourceDir('/home/Music/Rock');

    const dirEl = document.querySelector('#playlist-source-container .directory')!;
    expect(dirEl.classList.contains('expanded')).toBe(true);
    expect(dirEl.querySelector('.children')).not.toBeNull();
  });

  it('collapses an already expanded directory', () => {
    setupPlaylistSourceDOM();
    togglePlaylistSourceDir('/home/Music/Rock');
    togglePlaylistSourceDir('/home/Music/Rock');

    const dirEl = document.querySelector('#playlist-source-container .directory')!;
    expect(dirEl.classList.contains('expanded')).toBe(false);
    expect(dirEl.querySelector('.children')).toBeNull();
  });

  it('does nothing for nonexistent directory', () => {
    setupPlaylistSourceDOM();

    expect(() => togglePlaylistSourceDir('/nonexistent/path')).not.toThrow();
  });
});

describe('buildSourceChildren (playlist mode)', () => {
  beforeEach(() => {
    resetState();
  });

  function setupPlaylistModeDOM(): void {
    document.body.innerHTML = `
      <div id="source-container"></div>
      <span id="source-header-count"></span>
      <span id="source-filter-count"></span>
      <span id="epars-header-count"></span>
      <span id="epars-status-line"></span>
      <span id="epars-container"></span>
    `;
  }

  it('adds in-playlist class to files in the active playlist', () => {
    setupPlaylistModeDOM();
    state.sourceFiles['/home/Music'] = { 'a.mp3': { path: 'Rock/a.mp3' } };
    state.playlistMode = true;

    // renderSource creates the directory element with all event handlers
    renderSource();
    // Now expand it to trigger buildSourceChildren
    toggleSourceDir('/home/Music/Rock');

    const label = document.querySelector('#source-container .file')!;
    expect(label.classList.contains('in-playlist')).toBe(true);
  });

  it('does not add in-playlist for files not in the playlist', () => {
    setupPlaylistModeDOM();
    state.sourceFiles['/home/Music'] = { 'a.mp3': { path: 'Rock/a.mp3' } };
    state.playlistMode = false;

    renderSource();
    toggleSourceDir('/home/Music/Rock');

    const label = document.querySelector('#source-container .file')!;
    expect(label.classList.contains('in-playlist')).toBe(false);
  });
});

describe('showDirContextMenu (right-click on directory)', () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  function setupRenderSourceDir(): HTMLElement {
    document.body.innerHTML = `
      <div id="source-container"></div>
      <span id="source-header-count"></span>
      <span id="source-filter-count"></span>
      <span id="epars-header-count"></span>
      <span id="epars-status-line"></span>
      <span id="epars-container"></span>
    `;
    state.sourceFiles['/home/Music'] = { 'a.mp3': { path: 'Rock/a.mp3' } };
    // renderSource creates directory DOM with all event handlers (oncontextmenu etc.)
    renderSource();
    return document.querySelector('.directory') as HTMLElement;
  }

  it('shows "Déplier" option when directory is collapsed', () => {
    const dirEl = setupRenderSourceDir();

    const event = new MouseEvent('contextmenu', { clientX: 100, clientY: 200, bubbles: true });
    dirEl.dispatchEvent(event);

    expect(showContextMenu).toHaveBeenCalledWith(
      100,
      200,
      expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Déplier') })]),
    );
  });

  it('shows "Refermer" option when directory is expanded', () => {
    const dirEl = setupRenderSourceDir();
    state.sourceExpanded.add('/home/Music/Rock');
    document.querySelector('.directory')!.classList.add('expanded');

    const event = new MouseEvent('contextmenu', { clientX: 50, clientY: 80, bubbles: true });
    dirEl.dispatchEvent(event);

    expect(showContextMenu).toHaveBeenCalledWith(
      50,
      80,
      expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Refermer') })]),
    );
  });

  it('shows batch copy option when files are selected', () => {
    setupRenderSourceDir();
    state.selectedEparsFiles = new Map([
      ['/media/usb/song.mp3', { filename: 'song.mp3', eparDir: '/media/usb', fullpath: '/media/usb/song.mp3' }],
      ['/media/usb/track.mp3', { filename: 'track.mp3', eparDir: '/media/usb', fullpath: '/media/usb/track.mp3' }],
    ]);

    const dirEl = document.querySelector('.directory') as HTMLElement;
    const event = new MouseEvent('contextmenu', { clientX: 30, clientY: 40, bubbles: true });
    dirEl.dispatchEvent(event);

    expect(showContextMenu).toHaveBeenCalledWith(
      30,
      40,
      expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Copier 2 fichiers ici') })]),
    );
  });

  it('does not show batch copy when no files are selected', () => {
    setupRenderSourceDir();
    state.selectedEparsFiles = new Map();

    const dirEl = document.querySelector('.directory') as HTMLElement;
    const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true });
    dirEl.dispatchEvent(event);

    expect(showContextMenu).toHaveBeenCalled();
    const items = vi.mocked(showContextMenu).mock.calls[0][2] as Array<{ label: string }>;
    const copyItems = items.filter(item => item.label.includes('Copier'));
    expect(copyItems.length).toBe(0);
  });

  it('shows singular "1 fichier" when one file selected', () => {
    setupRenderSourceDir();
    state.selectedEparsFiles = new Map([
      ['/media/usb/song.mp3', { filename: 'song.mp3', eparDir: '/media/usb', fullpath: '/media/usb/song.mp3' }],
    ]);

    const dirEl = document.querySelector('.directory') as HTMLElement;
    const event = new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true });
    dirEl.dispatchEvent(event);

    const items = vi.mocked(showContextMenu).mock.lastCall![2] as Array<{ label: string }>;
    const copyItem = items.find(item => item.label.includes('Copier'));
    expect(copyItem).toBeDefined();
    expect(copyItem!.label).toContain('1 fichier ici');
    expect(copyItem!.label).not.toContain('s'); // no plural 's'
  });
});

describe('renderJournal', () => {
  function setupJournalDOM(): void {
    document.body.innerHTML = '<div id="journal-content"></div>';
  }

  it('shows placeholder when journal is empty', () => {
    setupJournalDOM();
    state.journal = [];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.textContent).toContain('Aucune opération enregistrée');
  });

  it('shows placeholder when journal is null', () => {
    setupJournalDOM();
    state.journal = null as any;

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.textContent).toContain('Aucune opération enregistrée');
  });

  it('renders copied entry with 📋 icon, timestamp, filename and destination', () => {
    setupJournalDOM();
    state.journal = [
      {
        timestamp: '2025-06-22T14:30:00.000Z',
        status: 'copied',
        filename: 'song.mp3',
        destination: '/home/music/Rock/song.mp3',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.innerHTML).toContain('📋');
    expect(content.innerHTML).toContain('song.mp3');
    expect(content.innerHTML).toContain('/home/music/Rock/song.mp3');
    expect(content.querySelector('.copied')).not.toBeNull();
    expect(content.textContent).toContain('2025-06-22 14:30:00');
  });

  it('renders scan entry with 🔍 icon, action and details', () => {
    setupJournalDOM();
    state.journal = [
      {
        timestamp: '2025-06-22T10:00:00.000Z',
        status: 'scan',
        action: 'Scan terminé',
        details: '42 fichiers source, 15 épars (3 dossiers)',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.innerHTML).toContain('🔍');
    expect(content.innerHTML).toContain('Scan terminé');
    expect(content.innerHTML).toContain('42 fichiers source, 15 épars (3 dossiers)');
    expect(content.querySelector('.scanned')).not.toBeNull();
  });

  it('renders config entry with ⚙️ icon, action and details', () => {
    setupJournalDOM();
    state.journal = [
      {
        timestamp: '2025-06-22T09:00:00.000Z',
        status: 'config',
        action: 'Config sauvegardée',
        details: 'Profil : Ma config',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.innerHTML).toContain('⚙️');
    expect(content.innerHTML).toContain('Config sauvegardée');
    expect(content.innerHTML).toContain('Profil : Ma config');
    expect(content.querySelector('.configured')).not.toBeNull();
  });

  it('renders unknown status as error entry', () => {
    setupJournalDOM();
    state.journal = [
      {
        timestamp: '2025-06-22T08:00:00.000Z',
        status: 'unknown',
        action: 'Something happened',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.querySelector('.error')).not.toBeNull();
    expect(content.textContent).toContain('Something happened');
  });

  it('falls back to filename when status unknown and no action', () => {
    setupJournalDOM();
    state.journal = [
      {
        timestamp: '2025-06-22T08:00:00.000Z',
        status: 'unknown',
        filename: 'fallback.mp3',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.textContent).toContain('fallback.mp3');
  });

  it('falls back to ? when no action, no filename', () => {
    setupJournalDOM();
    state.journal = [
      {
        timestamp: '2025-06-22T08:00:00.000Z',
        status: 'unknown',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.textContent).toContain('?');
  });

  it('displays entries in reverse chronological order', () => {
    setupJournalDOM();
    state.journal = [
      { timestamp: '2025-06-21T12:00:00.000Z', status: 'scan', action: 'First scan', details: '' },
      {
        timestamp: '2025-06-22T14:00:00.000Z',
        status: 'copied',
        filename: 'second.mp3',
        destination: '/dst/second.mp3',
      },
      { timestamp: '2025-06-22T15:00:00.000Z', status: 'copied', filename: 'third.mp3', destination: '/dst/third.mp3' },
    ] as any[];

    renderJournal();

    const entries = document.querySelectorAll('#journal-content > div');
    expect(entries.length).toBe(3);
    expect(entries[0].textContent).toContain('third.mp3');
    expect(entries[1].textContent).toContain('second.mp3');
    expect(entries[2].textContent).toContain('First scan');
  });

  it('handles missing timestamp gracefully', () => {
    setupJournalDOM();
    state.journal = [
      {
        status: 'copied',
        filename: 'notime.mp3',
        destination: '/dst/notime.mp3',
      } as any,
    ];

    renderJournal();

    const content = document.getElementById('journal-content')!;
    expect(content.textContent).toContain('notime.mp3');
  });
});

describe('renderEpars', () => {
  function setupRenderEparsDOM(): void {
    document.body.innerHTML = `
      <div id="epars-container"></div>
      <span id="epars-header-count"></span>
      <div id="epars-status-line"></div>
    `;
  }

  beforeEach(() => {
    setupRenderEparsDOM();
    state.eparsFiles = {};
    state.sourceFiles = {};
    state.journal = [];
    vi.clearAllMocks();
    // Restauration du défaut (clearAllMocks garde les implémentations posées) :
    // « countAllEparsFiles=42 » posé par patchEparsFileAfterCopy ne doit pas fuiter
    // dans le header count de renderEpars (flaky shuffle).
    vi.mocked(countAllEparsFiles).mockReturnValue(0);
  });

  it("affiche le bandeau d'état vide quand aucun dossier épars (EPIC-014)", () => {
    renderEpars();
    const empty = document.getElementById('epars-container')!.querySelector('.panel-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('Aucun dossier épars');
    expect(document.getElementById('epars-header-count')!.textContent).toBe('');
  });

  it('renders a directory for each epars dir', () => {
    state.eparsFiles['/media/usb'] = { 'a.mp3': { path: 'a.mp3' } };
    renderEpars();

    const dirs = document.querySelectorAll('#epars-container > .directory');
    expect(dirs.length).toBe(1);
    expect(dirs[0].textContent).toContain('usb');
  });

  it('renders file rows with status badges', () => {
    state.eparsFiles['/media/usb'] = { 'track.mp3': { path: 'track.mp3', year: '2024', duration: 200, codec: 'MP3' } };
    renderEpars();

    const fileRows = document.querySelectorAll('.file-row');
    expect(fileRows.length).toBe(1);
    const fileSpan = fileRows[0].querySelector('.file') as HTMLElement;
    expect(fileSpan.textContent).toBe('track.mp3');
    expect(fileSpan.dataset.filename).toBe('track.mp3');
    expect(fileSpan.dataset.epardir).toBe('/media/usb');
  });

  it('includes metadata spans when present', () => {
    state.eparsFiles['/media/usb'] = { 'meta.mp3': { path: 'meta.mp3', year: '2021', duration: 195, codec: 'FLAC' } };
    renderEpars();

    const row = document.querySelector('.file-row')!;
    expect(row.querySelector('.year')?.textContent).toBe('2021');
    expect(row.querySelector('.codec')?.textContent).toBe('FLAC');
    expect(row.querySelector('.duration')?.textContent).toBe('3:15');
  });

  it('renders status line with file counts', () => {
    state.eparsFiles['/usb'] = { 'a.mp3': { path: 'a.mp3' } };
    renderEpars();

    const statusLine = document.getElementById('epars-status-line')!;
    expect(statusLine.textContent).toContain('1 doublon');
  });
});

describe('renderSource', () => {
  function setupRenderSourceDOM(): void {
    document.body.innerHTML = `
      <div id="source-container"></div>
      <span id="source-header-count"></span>
      <span id="source-filter-count"></span>
      <span id="epars-header-count"></span>
      <span id="epars-status-line"></span>
      <span id="epars-container"></span>
    `;
  }

  beforeEach(() => {
    setupRenderSourceDOM();
    state.sourceFiles = {};
    state.filters = {};
    state.sourceExpanded.clear();
    state.sourceNodeMap.clear();
    vi.clearAllMocks();
    // Restauration des implémentations par défaut (clearAllMocks ne les retire pas) :
    // « dirHasMatchingDescendant → true » posé par un test doit être remis à false
    // sinon il fuit dans renderFilteredSource des tests suivants (flaky shuffle).
    vi.mocked(dirHasMatchingDescendant).mockReturnValue(false);
  });

  it("affiche le bandeau d'état vide quand aucun dossier source (EPIC-014)", () => {
    renderSource();
    const empty = document.getElementById('source-container')!.querySelector('.panel-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('Aucun dossier');
  });

  it('renders directories for source data tree', () => {
    state.sourceFiles['/home/Music'] = { 'a.mp3': { path: 'Rock/a.mp3' } };
    renderSource();

    const dirs = document.querySelectorAll('#source-container > .directory');
    expect(dirs.length).toBe(1);
    expect((dirs[0] as HTMLElement).dataset.dirpath).toBe('/home/Music/Rock');
  });

  it('does not show files for collapsed directories', () => {
    state.sourceFiles['/home/Music'] = { 'a.mp3': { path: 'Rock/a.mp3' } };
    renderSource();

    const fileRows = document.querySelectorAll('.file-row');
    expect(fileRows.length).toBe(0);
  });

  it('shows count badge with total files per directory', () => {
    state.sourceFiles['/home/Music'] = {
      'a.mp3': { path: 'Rock/a.mp3' },
      'b.mp3': { path: 'Rock/b.mp3' },
    };
    renderSource();

    const badge = document.querySelector('.dir-count');
    expect(badge?.textContent).toBe('(2)');
  });

  it('header count shows total file count', () => {
    state.sourceFiles['/home/Music'] = {
      'a.mp3': { path: 'Rock/a.mp3' },
      'b.mp3': { path: 'Jazz/b.mp3' },
    };
    renderSource();

    const header = document.getElementById('source-header-count')!;
    expect(header.textContent).toBe('(2)');
  });

  it('registers directories in sourceNodeMap', () => {
    state.sourceFiles['/home/Music'] = { 'a.mp3': { path: 'Rock/a.mp3' } };
    renderSource();

    expect(state.sourceNodeMap.has('/home/Music/Rock')).toBe(true);
    const info = state.sourceNodeMap.get('/home/Music/Rock')!;
    expect(info.baseDir).toBe('/home/Music');
    expect((info.node as any).__files__).toBeDefined();
    expect((info.node as any).__files__.length).toBe(1);
  });

  it('handles nested subdirectories', () => {
    state.sourceFiles['/home/Music'] = { 'deep.mp3': { path: 'Rock/ACDC/deep.mp3' } };
    renderSource();

    const topDirs = document.querySelectorAll('#source-container > .directory');
    expect(topDirs.length).toBe(1);
    expect((topDirs[0] as HTMLElement).dataset.dirpath).toBe('/home/Music/Rock');
    expect(topDirs[0].querySelector('.children')).toBeNull();
  });

  describe('with filter active (renderFilteredSource)', () => {
    beforeEach(() => {
      state.sourceFiles['/home/Music'] = {
        'a.mp3': { path: 'Rock/a.mp3' },
        'b.mp3': { path: 'Jazz/b.mp3' },
        'c.mp3': { path: 'Rock/ACDC/thunder.mp3' },
      };
      setFilterTerm('sync-source', 'rock');
    });

    it('renders directories matching the filter term', () => {
      renderSource();

      const dirs = document.querySelectorAll('#source-container > .directory');
      expect(dirs.length).toBe(1);
      expect((dirs[0] as HTMLElement).dataset.dirpath).toBe('/home/Music/Rock');
    });

    it('renders file rows when directory is in sourceExpanded (manualExpand → isFiltered=false)', () => {
      state.sourceExpanded.add('/home/Music/Rock');

      renderSource();

      const fileRows = document.querySelectorAll('#source-container .file-row');
      expect(fileRows.length).toBeGreaterThanOrEqual(1);
    });

    it('shows empty-state message when nothing matches (EPIC-030)', () => {
      setFilterTerm('sync-source', 'zzznonexistent');
      renderSource();

      const empty = document.querySelector('#source-container .panel-empty')!;
      expect(empty.textContent).toBe('Aucun dossier trouvé pour ce filtre.');
    });

    it('shows filtered/total count in the chip (EPIC-030)', () => {
      renderSource();

      const countEl = document.querySelector('.filter-chip[data-scope="sync-source"] .filter-count')!;
      expect(countEl.textContent).toBe('1/3');
    });

    it('shows header count in (filtered / total) format', () => {
      renderSource();

      const header = document.getElementById('source-header-count')!;
      expect(header.textContent).toContain('/');
    });

    it('renders subdirectories when descendant matches filter but name does not', () => {
      // Dir "ACDC" has no files directly, just a subdir containing "thunder.mp3"
      // Filter is "rock" — ACDC name doesn't match, but descendant has no name to match either
      // With dirHasMatchingDescendant mocked to return false, ACDC won't appear
      setFilterTerm('sync-source', 'thunder');
      state.sourceExpanded.add('/home/Music/Rock');

      renderSource();

      const dirs = document.querySelectorAll('#source-container > .directory');
      expect(dirs.length).toBe(0); // no dir name contains "thunder"
    });

    it('renders subdirectory when dirHasMatchingDescendant returns true', () => {
      // dirHasMatchingDescendant is called TWICE per dir (renderFilteredSource + renderFilteredDirNode)
      vi.mocked(dirHasMatchingDescendant).mockReturnValue(true);
      setFilterTerm('sync-source', 'thunder');

      renderSource();

      const dirs = document.querySelectorAll('#source-container > .directory');
      expect(dirs.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Event subscription tests
// ═══════════════════════════════════════════════════════════════════════════

describe('setupRenderSubscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers an audio:changed listener', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledWith('audio:changed', expect.any(Function));
  });

  it('registers an eparsPlaylist:changed listener', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledWith('eparsPlaylist:changed', expect.any(Function));
  });

  it('registers an activePlaylistIndex:changed listener', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledWith('activePlaylistIndex:changed', expect.any(Function));
  });

  it('registers eparsFiles:changed listener (existing Phase 3)', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledWith('eparsFiles:changed', expect.any(Function));
  });

  it('registers sourceFiles:changed listener (existing Phase 3)', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledWith('sourceFiles:changed', expect.any(Function));
  });

  it('registers sourceExtraDirs:changed listener (dossiers créés via ➕)', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledWith('sourceExtraDirs:changed', expect.any(Function));
  });

  it('calls on() exactly 8 times (5 original + journal + activePanel + sourceExtraDirs)', () => {
    setupRenderSubscriptions();
    expect(on).toHaveBeenCalledTimes(8);
  });
});

describe('updatePlaylistLedIndicator', () => {
  it('applique led-playing au nom de la piste en lecture', () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar">
        <div id="playlist-panel">
          <div class="pl-track">
            <span class="play-btn playing">⏹</span>
            <span class="pl-track-name">song.mp3</span>
          </div>
        </div>
      </div>
    `;
    updatePlaylistLedIndicator();
    expect(document.querySelector('.pl-track-name')?.classList.contains('led-playing')).toBe(true);
  });

  it("retire led-playing quand aucune piste n'est en lecture", () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar">
        <div id="playlist-panel">
          <div class="pl-track">
            <span class="play-btn">▶</span>
            <span class="pl-track-name led-playing">song.mp3</span>
          </div>
        </div>
      </div>
    `;
    updatePlaylistLedIndicator();
    expect(document.querySelector('.pl-track-name')?.classList.contains('led-playing')).toBe(false);
  });

  it('no-op quand la sidebar est masquée', () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar" class="hidden">
        <div id="playlist-panel">
          <div class="pl-track">
            <span class="play-btn playing">⏹</span>
            <span class="pl-track-name">song.mp3</span>
          </div>
        </div>
      </div>
    `;
    updatePlaylistLedIndicator();
    expect(document.querySelector('.pl-track-name')?.classList.contains('led-playing')).toBe(false);
  });

  it('no-op quand le panneau playlist est absent', () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar"></div>
    `;
    updatePlaylistLedIndicator();
    expect(document.body.querySelectorAll('.led-playing').length).toBe(0);
  });
});
