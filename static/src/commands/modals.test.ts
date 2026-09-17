// ─── Unit tests: commands/modals.ts — Échap (×6) + ? légende (EPIC-031 P1) ─
// The module has module-level side effects: registry.bind() is called 7 times
// on import. We mock registry and ui to capture and test them.
// P1 : le fallback « Échap → closeContextMenu à l'aveugle » est supprimé
// (FINDING 2 — remplacé par l'Échap-menu de menu.ts, testé dans menu.test.ts
// et dans la matrice) ; ? ouvre la légende.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist spies so vi.mock factories can reference them
const { bind, closeAllModals, openModal } = vi.hoisted(() => ({
  bind: vi.fn(),
  closeAllModals: vi.fn(),
  openModal: vi.fn(),
}));

vi.mock('./registry.js', () => ({
  registry: { bind },
}));

vi.mock('../ui.js', () => ({
  closeAllModals,
  openModal,
}));

// Import triggers module-level bind() calls — must be AFTER mocks
import './modals.js';

// Captured binding objects (preserved across beforeEach clearAllMocks)
let dialogBinding: Record<string, unknown>;
let configBinding: Record<string, unknown>;
let legendCloseBinding: Record<string, unknown>;
let journalBinding: Record<string, unknown>;
let playlistsBinding: Record<string, unknown>;
let cueEditorBinding: Record<string, unknown>;
let openLegendBinding: Record<string, unknown>;

beforeAll(() => {
  function find(pred: (b: Record<string, unknown>) => boolean): Record<string, unknown> {
    const call = bind.mock.calls.find((args: unknown[]) => pred(args[0] as Record<string, unknown>));
    return call![0] as Record<string, unknown>;
  }

  dialogBinding = find(b => b.key === 'Escape' && b.activeModal === 'dialog');
  configBinding = find(b => b.key === 'Escape' && b.activeModal === 'config');
  legendCloseBinding = find(b => b.key === 'Escape' && b.activeModal === 'legend');
  journalBinding = find(b => b.key === 'Escape' && b.activeModal === 'journal');
  playlistsBinding = find(b => b.key === 'Escape' && b.activeModal === 'playlists');
  cueEditorBinding = find(b => b.key === 'Escape' && b.activeModal === 'cueEditor');
  openLegendBinding = find(b => b.key === '?');
});

describe('commands/modals', () => {
  beforeEach(() => {
    // PAS de clearAllMocks ici : il viderait bind.mock.calls, capturées en
    // beforeAll — seuls les spies d'effets (closeAllModals, openModal) sont
    // réinitialisés entre les tests.
    closeAllModals.mockClear();
    openModal.mockClear();
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
    expect(legendCloseBinding.key).toBe('Escape');
    expect(legendCloseBinding.activeModal).toBe('legend');
    (legendCloseBinding.handler as () => void)();
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

  it('Escape with activeModal="cueEditor" calls closeAllModals()', () => {
    expect(cueEditorBinding.key).toBe('Escape');
    expect(cueEditorBinding.activeModal).toBe('cueEditor');
    (cueEditorBinding.handler as () => void)();
    expect(closeAllModals).toHaveBeenCalled();
  });

  // ── ? opens the legend (EPIC-031 P1) ────────────────────────────────

  it('? with no modal and no input opens the legend', () => {
    expect(openLegendBinding.key).toBe('?');
    expect(openLegendBinding.isInput).toBe(false);
    expect(openLegendBinding.activeModal).toBeNull();
    expect(openLegendBinding.isContextMenuOpen).toBe(false);
    (openLegendBinding.handler as () => void)();
    expect(openModal).toHaveBeenCalledWith('legend');
    expect(closeAllModals).not.toHaveBeenCalled();
  });

  // ── Cross-cutting assertions ────────────────────────────────────────

  it('exactly 6 Escape bindings (close modals) + 1 "?" binding — no blind ctx-menu fallback', () => {
    const escapes = bind.mock.calls.filter((args: unknown[]) => (args[0] as Record<string, unknown>).key === 'Escape');
    expect(escapes.length).toBe(6);
    const questions = bind.mock.calls.filter((args: unknown[]) => (args[0] as Record<string, unknown>).key === '?');
    expect(questions.length).toBe(1);
    // FINDING 2 (EPIC-031 P1) : plus AUCUN binding sans condition ne ferme le
    // menu contextuel — ce soin appartient à menu.ts (Échap + isContextMenuOpen).
    for (const args of bind.mock.calls) {
      const b = args[0] as Record<string, unknown>;
      expect(b.handler.toString()).not.toContain('closeContextMenu');
    }
    for (const b of [
      dialogBinding,
      configBinding,
      legendCloseBinding,
      journalBinding,
      playlistsBinding,
      cueEditorBinding,
    ]) {
      (b.handler as () => void)();
    }
    expect(closeAllModals).toHaveBeenCalledTimes(6);
  });
});
