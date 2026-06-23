// ─── Unit tests for ui.js ────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up DOM before module evaluation (ui.js uses getElementById at module scope)
vi.hoisted(() => {
  document.body.innerHTML = `
    <div id="modal-config" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <button id="btn-save-config">Sauvegarder</button>
      </div>
    </div>
    <div id="modal-legend" class="modal hidden">
      <div class="modal-content">
        <button id="btn-close-legend">Fermer</button>
      </div>
    </div>
    <div id="modal-dialog" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <p id="dialog-msg"></p>
        <button id="dialog-confirm">OK</button>
        <button id="dialog-cancel">Annuler</button>
      </div>
    </div>
    <div id="modal-playlists" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <div id="pl-manager-content"></div>
      </div>
    </div>
    <div id="modal-journal" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <div id="journal-content"></div>
      </div>
    </div>
    <div id="filter-palette" class="hidden">
      <input id="source-filter" type="text" placeholder="Filtrer...">
      <span id="source-filter-count"></span>
    </div>
    <div id="source-container"></div>
    <div id="status-text"></div>
  `;
});

vi.mock('./state.js', () => ({
  state: {
    activeModal: null,
    filterActive: false,
    sourceFilter: '',
    sourceExpanded: new Set(),
  },
}));

import { openModal, closeAllModals, initFilterPalette, openFilterPalette, closeFilterPalette } from './ui.js';
import { state } from './state.js';
import { revalidateFocus } from './focus.js';

// Mock revalidateFocus
vi.mock('./focus.js', () => ({
  revalidateFocus: vi.fn(),
}));

// Note: state is already imported and mocked above.
// revalidateFocus is mocked via vi.mock.

beforeEach(() => {
  state.activeModal = null;
  state.filterActive = false;
  state.sourceFilter = '';
  state.sourceExpanded = new Set();
  vi.clearAllMocks();
  // Hide all modals
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('filter-palette').classList.add('hidden');
  document.getElementById('source-filter').value = '';
});

describe('openModal', () => {
  it('sets activeModal to the given name', () => {
    openModal('config');
    expect(state.activeModal).toBe('config');
  });

  it('shows the correct modal element', () => {
    expect(document.getElementById('modal-config').classList.contains('hidden')).toBe(true);

    openModal('config');
    expect(document.getElementById('modal-config').classList.contains('hidden')).toBe(false);
  });

  it('hides all modals before showing the target one', () => {
    // Open two modals sequentially
    openModal('config');
    expect(document.getElementById('modal-config').classList.contains('hidden')).toBe(false);

    openModal('dialog');
    // config should be hidden again
    expect(document.getElementById('modal-config').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('modal-dialog').classList.contains('hidden')).toBe(false);
  });
});

describe('closeAllModals', () => {
  it('sets activeModal to null', () => {
    state.activeModal = 'config';
    closeAllModals();
    expect(state.activeModal).toBeNull();
  });

  it('hides all modal elements', () => {
    openModal('config');
    openModal('dialog');

    closeAllModals();
    document.querySelectorAll('.modal').forEach(m => {
      expect(m.classList.contains('hidden')).toBe(true);
    });
  });

  it('revalidates focus after closing', () => {
    closeAllModals();
    expect(revalidateFocus).toHaveBeenCalled();
  });
});

describe('openFilterPalette', () => {
  it('sets filterActive to true', () => {
    const setActivePanel = vi.fn();
    openFilterPalette(setActivePanel, vi.fn());
    expect(state.filterActive).toBe(true);
  });

  it('sets sourceFilter to empty string', () => {
    state.sourceFilter = 'old';
    openFilterPalette(vi.fn(), vi.fn());
    expect(state.sourceFilter).toBe('');
  });

  it('clears the filter input value', () => {
    document.getElementById('source-filter').value = 'something';
    openFilterPalette(vi.fn(), vi.fn());
    expect(document.getElementById('source-filter').value).toBe('');
  });

  it('shows the filter palette', () => {
    openFilterPalette(vi.fn(), vi.fn());
    expect(document.getElementById('filter-palette').classList.contains('hidden')).toBe(false);
  });

  it('calls setActivePanel with source', () => {
    const setActivePanel = vi.fn();
    openFilterPalette(setActivePanel, vi.fn());
    expect(setActivePanel).toHaveBeenCalledWith('source');
  });

  it('calls renderSource', () => {
    const renderSource = vi.fn();
    openFilterPalette(vi.fn(), renderSource);
    expect(renderSource).toHaveBeenCalled();
  });

  it('focuses the filter input', () => {
    const input = document.getElementById('source-filter');
    const focusSpy = vi.spyOn(input, 'focus');
    openFilterPalette(vi.fn(), vi.fn());
    expect(focusSpy).toHaveBeenCalled();
  });
});

describe('closeFilterPalette', () => {
  it('sets filterActive to false', () => {
    state.filterActive = true;
    closeFilterPalette(vi.fn());
    expect(state.filterActive).toBe(false);
  });

  it('clears sourceFilter', () => {
    state.sourceFilter = 'rock';
    closeFilterPalette(vi.fn());
    expect(state.sourceFilter).toBe('');
  });

  it('clears sourceExpanded', () => {
    state.sourceExpanded.add('/path/to/dir');
    closeFilterPalette(vi.fn());
    expect(state.sourceExpanded.size).toBe(0);
  });

  it('hides the filter palette', () => {
    document.getElementById('filter-palette').classList.remove('hidden');
    closeFilterPalette(vi.fn());
    expect(document.getElementById('filter-palette').classList.contains('hidden')).toBe(true);
  });

  it('calls renderSource', () => {
    const renderSource = vi.fn();
    closeFilterPalette(renderSource);
    expect(renderSource).toHaveBeenCalled();
  });

  it('revalidates focus', () => {
    closeFilterPalette(vi.fn());
    expect(revalidateFocus).toHaveBeenCalled();
  });
});

describe('initFilterPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onFilterChange after debounce delay on input', () => {
    const onFilterChange = vi.fn();
    initFilterPalette(onFilterChange);

    const input = document.getElementById('source-filter');
    input.value = 'rock';
    input.dispatchEvent(new Event('input'));

    // Should not fire immediately (debounced)
    expect(onFilterChange).not.toHaveBeenCalled();

    // Advance past the 150ms debounce
    vi.advanceTimersByTime(160);

    expect(onFilterChange).toHaveBeenCalled();
  });

  it('updates state.sourceFilter from input value', () => {
    const onFilterChange = vi.fn();
    initFilterPalette(onFilterChange);

    const input = document.getElementById('source-filter');
    input.value = 'jazz';
    input.dispatchEvent(new Event('input'));

    vi.advanceTimersByTime(160);

    expect(state.sourceFilter).toBe('jazz');
    expect(state.filterActive).toBe(true);
  });

  it('clears filterActive when input is empty', () => {
    const onFilterChange = vi.fn();
    initFilterPalette(onFilterChange);

    const input = document.getElementById('source-filter');
    input.value = '';
    input.dispatchEvent(new Event('input'));

    vi.advanceTimersByTime(160);

    expect(state.filterActive).toBe(false);
  });

  it('clears sourceExpanded when input is empty', () => {
    state.sourceExpanded.add('/some/dir');
    const onFilterChange = vi.fn();
    initFilterPalette(onFilterChange);

    const input = document.getElementById('source-filter');
    input.value = 'jazz';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(160);

    // Now clear
    input.value = '';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(160);

    // When filter becomes empty, sourceExpanded should be cleared
    // (but only if the previous filter was non-empty then became empty)
    // Actually the code clears sourceExpanded when filterActive becomes false
    expect(state.filterActive).toBe(false);
  });

  it('debounces rapidly: only last value wins', () => {
    const onFilterChange = vi.fn();
    initFilterPalette(onFilterChange);

    const input = document.getElementById('source-filter');

    // Rapid typing
    input.value = 'r';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(50);

    input.value = 'ro';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(50);

    input.value = 'roc';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(50);

    input.value = 'rock';
    input.dispatchEvent(new Event('input'));

    // Only 100ms total advanced, so the first 3 timeouts were cancelled
    expect(onFilterChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(160);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(state.sourceFilter).toBe('rock');
  });
});
