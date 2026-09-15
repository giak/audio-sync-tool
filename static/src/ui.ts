// ─── UI: modals, filter palette, config form, toast/error display ───────────

import { revalidateFocus } from './focus.js';
import { state } from './state.js';

// ── Modals ─────────────────────────────────────────────────────────────────
const FOCUSABLE = 'button, input, select, textarea, [tabindex]';

/** Éléments réellement focusables : pas de hidden (le #dialog-input caché a
 *  tabIndex=0 par défaut — un focus() dessus est un no-op navigateur réel). */
function visibleFocusables(modal: HTMLElement): HTMLElement[] {
  return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    el => !el.hasAttribute('disabled') && el.tabIndex >= 0 && el.closest('.hidden') === null,
  );
}

/** Confine Tab dans la modale ouverte (EPIC-014) : Tab/Shift+Tab cyclent entre
 *  les éléments focusables de la modal, ne sortent jamais dans le DOM derrière. */
function trapFocus(e: KeyboardEvent): void {
  if (e.key !== 'Tab' || !state.activeModal) return;
  const modal = document.getElementById(`modal-${state.activeModal}`);
  if (!modal || modal.classList.contains('hidden')) return;
  const focusables = visibleFocusables(modal);
  if (focusables.length === 0) {
    e.preventDefault(); // rien de focusable dans la modale → Tab ne sort pas
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || !modal.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', trapFocus);

export function openModal(name: string): void {
  state.activeModal = name as typeof state.activeModal;
  for (const el of document.querySelectorAll('.modal')) {
    el.classList.add('hidden');
    el.removeAttribute('aria-modal');
  }
  const el = document.getElementById(`modal-${name}`);
  if (el) {
    el.classList.remove('hidden');
    // Accessibilité (EPIC-014) : dialog + aria-modal + aria-label sur le ✕.
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.querySelector('.modal-close')?.setAttribute('aria-label', 'Fermer');
    el.setAttribute('aria-label', el.querySelector('.modal-header h3')?.textContent || name);
  }
  setTimeout(() => {
    const focusable = el ? visibleFocusables(el)[0] : null;
    if (focusable) focusable.focus();
  }, 50);
}

export function closeAllModals(): void {
  state.activeModal = null;
  for (const el of document.querySelectorAll('.modal')) {
    el.classList.add('hidden');
    el.removeAttribute('aria-modal');
  }
  revalidateFocus();
}

// ── Dialog custom (EPIC-014) : remplace prompt()/confirm() natifs ─────────
// Réutilise #modal-dialog (existant pour l'export) — cohérent avec le thème,
// focus trap/aria déjà gérés par openModal.

/** Confirm custom : ouvre le dialog, exécute onConfirm si accepté. */
export function confirmDialog(msg: string, onConfirm: () => void, confirmLabel = 'OK'): void {
  const msgEl = document.getElementById('dialog-msg');
  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn = document.getElementById('dialog-cancel');
  const inputEl = document.getElementById('dialog-input');
  if (!msgEl || !confirmBtn || !cancelBtn) return;
  msgEl.textContent = msg;
  inputEl?.classList.add('hidden');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.onclick = () => {
    closeAllModals();
    onConfirm();
  };
  cancelBtn.onclick = () => closeAllModals();
  openModal('dialog');
}

/** Prompt custom : champ texte pré-rempli, onOk(value) si validé. */
export function promptDialog(
  msg: string,
  defaultValue: string,
  onOk: (value: string) => void,
  confirmLabel = 'OK',
): void {
  const msgEl = document.getElementById('dialog-msg');
  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn = document.getElementById('dialog-cancel');
  const inputEl = document.getElementById('dialog-input') as HTMLInputElement | null;
  if (!msgEl || !confirmBtn || !cancelBtn || !inputEl) return;
  msgEl.textContent = msg;
  inputEl.value = defaultValue;
  inputEl.classList.remove('hidden');
  confirmBtn.textContent = confirmLabel;
  const submit = () => {
    const val = inputEl.value.trim();
    closeAllModals();
    if (val) onOk(val);
  };
  confirmBtn.onclick = submit;
  cancelBtn.onclick = () => closeAllModals();
  inputEl.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') submit();
  };
  openModal('dialog');
  // openModal focusera le premier focusable visible (l'input, une fois visible).
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
let _toastSeq = 0;

/** Toast éphémère dans #toast-container (EPIC-014) : canal séparé de la barre
 *  d'état — n'écrase jamais une erreur persistante ni les infos de mode. */
export function showToast(msg: string): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast${msg.startsWith('❌') ? ' toast-error' : ''}`;
  toast.textContent = msg;
  toast.dataset.seq = String(++_toastSeq);
  container.appendChild(toast);
  // Nettoyage : l'ancien toast disparaît, le plus récent reste 3 s.
  const prev = container.querySelectorAll('.toast:not(:last-child)');
  prev.forEach(el => {
    el.remove();
  });
  setTimeout(() => {
    if (container.contains(toast)) toast.remove();
  }, 3000);
}

/** Erreur persistante (rouge) dans la barre d'état, restaurée après 5 s. */
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
