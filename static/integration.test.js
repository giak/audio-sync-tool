// ─── End-to-end test: render panels → F5 copy → verify DOM patches ───────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';

// Polyfill CSS.escape for jsdom
if (typeof CSS === 'undefined') globalThis.CSS = {};
if (!CSS.escape) {
  CSS.escape = (val) => String(val).replace(/[^\w-]/g, '\\$&');
}

// Mock only the side-effectful modules — let render.js and utils.js run real
vi.mock('./api.js', () => ({ api: vi.fn() }));
vi.mock('./ui.js', () => ({ openModal: vi.fn(), closeAllModals: vi.fn() }));
vi.mock('./audio.js', () => ({ togglePlay: vi.fn() }));
vi.mock('./focus.js', () => ({
  setActivePanel: vi.fn(),
  focusItemByElement: vi.fn(),
  revalidateFocus: vi.fn(),
}));

// Real render + actions imports
import { renderEpars, renderSource } from './render.js';
import { executeCopy } from './actions.js';
import { api } from './api.js';
import { openModal, closeAllModals } from './ui.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function setupFullDOM() {
  document.body.innerHTML = `
    <div id="epars-container"></div>
    <span id="epars-header-count"></span>
    <div id="epars-status-line"></div>
    <div id="source-container"></div>
    <span id="source-header-count"></span>
    <span id="source-filter-count"></span>
    <div id="dialog-msg"></div>
    <button id="dialog-confirm"></button>
    <button id="dialog-cancel"></button>
    <span id="status-text"></span>
  `;
}

function setupState() {
  // Source Data: a tree with Rock/ (2 files) and Jazz/ (1 file)
  state.sourceFiles = {
    '/home/music': {
      'a.mp3': { path: 'Rock/a.mp3', year: '2022', duration: 200, codec: 'MP3 320kbps' },
      'b.mp3': { path: 'Rock/b.mp3', year: '2023', duration: 180, codec: 'MP3 320kbps' },
      'cool.mp3': { path: 'Jazz/cool.mp3', year: '2024', duration: 300, codec: 'FLAC' },
    },
  };

  // Éparpillé: two songs on a USB key — one already in source (doublon), one new
  state.eparsFiles = {
    '/media/usb': {
      'new-track.mp3': { path: 'new-track.mp3', year: '2025', duration: 240, codec: 'MP3 320kbps' },
      'a.mp3': { path: 'a.mp3', year: '2022', duration: 200, codec: 'MP3 320kbps' },
    },
  };

  state.journal = [];
  state.sourceExpanded.clear();
  state.sourceNodeMap.clear();
  state.filterActive = false;
  state.sourceFilter = '';
}

beforeEach(() => {
  setupFullDOM();
  setupState();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('F5 end-to-end flow', () => {
  it('patches DOM after copy instead of full rebuild', async () => {
    // ── Phase 1: initial render ─────────────────────────────────────
    renderEpars();
    renderSource();

    // Éparpillé panel: 2 files — new-track.mp3 (nouveau) and a.mp3 (doublon)
    const eparsFiles = document.querySelectorAll('#epars-container .file');
    expect(eparsFiles.length).toBe(2);
    const newTrack = [...eparsFiles].find(f => f.dataset.filename === 'new-track.mp3');
    expect(newTrack.classList.contains('nouveau')).toBe(true);
    const alreadyThere = [...eparsFiles].find(f => f.dataset.filename === 'a.mp3');
    expect(alreadyThere.classList.contains('doublon')).toBe(true);

    // Source panel: Rock/ and Jazz/ directories
    const sourceDirs = document.querySelectorAll('#source-container > .directory');
    expect(sourceDirs.length).toBe(2); // Rock, Jazz
    const rockDir = [...sourceDirs].find(d => d.dataset.dirpath === '/home/music/Rock');
    expect(rockDir).not.toBeUndefined();
    expect(rockDir.querySelector('.dir-count')?.textContent).toBe('(2)');

    // ── Phase 2: focus a file and directory ─────────────────────────
    // Focus new-track.mp3 in éparpillé
    const row = newTrack.closest('.file-row');
    row.classList.add('focused');
    newTrack.classList.add('focused');
    newTrack.dataset.epardir = '/media/usb';

    // Focus Rock directory in source
    rockDir.classList.add('focused');

    // ── Phase 3: execute F5 copy ────────────────────────────────────
    vi.mocked(api).mockResolvedValueOnce({ ok: true, year: '2025', duration: 240, codec: 'MP3 320kbps' });
    vi.mocked(api).mockResolvedValueOnce([{ filename: 'new-track.mp3', status: 'copied', timestamp: '2025-01-01T00:00:00' }]);

    executeCopy();

    // ── Phase 4: verify dialog opens ────────────────────────────────
    expect(openModal).toHaveBeenCalledWith('dialog');
    expect(document.getElementById('dialog-msg').textContent)
      .toContain('Copier "new-track.mp3"');
    expect(document.getElementById('dialog-msg').textContent)
      .toContain('/home/music/Rock');

    // ── Phase 5: confirm copy ───────────────────────────────────────
    await document.getElementById('dialog-confirm').onclick();

    expect(closeAllModals).toHaveBeenCalled();

    // ── Phase 6: verify DOM was patched, not rebuilt ────────────────
    // a) Éparpillé: new-track.mp3 changed from nouveau to doublon
    const updatedNewTrack = document.querySelector('#epars-container .file[data-filename="new-track.mp3"]');
    expect(updatedNewTrack.classList.contains('doublon')).toBe(true);
    expect(updatedNewTrack.classList.contains('nouveau')).toBe(false);
    expect(updatedNewTrack.onclick).toBeNull(); // no longer selectable

    // b) Éparpillé: status counters updated
    const statusLine = document.getElementById('epars-status-line');
    expect(statusLine.textContent).toContain('0 reste');   // was 1, now 0
    expect(statusLine.textContent).toContain('2 doublon');  // was 1, now 2
    expect(statusLine.textContent).toContain('0 traité');

    // c) Source: Rock directory now has a new file in the DOM
    //    (Rock was collapsed, so no children div — file only in sourceNodeMap)
    expect(rockDir.querySelector('.children')).toBeNull();

    // d) But sourceNodeMap was updated in-memory
    const nodeInfo = state.sourceNodeMap.get('/home/music/Rock');
    expect(nodeInfo.node.__files__).toBeDefined();
    const newFileInNode = nodeInfo.node.__files__.find(f => f.filename === 'new-track.mp3');
    expect(newFileInNode).toBeDefined();
    expect(newFileInNode.year).toBe('2025');

    // e) State was updated
    expect(state.journal.length).toBe(1);
    expect(state.sourceFiles['/home/music']['new-track.mp3'].path).toBe('Rock/new-track.mp3');

    // f) Status success
    expect(document.getElementById('status-text').textContent).toContain('✓');
    expect(document.getElementById('status-text').textContent).toContain('new-track.mp3');

    // g) No stale focused classes lingering
    // (The focused file was patched, but focused class stays on the row from our manual setup)
  });

  it('source tree shows new file after expand when destDir was collapsed', async () => {
    // ── Phase 1: initial render ─────────────────────────────────────
    renderEpars();
    renderSource();

    // Focus elements
    const newTrack = document.querySelector('#epars-container .file[data-filename="new-track.mp3"]');
    const row = newTrack.closest('.file-row');
    row.classList.add('focused');
    newTrack.classList.add('focused');
    newTrack.dataset.epardir = '/media/usb';

    const rockDir = document.querySelector('#source-container .directory[data-dirpath="/home/music/Rock"]');
    rockDir.classList.add('focused');

    // ── Phase 2: F5 copy ────────────────────────────────────────────
    vi.mocked(api).mockResolvedValueOnce({ ok: true, year: '2025', duration: 240, codec: 'MP3 320kbps' });
    vi.mocked(api).mockResolvedValueOnce([{ filename: 'new-track.mp3', status: 'copied' }]);

    executeCopy();
    await document.getElementById('dialog-confirm').onclick();

    // ── Phase 3: expand Rock to see the new file ────────────────────
    // At this point, sourceNodeMap has the file registered
    // We simulate clicking Rock to expand it
    rockDir.classList.remove('focused'); // cleanup focus for toggle
    rockDir.click(); // triggers toggleSourceDir

    // Now the children should show 3 files: a.mp3, b.mp3, and new-track.mp3
    const children = rockDir.querySelector('.children');
    expect(children).not.toBeNull();
    const fileRows = children.querySelectorAll('.file-row');
    expect(fileRows.length).toBe(3);

    const labels = [...fileRows].map(r => r.querySelector('.file')?.textContent).sort();
    expect(labels).toEqual(['a.mp3', 'b.mp3', 'new-track.mp3']);

    // Count badge updated
    expect(rockDir.querySelector('.dir-count')?.textContent).toBe('(3)');
  });

  it('completes the copy flow without errors', async () => {
    renderEpars();
    renderSource();

    // Focus elements
    const newTrack = document.querySelector('#epars-container .file[data-filename="new-track.mp3"]');
    const row = newTrack.closest('.file-row');
    row.classList.add('focused');
    newTrack.classList.add('focused');
    newTrack.dataset.epardir = '/media/usb';

    const rockDir = document.querySelector('#source-container .directory[data-dirpath="/home/music/Rock"]');
    rockDir.classList.add('focused');

    vi.mocked(api).mockResolvedValueOnce({ ok: true, year: '2025', duration: 240, codec: 'MP3 320kbps' });
    vi.mocked(api).mockResolvedValueOnce([{ filename: 'new-track.mp3', status: 'copied' }]);

    executeCopy();
    await document.getElementById('dialog-confirm').onclick();

    // revalidateFocus is called via requestAnimationFrame — we can't easily
    // test it synchronously, but we can verify the copy completed successfully
    expect(document.getElementById('status-text').textContent).toContain('✓');
    expect(state.journal.length).toBe(1);
  });
});
