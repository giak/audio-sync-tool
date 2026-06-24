// ─── Unit tests: commands/modals.ts — Escape key bindings (6) ─────────────
// The module has module-level side effects: registry.bind() is called 6 times
// on import. We mock registry and ui to capture and test them.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist spies so vi.mock factories can reference them
const { bind, closeAllModals, closeContextMenu } = vi.hoisted(() => ({
  bind: vi.fn(),
  closeAllModals: vi.fn(),
  closeContextMenu: vi.fn(),
}));

vi.mock('./registry.js', () => ({
  registry: { bind },
}));

vi.mock('../ui.js', () => ({
  closeAllModals,
  closeContextMenu,
}));

// Import triggers module-level bind() calls — must be AFTER mocks
import './modals.js';

// Captured binding objects (preserved across beforeEach clearAllMocks)
let dialogBinding: Record<string, unknown>;
let configBinding: Record<string, unknown>;
let legendBinding: Record<string, unknown>;
let journalBinding: Record<string, unknown>;
let playlistsBinding: Record<string, unknown>;
let ctxMenuBinding: Record<string, unknown>;

beforeAll(() => {
  function find(modal: string | null): Record<string, unknown> {
    const call = bind.mock.calls.find((args: unknown[]) => {
      const b = args[0] as Record<string, unknown>;
      return b.key === 'Escape' && b.activeModal === modal;
    });
    return call![0] as Record<string, unknown>;
  }

  dialogBinding = find('dialog');
  configBinding = find('config');
  legendBinding = find('legend');
  journalBinding = find('journal');
  playlistsBinding = find('playlists');
  ctxMenuBinding = find(null);
});

describe('commands/modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  // ── Modal-specific Escape bindings ──────────────────────────────────

  it('Escape with activeModal="dialog" calls closeAllModals()', () => {
    expect(dialogBinding.key).toBe('Escape');
    expect(dialogBinding.activeModal).toBe('dialog');
    (dialogBinding.handler as () => void)();
    expect(closeAllModals).toHaveBeenCalled();
  });

  it('Escape with activeModal="config" calls closeAllModals()', () => {
    expect(configBinding.key).toBe('Escape');
    expect(configBinding.activeModal).toBe('config');
    (configBinding.handler as () => void)();
    expect(closeAllModals).toHaveBeenCalled();
  });

  it('Escape with activeModal="legend" calls closeAllModals()', () => {
    expect(legendBinding.key).toBe('Escape');
    expect(legendBinding.activeModal).toBe('legend');
    (legendBinding.handler as () => void)();
    expect(closeAllModals).toHaveBeenCalled();
  });

  it('Escape with activeModal="journal" calls closeAllModals()', () => {
    expect(journalBinding.key).toBe('Escape');
    expect(journalBinding.activeModal).toBe('journal');
    (journalBinding.handler as () => void)();
    expect(closeAllModals).toHaveBeenCalled();
  });

  it('Escape with activeModal="playlists" calls closeAllModals()', () => {
    expect(playlistsBinding.key).toBe('Escape');
    expect(playlistsBinding.activeModal).toBe('playlists');
    (playlistsBinding.handler as () => void)();
    expect(closeAllModals).toHaveBeenCalled();
  });

  // ── Context menu Escape binding ─────────────────────────────────────

  it('Escape with activeModal=null, filterActive=false, isAudioPlaying=false calls closeContextMenu()', () => {
    expect(ctxMenuBinding.key).toBe('Escape');
    expect(ctxMenuBinding.activeModal).toBeNull();
    expect(ctxMenuBinding.filterActive).toBe(false);
    expect(ctxMenuBinding.isAudioPlaying).toBe(false);

    (ctxMenuBinding.handler as () => void)();
    expect(closeContextMenu).toHaveBeenCalled();
    expect(closeAllModals).not.toHaveBeenCalled();
  });

  // ── Cross-cutting assertions ────────────────────────────────────────

  it('all 6 bindings are captured and use the Escape key', () => {
    const all = [dialogBinding, configBinding, legendBinding, journalBinding, playlistsBinding, ctxMenuBinding];
    expect(all.length).toBe(6);
    for (const b of all) {
      expect(b.key).toBe('Escape');
    }
  });

  it('modal handlers do NOT call closeContextMenu', () => {
    const handlers = [dialogBinding, configBinding, legendBinding, journalBinding, playlistsBinding];
    for (const b of handlers) {
      (b.handler as () => void)();
    }
    expect(closeContextMenu).not.toHaveBeenCalled();
    expect(closeAllModals).toHaveBeenCalledTimes(5);
  });
});
