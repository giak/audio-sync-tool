// ─── Single source of truth for all app state ──────────────────────────────
// State is wrapped in a Proxy that validates critical fields on write.
// Invalid values are silently rejected (console.warn) to prevent corruption.

const VALID_PANELS = new Set(['epars', 'source']);
const VALID_MODALS = new Set([null, 'config', 'legend', 'journal', 'dialog', 'playlists']);
const VALID_PLAYLIST_FOCUS = new Set(['source', 'sidebar']);

const _state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  activeModal: null,          // null | 'config' | 'legend' | 'journal' | 'dialog' | 'playlists'
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

export const state = new Proxy(_state, {
  set(target, prop, value) {
    if (prop === 'activePanel' && !VALID_PANELS.has(value)) {
      console.warn(`state.activePanel invalide: ${value}`);
      return true; // ES modules (strict) — returning false throws TypeError
    }
    if (prop === 'activeModal' && !VALID_MODALS.has(value)) {
      console.warn(`state.activeModal invalide: ${value}`);
      return true;
    }
    if (prop === 'playlistFocus' && !VALID_PLAYLIST_FOCUS.has(value)) {
      console.warn(`state.playlistFocus invalide: ${value}`);
      return true;
    }
    target[prop] = value;
    return true;
  }
});
