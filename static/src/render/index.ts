// ─── Render assembler: re-exports for backward compatibility ──────────
// Phase 2: Component Factories. When individual modules are created under
// render/, this file will import from them. For now, re-export from the
// monolithic render.ts at the same level.

export {
  renderAll,
  renderEpars,
  renderSource,
  renderJournal,
  renderPlaylistPanel,
  renderPlaylistSource,
  renderPlaylistManager,
  toggleSourceDir,
  startRatingEdit,
  startSourceRatingEdit,
  patchPlaylistSourceFile,
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  getBatchCopy,
} from '../render.js';
