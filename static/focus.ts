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
  if (container.id === 'source-container') return container.querySelectorAll('.directory');
  return container.querySelectorAll('.file-row, .directory');
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

export function focusItemByElement(container: HTMLElement, el: Element): void {
  for (const el of container.querySelectorAll('.focused')) el.classList.remove('focused');
  el.classList.add('focused');
  el.scrollIntoView({ block: 'nearest' });
  setFocusPath((el as HTMLElement).dataset.focuspath || null);
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
  for (const el of document.querySelectorAll('.panel-active')) el.classList.remove('panel-active');
  getActivePanelEl()?.classList.add('panel-active');
  const container = getActiveContainer();
  if (container) focusItemByPath(container, getFocusPath());
}

export function revalidateFocus(): void {
  const container = getActiveContainer();
  if (container) focusItemByPath(container, getFocusPath());
}
