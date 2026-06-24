// ─── Unit tests: commands/playlist.ts — 17 playlist-mode keyboard bindings ───
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

// ── Hoist spies ───────────────────────────────────────────────────────────
const { bind, state, navigateFocus, navigateColumn, getFocusedItem, renderPlaylistSource,
  patchPlaylistSourceFile, addTrack, getActivePlaylistName, getPendingTracks,
  removeTrack, reorderTrack, savePlaylist, exportPlaylist,
  openModal, showToast, showError, openFilterPalette, closeAllModals
} = vi.hoisted(() => ({
  bind: vi.fn(),
  state: {
    playlistFocus: 'source',
    playlistMode: true,
    activePlaylistIndex: 0,
    pendingPlaylists: { 'test-playlist': [] },
    playlistTrackFocusIndex: null,
    playlists: [],
  },
  navigateFocus: vi.fn(),
  navigateColumn: vi.fn(),
  getFocusedItem: vi.fn(),
  renderPlaylistSource: vi.fn(),
  patchPlaylistSourceFile: vi.fn(),
  addTrack: vi.fn(() => true),
  getActivePlaylistName: vi.fn(() => 'test-playlist'),
  getPendingTracks: vi.fn(() => [{ filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3', year: null, duration: null, codec: null }]),
  removeTrack: vi.fn(),
  reorderTrack: vi.fn(),
  savePlaylist: vi.fn(),
  exportPlaylist: vi.fn(),
  openModal: vi.fn(),
  showToast: vi.fn(),
  showError: vi.fn(),
  openFilterPalette: vi.fn(),
  closeAllModals: vi.fn(),
}));

// Element.prototype.scrollIntoView polyfill for JSDOM
Element.prototype.scrollIntoView = vi.fn();

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock('./registry.js', () => ({ registry: { bind } }));
vi.mock('../focus.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../focus.js')>();
  return { ...mod, navigateFocus, navigateColumn };
  // getFocusedItem kept REAL — Enter handler needs real DOM query
});
vi.mock('../render/index.js', () => ({ renderPlaylistSource, patchPlaylistSourceFile }));
vi.mock('../playlist.js', () => ({ addTrack, getActivePlaylistName, getPendingTracks, removeTrack, reorderTrack, savePlaylist, exportPlaylist }));
vi.mock('../ui.js', () => ({ openModal, showToast, showError, openFilterPalette, closeAllModals }));
vi.mock('../state.js', () => ({ state, emit: vi.fn(), on: vi.fn() }));

import './playlist.js';

// ── Capture bindings ──────────────────────────────────────────────────────
type Binding = Record<string, unknown>;
function find(matcher: Partial<Binding>): Binding {
  const call = bind.mock.calls.find((a: unknown[]) => {
    const b = a[0] as Binding;
    return Object.entries(matcher).every(([k, v]) => b[k] === v);
  });
  return call![0] as Binding;
}

let B_tab: Binding, B_space: Binding, B_F7: Binding, B_slash: Binding,
  B_del: Binding, B_bs: Binding, B_ctrlS: Binding, B_ctrlE: Binding,
  B_ctrlUp: Binding, B_ctrlDown: Binding,
  B_down: Binding, B_up: Binding, B_enter: Binding,
  B_left: Binding, B_right: Binding;

beforeAll(() => {
  B_tab = find({ key: 'Tab', playlistMode: true });
  B_space = find({ key: ' ', playlistMode: true, playlistFocus: 'source', isInput: false });
  B_F7 = find({ key: 'F7', playlistMode: true });
  B_slash = find({ key: '/', playlistMode: true, isInput: false });
  B_del = find({ key: 'Delete', playlistMode: true, playlistFocus: 'sidebar', isInput: false });
  B_bs = find({ key: 'Backspace', playlistMode: true, playlistFocus: 'sidebar', isInput: false });
  B_ctrlS = find({ key: 's', ctrlKey: true, playlistMode: true });
  B_ctrlE = find({ key: 'e', ctrlKey: true, playlistMode: true });
  B_ctrlUp = find({ key: 'ArrowUp', ctrlKey: true, playlistMode: true, playlistFocus: 'sidebar' });
  B_ctrlDown = find({ key: 'ArrowDown', ctrlKey: true, playlistMode: true, playlistFocus: 'sidebar' });
  B_down = find({ key: 'ArrowDown', playlistMode: true, isInput: false });
  B_up = find({ key: 'ArrowUp', playlistMode: true, isInput: false });
  B_enter = find({ key: 'Enter', playlistMode: true, playlistFocus: 'source', isInput: false });
  B_left = find({ key: 'ArrowLeft', playlistMode: true, isInput: false });
  B_right = find({ key: 'ArrowRight', playlistMode: true, isInput: false });
});

describe('commands/playlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    state.playlistFocus = 'source';
    state.pendingPlaylists = { 'test-playlist': [] };
    state.activePlaylistIndex = 0;
    state.playlistMode = true;
    // Reset mock implementations that tests may have changed
    getPendingTracks.mockImplementation(() => [{ filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3', year: null, duration: null, codec: null }]);
    addTrack.mockImplementation(() => true);
  });

  afterAll(() => { document.body.innerHTML = ''; });

  describe('Tab — focus toggle', () => {
    it('toggles playlistFocus from source to sidebar', () => {
      state.playlistFocus = 'source';
      const sourceEl = document.createElement('div');
      sourceEl.id = 'playlist-source';
      sourceEl.classList.add('panel-active');
      document.body.appendChild(sourceEl);
      const sidebarEl = document.createElement('div');
      sidebarEl.id = 'playlist-sidebar';
      document.body.appendChild(sidebarEl);

      B_tab.handler();
      expect(state.playlistFocus).toBe('sidebar');
      expect(sourceEl.classList.contains('panel-active')).toBe(false);
      expect(sidebarEl.classList.contains('panel-active')).toBe(true);
    });

    it('toggles playlistFocus from sidebar to source', () => {
      state.playlistFocus = 'sidebar';
      const sourceEl = document.createElement('div');
      sourceEl.id = 'playlist-source';
      document.body.appendChild(sourceEl);
      const sidebarEl = document.createElement('div');
      sidebarEl.id = 'playlist-sidebar';
      sidebarEl.classList.add('panel-active');
      document.body.appendChild(sidebarEl);

      B_tab.handler();
      expect(state.playlistFocus).toBe('source');
      expect(sourceEl.classList.contains('panel-active')).toBe(true);
      expect(sidebarEl.classList.contains('panel-active')).toBe(false);
    });
  });

  describe('Space — add/remove track', () => {
    it('adds a track when focused on a .file-row and addTrack returns true', () => {
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row focused';
      const label = document.createElement('span');
      label.className = 'file';
      label.textContent = 'song.mp3';
      label.dataset.fullpath = '/base/song.mp3';
      row.appendChild(label);
      c.appendChild(row);

      addTrack.mockReturnValue(true);
      B_space.handler();
      expect(addTrack).toHaveBeenCalled();
      expect(label.classList.contains('in-playlist')).toBe(true);
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('song.mp3 ajouté'));
    });

    it('removes a track when addTrack returns false (already in playlist)', () => {
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row focused';
      const label = document.createElement('span');
      label.className = 'file';
      label.textContent = 'song.mp3';
      label.dataset.fullpath = '/base/song.mp3';
      label.classList.add('in-playlist');
      row.appendChild(label);
      c.appendChild(row);

      addTrack.mockReturnValue(false);
      B_space.handler();
      expect(removeTrack).toHaveBeenCalled();
      expect(label.classList.contains('in-playlist')).toBe(false);
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('song.mp3 retiré'));
    });

    it('shows info toast when no focused file-row exists', () => {
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      document.body.appendChild(c);
      B_space.handler();
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('focuser un fichier'));
      c.remove();
    });
  });

  describe('F7 and / — open filter', () => {
    it('F7 opens filter palette', () => {
      B_F7.handler();
      expect(openFilterPalette).toHaveBeenCalledWith(expect.any(Function), renderPlaylistSource);
    });

    it('/ opens filter palette', () => {
      B_slash.handler();
      expect(openFilterPalette).toHaveBeenCalledWith(expect.any(Function), renderPlaylistSource);
    });
  });

  describe('Delete/Backspace — remove track from sidebar', () => {
    it('Delete clicks the pl-track-remove button on focused track', () => {
      const tracks = document.createElement('div');
      tracks.id = 'playlist-tracks';
      const track = document.createElement('div');
      track.className = 'pl-track focused';
      const removeBtn = document.createElement('span');
      removeBtn.className = 'pl-track-remove';
      removeBtn.dataset.fullpath = '/a.mp3';
      const click = vi.fn();
      removeBtn.onclick = click;
      track.appendChild(removeBtn);
      tracks.appendChild(track);
      document.body.appendChild(tracks);

      B_del.handler();
      expect(click).toHaveBeenCalled();
    });

    it('Backspace clicks the pl-track-remove button on focused track', () => {
      const tracks = document.createElement('div');
      tracks.id = 'playlist-tracks';
      const track = document.createElement('div');
      track.className = 'pl-track focused';
      const removeBtn = document.createElement('span');
      removeBtn.className = 'pl-track-remove';
      removeBtn.dataset.fullpath = '/a.mp3';
      const click = vi.fn();
      removeBtn.onclick = click;
      track.appendChild(removeBtn);
      tracks.appendChild(track);
      document.body.appendChild(tracks);

      B_bs.handler();
      expect(click).toHaveBeenCalled();
    });
  });

  describe('Ctrl+S — save playlist', () => {
    it('saves the current playlist', async () => {
      savePlaylist.mockResolvedValue({});
      await B_ctrlS.handler();
      expect(savePlaylist).toHaveBeenCalledWith('test-playlist', expect.any(Array));
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('sauvegardée'));
    });

    it('shows warning when playlist is empty', () => {
      getPendingTracks.mockReturnValue([]);
      B_ctrlS.handler();
      expect(savePlaylist).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('vide'));
    });
  });

  describe('Ctrl+E — export modal', () => {
    it('opens export dialog', async () => {
      const dlg = document.createElement('div');
      dlg.id = 'dialog-msg';
      document.body.appendChild(dlg);
      const confirm = document.createElement('button');
      confirm.id = 'dialog-confirm';
      document.body.appendChild(confirm);
      const cancel = document.createElement('button');
      cancel.id = 'dialog-cancel';
      document.body.appendChild(cancel);

      await B_ctrlE.handler();
      expect(openModal).toHaveBeenCalledWith('dialog');
      dlg.remove();
      confirm.remove();
      cancel.remove();
    });

    it('shows warning when playlist is empty', () => {
      getPendingTracks.mockReturnValue([]);
      B_ctrlE.handler();
      expect(openModal).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('vide'));
    });
  });

  describe('Ctrl+↑↓ — reorder', () => {
    function setupTracks(): void {
      const tracks = document.createElement('div');
      tracks.id = 'playlist-tracks';
      ['a.mp3', 'b.mp3', 'c.mp3'].forEach((n, i) => {
        const t = document.createElement('div');
        t.className = 'pl-track' + (i === 1 ? ' focused' : '');
        t.textContent = n;
        tracks.appendChild(t);
      });
      document.body.appendChild(tracks);
    }

    it('Ctrl+ArrowUp calls reorderTrack with index-1', () => {
      setupTracks();
      B_ctrlUp.handler();
      expect(reorderTrack).toHaveBeenCalledWith('test-playlist', 1, 0);
    });

    it('Ctrl+ArrowDown calls reorderTrack with index+1', () => {
      setupTracks();
      B_ctrlDown.handler();
      expect(reorderTrack).toHaveBeenCalledWith('test-playlist', 1, 2);
    });
  });

  describe('↑↓ — navigate source or sidebar', () => {
    it('ArrowDown in source calls navigateFocus(container, 1)', () => {
      state.playlistFocus = 'source';
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      c.innerHTML = '<div class="file-row"></div><div class="file-row"></div>';
      document.body.appendChild(c);

      B_down.handler();
      expect(navigateFocus).toHaveBeenCalledWith(c, 1);
    });

    it('ArrowDown in sidebar moves focus to next track', () => {
      state.playlistFocus = 'sidebar';
      const tracks = document.createElement('div');
      tracks.id = 'playlist-tracks';
      ['a', 'b', 'c'].forEach(n => {
        const t = document.createElement('div');
        t.className = 'pl-track';
        t.textContent = n;
        tracks.appendChild(t);
      });
      document.body.appendChild(tracks);

      B_down.handler();
      const focused = document.querySelector('#playlist-tracks .focused');
      expect(focused).not.toBeNull();
    });

    it('ArrowUp in sidebar moves focus to previous track', () => {
      state.playlistFocus = 'sidebar';
      const tracks = document.createElement('div');
      tracks.id = 'playlist-tracks';
      ['a', 'b', 'c'].forEach((n, i) => {
        const t = document.createElement('div');
        t.className = 'pl-track' + (i === 1 ? ' focused' : '');
        t.textContent = n;
        tracks.appendChild(t);
      });
      document.body.appendChild(tracks);

      B_up.handler();
      const focused = document.querySelector('#playlist-tracks .focused');
      expect(focused).not.toBeNull();
    });
  });

  describe('Enter — play or toggle directory', () => {
    it('clicks play-btn on focused .file-row', () => {
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row focused';
      const btn = document.createElement('span');
      btn.className = 'play-btn';
      const click = vi.fn();
      btn.onclick = click;
      row.appendChild(btn);
      c.appendChild(row);

      B_enter.handler();
      expect(click).toHaveBeenCalled();
    });
  });

  describe('←→ — column nav', () => {
    it('ArrowLeft calls navigateColumn(-1) when source focused and no audio playing', () => {
      state.playlistFocus = 'source';
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      document.body.appendChild(c);

      B_left.handler();
      expect(navigateColumn).toHaveBeenCalledWith(c, -1);
    });

    it('ArrowRight calls navigateColumn(1)', () => {
      state.playlistFocus = 'source';
      const c = document.createElement('div');
      c.id = 'playlist-source-container';
      document.body.appendChild(c);

      B_right.handler();
      expect(navigateColumn).toHaveBeenCalledWith(c, 1);
    });
  });
});
