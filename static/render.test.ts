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

import {
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  renderEpars,
  renderJournal,
  renderSource,
  toggleSourceDir,
} from './render.js';
import { countAllEparsFiles } from './utils.js';

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
  state.filterActive = false;
  state.sourceFilter = '';
  state.sourceExpanded.clear();
  state.sourceNodeMap.clear();
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

    it('omits metadata spans when absent', () => {
      patchSourceFileAfterCopy('/home/Music/Rock', 'bare.mp3', {
        path: 'Rock/bare.mp3',
        year: null,
        duration: 0,
        codec: '',
      });

      const rows = document.querySelectorAll('#source-container .file-row');
      const newRow = [...rows].find(r => r.querySelector('.file')?.textContent === 'bare.mp3') as HTMLElement;
      expect(newRow.querySelector('.year')).toBeNull();
      expect(newRow.querySelector('.codec')).toBeNull();
      expect(newRow.querySelector('.duration')).toBeNull();
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
      state.filterActive = true;
      state.sourceFilter = 'rock';
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
    dirEl.className = 'directory' + (initExpanded ? ' expanded' : '');
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

    it('passes isFiltered=true to buildSourceChildren when filterActive', () => {
      setupToggleDOM();
      state.filterActive = true;
      state.sourceFilter = 'rock';

      toggleSourceDir('/home/Music/Rock');

      const children = document.querySelector('#source-container .children')!;
      const subDirs = children.querySelectorAll('.directory');
      expect(subDirs.length).toBe(2);
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
  });

  it('renders empty container when no epars files', () => {
    renderEpars();
    expect(document.getElementById('epars-container')!.children.length).toBe(0);
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
    state.filterActive = false;
    state.sourceFilter = '';
    state.sourceExpanded.clear();
    state.sourceNodeMap.clear();
    vi.clearAllMocks();
  });

  it('renders empty container when no source files', () => {
    renderSource();
    expect(document.getElementById('source-container')!.children.length).toBe(0);
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
});
