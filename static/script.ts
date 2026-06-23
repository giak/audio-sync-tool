// ─── Orchestrator: keyboard router + toolbar bindings + init ──────────────

import { executeCopy, initApp, initConfigUI, runScan } from './actions.js';
import { initAudioUI, isAudioPlaying, seekAudio, stopPlayer } from './audio.js';
import { getFocusedItem, getItems, navigateColumn, navigateFocus, revalidateFocus, setActivePanel } from './focus.js';
import {
  addTrack,
  createNewPlaylist,
  deletePlaylist,
  exportPlaylist,
  getActivePlaylistName,
  getPendingTracks,
  loadPlaylists,
  removePendingPlaylist,
  removeTrack,
  renamePlaylist,
  reorderTrack,
  savePlaylist,
  setPendingTracks,
} from './playlist.js';
import {
  patchPlaylistSourceFile,
  renderAll,
  renderJournal,
  renderPlaylistManager,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderSource,
} from './render.js';
import { state } from './state.js';
import {
  closeAllModals,
  closeFilterPalette,
  initFilterPalette,
  openFilterPalette,
  openModal,
  showError,
} from './ui.js';

// ── Playlist mode helpers ─────────────────────────────────────────────────

function togglePlaylistFocus(): void {
  const newFocus = state.playlistFocus === 'source' ? 'sidebar' : 'source';
  state.playlistFocus = newFocus;

  const sourceEl = document.getElementById('playlist-source') as HTMLElement | null;
  const sidebarEl = document.getElementById('playlist-sidebar') as HTMLElement | null;

  // Explicit add/remove instead of toggle — prevents corruption when
  // state and DOM are out of sync (e.g. after modal close, error recovery)
  if (newFocus === 'sidebar') {
    sourceEl?.classList.remove('panel-active');
    sidebarEl?.classList.add('panel-active');
  } else {
    sidebarEl?.classList.remove('panel-active');
    sourceEl?.classList.add('panel-active');
  }
}

function toggleTrackInPlaylist(): void {
  const container = document.getElementById('playlist-source-container') as HTMLElement | null;
  if (!container) return;
  const focused = container.querySelector('.focused') as HTMLElement | null;
  if (!focused || !focused.classList.contains('file-row')) return;

  const label = focused.querySelector('.file') as HTMLElement | null;
  const filename = label?.textContent || '';
  const fullPath = label?.dataset?.fullpath || '';
  if (!fullPath) return;

  const activeName = getActivePlaylistName();
  const track = {
    filename,
    fullPath,
    relPath: fullPath,
    year: focused.querySelector('.year')?.textContent || null,
    duration: parseInt(focused.dataset.durationSeconds || '', 10) || null,
    codec: focused.querySelector('.codec')?.textContent || null,
  };

  const added = addTrack(activeName, track);
  if (added) {
    label?.classList.add('in-playlist');
    showToast(`➕ ${filename} ajouté`);
  } else {
    removeTrack(activeName, fullPath);
    label?.classList.remove('in-playlist');
    showToast(`➖ ${filename} retiré`);
  }
  renderPlaylistPanel();
}

async function saveCurrentPlaylist(): Promise<void> {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  if (tracks.length === 0) {
    showToast('⚠️ Playlist vide, rien à sauvegarder');
    return;
  }
  try {
    await savePlaylist(name, tracks);
    showToast(`💾 Playlist "${name}" sauvegardée (${tracks.length} morceaux)`);
  } catch (err) {
    showError(`Échec de la sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function showExportModal(): Promise<void> {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  if (tracks.length === 0) {
    showToast('⚠️ Playlist vide, rien à exporter');
    return;
  }

  const savedPl = state.playlists.find(p => p.name === name);
  let existingWarning = '';
  if (savedPl?.exported && savedPl.exportedDir) {
    existingWarning = " (⚠️ l'export précédent sera écrasé)";
  }

  const dialogMsg = document.getElementById('dialog-msg') as HTMLElement | null;
  const confirmBtn = document.getElementById('dialog-confirm') as HTMLElement | null;
  const cancelBtn = document.getElementById('dialog-cancel') as HTMLElement | null;

  if (dialogMsg) {
    dialogMsg.innerHTML = `
      Exporter la playlist <strong>"${escapeHtml(name)}"</strong> ?<br>
      ${tracks.length} morceau${tracks.length > 1 ? 'x' : ''}${existingWarning}
    `;
  }
  if (confirmBtn) confirmBtn.textContent = '📦 Exporter';
  if (cancelBtn) cancelBtn.textContent = 'Annuler';
  openModal('dialog');

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      closeAllModals();
      await savePlaylist(name, tracks);
      const res = await exportPlaylist(name);
      if (res.ok) {
        showToast(`📦 Playlist "${name}" exportée — ${String(res.count)} morceaux dans ${String(res.dir)}`);
        if (res.fallback === 'copy') {
          showToast(`⚠️ ${String(res.warning || 'Copie physique utilisée')}`);
        }
      } else if (res.missing) {
        showToast(`❌ Fichiers manquants : ${String((res.missing as string[]).join(', '))}`);
      } else {
        showToast(`❌ Erreur : ${String(res.error || 'Export échoué')}`);
      }
    };
  }
  if (cancelBtn) cancelBtn.onclick = closeAllModals;
}

function moveTrackInPlaylist(direction: number): void {
  const name = getActivePlaylistName();
  const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
  if (!focused) return;
  const parent = focused.parentNode as HTMLElement | null;
  if (!parent) return;
  const items = Array.from(parent.children);
  const index = items.indexOf(focused);
  if (index === -1) return;
  reorderTrack(name, index, index + direction);
  renderPlaylistPanel();
}

function showToast(msg: string): void {
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

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Playlist mode toggle ──────────────────────────────────────────────────

async function enterPlaylistMode(): Promise<void> {
  await loadPlaylists();
  state.playlistMode = true;
  state.playlistFocus = 'source';

  document.getElementById('main-panels')?.classList.add('hidden');
  document.getElementById('playlist-layout')?.classList.remove('hidden');

  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    createNewPlaylist('playlist-1');
    state.activePlaylistIndex = 0;
  } else if (state.playlists.length > 0) {
    // Restore saved playlists into pending state
    for (const pl of state.playlists) {
      if (!state.pendingPlaylists[pl.name]) {
        setPendingTracks(pl.name, [...pl.tracks]);
      }
    }
    state.activePlaylistIndex = 0;
  }

  renderPlaylistSource();
  renderPlaylistPanel();
  document.getElementById('playlist-source')?.classList.add('panel-active');
  const statusText = document.getElementById('status-text');
  if (statusText) statusText.textContent = '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.';
}

async function exitPlaylistMode(): Promise<void> {
  // Sauvegarder toutes les playlists modifiées avant de quitter
  const savePromises: Array<Promise<Record<string, unknown>>> = [];
  for (const [name, tracks] of Object.entries(state.pendingPlaylists)) {
    if (tracks.length > 0) {
      savePromises.push(savePlaylist(name, tracks));
    }
  }
  await Promise.all(savePromises);
  state.playlistMode = false;
  document.getElementById('playlist-layout')?.classList.add('hidden');
  document.getElementById('main-panels')?.classList.remove('hidden');
  const statusText = document.getElementById('status-text');
  if (statusText) statusText.textContent = 'Prêt.';
}

// ── Keyboard router ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (state.activeModal === 'dialog') {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAllModals();
    }
    return;
  }
  if (state.activeModal) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAllModals();
    }
    return;
  }

  if (state.filterActive && document.activeElement?.id === 'source-filter') {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFilterPalette(renderSource);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      closeFilterPalette(renderSource);
      setActivePanel('source');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      closeFilterPalette(renderSource);
      setActivePanel('epars');
    }
    return;
  }

  const target = e.target as HTMLElement | null;
  const isInput = target ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) : false;

  // ── Mode Playlist keyboard handling ────────────────────────────────────
  if (state.playlistMode) {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitPlaylistMode();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      togglePlaylistFocus();
      return;
    }
    if (e.key === ' ' && !isInput) {
      e.preventDefault();
      if (state.playlistFocus === 'source') {
        toggleTrackInPlaylist();
      }
      return;
    }
    if ((e.key === 'F7' || e.key === '/') && !isInput) {
      e.preventDefault();
      openFilterPalette((_p: 'epars' | 'source') => {}, renderPlaylistSource);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && state.playlistFocus === 'sidebar') {
      e.preventDefault();
      const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
      if (focused) {
        const removeBtn = focused.querySelector('.pl-track-remove') as HTMLElement | null;
        if (removeBtn) {
          const fullPath = removeBtn.dataset.fullpath || '';
          removeBtn.click();
          patchPlaylistSourceFile(fullPath, true);
        }
      }
      return;
    }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveCurrentPlaylist();
      return;
    }
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      showExportModal();
      return;
    }
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isInput) {
      e.preventDefault();
      moveTrackInPlaylist(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    // ↑↓ — navigate in the active playlist panel
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isInput) {
      e.preventDefault();
      if (state.playlistFocus === 'source') {
        const container = document.getElementById('playlist-source-container');
        if (container) navigateFocus(container, e.key === 'ArrowDown' ? 1 : -1);
      } else if (state.playlistFocus === 'sidebar') {
        const tracks = document.querySelectorAll('#playlist-tracks .pl-track');
        if (tracks.length === 0) return;
        const current = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
        let idx = 0;
        if (current) {
          idx = Array.from(tracks).indexOf(current);
          if (idx === -1) idx = 0;
        }
        tracks.forEach(t => t.classList.remove('focused'));
        const newIdx = Math.max(0, Math.min(tracks.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)));
        tracks[newIdx].classList.add('focused');
        tracks[newIdx].scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    // Enter — in source panel: play audio on file, toggle directory
    if (e.key === 'Enter' && !isInput && state.playlistFocus === 'source') {
      e.preventDefault();
      const container = document.getElementById('playlist-source-container');
      if (!container) return;
      const focused = getFocusedItem(container) as HTMLElement | null;
      if (focused?.classList.contains('file-row')) {
        (focused.querySelector('.play-btn') as HTMLElement | null)?.click();
      } else if (focused?.classList.contains('directory')) {
        focused.click();
      }
      return;
    }

    // ←→ — seek audio when playing
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (isAudioPlaying()) {
        seekAudio(e.key === 'ArrowRight' ? 1 : -1);
      }
      e.preventDefault();
      return;
    }
  }

  if (e.key === 'F5') {
    e.preventDefault();
    executeCopy();
    return;
  }

  if (e.key === 'F7' || (e.key === '/' && !isInput)) {
    e.preventDefault();
    openFilterPalette(setActivePanel, renderSource);
    return;
  }

  if (e.key === 'Escape') {
    if (state.filterActive) {
      e.preventDefault();
      closeFilterPalette(renderSource);
      return;
    }
    if (isAudioPlaying()) {
      e.preventDefault();
      stopPlayer();
      return;
    }
    return;
  }

  if (isInput) return;

  if (isAudioPlaying() && e.shiftKey) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekAudio(-1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekAudio(1);
      return;
    }
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    setActivePanel(state.activePanel === 'source' ? 'epars' : 'source');
    return;
  }

  const container =
    state.activePanel === 'source'
      ? document.getElementById('source-container')
      : document.getElementById('epars-container');
  if (!container) return;
  const items = getItems(container);
  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateFocus(container, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateFocus(container, -1);
  } else if (e.key === 'ArrowLeft' && state.activePanel === 'source') {
    e.preventDefault();
    navigateColumn(container, -1);
  } else if (e.key === 'ArrowRight' && state.activePanel === 'source') {
    e.preventDefault();
    navigateColumn(container, 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const el = getFocusedItem(container) as HTMLElement | null;
    if (!el) return;
    if (el.classList.contains('file-row')) {
      if (e.key === 'Enter') {
        (el.querySelector('.play-btn') as HTMLElement | null)?.click();
      } else if (e.key === ' ' && state.activePanel === 'epars') {
        (el.querySelector('.file.nouveau') as HTMLElement | null)?.click();
      }
    } else if (el.classList.contains('directory') && state.activePanel === 'source') {
      el.click();
    }
  }
});

// ── Toolbar bindings ──────────────────────────────────────────────────────
(document.getElementById('btn-config') as HTMLElement | null)!.onclick = () => openModal('config');
(document.getElementById('btn-legend') as HTMLElement | null)!.onclick = () => openModal('legend');
(document.getElementById('btn-journal') as HTMLElement | null)!.onclick = () => {
  renderJournal();
  openModal('journal');
};
(document.getElementById('btn-scan') as HTMLElement | null)!.onclick = runScan;
(document.getElementById('pl-manage') as HTMLElement | null)!.onclick = () => {
  renderPlaylistManager();
  openModal('playlists');
};
(document.getElementById('btn-playlist') as HTMLElement | null)!.onclick = async () => {
  if (state.playlistMode) {
    exitPlaylistMode();
  } else {
    await enterPlaylistMode();
  }
};

// ── Panel click ───────────────────────────────────────────────────────────
(document.getElementById('panel-left') as HTMLElement | null)!.onclick = () => setActivePanel('epars');
(document.getElementById('panel-right') as HTMLElement | null)!.onclick = () => setActivePanel('source');

// ── Modal backdrop/close ──────────────────────────────────────────────────
document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (target?.classList.contains('modal-backdrop')) closeAllModals();
  if (target?.classList.contains('modal-close')) closeAllModals();
});

// ── Filter palette → renderSource when filter changes ─────────────────────
initFilterPalette(() => {
  renderSource();
  revalidateFocus();
});

// ── Boot ──────────────────────────────────────────────────────────────────
initAudioUI();
initConfigUI();
initApp();
