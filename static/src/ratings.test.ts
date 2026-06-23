import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state } from './state.js';
import { loadRatings, getRating, saveRating, deleteRating } from './ratings.js';

// Mock api
vi.mock('./api.js', () => ({
  api: vi.fn(),
}));

import { api } from './api.js';

describe('ratings', () => {
  beforeEach(() => {
    state.ratings = {};
    vi.clearAllMocks();
  });

  it('loadRatings populates state.ratings', async () => {
    (api as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ '/path/a.mp3': 85, '/path/b.mp3': 72 });
    await loadRatings();
    expect(state.ratings['/path/a.mp3']).toBe(85);
    expect(state.ratings['/path/b.mp3']).toBe(72);
  });

  it('getRating returns value or undefined', () => {
    state.ratings['/path/a.mp3'] = 85;
    expect(getRating('/path/a.mp3')).toBe(85);
    expect(getRating('/nonexistent')).toBeUndefined();
  });

  it('saveRating sends PUT and updates optimistically', async () => {
    (api as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const result = await saveRating('/path/song.mp3', 85);
    expect(result).toBe(true);
    expect(state.ratings['/path/song.mp3']).toBe(85);
    expect(api).toHaveBeenCalledWith('/ratings', {
      method: 'PUT',
      body: JSON.stringify({ '/path/song.mp3': 85 }),
    });
  });

  it('saveRating rolls back on error', async () => {
    (api as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const result = await saveRating('/path/song.mp3', 85);
    expect(result).toBe(false);
    expect(state.ratings['/path/song.mp3']).toBeUndefined();
  });

  it('saveRating validates range', async () => {
    const result = await saveRating('/path/song.mp3', 150);
    expect(result).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  it('deleteRating removes key and sends null', async () => {
    state.ratings['/path/song.mp3'] = 42;
    (api as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const result = await deleteRating('/path/song.mp3');
    expect(result).toBe(true);
    expect(state.ratings['/path/song.mp3']).toBeUndefined();
    expect(api).toHaveBeenCalledWith('/ratings', {
      method: 'PUT',
      body: JSON.stringify({ '/path/song.mp3': null }),
    });
  });

  it('deleteRating rolls back on error', async () => {
    state.ratings['/path/song.mp3'] = 42;
    (api as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const result = await deleteRating('/path/song.mp3');
    expect(result).toBe(false);
    expect(state.ratings['/path/song.mp3']).toBe(42);
  });

  it('saveRating overwrites existing value', async () => {
    state.ratings['/path/song.mp3'] = 50;
    (api as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    await saveRating('/path/song.mp3', 90);
    expect(state.ratings['/path/song.mp3']).toBe(90);
  });
});
