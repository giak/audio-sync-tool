// ─── DOM-based spatial navigation (↑↓←→ Tab) ────────────────────────────
import { state } from './state.js';

function getActivePanelEl(): HTMLElement | null {
  return state.activePanel === 'source'
    ? document.getElementById('panel-right')
    : document.getElementById('panel-left');
}

function getActiveContainer(): HTMLElement | null {
  return state.activePanel === 'source'
    ? document.getElementById('source-container')
    : document.getElementById('epars-container');
}

function getFocusPath(): string | null {
  return state.activePanel === 'source' ? state.sourceFocusPath : state.eparsFocusPath;
}

function setFocusPath(path: string | null): void {
  if (state.activePanel === 'source') state.sourceFocusPath = path;
  else state.eparsFocusPath = path;
}

export function getItems(container: HTMLElement): NodeListOf<Element> {
  // Inclure les .file-row dans les dossiers dépliés (C3)
  return container.querySelectorAll('.directory, .file-row');
}

export function focusItemByPath(container: HTMLElement, path: string | null): void {
  const items = getItems(container);
  for (const el of container.querySelectorAll('.focused')) el.classList.remove('focused');
  if (!path) {
    if (items.length > 0) {
      items[0].classList.add('focused');
      items[0].scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  for (const el of items) {
    if ((el as HTMLElement).dataset.focuspath === path) {
      el.classList.add('focused');
      el.scrollIntoView({ block: 'nearest' });
      return;
    }
  }
  if (items.length > 0) {
    items[0].classList.add('focused');
    items[0].scrollIntoView({ block: 'nearest' });
  }
}

export function getFocusedItem(container: HTMLElement): Element | null {
  return container.querySelector('.focused');
}

export function focusItemByElement(
  container: HTMLElement,
  el: Element,
  opts?: { noHistory?: boolean },
): void {
  const focusPath = (el as HTMLElement).dataset.focuspath || null;
  for (const el of container.querySelectorAll('.focused')) el.classList.remove('focused');
  el.classList.add('focused');
  el.scrollIntoView({ block: 'nearest' });
  setFocusPath(focusPath);

  // Push to nav history (A12) — skip when restoring from history
  if (!opts?.noHistory && focusPath) {
    const entry = { panel: state.activePanel, focusPath };
    // Dedup consecutive same entry
    const prev = state.navHistory[state.navIndex];
    if (!prev || prev.panel !== entry.panel || prev.focusPath !== entry.focusPath) {
      // Truncate forward history when navigating from mid-stack
      state.navHistory = state.navHistory.slice(0, state.navIndex + 1);
      state.navHistory = [...state.navHistory, entry];
      state.navIndex = state.navHistory.length - 1;
      // Limit history to 200 entries
      if (state.navHistory.length > 200) {
        state.navHistory = state.navHistory.slice(-200);
        state.navIndex = state.navHistory.length - 1;
      }
    }
  }
}

export function navigateHistory(direction: number): void {
  const newIdx = state.navIndex + direction;
  if (newIdx < 0 || newIdx >= state.navHistory.length) return;
  state.navIndex = newIdx;
  const entry = state.navHistory[newIdx];

  // Switch panel if needed
  state.activePanel = entry.panel;
  for (const el of document.querySelectorAll('.panel-active')) el.classList.remove('panel-active');
  getActivePanelEl()?.classList.add('panel-active');

  // If in playlist mode, exit to sync first
  if (state.playlistMode) {
    // Can't navigate playlist history from sync; just restore focus in sync
    // (Playlist mode nav history is not tracked — only sync panels)
  }

  const container = getActiveContainer();
  if (container) focusItemByPath(container, entry.focusPath);
}

export function navigateFocus(container: HTMLElement, direction: number): void {
  const items = getItems(container);
  if (items.length === 0) return;
  const current = getFocusedItem(container);
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i] === current) {
      idx = i;
      break;
    }
  }
  if (!current) idx = direction > 0 ? -1 : items.length;
  const newIdx = Math.max(0, Math.min(items.length - 1, idx + direction));
  focusItemByElement(container, items[newIdx]);
}

export function navigateColumn(container: HTMLElement, direction: number): void {
  const current = getFocusedItem(container);
  if (!current) return;
  const curRect = current.getBoundingClientRect();
  const items = getItems(container);
  let best: Element | null = null;
  let bestDist = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const rect = el.getBoundingClientRect();
    const dx = rect.left - curRect.left;
    if (direction < 0 && dx >= -5) continue;
    if (direction > 0 && dx <= 5) continue;
    const dy = Math.abs(rect.top - curRect.top);
    const dist = Math.abs(dx) + dy * 3;
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  if (best) focusItemByElement(container, best);
}

export function setActivePanel(panel: 'epars' | 'source'): void {
  state.activePanel = panel;
  state.focusListId = panel as 'epars' | 'source';
  for (const el of document.querySelectorAll('.panel-active')) el.classList.remove('panel-active');
  getActivePanelEl()?.classList.add('panel-active');
  const container = getActiveContainer();
  if (container) focusItemByPath(container, getFocusPath());
}

export function revalidateFocus(): void {
  const container = getActiveContainer();
  if (container) focusItemByPath(container, getFocusPath());
}
