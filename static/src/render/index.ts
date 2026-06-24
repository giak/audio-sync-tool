// ─── Render assembler: re-exports for backward compatibility ──────────
// Phase 2: Component Factories. All modules now under render/.

export {
  renderEpars,
  renderSource,
  renderJournal,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderPlaylistManager,
  toggleSourceDir,
  renderDirTree,
  togglePlaylistSourceDir,
  startRatingEdit,
  startSourceRatingEdit,
  _ratingClickHandler,
  patchPlaylistSourceFile,
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  getBatchCopy,
  doDragCopy,
} from '../render.js';
