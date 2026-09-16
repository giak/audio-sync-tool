// ─── Unit tests: commands/replace.ts — R key binding (EPIC-028 P1bis) ─────
// Module with side effects: registry.bind() runs on import. registry and
// actions are mocked to capture the binding; state is the real module.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { bind, executeReplace } = vi.hoisted(() => ({
  bind: vi.fn(),
  executeReplace: vi.fn(),
}));

vi.mock('./registry.js', () => ({
  registry: { bind },
}));

vi.mock('../actions.js', () => ({
  executeReplace,
}));

import { state } from '../state.js';
import './replace.js';

let binding: Record<string, unknown>;

beforeAll(() => {
  binding = bind.mock.calls[0][0] as Record<string, unknown>;
});

beforeEach(() => {
  vi.clearAllMocks();
  state.dupMatches = new Map();
  document.body.innerHTML = '';
});

afterAll(() => {
  document.body.innerHTML = '';
});

describe('replace command (R)', () => {
  it('binds r with no modal and not input', () => {
    expect(binding.key).toBe('r');
    expect(binding.activeModal).toBeNull();
    expect(binding.isInput).toBe(false);
  });

  function setupFocused(fullpath: string): void {
    const c = document.createElement('div');
    c.id = 'epars-container';
    const row = document.createElement('div');
    row.className = 'focused';
    const file = document.createElement('span');
    file.className = 'file';
    file.dataset.fullpath = fullpath;
    row.appendChild(file);
    c.appendChild(row);
    document.body.appendChild(c);
  }

  it('calls executeReplace with the focused file fullpath', () => {
    setupFocused('/epars/song.flac');
    state.dupMatches = new Map();
    state.dupMatches.set('/epars/song.flac', {
      eparsFullPath: '/epars/song.flac',
      sourceFullPath: '/source/music/song.mp3',
      eparsFilename: 'song.flac',
      sourceFilename: 'song.mp3',
      sim: 0.97,
      delta: 0,
      verdict: 'left-better',
    });

    (binding.handler as () => void)();

    expect(executeReplace).toHaveBeenCalledWith('/epars/song.flac');
  });

  it('is a no-op when the focused file is not a fuzzy match', () => {
    setupFocused('/epars/other.mp3');

    (binding.handler as () => void)();

    expect(executeReplace).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing is focused', () => {
    (binding.handler as () => void)();

    expect(executeReplace).not.toHaveBeenCalled();
  });
});
