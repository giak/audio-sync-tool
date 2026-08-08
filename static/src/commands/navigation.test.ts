// ─── Unit tests: commands/navigation.ts (17 registry.bind calls) ──────────
// Verifies that each keyboard binding:
//   1. Is registered with the correct conditions
//   2. Calls the expected functions when the handler executes

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

// ── Hoist spies so vi.mock factories can reference them ───────────────────

const { bind, navigateFocus, navigateColumn, navigateHistory, focusItemByElement, setActivePanel } = vi.hoisted(() => ({
  bind: vi.fn(),
  navigateFocus: vi.fn(),
  navigateColumn: vi.fn(),
  navigateHistory: vi.fn(),
  focusItemByElement: vi.fn(),
  setActivePanel: vi.fn(),
}));

const { renderSource } = vi.hoisted(() => ({ renderSource: vi.fn() }));
const { closeFilterPalette } = vi.hoisted(() => ({ closeFilterPalette: vi.fn() }));

// ── Module mocks ──────────────────────────────────────────────────────────

vi.mock('./registry.js', () => ({
  registry: { bind },
}));

vi.mock('../focus.js', async importOriginal => {
  const mod = await importOriginal<typeof import('../focus.js')>();
  return {
    ...mod,
    navigateFocus,
    navigateColumn,
    navigateHistory,
    focusItemByElement,
    setActivePanel,
    // getItems and getFocusedItem kept REAL — handlers depend on DOM queries
  };
});

vi.mock('../render/index.js', () => ({
  renderSource,
}));

vi.mock('../ui.js', () => ({
  closeFilterPalette,
}));

// JSDOM doesn't implement scrollIntoView — mock it on the prototype
Element.prototype.scrollIntoView = vi.fn();

// Import triggers module-level bind() calls — must be AFTER mocks
import './navigation.js';

// ── Helpers ───────────────────────────────────────────────────────────────

type Binding = Record<string, unknown>;

function findBinding(matcher: Partial<Binding>): Binding {
  const call = bind.mock.calls.find((args: unknown[]) => {
    const b = args[0] as Binding;
    return Object.entries(matcher).every(([k, v]) => b[k] === v);
  });
  if (!call) throw new Error(`No binding found matching ${JSON.stringify(matcher)}`);
  return call[0] as Binding;
}

// ── Capture all bindings once ─────────────────────────────────────────────

let B: Record<string, Binding>;

beforeAll(() => {
  B = {};

  const label: Array<[string, Partial<Binding>]> = [
    ['Tab:epars→source', { key: 'Tab', activePanel: 'epars', playlistMode: false }],
    ['Tab:source→epars', { key: 'Tab', activePanel: 'source', playlistMode: false }],
    ['ArrowDown', { key: 'ArrowDown', playlistMode: false }],
    ['ArrowUp', { key: 'ArrowUp', playlistMode: false }],
    ['ArrowLeft:source', { key: 'ArrowLeft', activePanel: 'source', playlistMode: false }],
    ['ArrowRight:source', { key: 'ArrowRight', activePanel: 'source', playlistMode: false }],
    [
      'ArrowLeft:epars',
      { key: 'ArrowLeft', activePanel: 'epars', playlistMode: false, isAudioPlaying: false, shiftKey: false },
    ],
    [
      'ArrowRight:epars',
      { key: 'ArrowRight', activePanel: 'epars', playlistMode: false, isAudioPlaying: false, shiftKey: false },
    ],
    ['Enter', { key: 'Enter', playlistMode: false }],
    ['Space', { key: ' ', playlistMode: false }],
    ['Backspace', { key: 'Backspace', isInput: false, activeModal: null, playlistMode: false }],
    ['Ctrl+L', { key: 'l', ctrlKey: true, isInput: false }],
    ['Alt+←', { key: 'ArrowLeft', altKey: true, isInput: false }],
    ['Alt+→', { key: 'ArrowRight', altKey: true, isInput: false }],
    ['Filter Échap', { key: 'Escape', isFilterInputFocused: true }],
    ['Filter ↓', { key: 'ArrowDown', isFilterInputFocused: true }],
    ['Filter Tab', { key: 'Tab', isFilterInputFocused: true }],
  ];

  for (const [name, matcher] of label) {
    B[name] = findBinding(matcher);
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('commands/navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });

  // ── Tab ────────────────────────────────────────────────────────────────

  describe('Tab — switch panels', () => {
    it('Tab from epars calls setActivePanel("source")', () => {
      B['Tab:epars→source'].handler();
      expect(setActivePanel).toHaveBeenCalledWith('source');
    });

    it('Tab from source calls setActivePanel("epars")', () => {
      B['Tab:source→epars'].handler();
      expect(setActivePanel).toHaveBeenCalledWith('epars');
    });
  });

  // ── ArrowUp / ArrowDown ────────────────────────────────────────────────

  describe('↑↓ — navigate focus', () => {
    function setupContainer(id: string): HTMLElement {
      const c = document.createElement('div');
      c.id = id;
      document.body.appendChild(c);
      return c;
    }

    it('ArrowDown calls navigateFocus(container, 1) when items exist', () => {
      const c = setupContainer('source-container');
      c.innerHTML = '<div class="file-row"></div><div class="file-row"></div>';

      // Set activePanel so handler picks the right container
      const orig = state.activePanel;
      state.activePanel = 'source';
      B['ArrowDown'].handler();
      expect(navigateFocus).toHaveBeenCalledWith(c, 1);
      state.activePanel = orig;
      c.remove();
    });

    it('ArrowDown does nothing when container absent', () => {
      B['ArrowDown'].handler();
      expect(navigateFocus).not.toHaveBeenCalled();
    });

    it('ArrowUp calls navigateFocus(container, -1) when items exist', () => {
      const c = setupContainer('epars-container');
      c.innerHTML = '<div class="file-row"></div>';

      const orig = state.activePanel;
      state.activePanel = 'epars';
      B['ArrowUp'].handler();
      expect(navigateFocus).toHaveBeenCalledWith(c, -1);
      state.activePanel = orig;
      c.remove();
    });

    it('ArrowUp does nothing when container absent', () => {
      B['ArrowUp'].handler();
      expect(navigateFocus).not.toHaveBeenCalled();
    });

    it('ArrowDown/Up do nothing when container has no items', () => {
      const c = setupContainer('source-container');
      // Empty container — getItems returns nothing, guard fails
      const orig = state.activePanel;
      state.activePanel = 'source';
      B['ArrowDown'].handler();
      expect(navigateFocus).not.toHaveBeenCalled();
      state.activePanel = orig;
      c.remove();
    });
  });

  // ── ArrowLeft / ArrowRight ─────────────────────────────────────────────

  describe('←→ — source column nav + épars no-op', () => {
    it('ArrowLeft in source calls navigateColumn(-1)', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      B['ArrowLeft:source'].handler();
      expect(navigateColumn).toHaveBeenCalledWith(c, -1);
      c.remove();
    });

    it('ArrowRight in source calls navigateColumn(1)', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      B['ArrowRight:source'].handler();
      expect(navigateColumn).toHaveBeenCalledWith(c, 1);
      c.remove();
    });

    it('ArrowLeft in épars is a no-op (avoids audio seek conflict)', () => {
      B['ArrowLeft:epars'].handler();
      expect(navigateColumn).not.toHaveBeenCalled();
      expect(navigateFocus).not.toHaveBeenCalled();
      expect(setActivePanel).not.toHaveBeenCalled();
    });

    it('ArrowRight in épars is a no-op', () => {
      B['ArrowRight:epars'].handler();
      expect(navigateColumn).not.toHaveBeenCalled();
      expect(navigateFocus).not.toHaveBeenCalled();
      expect(setActivePanel).not.toHaveBeenCalled();
    });

    it('ArrowLeft:source does nothing when source-container absent', () => {
      B['ArrowLeft:source'].handler();
      expect(navigateColumn).not.toHaveBeenCalled();
    });
  });

  // ── Enter ───────────────────────────────────────────────────────────────

  describe('Enter — activate focused item', () => {
    it('clicks the play-btn on a focused .file-row', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row focused';
      const btn = document.createElement('span');
      btn.className = 'play-btn';
      const click = vi.fn();
      btn.onclick = click;
      row.appendChild(btn);
      c.appendChild(row);

      const orig = state.activePanel;
      state.activePanel = 'source';
      B['Enter'].handler();
      expect(click).toHaveBeenCalled();
      state.activePanel = orig;
      c.remove();
    });

    it('clicks a focused .directory in source panel', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      const dir = document.createElement('div');
      dir.className = 'directory focused';
      const click = vi.fn();
      dir.onclick = click;
      c.appendChild(dir);

      const orig = state.activePanel;
      state.activePanel = 'source';
      B['Enter'].handler();
      expect(click).toHaveBeenCalled();
      state.activePanel = orig;
      c.remove();
    });

    it('does nothing when no focused item exists', () => {
      B['Enter'].handler();
      // No error thrown
    });
  });

  // ── Space ───────────────────────────────────────────────────────────────

  describe('Space — select file / toggle directory', () => {
    it('clicks .file.nouveau on a focused file-row in épars panel', () => {
      const c = document.createElement('div');
      c.id = 'epars-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row focused';
      const label = document.createElement('span');
      label.className = 'file nouveau';
      label.textContent = 'test.mp3';
      const click = vi.fn();
      label.onclick = click;
      row.appendChild(label);
      c.appendChild(row);

      const orig = state.activePanel;
      state.activePanel = 'epars';
      B['Space'].handler();
      expect(click).toHaveBeenCalled();
      state.activePanel = orig;
      c.remove();
    });

    it('clicks a focused .directory in source panel', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      const dir = document.createElement('div');
      dir.className = 'directory focused';
      const click = vi.fn();
      dir.onclick = click;
      c.appendChild(dir);

      const orig = state.activePanel;
      state.activePanel = 'source';
      B['Space'].handler();
      expect(click).toHaveBeenCalled();
      state.activePanel = orig;
      c.remove();
    });

    it('does nothing when no focused item exists', () => {
      B['Space'].handler();
    });

    it('does nothing when focused file-row but panel is source (not epars)', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row focused';
      const btn = document.createElement('span');
      btn.className = 'play-btn';
      const click = vi.fn();
      btn.onclick = click;
      row.appendChild(btn);
      c.appendChild(row);

      const orig = state.activePanel;
      state.activePanel = 'source';
      B['Space'].handler();
      expect(click).not.toHaveBeenCalled();
      state.activePanel = orig;
      c.remove();
    });
  });

  // ── Backspace ───────────────────────────────────────────────────────────

  describe('Backspace — focus parent directory', () => {
    it('focuses the parent .directory when focused item is inside a .children', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);

      const parentDir = document.createElement('div');
      parentDir.className = 'directory';
      parentDir.dataset.focuspath = '/parent';
      const children = document.createElement('div');
      children.className = 'children';
      const childRow = document.createElement('div');
      childRow.className = 'file-row focused';
      children.appendChild(childRow);
      parentDir.appendChild(children);
      c.appendChild(parentDir);

      const orig = state.activePanel;
      state.activePanel = 'source';
      B['Backspace'].handler();
      expect(focusItemByElement).toHaveBeenCalledWith(c, parentDir);
      state.activePanel = orig;
      c.remove();
    });

    it('does nothing when no focused element exists', () => {
      B['Backspace'].handler();
      expect(focusItemByElement).not.toHaveBeenCalled();
    });
  });

  // ── Ctrl+L ──────────────────────────────────────────────────────────────

  describe('Ctrl+L — focus currently playing file', () => {
    it('focuses the file-row containing .led-playing', () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      const row = document.createElement('div');
      row.className = 'file-row';
      const label = document.createElement('span');
      label.className = 'file led-playing';
      row.appendChild(label);
      c.appendChild(row);

      B['Ctrl+L'].handler();
      expect(focusItemByElement).toHaveBeenCalledWith(c, row);
      c.remove();
    });

    it('does nothing when no led-playing element exists', () => {
      B['Ctrl+L'].handler();
      expect(focusItemByElement).not.toHaveBeenCalled();
    });

    it('does nothing when led-playing exists but no closest .file-row', () => {
      const orphan = document.createElement('span');
      orphan.className = 'led-playing';
      document.body.appendChild(orphan);
      B['Ctrl+L'].handler();
      expect(focusItemByElement).not.toHaveBeenCalled();
      orphan.remove();
    });
  });

  // ── Alt+← / Alt+→ ───────────────────────────────────────────────────────

  describe('Alt+←/→ — navigation history', () => {
    it('Alt+ArrowLeft calls navigateHistory(-1)', () => {
      B['Alt+←'].handler();
      expect(navigateHistory).toHaveBeenCalledWith(-1);
    });

    it('Alt+ArrowRight calls navigateHistory(1)', () => {
      B['Alt+→'].handler();
      expect(navigateHistory).toHaveBeenCalledWith(1);
    });
  });

  // ── Filter palette bindings ─────────────────────────────────────────────

  describe('Filter palette — Échap, ↓, Tab in filter input', () => {
    it('Échap in filter input calls closeFilterPalette(renderSource)', () => {
      B['Filter Échap'].handler();
      expect(closeFilterPalette).toHaveBeenCalledWith(renderSource);
    });

    it('↓ in filter input calls closeFilterPalette then setActivePanel("source")', () => {
      B['Filter ↓'].handler();
      expect(closeFilterPalette).toHaveBeenCalledWith(renderSource);
      expect(setActivePanel).toHaveBeenCalledWith('source');
    });

    it('Tab in filter input calls closeFilterPalette then setActivePanel("epars")', () => {
      B['Filter Tab'].handler();
      expect(closeFilterPalette).toHaveBeenCalledWith(renderSource);
      expect(setActivePanel).toHaveBeenCalledWith('epars');
    });
  });
});
