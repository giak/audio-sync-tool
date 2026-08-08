// ─── Unit tests for render/ratingEdit.ts ───────────────────────────────────
// Uses real ratings.ts (saveRating/deleteRating update state.ratings optimistically)
// Mocks only api.ts and ui.ts (showToast).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

// Mock api so real ratings.ts functions can optimistically update state.ratings
vi.mock('../api.js', () => ({
  api: vi.fn(),
}));

vi.mock('../ui.js', () => ({
  showToast: vi.fn(),
}));

import { api } from '../api.js';
import { showToast } from '../ui.js';

// Import AFTER mocks
import { _ratingClickHandler, resetRatingEditState, startRatingEdit, startSourceRatingEdit } from './ratingEdit.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function setupPlaylistDOM(): void {
  document.body.innerHTML = `
    <div id="playlist-panel">
      <div id="playlist-tracks">
        <div class="pl-track" data-fullpath="/music/song1.mp3">
          <span class="pl-track-rating" data-fullpath="/music/song1.mp3">85</span>
        </div>
        <div class="pl-track" data-fullpath="/music/song2.flac">
          <span class="pl-track-rating" data-fullpath="/music/song2.flac">72</span>
        </div>
        <div class="pl-track" data-fullpath="/music/song3.wav">
          <span class="pl-track-rating" data-fullpath="/music/song3.wav"></span>
        </div>
      </div>
    </div>
  `;
}

function setupSourceTreeDOM(): void {
  document.body.innerHTML = `
    <div id="playlist-source-container">
      <div class="file-row focused" data-focuspath="/src/Rock/song.mp3">
        <span class="file-rating" data-fullpath="/src/Rock/song.mp3">90</span>
      </div>
      <div class="file-row" data-focuspath="/src/Jazz/track.flac">
        <span class="file-rating" data-fullpath="/src/Jazz/track.flac"></span>
      </div>
    </div>
  `;
}

function resetState(): void {
  state.ratings = {};
  state.playlistFocus = 'source';
  state.playlistTrackFocusIndex = null;
  state.playlistMode = false;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  resetRatingEditState();
});

// ── _ratingClickHandler ──────────────────────────────────────────────────

describe('_ratingClickHandler', () => {
  it('sets focus on parent track and calls startRatingEdit', () => {
    setupPlaylistDOM();
    const ratingSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    const trackEl = ratingSpan.closest('.pl-track') as HTMLElement;

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'currentTarget', { value: ratingSpan });

    _ratingClickHandler(event);

    expect(trackEl.classList.contains('focused')).toBe(true);
    expect(state.playlistFocus).toBe('sidebar');
    expect(state.playlistTrackFocusIndex).toBe(0); // first .pl-track
  });

  it('does nothing when currentTarget is null', () => {
    setupPlaylistDOM();
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'currentTarget', { value: null });

    expect(() => _ratingClickHandler(event)).not.toThrow();
    expect(state.playlistFocus).toBe('source'); // unchanged
  });

  it('does nothing when no parent .pl-track found', () => {
    document.body.innerHTML = `<span class="pl-track-rating" data-fullpath="/orphan"></span>`;
    const ratingSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'currentTarget', { value: ratingSpan });

    expect(() => _ratingClickHandler(event)).not.toThrow();
    expect(state.playlistFocus).toBe('source'); // unchanged
  });

  it('clears previous focus from other tracks', () => {
    setupPlaylistDOM();
    const tracks = document.querySelectorAll('.pl-track');
    tracks[0].classList.add('focused'); // pre-focus first

    const ratingSpan = tracks[1].querySelector('.pl-track-rating') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'currentTarget', { value: ratingSpan });

    _ratingClickHandler(event);

    expect(tracks[0].classList.contains('focused')).toBe(false);
    expect(tracks[1].classList.contains('focused')).toBe(true);
  });
});

// ── startRatingEdit (playlist sidebar) ────────────────────────────────────

describe('startRatingEdit (playlist sidebar)', () => {
  it('replaces the rating span with an input field', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');

    // Set an initial rating in state
    state.ratings['/music/song1.mp3'] = 85;

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('85');
    expect(document.activeElement).toBe(input);
  });

  it('shows empty input when no rating exists', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('');
  });

  it('does nothing when no focused track', () => {
    document.body.innerHTML = `<div id="playlist-tracks"></div>`;
    expect(() => startRatingEdit()).not.toThrow();
  });

  it('does nothing when focused track has no rating span', () => {
    document.body.innerHTML = `
      <div id="playlist-tracks">
        <div class="pl-track focused"></div>
      </div>
    `;
    expect(() => startRatingEdit()).not.toThrow();
  });

  it('prevents double activation', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;

    startRatingEdit();
    // Second call should be a no-op (busy flag)
    startRatingEdit();

    const inputs = document.querySelectorAll('.pl-rating-input');
    expect(inputs.length).toBe(1); // only one input created
  });

  it('Enter key commits the value via saveRating', async () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '92';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // saveRating updates state.ratings optimistically then hits mock api
    expect(state.ratings['/music/song1.mp3']).toBe(92);

    // Input should be replaced by the rebuilt span
    expect(document.querySelector('.pl-rating-input')).toBeNull();
    const newSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    expect(newSpan.textContent).toBe('92');
  });

  it('Enter with empty value calls deleteRating', async () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // deleteRating removes from state.ratings optimistically
    expect(state.ratings['/music/song1.mp3']).toBeUndefined();

    // rebuildSpan creates a "—" span when newRating is undefined
    const newSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    const noneSpan = newSpan.querySelector('.pl-track-rating-none');
    expect(noneSpan).not.toBeNull();
    expect(noneSpan!.textContent).toBe('—');
  });

  it('Escape cancels without saving', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '99';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(api).not.toHaveBeenCalled();

    // Original value restored (state.ratings unchanged)
    expect(state.ratings['/music/song1.mp3']).toBe(85);

    // Span rebuilt with original value
    const newSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    expect(newSpan.textContent).toBe('85');
  });

  it('blur commits the value', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '77';
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    // saveRating updates state.ratings optimistically
    expect(state.ratings['/music/song1.mp3']).toBe(77);

    // Span rebuilt with new value
    const newSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    expect(newSpan.textContent).toBe('77');
  });

  it('blur with empty value calls deleteRating', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    // deleteRating removes from state.ratings optimistically
    expect(state.ratings['/music/song1.mp3']).toBeUndefined();

    // rebuildSpan creates a "—" span
    const newSpan = document.querySelector('.pl-track-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    const noneSpan = newSpan.querySelector('.pl-track-rating-none');
    expect(noneSpan).not.toBeNull();
    expect(noneSpan!.textContent).toBe('—');
  });

  it('blur with invalid number does not call API', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(api).not.toHaveBeenCalled();
    expect(state.ratings['/music/song1.mp3']).toBe(85); // unchanged
  });

  it('blur with out-of-range number does not call API', () => {
    setupPlaylistDOM();
    const track = document.querySelector('.pl-track') as HTMLElement;
    track.classList.add('focused');
    state.ratings['/music/song1.mp3'] = 85;

    startRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '200';
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(api).not.toHaveBeenCalled();
    expect(state.ratings['/music/song1.mp3']).toBe(85); // unchanged
  });
});

// ── startSourceRatingEdit ─────────────────────────────────────────────────

describe('startSourceRatingEdit (source tree)', () => {
  it('shows toast when no file-row is focused', () => {
    document.body.innerHTML = `<div id="playlist-source-container"></div>`;

    startSourceRatingEdit();

    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('focuser'));
  });

  it('replaces the rating span with an input field', () => {
    setupSourceTreeDOM();
    state.ratings['/src/Rock/song.mp3'] = 90;

    startSourceRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('90');
    expect(document.activeElement).toBe(input);
  });

  it('does nothing when focused file-row has no rating span', () => {
    document.body.innerHTML = `
      <div id="playlist-source-container">
        <div class="file-row focused" data-focuspath="/src/Rock/song.mp3"></div>
      </div>
    `;
    expect(() => startSourceRatingEdit()).not.toThrow();
  });

  it('Enter key commits via saveRating', async () => {
    setupSourceTreeDOM();
    state.ratings['/src/Rock/song.mp3'] = 90;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startSourceRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '95';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // saveRating updates state.ratings optimistically
    expect(state.ratings['/src/Rock/song.mp3']).toBe(95);

    // Input replaced by rebuilt span
    expect(document.querySelector('.pl-rating-input')).toBeNull();

    // rebuildSpan for source tree creates file-rating span
    const newSpan = document.querySelector('.file-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    expect(newSpan.textContent).toBe('95');
  });

  it('Escape cancels without saving', () => {
    setupSourceTreeDOM();
    state.ratings['/src/Rock/song.mp3'] = 90;

    startSourceRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '99';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(api).not.toHaveBeenCalled();
    expect(state.ratings['/src/Rock/song.mp3']).toBe(90); // unchanged
  });

  it('blur commits the value', () => {
    setupSourceTreeDOM();
    state.ratings['/src/Rock/song.mp3'] = 90;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startSourceRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '50';
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(state.ratings['/src/Rock/song.mp3']).toBe(50);
  });

  it('prevents double activation', () => {
    setupSourceTreeDOM();
    state.ratings['/src/Rock/song.mp3'] = 90;

    startSourceRatingEdit();
    startSourceRatingEdit();

    const inputs = document.querySelectorAll('.pl-rating-input');
    expect(inputs.length).toBe(1);
  });

  it('rebuildSpan creates file-rating with click handler that focuses row', () => {
    setupSourceTreeDOM();
    state.ratings['/src/Rock/song.mp3'] = 90;
    vi.mocked(api).mockResolvedValue({ ok: true });

    startSourceRatingEdit();

    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '42';

    // Simulate Enter to trigger rebuildSpan
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const newSpan = document.querySelector('.file-rating') as HTMLElement;
    expect(newSpan).not.toBeNull();
    expect(newSpan.textContent).toBe('42');
    expect(newSpan.dataset.fullpath).toBe('/src/Rock/song.mp3');

    // Click handler should focus the row
    const row = document.querySelector('.file-row') as HTMLElement;
    row.classList.remove('focused');
    newSpan.click();
    expect(row.classList.contains('focused')).toBe(true);
  });
});

describe('validation visuelle 0-100 (EPIC-014)', () => {
  beforeEach(() => {
    setupPlaylistDOM();
    document.querySelector('.pl-track')!.classList.add('focused');
  });

  it("marque .invalid dès qu'une valeur hors plage est tapée", () => {
    startRatingEdit();
    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '150';
    input.dispatchEvent(new Event('input'));
    expect(input.classList.contains('invalid')).toBe(true);
    expect(input.title).toContain('0-100');
  });

  it('valeur dans la plage → pas de .invalid', () => {
    startRatingEdit();
    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new Event('input'));
    expect(input.classList.contains('invalid')).toBe(false);
  });

  it('champ vide → pas de .invalid (suppression autorisée)', () => {
    startRatingEdit();
    const input = document.querySelector('.pl-rating-input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(input.classList.contains('invalid')).toBe(false);
  });
});
