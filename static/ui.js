// ─── UI: modals, filter palette, config form ──────────────────────────────
import { state } from './state.js';
import { revalidateFocus } from './focus.js';

// ── Modals ─────────────────────────────────────────────────────────────────
export function openModal(name) {
  state.activeModal = name;
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const el = document.getElementById('modal-' + name);
  if (el) el.classList.remove('hidden');
  setTimeout(() => {
    const focusable = el?.querySelector('button, input, select, textarea, [tabindex]');
    if (focusable) focusable.focus();
  }, 50);
}

export function closeAllModals() {
  state.activeModal = null;
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  revalidateFocus();
}

// ── Filter palette ─────────────────────────────────────────────────────────
const filterInput = document.getElementById('source-filter');
let filterDebounceTimer = null;

export function initFilterPalette(onFilterChange) {
  filterInput.addEventListener('input', () => {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
      state.sourceFilter = filterInput.value;
      state.filterActive = !!state.sourceFilter;
      if (!state.filterActive) state.sourceExpanded.clear();
      onFilterChange();
    }, 150);
  });
}

export function openFilterPalette(setActivePanel, renderSource) {
  setActivePanel('source');
  state.filterActive = true;
  state.sourceFilter = '';
  filterInput.value = '';
  document.getElementById('source-filter-count').textContent = '';
  document.getElementById('filter-palette').classList.remove('hidden');
  renderSource();
  filterInput.focus();
}

export function closeFilterPalette(renderSource) {
  state.filterActive = false;
  state.sourceFilter = '';
  state.sourceExpanded.clear();
  filterInput.value = '';
  document.getElementById('filter-palette').classList.add('hidden');
  renderSource();
  revalidateFocus();
}
