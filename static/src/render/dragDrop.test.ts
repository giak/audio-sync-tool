// ─── Unit tests for render/dragDrop.ts ─────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

// Mock dependencies
vi.mock('./batchCopy.js', () => ({
  setBatchCopy: vi.fn(),
}));

import { setBatchCopy } from './batchCopy.js';
import { doDragCopy } from './dragDrop.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function setupDOM(): void {
  document.body.innerHTML = `
    <span id="status-text"></span>
  `;
}

function resetState(): void {
  state.eparsFiles = {};
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('doDragCopy', () => {
  beforeEach(() => {
    setupDOM();
  });

  it('looks up relPath from state.eparsFiles and calls setBatchCopy', () => {
    state.eparsFiles['/media/usb'] = {
      'song.mp3': { path: 'sub/song.mp3', year: '2021', duration: 240, codec: 'MP3' },
    };

    doDragCopy('song.mp3', '/media/usb', '/home/Music/Rock');

    expect(setBatchCopy).toHaveBeenCalledWith('/home/Music/Rock', [
      { filename: 'song.mp3', eparDir: '/media/usb', fullpath: '/media/usb/sub/song.mp3' },
    ]);
  });

  it('shows error in status text when file not found in eparsFiles', () => {
    doDragCopy('unknown.mp3', '/media/usb', '/home/Music/Rock');

    const statusText = document.getElementById('status-text')!;
    expect(statusText.textContent).toContain('Fichier introuvable');
    expect(setBatchCopy).not.toHaveBeenCalled();
  });

  it('shows error when eparDir does not exist', () => {
    doDragCopy('song.mp3', '/nonexistent', '/home/Music/Rock');

    const statusText = document.getElementById('status-text')!;
    expect(statusText.textContent).toContain('Fichier introuvable');
    expect(setBatchCopy).not.toHaveBeenCalled();
  });

  it('shows error when file entry exists but has no path', () => {
    state.eparsFiles['/media/usb'] = {
      'no-path.mp3': { path: '', year: null, duration: null, codec: null },
    };

    doDragCopy('no-path.mp3', '/media/usb', '/home/Music/Rock');

    const statusText = document.getElementById('status-text')!;
    expect(statusText.textContent).toContain('Fichier introuvable');
    expect(setBatchCopy).not.toHaveBeenCalled();
  });

  it('constructs fullpath correctly when relPath is just filename (no subdir)', () => {
    state.eparsFiles['/media/usb'] = {
      'song.mp3': { path: 'song.mp3', year: '2021', duration: 240, codec: 'MP3' },
    };

    doDragCopy('song.mp3', '/media/usb', '/home/Music/Rock');

    expect(setBatchCopy).toHaveBeenCalledWith('/home/Music/Rock', [
      expect.objectContaining({ fullpath: '/media/usb/song.mp3' }),
    ]);
  });

  it('constructs fullpath with nested subdirectory', () => {
    state.eparsFiles['/media/usb'] = {
      'deep.mp3': { path: 'sub/dir/deep.mp3', year: '2021', duration: 240, codec: 'MP3' },
    };

    doDragCopy('deep.mp3', '/media/usb', '/home/Music/Rock');

    expect(setBatchCopy).toHaveBeenCalledWith('/home/Music/Rock', [
      expect.objectContaining({ fullpath: '/media/usb/sub/dir/deep.mp3' }),
    ]);
  });

  it('does nothing when status-text element is missing from DOM', () => {
    document.body.innerHTML = ''; // no status-text element

    expect(() => doDragCopy('unknown.mp3', '/media/usb', '/home/Music/Rock')).not.toThrow();
  });

  it('dispatches an F5 KeyboardEvent on document after setBatchCopy', () => {
    state.eparsFiles['/media/usb'] = {
      'a.mp3': { path: 'a.mp3', year: '2021', duration: 240, codec: 'MP3' },
    };

    const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

    doDragCopy('a.mp3', '/media/usb', '/home/Music/Rock');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'keydown',
        key: 'F5',
        bubbles: true,
      }),
    );
  });

  it('does not dispatch F5 when file not found', () => {
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent');

    doDragCopy('unknown.mp3', '/media/usb', '/home/Music/Rock');

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
