// ─── Single source of truth for all app state ──────────────────────────────
// Imported by all modules that read/write state.
// In ES modules, `import { state } from './state.js'` gives the same
// live reference everywhere — no need for an event bus.

export const state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  activeModal: null,          // null | 'config' | 'legend' | 'journal' | 'dialog'
  activePanel: 'epars',       // 'epars' | 'source'
  eparsFocusPath: null,       // full path string
  sourceFocusPath: null,      // full path string
  sourceExpanded: new Set(),  // paths of expanded dirs in Source Data
  sourceNodeMap: new Map(),   // fullPath → { node, baseDir } for toggleSourceDir
  sourceFilter: '',
  filterActive: false,
  audioSeekStep: 20,          // seconds for Shift+Arrow seek

  // ── Playlist mode state ────────────────────────────────────────────────
  playlistMode: false,            // true when in Playlist mode (replaces 2-panel view)
  playlists: [],                  // cache of GET /playlists (array of playlist objects)
  activePlaylistIndex: null,      // index into the merged Set (playlists + pendingPlaylists)
  pendingPlaylists: {},           // { name: [track, ...] } — unsaved pending tracks
  playlistFocus: 'source',        // 'source' | 'sidebar' — keyboard focus in playlist mode
};
