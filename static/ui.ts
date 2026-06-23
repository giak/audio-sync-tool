// ─── UI: modals, filter palette, config form, toast/error display ───────────

import { revalidateFocus } from './focus.js';
import { state } from './state.js';

// ── Modals ─────────────────────────────────────────────────────────────────
export function openModal(name: string): void {
  state.activeModal = name as typeof state.activeModal;
  for (const el of document.querySelectorAll('.modal')) el.classList.add('hidden');
  const el = document.getElementById('modal-' + name);
  if (el) el.classList.remove('hidden');
  setTimeout(() => {
    const focusable = el?.querySelector('button, input, select, textarea, [tabindex]');
    if (focusable) (focusable as HTMLElement).focus();
  }, 50);
}

export function closeAllModals(): void {
  state.activeModal = null;
  for (const el of document.querySelectorAll('.modal')) el.classList.add('hidden');
  revalidateFocus();
}

// ── Filter palette ─────────────────────────────────────────────────────────
const filterInput = document.getElementById('source-filter') as HTMLInputElement | null;
let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function initFilterPalette(onFilterChange: () => void): void {
  if (!filterInput) return;
  filterInput.addEventListener('input', () => {
    clearTimeout(filterDebounceTimer!);
    filterDebounceTimer = setTimeout(() => {
      state.sourceFilter = filterInput.value;
      state.filterActive = !!state.sourceFilter;
      if (!state.filterActive) state.sourceExpanded.clear();
      onFilterChange();
    }, 150);
  });
}

export function openFilterPalette(setActivePanel: (panel: 'epars' | 'source') => void, renderSource: () => void): void {
  setActivePanel('source');
  state.filterActive = true;
  state.sourceFilter = '';
  if (filterInput) {
    filterInput.value = '';
    filterInput.focus();
  }
  const countEl = document.getElementById('source-filter-count');
  if (countEl) countEl.textContent = '';
  document.getElementById('filter-palette')?.classList.remove('hidden');
  renderSource();
}

export function closeFilterPalette(renderSource: () => void): void {
  state.filterActive = false;
  state.sourceFilter = '';
  state.sourceExpanded.clear();
  if (filterInput) filterInput.value = '';
  document.getElementById('filter-palette')?.classList.add('hidden');
  renderSource();
  revalidateFocus();
}

// ── Error display ─────────────────────────────────────────────────────────
/**
 * Show a red error message in the status bar that disappears after 5 seconds.
 */
export function showError(msg: string): void {
  const el = document.getElementById('status-text') as HTMLElement | null;
  if (!el) return;
  el.textContent = `⚠️ ${msg}`;
  el.style.color = 'var(--led-red)';
  clearTimeout((el as unknown as { _errorTimer?: ReturnType<typeof setTimeout> })._errorTimer);
  (el as unknown as { _errorTimer: ReturnType<typeof setTimeout> })._errorTimer = setTimeout(() => {
    el.style.color = '';
    el.textContent = state.playlistMode
      ? '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.'
      : 'Prêt.';
  }, 5000);
}
