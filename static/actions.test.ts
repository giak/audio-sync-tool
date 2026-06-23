// ─── Unit tests for actions.ts ──────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';

// Mock the modules that actions.ts imports BEFORE importing actions.ts
vi.mock('./api.js', () => ({
  api: vi.fn(),
}));

vi.mock('./ui.js', () => ({
  openModal: vi.fn(),
  closeAllModals: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('./render.js', () => ({
  renderAll: vi.fn(),
  renderJournal: vi.fn(),
  renderSource: vi.fn(),
  patchEparsFileAfterCopy: vi.fn(),
  patchSourceFileAfterCopy: vi.fn(),
}));

vi.mock('./focus.js', () => ({
  setActivePanel: vi.fn(),
  revalidateFocus: vi.fn(),
}));

import { executeCopy, runScan, initApp, configData } from './actions.js';
import { api } from './api.js';
import { openModal, closeAllModals, showError } from './ui.js';
import { renderAll, patchEparsFileAfterCopy, patchSourceFileAfterCopy, renderSource } from './render.js';

function setupCopyDOM(opts: { hasLeftFocus?: boolean; hasRightFocus?: boolean; hasEparDir?: boolean; hasRelPath?: boolean } = {}): void {
  const { hasLeftFocus = true, hasRightFocus = true, hasEparDir = true, hasRelPath = true } = opts;
  document.body.innerHTML = `
    <div id="epars-container">
      <div class="focused file-row">
        <span class="file focused" id="left-file"
          data-filename="song.mp3"
          data-epardir="${hasEparDir ? '/media/usb' : ''}"
          data-fullpath="/media/usb/song.mp3"></span>
      </div>
    </div>
    <div id="source-container">
      <div class="focused directory" id="right-dir" data-dirpath="/home/music/Rock"></div>
    </div>
    <div id="dialog-msg"></div>
    <button id="dialog-confirm"></button>
    <button id="dialog-cancel"></button>
    <span id="status-text"></span>
    <span id="epars-header-count"></span>
    <span id="source-header-count"></span>
    <div id="epars-status-line"></div>
    <div id="source-filter-count"></div>
    <button id="btn-scan"></button>
    <div id="scan-progress" class="hidden">
      <div id="scan-progress-bar"><div id="scan-progress-fill"></div></div>
      <span id="scan-progress-text"></span>
    </div>
  `;

  if (!hasLeftFocus) {
    document.querySelector('#epars-container .focused')?.remove();
  }
  if (!hasRightFocus) {
    document.querySelector('#source-container .focused')?.remove();
  }

  // Reset state
  state.sourceFiles = {};
  state.eparsFiles = {};
  if (hasEparDir && hasRelPath) {
    state.eparsFiles['/media/usb'] = {
      'song.mp3': { path: 'song.mp3', year: '2021', duration: 240, codec: 'MP3 320kbps' },
    };
  }
  state.journal = [];
  state.sourceExpanded.clear();
  state.sourceNodeMap.clear();
  state.filterActive = false;

  // Reset mocks
  vi.clearAllMocks();
}

beforeEach(() => {
  setupCopyDOM();
});

describe('executeCopy', () => {
  it('shows error when no file focused on left', () => {
    setupCopyDOM({ hasLeftFocus: false });
    executeCopy();
    expect(document.getElementById('status-text')!.textContent).toContain('Met d\'abord en surbrillance un fichier');
  });

  it('shows error when no directory focused on right', () => {
    setupCopyDOM({ hasRightFocus: false });
    executeCopy();
    expect(document.getElementById('status-text')!.textContent).toContain('Met d\'abord en surbrillance un dossier');
  });

  it('shows error when file has no eparDir', () => {
    setupCopyDOM({ hasEparDir: false });
    executeCopy();
    expect(document.getElementById('status-text')!.textContent).toContain('pas de dossier source valide');
  });

  it('shows error when file not found in eparsFiles data', () => {
    state.eparsFiles = {};
    executeCopy();
    expect(document.getElementById('status-text')!.textContent).toContain('Fichier introuvable');
  });

  it('opens confirm dialog with correct message', () => {
    executeCopy();
    expect(openModal).toHaveBeenCalledWith('dialog');
    expect(document.getElementById('dialog-msg')!.textContent).toContain('Copier "song.mp3"');
    expect(document.getElementById('dialog-msg')!.textContent).toContain('/home/music/Rock');
  });

  it('confirm click executes copy and updates state', async () => {
    vi.mocked(api).mockResolvedValueOnce({ ok: true, year: '2021', duration: 240, codec: 'MP3 320kbps' });
    vi.mocked(api).mockResolvedValueOnce([{ filename: 'song.mp3', status: 'copied' }]);
    vi.mocked(patchSourceFileAfterCopy).mockReturnValue(true);

    state.sourceFiles['/home/music'] = { 'old.mp3': { path: 'old.mp3' } };

    executeCopy();
    await (document.getElementById('dialog-confirm') as HTMLElement).onclick!();

    expect(closeAllModals).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith('/copy', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('song.mp3'),
    }));
    expect(state.sourceFiles['/home/music']['song.mp3']).toEqual({
      path: 'Rock/song.mp3', year: '2021', duration: 240, codec: 'MP3 320kbps',
    });
    expect(patchEparsFileAfterCopy).toHaveBeenCalledWith('song.mp3', '/media/usb');
    expect(patchSourceFileAfterCopy).toHaveBeenCalledWith('/home/music/Rock', 'song.mp3', expect.objectContaining({
      path: 'Rock/song.mp3', year: '2021', duration: 240, codec: 'MP3 320kbps',
    }));
    expect(renderSource).not.toHaveBeenCalled();
    expect(document.getElementById('status-text')!.textContent).toContain('✓');
  });

  it('falls back to renderSource when patchSourceFileAfterCopy returns false', async () => {
    vi.mocked(api).mockResolvedValueOnce({ ok: true, year: '2021', duration: 240, codec: 'MP3 320kbps' });
    vi.mocked(api).mockResolvedValueOnce([{ filename: 'song.mp3', status: 'copied' }]);
    vi.mocked(patchSourceFileAfterCopy).mockReturnValue(false);

    state.sourceFiles['/home/music'] = { 'old.mp3': { path: 'old.mp3' } };

    executeCopy();
    await (document.getElementById('dialog-confirm') as HTMLElement).onclick!();

    expect(patchEparsFileAfterCopy).toHaveBeenCalledWith('song.mp3', '/media/usb');
    expect(patchSourceFileAfterCopy).toHaveBeenCalled();
    expect(renderSource).toHaveBeenCalled();
    expect(document.getElementById('status-text')!.textContent).toContain('✓');
  });

  it('shows error when copy fails', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Permission denied'));

    executeCopy();
    await (document.getElementById('dialog-confirm') as HTMLElement).onclick!();

    expect(showError).toHaveBeenCalledWith(
      expect.stringContaining('Permission denied')
    );
  });

  it('cancel click closes dialog without copying', () => {
    executeCopy();
    (document.getElementById('dialog-cancel') as HTMLElement).onclick!();
    expect(closeAllModals).toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });
});

describe('runScan', () => {
  it('updates state and calls renderAll after scan', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      source: { '/src': { 'a.mp3': { path: 'a.mp3' } } },
      epars: { '/ep': { 'b.mp3': { path: 'b.mp3' } } },
    });
    vi.mocked(api).mockResolvedValueOnce([]);

    await runScan();

    expect(state.sourceFiles['/src']).toBeDefined();
    expect(state.eparsFiles['/ep']).toBeDefined();
    expect(renderAll).toHaveBeenCalled();
    expect(document.getElementById('status-text')!.textContent).toContain('Scan terminé');
  });
});

describe('initApp', () => {
  it('loads config, cache, and journal on startup', async () => {
    vi.mocked(api).mockResolvedValueOnce({ active: 0, configs: [{ name: 'test', source_data: '/src', epars_dirs: [] }] });
    vi.mocked(api).mockResolvedValueOnce({ source: { '/src': { 'a.mp3': { path: 'a.mp3' } } }, epars: {} });
    vi.mocked(api).mockResolvedValueOnce([]);

    await initApp();

    expect(configData.configs).toHaveLength(1);
    expect(state.sourceFiles['/src']).toBeDefined();
    expect(renderAll).toHaveBeenCalled();
  });

  it('handles empty cache gracefully', async () => {
    vi.mocked(api).mockResolvedValueOnce({ active: 0, configs: [] });
    vi.mocked(api).mockResolvedValueOnce({ source: {}, epars: {} });
    vi.mocked(api).mockResolvedValueOnce([]);

    await initApp();

    expect(configData.configs).toHaveLength(1); // default config created
    expect(state.sourceFiles).toEqual({});
  });
});
