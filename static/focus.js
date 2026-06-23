// ─── DOM-based spatial navigation (↑↓←→ Tab) ────────────────────────────
import { state } from './state.js';

function getActivePanelEl() {
  return state.activePanel === 'source'
    ? document.getElementById('panel-right')
    : document.getElementById('panel-left');
}

function getActiveContainer() {
  return state.activePanel === 'source'
    ? document.getElementById('source-container')
    : document.getElementById('epars-container');
}

function getFocusPath() {
  return state.activePanel === 'source' ? state.sourceFocusPath : state.eparsFocusPath;
}

function setFocusPath(path) {
  if (state.activePanel === 'source') state.sourceFocusPath = path;
  else state.eparsFocusPath = path;
}

export function getItems(container) {
  if (container.id === 'source-container') return container.querySelectorAll('.directory');
  return container.querySelectorAll('.file-row, .directory');
}

export function focusItemByPath(container, path) {
  const items = getItems(container);
  container.querySelectorAll('.focused').forEach(r => r.classList.remove('focused'));
  if (!path) {
    if (items.length > 0) { items[0].classList.add('focused'); items[0].scrollIntoView({ block: 'nearest' }); }
    return;
  }
  for (const el of items) {
    if (el.dataset.focuspath === path) {
      el.classList.add('focused');
      el.scrollIntoView({ block: 'nearest' });
      return;
    }
  }
  if (items.length > 0) { items[0].classList.add('focused'); items[0].scrollIntoView({ block: 'nearest' }); }
}

export function getFocusedItem(container) {
  return container.querySelector('.focused');
}

export function focusItemByElement(container, el) {
  container.querySelectorAll('.focused').forEach(r => r.classList.remove('focused'));
  el.classList.add('focused');
  el.scrollIntoView({ block: 'nearest' });
  setFocusPath(el.dataset.focuspath || null);
}

export function navigateFocus(container, direction) {
  const items = getItems(container);
  if (items.length === 0) return;
  const current = getFocusedItem(container);
  let idx = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i] === current) { idx = i; break; }
  }
  if (!current) idx = direction > 0 ? -1 : items.length;
  const newIdx = Math.max(0, Math.min(items.length - 1, idx + direction));
  focusItemByElement(container, items[newIdx]);
}

export function navigateColumn(container, direction) {
  const current = getFocusedItem(container);
  if (!current) return;
  const curRect = current.getBoundingClientRect();
  const items = getItems(container);
  let best = null, bestDist = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const rect = el.getBoundingClientRect();
    const dx = rect.left - curRect.left;
    if (direction < 0 && dx >= -5) continue;
    if (direction > 0 && dx <= 5) continue;
    const dy = Math.abs(rect.top - curRect.top);
    const dist = Math.abs(dx) + dy * 3;
    if (dist < bestDist) { bestDist = dist; best = el; }
  }
  if (best) focusItemByElement(container, best);
}

export function setActivePanel(panel) {
  state.activePanel = panel;
  document.querySelectorAll('.panel-active').forEach(p => p.classList.remove('panel-active'));
  getActivePanelEl().classList.add('panel-active');
  const container = getActiveContainer();
  focusItemByPath(container, getFocusPath());
}

export function revalidateFocus() {
  const container = getActiveContainer();
  focusItemByPath(container, getFocusPath());
}
