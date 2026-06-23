// ─── UI: modals, filter palette, config form, toast/error display ───────────
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

// ── Error display ─────────────────────────────────────────────────────────
/**
 * Show a red error message in the status bar that disappears after 5 seconds.
 */
export function showError(msg) {
  const el = document.getElementById('status-text');
  el.textContent = `⚠️ ${msg}`;
  el.style.color = 'var(--led-red)';
  clearTimeout(el._errorTimer);
  el._errorTimer = setTimeout(() => {
    el.style.color = '';
    el.textContent = state.playlistMode
      ? '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.'
      : 'Prêt.';
  }, 5000);
}
