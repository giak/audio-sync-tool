// ─── Orchestrator: keyboard router via CommandRegistry + toolbar + init ────

import { buildContext, registry } from './commands/registry.js';
import './commands/navigation.js';
import './commands/audio.js';
import './commands/copy.js';
import './commands/filter.js';
import './commands/rating.js';
import './commands/playlist.js';
import './commands/modals.js';
import { createSourceFolder, initApp, initConfigUI, runScan } from './actions.js';
import { initAudioUI } from './audio.js';
import { saveCurrentPlaylist, showExportModal } from './commands/playlist.js';
import { initTwinHint, setActivePanel } from './focus.js';
import { createNewPlaylist, loadPlaylists, savePlaylist, setPendingTracks } from './playlist.js';
import { openCueEditor } from './render/cueEditor.js';
import {
  clearJournal,
  renderJournal,
  renderPlaylistManager,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderSource,
  setupRenderSubscriptions,
} from './render.js';
import { state } from './state.js';
import { closeAllModals, confirmDialog, initFilterPalette, openModal } from './ui.js';

// ── Playlist mode helpers ─────────────────────────────────────────────────

async function enterPlaylistMode(): Promise<void> {
  await loadPlaylists();
  state.playlistMode = true;
  state.playlistFocus = 'source';

  document.getElementById('main-panels')?.classList.add('hidden');
  document.getElementById('playlist-layout')?.classList.remove('hidden');
  document.getElementById('page-sync')?.classList.remove('active');
  document.getElementById('page-playlist')?.classList.add('active');

  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    createNewPlaylist('playlist-1');
    state.activePlaylistIndex = 0;
  } else if (state.playlists.length > 0) {
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
  document.getElementById('page-playlist')?.classList.remove('active');
  document.getElementById('page-sync')?.classList.add('active');
  const statusText = document.getElementById('status-text');
  if (statusText) statusText.textContent = 'Prêt.';
}

// ── Keyboard router (refactored — Phase 1) ─────────────────────────────────
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const ctx = buildContext(e);
  // Modal isolation: only Escape passes through when a modal is open
  // (preserves exact behavior of the old monolithic keydown handler)
  if (ctx.activeModal !== null && e.key !== 'Escape') return;
  registry.dispatch(e, ctx);
});

// ── Toolbar bindings ──────────────────────────────────────────────────────
(document.getElementById('btn-config') as HTMLElement | null)!.onclick = () => openModal('config');
(document.getElementById('btn-legend') as HTMLElement | null)!.onclick = () => openModal('legend');
(document.getElementById('btn-journal') as HTMLElement | null)!.onclick = () => {
  renderJournal();
  openModal('journal');
};
(document.getElementById('journal-clear') as HTMLElement | null)?.addEventListener('click', () => {
  confirmDialog('Vider tout le journal ?', () => void clearJournal(), 'Vider');
});
(document.getElementById('btn-scan') as HTMLElement | null)!.onclick = runScan;
// Bouton ➕ : création d'un dossier racine dans Source Data (page sync).
(document.getElementById('btn-add-dir') as HTMLElement | null)?.addEventListener('click', () => {
  void createSourceFolder();
});
(document.getElementById('pl-manage') as HTMLElement | null)!.onclick = () => {
  renderPlaylistManager();
  openModal('playlists');
};
(document.getElementById('pl-save') as HTMLElement | null)!.onclick = () => void saveCurrentPlaylist();
(document.getElementById('pl-export') as HTMLElement | null)!.onclick = () => void showExportModal();
(document.getElementById('page-sync') as HTMLElement | null)!.onclick = async () => {
  if (state.playlistMode) await exitPlaylistMode();
};
(document.getElementById('page-playlist') as HTMLElement | null)!.onclick = async () => {
  if (!state.playlistMode) await enterPlaylistMode();
};
(document.getElementById('page-cue') as HTMLElement | null)!.onclick = () => {
  if (state.activeModal === 'cueEditor' || !state.lastCueTrack) return;
  void openCueEditor(state.lastCueTrack);
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
import { revalidateFocus } from './focus.js';

initFilterPalette(() => {
  renderSource();
  revalidateFocus();
});

// ── Server health indicator ────────────────────────────────────────────────
function updateServerIndicator(): void {
  const dot = document.getElementById('server-indicator');
  if (!dot) return;
  fetch('/ping')
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        dot.classList.add('online');
        dot.textContent = '🟢 Online';
        dot.title = 'Serveur connecté';
      } else {
        dot.classList.remove('online');
        dot.textContent = '🔴 Offline';
        dot.title = 'Serveur hors ligne';
      }
    })
    .catch(() => {
      dot.classList.remove('online');
      dot.textContent = '🔴 Offline';
      dot.title = 'Serveur injoignable';
    });
}

// ── Boot ──────────────────────────────────────────────────────────────────
updateServerIndicator();
setInterval(updateServerIndicator, 10000);
initAudioUI();
initConfigUI();
setupRenderSubscriptions();
initTwinHint(); // EPIC-028 P1 : halo ambre sur le jumeau rangé au focus épars
initApp();
