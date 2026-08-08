// ─── Integration test: REAL UX interactions (clicks, keyboard, navigation) ──
// Only mocks api.js (network). focus.js, audio.js, ui.js, render.js are REAL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './state.js';

// ── Mock ONLY api.js (network calls) ───────────────────────────────────────
vi.mock('./api.js', () => {
  const mockApi = vi.fn();
  // Default returns for initApp() which runs at import time
  mockApi.mockResolvedValue({});
  return { api: mockApi };
});

// ── Set up DOM + polyfills + Audio mock BEFORE all imports execute ──────────
vi.hoisted(() => {
  // Polyfill scrollIntoView (not available in jsdom)
  Element.prototype.scrollIntoView = (): void => {};
  // Polyfill CSS.escape (not available in jsdom)
  if (typeof CSS === 'undefined') (globalThis as any).CSS = {};
  if (!CSS.escape) {
    (CSS as any).escape = (val: string): string => String(val).replace(/[^\w-]/g, '\\$&');
  }

  // Polyfill DataTransfer + DragEvent for drag-and-drop tests (not available in jsdom)
  if (typeof DataTransfer === 'undefined') {
    (globalThis as any).DataTransfer = class DataTransfer {
      _data: Map<string, string>;
      dropEffect: string;
      effectAllowed: string;
      constructor() {
        this._data = new Map();
        this.dropEffect = 'none';
        this.effectAllowed = 'all';
      }
      setData(format: string, data: string): void {
        this._data.set(format, data);
      }
      getData(format: string): string {
        return this._data.get(format) || '';
      }
      clearData(format?: string): void {
        if (format) this._data.delete(format);
        else this._data.clear();
      }
      get types(): string[] {
        return Array.from(this._data.keys());
      }
      setDragImage(): void {}
    };
  }
  if (typeof DragEvent === 'undefined') {
    (globalThis as any).DragEvent = class DragEvent extends Event {
      dataTransfer: DataTransfer;
      constructor(type: string, opts: Record<string, unknown> = {}) {
        super(type, opts);
        this.dataTransfer = (opts.dataTransfer as DataTransfer) || new DataTransfer();
      }
    };
  }

  (globalThis as any).Audio = vi.fn(() => ({
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime: 0,
    duration: 240,
  }));

  document.body.innerHTML = `
<div id="app">
  <header>
    <h1>Audio Sync Tool</h1>
    <div id="toolbar">
      <button id="btn-config">⚙️ Config</button>
      <button id="btn-scan">🔄 Scan</button>
      <button id="btn-journal">📋 Journal</button>
      <button id="btn-legend">❓ Raccourcis</button>
    </div>
    <div id="page-nav">
      <button id="page-sync" class="page-btn active">📦 Sync</button>
      <button id="page-playlist" class="page-btn">🎵 Playlist</button>
    </div>
    </div>
  </header>
  <div id="main-panels">
    <div id="panel-left" class="panel"><h2>📂 Éparpillé <span id="epars-header-count" class="panel-header-count"></span></h2><div id="epars-status-line"></div><div id="epars-container"></div></div>
    <div id="panel-right" class="panel"><h2>📂 Source Data <span id="source-header-count" class="panel-header-count"></span></h2><div id="source-container"></div></div>
  </div>
  <div id="filter-palette" class="hidden"><input type="text" id="source-filter" placeholder="Filtrer…" spellcheck="false" autocomplete="off"><span id="source-filter-count"></span></div>
  <div id="player-bar" class="hidden"><span id="player-stop">⏹</span><span id="player-filename"></span><span id="player-seek-bwd">⏪</span><div id="player-progress"><div id="player-progress-fill"></div></div><span id="player-time">0:00 / 0:00</span><span id="player-seek-fwd">⏩</span><label><input type="number" id="player-step" value="20" min="1" max="120">s</label></div>
  <div id="playlist-layout" class="hidden"><div id="playlist-main"><div id="playlist-source" class="panel"><h2>📂 Source Data <span id="playlist-source-count"></span></h2><div id="playlist-source-container"></div></div><div id="playlist-sidebar" class="panel"><div id="playlist-tabs"></div><div id="playlist-panel"></div><div id="playlist-actions"><button id="pl-save">💾 Sauvegarder</button><button id="pl-export">📦 Exporter</button><button id="pl-manage">📋 Gérer</button></div></div></div></div>
  <div id="scan-progress" class="hidden"><div id="scan-progress-bar"><div id="scan-progress-fill"></div></div><span id="scan-progress-text"></span></div>
  <div id="status-bar"><span id="status-text">Prêt.</span></div>
</div>
<div id="toast-container"></div>
<div id="modal-config" class="modal hidden"><div class="modal-backdrop"></div><div class="modal-content"><div class="modal-header"><h3>⚙️ Config</h3><button class="modal-close" data-modal="config">✕</button></div><div id="config-selector"><label>Profil : <select id="cfg-select"></select></label><button id="btn-add-config">+</button><button id="btn-del-config">−</button></div><div id="config-fields"><label>Nom : <input type="text" id="cfg-name"></label><label>Source : <input type="text" id="cfg-source"></label><label>Dossiers : <textarea id="cfg-epars" rows="4"></textarea></label></div><button id="btn-save-config">Sauvegarder</button><p id="config-status"></p></div></div>
<div id="modal-legend" class="modal hidden"><div class="modal-backdrop"></div><div class="modal-content"><div class="modal-header"><h3>❓ Raccourcis</h3><button class="modal-close" data-modal="legend">✕</button></div><div id="legend-grid"></div></div></div>
<div id="modal-journal" class="modal hidden"><div class="modal-backdrop"></div><div class="modal-content"><div class="modal-header"><h3>📋 Journal</h3><button class="modal-close" data-modal="journal">✕</button></div><div id="journal-content"></div></div></div>
<div id="modal-playlists" class="modal hidden"><div class="modal-backdrop"></div><div class="modal-content"><div class="modal-header"><h3>🎵 Playlists</h3><button class="modal-close">✕</button></div><div id="pl-manager-content"></div></div></div>
<div id="modal-dialog" class="modal hidden"><div class="modal-backdrop"></div><div class="modal-content modal-sm"><p id="dialog-msg"></p><input id="dialog-input" class="dialog-input hidden" type="text"><div class="dialog-buttons"><button id="dialog-confirm">Copier</button><button id="dialog-cancel">Annuler</button></div></div></div>`;
});

// ── Import SCRIPT.TS (executes on the real DOM set up above) ────────────────
import './script.js';
import { api } from './api.js';
import { stopPlayer } from './audio.js';
import { setActivePanel } from './focus.js';
import {
  renderEpars,
  renderPlaylistManager,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderSource,
} from './render.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function setupTestState(): void {
  state.sourceFiles = {
    '/home/music': {
      'a.mp3': { path: 'Rock/a.mp3', year: '2022', duration: 200, codec: 'MP3 320kbps' },
      'b.mp3': { path: 'Rock/b.mp3', year: '2023', duration: 180, codec: 'MP3 320kbps' },
      'cool.mp3': { path: 'Jazz/cool.mp3', year: '2024', duration: 300, codec: 'FLAC' },
    },
  };
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
  state.activePanel = 'epars';
  state.activeModal = null;
  state.playlistMode = false;
  state.playlistFocus = 'source';
  state.playlists = [];
  state.pendingPlaylists = {};
  state.activePlaylistIndex = 0;
  state.eparsFocusPath = null;
  state.sourceFocusPath = null;
  // Reset complet de tous les champs d'état restants pour éviter les fuites
  // entre tests (cause de flakiness en shuffle : playlistTrackFocusIndex laissé
  // non-null posait un « focused » automatique qui doublonnait avec celui du test).
  state.audioSeekStep = 20;
  state.playlistTrackFocusIndex = null;
  state.sourceManuallyExpanded.clear();
  state.selectedEparsFiles.clear();
  state.lastSelectedEparsIndex = null;
  state.navHistory = [];
  state.navIndex = -1;
  state.ratings = {};
  state.focusListId = 'epars';
}

function dispatchKey(key: string, opts: Record<string, unknown> = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  } as KeyboardEventInit);
  document.dispatchEvent(event);
  return event;
}

function flush(): Promise<void> {
  return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}

async function flushRaf(): Promise<void> {
  await new Promise(r => requestAnimationFrame(r));
}

beforeEach(async () => {
  // Reset audio player state (module-level currentAudio in audio.js)
  stopPlayer();

  // Reset DOM visual state
  for (const el of document.querySelectorAll('.modal')) el.classList.add('hidden');
  document.getElementById('player-bar')!.classList.add('hidden');
  document.querySelectorAll('.play-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.textContent = '▶';
  });
  for (const el of document.querySelectorAll('.led-playing')) el.classList.remove('led-playing');
  document.getElementById('epars-container')!.innerHTML = '';
  document.getElementById('source-container')!.innerHTML = '';
  document.getElementById('epars-header-count')!.textContent = '';
  document.getElementById('source-header-count')!.textContent = '';
  document.getElementById('epars-status-line')!.innerHTML = '';
  document.getElementById('filter-palette')!.classList.add('hidden');
  document.getElementById('main-panels')!.classList.remove('hidden');
  document.getElementById('playlist-layout')!.classList.add('hidden');
  document.getElementById('playlist-source-container')!.innerHTML = '';
  document.getElementById('playlist-tabs')!.innerHTML = '';
  document.getElementById('playlist-panel')!.innerHTML = '';

  // Reset state
  setupTestState();
  // Flush EventEmitter deferred renders from setupTestState state changes
  await flushRaf();
  // Blur any focused element to prevent isFilterInputFocused leakage
  (document.activeElement as HTMLElement | null)?.blur();
  // clearAllMocks garde les implémentations persistantes (mockResolvedValue posé par
  // « empty pending tracks ») et les Once non consommés → fuite entre tests (flaky shuffle).
  // Reset complet d'api + retour au défaut de la factory.
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({});
  // Les tests playlist posent panel-active sur sidebar/source sans le retirer ensuite :
  // on nettoie les classes avant chaque test pour éviter les fuites d'état (flaky shuffle).
  document.getElementById('playlist-source')!.classList.remove('panel-active');
  document.getElementById('playlist-sidebar')!.classList.remove('panel-active');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: REAL USER INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('Click interactions', () => {
  it('clicks on éparpillé nouveau file selects it and updates status', async () => {
    renderEpars();

    const fileSpan = document.querySelector('#epars-container .file.nouveau') as HTMLElement;
    expect(fileSpan).not.toBeNull();
    expect(fileSpan.textContent).toBe('new-track.mp3');

    fileSpan.click();
    await flush();

    expect(fileSpan.classList.contains('selected')).toBe(true);
    expect(document.getElementById('status-text')!.textContent).toContain('Tab → F5');
  });

  it('clicking play button shows audio player bar', async () => {
    renderEpars();

    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    expect(playBtn).not.toBeNull();
    expect(playBtn.textContent).toBe('▶');

    playBtn.click();
    await flush();

    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(false);
    expect(playBtn.textContent).toBe('⏹');
  });

  it('clicking play button again stops audio', async () => {
    renderEpars();

    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();
    playBtn.click();
    await flush();

    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(true);
    expect(playBtn.textContent).toBe('▶');
  });

  it('clicking source directory expands it', async () => {
    renderSource();

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    expect(rockDir).not.toBeNull();
    expect(rockDir.classList.contains('expanded')).toBe(false);

    rockDir.click();
    await flush();

    expect(rockDir.classList.contains('expanded')).toBe(true);
    const children = rockDir.querySelector('.children');
    expect(children).not.toBeNull();
    expect(children!.querySelectorAll('.file-row').length).toBe(2);
  });

  it('clicking directory again collapses it', async () => {
    renderSource();

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    rockDir.click();
    await flush();
    rockDir.click();
    await flush();

    expect(rockDir.classList.contains('expanded')).toBe(false);
    expect(rockDir.querySelector('.children')).toBeNull();
  });

  it('toolbar button opens modal, close button closes it', async () => {
    document.getElementById('btn-legend')!.click();
    await flush();

    const legendModal = document.getElementById('modal-legend')!;
    expect(legendModal.classList.contains('hidden')).toBe(false);
    expect(state.activeModal).toBe('legend');

    legendModal.querySelector('.modal-close')!.click();
    await flush();

    expect(legendModal.classList.contains('hidden')).toBe(true);
    expect(state.activeModal).toBeNull();
  });

  it('modal backdrop closes modal', async () => {
    document.getElementById('btn-config')!.click();
    await flush();

    const configModal = document.getElementById('modal-config')!;
    expect(configModal.classList.contains('hidden')).toBe(false);

    configModal.querySelector('.modal-backdrop')!.click();
    await flush();

    expect(configModal.classList.contains('hidden')).toBe(true);
    expect(state.activeModal).toBeNull();
  });

  it('clicking panel-left activates éparpillé panel', async () => {
    renderEpars();
    renderSource();

    document.getElementById('panel-left')!.click();
    await flush();

    expect(state.activePanel).toBe('epars');
    expect(document.getElementById('panel-left')!.classList.contains('panel-active')).toBe(true);
    expect(document.getElementById('panel-right')!.classList.contains('panel-active')).toBe(false);
  });

  it('clicking panel-right activates source panel', async () => {
    renderEpars();
    renderSource();

    document.getElementById('panel-right')!.click();
    await flush();

    expect(state.activePanel).toBe('source');
    expect(document.getElementById('panel-right')!.classList.contains('panel-active')).toBe(true);
    expect(document.getElementById('panel-left')!.classList.contains('panel-active')).toBe(false);
  });
});

describe('Keyboard navigation', () => {
  it('ArrowDown moves focus to next item in éparpillé', async () => {
    renderEpars();
    renderSource();
    state.activePanel = 'epars';
    setActivePanel('epars');
    await flush();

    const items = document.querySelectorAll('#epars-container .file-row, #epars-container .directory');
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].classList.contains('focused')).toBe(true);

    dispatchKey('ArrowDown');
    await flush();

    expect(items[1].classList.contains('focused')).toBe(true);
    expect(items[0].classList.contains('focused')).toBe(false);
  });

  it('ArrowUp moves focus to previous item', async () => {
    renderEpars();
    renderSource();
    state.activePanel = 'epars';
    setActivePanel('epars');
    await flush();

    const items = document.querySelectorAll('#epars-container .file-row, #epars-container .directory');

    dispatchKey('ArrowDown');
    dispatchKey('ArrowDown');
    await flush();
    expect(items[2].classList.contains('focused')).toBe(true);

    dispatchKey('ArrowUp');
    await flush();
    expect(items[1].classList.contains('focused')).toBe(true);
  });

  it('Tab switches between panels', async () => {
    renderEpars();
    renderSource();
    state.activePanel = 'epars';
    setActivePanel('epars');
    await flush();

    dispatchKey('Tab');
    await flush();
    expect(state.activePanel).toBe('source');
    expect(document.getElementById('panel-right')!.classList.contains('panel-active')).toBe(true);
    expect(document.getElementById('panel-left')!.classList.contains('panel-active')).toBe(false);

    dispatchKey('Tab');
    await flush();
    expect(state.activePanel).toBe('epars');
  });

  it('Escape while modal is open closes it', async () => {
    document.getElementById('btn-legend')!.click();
    await flush();
    expect(state.activeModal).toBe('legend');

    dispatchKey('Escape');
    await flush();

    expect(document.getElementById('modal-legend')!.classList.contains('hidden')).toBe(true);
    expect(state.activeModal).toBeNull();
  });

  it('Space on éparpillé nouveau file selects it', async () => {
    renderEpars();
    renderSource();
    state.activePanel = 'epars';
    setActivePanel('epars');
    await flush();

    let focused = document.querySelector('#epars-container .focused');
    while (focused?.classList.contains('directory')) {
      dispatchKey('ArrowDown');
      await flush();
      focused = document.querySelector('#epars-container .focused');
    }

    if (focused?.classList.contains('file-row')) {
      const fileSpan = focused.querySelector('.file.nouveau') as HTMLElement | null;
      if (fileSpan) {
        dispatchKey(' ');
        await flush();
        expect(fileSpan.classList.contains('selected')).toBe(true);
      }
    }
  });

  it('Enter on file-row plays audio', async () => {
    renderEpars();
    renderSource();
    state.activePanel = 'epars';
    setActivePanel('epars');
    await flush();

    let focused = document.querySelector('#epars-container .focused');
    while (focused?.classList.contains('directory')) {
      dispatchKey('ArrowDown');
      await flush();
      focused = document.querySelector('#epars-container .focused');
    }

    expect(focused).not.toBeNull();
    expect(focused!.classList.contains('file-row')).toBe(true);

    dispatchKey('Enter');
    await flush();

    const playerBar = document.getElementById('player-bar')!;
    expect(playerBar.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('player-filename')!.textContent!.length).toBeGreaterThan(0);
    const playBtn = focused!.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    expect(playBtn!.textContent).toBe('⏹');
  });

  it('F7 opens filter palette and activates source panel', async () => {
    renderEpars();
    renderSource();

    const ev = dispatchKey('F7');
    await flush();

    expect(ev.defaultPrevented).toBe(true);
    expect(state.filterActive).toBe(true);
    expect(document.getElementById('filter-palette')!.classList.contains('hidden')).toBe(false);
    expect(state.activePanel).toBe('source');
  });

  it('Shift+ArrowRight seeks audio forward when playing', async () => {
    renderEpars();
    renderSource();

    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();
    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(false);

    const fill = document.getElementById('player-progress-fill')!;
    const initialPct = parseFloat(fill.style.width) || 0;

    const ev = dispatchKey('ArrowRight', { shiftKey: true });
    await flush();

    expect(ev.defaultPrevented).toBe(true);
    const afterPct = parseFloat(fill.style.width) || 0;
    expect(afterPct).toBeGreaterThan(initialPct);
    expect(afterPct).toBeCloseTo(8.33, 0);
  });

  it('Shift+ArrowLeft seeks audio backward when playing', async () => {
    renderEpars();
    renderSource();

    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();

    dispatchKey('ArrowRight', { shiftKey: true });
    await flush();
    dispatchKey('ArrowRight', { shiftKey: true });
    await flush();

    const ev = dispatchKey('ArrowLeft', { shiftKey: true });
    await flush();

    expect(ev.defaultPrevented).toBe(true);
    const afterPct = parseFloat(document.getElementById('player-progress-fill')!.style.width) || 0;
    expect(afterPct).toBeCloseTo(8.33, 0);
  });

  it('←→ navigates between columns in Source Data via keyboard router', async () => {
    state.sourceFiles['/home/music']['d.mp3'] = {
      path: 'Electronic/d.mp3',
      year: '2023',
      duration: 180,
      codec: 'MP3 320kbps',
    };
    state.sourceFiles['/home/music']['e.mp3'] = { path: 'Pop/e.mp3', year: '2024', duration: 200, codec: 'FLAC' };
    state.sourceFiles['/home/music']['f.mp3'] = {
      path: 'Metal/f.mp3',
      year: '2022',
      duration: 160,
      codec: 'MP3 192kbps',
    };

    renderSource();
    state.activePanel = 'source';
    setActivePanel('source');
    await flush();

    const dirs = document.querySelectorAll('#source-container .directory');
    expect(dirs.length).toBeGreaterThanOrEqual(4);

    const col1Left = 50;
    const col2Left = 300;
    const rowHeight = 40;

    for (let i = 0; i < dirs.length; i++) {
      const col = i < 3 ? col1Left : col2Left;
      const top = (i < 3 ? i : i - 3) * rowHeight + 10;
      (dirs[i] as HTMLElement).getBoundingClientRect = () =>
        ({
          left: col,
          top,
          right: col + 200,
          bottom: top + 30,
          width: 200,
          height: 30,
        }) as DOMRect;
    }

    dirs[0].classList.add('focused');

    dispatchKey('ArrowRight');
    await flush();

    expect(dirs[3].classList.contains('focused')).toBe(true);
    expect(dirs[0].classList.contains('focused')).toBe(false);

    dispatchKey('ArrowLeft');
    await flush();

    expect(dirs[0].classList.contains('focused')).toBe(true);
    expect(dirs[3].classList.contains('focused')).toBe(false);
  });
});

describe('F5 copy flow', () => {
  it('F5 without focused file shows help message', async () => {
    renderEpars();
    renderSource();

    dispatchKey('F5');
    await flush();

    expect(document.getElementById('status-text')!.textContent).toContain('surbrillance');
  });

  it('F5 with focused file and directory opens confirm dialog', async () => {
    renderEpars();
    renderSource();

    const fileSpan = document.querySelector('#epars-container .file.nouveau') as HTMLElement;
    fileSpan.dataset.epardir = '/media/usb';
    fileSpan.closest('.file-row')!.classList.add('focused');

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    rockDir.classList.add('focused');

    dispatchKey('F5');
    await flush();

    expect(state.activeModal).toBe('dialog');
    expect(document.getElementById('dialog-msg')!.textContent).toContain('Copier "new-track.mp3"');
  });

  it('confirm dialog executes copy and patches DOM', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      ok: true,
      year: '2025',
      duration: 240,
      codec: 'MP3 320kbps',
    });
    vi.mocked(api).mockResolvedValueOnce([
      { filename: 'new-track.mp3', status: 'copied', timestamp: '2025-01-01T00:00:00' },
    ]);

    renderEpars();
    renderSource();

    const fileSpan = document.querySelector('#epars-container .file.nouveau') as HTMLElement;
    fileSpan.dataset.epardir = '/media/usb';
    fileSpan.closest('.file-row')!.classList.add('focused');
    fileSpan.classList.add('focused');

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    rockDir.classList.add('focused');

    dispatchKey('F5');
    await flush();
    document.getElementById('dialog-confirm')!.click();
    await flush();

    expect(document.getElementById('status-text')!.textContent).toContain('✓');
    expect(document.getElementById('status-text')!.textContent).toContain('new-track.mp3');
    expect(fileSpan.classList.contains('doublon')).toBe(true);
    expect(fileSpan.classList.contains('nouveau')).toBe(false);
  });
});

describe('Journal modal', () => {
  it('opens journal modal when toolbar button clicked', async () => {
    document.getElementById('btn-journal')!.click();
    await flush();

    expect(state.activeModal).toBe('journal');
    expect(document.getElementById('modal-journal')!.classList.contains('hidden')).toBe(false);
  });
});

describe('Error resilience', () => {
  it('F5 shows error toast when /copy fails', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Internal server error'));

    renderEpars();
    renderSource();

    const fileSpan = document.querySelector('#epars-container .file.nouveau') as HTMLElement;
    fileSpan.dataset.epardir = '/media/usb';
    fileSpan.closest('.file-row')!.classList.add('focused');
    fileSpan.classList.add('focused');

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    rockDir.classList.add('focused');

    dispatchKey('F5');
    await flush();
    document.getElementById('dialog-confirm')!.click();
    await flush();

    expect(document.getElementById('status-text')!.textContent).toContain('⚠️');
    expect(document.getElementById('status-text')!.textContent).toContain('Échec');
    expect(document.getElementById('status-text')!.textContent).toContain('copie');
  });

  it('Ctrl+S shows error toast when network is unreachable', async () => {
    vi.mocked(api).mockResolvedValueOnce([]);
    document.getElementById('page-playlist')!.click();
    await flush();

    state.sourceExpanded.add('/home/music/Rock');
    state.sourceExpanded.add('/home/music/Jazz');
    renderPlaylistSource();
    await flush();

    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();

    vi.mocked(api).mockRejectedValueOnce(new Error('Network unreachable'));

    dispatchKey('s', { ctrlKey: true });
    await flush();

    expect(document.getElementById('status-text')!.textContent).toContain('⚠️');
    expect(document.getElementById('status-text')!.textContent).toContain('Échec');
    expect(document.getElementById('status-text')!.textContent).toContain('sauvegarde');
  });

  it('scan button shows error when /scan fails', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Server error'));

    document.getElementById('btn-scan')!.click();
    await flush();

    expect(document.getElementById('status-text')!.textContent).toContain('⚠️');
    expect(document.getElementById('status-text')!.textContent).toContain('Scan échoué');
  });
});

describe('State proxy', () => {
  it('rejects invalid activePanel', () => {
    const original = state.activePanel;
    (state as any).activePanel = 'nonexistent';
    expect(state.activePanel).toBe(original);
    expect(state.activePanel).not.toBe('nonexistent');
  });

  it('rejects invalid activeModal', () => {
    (state as any).activeModal = 'nonexistent';
    expect(state.activeModal).toBeNull();
    expect(state.activeModal).not.toBe('nonexistent');
  });

  it('allows valid activePanel values', () => {
    state.activePanel = 'source';
    expect(state.activePanel).toBe('source');
    state.activePanel = 'epars';
    expect(state.activePanel).toBe('epars');
  });

  it('allows valid activeModal values', () => {
    state.activeModal = 'config';
    expect(state.activeModal).toBe('config');
    state.activeModal = 'legend';
    expect(state.activeModal).toBe('legend');
    state.activeModal = 'dialog';
    expect(state.activeModal).toBe('dialog');
    state.activeModal = 'playlists';
    expect(state.activeModal).toBe('playlists');
  });

  it('allows null activeModal (closed state)', () => {
    state.activeModal = 'config';
    state.activeModal = null;
    expect(state.activeModal).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: PLAYLIST MODE
// ═══════════════════════════════════════════════════════════════════════════

describe('Playlist mode', () => {
  async function enterPlaylist(): Promise<void> {
    vi.mocked(api).mockResolvedValueOnce([]);
    document.getElementById('page-playlist')!.click();
    await flush();

    state.sourceExpanded.add('/home/music/Rock');
    state.sourceExpanded.add('/home/music/Jazz');
    renderPlaylistSource();
    await flush();
  }

  function focusFirstPlaylistFile(): Element | null {
    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    if (rows.length > 0) {
      for (const el of rows) el.classList.remove('focused');
      rows[0].classList.add('focused');
    }
    return rows[0] || null;
  }

  it('clicking 🎵 Playlist button enters playlist mode', async () => {
    await enterPlaylist();

    expect(state.playlistMode).toBe(true);
    expect(state.playlistFocus).toBe('source');
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('playlist-layout')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('playlist-source')!.classList.contains('panel-active')).toBe(true);

    expect(document.getElementById('status-text')!.textContent).toContain('Playlist');

    const fileRows = document.querySelectorAll('#playlist-source-container .file-row');
    expect(fileRows.length).toBeGreaterThan(0);

    expect(Object.keys(state.pendingPlaylists)).toContain('playlist-1');
    const tabEl = document.querySelector('#playlist-tabs .pl-tab');
    expect(tabEl).not.toBeNull();
    expect(tabEl!.textContent).toContain('playlist-1');
  });

  it('Escape does NOT exit playlist mode (stays in playlist)', async () => {
    await enterPlaylist();
    expect(state.playlistMode).toBe(true);

    dispatchKey('Escape');
    await flush();

    // Playlist mode is still active, layout unchanged
    expect(state.playlistMode).toBe(true);
    expect(document.getElementById('playlist-layout')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(true);
  });

  it('Sync button exits playlist mode and returns to normal view', async () => {
    await enterPlaylist();
    expect(state.playlistMode).toBe(true);

    document.getElementById('page-sync')!.click();
    await flush();
    await flush();

    expect(state.playlistMode).toBe(false);
    expect(document.getElementById('playlist-layout')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-text')!.textContent).toBe('Prêt.');
  });

  it('Sync button saves pending tracks before exiting playlist mode', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    focusFirstPlaylistFile();
    dispatchKey(' ');
    await flush();

    expect(Object.keys(state.pendingPlaylists)).toContain('playlist-1');
    expect(state.pendingPlaylists['playlist-1'].length).toBe(1);

    vi.mocked(api).mockResolvedValueOnce({ ok: true, playlist: { name: 'playlist-1' } });
    vi.mocked(api).mockResolvedValueOnce([]);

    document.getElementById('page-sync')!.click();
    await flush();
    await flush();

    expect(api).toHaveBeenCalledWith(
      '/playlists',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    expect(state.playlistMode).toBe(false);
    expect(document.getElementById('playlist-layout')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(false);
  });

  it('Sync button with empty pending tracks exits without calling save', async () => {
    await enterPlaylist();
    expect(state.playlistMode).toBe(true);
    expect(Object.keys(state.pendingPlaylists).length).toBe(1);
    expect(state.pendingPlaylists['playlist-1'].length).toBe(0);

    vi.clearAllMocks();
    vi.mocked(api).mockResolvedValue({});

    document.getElementById('page-sync')!.click();
    await flush();
    await flush();

    expect(api).not.toHaveBeenCalledWith(
      '/playlists',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    expect(state.playlistMode).toBe(false);
  });

  it('Space adds a track to the playlist and marks it in-playlist', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const fileRow = focusFirstPlaylistFile() as HTMLElement;
    expect(fileRow).not.toBeNull();

    const label = fileRow.querySelector('.file') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.classList.contains('in-playlist')).toBe(false);

    dispatchKey(' ');
    await flush();

    expect(label.classList.contains('in-playlist')).toBe(true);

    const tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(tracks.length).toBe(1);
    expect(tracks[0].querySelector('.pl-track-name')!.textContent).toBe(label.textContent);

    expect(document.getElementById('toast-container')!.textContent).toContain('ajouté');
  });

  it('Space on an already-added track removes it from playlist', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const fileRow = focusFirstPlaylistFile() as HTMLElement;
    const label = fileRow.querySelector('.file') as HTMLElement;

    dispatchKey(' ');
    await flush();
    expect(label.classList.contains('in-playlist')).toBe(true);
    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(1);

    dispatchKey(' ');
    await flush();

    expect(label.classList.contains('in-playlist')).toBe(false);
    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(0);
    expect(document.getElementById('toast-container')!.textContent).toContain('retiré');
  });

  it('Tab switches focus between source panel and sidebar', async () => {
    await enterPlaylist();
    expect(state.playlistFocus).toBe('source');
    expect(document.getElementById('playlist-source')!.classList.contains('panel-active')).toBe(true);
    expect(document.getElementById('playlist-sidebar')!.classList.contains('panel-active')).toBe(false);

    dispatchKey('Tab');
    await flush();

    expect(state.playlistFocus).toBe('sidebar');
    expect(document.getElementById('playlist-source')!.classList.contains('panel-active')).toBe(false);
    expect(document.getElementById('playlist-sidebar')!.classList.contains('panel-active')).toBe(true);

    dispatchKey('Tab');
    await flush();

    expect(state.playlistFocus).toBe('source');
    expect(document.getElementById('playlist-source')!.classList.contains('panel-active')).toBe(true);
  });

  it('togglePlaylistFocus uses explicit add/remove, not toggle — survives broken state', async () => {
    state.playlistMode = true;
    state.playlistFocus = 'source';
    document.getElementById('playlist-source')!.classList.add('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    dispatchKey('Tab');
    await flush();

    expect(state.playlistFocus).toBe('sidebar');
    expect(document.getElementById('playlist-source')!.classList.contains('panel-active')).toBe(false);
    expect(document.getElementById('playlist-sidebar')!.classList.contains('panel-active')).toBe(true);

    dispatchKey('Tab');
    await flush();

    expect(state.playlistFocus).toBe('source');
    expect(document.getElementById('playlist-source')!.classList.contains('panel-active')).toBe(true);
    expect(document.getElementById('playlist-sidebar')!.classList.contains('panel-active')).toBe(false);
  });

  it('ArrowDown/ArrowUp navigates files in playlist source panel', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const container = document.getElementById('playlist-source-container')!;
    const items = container.querySelectorAll('.file-row, .directory');
    expect(items.length).toBeGreaterThanOrEqual(2);

    items[0].classList.add('focused');
    items.forEach((it, i) => {
      if (i > 0) it.classList.remove('focused');
    });

    dispatchKey('ArrowDown');
    await flush();

    expect(items[1].classList.contains('focused')).toBe(true);
    expect(items[0].classList.contains('focused')).toBe(false);

    dispatchKey('ArrowUp');
    await flush();

    expect(items[0].classList.contains('focused')).toBe(true);
    expect(items[1].classList.contains('focused')).toBe(false);
  });

  it('Enter on a file-row in playlist source plays audio', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const fileRow = focusFirstPlaylistFile() as HTMLElement;
    expect(fileRow).not.toBeNull();

    dispatchKey('Enter');
    await flush();

    const playerBar = document.getElementById('player-bar')!;
    expect(playerBar.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('player-filename')!.textContent!.length).toBeGreaterThan(0);

    const playBtn = fileRow.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    expect(playBtn!.textContent).toBe('⏹');
  });

  it('Ctrl+S saves the current playlist (with tracks)', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    focusFirstPlaylistFile();
    dispatchKey(' ');
    await flush();

    vi.mocked(api).mockResolvedValueOnce({ ok: true, playlist: { name: 'playlist-1' } });
    vi.mocked(api).mockResolvedValueOnce([]);

    dispatchKey('s', { ctrlKey: true });
    await flush();
    await flush();

    expect(api).toHaveBeenCalledWith(
      '/playlists',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    expect(document.getElementById('toast-container')!.textContent).toContain('sauvegardée');
  });

  it('Ctrl+S shows warning when playlist is empty', async () => {
    await enterPlaylist();

    dispatchKey('s', { ctrlKey: true });
    await flush();

    expect(document.getElementById('toast-container')!.textContent).toContain('vide');
  });

  it('Ctrl+E opens export confirmation dialog', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    focusFirstPlaylistFile();
    dispatchKey(' ');
    await flush();

    dispatchKey('e', { ctrlKey: true });
    await flush();

    expect(state.activeModal).toBe('dialog');
    expect(document.getElementById('dialog-msg')!.textContent).toContain('Exporter');
    expect(document.getElementById('dialog-msg')!.textContent).toContain('playlist-1');
    expect(document.getElementById('dialog-confirm')!.textContent).toBe('📦 Exporter');
  });

  it('bouton 💾 Sauvegarder sauvegarde la playlist courante', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    focusFirstPlaylistFile();
    dispatchKey(' ');
    await flush();

    vi.mocked(api).mockResolvedValueOnce({ ok: true, playlist: { name: 'playlist-1' } });
    vi.mocked(api).mockResolvedValueOnce([]);

    (document.getElementById('pl-save') as HTMLButtonElement).click();
    await flush();
    await flush();

    expect(api).toHaveBeenCalledWith('/playlists', expect.objectContaining({ method: 'POST' }));
    expect(document.getElementById('toast-container')!.textContent).toContain('sauvegardée');
  });

  it("bouton 📦 Exporter ouvre la confirmation d'export", async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    focusFirstPlaylistFile();
    dispatchKey(' ');
    await flush();

    (document.getElementById('pl-export') as HTMLButtonElement).click();
    await flush();

    expect(state.activeModal).toBe('dialog');
    expect(document.getElementById('dialog-msg')!.textContent).toContain('Exporter');
    expect(document.getElementById('dialog-confirm')!.textContent).toBe('📦 Exporter');
  });

  it('Delete removes focused track from playlist sidebar', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(2);

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    const trackEls = document.querySelectorAll('#playlist-tracks .pl-track');
    trackEls[0].classList.add('focused');

    dispatchKey('Delete');
    await flush();

    const remainingTracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(remainingTracks.length).toBe(1);
    expect(remainingTracks[0].querySelector('.pl-track-name')!.textContent).toBe(
      rows[1].querySelector('.file')!.textContent,
    );
  });

  it('Backspace also removes focused track from playlist sidebar', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    focusFirstPlaylistFile();
    dispatchKey(' ');
    await flush();

    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(1);

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');
    document.querySelector('#playlist-tracks .pl-track')!.classList.add('focused');

    dispatchKey('Backspace');
    await flush();

    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(0);
  });

  it('Ctrl+ArrowUp reorders track upward in playlist sidebar', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(2);

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    const trackEls = document.querySelectorAll('#playlist-tracks .pl-track');
    trackEls[1].classList.add('focused');
    const secondName = trackEls[1].querySelector('.pl-track-name')!.textContent;

    dispatchKey('ArrowUp', { ctrlKey: true });
    await flush();

    const reordered = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(reordered.length).toBe(2);
    expect(reordered[0].querySelector('.pl-track-name')!.textContent).toBe(secondName);
  });

  it('Ctrl+ArrowDown reorders track downward in playlist sidebar', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    const trackEls = document.querySelectorAll('#playlist-tracks .pl-track');
    trackEls[0].classList.add('focused');
    const firstName = trackEls[0].querySelector('.pl-track-name')!.textContent;

    dispatchKey('ArrowDown', { ctrlKey: true });
    await flush();

    const reordered = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(reordered.length).toBe(2);
    expect(reordered[1].querySelector('.pl-track-name')!.textContent).toBe(firstName);
  });

  it('Ctrl+ArrowUp keeps focus on the moved track after reorder', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    const trackEls = document.querySelectorAll('#playlist-tracks .pl-track');
    trackEls[1].classList.add('focused');
    const secondName = trackEls[1].querySelector('.pl-track-name')!.textContent;

    dispatchKey('ArrowUp', { ctrlKey: true });
    await flush();

    // Le focus suit le track déplacé (playlistTrackFocusIndex mis à jour) :
    // l'auto-focus du re-render doit rester sur la piste déplacée, pas sauter.
    const focused = document.querySelector('#playlist-tracks .focused');
    expect(focused).not.toBeNull();
    expect(focused!.querySelector('.pl-track-name')!.textContent).toBe(secondName);
  });

  it('Ctrl+ArrowUp at first track is a no-op and preserves focus', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    const trackEls = document.querySelectorAll('#playlist-tracks .pl-track');
    trackEls[0].classList.add('focused');
    const firstName = trackEls[0].querySelector('.pl-track-name')!.textContent;
    const names = Array.from(trackEls).map(el => el.querySelector('.pl-track-name')!.textContent);

    dispatchKey('ArrowUp', { ctrlKey: true });
    await flush();

    // No-op (déjà en tête) : ordre inchangé ET focus préservé (pas de -1).
    const after = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(after.length).toBe(2);
    expect(Array.from(after).map(el => el.querySelector('.pl-track-name')!.textContent)).toEqual(names);
    const focused = document.querySelector('#playlist-tracks .focused');
    expect(focused).not.toBeNull();
    expect(focused!.querySelector('.pl-track-name')!.textContent).toBe(firstName);
  });

  it('ArrowDown/ArrowUp navigates tracks in playlist sidebar', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    let tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    tracks[0].classList.add('focused');

    dispatchKey('ArrowDown');
    await flush();

    tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(tracks[1].classList.contains('focused')).toBe(true);
    expect(tracks[0].classList.contains('focused')).toBe(false);

    dispatchKey('ArrowUp');
    await flush();

    tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(tracks[0].classList.contains('focused')).toBe(true);
    expect(tracks[1].classList.contains('focused')).toBe(false);
  });

  it('F7 opens filter palette in playlist mode', async () => {
    await enterPlaylist();

    const ev = dispatchKey('F7');
    await flush();

    expect(ev.defaultPrevented).toBe(true);
    expect(state.filterActive).toBe(true);
    expect(document.getElementById('filter-palette')!.classList.contains('hidden')).toBe(false);
  });

  it('/ opens filter palette in playlist mode', async () => {
    await enterPlaylist();

    const ev = dispatchKey('/');
    await flush();

    expect(ev.defaultPrevented).toBe(true);
    expect(state.filterActive).toBe(true);
    expect(document.getElementById('filter-palette')!.classList.contains('hidden')).toBe(false);
  });

  it('Delete removes in-playlist class from source panel', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();

    const label = rows[0].querySelector('.file') as HTMLElement;
    expect(label.classList.contains('in-playlist')).toBe(true);

    state.playlistFocus = 'sidebar';
    document.getElementById('playlist-source')!.classList.remove('panel-active');
    document.getElementById('playlist-sidebar')!.classList.add('panel-active');

    const trackEls = document.querySelectorAll('#playlist-tracks .pl-track');
    trackEls[0].classList.add('focused');

    dispatchKey('Delete');
    await flush();

    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(0);
    expect(label.classList.contains('in-playlist')).toBe(false);
  });

  it('✕ button removes in-playlist class from source panel', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();

    const label = rows[0].querySelector('.file') as HTMLElement;
    expect(label.classList.contains('in-playlist')).toBe(true);

    const removeBtn = document.querySelector('#playlist-tracks .pl-track-remove') as HTMLElement;
    removeBtn.click();
    await flush();

    expect(document.querySelectorAll('#playlist-tracks .pl-track').length).toBe(0);
    expect(label.classList.contains('in-playlist')).toBe(false);
  });

  it('clicking a playlist tab switches active playlist', async () => {
    await enterPlaylist();

    state.pendingPlaylists['playlist-2'] = [];
    renderPlaylistPanel();
    await flush();

    const tabs = document.querySelectorAll('#playlist-tabs .pl-tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);

    tabs[1].click();
    await flush();

    const activeTab = document.querySelector('#playlist-tabs .pl-tab.active');
    expect(activeTab).not.toBeNull();
    expect(activeTab!.textContent).toContain('playlist-2');
  });

  it('clicking tab close button removes the playlist tab', async () => {
    await enterPlaylist();

    state.pendingPlaylists['playlist-2'] = [];
    renderPlaylistPanel();
    await flush();

    const tabs = document.querySelectorAll('#playlist-tabs .pl-tab');
    expect(tabs.length).toBe(2);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const closeBtn = tabs[1].querySelector('.pl-tab-close') as HTMLElement;
    closeBtn.click();
    await flush();

    expect(document.querySelectorAll('#playlist-tabs .pl-tab').length).toBe(1);
    expect(Object.keys(state.pendingPlaylists)).not.toContain('playlist-2');

    confirmSpy.mockRestore();
  });

  it('clicking + button creates a new playlist tab (dialog custom)', async () => {
    await enterPlaylist();

    expect(document.querySelectorAll('#playlist-tabs .pl-tab').length).toBe(1);

    const addBtn = document.querySelector('#playlist-tabs .pl-tab-add') as HTMLElement;
    addBtn.click();
    await flush();
    // Dialog custom (EPIC-014) : remplir le champ puis confirmer.
    expect(state.activeModal).toBe('dialog');
    (document.getElementById('dialog-input') as HTMLInputElement).value = 'ma-playlist';
    (document.getElementById('dialog-confirm') as HTMLButtonElement).click();
    await flush();

    const tabs = document.querySelectorAll('#playlist-tabs .pl-tab');
    expect(tabs.length).toBe(2);
    expect(tabs[1].textContent).toContain('ma-playlist');
  });

  it('renderPlaylistManager shows empty message when no playlists exist', async () => {
    state.playlists = [];
    state.pendingPlaylists = {};
    renderPlaylistManager();
    await flush();
    const content = document.getElementById('pl-manager-content')!;
    expect(content.textContent).toContain('Aucune playlist');
  });

  it('renderPlaylistManager renders table with saved and pending playlists', async () => {
    state.playlists = [
      {
        name: 'rock',
        tracks: [{ filename: 'a.mp3', fullPath: '/m/a.mp3', duration: 200 }],
        exported: '2025-01-15T00:00:00Z',
      },
      { name: 'jazz', tracks: [{ filename: 'b.mp3', fullPath: '/m/b.mp3', duration: 180 }] },
    ] as any[];
    state.pendingPlaylists = {
      rock: [{ filename: 'a.mp3', fullPath: '/m/a.mp3', duration: 200 }] as any[],
      'new-pl': [{ filename: 'c.mp3', fullPath: '/m/c.mp3', duration: 240 }] as any[],
    };
    renderPlaylistManager();
    await flush();
    const content = document.getElementById('pl-manager-content')!;
    const rows = content.querySelectorAll('#pl-manager-table tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('✅');
    expect(rows[2].textContent).toContain('4:00');
  });

  function simulateDragDrop(fromEl: Element, toEl: Element): void {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', (fromEl as HTMLElement).dataset.index || '');

    fromEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dataTransfer as any }));
    toEl.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dataTransfer as any }),
    );
    toEl.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dataTransfer as any }));
    fromEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dataTransfer as any }));
  }

  it('drag-and-drop reorders tracks in playlist sidebar', async () => {
    await enterPlaylist();
    state.playlistFocus = 'source';

    const rows = document.querySelectorAll('#playlist-source-container .file-row');
    rows[0].classList.add('focused');
    dispatchKey(' ');
    await flush();
    rows[0].classList.remove('focused');
    rows[1].classList.add('focused');
    dispatchKey(' ');
    await flush();

    let tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(tracks.length).toBe(2);
    const firstName = tracks[0].querySelector('.pl-track-name')!.textContent;

    simulateDragDrop(tracks[0], tracks[1]);
    await flush();

    tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(tracks.length).toBe(2);
    expect(tracks[1].querySelector('.pl-track-name')!.textContent).toBe(firstName);
  });

  it('Charger button loads playlist and enters playlist mode', async () => {
    state.playlistMode = false;
    state.playlists = [{ name: 'rock', tracks: [{ filename: 'a.mp3', fullPath: '/m/a.mp3', duration: 200 }] }] as any[];
    state.pendingPlaylists = {};
    renderPlaylistManager();
    await flush();

    const loadBtn = document.querySelector('#pl-manager-content .pl-mgr-load') as HTMLElement;
    expect(loadBtn).not.toBeNull();

    loadBtn.click();
    await flush();

    expect(state.playlistMode).toBe(true);
    expect(state.pendingPlaylists.rock).toBeDefined();
    expect(state.pendingPlaylists.rock.length).toBe(1);
    expect(document.getElementById('playlist-layout')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(true);
  });

  it('Renommer button renames playlist via prompt and API', async () => {
    state.playlists = [{ name: 'rock', tracks: [{ filename: 'a.mp3', fullPath: '/m/a.mp3', duration: 200 }] }] as any[];
    state.pendingPlaylists = {};
    renderPlaylistManager();
    await flush();

    vi.mocked(api).mockResolvedValueOnce({ ok: true });
    vi.mocked(api).mockResolvedValueOnce([{ name: 'metal', tracks: [] }] as any);

    const renameBtn = document.querySelector('#pl-manager-content .pl-mgr-rename') as HTMLElement;
    renameBtn.click();
    await flush();
    // Dialog custom (EPIC-014) : pré-rempli avec l'ancien nom → nouveau nom + confirmer.
    expect(state.activeModal).toBe('dialog');
    (document.getElementById('dialog-input') as HTMLInputElement).value = 'metal';
    (document.getElementById('dialog-confirm') as HTMLButtonElement).click();
    await flush();
    await flush();

    expect(api).toHaveBeenCalledWith(
      '/playlists/rock',
      expect.objectContaining({
        method: 'PUT',
        body: expect.stringContaining('metal'),
      }),
    );
    expect(document.getElementById('pl-manager-content')!.textContent).toContain('metal');
    expect(document.getElementById('pl-manager-content')!.textContent).not.toContain('rock');
  });

  it('Supprimer button deletes playlist after confirmation', async () => {
    state.playlists = [{ name: 'rock', tracks: [{ filename: 'a.mp3', fullPath: '/m/a.mp3', duration: 200 }] }] as any[];
    state.pendingPlaylists = {};
    renderPlaylistManager();
    await flush();

    vi.mocked(api).mockResolvedValueOnce({ ok: true });
    vi.mocked(api).mockResolvedValueOnce([]);

    const deleteBtn = document.querySelector('#pl-manager-content .pl-mgr-delete') as HTMLElement;
    deleteBtn.click();
    await flush();
    // Dialog custom (EPIC-014) : confirmer explicitement.
    expect(state.activeModal).toBe('dialog');
    (document.getElementById('dialog-confirm') as HTMLButtonElement).click();
    await flush();
    await flush();

    expect(api).toHaveBeenCalledWith(
      '/playlists/rock',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
    expect(document.getElementById('pl-manager-content')!.textContent).not.toContain('rock');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: KEYBOARD GAPS
// ═══════════════════════════════════════════════════════════════════════════

describe('Keyboard gaps', () => {
  it('/ opens filter palette in normal mode', async () => {
    renderEpars();
    renderSource();

    const ev = dispatchKey('/');
    await flush();

    expect(ev.defaultPrevented).toBe(true);
    expect(state.filterActive).toBe(true);
    expect(document.getElementById('filter-palette')!.classList.contains('hidden')).toBe(false);
    expect(state.activePanel).toBe('source');
  });

  it('Escape stops audio when playing in normal mode', async () => {
    renderEpars();

    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();
    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(false);

    dispatchKey('Escape');
    await flush();

    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(true);
    expect(playBtn.textContent).toBe('▶');
  });

  it('Enter on a directory in Source Data expands it via keyboard router', async () => {
    renderSource();
    state.activePanel = 'source';
    setActivePanel('source');
    await flush();

    for (const el of document.querySelectorAll('#source-container .focused')) el.classList.remove('focused');

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    rockDir.classList.add('focused');
    expect(rockDir.classList.contains('expanded')).toBe(false);

    dispatchKey('Enter');
    await flush();

    expect(rockDir.classList.contains('expanded')).toBe(true);
    expect(rockDir.querySelector('.children')).not.toBeNull();
  });

  it('Space on a directory in Source Data expands it via keyboard router', async () => {
    renderSource();
    state.activePanel = 'source';
    setActivePanel('source');
    await flush();

    for (const el of document.querySelectorAll('#source-container .focused')) el.classList.remove('focused');

    const rockDir = document.querySelector(
      '#source-container .directory[data-dirpath="/home/music/Rock"]',
    ) as HTMLElement;
    rockDir.classList.add('focused');

    dispatchKey(' ');
    await flush();

    expect(rockDir.classList.contains('expanded')).toBe(true);
  });

  it('ArrowDown navigates directories in Source Data via keyboard router', async () => {
    renderSource();
    state.activePanel = 'source';
    setActivePanel('source');
    await flush();

    const dirs = document.querySelectorAll('#source-container .directory');
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs[0].classList.contains('focused')).toBe(true);

    if (dirs.length >= 2) {
      dispatchKey('ArrowDown');
      await flush();
      expect(dirs[1].classList.contains('focused')).toBe(true);
      expect(dirs[0].classList.contains('focused')).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: PLAYER BAR — interactions souris (seek, stop)
// ═══════════════════════════════════════════════════════════════════════════

describe('Player bar mouse', () => {
  it('clicking progress bar seeks audio to relative position', async () => {
    renderEpars();
    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();

    const progressBar = document.getElementById('player-progress')!;
    progressBar.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 400,
        right: 400,
        top: 0,
        bottom: 20,
        height: 20,
      }) as DOMRect;

    progressBar.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 200,
        clientY: 10,
      }),
    );

    const pct = parseFloat(document.getElementById('player-progress-fill')!.style.width) || 0;
    expect(pct).toBeCloseTo(50, -1);
  });

  it('clicking seek-backward button seeks audio backward', async () => {
    renderEpars();
    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();

    dispatchKey('ArrowRight', { shiftKey: true });
    dispatchKey('ArrowRight', { shiftKey: true });
    await flush();

    const beforePct = parseFloat(document.getElementById('player-progress-fill')!.style.width) || 0;

    document.getElementById('player-seek-bwd')!.click();
    await flush();

    const afterPct = parseFloat(document.getElementById('player-progress-fill')!.style.width) || 0;
    expect(afterPct).toBeLessThan(beforePct);
  });

  it('clicking stop button stops audio and hides player bar', async () => {
    renderEpars();
    const playBtn = document.querySelector('#epars-container .play-btn') as HTMLElement;
    playBtn.click();
    await flush();
    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(false);

    document.getElementById('player-stop')!.click();
    await flush();

    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(true);
    expect(playBtn.textContent).toBe('▶');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: INIT APP — chargement initial
// ═══════════════════════════════════════════════════════════════════════════

describe('Init app', () => {
  it('initApp loads cached data and renders panels', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ active: 0, configs: [{ name: 'default', source_data: '', epars_dirs: [] }] })
      .mockResolvedValueOnce({ source: state.sourceFiles, epars: state.eparsFiles })
      .mockResolvedValueOnce([{ filename: 'a.mp3', status: 'copied', timestamp: '2025-01-01' }]);

    const { initApp } = await import('./actions.js');
    await initApp();
    await flush();

    const eparsItems = document.querySelectorAll('#epars-container .file-row, #epars-container .directory');
    expect(eparsItems.length).toBeGreaterThan(0);

    const sourceDirs = document.querySelectorAll('#source-container .directory');
    expect(sourceDirs.length).toBeGreaterThan(0);

    expect(state.journal.length).toBe(1);

    expect(state.activePanel).toBe('epars');
    expect(document.getElementById('panel-left')!.classList.contains('panel-active')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TESTS: EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('renders empty state when no files are loaded', async () => {
    state.sourceFiles = {};
    state.eparsFiles = {};

    renderEpars();
    renderSource();
    await flush();

    const eparsItems = document.querySelectorAll('#epars-container .file-row');
    expect(eparsItems.length).toBe(0);

    const sourceDirs = document.querySelectorAll('#source-container .directory');
    expect(sourceDirs.length).toBe(0);
  });

  it('handles filenames with special characters', async () => {
    state.eparsFiles = {
      '/media/usb': {
        'tést ♫ ñ.mp3': { path: 'tést ♫ ñ.mp3', year: '2025', duration: 240, codec: 'MP3' },
        'a"b\'c.mp3': { path: 'a"b\'c.mp3', year: '2023', duration: 180, codec: 'FLAC' },
      },
    };

    renderEpars();
    await flush();

    const files = document.querySelectorAll('#epars-container .file');
    expect(files.length).toBe(2);
    expect(files[0].textContent).toBe('a"b\'c.mp3');
    expect(files[1].textContent).toBe('tést ♫ ñ.mp3');
  });

  it('handles very long filenames', async () => {
    const longName = `${'a'.repeat(120)}.mp3`;
    state.eparsFiles = {
      '/media/usb': { [longName]: { path: longName, year: '2024', duration: 100, codec: 'MP3' } },
    };

    renderEpars();
    await flush();

    const file = document.querySelector('#epars-container .file');
    expect(file).not.toBeNull();
    expect(file!.textContent).toBe(longName);
  });
});
