// ─── DOM building: file panels, journal, source tree toggle ──────────────
import { state } from './state.js';
import { formatDuration, computeStatus, countAllEparsFiles, dirHasMatchingDescendant } from './utils.js';
import { togglePlay } from './audio.js';
import { setActivePanel, focusItemByElement, revalidateFocus } from './focus.js';
import {
  createNewPlaylist, getPendingTracks, setPendingTracks,
  addTrack, removeTrack, reorderTrack, removePendingPlaylist,
  getActivePlaylistName, savePlaylist, deletePlaylist, renamePlaylist
} from './playlist.js';
import { closeAllModals } from './ui.js';

// ── File element factory ──────────────────────────────────────────────────
function makeFileEl(filename, relPath, status, fullpath, year, duration, codec) {
  const row = document.createElement('div');
  row.className = 'file-row';
  row.dataset.focuspath = fullpath;

  const playBtn = document.createElement('span');
  playBtn.className = 'play-btn';
  playBtn.textContent = '▶';
  playBtn.title = 'Écouter';
  playBtn.onclick = (e) => { e.stopPropagation(); togglePlay(filename, fullpath, playBtn); };
  row.appendChild(playBtn);

  const label = document.createElement('span');
  label.className = `file ${status} led-${status}`;
  label.textContent = filename;
  label.dataset.filename = filename;
  label.dataset.fullpath = fullpath;
  row.appendChild(label);

  if (year) { const span = document.createElement('span'); span.className = 'year'; span.textContent = year; row.appendChild(span); }
  if (codec) { const span = document.createElement('span'); span.className = 'codec'; span.textContent = codec; row.appendChild(span); }
  row.dataset.durationSeconds = duration || '';
  if (duration) { const span = document.createElement('span'); span.className = 'duration'; span.textContent = formatDuration(duration); row.appendChild(span); }
  return row;
}

// ── Journal ───────────────────────────────────────────────────────────────
export function renderJournal() {
  const container = document.getElementById('journal-content');
  if (!state.journal || state.journal.length === 0) {
    container.innerHTML = '<div style="color:#585b70">Aucune opération enregistrée.</div>';
    return;
  }
  container.innerHTML = [...state.journal].reverse().map(e => {
    const ts = (e.timestamp || '').slice(0, 19).replace('T', ' ');
    if (e.status === 'copied') return `<div class="copied">[${ts}] 📋 ${e.filename} → ${e.destination}</div>`;
    if (e.status === 'scan') return `<div class="scanned">[${ts}] 🔍 ${e.action} — ${e.details}</div>`;
    if (e.status === 'config') return `<div class="configured">[${ts}] ⚙️ ${e.action} — ${e.details}</div>`;
    return `<div class="error">[${ts}] ${e.action || e.filename || '?'}</div>`;
  }).join('');
}

// ── Éparpillé panel ───────────────────────────────────────────────────────
function selectEparsFile(el, filename, eparDir) {
  document.querySelectorAll('.file.selected').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('status-text').textContent = 'Appuie sur Tab → F5 pour copier.';
  setActivePanel('epars');
  const row = el.closest('.file-row');
  if (row) focusItemByElement(document.getElementById('epars-container'), row);
}

export function renderEpars() {
  const container = document.getElementById('epars-container');
  container.innerHTML = '';

  const totalFiles = countAllEparsFiles(state.eparsFiles);
  document.getElementById('epars-header-count').textContent = totalFiles > 0 ? `(${totalFiles.toLocaleString('fr')})` : '';

  let countNouveau = 0, countDoublon = 0, countTraite = 0;

  for (const [dirPath, files] of Object.entries(state.eparsFiles)) {
    const dirDiv = document.createElement('div');
    dirDiv.className = 'directory';
    dirDiv.dataset.focuspath = 'epars-dir:' + dirPath;
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
      const fullpath = dirPath + '/' + relPath;
      const status = computeStatus(filename, state.sourceFiles, state.journal);
      if (status === 'nouveau') countNouveau++;
      else if (status === 'doublon') countDoublon++;
      else if (status === 'traite') countTraite++;

      const row = makeFileEl(filename, relPath, status, fullpath, data.year, data.duration, data.codec);
      const label2 = row.querySelector('.file');
      label2.dataset.epardir = dirPath;
      if (status === 'nouveau') {
        label2.onclick = () => selectEparsFile(label2, filename, dirPath);
      }
      fileList.appendChild(row);
    }
  }

  document.getElementById('epars-status-line').innerHTML = `
    <span class="s-traite">✓ ${countTraite.toLocaleString('fr')} traité</span>
    <span class="s-reste">● ${countNouveau.toLocaleString('fr')} reste</span>
    <span class="s-doublon">○ ${countDoublon.toLocaleString('fr')} doublon</span>
  `;
}

// ── Source Data panel ─────────────────────────────────────────────────────

function buildSourceChildren(node, fullPath, baseDir, isFiltered, _inPlaylistPaths, toggleFn) {
  const toggle = toggleFn || toggleSourceDir;
  const childContainer = document.createElement('div');
  childContainer.className = 'children';

  // En mode Playlist, calculer les chemins de la playlist active pour
  // appliquer le badge ✅ sur les fichiers dépliés dynamiquement.
  let inPlaylistPaths = _inPlaylistPaths;
  if (!inPlaylistPaths && state.playlistMode) {
    const name = getActivePlaylistName();
    const pendingTracks = getPendingTracks(name);
    inPlaylistPaths = new Set(pendingTracks.map(t => t.fullPath));
  }

  const subDirs = Object.keys(node).filter(k => k !== '__files__').sort();
  for (const subName of subDirs) {
    const subFullPath = fullPath + '/' + subName;
    const subNode = node[subName];
    const subFiles = subNode.__files__ || [];
    const subExpanded = state.sourceExpanded.has(subFullPath);

    const dirEl = document.createElement('div');
    dirEl.className = 'directory' + (subExpanded ? ' expanded' : '');
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
    dirEl.onclick = () => toggle(subFullPath);
    childContainer.appendChild(dirEl);
    state.sourceNodeMap.set(subFullPath, { node: subNode, baseDir });

    if (subExpanded) {
      dirEl.appendChild(buildSourceChildren(subNode, subFullPath, baseDir, isFiltered, inPlaylistPaths, toggleFn));
    }
  }

  if (!isFiltered) {
    const status = inPlaylistPaths ? 'nouveau' : 'doublon';
    for (const f of (node.__files__ || [])) {
      const row = makeFileEl(f.filename, f.relPath, status, baseDir + '/' + f.relPath, f.year, f.duration, f.codec);
      if (inPlaylistPaths && inPlaylistPaths.has(baseDir + '/' + f.relPath)) {
        const label = row.querySelector('.file');
        if (label) label.classList.add('in-playlist');
      }
      childContainer.appendChild(row);
    }
  }
  return childContainer;
}

export function toggleSourceDir(dirPath, containerSelector = '#source-container') {
  const dirEl = document.querySelector(`${containerSelector} .directory[data-dirpath="${CSS.escape(dirPath)}"]`);
  if (!dirEl) return;

  const existingChildren = dirEl.querySelector('.children');
  if (existingChildren) {
    state.sourceExpanded.delete(dirPath);
    dirEl.classList.remove('expanded');
    existingChildren.remove();
  } else {
    state.sourceExpanded.add(dirPath);
    dirEl.classList.add('expanded');
    const info = state.sourceNodeMap.get(dirPath);
    if (info) {
      dirEl.appendChild(buildSourceChildren(info.node, dirPath, info.baseDir, state.filterActive));
    }
  }
  updateSourceHeaderCount();
}

function togglePlaylistSourceDir(dirPath) {
  toggleSourceDir(dirPath, '#playlist-source-container');
}

function updateSourceHeaderCount() {
  if (!state.filterActive) return;
  const dirs = document.querySelectorAll('#source-container .directory');
  document.getElementById('source-filter-count').textContent =
    dirs.length === 0 ? 'Aucun dossier trouvé' : `${dirs.length} dossier${dirs.length > 1 ? 's' : ''}`;
}

function renderDirTree(node, container, basePath, toggleFn) {
  const toggle = toggleFn || toggleSourceDir;
  const dirNames = Object.keys(node).filter(k => k !== '__files__').sort();
  for (const name of dirNames) {
    const fullPath = basePath + '/' + name;
    const subNode = node[name];
    const isExpanded = state.sourceExpanded.has(fullPath);
    const files = subNode.__files__ || [];

    const dirEl = document.createElement('div');
    dirEl.className = 'directory' + (isExpanded ? ' expanded' : '');
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
    dirEl.onclick = () => toggle(fullPath);
    container.appendChild(dirEl);
    state.sourceNodeMap.set(fullPath, { node: subNode, baseDir: basePath });

    if (isExpanded) {
      dirEl.appendChild(buildSourceChildren(subNode, fullPath, basePath, false, null, toggleFn));
    }
  }
}

function renderFilteredSource(container, allTrees) {
  let visibleCount = 0;
  const term = state.sourceFilter.toLowerCase();
  for (const { tree, dirPath } of allTrees) {
    const dirNames = Object.keys(tree).filter(k => k !== '__files__').sort();
    for (const name of dirNames) {
      const fullPath = dirPath + '/' + name;
      if (!name.toLowerCase().includes(term) && !dirHasMatchingDescendant(tree[name], term)) continue;
      visibleCount++;
      renderFilteredDirNode(tree[name], container, dirPath, name);
    }
  }
  return visibleCount;
}

function renderFilteredDirNode(node, container, basePath, name) {
  const term = state.sourceFilter.toLowerCase();
  const fullPath = basePath + '/' + name;
  if (!name.toLowerCase().includes(term) && !dirHasMatchingDescendant(node, term)) return;

  const manualExpand = state.sourceExpanded.has(fullPath);
  const isExpanded = dirHasMatchingDescendant(node, term) || manualExpand;
  const files = node.__files__ || [];

  const dirEl = document.createElement('div');
  dirEl.className = 'directory' + (isExpanded ? ' expanded' : '');
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
  dirEl.onclick = () => toggleSourceDir(fullPath);
  container.appendChild(dirEl);
  state.sourceNodeMap.set(fullPath, { node, baseDir: basePath });

  if (isExpanded) {
    dirEl.appendChild(buildSourceChildren(node, fullPath, basePath, !manualExpand));
  }
}

export function renderSource() {
  const container = document.getElementById('source-container');
  container.innerHTML = '';
  state.sourceNodeMap.clear();

  const allTrees = [];
  let totalCount = 0;

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree = {};
    for (const [filename, data] of Object.entries(files)) {
      const parts = data.path.split('/');
      totalCount++;
      if (parts.length <= 1) continue;
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]] = current[parts[i]] || {};
      }
      (current['__files__'] = current['__files__'] || []).push({
        filename, relPath: data.path, year: data.year, duration: data.duration, codec: data.codec, baseDir: dirPath
      });
    }
    allTrees.push({ tree, dirPath });
  }

  const headerCount = document.getElementById('source-header-count');
  if (state.filterActive && state.sourceFilter) {
    const filteredCount = renderFilteredSource(container, allTrees);
    headerCount.textContent = `(${filteredCount.toLocaleString('fr')} / ${totalCount.toLocaleString('fr')})`;
    document.getElementById('source-filter-count').textContent = filteredCount === 0
      ? 'Aucun dossier trouvé' : `${filteredCount} dossier${filteredCount > 1 ? 's' : ''}`;
  } else {
    for (const { tree, dirPath } of allTrees) {
      renderDirTree(tree, container, dirPath);
    }
    headerCount.textContent = totalCount > 0 ? `(${totalCount.toLocaleString('fr')})` : '';
    if (!state.filterActive) document.getElementById('source-filter-count').textContent = '';
  }
}

// ── Targeted DOM patches after copy (avoids full rebuild) ────────────────

/**
 * Update a single file row in the éparpillé panel after a successful copy.
 * Changes the status classes (nouveau → doublon), removes the onclick
 * selection handler, and updates the status-line counters in-place.
 */
export function patchEparsFileAfterCopy(filename, eparDir) {
  const fileSpan = document.querySelector(
    `#epars-container .file[data-filename="${CSS.escape(filename)}"][data-epardir="${CSS.escape(eparDir)}"]`
  );
  if (!fileSpan) return;

  const newStatus = computeStatus(filename, state.sourceFiles, state.journal);
  // Remove old led-* and status classes, add new ones
  fileSpan.className = fileSpan.className
    .replace(/\bled-(nouveau|doublon|traite)\b/g, '')
    .replace(/\b(nouveau|doublon|traite)\b/g, '')
    .trim();
  fileSpan.classList.add(newStatus, `led-${newStatus}`);

  // Remove onclick if no longer selectable
  if (newStatus !== 'nouveau') {
    fileSpan.onclick = null;
    fileSpan.classList.remove('selected');
  }

  // Recompute status counters from the existing DOM
  const allFileSpans = document.querySelectorAll('#epars-container .file');
  let countNouveau = 0, countDoublon = 0, countTraite = 0;
  for (const fs of allFileSpans) {
    if (fs.classList.contains('nouveau')) countNouveau++;
    else if (fs.classList.contains('doublon')) countDoublon++;
    else if (fs.classList.contains('traite')) countTraite++;
  }
  document.getElementById('epars-status-line').innerHTML = `
    <span class="s-traite">✓ ${countTraite.toLocaleString('fr')} traité</span>
    <span class="s-reste">● ${countNouveau.toLocaleString('fr')} reste</span>
    <span class="s-doublon">○ ${countDoublon.toLocaleString('fr')} doublon</span>
  `;

  // Update header count
  const totalFiles = countAllEparsFiles(state.eparsFiles);
  document.getElementById('epars-header-count').textContent =
    totalFiles > 0 ? `(${totalFiles.toLocaleString('fr')})` : '';
}

/**
 * Insert a newly copied file into the Source Data tree DOM without a full
 * rebuild.  Walks up the path to find the nearest ancestor registered in
 * sourceNodeMap, then traverses down building in-memory entries.  Only
 * touches the DOM when destDir is already visible (expanded).
 *
 * Returns true on success; false means the caller should fall back to
 * renderSource() (e.g. destDir is under a completely new base directory).
 */
export function patchSourceFileAfterCopy(destDir, filename, fileData) {
  // 1. Walk up to find the nearest registered ancestor in sourceNodeMap
  let curr = destDir;
  let ancestorInfo = null;
  const missingParts = [];

  while (curr) {
    ancestorInfo = state.sourceNodeMap.get(curr);
    if (ancestorInfo) break;
    const slashIdx = curr.lastIndexOf('/');
    if (slashIdx === -1) break;
    missingParts.unshift(curr.substring(slashIdx + 1));
    curr = curr.substring(0, slashIdx);
  }

  if (!ancestorInfo) return false; // no ancestor at all — fallback

  // 2. Traverse down to destDir, building in-memory tree + sourceNodeMap entries
  let node = ancestorInfo.node;
  let currentPath = curr;

  for (const part of missingParts) {
    if (!node[part]) node[part] = {};
    node = node[part];
    currentPath += '/' + part;
    state.sourceNodeMap.set(currentPath, { node, baseDir: ancestorInfo.baseDir });
  }

  // 3. Add file to the leaf node
  (node.__files__ = node.__files__ || []).push({
    filename,
    relPath: fileData.path,
    year: fileData.year,
    duration: fileData.duration,
    codec: fileData.codec,
    baseDir: ancestorInfo.baseDir
  });

  // 4. Update header count
  let totalSource = 0;
  for (const files of Object.values(state.sourceFiles)) {
    totalSource += Object.keys(files).length;
  }
  const headerCount = document.getElementById('source-header-count');
  if (!state.filterActive) {
    headerCount.textContent = totalSource > 0 ? `(${totalSource.toLocaleString('fr')})` : '';
  } else {
    const currentMatches = headerCount.textContent.match(/[\d\s]+(?= \/)/);
    const filtered = currentMatches ? parseInt(currentMatches[0].replace(/\s/g, ''), 10) : totalSource;
    headerCount.textContent = `(${filtered.toLocaleString('fr')} / ${totalSource.toLocaleString('fr')})`;
  }

  // 5. DOM update — only if destDir is currently visible (parent chain expanded)
  const dirEl = document.querySelector(
    `#source-container .directory[data-dirpath="${CSS.escape(destDir)}"]`
  );
  if (dirEl) {
    let countBadge = dirEl.querySelector('.dir-count');
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
        filename, fileData.path, 'doublon',
        destDir + '/' + filename,
        fileData.year, fileData.duration, fileData.codec
      );
      let inserted = false;
      const rows = children.querySelectorAll('.file-row');
      for (const row of rows) {
        const existing = row.querySelector('.file')?.textContent || '';
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

/**
 * Render the playlist sidebar: tabs + track list.
 */
export function renderPlaylistPanel() {
  renderPlaylistTabs();
  renderPlaylistTracks();
}

function renderPlaylistTabs() {
  const container = document.getElementById('playlist-tabs');
  if (!container) return;
  container.innerHTML = '';

  const allNames = Array.from(new Set([
    ...state.playlists.map(p => p.name),
    ...Object.keys(state.pendingPlaylists)
  ]));

  for (const [i, name] of allNames.entries()) {
    const tab = document.createElement('span');
    tab.className = 'pl-tab' + (i === state.activePlaylistIndex ? ' active' : '');
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
    closeBtn.onclick = (e) => { e.stopPropagation(); closePlaylistTab(name); };
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
    if (name && name.trim()) {
      createNewPlaylist(name.trim());
      const newKeys = Array.from(new Set([
        ...state.playlists.map(p => p.name),
        ...Object.keys(state.pendingPlaylists)
      ]));
      state.activePlaylistIndex = newKeys.indexOf(name.trim());
      renderPlaylistPanel();
    }
  };
  container.appendChild(addBtn);
}

function renderPlaylistTracks() {
  const container = document.getElementById('playlist-panel');
  if (!container) return;
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name) || [];
  const savedPl = state.playlists.find(p => p.name === name);
  const trackCount = tracks.length;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const isExported = savedPl?.exported;

  let html = `<div class="pl-info">${trackCount} morceau${trackCount > 1 ? 'x' : ''}`;
  if (totalDuration > 0) {
    const m = Math.floor(totalDuration / 60);
    const s = totalDuration % 60;
    html += ` — ${m}:${s.toString().padStart(2, '0')}`;
  }
  if (isExported) {
    html += ` — ✅ Exportée le ${savedPl.exported.slice(0, 10)}`;
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
      html += `<span class="pl-track-remove" data-fullpath="${escapeHtml(track.fullPath)}">✕</span>`;
      html += '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.pl-track-remove').forEach(btn => {
    btn.onclick = () => {
      const fullPath = btn.dataset.fullpath;
      removeTrack(getActivePlaylistName(), fullPath);
      renderPlaylistPanel();
      patchPlaylistSourceFile(fullPath, true);
    };
  });

  container.querySelectorAll('.pl-track').forEach(el => {
    el.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.index);
      el.classList.add('dragging');
    };
    el.ondragend = () => el.classList.remove('dragging');
    el.ondragover = (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    };
    el.ondragleave = () => el.classList.remove('drag-over');
    el.ondrop = (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = parseInt(el.dataset.index);
      if (!isNaN(fromIdx) && !isNaN(toIdx)) {
        reorderTrack(getActivePlaylistName(), fromIdx, toIdx);
        renderPlaylistPanel();
      }
    };
  });
}

function closePlaylistTab(name) {
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render the playlist source panel as an expandable tree of Source Data
 * folders — identical in structure to the normal Source Data panel.
 * Files already in the current playlist get the ✅ (in-playlist) badge,
 * including when folders are expanded dynamically (handled internally by
 * buildSourceChildren via state.playlistMode).
 */
export function renderPlaylistSource() {
  const container = document.getElementById('playlist-source-container');
  if (!container) return;
  container.innerHTML = '';

  // Build trees from sourceFiles (same logic as renderSource)
  const allTrees = [];
  let totalCount = 0;

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree = {};
    for (const [filename, data] of Object.entries(files)) {
      const parts = data.path.split('/');
      totalCount++;
      if (parts.length <= 1) continue;
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]] = current[parts[i]] || {};
      }
      (current['__files__'] = current['__files__'] || []).push({
        filename, relPath: data.path, year: data.year, duration: data.duration, codec: data.codec, baseDir: dirPath
      });
    }
    allTrees.push({ tree, dirPath });
  }

  // Render trees with playlist-specific toggle
  // buildSourceChildren checks state.playlistMode internally and applies
  // in-playlist badges on both initial render and dynamic expands.
  for (const { tree, dirPath } of allTrees) {
    renderDirTree(tree, container, dirPath, togglePlaylistSourceDir);
  }

  const countEl = document.getElementById('playlist-source-count');
  if (countEl) countEl.textContent = totalCount > 0 ? `(${totalCount.toLocaleString('fr')})` : '';
}

/**
 * Render the playlist manager modal content (list, stats, actions).
 */
export function renderPlaylistManager() {
  const container = document.getElementById('pl-manager-content');
  if (!container) return;

  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center">Aucune playlist. Créez-en une depuis le mode Playlist.</div>';
    return;
  }

  const allNames = Array.from(new Set([
    ...state.playlists.map(p => p.name),
    ...Object.keys(state.pendingPlaylists)
  ]));

  let html = '<table id="pl-manager-table"><thead><tr><th>Playlist</th><th>Morceaux</th><th>Durée</th><th>Export</th><th>Actions</th></tr></thead><tbody>';
  for (const name of allNames) {
    const saved = state.playlists.find(p => p.name === name);
    const pendingTracks = getPendingTracks(name);
    const tracks = pendingTracks.length > 0 ? pendingTracks : (saved?.tracks || []);
    const count = tracks.length;
    const duration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const durStr = duration > 0 ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '—';
    const exported = saved?.exported ? `✅ ${saved.exported.slice(0, 10)}` : '—';

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

  // Bind action buttons
  container.querySelectorAll('.pl-mgr-load').forEach(btn => {
    btn.onclick = () => {
      closeAllModals();
      const name = btn.dataset.name;
      const saved = state.playlists.find(p => p.name === name);
      if (saved && !state.pendingPlaylists[name]) {
        setPendingTracks(name, [...saved.tracks]);
      }
      const justEntered = !state.playlistMode;
      if (justEntered) {
        state.playlistMode = true;
        state.playlistFocus = 'source';
        document.getElementById('main-panels').classList.add('hidden');
        document.getElementById('playlist-layout').classList.remove('hidden');
      }

      const allKeys = Array.from(new Set([
        ...state.playlists.map(p => p.name),
        ...Object.keys(state.pendingPlaylists)
      ]));
      state.activePlaylistIndex = allKeys.indexOf(name);

      renderPlaylistSource();
      renderPlaylistPanel();

      if (justEntered) {
        document.getElementById('playlist-source').classList.add('panel-active');
        document.getElementById('status-text').textContent =
          '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.';
      }
    };
  });

  container.querySelectorAll('.pl-mgr-rename').forEach(btn => {
    btn.onclick = async () => {
      const oldName = btn.dataset.name;
      const newName = prompt('Nouveau nom :', oldName);
      if (newName && newName.trim() && newName.trim() !== oldName) {
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
    btn.onclick = async () => {
      const name = btn.dataset.name;
      if (!confirm(`Supprimer la playlist "${name}" ?\n(Cette action ne supprime pas les fichiers exportés.)`)) return;
      await deletePlaylist(name);
      removePendingPlaylist(name);
      // If active tab was deleted, switch to another
      const activeName = getActivePlaylistName();
      if (activeName === name) {
        state.activePlaylistIndex = 0;
      }
      renderPlaylistManager();
      renderPlaylistPanel();
    };
  });
}

// ── Targeted DOM patch for playlist source panel (avoids full rebuild) ────

/**
 * Add or remove the `in-playlist` CSS class on a file label in the playlist
 * source panel.  Used when a track is removed from the sidebar so the source
 * panel stays in sync without a full re-render.
 *
 * @param {string} fullPath - The data-fullpath value to search for.
 * @param {boolean} remove - true to remove the class, false to add it.
 */
export function patchPlaylistSourceFile(fullPath, remove) {
  const label = document.querySelector(
    `#playlist-source-container .file[data-fullpath="${CSS.escape(fullPath)}"]`
  );
  if (!label) return;
  if (remove) {
    label.classList.remove('in-playlist');
  } else {
    label.classList.add('in-playlist');
  }
}

// ── Render all ────────────────────────────────────────────────────────────
export function renderAll() {
  renderEpars();
  renderSource();
  requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
}
