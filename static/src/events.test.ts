// ─── Unit tests: event subscriptions end-to-end ──────────────────────────
// Uses real `on()` / `emit()` from state.js, spies on renderPlaylistPanel.
// Unlike render.test.ts, state.js is NOT mocked here — we need real event wiring.
//
// IMPORTANT: setupRenderSubscriptions() is called ONCE in beforeAll, not per
// test. The EventEmitter accumulates listeners — calling it every test would
// cause cascading listener calls (each listener fires on every emission).

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock all render.ts dependencies EXCEPT state.js (need real on/emit) ──

vi.mock('./audio.js', () => ({
  togglePlay: vi.fn(),
}));

vi.mock('./focus.js', () => ({
  setActivePanel: vi.fn(),
  focusItemByElement: vi.fn(),
  revalidateFocus: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  formatDuration: vi.fn(() => ''),
  computeStatus: vi.fn(() => 'doublon' as const),
  countAllEparsFiles: vi.fn(() => 0),
  dirHasMatchingDescendant: vi.fn(() => false),
}));

vi.mock('./ui.js', () => ({
  showContextMenu: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('./ratings.js', () => ({
  getRating: vi.fn(),
}));

vi.mock('./render/journalUI.js', () => ({
  renderJournal: vi.fn(),
}));

vi.mock('./render/eparsUI.js', () => ({
  renderEpars: vi.fn(),
}));

vi.mock('./render/sourceTree.js', () => ({
  renderSource: vi.fn(),
  toggleSourceDir: vi.fn(),
  renderDirTree: vi.fn(),
  togglePlaylistSourceDir: vi.fn(),
}));

// Partially mock playlistUI — spy on renderPlaylistPanel, keep other exports real
// The spy calls through to the real function so we can test DOM effects too.
vi.mock('./render/playlistUI.js', async importOriginal => {
  const mod = await importOriginal();
  const spy = vi.fn();
  spy.mockImplementation((...args: unknown[]) => (mod as any).renderPlaylistPanel(...args));
  return { ...mod, renderPlaylistPanel: spy };
});

vi.mock('./render/ratingEdit.js', () => ({
  startRatingEdit: vi.fn(),
  startSourceRatingEdit: vi.fn(),
  _ratingClickHandler: vi.fn(),
}));

vi.mock('./render/batchCopy.js', () => ({
  getBatchCopy: vi.fn(),
}));

vi.mock('./render/dragDrop.js', () => ({
  doDragCopy: vi.fn(),
}));

// ── Imports (real state.js — no mock) ─────────────────────────────────────

import { renderPlaylistPanel } from './render/playlistUI.js';
import { setupRenderSubscriptions } from './render.js';
import { emit, state } from './state.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Wait for one RAF frame so batched emits flush */
function tick(): Promise<void> {
  return new Promise(r => requestAnimationFrame(r));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('event subscriptions end-to-end', () => {
  // Register subscriptions ONCE — the EventEmitter accumulates listeners
  beforeAll(() => {
    setupRenderSubscriptions();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    state.pendingPlaylists = {};
    state.playlists = [];
    state.activePlaylistIndex = null;
    state.playlistMode = false;
    // Flush any batched emits from the state resets above (e.g. activePlaylistIndex:changed)
    await new Promise(r => requestAnimationFrame(r));
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── eparsPlaylist:changed → renderPlaylistPanel ──────────────────────

  it('eparsPlaylist:changed triggers renderPlaylistPanel when playlist-layout is visible', async () => {
    const layout = document.createElement('div');
    layout.id = 'playlist-layout';
    layout.classList.remove('hidden');
    const tabs = document.createElement('div');
    tabs.id = 'playlist-tabs';
    layout.appendChild(tabs);
    const panel = document.createElement('div');
    panel.id = 'playlist-panel';
    layout.appendChild(panel);
    document.body.appendChild(layout);

    emit('eparsPlaylist:changed');
    await tick();
    expect(renderPlaylistPanel).toHaveBeenCalled();

    layout.remove();
  });

  it('eparsPlaylist:changed does NOT trigger renderPlaylistPanel when playlist-layout is hidden', async () => {
    const layout = document.createElement('div');
    layout.id = 'playlist-layout';
    layout.classList.add('hidden');
    document.body.appendChild(layout);

    emit('eparsPlaylist:changed');
    await tick();
    expect(renderPlaylistPanel).not.toHaveBeenCalled();

    layout.remove();
  });

  it('eparsPlaylist:changed does NOT trigger renderPlaylistPanel when playlist-layout is absent from DOM', async () => {
    emit('eparsPlaylist:changed');
    await tick();
    expect(renderPlaylistPanel).not.toHaveBeenCalled();
  });

  it('eparsPlaylist:changed renders real track and tab content into the DOM', async () => {
    // Set up real playlist-layout with tabs + panel containers
    const layout = document.createElement('div');
    layout.id = 'playlist-layout';
    layout.classList.remove('hidden');

    const tabs = document.createElement('div');
    tabs.id = 'playlist-tabs';
    layout.appendChild(tabs);

    const panel = document.createElement('div');
    panel.id = 'playlist-panel';
    layout.appendChild(panel);

    document.body.appendChild(layout);

    // Seed real track data
    state.pendingPlaylists['piste-test'] = [
      { filename: 'son.mp3', fullPath: '/src/son.mp3', relPath: 'son.mp3', year: '2024', duration: 180, codec: 'MP3' },
    ];
    state.activePlaylistIndex = 0;

    // Clear the spy call count from the activePlaylistIndex:changed emission
    vi.clearAllMocks();

    emit('eparsPlaylist:changed');
    await tick();

    // -- DOM assertions on real renderPlaylistPanel output --

    // Tab rendered with the playlist name
    const tabEl = tabs.querySelector('.pl-tab');
    expect(tabEl).not.toBeNull();
    expect(tabEl!.textContent).toContain('piste-test');

    // Track row rendered with filename
    const trackName = panel.querySelector('.pl-track-name');
    expect(trackName).not.toBeNull();
    expect(trackName!.textContent).toBe('son.mp3');

    // Track metadata rendered
    const trackYear = panel.querySelector('.pl-track-year');
    expect(trackYear?.textContent).toBe('2024');

    const trackCodec = panel.querySelector('.pl-track-codec');
    expect(trackCodec?.textContent).toBe('MP3');

    const trackDuration = panel.querySelector('.pl-track-duration');
    expect(trackDuration?.textContent).toBe('3:00');

    // Info line shows track count
    const info = panel.querySelector('.pl-info');
    expect(info?.textContent).toContain('1 morceau');

    layout.remove();
  });

  // ── audio:changed → cleanup ──────────────────────────────────────────

  it('audio:changed removes .led-playing from playlist tracks when sidebar is visible', async () => {
    const sidebar = document.createElement('div');
    sidebar.id = 'playlist-sidebar';
    sidebar.classList.remove('hidden');
    const panel = document.createElement('div');
    panel.id = 'playlist-panel';
    panel.innerHTML = '<span class="led-playing">track</span>';
    sidebar.appendChild(panel);
    document.body.appendChild(sidebar);

    expect(panel.querySelector('.led-playing')).not.toBeNull();

    emit('audio:changed');
    await tick();

    expect(panel.querySelector('.led-playing')).toBeNull();
    sidebar.remove();
  });

  it('audio:changed does nothing when playlist-sidebar is hidden', async () => {
    const sidebar = document.createElement('div');
    sidebar.id = 'playlist-sidebar';
    sidebar.classList.add('hidden');
    const panel = document.createElement('div');
    panel.id = 'playlist-panel';
    panel.innerHTML = '<span class="led-playing">track</span>';
    sidebar.appendChild(panel);
    document.body.appendChild(sidebar);

    emit('audio:changed');
    await tick();

    // .led-playing should still be present (no cleanup because sidebar is hidden)
    expect(panel.querySelector('.led-playing')).not.toBeNull();
    sidebar.remove();
  });

  it('audio:changed does not throw when sidebar is absent from DOM', async () => {
    expect(() => {
      emit('audio:changed');
    }).not.toThrow();

    await tick();
  });

  // ── activePlaylistIndex:changed → renderPlaylistPanel ──────────────

  it('activePlaylistIndex:changed triggers renderPlaylistPanel when layout is visible', async () => {
    const layout = document.createElement('div');
    layout.id = 'playlist-layout';
    layout.classList.remove('hidden');
    const tabs = document.createElement('div');
    tabs.id = 'playlist-tabs';
    layout.appendChild(tabs);
    const panel = document.createElement('div');
    panel.id = 'playlist-panel';
    layout.appendChild(panel);
    document.body.appendChild(layout);

    state.activePlaylistIndex = 0;
    await tick();
    expect(renderPlaylistPanel).toHaveBeenCalled();

    layout.remove();
  });

  it('activePlaylistIndex:changed does NOT trigger renderPlaylistPanel when layout is hidden', async () => {
    const layout = document.createElement('div');
    layout.id = 'playlist-layout';
    layout.classList.add('hidden');
    document.body.appendChild(layout);

    state.activePlaylistIndex = 1;
    await tick();
    expect(renderPlaylistPanel).not.toHaveBeenCalled();

    layout.remove();
  });

  // ── Batched emission ─────────────────────────────────────────────────

  it('multiple emissions in same sync block are batched into one RAF frame', async () => {
    const layout = document.createElement('div');
    layout.id = 'playlist-layout';
    layout.classList.remove('hidden');
    const tabs = document.createElement('div');
    tabs.id = 'playlist-tabs';
    layout.appendChild(tabs);
    const panel = document.createElement('div');
    panel.id = 'playlist-panel';
    layout.appendChild(panel);
    document.body.appendChild(layout);

    // Emit twice synchronously — _dirty Set deduplicates
    emit('eparsPlaylist:changed');
    emit('eparsPlaylist:changed');
    await tick();

    // Listener fires once because _dirty is a Set (duplicate key ignored)
    expect(renderPlaylistPanel).toHaveBeenCalledTimes(1);

    layout.remove();
  });
});
