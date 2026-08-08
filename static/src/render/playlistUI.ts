// ─── Playlist mode rendering: tabs, tracks, source tree, manager ──────────

import { togglePlay } from '../audio.js';
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
} from '../playlist.js';
import { getRating } from '../ratings.js';
import { state } from '../state.js';
import { closeAllModals, showContextMenu } from '../ui.js';
import { openCueEditor } from './cueEditor.js';
import { _ratingClickHandler } from './ratingEdit.js';
import { renderDirTree, togglePlaylistSourceDir } from './sourceTree.js';

// ── Internal types ──────────────────────────────────────────────────────

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

// ── Tabs ─────────────────────────────────────────────────────────────────

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

// ── Tracks ──────────────────────────────────────────────────────────────

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
      html += `<button class="cue-btn" data-fullpath="${escapeHtml(track.fullPath)}" data-filename="${escapeHtml(track.filename)}">⌖</button>`;
      html += '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;

  container.querySelectorAll('.pl-track-remove').forEach(btn => {
    (btn as HTMLElement).onclick = () => {
      const fullPath = (btn as HTMLElement).dataset.fullpath || '';
      removeTrack(getActivePlaylistName(), fullPath);
      // renderPlaylistPanel() is triggered automatically by eparsPlaylist:changed
      patchPlaylistSourceFile(fullPath, true);
    };
  });

  container.querySelectorAll('.pl-track-rating').forEach(el => {
    (el as HTMLElement).onclick = _ratingClickHandler;
  });

  container.querySelectorAll('.cue-btn').forEach(btn => {
    (btn as HTMLElement).onclick = (e: MouseEvent) => {
      e.stopPropagation();
      const el = btn as HTMLElement;
      openCueEditor({ filename: el.dataset.filename || '', fullPath: el.dataset.fullpath || '' });
    };
  });

  container.querySelectorAll('.pl-track').forEach(el => {
    const trackEl = el as HTMLElement;
    trackEl.onclick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.pl-track-remove, .pl-track-rating, .pl-drag-handle')) return;
      const tracksContainer = document.getElementById('playlist-tracks');
      if (tracksContainer) {
        tracksContainer.querySelectorAll('.pl-track.focused').forEach(f => {
          f.classList.remove('focused');
        });
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

    trackEl.oncontextmenu = (e: MouseEvent) => {
      e.preventDefault();
      const removeBtn = trackEl.querySelector('.pl-track-remove') as HTMLElement | null;
      const fullPath = removeBtn?.dataset.fullpath || '';
      const filename = trackEl.querySelector('.pl-track-name')?.textContent || '';
      const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
        { label: '▶ Jouer', action: () => togglePlay(filename, fullPath, trackEl.querySelector('.play-btn') || trackEl) },
        { label: '✕ Retirer', action: () => { removeTrack(getActivePlaylistName(), fullPath); /* auto-rendered via eparsPlaylist:changed */ patchPlaylistSourceFile(fullPath, true); }, danger: true },
        {
          label: '▶ Jouer',
          action: () => togglePlay(filename, fullPath, trackEl.querySelector('.play-btn') || trackEl),
        },
        {
          label: '✕ Retirer',
          action: () => {
            removeTrack(getActivePlaylistName(), fullPath); /* auto-rendered via eparsPlaylist:changed */
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
        // auto-rendered via eparsPlaylist:changed
      }
    };
  });

  requestAnimationFrame(() => {
    container.scrollTop = savedScrollTop;
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── Panel ────────────────────────────────────────────────────────────────

export function renderPlaylistPanel(): void {
  renderPlaylistTabs();
  renderPlaylistTracks();
}

// ── Source tree (playlist variant) ───────────────────────────────────────

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

// ── Manager ──────────────────────────────────────────────────────────────

export function renderPlaylistManager(): void {
  const container = document.getElementById('pl-manager-content');
  if (!container) return;

  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center">Aucune playlist.</div>';
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

    html += '<tr>';
    html += `<td>${escapeHtml(name)}</td>`;
    html += `<td>${count}</td>`;
    html += `<td>${durStr}</td>`;
    html += `<td>${exported}</td>`;
    html += '<td class="pl-mgr-actions">';
    html += `<button class="pl-mgr-load" data-name="${escapeHtml(name)}">Charger</button>`;
    html += `<button class="pl-mgr-rename" data-name="${escapeHtml(name)}">Renommer</button>`;
    html += `<button class="pl-mgr-delete" data-name="${escapeHtml(name)}">Supprimer</button>`;
    html += '</td></tr>';
  }
  html += '</tbody></table>';
  container.innerHTML = html;

  container.querySelectorAll('.pl-mgr-load').forEach(btn => {
    (btn as HTMLElement).onclick = () => {
      closeAllModals();
      const name = (btn as HTMLElement).dataset.name || '';
      const saved = state.playlists.find(p => p.name === name);
      if (saved && !state.pendingPlaylists[name]) setPendingTracks(name, [...saved.tracks]);
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
        if (saved) await renamePlaylist(oldName, newName.trim());
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
      if (activeName === name) state.activePlaylistIndex = 0;
      renderPlaylistManager();
      renderPlaylistPanel();
    };
  });
}

// ── Patch ─────────────────────────────────────────────────────────────────

export function patchPlaylistSourceFile(fullPath: string, remove: boolean): void {
  const label = document.querySelector(`#playlist-source-container .file[data-fullpath="${CSS.escape(fullPath)}"]`);
  if (!label) return;
  if (remove) label.classList.remove('in-playlist');
  else label.classList.add('in-playlist');
}
