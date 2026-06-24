// ─── DOM building: file panels, journal, source tree toggle ──────────────

import { stopPlayer, togglePlay } from './audio.js';
import { focusItemByElement, revalidateFocus, setActivePanel } from './focus.js';
import { showContextMenu, closeContextMenu } from './ui.js';
import {
  createNewPlaylist,
  deletePlaylist,
  getActivePlaylistName,
  getPendingTracks,
  removePendingPlaylist,
  removeTrack,
  renamePlaylist,
  reorderTrack,
  savePlaylist,
  setPendingTracks,
} from './playlist.js';
import { getRating, saveRating, deleteRating } from './ratings.js';
import { state } from './state.js';
import { closeAllModals, showToast } from './ui.js';
import {
  computeStatus,
  countAllEparsFiles,
  dirHasMatchingDescendant,
  type FileStatus,
  formatDuration,
} from './utils.js';

// ── Internal types ────────────────────────────────────────────────────────

interface FileEntry {
  filename: string;
  relPath: string;
  year: string | null;
  duration: number | null;
  codec: string | null;
  baseDir: string;
}

interface TreeNode {
  [key: string]: TreeNode | FileEntry[] | undefined;
  __files__?: FileEntry[];
}

interface TreeAndDir {
  tree: TreeNode;
  dirPath: string;
}

type ToggleFn = (dirPath: string) => void;

// ── Batch copy state (shared with actions.ts via getBatchCopy) ────────────

let _batchCopyTarget: string | null = null;
let _batchCopyFiles: Array<{ filename: string; eparDir: string; fullpath: string }> = [];

export function getBatchCopy(): {
  target: string | null;
  files: Array<{ filename: string; eparDir: string; fullpath: string }>;
} {
  const result = { target: _batchCopyTarget, files: _batchCopyFiles };
  _batchCopyTarget = null;
  _batchCopyFiles = [];
  return result;
}

// ── Context menu helpers (A7) ──────────────────────────────────────────

function showDirContextMenu(x: number, y: number, dirPath: string): void {
  const expanded = state.sourceExpanded.has(dirPath);
  const hasSelection = state.selectedEparsFiles.size > 0;
  const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
    { label: expanded ? '📁 Refermer' : '📂 Déplier', action: () => toggleSourceDir(dirPath) },
  ];
  if (hasSelection) {
    items.push({
      label: `📋 Copier ${state.selectedEparsFiles.size} fichier${state.selectedEparsFiles.size > 1 ? 's' : ''} ici`,
      action: () => batchCopyToDir(dirPath),
    });
  }
  showContextMenu(x, y, items);
}

function batchCopyToDir(destDir: string): void {
  if (state.selectedEparsFiles.size === 0) return;
  _batchCopyTarget = destDir;
  _batchCopyFiles = [...state.selectedEparsFiles.values()];
  const dirEl = document.querySelector(
    `#source-container .directory[data-dirpath="${CSS.escape(destDir)}"]`,
  ) as HTMLElement | null;
  if (dirEl) {
    const container = document.getElementById('source-container');
    if (container) focusItemByElement(container, dirEl);
    setActivePanel('source');
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
}

// ── Drag & drop copy helper (A9) ───────────────────────────────────────

function doDragCopy(filename: string, eparDir: string, destDir: string): void {
  const relPath = state.eparsFiles[eparDir]?.[filename]?.path;
  if (!relPath) {
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Fichier introuvable.';
    return;
  }
  _batchCopyTarget = destDir;
  _batchCopyFiles = [{ filename, eparDir, fullpath: `${eparDir}/${relPath}` }];
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
}

// ── File element factory ──────────────────────────────────────────────────

function makeFileEl(
  filename: string,
  _relPath: string,
  status: FileStatus,
  fullpath: string,
  year: string | null,
  duration: number | null,
  codec: string | null,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'file-row';
  row.dataset.focuspath = fullpath;

  const playBtn = document.createElement('span');
  playBtn.className = 'play-btn';
  playBtn.textContent = '▶';
  playBtn.title = 'Écouter';
  playBtn.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    togglePlay(filename, fullpath, playBtn);
  };
  row.appendChild(playBtn);

  const label = document.createElement('span');
  label.className = `file ${status} led-${status}`;
  label.textContent = filename;
  label.dataset.filename = filename;
  label.dataset.fullpath = fullpath;
  row.appendChild(label);

  if (year) {
    const span = document.createElement('span');
    span.className = 'year';
    span.textContent = year;
    row.appendChild(span);
  }
  if (codec) {
    const span = document.createElement('span');
    span.className = 'codec';
    span.textContent = codec;
    row.appendChild(span);
  }
  row.dataset.durationSeconds = duration ? String(duration) : '';
  if (duration) {
    const span = document.createElement('span');
    span.className = 'duration';
    span.textContent = formatDuration(duration);
    row.appendChild(span);
  }

  // Rating display (visible in source tree + épars)
  const ratingVal = getRating(fullpath);
  const ratingSpan = document.createElement('span');
  ratingSpan.className = 'file-rating';
  ratingSpan.dataset.fullpath = fullpath;
  if (ratingVal !== undefined) {
    ratingSpan.textContent = String(ratingVal);
  }
  ratingSpan.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    const cont = row.closest(
      '#epars-container, #source-container, #playlist-source-container',
    ) as HTMLElement | null;
    if (!cont) return;
    for (const el of cont.querySelectorAll('.focused')) el.classList.remove('focused');
    row.classList.add('focused');
    // Only open inline edit in playlist source tree
    if (cont.id === 'playlist-source-container') {
      startSourceRatingEdit();
    }
  };
  row.appendChild(ratingSpan);

  // ── Click-to-focus (C1): synchronise souris ↔ clavier ──────────────
  row.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('.play-btn')) return;

    const container = row.closest(
      '#epars-container, #source-container, #playlist-source-container',
    ) as HTMLElement | null;
    if (!container) return;

    focusItemByElement(container, row);

    if (container.id !== 'playlist-source-container') {
      setActivePanel(container.id === 'epars-container' ? 'epars' : 'source');
    }

    if (row.querySelector('.led-playing')) {
      stopPlayer();
    }
  };

  // Double-clic → play (I5)
  row.ondblclick = () => {
    (row.querySelector('.play-btn') as HTMLElement | null)?.click();
  };

  // Drag & drop (A9) : éparpillé → source
  row.draggable = true;
  row.ondragstart = (e: DragEvent) => {
    const fileLabel = row.querySelector('.file') as HTMLElement | null;
    const eparDir = fileLabel?.dataset?.epardir || '';
    const fname = fileLabel?.dataset?.filename || '';
    e.dataTransfer?.setData('application/x-epars-copy', JSON.stringify({ filename: fname, eparDir }));
    row.classList.add('dragging-source');
  };
  row.ondragend = () => row.classList.remove('dragging-source');

  // Context menu (A7)
  row.oncontextmenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fileLabel = row.querySelector('.file') as HTMLElement | null;
    const isNouveau = fileLabel?.classList.contains('nouveau');
    const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
      { label: '▶ Jouer', action: () => (row.querySelector('.play-btn') as HTMLElement)?.click() },
    ];
    if (isNouveau && fileLabel) {
      const fname = fileLabel.dataset.filename || '';
      const eparDir = fileLabel.dataset.epardir || '';
      items.push({
        label: '● Sélectionner pour copie',
        action: () => selectEparsFile(fileLabel, fname, eparDir),
      });
    }
    showContextMenu(e.clientX, e.clientY, items);
  };

  return row;
}

// ── Journal ───────────────────────────────────────────────────────────────

export function renderJournal(): void {
  const container = document.getElementById('journal-content');
  if (!container) return;
  if (!state.journal || state.journal.length === 0) {
    container.innerHTML = '<div style="color:#585b70">Aucune opération enregistrée.</div>';
    return;
  }
  container.innerHTML = [...state.journal]
    .reverse()
    .map((e: Record<string, unknown>) => {
      const ts = ((e.timestamp as string) || '').slice(0, 19).replace('T', ' ');
      if (e.status === 'copied') return `<div class="copied">[${ts}] 📋 ${e.filename} → ${e.destination}</div>`;
      if (e.status === 'scan') return `<div class="scanned">[${ts}] 🔍 ${e.action} — ${e.details}</div>`;
      if (e.status === 'config') return `<div class="configured">[${ts}] ⚙️ ${e.action} — ${e.details}</div>`;
      return `<div class="error">[${ts}] ${e.action || e.filename || '?'}</div>`;
    })
    .join('');
}

// ── Éparpillé panel ───────────────────────────────────────────────────────

function selectEparsFile(
  el: HTMLElement,
  filename: string,
  eparDir: string,
  opts?: { ctrl?: boolean; shift?: boolean },
): void {
  const row = el.closest('.file-row') as HTMLElement | null;
  const container = document.getElementById('epars-container');
  const fullpath = el.dataset.fullpath || '';
  const key = `${eparDir}/${filename}`;

  if (opts?.ctrl) {
    // Toggle individuel
    if (state.selectedEparsFiles.has(key)) {
      state.selectedEparsFiles.delete(key);
      el.classList.remove('selected');
    } else {
      state.selectedEparsFiles.set(key, { filename, eparDir, fullpath });
      el.classList.add('selected');
    }
    if (container) {
      const items = getItemsForSelection(container);
      state.lastSelectedEparsIndex = Array.from(items).indexOf(el);
    }
  } else if (opts?.shift && state.lastSelectedEparsIndex !== null && container) {
    // Range select
    const items = getItemsForSelection(container);
    const currentIdx = Array.from(items).indexOf(el);
    const start = Math.min(state.lastSelectedEparsIndex, currentIdx);
    const end = Math.max(state.lastSelectedEparsIndex, currentIdx);
    state.selectedEparsFiles.clear();
    for (const f of document.querySelectorAll('#epars-container .file.selected')) f.classList.remove('selected');
    for (let i = start; i <= end; i++) {
      const item = items[i] as HTMLElement | null;
      const fl = item?.querySelector('.file.nouveau') as HTMLElement | null;
      if (fl) {
        const fn = fl.dataset.filename || '';
        const ed = fl.dataset.epardir || '';
        const fp = fl.dataset.fullpath || '';
        state.selectedEparsFiles.set(`${ed}/${fn}`, { filename: fn, eparDir: ed, fullpath: fp });
        fl.classList.add('selected');
      }
    }
    state.lastSelectedEparsIndex = currentIdx;
  } else {
    // Single select (or Shift without anchor)
    state.selectedEparsFiles.clear();
    for (const f of document.querySelectorAll('#epars-container .file.selected')) f.classList.remove('selected');
    state.selectedEparsFiles.set(key, { filename, eparDir, fullpath });
    el.classList.add('selected');
    if (container) {
      const items = getItemsForSelection(container);
      state.lastSelectedEparsIndex = Array.from(items).indexOf(el);
    }
  }

  const count = state.selectedEparsFiles.size;
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = count > 1
      ? `${count} fichiers sélectionnés. Tab → F5 pour copier.`
      : 'Appuie sur Tab → F5 pour copier.';
  }
  setActivePanel('epars');
  if (row && container) focusItemByElement(container, row);
}

function getItemsForSelection(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll('.file.nouveau');
}

export function renderEpars(): void {
  const container = document.getElementById('epars-container');
  if (!container) return;
  const savedScrollTop = container.scrollTop;
  container.innerHTML = '';

  const totalFiles = countAllEparsFiles(state.eparsFiles);
  const headerCount = document.getElementById('epars-header-count');
  if (headerCount) headerCount.textContent = totalFiles > 0 ? `(${totalFiles.toLocaleString('fr')})` : '';

  let countNouveau = 0,
    countDoublon = 0,
    countTraite = 0;

  for (const [dirPath, files] of Object.entries(state.eparsFiles)) {
    const dirDiv = document.createElement('div');
    dirDiv.className = 'directory';
    dirDiv.dataset.focuspath = `epars-dir:${dirPath}`;
    const shortName = dirPath.split('/').filter(Boolean).pop() || dirPath;
    dirDiv.textContent = shortName;
    dirDiv.title = dirPath;
    container.appendChild(dirDiv);

    const fileList = document.createElement('div');
    fileList.className = 'children';
    container.appendChild(fileList);

    const sorted = Object.entries(files).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [filename, data] of sorted) {
      const relPath = data.path;
      const fullpath = `${dirPath}/${relPath}`;
      const status = computeStatus(filename, state.sourceFiles, state.journal as any);
      if (status === 'nouveau') countNouveau++;
      else if (status === 'doublon') countDoublon++;
      else if (status === 'traite') countTraite++;

      const row = makeFileEl(filename, relPath, status, fullpath, data.year, data.duration, data.codec);
      const label2 = row.querySelector('.file') as HTMLElement;
      if (label2) {
        label2.dataset.epardir = dirPath;
        label2.onclick = (e: MouseEvent) => {
          selectEparsFile(label2, filename, dirPath, { ctrl: e.ctrlKey, shift: e.shiftKey });
        };
      }
      fileList.appendChild(row);
    }
  }

  const statusLine = document.getElementById('epars-status-line');
  if (statusLine) {
    statusLine.innerHTML = `
      <span class="s-traite">✓ ${countTraite.toLocaleString('fr')} traité</span>
      <span class="s-reste">● ${countNouveau.toLocaleString('fr')} reste</span>
      <span class="s-doublon">○ ${countDoublon.toLocaleString('fr')} doublon</span>
    `;
  }

  requestAnimationFrame(() => { container.scrollTop = savedScrollTop; });
}

// ── Source Data panel ─────────────────────────────────────────────────────

function buildSourceChildren(
  node: TreeNode,
  fullPath: string,
  baseDir: string,
  isFiltered: boolean,
  _inPlaylistPaths?: Set<string> | null,
  toggleFn?: ToggleFn,
): HTMLDivElement {
  const toggle = toggleFn || toggleSourceDir;
  const childContainer = document.createElement('div');
  childContainer.className = 'children';

  let inPlaylistPaths = _inPlaylistPaths;
  if (!inPlaylistPaths && state.playlistMode) {
    const name = getActivePlaylistName();
    const pendingTracks = getPendingTracks(name);
    inPlaylistPaths = new Set(pendingTracks.map(t => t.fullPath));
  }

  const subDirs = Object.keys(node)
    .filter(k => k !== '__files__')
    .sort();
  for (const subName of subDirs) {
    const subFullPath = `${fullPath}/${subName}`;
    const subNode = node[subName] as TreeNode;
    const subFiles = (subNode.__files__ || []) as FileEntry[];
    const subExpanded = state.sourceExpanded.has(subFullPath);

    const dirEl = document.createElement('div');
    dirEl.className = `directory${subExpanded ? ' expanded' : ''}`;
    dirEl.dataset.dirpath = subFullPath;
    dirEl.dataset.focuspath = subFullPath;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = subName;
    dirEl.appendChild(nameSpan);
    if (subFiles.length > 0) {
      const countSpan = document.createElement('span');
      countSpan.className = 'dir-count';
      countSpan.textContent = `(${subFiles.length})`;
      dirEl.appendChild(countSpan);
    }
    dirEl.onclick = () => {
      const cont = dirEl.closest(
        '#source-container, #playlist-source-container, #epars-container',
      ) as HTMLElement | null;
      if (cont) {
        focusItemByElement(cont, dirEl);
        if (cont.id === 'epars-container') setActivePanel('epars');
        else if (cont.id !== 'playlist-source-container') setActivePanel('source');
      }
      toggle(subFullPath);
    };
    dirEl.oncontextmenu = (e: MouseEvent) => {
      e.preventDefault();
      showDirContextMenu(e.clientX, e.clientY, subFullPath);
    };
    dirEl.ondragover = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('application/x-epars-copy')) return;
      e.preventDefault();
      dirEl.classList.add('drag-over');
    };
    dirEl.ondragleave = () => dirEl.classList.remove('drag-over');
    dirEl.ondrop = (e: DragEvent) => {
      e.preventDefault();
      dirEl.classList.remove('drag-over');
      const raw = e.dataTransfer?.getData('application/x-epars-copy');
      if (raw) {
        try {
          const { filename, eparDir } = JSON.parse(raw);
          doDragCopy(filename, eparDir, subFullPath);
        } catch (_) { /* invalid data */ }
      }
    };
    childContainer.appendChild(dirEl);
    state.sourceNodeMap.set(subFullPath, { node: subNode, baseDir });

    if (subExpanded) {
      dirEl.appendChild(buildSourceChildren(subNode, subFullPath, baseDir, isFiltered, inPlaylistPaths, toggleFn));
    }
  }

  if (!isFiltered) {
    const status: FileStatus = inPlaylistPaths ? 'nouveau' : 'doublon';
    for (const f of (node.__files__ || []) as FileEntry[]) {
      const fullFilePath = `${baseDir}/${f.relPath}`;
      const row = makeFileEl(f.filename, f.relPath, status, fullFilePath, f.year, f.duration, f.codec);
      if (inPlaylistPaths?.has(fullFilePath)) {
        const label = row.querySelector('.file');
        if (label) label.classList.add('in-playlist');
      }
      childContainer.appendChild(row);
    }
  }
  return childContainer;
}

export function toggleSourceDir(dirPath: string, containerSelector = '#source-container'): void {
  const dirEl = document.querySelector(
    `${containerSelector} .directory[data-dirpath="${CSS.escape(dirPath)}"]`,
  ) as HTMLElement | null;
  if (!dirEl) return;

  const existingChildren = dirEl.querySelector('.children');
  if (existingChildren) {
    state.sourceExpanded.delete(dirPath);
    state.sourceManuallyExpanded.delete(dirPath);
    dirEl.classList.remove('expanded');
    existingChildren.remove();
  } else {
    state.sourceExpanded.add(dirPath);
    state.sourceManuallyExpanded.add(dirPath);
    dirEl.classList.add('expanded');
    const info = state.sourceNodeMap.get(dirPath);
    if (info) {
      const childrenEl = buildSourceChildren(info.node as TreeNode, dirPath, info.baseDir, state.filterActive);
      dirEl.appendChild(childrenEl);
      requestAnimationFrame(() => {
        const cont = dirEl.closest('#source-container, #playlist-source-container') as HTMLElement | null;
        const firstChild = dirEl.querySelector('.children > .directory, .children > .file-row') as HTMLElement | null;
        if (cont && firstChild) focusItemByElement(cont, firstChild);
      });
    }
  }
  updateSourceHeaderCount();
}

function togglePlaylistSourceDir(dirPath: string): void {
  toggleSourceDir(dirPath, '#playlist-source-container');
}

function updateSourceHeaderCount(): void {
  if (!state.filterActive) return;
  const dirs = document.querySelectorAll('#source-container .directory');
  const filterCount = document.getElementById('source-filter-count');
  if (filterCount) {
    filterCount.textContent =
      dirs.length === 0 ? 'Aucun dossier trouvé' : `${dirs.length} dossier${dirs.length > 1 ? 's' : ''}`;
  }
}

function renderDirTree(node: TreeNode, container: HTMLElement, basePath: string, toggleFn?: ToggleFn): void {
  const toggle = toggleFn || toggleSourceDir;
  const dirNames = Object.keys(node)
    .filter(k => k !== '__files__')
    .sort();
  for (const name of dirNames) {
    const fullPath = `${basePath}/${name}`;
    const subNode = node[name] as TreeNode;
    const isExpanded = state.sourceExpanded.has(fullPath);
    const files = (subNode.__files__ || []) as FileEntry[];

    const dirEl = document.createElement('div');
    dirEl.className = `directory${isExpanded ? ' expanded' : ''}`;
    dirEl.dataset.dirpath = fullPath;
    dirEl.dataset.focuspath = fullPath;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    dirEl.appendChild(nameSpan);
    if (files.length > 0) {
      const countSpan = document.createElement('span');
      countSpan.className = 'dir-count';
      countSpan.textContent = `(${files.length})`;
      dirEl.appendChild(countSpan);
    }
    dirEl.onclick = () => {
      const cont = dirEl.closest(
        '#source-container, #playlist-source-container, #epars-container',
      ) as HTMLElement | null;
      if (cont) {
        focusItemByElement(cont, dirEl);
        if (cont.id === 'epars-container') setActivePanel('epars');
        else if (cont.id !== 'playlist-source-container') setActivePanel('source');
      }
      toggle(fullPath);
    };
    dirEl.oncontextmenu = (e: MouseEvent) => {
      e.preventDefault();
      showDirContextMenu(e.clientX, e.clientY, fullPath);
    };
    dirEl.ondragover = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('application/x-epars-copy')) return;
      e.preventDefault();
      dirEl.classList.add('drag-over');
    };
    dirEl.ondragleave = () => dirEl.classList.remove('drag-over');
    dirEl.ondrop = (e: DragEvent) => {
      e.preventDefault();
      dirEl.classList.remove('drag-over');
      const raw = e.dataTransfer?.getData('application/x-epars-copy');
      if (raw) {
        try {
          const { filename, eparDir } = JSON.parse(raw);
          doDragCopy(filename, eparDir, fullPath);
        } catch (_) { /* invalid data */ }
      }
    };
    container.appendChild(dirEl);
    state.sourceNodeMap.set(fullPath, { node: subNode, baseDir: basePath });

    if (isExpanded) {
      dirEl.appendChild(buildSourceChildren(subNode, fullPath, basePath, false, undefined, toggleFn));
    }
  }
}

function renderFilteredSource(container: HTMLElement, allTrees: TreeAndDir[]): number {
  let visibleCount = 0;
  const term = state.sourceFilter.toLowerCase();
  for (const { tree, dirPath } of allTrees) {
    const dirNames = Object.keys(tree)
      .filter(k => k !== '__files__')
      .sort();
    for (const name of dirNames) {
      if (!name.toLowerCase().includes(term) && !dirHasMatchingDescendant(tree[name] as TreeNode, term)) continue;
      visibleCount++;
      renderFilteredDirNode(tree[name] as TreeNode, container, dirPath, name);
    }
  }
  return visibleCount;
}

function renderFilteredDirNode(node: TreeNode, container: HTMLElement, basePath: string, name: string): void {
  const term = state.sourceFilter.toLowerCase();
  const fullPath = `${basePath}/${name}`;
  if (!name.toLowerCase().includes(term) && !dirHasMatchingDescendant(node, term)) return;

  const manualExpand = state.sourceExpanded.has(fullPath);
  const isExpanded = dirHasMatchingDescendant(node, term) || manualExpand;
  const files = (node.__files__ || []) as FileEntry[];

  const dirEl = document.createElement('div');
  dirEl.className = `directory${isExpanded ? ' expanded' : ''}`;
  dirEl.dataset.dirpath = fullPath;
  dirEl.dataset.focuspath = fullPath;

  const nameSpan = document.createElement('span');
  nameSpan.textContent = name;
  dirEl.appendChild(nameSpan);
  if (files.length > 0) {
    const countSpan = document.createElement('span');
    countSpan.className = 'dir-count';
    countSpan.textContent = `(${files.length})`;
    dirEl.appendChild(countSpan);
  }
  dirEl.onclick = () => {
    const cont = dirEl.closest('#source-container') as HTMLElement | null;
    if (cont) {
      focusItemByElement(cont, dirEl);
      setActivePanel('source');
    }
    toggleSourceDir(fullPath);
  };
  dirEl.oncontextmenu = (e: MouseEvent) => {
    e.preventDefault();
    showDirContextMenu(e.clientX, e.clientY, fullPath);
  };
  dirEl.ondragover = (e: DragEvent) => {
    if (!e.dataTransfer?.types.includes('application/x-epars-copy')) return;
    e.preventDefault();
    dirEl.classList.add('drag-over');
  };
  dirEl.ondragleave = () => dirEl.classList.remove('drag-over');
  dirEl.ondrop = (e: DragEvent) => {
    e.preventDefault();
    dirEl.classList.remove('drag-over');
    const raw = e.dataTransfer?.getData('application/x-epars-copy');
    if (raw) {
      try {
        const { filename, eparDir } = JSON.parse(raw);
        doDragCopy(filename, eparDir, fullPath);
      } catch (_) { /* invalid data */ }
    }
  };
  container.appendChild(dirEl);
  state.sourceNodeMap.set(fullPath, { node, baseDir: basePath });

  if (isExpanded) {
    dirEl.appendChild(buildSourceChildren(node, fullPath, basePath, !manualExpand));
  }
}

export function renderSource(): void {
  const container = document.getElementById('source-container');
  if (!container) return;
  const savedScrollTop = container.scrollTop;
  container.innerHTML = '';
  state.sourceNodeMap.clear();

  const allTrees: TreeAndDir[] = [];
  let totalCount = 0;

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree: TreeNode = {};
    for (const [filename, data] of Object.entries(files)) {
      const parts = data.path.split('/');
      totalCount++;
      if (parts.length <= 1) continue;
      let current: TreeNode = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key]) current[key] = {};
        current = current[key] as TreeNode;
      }
      current.__files__ = current.__files__ || [];
      const entries = current.__files__;
      entries.push({
        filename,
        relPath: data.path,
        year: data.year,
        duration: data.duration,
        codec: data.codec,
        baseDir: dirPath,
      } as FileEntry);
    }
    allTrees.push({ tree, dirPath });
  }

  const headerCount = document.getElementById('source-header-count');
  if (state.filterActive && state.sourceFilter) {
    const filteredCount = renderFilteredSource(container, allTrees);
    if (headerCount)
      headerCount.textContent = `(${filteredCount.toLocaleString('fr')} / ${totalCount.toLocaleString('fr')})`;
    const filterCount = document.getElementById('source-filter-count');
    if (filterCount) {
      filterCount.textContent =
        filteredCount === 0 ? 'Aucun dossier trouvé' : `${filteredCount} dossier${filteredCount > 1 ? 's' : ''}`;
    }
  } else {
    for (const { tree, dirPath } of allTrees) {
      renderDirTree(tree, container, dirPath);
    }
    if (headerCount) headerCount.textContent = totalCount > 0 ? `(${totalCount.toLocaleString('fr')})` : '';
    if (!state.filterActive) {
      const filterCount = document.getElementById('source-filter-count');
      if (filterCount) filterCount.textContent = '';
    }
  }

  requestAnimationFrame(() => { container.scrollTop = savedScrollTop; });
}

// ── Targeted DOM patches after copy (avoids full rebuild) ────────────────

export function patchEparsFileAfterCopy(filename: string, eparDir: string): void {
  const fileSpan = document.querySelector(
    `#epars-container .file[data-filename="${CSS.escape(filename)}"][data-epardir="${CSS.escape(eparDir)}"]`,
  ) as HTMLElement | null;
  if (!fileSpan) return;

  const newStatus = computeStatus(filename, state.sourceFiles, state.journal as any);
  fileSpan.className = fileSpan.className
    .replace(/\bled-(nouveau|doublon|traite)\b/g, '')
    .replace(/\b(nouveau|doublon|traite)\b/g, '')
    .trim();
  fileSpan.classList.add(newStatus, `led-${newStatus}`);

  if (newStatus !== 'nouveau') {
    fileSpan.onclick = null;
    fileSpan.classList.remove('selected');
  }

  const allFileSpans = document.querySelectorAll('#epars-container .file');
  let countNouveau = 0,
    countDoublon = 0,
    countTraite = 0;
  for (const fs of allFileSpans) {
    if (fs.classList.contains('nouveau')) countNouveau++;
    else if (fs.classList.contains('doublon')) countDoublon++;
    else if (fs.classList.contains('traite')) countTraite++;
  }
  const statusLine = document.getElementById('epars-status-line');
  if (statusLine) {
    statusLine.innerHTML = `
      <span class="s-traite">✓ ${countTraite.toLocaleString('fr')} traité</span>
      <span class="s-reste">● ${countNouveau.toLocaleString('fr')} reste</span>
      <span class="s-doublon">○ ${countDoublon.toLocaleString('fr')} doublon</span>
    `;
  }

  const totalFiles = countAllEparsFiles(state.eparsFiles);
  const headerCount = document.getElementById('epars-header-count');
  if (headerCount) headerCount.textContent = totalFiles > 0 ? `(${totalFiles.toLocaleString('fr')})` : '';
}

export function patchSourceFileAfterCopy(
  destDir: string,
  filename: string,
  fileData: { path: string; year: string | null; duration: number | null; codec: string | null },
): boolean {
  let curr = destDir;
  let ancestorInfo: { node: Record<string, unknown>; baseDir: string } | undefined;
  const missingParts: string[] = [];

  while (curr) {
    ancestorInfo = state.sourceNodeMap.get(curr);
    if (ancestorInfo) break;
    const slashIdx = curr.lastIndexOf('/');
    if (slashIdx === -1) break;
    missingParts.unshift(curr.substring(slashIdx + 1));
    curr = curr.substring(0, slashIdx);
  }

  if (!ancestorInfo) return false;

  let node: TreeNode = ancestorInfo.node as unknown as TreeNode;
  let currentPath = curr;

  for (const part of missingParts) {
    if (!node[part]) node[part] = {};
    node = node[part] as TreeNode;
    currentPath += `/${part}`;
    state.sourceNodeMap.set(currentPath, {
      node: node as unknown as Record<string, unknown>,
      baseDir: ancestorInfo.baseDir,
    });
  }

  node.__files__ = node.__files__ || [];
  const entries = node.__files__;
  entries.push({
    filename,
    relPath: fileData.path,
    year: fileData.year,
    duration: fileData.duration,
    codec: fileData.codec,
    baseDir: ancestorInfo.baseDir,
  } as FileEntry);

  let totalSource = 0;
  for (const files of Object.values(state.sourceFiles)) {
    totalSource += Object.keys(files).length;
  }
  const headerCount = document.getElementById('source-header-count');
  if (!state.filterActive) {
    if (headerCount) headerCount.textContent = totalSource > 0 ? `(${totalSource.toLocaleString('fr')})` : '';
  } else if (headerCount) {
    const currentMatches = headerCount.textContent.match(/[\d\s]+(?= \/)/);
    const filtered = currentMatches ? parseInt(currentMatches[0].replace(/\s/g, ''), 10) : totalSource;
    headerCount.textContent = `(${filtered.toLocaleString('fr')} / ${totalSource.toLocaleString('fr')})`;
  }

  const dirEl = document.querySelector(
    `#source-container .directory[data-dirpath="${CSS.escape(destDir)}"]`,
  ) as HTMLElement | null;
  if (dirEl) {
    let countBadge = dirEl.querySelector('.dir-count') as HTMLElement | null;
    const totalFiles = (node.__files__ || []).length;
    if (countBadge) {
      countBadge.textContent = `(${totalFiles})`;
    } else if (totalFiles > 0) {
      countBadge = document.createElement('span');
      countBadge.className = 'dir-count';
      countBadge.textContent = `(${totalFiles})`;
      dirEl.appendChild(countBadge);
    }

    const children = dirEl.querySelector('.children');
    if (children) {
      const newRow = makeFileEl(
        filename,
        fileData.path,
        'doublon',
        `${destDir}/${filename}`,
        fileData.year,
        fileData.duration,
        fileData.codec,
      );
      let inserted = false;
      const rows = children.querySelectorAll('.file-row');
      for (const row of rows) {
        const existing = (row.querySelector('.file') as HTMLElement | null)?.textContent || '';
        if (filename.localeCompare(existing) < 0) {
          children.insertBefore(newRow, row);
          inserted = true;
          break;
        }
      }
      if (!inserted) children.appendChild(newRow);
    }
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Playlist mode rendering (tabs, tracks, source tree)
// ═══════════════════════════════════════════════════════════════════════════

export function renderPlaylistPanel(): void {
  renderPlaylistTabs();
  renderPlaylistTracks();
}

function renderPlaylistTabs(): void {
  const container = document.getElementById('playlist-tabs');
  if (!container) return;
  container.innerHTML = '';

  const allNames = Array.from(new Set([...state.playlists.map(p => p.name), ...Object.keys(state.pendingPlaylists)]));

  for (const [i, name] of allNames.entries()) {
    const tab = document.createElement('span');
    tab.className = `pl-tab${i === state.activePlaylistIndex ? ' active' : ''}`;
    tab.textContent = name;

    const pl = state.playlists.find(p => p.name === name);
    if (pl?.exported) {
      const badge = document.createElement('span');
      badge.className = 'pl-tab-badge';
      badge.textContent = '✅';
      tab.appendChild(badge);
    }

    const closeBtn = document.createElement('span');
    closeBtn.className = 'pl-tab-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      closePlaylistTab(name);
    };
    tab.appendChild(closeBtn);

    tab.onclick = async () => {
      const oldName = getActivePlaylistName();
      const oldTracks = getPendingTracks(oldName);
      if (oldTracks.length > 0) {
        await savePlaylist(oldName, oldTracks);
      }
      state.activePlaylistIndex = i;
      renderPlaylistPanel();
    };
    container.appendChild(tab);
  }

  const addBtn = document.createElement('span');
  addBtn.className = 'pl-tab-add';
  addBtn.textContent = '+';
  addBtn.title = 'Nouvelle playlist';
  addBtn.onclick = () => {
    const name = prompt('Nom de la nouvelle playlist :', `playlist-${Date.now()}`);
    if (name?.trim()) {
      createNewPlaylist(name.trim());
      const newKeys = Array.from(
        new Set([...state.playlists.map(p => p.name), ...Object.keys(state.pendingPlaylists)]),
      );
      state.activePlaylistIndex = newKeys.indexOf(name.trim());
      renderPlaylistPanel();
    }
  };
  container.appendChild(addBtn);
}

function renderPlaylistTracks(): void {
  const container = document.getElementById('playlist-panel');
  if (!container) return;
  const savedScrollTop = container.scrollTop;
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name) || [];
  const savedPl = state.playlists.find(p => p.name === name);
  const trackCount = tracks.length;
  const totalDuration = tracks.reduce((sum: number, t) => sum + (t.duration || 0), 0);
  const isExported = savedPl?.exported;

  let html = `<div class="pl-info">${trackCount} morceau${trackCount > 1 ? 'x' : ''}`;
  if (totalDuration > 0) {
    const m = Math.floor(totalDuration / 60);
    const s = totalDuration % 60;
    html += ` — ${m}:${s.toString().padStart(2, '0')}`;
  }
  if (isExported) {
    html += ` — ✅ Exportée le ${(savedPl.exported as string).slice(0, 10)}`;
  }
  html += '</div>';

  if (tracks.length === 0) {
    html += '<div class="pl-empty">Aucun morceau. Navigue dans Source Data et appuie sur Espace pour ajouter.</div>';
  } else {
    html += '<div id="playlist-tracks" class="pl-tracks">';
    tracks.forEach((track, i) => {
      html += `<div class="pl-track" draggable="true" data-index="${i}">`;
      html += `<span class="pl-drag-handle">⬍</span>`;
      html += `<span class="pl-track-name">${escapeHtml(track.filename)}</span>`;
      if (track.year) html += `<span class="pl-track-year">${escapeHtml(track.year)}</span>`;
      if (track.codec) html += `<span class="pl-track-codec">${escapeHtml(track.codec)}</span>`;
      if (track.duration) {
        const m = Math.floor(track.duration / 60);
        const s = track.duration % 60;
        html += `<span class="pl-track-duration">${m}:${s.toString().padStart(2, '0')}</span>`;
      }
      const rating = getRating(track.fullPath);
      html += `<span class="pl-track-rating" data-fullpath="${escapeHtml(track.fullPath)}">`;
      if (rating !== undefined) {
        html += `${rating}`;
      } else {
        html += `<span class="pl-track-rating-none">—</span>`;
      }
      html += `</span>`;
      html += `<span class="pl-track-remove" data-fullpath="${escapeHtml(track.fullPath)}">✕</span>`;
      html += '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.pl-track-remove').forEach(btn => {
    (btn as HTMLElement).onclick = () => {
      const fullPath = (btn as HTMLElement).dataset.fullpath || '';
      removeTrack(getActivePlaylistName(), fullPath);
      renderPlaylistPanel();
      patchPlaylistSourceFile(fullPath, true);
    };
  });

  // ── Rating inline edit on click (click-to-edit) ──────────────────
  container.querySelectorAll('.pl-track-rating').forEach(el => {
    (el as HTMLElement).onclick = _ratingClickHandler;
  });

  // ── Click-to-focus + context menu on playlist tracks ──────────────
  container.querySelectorAll('.pl-track').forEach(el => {
    const trackEl = el as HTMLElement;
    trackEl.onclick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.pl-track-remove, .pl-track-rating, .pl-drag-handle')) return;
      const tracksContainer = document.getElementById('playlist-tracks');
      if (tracksContainer) {
        tracksContainer.querySelectorAll('.pl-track.focused').forEach(f => f.classList.remove('focused'));
      }
      trackEl.classList.add('focused');
    };

    trackEl.ondblclick = () => {
      const removeBtn = trackEl.querySelector('.pl-track-remove') as HTMLElement | null;
      const fullPath = removeBtn?.dataset.fullpath || '';
      const filename = trackEl.querySelector('.pl-track-name')?.textContent || '';
      if (fullPath) {
        togglePlay(filename, fullPath, trackEl.querySelector('.play-btn') || trackEl);
      }
    };

    // Context menu (A7) on playlist tracks
    trackEl.oncontextmenu = (e: MouseEvent) => {
      e.preventDefault();
      const removeBtn = trackEl.querySelector('.pl-track-remove') as HTMLElement | null;
      const fullPath = removeBtn?.dataset.fullpath || '';
      const filename = trackEl.querySelector('.pl-track-name')?.textContent || '';
      const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
        {
          label: '▶ Jouer',
          action: () => togglePlay(filename, fullPath, trackEl.querySelector('.play-btn') || trackEl),
        },
        {
          label: '✕ Retirer',
          action: () => {
            removeTrack(getActivePlaylistName(), fullPath);
            renderPlaylistPanel();
            patchPlaylistSourceFile(fullPath, true);
          },
          danger: true,
        },
      ];
      showContextMenu(e.clientX, e.clientY, items);
    };
  });

  if (state.playlistTrackFocusIndex !== null && tracks.length > 0) {
    const idx = Math.min(state.playlistTrackFocusIndex, tracks.length - 1);
    const trackEls = container.querySelectorAll('.pl-track');
    if (trackEls[idx]) trackEls[idx].classList.add('focused');
  }

  container.querySelectorAll('.pl-track').forEach(el => {
    const trackEl = el as HTMLElement;
    trackEl.ondragstart = (e: DragEvent) => {
      e.dataTransfer?.setData('text/plain', trackEl.dataset.index || '');
      trackEl.classList.add('dragging');
    };
    trackEl.ondragend = () => trackEl.classList.remove('dragging');
    trackEl.ondragover = (e: DragEvent) => {
      e.preventDefault();
      trackEl.classList.add('drag-over');
    };
    trackEl.ondragleave = () => trackEl.classList.remove('drag-over');
    trackEl.ondrop = (e: DragEvent) => {
      e.preventDefault();
      trackEl.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer?.getData('text/plain') || '', 10);
      const toIdx = parseInt(trackEl.dataset.index || '', 10);
      if (!Number.isNaN(fromIdx) && !Number.isNaN(toIdx)) {
        reorderTrack(getActivePlaylistName(), fromIdx, toIdx);
        renderPlaylistPanel();
      }
    };
  });

  requestAnimationFrame(() => { container.scrollTop = savedScrollTop; });
}

function closePlaylistTab(name: string): void {
  const tracks = getPendingTracks(name);
  const savedPl = state.playlists.find(p => p.name === name);
  if (tracks.length > 0) {
    const msg = savedPl?.exported
      ? `Fermer la playlist "${name}" ? ${tracks.length} morceau(x) (non sauvegardé depuis l'export).`
      : `Fermer la playlist "${name}" ? ${tracks.length} morceau(x) non exporté(s).`;
    if (!confirm(msg)) return;
  }
  removePendingPlaylist(name);
  const keys = Object.keys(state.pendingPlaylists);
  state.activePlaylistIndex = Math.min(state.activePlaylistIndex || 0, Math.max(0, keys.length - 1));
  renderPlaylistPanel();
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function renderPlaylistSource(): void {
  const container = document.getElementById('playlist-source-container');
  if (!container) return;
  container.innerHTML = '';

  const allTrees: TreeAndDir[] = [];
  let totalCount = 0;

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree: TreeNode = {};
    for (const [filename, data] of Object.entries(files)) {
      const parts = data.path.split('/');
      totalCount++;
      if (parts.length <= 1) continue;
      let current: TreeNode = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key]) current[key] = {};
        current = current[key] as TreeNode;
      }
      current.__files__ = current.__files__ || [];
      const entries = current.__files__;
      entries.push({
        filename,
        relPath: data.path,
        year: data.year,
        duration: data.duration,
        codec: data.codec,
        baseDir: dirPath,
      } as FileEntry);
    }
    allTrees.push({ tree, dirPath });
  }

  for (const { tree, dirPath } of allTrees) {
    renderDirTree(tree, container, dirPath, togglePlaylistSourceDir);
  }

  const countEl = document.getElementById('playlist-source-count');
  if (countEl) countEl.textContent = totalCount > 0 ? `(${totalCount.toLocaleString('fr')})` : '';
}

export function renderPlaylistManager(): void {
  const container = document.getElementById('pl-manager-content');
  if (!container) return;

  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    container.innerHTML =
      '<div style="color:var(--text-dim);padding:20px;text-align:center">Aucune playlist.</div>';
    return;
  }

  const allNames = Array.from(new Set([...state.playlists.map(p => p.name), ...Object.keys(state.pendingPlaylists)]));

  let html =
    '<table id="pl-manager-table"><thead><tr><th>Playlist</th><th>Morceaux</th><th>Durée</th><th>Export</th><th>Actions</th></tr></thead><tbody>';
  for (const name of allNames) {
    const saved = state.playlists.find(p => p.name === name);
    const pendingTracks = getPendingTracks(name);
    const tracks = pendingTracks.length > 0 ? pendingTracks : saved?.tracks || [];
    const count = tracks.length;
    const duration = tracks.reduce((sum: number, t) => sum + (t.duration || 0), 0);
    const durStr = duration > 0 ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '—';
    const exported = saved?.exported ? `✅ ${(saved.exported as string).slice(0, 10)}` : '—';

    html += `<tr>`;
    html += `<td>${escapeHtml(name)}</td>`;
    html += `<td>${count}</td>`;
    html += `<td>${durStr}</td>`;
    html += `<td>${exported}</td>`;
    html += `<td class="pl-mgr-actions">`;
    html += `<button class="pl-mgr-load" data-name="${escapeHtml(name)}">Charger</button>`;
    html += `<button class="pl-mgr-rename" data-name="${escapeHtml(name)}">Renommer</button>`;
    html += `<button class="pl-mgr-delete" data-name="${escapeHtml(name)}">Supprimer</button>`;
    html += `</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.pl-mgr-load').forEach(btn => {
    (btn as HTMLElement).onclick = () => {
      closeAllModals();
      const name = (btn as HTMLElement).dataset.name || '';
      const saved = state.playlists.find(p => p.name === name);
      if (saved && !state.pendingPlaylists[name]) {
        setPendingTracks(name, [...saved.tracks]);
      }
      const justEntered = !state.playlistMode;
      if (justEntered) {
        state.playlistMode = true;
        state.playlistFocus = 'source';
        document.getElementById('main-panels')?.classList.add('hidden');
        document.getElementById('playlist-layout')?.classList.remove('hidden');
      }

      const allKeys = Array.from(
        new Set([...state.playlists.map(p => p.name), ...Object.keys(state.pendingPlaylists)]),
      );
      state.activePlaylistIndex = allKeys.indexOf(name);

      renderPlaylistSource();
      renderPlaylistPanel();

      if (justEntered) {
        document.getElementById('playlist-source')?.classList.add('panel-active');
        const statusText = document.getElementById('status-text');
        if (statusText)
          statusText.textContent = '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.';
      }
    };
  });

  container.querySelectorAll('.pl-mgr-rename').forEach(btn => {
    (btn as HTMLElement).onclick = async () => {
      const oldName = (btn as HTMLElement).dataset.name || '';
      const newName = prompt('Nouveau nom :', oldName);
      if (newName?.trim() && newName.trim() !== oldName) {
        const saved = state.playlists.find(p => p.name === oldName);
        const pending = getPendingTracks(oldName);
        if (saved) {
          await renamePlaylist(oldName, newName.trim());
        }
        if (pending.length > 0) {
          setPendingTracks(newName.trim(), pending);
          removePendingPlaylist(oldName);
        }
        renderPlaylistManager();
        renderPlaylistPanel();
      }
    };
  });

  container.querySelectorAll('.pl-mgr-delete').forEach(btn => {
    (btn as HTMLElement).onclick = async () => {
      const name = (btn as HTMLElement).dataset.name || '';
      if (!confirm(`Supprimer la playlist "${name}" ? (Les fichiers exportés ne sont pas affectés.)`)) return;
      await deletePlaylist(name);
      removePendingPlaylist(name);
      const activeName = getActivePlaylistName();
      if (activeName === name) {
        state.activePlaylistIndex = 0;
      }
      renderPlaylistManager();
      renderPlaylistPanel();
    };
  });
}

// ── Rating inline edit ────────────────────────────────────────────────────

let _ratingEditActive = false;

/** Shared onclick handler for .pl-track-rating spans.
 *  Focuses the parent track, then opens the inline rating input. */
function _ratingClickHandler(e: MouseEvent): void {
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement | null;
  if (!target) return;
  const trackEl = target.closest('.pl-track') as HTMLElement | null;
  if (!trackEl) return;
  const tracksContainer = document.getElementById('playlist-tracks');
  if (tracksContainer) {
    tracksContainer.querySelectorAll('.pl-track.focused').forEach(f => f.classList.remove('focused'));
  }
  trackEl.classList.add('focused');
  const panel = document.getElementById('playlist-panel');
  if (panel) {
    const allTracks = Array.from(panel.querySelectorAll('.pl-track'));
    state.playlistTrackFocusIndex = allTracks.indexOf(trackEl);
  }
  state.playlistFocus = 'sidebar';
  startRatingEdit();
}

export function startRatingEdit(): void {
  const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
  if (!focused) return;
  const ratingSpan = focused.querySelector('.pl-track-rating') as HTMLElement | null;
  if (!ratingSpan) return;

  _startInlineRatingEdit(ratingSpan, (_fullPath, newRating) => {
    const span = document.createElement('span');
    span.className = 'pl-track-rating';
    span.dataset.fullpath = _fullPath;
    span.onclick = _ratingClickHandler;
    if (newRating !== undefined) {
      span.textContent = String(newRating);
    } else {
      const noneSpan = document.createElement('span');
      noneSpan.className = 'pl-track-rating-none';
      noneSpan.textContent = '—';
      span.appendChild(noneSpan);
    }
    return span;
  });
}

/** Inline rating edit on a focused file-row in the playlist source tree. */
export function startSourceRatingEdit(): void {
  const focused = document.querySelector('#playlist-source-container .file-row.focused') as HTMLElement | null;
  if (!focused) {
    showToast('ℹ️ ↑↓ pour focuser un fichier, puis N pour noter.');
    return;
  }
  const ratingSpan = focused.querySelector('.file-rating') as HTMLElement | null;
  if (!ratingSpan) return;

  _startInlineRatingEdit(ratingSpan, (_fullPath, newRating) => {
    const span = document.createElement('span');
    span.className = 'file-rating';
    span.dataset.fullpath = _fullPath;
    if (newRating !== undefined) span.textContent = String(newRating);
    span.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      const cont = span.closest(
        '#epars-container, #source-container, #playlist-source-container',
      ) as HTMLElement | null;
      if (!cont) return;
      const row = span.closest('.file-row') as HTMLElement | null;
      if (row) {
        for (const el of cont.querySelectorAll('.focused')) el.classList.remove('focused');
        row.classList.add('focused');
        if (cont.id === 'playlist-source-container') startSourceRatingEdit();
      }
    };
    return span;
  });
}

/** Shared inline rating edit: replaces ratingSpan with input, handles
 *  commit/cancel/blur, then calls rebuildSpan to recreate the display. */
function _startInlineRatingEdit(
  ratingSpan: HTMLElement,
  rebuildSpan: (fullPath: string, newRating: number | undefined) => HTMLElement,
): void {
  if (_ratingEditActive) return;
  const fullPath = ratingSpan.dataset.fullpath || '';
  if (!fullPath) return;

  _ratingEditActive = true;

  const currentRating = getRating(fullPath);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pl-rating-input';
  input.maxLength = 3;
  input.value = currentRating !== undefined ? String(currentRating) : '';
  input.spellcheck = false;

  ratingSpan.replaceWith(input);
  input.focus();
  input.select();

  function commit(): void {
    const val = input.value.trim();
    if (val === '') {
      deleteRating(fullPath).catch(() => showToast('⚠️ Note non supprimée'));
    } else {
      const num = parseInt(val, 10);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        saveRating(fullPath, num).catch(() => showToast('⚠️ Note non sauvegardée'));
      }
    }
    finish();
  }

  function cancel(): void {
    finish();
  }

  function finish(): void {
    _ratingEditActive = false;
    const newRating = getRating(fullPath);
    const span = rebuildSpan(fullPath, newRating);
    input.replaceWith(span);
  }

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  input.addEventListener('blur', () => {
    if (!_ratingEditActive) return;
    const val = input.value.trim();
    if (val === '') {
      deleteRating(fullPath).catch(() => showToast('⚠️ Note non supprimée'));
    } else {
      const num = parseInt(val, 10);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        saveRating(fullPath, num).catch(() => showToast('⚠️ Note non sauvegardée'));
      }
    }
    finish();
  });
}

export function patchPlaylistSourceFile(fullPath: string, remove: boolean): void {
  const label = document.querySelector(`#playlist-source-container .file[data-fullpath="${CSS.escape(fullPath)}"]`);
  if (!label) return;
  if (remove) {
    label.classList.remove('in-playlist');
  } else {
    label.classList.add('in-playlist');
  }
}

// ── Render all ────────────────────────────────────────────────────────────

export function renderAll(): void {
  renderEpars();
  renderSource();
  requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
}
