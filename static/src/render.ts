// ─── Render assembler: imports from sub-modules, re-exports ─────────────
// Phase 2: Component Factories. render.ts is now a thin shell.
// All exports use local bindings (import + export) to avoid pass-through conflicts.

import { subscribeVisible } from './core/subscribe.js';
import { patchEparsFileAfterCopy, patchSourceFileAfterCopy } from './domPatches.js';
import { getBatchCopy } from './render/batchCopy.js';
import { doDragCopy } from './render/dragDrop.js';
import { renderEpars } from './render/eparsUI.js';
import { clearJournal, renderJournal } from './render/journalUI.js';
import {
  patchPlaylistSourceFile,
  renderPlaylistManager,
  renderPlaylistPanel,
  renderPlaylistSource,
} from './render/playlistUI.js';
import { _ratingClickHandler, startRatingEdit, startSourceRatingEdit } from './render/ratingEdit.js';
import { renderDirTree, renderSource, togglePlaylistSourceDir, toggleSourceDir } from './render/sourceTree.js';
import { on, state } from './state.js';

export {
  _ratingClickHandler,
  clearJournal,
  doDragCopy,
  getBatchCopy,
  patchEparsFileAfterCopy,
  patchPlaylistSourceFile,
  patchSourceFileAfterCopy,
  renderDirTree,
  renderEpars,
  renderJournal,
  renderPlaylistManager,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderSource,
  startRatingEdit,
  startSourceRatingEdit,
  togglePlaylistSourceDir,
  toggleSourceDir,
};

export function updatePlaylistLedIndicator(): void {
  const sidebarEl = document.getElementById('playlist-sidebar');
  if (!sidebarEl || sidebarEl.classList.contains('hidden')) return;
  const container = document.getElementById('playlist-panel');
  if (!container) return;
  container.querySelectorAll('.led-playing').forEach(el => {
    el.classList.remove('led-playing');
  });
  const playingRow = container.querySelector('.play-btn.playing')?.closest('.pl-track');
  const name = playingRow?.querySelector('.pl-track-name');
  if (name) name.classList.add('led-playing');
}

// ── Event subscriptions (Phase 3: auto-render on state change) ───────────

/** Wire up EventEmitter state changes to auto-renders. Called once at boot. */
export function setupRenderSubscriptions(): void {
  // Auto-render panels when their data changes (EPIC-036 : garde hidden centralisé)
  subscribeVisible('eparsFiles:changed', 'epars-container', renderEpars);
  subscribeVisible('sourceFiles:changed', 'source-container', renderSource);
  // Dossiers racine créés via ➕ (sourceTree.renderExtraDirs)
  subscribeVisible('sourceExtraDirs:changed', 'source-container', renderSource);

  // Journal change → epars badges need recomputation
  subscribeVisible('journal:changed', 'epars-container', renderEpars);

  // ── Panel active class toggling ──────────────────────────────────────
  on('activePanel:changed', () => {
    document.querySelectorAll('.panel-active').forEach(el => {
      el.classList.remove('panel-active');
    });
    const el =
      state.activePanel === 'source' ? document.getElementById('panel-right') : document.getElementById('panel-left');
    el?.classList.add('panel-active');
  });

  // ── Playlist mode event subscriptions ─────────────────────────────────

  // When audio starts/stops, keep the playlist track indicator in sync
  on('audio:changed', updatePlaylistLedIndicator);

  // When playlist tracks or active tab change, auto-update the panel
  subscribeVisible('eparsPlaylist:changed', 'playlist-layout', renderPlaylistPanel);
  subscribeVisible('activePlaylistIndex:changed', 'playlist-layout', renderPlaylistPanel);
}
