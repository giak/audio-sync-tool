// ─── Playlist commands: Tab, Espace, Ctrl+S, Ctrl+E, Delete, Ctrl+↑↓, Enter, ←→ ──

import { getFocusedItem, navigateColumn, navigateFocus } from '../focus.js';
import {
  addTrack,
  exportPlaylist,
  getActivePlaylistName,
  getPendingTracks,
  removeTrack,
  reorderTrack,
  savePlaylist,
} from '../playlist.js';
import { patchPlaylistSourceFile, renderPlaylistSource } from '../render/index.js';
import { state } from '../state.js';
import { closeAllModals, openFilterPalette, openModal, showError, showToast } from '../ui.js';
import { registry } from './registry.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function togglePlaylistFocus(): void {
  const newFocus = state.playlistFocus === 'source' ? 'sidebar' : 'source';
  state.playlistFocus = newFocus;
  const sourceEl = document.getElementById('playlist-source') as HTMLElement | null;
  const sidebarEl = document.getElementById('playlist-sidebar') as HTMLElement | null;
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
  if (!focused?.classList.contains('file-row')) {
    showToast('ℹ️ ↑↓ pour focuser un fichier, puis Espace pour ajouter/retirer.');
    return;
  }
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
  // renderPlaylistPanel auto-déclenché par eparsPlaylist:changed
}

export async function saveCurrentPlaylist(): Promise<void> {
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
    showError(`Échec sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function showExportModal(): Promise<void> {
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
  if (dialogMsg)
    dialogMsg.innerHTML = `Exporter la playlist <strong>"${name}"</strong> ?<br>${tracks.length} morceau${tracks.length > 1 ? 'x' : ''}${existingWarning}`;
  if (confirmBtn) {
    confirmBtn.textContent = '📦 Exporter';
    confirmBtn.onclick = async () => {
      closeAllModals();
      await savePlaylist(name, tracks);
      const res = await exportPlaylist(name);
      if (res.ok) {
        showToast(`📦 Playlist "${name}" exportée — ${String(res.count)} morceaux dans ${String(res.dir)}`);
        if (res.fallback === 'copy') showToast(`⚠️ ${String(res.warning || 'Copie physique utilisée')}`);
        if (res.nml) showToast(`✅ collection.nml généré : ${String(res.nml)}`);
        else if (res.nml_error) showToast(`⚠️ ${String(res.nml_error)}`);
      } else if (res.missing) {
        showToast(`❌ Fichiers manquants : ${String((res.missing as string[]).join(', '))}`);
      } else {
        showToast(`❌ Erreur : ${String(res.error || 'Export échoué')}`);
      }
    };
  }
  if (cancelBtn) cancelBtn.onclick = () => closeAllModals();
  openModal('dialog');
}

// ── Command bindings ────────────────────────────────────────────────────

// Tab — toggle between source and sidebar in playlist mode
registry.bind({
  key: 'Tab',
  playlistMode: true,
  handler: () => togglePlaylistFocus(),
});

// Space — add/remove track in playlist source
registry.bind({
  key: ' ',
  playlistMode: true,
  playlistFocus: 'source',
  isInput: false,
  handler: () => toggleTrackInPlaylist(),
});

// F7 / / — filter in playlist mode
registry.bind({
  key: 'F7',
  playlistMode: true,
  handler: () => openFilterPalette(() => {}, renderPlaylistSource),
});

registry.bind({
  key: '/',
  playlistMode: true,
  isInput: false,
  handler: () => openFilterPalette(() => {}, renderPlaylistSource),
});

// Delete/Backspace — remove track from playlist sidebar
registry.bind({
  key: 'Delete',
  playlistMode: true,
  playlistFocus: 'sidebar',
  isInput: false,
  handler: () => {
    const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
    if (focused) {
      const removeBtn = focused.querySelector('.pl-track-remove') as HTMLElement | null;
      if (removeBtn) {
        removeBtn.click();
        patchPlaylistSourceFile(removeBtn.dataset.fullpath || '', true);
      }
    }
  },
});

registry.bind({
  key: 'Backspace',
  playlistMode: true,
  playlistFocus: 'sidebar',
  isInput: false,
  handler: () => {
    const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
    if (focused) {
      const removeBtn = focused.querySelector('.pl-track-remove') as HTMLElement | null;
      if (removeBtn) {
        removeBtn.click();
        patchPlaylistSourceFile(removeBtn.dataset.fullpath || '', true);
      }
    }
  },
});

// Ctrl+S — save playlist
registry.bind({
  key: 's',
  ctrlKey: true,
  playlistMode: true,
  handler: () => saveCurrentPlaylist(),
});

// Ctrl+E — export playlist
registry.bind({
  key: 'e',
  ctrlKey: true,
  playlistMode: true,
  handler: () => showExportModal(),
});

// Ctrl+↑↓ — reorder tracks in sidebar
registry.bind({
  key: 'ArrowUp',
  ctrlKey: true,
  playlistMode: true,
  playlistFocus: 'sidebar',
  handler: () => {
    const name = getActivePlaylistName();
    const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
    if (!focused) return;
    const items = Array.from(focused.parentNode!.children);
    const index = items.indexOf(focused);
    // Garde miroir de reorderTrack : un move invalide est un no-op silencieux.
    // Sans cette garde, on mettrait playlistTrackFocusIndex = -1 et le focus
    // serait perdu au prochain render (trackEls[-1] indéfini).
    if (index <= 0) return;
    reorderTrack(name, index, index - 1);
    // Le track déplacé suit le focus (évite que l'auto-focus saute au re-render).
    state.playlistTrackFocusIndex = index - 1;
    // auto-rendered via eparsPlaylist:changed
  },
});

registry.bind({
  key: 'ArrowDown',
  ctrlKey: true,
  playlistMode: true,
  playlistFocus: 'sidebar',
  handler: () => {
    const name = getActivePlaylistName();
    const focused = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
    if (!focused) return;
    const items = Array.from(focused.parentNode!.children);
    const index = items.indexOf(focused);
    // Garde miroir de reorderTrack (voir commentaire ci-dessus).
    if (index === -1 || index >= items.length - 1) return;
    reorderTrack(name, index, index + 1);
    // Le track déplacé suit le focus (évite que l'auto-focus saute au re-render).
    state.playlistTrackFocusIndex = index + 1;
    // auto-rendered via eparsPlaylist:changed
  },
});

// ↑↓ — navigate in playlist mode
registry.bind({
  key: 'ArrowDown',
  playlistMode: true,
  isInput: false,
  handler: () => {
    if (state.playlistFocus === 'source') {
      const container = document.getElementById('playlist-source-container');
      if (container) navigateFocus(container, 1);
    } else if (state.playlistFocus === 'sidebar') {
      const tracks = document.querySelectorAll('#playlist-tracks .pl-track');
      if (tracks.length === 0) return;
      const current = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
      let idx = 0;
      if (current) {
        idx = Array.from(tracks).indexOf(current);
        if (idx === -1) idx = 0;
      }
      for (const el of tracks) el.classList.remove('focused');
      const newIdx = Math.max(0, Math.min(tracks.length - 1, idx + 1));
      tracks[newIdx].classList.add('focused');
      tracks[newIdx].scrollIntoView({ block: 'nearest' });
      state.playlistTrackFocusIndex = newIdx;
    }
  },
});

registry.bind({
  key: 'ArrowUp',
  playlistMode: true,
  isInput: false,
  handler: () => {
    if (state.playlistFocus === 'source') {
      const container = document.getElementById('playlist-source-container');
      if (container) navigateFocus(container, -1);
    } else if (state.playlistFocus === 'sidebar') {
      const tracks = document.querySelectorAll('#playlist-tracks .pl-track');
      if (tracks.length === 0) return;
      const current = document.querySelector('#playlist-tracks .focused') as HTMLElement | null;
      let idx = 0;
      if (current) {
        idx = Array.from(tracks).indexOf(current);
        if (idx === -1) idx = 0;
      }
      for (const el of tracks) el.classList.remove('focused');
      const newIdx = Math.max(0, Math.min(tracks.length - 1, idx - 1));
      tracks[newIdx].classList.add('focused');
      tracks[newIdx].scrollIntoView({ block: 'nearest' });
      state.playlistTrackFocusIndex = newIdx;
    }
  },
});

// Enter — in playlist source: play or toggle directory
registry.bind({
  key: 'Enter',
  playlistMode: true,
  playlistFocus: 'source',
  isInput: false,
  handler: () => {
    const container = document.getElementById('playlist-source-container');
    if (!container) return;
    const focused = getFocusedItem(container) as HTMLElement | null;
    if (focused?.classList.contains('file-row')) {
      (focused.querySelector('.play-btn') as HTMLElement | null)?.click();
    } else if (focused?.classList.contains('directory')) {
      focused.click();
    }
  },
});

// ←→ — column nav or seek in playlist source
registry.bind({
  key: 'ArrowLeft',
  playlistMode: true,
  isInput: false,
  handler: () => {
    const container = document.getElementById('playlist-source-container');
    if (container && state.playlistFocus === 'source' && !document.querySelector('audio:not(.paused)')) {
      navigateColumn(container, -1);
    }
  },
});

registry.bind({
  key: 'ArrowRight',
  playlistMode: true,
  isInput: false,
  handler: () => {
    const container = document.getElementById('playlist-source-container');
    if (container && state.playlistFocus === 'source' && !document.querySelector('audio:not(.paused)')) {
      navigateColumn(container, 1);
    }
  },
});
