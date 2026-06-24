// ─── UI: modals, filter palette, config form, toast/error display ───────────

import { revalidateFocus } from './focus.js';
import { state } from './state.js';

// ── Modals ─────────────────────────────────────────────────────────────────
export function openModal(name: string): void {
  state.activeModal = name as typeof state.activeModal;
  for (const el of document.querySelectorAll('.modal')) el.classList.add('hidden');
  const el = document.getElementById(`modal-${name}`);
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
      if (!state.filterActive) state.sourceExpanded = new Set(state.sourceManuallyExpanded);
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
  state.sourceExpanded = new Set(state.sourceManuallyExpanded);
  if (filterInput) filterInput.value = '';
  document.getElementById('filter-palette')?.classList.add('hidden');
  renderSource();
  revalidateFocus();
}

// ── Error display ─────────────────────────────────────────────────────────
/**
 * Show a red error message in the status bar that disappears after 5 seconds.
 */
/**
 * Show a brief toast message in the status bar that disappears after 3 seconds.
 */
export function showToast(msg: string): void {
  const el = document.getElementById('status-text') as HTMLElement | null;
  if (!el) return;
  el.textContent = msg;
  clearTimeout((el as unknown as { _toastTimer?: ReturnType<typeof setTimeout> })._toastTimer);
  (el as unknown as { _toastTimer: ReturnType<typeof setTimeout> })._toastTimer = setTimeout(() => {
    if (state.playlistMode) {
      el.textContent = '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.';
    }
  }, 3000);
}

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

// ── Context menu (A7) ────────────────────────────────────────────────────

interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

let _ctxMenuEl: HTMLElement | null = null;

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  closeContextMenu();
  if (items.length === 0) return;

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const item of items) {
    const el = document.createElement('div');
    el.className = `ctx-item${item.danger ? ' ctx-danger' : ''}`;
    el.textContent = item.label;
    el.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      closeContextMenu();
      item.action();
    };
    menu.appendChild(el);
  }

  document.body.appendChild(menu);
  _ctxMenuEl = menu;

  // Ajuster si le menu dépasse de l'écran
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
  });

  // Fermer au clic extérieur
  setTimeout(() => {
    document.addEventListener('click', _closeOnOutsideClick, { once: true });
  }, 0);
}

function _closeOnOutsideClick(): void {
  closeContextMenu();
}

export function closeContextMenu(): void {
  if (_ctxMenuEl) {
    _ctxMenuEl.remove();
    _ctxMenuEl = null;
  }
}
