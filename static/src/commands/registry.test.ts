// ─── Unit tests for CommandRegistry ────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registry, buildContext } from './registry.js';
import { state } from '../state.js';

// Mock isAudioPlaying
vi.mock('../audio.js', () => ({ isAudioPlaying: vi.fn(() => false) }));

function dispatchEvent(key: string, opts: Partial<KeyboardEvent> = {}): boolean {
  const e = new KeyboardEvent('keydown', {
    key,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    bubbles: true,
    ...opts,
  });
  const ctx = buildContext(e);
  return registry.dispatch(e, ctx);
}

describe('CommandRegistry', () => {
  beforeEach(() => {
    // Reset registry
    (registry as any).bindings = [];
    // Reset state
    state.activeModal = null;
    state.activePanel = 'epars';
    state.filterActive = false;
    state.playlistMode = false;
    state.playlistFocus = 'source';
  });

  describe('bind', () => {
    it('registers a command and dispatches it on key match', () => {
      const handler = vi.fn();
      registry.bind({ key: 'F5', handler });
      dispatchEvent('F5');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch when key does not match', () => {
      const handler = vi.fn();
      registry.bind({ key: 'F5', handler });
      dispatchEvent('F7');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('activeModal isolation', () => {
    it('dispatches when binding has activeModal: null and no modal is open', () => {
      const handler = vi.fn();
      registry.bind({ key: 'Tab', activeModal: null, handler });
      state.activeModal = null;
      dispatchEvent('Tab');
      expect(handler).toHaveBeenCalled();
    });

    it('does NOT dispatch when binding has activeModal: null but modal IS open', () => {
      const handler = vi.fn();
      registry.bind({ key: 'Tab', activeModal: null, handler });
      state.activeModal = 'config';
      dispatchEvent('Tab');
      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches when binding matches specific modal', () => {
      const handler = vi.fn();
      registry.bind({ key: 'Escape', activeModal: 'dialog', handler });
      state.activeModal = 'dialog';
      dispatchEvent('Escape');
      expect(handler).toHaveBeenCalled();
    });

    it('does NOT dispatch when binding targets different modal', () => {
      const handler = vi.fn();
      registry.bind({ key: 'Escape', activeModal: 'dialog', handler });
      state.activeModal = 'config';
      dispatchEvent('Escape');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('filterInputFocused', () => {
    it('matches when isFilterInputFocused matches', () => {
      const filterInput = document.createElement('input');
      filterInput.id = 'source-filter';
      document.body.appendChild(filterInput);
      filterInput.focus();

      const handler = vi.fn();
      registry.bind({ key: 'Tab', isFilterInputFocused: true, handler });
      dispatchEvent('Tab');
      expect(handler).toHaveBeenCalled();

      document.body.removeChild(filterInput);
    });

    it('does not match when isFilterInputFocused is true but no filter input focused', () => {
      const handler = vi.fn();
      registry.bind({ key: 'Tab', isFilterInputFocused: true, handler });
      dispatchEvent('Tab');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('playlistMode', () => {
    it('matches when playlistMode matches', () => {
      const handler = vi.fn();
      registry.bind({ key: ' ', playlistMode: true, handler });
      state.playlistMode = true;
      dispatchEvent(' ');
      expect(handler).toHaveBeenCalled();
    });

    it('does not match when playlistMode differs', () => {
      const handler = vi.fn();
      registry.bind({ key: ' ', playlistMode: true, handler });
      state.playlistMode = false;
      dispatchEvent(' ');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('priority (first match wins)', () => {
    it('dispatches only the first matching binding', () => {
      const first = vi.fn();
      const second = vi.fn();
      registry.bind({ key: 'F5', handler: first });
      registry.bind({ key: 'F5', handler: second });
      dispatchEvent('F5');
      expect(first).toHaveBeenCalled();
      expect(second).not.toHaveBeenCalled();
    });
  });

  describe('modifier keys', () => {
    it('matches ctrlKey correctly', () => {
      const handler = vi.fn();
      registry.bind({ key: 's', ctrlKey: true, handler });
      dispatchEvent('s', { ctrlKey: true });
      expect(handler).toHaveBeenCalled();
    });

    it('does not match without ctrlKey when required', () => {
      const handler = vi.fn();
      registry.bind({ key: 's', ctrlKey: true, handler });
      dispatchEvent('s', { ctrlKey: false });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('activePanel', () => {
    it('matches when activePanel is correct', () => {
      const handler = vi.fn();
      registry.bind({ key: 'ArrowLeft', activePanel: 'source', handler });
      state.activePanel = 'source';
      dispatchEvent('ArrowLeft');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('no-match returns false', () => {
    it('returns false when no binding matches', () => {
      const result = dispatchEvent('F12');
      expect(result).toBe(false);
    });
  });
});
