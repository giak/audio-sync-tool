// ─── Render assembler: re-exports for backward compatibility ──────────
// Phase 2: Component Factories. All modules now under render/.

export {
  _ratingClickHandler,
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
} from '../render.js';
