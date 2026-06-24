// ─── Unit tests: commands/rating.ts — N key bindings ──────────────────────
// The module has module-level side effects: registry.bind() is called twice
// on import. We mock registry and render/index to capture and test them.
//
// The binding objects are captured once in beforeAll (before beforeEach
// resets mocks), then used across all tests.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist spies so vi.mock factories can reference them
const { bind, startRatingEdit, startSourceRatingEdit } = vi.hoisted(() => ({
  bind: vi.fn(),
  startRatingEdit: vi.fn(),
  startSourceRatingEdit: vi.fn(),
}));

vi.mock('./registry.js', () => ({
  registry: { bind },
}));

vi.mock('../render/index.js', () => ({
  startRatingEdit,
  startSourceRatingEdit,
}));

// Import triggers module-level bind() calls — must be AFTER mocks
import './rating.js';

// Captured binding objects (preserved across beforeEach clearAllMocks)
let sidebarBinding: Record<string, unknown>;
let sourceBinding: Record<string, unknown>;

beforeAll(() => {
  const sidebarCall = bind.mock.calls.find(
    (args: unknown[]) => (args[0] as Record<string, unknown>).playlistFocus === 'sidebar',
  );
  const sourceCall = bind.mock.calls.find(
    (args: unknown[]) => (args[0] as Record<string, unknown>).playlistFocus === 'source',
  );
  sidebarBinding = sidebarCall![0] as Record<string, unknown>;
  sourceBinding = sourceCall![0] as Record<string, unknown>;
});

describe('commands/rating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('registers two bindings for the "n" key (sidebar + source)', () => {
    // Verify both were captured
    expect(sidebarBinding).toBeDefined();
    expect(sourceBinding).toBeDefined();
    expect(sidebarBinding.key).toBe('n');
    expect(sourceBinding.key).toBe('n');
  });

  it('sidebar binding: playlistFocus=sidebar, calls startRatingEdit', () => {
    expect(sidebarBinding.playlistMode).toBe(true);
    expect(sidebarBinding.playlistFocus).toBe('sidebar');
    expect(sidebarBinding.isInput).toBe(false);
    expect(sidebarBinding.activeModal).toBeNull();

    (sidebarBinding.handler as () => void)();
    expect(startRatingEdit).toHaveBeenCalled();
    expect(startSourceRatingEdit).not.toHaveBeenCalled();
  });

  it('source binding: playlistFocus=source, calls startSourceRatingEdit', () => {
    expect(sourceBinding.playlistMode).toBe(true);
    expect(sourceBinding.playlistFocus).toBe('source');
    expect(sourceBinding.isInput).toBe(false);
    expect(sourceBinding.activeModal).toBeNull();

    (sourceBinding.handler as () => void)();
    expect(startSourceRatingEdit).toHaveBeenCalled();
    expect(startRatingEdit).not.toHaveBeenCalled();
  });

  it('sidebar and source bindings have different handlers', () => {
    expect(sidebarBinding.handler).not.toBe(sourceBinding.handler);
  });
});
