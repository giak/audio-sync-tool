// ─── Source Data panel: tree building, toggle, filtering, rendering ───────

import { api } from '../api.js';
import { focusItemByElement, focusItemByPath, revalidateFocus, setActivePanel } from '../focus.js';
import { getActivePlaylistName, getPendingTracks } from '../playlist.js';
import { state, type TreeNode } from '../state.js';
import { confirmDialog, showContextMenu, showError } from '../ui.js';
import { dirHasMatchingDescendant, dirHasMatchingFile, type FileStatus } from '../utils.js';
import { setBatchCopy } from './batchCopy.js';
import { openCueEditor } from './cueEditor.js';
import { doDragCopy } from './dragDrop.js';
import { renderEpars } from './eparsUI.js';
import { makeFileEl, makeFileTable } from './fileRow.js';
import { ensureFilterChip, getFilterTerm, isFileFilter, updateFilterCount } from './filterChip.js';
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
  fileTerm = '',
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
    const lowerTerm = fileTerm.toLowerCase();
    const entries = (node.__files__ || []) as FileEntry[];
    // Mode fichiers (toggle 📄) : seuls les fichiers matchant le terme sont rendus.
    const visible = lowerTerm ? entries.filter(f => f.filename.toLowerCase().includes(lowerTerm)) : entries;
    for (const f of visible) {
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
        // Fichiers masqués UNIQUEMENT si le filtre traque les fichiers
        // (toggle 📄 actif). En mode dossiers seuls (défaut), l'expansion —
        // manuelle ou auto — montre TOUS les fichiers du dossier : consulter
        // le contenu sous filtre est le moyen de vérifier un doublon.
        isFileFilter('sync-source') || isFileFilter('playlist-source'),
        undefined,
        undefined,
        fileTermForTrees(),
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

/** Terme de recherche fichier des arbres (mode 📄 uniquement) : le terme du
 *  scope en mode fichiers, sinon chaîne vide (tous les fichiers rendus). */
function fileTermForTrees(): string {
  if (isFileFilter('sync-source')) return getFilterTerm('sync-source');
  if (isFileFilter('playlist-source')) return getFilterTerm('playlist-source');
  return '';
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

// ── Filtered source ─────────────────────────────────────────────────────────

/** Rendu filtré de l'arbre, paramétré par scope (sync-source, playlist-source).
 *  Renvoie le nombre de dossiers racine visibles. */
export function renderFilteredSource(container: HTMLElement, allTrees: TreeAndDir[], scope: string): number {
  let visibleCount = 0;
  const term = getFilterTerm(scope).toLowerCase();
  const filesMode = isFileFilter(scope);
  for (const { tree, dirPath } of allTrees) {
    const dirNames = Object.keys(tree)
      .filter(k => k !== '__files__')
      .sort();
    for (const name of dirNames) {
      const node = tree[name] as TreeNode;
      if (
        !name.toLowerCase().includes(term) &&
        !dirHasMatchingDescendant(node, term) &&
        !(filesMode && dirHasMatchingFile(node, term))
      )
        continue;
      visibleCount++;
      renderFilteredDirNode(node, container, dirPath, name, scope);
    }
  }
  return visibleCount;
}

function renderFilteredDirNode(
  node: TreeNode,
  container: HTMLElement,
  basePath: string,
  name: string,
  scope: string,
): void {
  const term = getFilterTerm(scope).toLowerCase();
  const filesMode = isFileFilter(scope);
  const fullPath = `${basePath}/${name}`;
  const dirMatch = dirHasMatchingDescendant(node, term);
  const fileMatch = filesMode && dirHasMatchingFile(node, term);
  if (!name.toLowerCase().includes(term) && !dirMatch && !fileMatch) return;

  const manualExpand = state.sourceExpanded.has(fullPath);
  const isExpanded = dirMatch || fileMatch || manualExpand;
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
    // Mode fichiers ON : auto-étendu MAIS table rendue, filtrée au terme
    // (le fichier cherché est visible). Mode dossiers : contenu COMPLET —
    // la vérification de doublon exige de voir tout ce que le dossier contient.
    dirEl.appendChild(
      buildSourceChildren(node, fullPath, basePath, false, undefined, undefined, filesMode ? term : ''),
    );
  }
}

// ── Dossiers racine créés via ➕ ─────────────────────────────────────────────

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

  // EPIC-030 : chip de filtre persistant (slot dédié hors du DOM effacé,
  // mémorisé scope 'sync-source') — la saisie survit aux re-renders.
  ensureFilterChip(container, {
    scope: 'sync-source',
    placeholder: 'Filtrer dossiers + fichiers…',
    onChange: renderSource,
    onBlur: () => revalidateFocus(),
    tree: true,
  });

  // Pastilles « déjà rangé » de l'épars : leur visibilité dépend du filtre
  // source — si le panneau gauche est rendu, le rafraîchir (les pastilles
  // périmées suivraient sinon un changement de terme du chip droit).
  const eparsContainer = document.getElementById('epars-container');
  if (eparsContainer && !eparsContainer.classList.contains('hidden')) {
    renderEpars();
    // Le rebuild efface .focused : réapplique la sélection épars persistée
    // (et le twin-hint associé) — rien si aucune sélection.
    if (state.eparsFocusPath) focusItemByPath(eparsContainer, state.eparsFocusPath);
  }

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
    const filteredCount = renderFilteredSource(container, allTrees, 'sync-source');
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
