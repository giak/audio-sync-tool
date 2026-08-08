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
vi.mock('./fileRow.js', () => ({ makeFileEl: vi.fn() }));
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
  });

  afterEach(() => {
    pendingTracks.tracks = [];
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
});
