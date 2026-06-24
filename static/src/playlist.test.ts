// ─── Unit tests for playlist.ts ──────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './state.js';

// Mock api.js before importing playlist.ts
vi.mock('./api.js', () => ({
  api: vi.fn(),
}));

// Partially mock state.js to spy on emit() while keeping real state/on
vi.mock('./state.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, emit: vi.fn() };
});

import { api } from './api.js';
import { emit } from './state.js';
import {
  addTrack,
  createNewPlaylist,
  deletePlaylist,
  exportPlaylist,
  getActivePlaylistName,
  getPendingTracks,
  loadPlaylists,
  removePendingPlaylist,
  removeTrack,
  renamePlaylist,
  reorderTrack,
  savePlaylist,
  setPendingTracks,
} from './playlist.js';

// ── Helpers ───────────────────────────────────────────────────────────────

interface TrackInput {
  filename: string;
  fullPath?: string;
  year?: string;
  duration?: number;
  codec?: string;
  [key: string]: unknown;
}

function makeTrack(filename: string, extra: TrackInput = {}): Record<string, unknown> {
  return {
    filename,
    fullPath: `/music/${filename}`,
    relPath: filename,
    year: '2024',
    duration: 180,
    codec: 'MP3 320kbps',
    ...extra,
  };
}

beforeEach(() => {
  state.pendingPlaylists = {};
  state.playlists = [];
  state.activePlaylistIndex = null;
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Pending state management
// ═══════════════════════════════════════════════════════════════════════════

describe('createNewPlaylist', () => {
  it('creates an empty pending playlist', () => {
    createNewPlaylist('test-pl');
    expect(getPendingTracks('test-pl')).toEqual([]);
    expect(state.pendingPlaylists['test-pl']).toEqual([]);
  });

  it('does nothing if the name already exists', () => {
    createNewPlaylist('test-pl');
    getPendingTracks('test-pl').push(makeTrack('a.mp3') as any);
    createNewPlaylist('test-pl'); // should NOT reset
    expect(getPendingTracks('test-pl')).toHaveLength(1);
  });

  it('returns the playlist name', () => {
    const result = createNewPlaylist('my-set');
    expect(result).toBe('my-set');
  });
});

describe('getPendingTracks / setPendingTracks', () => {
  it('returns empty array for nonexistent playlist', () => {
    expect(getPendingTracks('nonexistent')).toEqual([]);
  });

  it('setPendingTracks replaces tracks', () => {
    setPendingTracks('pl', [makeTrack('a.mp3') as any]);
    expect(getPendingTracks('pl')).toHaveLength(1);
    expect(getPendingTracks('pl')[0].filename).toBe('a.mp3');
  });

  it('setPendingTracks can set empty array', () => {
    setPendingTracks('pl', []);
    expect(getPendingTracks('pl')).toEqual([]);
  });
});

describe('addTrack', () => {
  beforeEach(() => {
    createNewPlaylist('pl');
  });

  it('adds a track and returns true', () => {
    const track = makeTrack('song.mp3');
    const result = addTrack('pl', track as any);
    expect(result).toBe(true);
    expect(getPendingTracks('pl')).toHaveLength(1);
    expect(getPendingTracks('pl')[0]).toEqual(track);
  });

  it('refuses duplicate tracks by fullPath (spec §6.2)', () => {
    const track = makeTrack('song.mp3', { fullPath: '/music/song.mp3' });
    addTrack('pl', track as any);
    const dupResult = addTrack('pl', track as any);
    expect(dupResult).toBe(false);
    expect(getPendingTracks('pl')).toHaveLength(1);
  });

  it('treats tracks with different fullPath as distinct (same filename, different dir)', () => {
    addTrack('pl', makeTrack('song.mp3', { fullPath: '/a/song.mp3' }) as any);
    const result = addTrack('pl', makeTrack('song.mp3', { fullPath: '/b/song.mp3' }) as any);
    expect(result).toBe(true);
    expect(getPendingTracks('pl')).toHaveLength(2);
  });

  it('adds multiple tracks sequentially', () => {
    addTrack('pl', makeTrack('a.mp3') as any);
    addTrack('pl', makeTrack('b.mp3') as any);
    addTrack('pl', makeTrack('c.mp3') as any);
    expect(getPendingTracks('pl')).toHaveLength(3);
  });
});

describe('removeTrack', () => {
  beforeEach(() => {
    createNewPlaylist('pl');
    addTrack('pl', makeTrack('a.mp3') as any);
    addTrack('pl', makeTrack('b.mp3') as any);
    addTrack('pl', makeTrack('c.mp3') as any);
  });

  it('removes a track by fullPath', () => {
    removeTrack('pl', '/music/b.mp3');
    const tracks = getPendingTracks('pl');
    expect(tracks).toHaveLength(2);
    expect(tracks.map(t => t.filename)).toEqual(['a.mp3', 'c.mp3']);
  });

  it('does nothing when fullPath does not exist', () => {
    removeTrack('pl', '/music/nonexistent.mp3');
    expect(getPendingTracks('pl')).toHaveLength(3);
  });

  it('removing all tracks results in empty array', () => {
    removeTrack('pl', '/music/a.mp3');
    removeTrack('pl', '/music/b.mp3');
    removeTrack('pl', '/music/c.mp3');
    expect(getPendingTracks('pl')).toEqual([]);
  });
});

describe('reorderTrack', () => {
  beforeEach(() => {
    createNewPlaylist('pl');
    addTrack('pl', makeTrack('A.mp3') as any);
    addTrack('pl', makeTrack('B.mp3') as any);
    addTrack('pl', makeTrack('C.mp3') as any);
  });

  it('moves a track from index 0 to index 2', () => {
    reorderTrack('pl', 0, 2);
    const tracks = getPendingTracks('pl');
    expect(tracks[0].filename).toBe('B.mp3');
    expect(tracks[1].filename).toBe('C.mp3');
    expect(tracks[2].filename).toBe('A.mp3');
  });

  it('moves a track from index 2 to index 0', () => {
    reorderTrack('pl', 2, 0);
    const tracks = getPendingTracks('pl');
    expect(tracks[0].filename).toBe('C.mp3');
    expect(tracks[1].filename).toBe('A.mp3');
    expect(tracks[2].filename).toBe('B.mp3');
  });

  it('moves a track from index 1 to index 1 (no-op)', () => {
    reorderTrack('pl', 1, 1);
    const tracks = getPendingTracks('pl');
    expect(tracks.map(t => t.filename)).toEqual(['A.mp3', 'B.mp3', 'C.mp3']);
  });

  it('does nothing when oldIndex < 0', () => {
    reorderTrack('pl', -1, 1);
    expect(getPendingTracks('pl')).toHaveLength(3);
  });

  it('does nothing when oldIndex >= length', () => {
    reorderTrack('pl', 5, 1);
    expect(getPendingTracks('pl')).toHaveLength(3);
  });

  it('does nothing when newIndex < 0', () => {
    reorderTrack('pl', 0, -1);
    expect(getPendingTracks('pl')).toHaveLength(3);
  });

  it('does nothing when newIndex >= length', () => {
    reorderTrack('pl', 0, 10);
    expect(getPendingTracks('pl')).toHaveLength(3);
  });

  it('handles empty playlist gracefully', () => {
    createNewPlaylist('empty');
    expect(() => reorderTrack('empty', 0, 1)).not.toThrow();
  });
});

describe('removePendingPlaylist', () => {
  it('removes a pending playlist entirely', () => {
    createNewPlaylist('pl');
    addTrack('pl', makeTrack('A.mp3') as any);
    removePendingPlaylist('pl');
    expect(state.pendingPlaylists).toEqual({});
    expect(getPendingTracks('pl')).toEqual([]);
  });

  it('does nothing for nonexistent playlist', () => {
    removePendingPlaylist('ghost');
    expect(state.pendingPlaylists).toEqual({});
  });
});

describe('getActivePlaylistName', () => {
  it('returns the name at activePlaylistIndex', () => {
    createNewPlaylist('set-a');
    createNewPlaylist('set-b');
    state.activePlaylistIndex = 1;
    expect(getActivePlaylistName()).toBe('set-b');
  });

  it('returns first playlist when index is 0', () => {
    createNewPlaylist('first');
    createNewPlaylist('second');
    state.activePlaylistIndex = 0;
    expect(getActivePlaylistName()).toBe('first');
  });

  it('falls back to playlist-1 when no pending playlists exist', () => {
    state.activePlaylistIndex = null;
    expect(getActivePlaylistName()).toBe('playlist-1');
  });

  it('falls back to playlist-1 when index is out of range', () => {
    createNewPlaylist('only');
    state.activePlaylistIndex = 5;
    expect(getActivePlaylistName()).toBe('playlist-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Event emissions
// ═══════════════════════════════════════════════════════════════════════════

describe('event emissions', () => {
  it('createNewPlaylist emits eparsPlaylist:changed', () => {
    createNewPlaylist('set-a');
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
  });

  it('setPendingTracks emits eparsPlaylist:changed', () => {
    setPendingTracks('set-a', []);
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
  });

  it('addTrack emits eparsPlaylist:changed (twice — via setPendingTracks + explicit)', () => {
    createNewPlaylist('pl');
    vi.clearAllMocks(); // clear the emit from createNewPlaylist
    const track = { filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3', year: '2024', duration: 180, codec: 'MP3' } as any;
    addTrack('pl', track);
    // setPendingTracks emits once, addTrack emits once → 2 total
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('addTrack does NOT emit when duplicate (false return)', () => {
    createNewPlaylist('pl');
    const track = { filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3' } as any;
    addTrack('pl', track); // first add → emits
    vi.clearAllMocks();
    const result = addTrack('pl', track); // duplicate → no emit
    expect(result).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('removeTrack emits eparsPlaylist:changed (twice — via setPendingTracks + explicit)', () => {
    createNewPlaylist('pl');
    addTrack('pl', { filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3' } as any);
    vi.clearAllMocks();
    removeTrack('pl', '/a.mp3');
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('removeTrack still emits (setPendingTracks + explicit) even when fullPath not found', () => {
    createNewPlaylist('pl');
    vi.clearAllMocks();
    removeTrack('pl', '/nonexistent.mp3');
    // setPendingTracks emits once, then removeTrack emits again → 2 calls
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('reorderTrack emits eparsPlaylist:changed (twice — via setPendingTracks + explicit)', () => {
    createNewPlaylist('pl');
    addTrack('pl', { filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3' } as any);
    addTrack('pl', { filename: 'b.mp3', fullPath: '/b.mp3', relPath: 'b.mp3' } as any);
    vi.clearAllMocks();
    reorderTrack('pl', 0, 1);
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('reorderTrack does NOT emit when indices are out of bounds', () => {
    createNewPlaylist('pl');
    addTrack('pl', { filename: 'a.mp3', fullPath: '/a.mp3', relPath: 'a.mp3' } as any);
    vi.clearAllMocks();
    reorderTrack('pl', -1, 2);
    expect(emit).not.toHaveBeenCalled();
  });

  it('removePendingPlaylist emits eparsPlaylist:changed', () => {
    createNewPlaylist('pl');
    vi.clearAllMocks();
    removePendingPlaylist('pl');
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
  });

  it('removePendingPlaylist emits even for nonexistent playlist', () => {
    vi.clearAllMocks();
    removePendingPlaylist('ghost');
    expect(emit).toHaveBeenCalledWith('eparsPlaylist:changed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Server operations (with mocked api)
// ═══════════════════════════════════════════════════════════════════════════

describe('loadPlaylists', () => {
  it('updates state.playlists from server', async () => {
    const serverData = [
      { name: 'set-a', trackCount: 2 },
      { name: 'set-b', trackCount: 5 },
    ];
    vi.mocked(api).mockResolvedValueOnce(serverData);

    await loadPlaylists();

    expect(api).toHaveBeenCalledWith('/playlists');
    expect(state.playlists).toEqual(serverData);
  });

  it('handles empty response', async () => {
    vi.mocked(api).mockResolvedValueOnce([]);

    await loadPlaylists();

    expect(state.playlists).toEqual([]);
  });
});

describe('savePlaylist', () => {
  it('sends POST and refreshes cache', async () => {
    const serverPlaylist = { name: 'set-a', trackCount: 3 };
    vi.mocked(api)
      .mockResolvedValueOnce({ ok: true, playlist: serverPlaylist })
      .mockResolvedValueOnce([serverPlaylist]);

    const tracks = [makeTrack('a.mp3'), makeTrack('b.mp3'), makeTrack('c.mp3')] as any[];
    const result = await savePlaylist('set-a', tracks);

    expect(api).toHaveBeenCalledWith('/playlists', {
      method: 'POST',
      body: JSON.stringify({ name: 'set-a', tracks }),
    });
    expect(result).toEqual(serverPlaylist);
    expect(state.playlists).toEqual([serverPlaylist]);
  });
});

describe('deletePlaylist', () => {
  it('sends DELETE and refreshes cache', async () => {
    vi.mocked(api).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce([]);

    const result = await deletePlaylist('set-a');

    expect(api).toHaveBeenCalledWith('/playlists/set-a', { method: 'DELETE' });
    expect(result).toBe(true);
    expect(state.playlists).toEqual([]);
  });

  it('returns false when server returns ok: false', async () => {
    vi.mocked(api).mockResolvedValueOnce({ ok: false, error: 'Not found' }).mockResolvedValueOnce([]);

    const result = await deletePlaylist('nonexistent');

    expect(result).toBe(false);
  });
});

describe('renamePlaylist', () => {
  it('sends PUT with new name and refreshes', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ ok: true, playlist: { name: 'new-name' } })
      .mockResolvedValueOnce([{ name: 'new-name' }]);

    const result = await renamePlaylist('old-name', 'new-name');

    expect(api).toHaveBeenCalledWith('/playlists/old-name', {
      method: 'PUT',
      body: JSON.stringify({ name: 'new-name' }),
    });
    expect((result as Record<string, unknown>).ok).toBe(true);
    expect(state.playlists).toEqual([{ name: 'new-name' }]);
  });
});

describe('exportPlaylist', () => {
  it('sends POST to /playlists/export', async () => {
    const exportResult = { ok: true, dir: '/src/_playlists/set-a', count: 3 };
    vi.mocked(api).mockResolvedValueOnce(exportResult);

    const result = await exportPlaylist('set-a');

    expect(api).toHaveBeenCalledWith('/playlists/export', {
      method: 'POST',
      body: JSON.stringify({ name: 'set-a' }),
    });
    expect(result).toEqual(exportResult);
  });

  it('propagates error responses (missing files)', async () => {
    const errorResult = { ok: false, missing: ['ghost.mp3'] };
    vi.mocked(api).mockResolvedValueOnce(errorResult);

    const result = await exportPlaylist('broken');

    expect((result as Record<string, unknown>).ok).toBe(false);
    expect((result as Record<string, unknown>).missing).toEqual(['ghost.mp3']);
  });
});
