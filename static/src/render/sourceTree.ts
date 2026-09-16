// ─── Source Data panel: tree building, toggle, filtering, rendering ───────

import { api } from '../api.js';
import { focusItemByElement, revalidateFocus, setActivePanel } from '../focus.js';
import { getActivePlaylistName, getPendingTracks } from '../playlist.js';
import { state, type TreeNode } from '../state.js';
import { confirmDialog, showContextMenu, showError } from '../ui.js';
import { dirHasMatchingDescendant, type FileStatus } from '../utils.js';
import { setBatchCopy } from './batchCopy.js';
import { openCueEditor } from './cueEditor.js';
import { doDragCopy } from './dragDrop.js';
import { makeFileEl, makeFileTable } from './fileRow.js';
import { createFilterChip, getFilterTerm, updateFilterCount } from './filterChip.js';
import { startSourceRatingEdit } from './ratingEdit.js';

// ── Internal types ────────────────────────────────────────────────────────

interface FileEntry {
  filename: string;
  relPath: string;
  year: string | null;
  duration: number | null;
  codec: string | null;
  baseDir: string;
}

interface TreeAndDir {
  tree: TreeNode;
  dirPath: string;
}

type ToggleFn = (dirPath: string) => void;

// ── Context menu + batch copy (inlined to avoid circular deps) ───────────

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
  if (state.sourceExtraDirs.has(dirPath)) {
    items.push({
      label: "❌ Retirer de l'index (dossier conservé sur disque)",
      danger: true,
      action: () => removeSourceExtraDir(dirPath),
    });
  }
  showContextMenu(x, y, items);
}

/** Retire un dossier ➕ de l'index (DELETE /mkdir) — le disque n'est jamais
 *  touché (DATA-SAFETY) : seul le suivi extra_dirs.json est nettoyé. */
function removeSourceExtraDir(dirPath: string): void {
  const sep = dirPath.lastIndexOf('/');
  const name = sep > 0 ? dirPath.slice(sep + 1) : dirPath;
  const root = sep > 0 ? dirPath.slice(0, sep) : dirPath;
  confirmDialog(
    `Retirer « ${name} » de l'index ? Le dossier reste sur le disque.`,
    async () => {
      try {
        await api('/mkdir', {
          method: 'DELETE',
          body: JSON.stringify({ root, name }),
        });
        const next = new Set(state.sourceExtraDirs);
        next.delete(dirPath);
        state.sourceExtraDirs = next; // EventEmitter → re-render
        state.journal = await api<typeof state.journal>('/journal');
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = `✓ « ${name} » retiré de l'index (dossier conservé sur le disque).`;
      } catch (err) {
        showError(`Échec du retrait : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    'Retirer',
  );
}

function batchCopyToDir(destDir: string): void {
  if (state.selectedEparsFiles.size === 0) return;
  setBatchCopy(destDir, [...state.selectedEparsFiles.values()]);
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

// ── Tree building / rendering ─────────────────────────────────────────────

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
        } catch (_) {
          /* invalid data */
        }
      }
    };
    childContainer.appendChild(dirEl);
    state.sourceNodeMap = new Map([...state.sourceNodeMap, [subFullPath, { node: subNode, baseDir }]]);

    if (subExpanded) {
      dirEl.appendChild(buildSourceChildren(subNode, subFullPath, baseDir, isFiltered, inPlaylistPaths, toggleFn));
    }
  }

  if (!isFiltered) {
    const status: FileStatus = inPlaylistPaths ? 'nouveau' : 'doublon';
    const fileTable = makeFileTable(true);
    const tbody = fileTable.querySelector('tbody');
    for (const f of (node.__files__ || []) as FileEntry[]) {
      const fullFilePath = `${baseDir}/${f.relPath}`;
      const row = makeFileEl(
        f.filename,
        f.relPath,
        status,
        fullFilePath,
        f.year,
        f.duration,
        f.codec,
        undefined,
        startSourceRatingEdit,
        (fname, fpath) => openCueEditor({ filename: fname, fullPath: fpath }),
      );
      if (inPlaylistPaths?.has(fullFilePath)) {
        const label = row.querySelector('.file');
        if (label) label.classList.add('in-playlist');
      }
      tbody?.appendChild(row);
    }
    if (tbody?.childElementCount) {
      childContainer.appendChild(fileTable);
    }
  }
  return childContainer;
}

// ── Toggle ─────────────────────────────────────────────────────────────────

export function toggleSourceDir(dirPath: string, containerSelector = '#source-container'): void {
  const dirEl = document.querySelector(
    `${containerSelector} .directory[data-dirpath="${CSS.escape(dirPath)}"]`,
  ) as HTMLElement | null;
  if (!dirEl) return;

  const existingChildren = dirEl.querySelector('.children');
  if (existingChildren) {
    const nextExpanded = new Set(state.sourceExpanded);
    nextExpanded.delete(dirPath);
    state.sourceExpanded = nextExpanded;
    const nextManually = new Set(state.sourceManuallyExpanded);
    nextManually.delete(dirPath);
    state.sourceManuallyExpanded = nextManually;
    dirEl.classList.remove('expanded');
    existingChildren.remove();
  } else {
    state.sourceExpanded = new Set([...state.sourceExpanded, dirPath]);
    state.sourceManuallyExpanded = new Set([...state.sourceManuallyExpanded, dirPath]);
    dirEl.classList.add('expanded');
    const info = state.sourceNodeMap.get(dirPath);
    if (info) {
      const childrenEl = buildSourceChildren(
        info.node as TreeNode,
        dirPath,
        info.baseDir,
        getFilterTerm('sync-source').length > 0,
      );
      dirEl.appendChild(childrenEl);
      requestAnimationFrame(() => {
        const cont = dirEl.closest('#source-container, #playlist-source-container') as HTMLElement | null;
        const firstChild = dirEl.querySelector(
          '.children > .directory, .children > .file-table .file-row',
        ) as HTMLElement | null;
        if (cont && firstChild) focusItemByElement(cont, firstChild);
      });
    }
  }
  updateSourceHeaderCount();
}

export function togglePlaylistSourceDir(dirPath: string): void {
  toggleSourceDir(dirPath, '#playlist-source-container');
}

function updateSourceHeaderCount(): void {
  const dirs = document.querySelectorAll('#source-container .directory');
  const filterCount = document.getElementById('source-filter-count');
  if (filterCount) {
    filterCount.textContent =
      dirs.length === 0 ? 'Aucun dossier trouvé' : `${dirs.length} dossier${dirs.length > 1 ? 's' : ''}`;
  }
}

// ── Directory tree rendering ──────────────────────────────────────────────

export function renderDirTree(node: TreeNode, container: HTMLElement, basePath: string, toggleFn?: ToggleFn): void {
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
        } catch (_) {
          /* invalid data */
        }
      }
    };
    container.appendChild(dirEl);
    state.sourceNodeMap = new Map([...state.sourceNodeMap, [fullPath, { node: subNode, baseDir: basePath }]]);

    if (isExpanded) {
      dirEl.appendChild(buildSourceChildren(subNode, fullPath, basePath, false, undefined, toggleFn));
    }
  }
}

// ── Filtered source ───────────────────────────────────────────────────────

function renderFilteredSource(container: HTMLElement, allTrees: TreeAndDir[]): number {
  let visibleCount = 0;
  const term = getFilterTerm('sync-source').toLowerCase();
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
  const term = getFilterTerm('sync-source').toLowerCase();
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
      } catch (_) {
        /* invalid data */
      }
    }
  };
  container.appendChild(dirEl);
  state.sourceNodeMap = new Map([...state.sourceNodeMap, [fullPath, { node, baseDir: basePath }]]);

  if (isExpanded) {
    dirEl.appendChild(buildSourceChildren(node, fullPath, basePath, !manualExpand));
  }
}

// ── Dossiers racine créés via ➕ ─────────────────────────────────────

/** Les dossiers créés via le bouton ➕ sont vides : absents de l'arbre dérivé
 *  des fichiers scannés, ils seraient invisibles. Rendus ici, au même niveau
 *  que les dossiers scannés. Ceux qui reçoivent des fichiers via Scan
 *  redeviennent des nœuds normaux (exclus de ce rendu). */
function dirExistsInTree(tree: TreeNode, relPath: string): boolean {
  let node: TreeNode = tree;
  for (const seg of relPath.split('/')) {
    const next = node[seg] as TreeNode | undefined;
    if (!next || Array.isArray(next)) return false;
    node = next;
  }
  return true;
}

function renderExtraDirs(container: HTMLElement, allTrees: TreeAndDir[]): void {
  for (const dirPath of state.sourceExtraDirs) {
    let existsAsScanned = false;
    for (const { tree, dirPath: base } of allTrees) {
      if (dirPath === base) {
        existsAsScanned = true;
        break;
      }
      if (dirPath.startsWith(`${base}/`) && dirExistsInTree(tree, dirPath.slice(base.length + 1))) {
        existsAsScanned = true;
        break;
      }
    }
    if (existsAsScanned) continue;
    const name = dirPath.split('/').pop() || dirPath;
    const dirEl = document.createElement('div');
    dirEl.className = 'directory';
    dirEl.dataset.dirpath = dirPath;
    dirEl.dataset.focuspath = dirPath;
    dirEl.dataset.extra = '1';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    dirEl.appendChild(nameSpan);
    const countSpan = document.createElement('span');
    countSpan.className = 'dir-count';
    countSpan.textContent = '(vide)';
    dirEl.appendChild(countSpan);
    dirEl.onclick = () => {
      const cont = dirEl.closest('#source-container, #playlist-source-container') as HTMLElement | null;
      if (cont) {
        focusItemByElement(cont, dirEl);
        if (cont.id !== 'playlist-source-container') setActivePanel('source');
      }
    };
    dirEl.oncontextmenu = (e: MouseEvent) => {
      e.preventDefault();
      showDirContextMenu(e.clientX, e.clientY, dirPath);
    };
    container.appendChild(dirEl);
  }
}

// ── Main render ───────────────────────────────────────────────────────────

export function renderSource(): void {
  const container = document.getElementById('source-container');
  if (!container) return;
  const savedScrollTop = container.scrollTop;
  container.innerHTML = '';
  state.sourceNodeMap = new Map();

  // EPIC-030 : chip de filtre intégré (mémorisé scope 'sync-source')
  createFilterChip(container, {
    scope: 'sync-source',
    placeholder: 'Filtrer dossiers / fichiers…',
    onChange: renderSource,
    onBlur: () => revalidateFocus(),
  });

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

  // État vide (EPIC-014) : rien à afficher → guidance visuelle au lieu d'un panneau muet.
  if (allTrees.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.textContent =
      Object.keys(state.sourceFiles).length === 0
        ? 'Aucun dossier configuré — ouvre ⚙️ Config, renseigne le dossier Source puis 🔄 Scan.'
        : 'Aucun fichier scanné — lance 🔄 Scan.';
    container.appendChild(empty);
  }

  const headerCount = document.getElementById('source-header-count');
  const sourceFilterActive = getFilterTerm('sync-source').length > 0;
  if (sourceFilterActive) {
    const filteredCount = renderFilteredSource(container, allTrees);
    if (headerCount)
      headerCount.textContent = `(${filteredCount.toLocaleString('fr')} / ${totalCount.toLocaleString('fr')})`;
    updateFilterCount('sync-source', filteredCount, totalCount);
    if (filteredCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'Aucun dossier trouvé pour ce filtre.';
      container.appendChild(empty);
    }
  } else {
    for (const { tree, dirPath } of allTrees) {
      renderDirTree(tree, container, dirPath);
    }
    renderExtraDirs(container, allTrees);
    if (headerCount) headerCount.textContent = totalCount > 0 ? `(${totalCount.toLocaleString('fr')})` : '';
  }

  requestAnimationFrame(() => {
    container.scrollTop = savedScrollTop;
  });
}
