// ─── Render assembler: imports from sub-modules, re-exports ─────────────
// Phase 2: Component Factories. render.ts is now a thin shell.
// All exports use local bindings (import + export) to avoid pass-through conflicts.

import { state, on } from './state.js';

import { renderJournal } from './render/journalUI.js';
import { renderEpars } from './render/eparsUI.js';
import { renderSource, toggleSourceDir, renderDirTree, togglePlaylistSourceDir } from './render/sourceTree.js';
import { renderPlaylistPanel, renderPlaylistSource, renderPlaylistManager, patchPlaylistSourceFile } from './render/playlistUI.js';
import { startRatingEdit, startSourceRatingEdit, _ratingClickHandler } from './render/ratingEdit.js';
import { getBatchCopy } from './render/batchCopy.js';
import { doDragCopy } from './render/dragDrop.js';
import { patchEparsFileAfterCopy, patchSourceFileAfterCopy } from './domPatches.js';

export {
  renderJournal,
  renderEpars,
  renderSource,
  toggleSourceDir,
  renderDirTree,
  togglePlaylistSourceDir,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderPlaylistManager,
  patchPlaylistSourceFile,
  startRatingEdit,
  startSourceRatingEdit,
  _ratingClickHandler,
  getBatchCopy,
  doDragCopy,
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
};

// ── Event subscriptions (Phase 3: auto-render on state change) ───────────

/** Wire up EventEmitter state changes to auto-renders. Called once at boot. */
export function setupRenderSubscriptions(): void {
  // Auto-render panels when their data changes
  on('eparsFiles:changed', () => {
    const container = document.getElementById('epars-container');
    if (container && !container.classList.contains('hidden')) renderEpars();
  });
  on('sourceFiles:changed', () => {
    const container = document.getElementById('source-container');
    if (container && !container.classList.contains('hidden')) renderSource();
  });

  // Journal change → epars badges need recomputation
  on('journal:changed', () => {
    const container = document.getElementById('epars-container');
    if (container && !container.classList.contains('hidden')) renderEpars();
  });

  // ── Panel active class toggling ──────────────────────────────────────
  on('activePanel:changed', () => {
    document.querySelectorAll('.panel-active').forEach(el => el.classList.remove('panel-active'));
    const el = state.activePanel === 'source'
      ? document.getElementById('panel-right')
      : document.getElementById('panel-left');
    el?.classList.add('panel-active');
  });

  // ── Playlist mode event subscriptions ─────────────────────────────────

  // When audio starts/stops, update the playlist track indicator if visible
  on('audio:changed', () => {
    const sidebarEl = document.getElementById('playlist-sidebar');
    if (sidebarEl && !sidebarEl.classList.contains('hidden')) {
      const container = document.getElementById('playlist-panel');
      if (container) {
        // Remove .led-playing from all playlist tracks
        container.querySelectorAll('.led-playing').forEach(el => el.classList.remove('led-playing'));
      }
    }
  });

  // When playlist tracks or active tab change, auto-update the panel
  const autoRenderPlaylistPanel = (): void => {
    const layout = document.getElementById('playlist-layout');
    if (layout && !layout.classList.contains('hidden')) {
      renderPlaylistPanel();
    }
  };

  on('eparsPlaylist:changed', autoRenderPlaylistPanel);
  on('activePlaylistIndex:changed', autoRenderPlaylistPanel);
}


