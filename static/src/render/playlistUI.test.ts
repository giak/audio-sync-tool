// ─── Tests: playlistUI.ts — bouton Cues (Task 8) ──────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockOpenCueEditor = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => ({
  playlists: [],
  pendingPlaylists: {},
  activePlaylistIndex: null,
  sourceFiles: {},
}));

vi.mock('../audio.js', () => ({ togglePlay: vi.fn() }));
vi.mock('../ui.js', () => ({ showContextMenu: vi.fn(), closeAllModals: vi.fn() }));
vi.mock('../playlist.js', () => ({
  createNewPlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  getActivePlaylistName: vi.fn(() => 'MaPl'),
  getPendingTracks: vi.fn(() => pendingTracks.tracks),
  removePendingPlaylist: vi.fn(),
  removeTrack: vi.fn(),
  renamePlaylist: vi.fn(),
  reorderTrack: vi.fn(),
  savePlaylist: vi.fn(),
  setPendingTracks: vi.fn(),
}));
vi.mock('../ratings.js', () => ({ getRating: vi.fn(() => undefined) }));
vi.mock('../state.js', () => ({ state: mockState }));
vi.mock('../utils.js', () => ({}));
vi.mock('./fileRow.js', () => ({
  makeFileEl: vi.fn(),
  makeFileTable: () => {
    const table = document.createElement('table');
    table.className = 'file-table';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    return table;
  },
}));
vi.mock('./sourceTree.js', () => ({
  renderDirTree: vi.fn(),
  togglePlaylistSourceDir: vi.fn(),
  toggleSourceDir: vi.fn(),
}));
vi.mock('./ratingEdit.js', () => ({
  _ratingClickHandler: vi.fn(),
  startRatingEdit: vi.fn(),
  startSourceRatingEdit: vi.fn(),
}));
vi.mock('./cueEditor.js', () => ({ openCueEditor: mockOpenCueEditor }));

import { togglePlay } from '../audio.js';
import { _clearMatchCache } from '../matchStatus.js';
import { showContextMenu } from '../ui.js';
import { renderPlaylistPanel } from './playlistUI.js';

const pendingTracks: { tracks: Array<{ filename: string; fullPath: string; duration?: number }> } = { tracks: [] };

describe('playlistUI bouton Cues', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="playlist-tabs"></div>
      <div id="playlist-panel"></div>
    `;
    pendingTracks.tracks = [];
    mockOpenCueEditor.mockReset();
    vi.mocked(togglePlay).mockClear();
  });

  afterEach(() => {
    pendingTracks.tracks = [];
    vi.unstubAllGlobals();
    _clearMatchCache();
  });

  it('affiche un bouton « Cues » sur chaque piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const btn = document.querySelector('.cue-btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Cues');
    expect(btn!.title).toContain('waveform');
  });

  it('le clic ouvre le cue editor avec la piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const btn = document.querySelector('.cue-btn') as HTMLButtonElement;
    btn.click();
    expect(mockOpenCueEditor).toHaveBeenCalledWith({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
  });

  it("le menu contextuel propose l'éditeur cues / loops", () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const items = vi.mocked(showContextMenu).mock.lastCall?.[2] as Array<{ label: string }>;
    expect(items.map(i => i.label)).toContain('Cues / loops (waveform)');
  });

  it("l'action du menu contextuel ouvre l'éditeur avec la piste", () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const items = vi.mocked(showContextMenu).mock.lastCall?.[2] as Array<{ label: string; action: () => void }>;
    items.find(i => i.label === 'Cues / loops (waveform)')!.action();
    expect(mockOpenCueEditor).toHaveBeenCalledWith({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
  });

  it('affiche un badge de match NML (placeholder lazy) sur chaque piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const badge = document.querySelector('.pl-track-match') as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge!.dataset.fullpath).toBe('/x/a.mp3');
    expect(badge!.textContent).toBe('…');
  });

  it('remplit le badge en lazy avec le statut réel (matché → ✓ NML)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, entries: [{ filename: 'a.mp3' }], multiple: false }),
    }));
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    await new Promise(r => setTimeout(r, 10));
    const badge = document.querySelector('.pl-track-match') as HTMLElement | null;
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('NML');
    expect(badge!.className).toContain('pl-match-ok');
    // La mutation in-place conserve data-fullpath (fix review point 4).
    expect(badge!.dataset.fullpath).toBe('/x/a.mp3');
  });

  it('badge « non importé » quand aucune entrée NML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, entries: [], multiple: false }),
    }));
    pendingTracks.tracks = [{ filename: 'b.mp3', fullPath: '/x/b.mp3', duration: 60 }];
    renderPlaylistPanel();
    await new Promise(r => setTimeout(r, 10));
    const badge = document.querySelector('.pl-track-match') as HTMLElement;
    expect(badge.textContent).toContain('non importé');
    expect(badge.className).toContain('pl-match-missing');
  });

  it('badge neutre « ? » si l\'appel API échoue (pas d\'alerte)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'x' }) }));
    pendingTracks.tracks = [{ filename: 'c.mp3', fullPath: '/x/c.mp3', duration: 60 }];
    renderPlaylistPanel();
    await new Promise(r => setTimeout(r, 10));
    const badge = document.querySelector('.pl-track-match') as HTMLElement;
    expect(badge.className).toContain('pl-match-error');
  });

  it('affiche un bouton play ▶ (title Écouter) sur chaque piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const playBtn = document.querySelector('.play-btn') as HTMLElement | null;
    expect(playBtn).not.toBeNull();
    expect(playBtn!.textContent).toBe('▶');
    expect(playBtn!.title).toBe('Écouter');
  });

  it('le clic sur play lance togglePlay avec la piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const playBtn = document.querySelector('.play-btn') as HTMLElement;
    playBtn.click();
    expect(togglePlay).toHaveBeenCalledWith('a.mp3', '/x/a.mp3', playBtn);
  });

  it('le clic sur play ne déplace pas le focus de la ligne', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const playBtn = document.querySelector('.play-btn') as HTMLElement;
    const track = document.querySelector('.pl-track') as HTMLElement;
    playBtn.click();
    expect(track.classList.contains('focused')).toBe(false);
  });
});
