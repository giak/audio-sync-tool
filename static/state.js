const VALID_PANELS = /* @__PURE__ */ new Set(["epars", "source"]);
const VALID_MODALS = /* @__PURE__ */ new Set([null, "config", "legend", "journal", "dialog", "playlists"]);
const VALID_PLAYLIST_FOCUS = /* @__PURE__ */ new Set(["source", "sidebar"]);
const _state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  activeModal: null,
  activePanel: "epars",
  eparsFocusPath: null,
  sourceFocusPath: null,
  sourceExpanded: /* @__PURE__ */ new Set(),
  sourceNodeMap: /* @__PURE__ */ new Map(),
  sourceFilter: "",
  filterActive: false,
  audioSeekStep: 20,
  playlistMode: false,
  playlists: [],
  activePlaylistIndex: null,
  pendingPlaylists: {},
  playlistFocus: "source"
};
const state = new Proxy(_state, {
  set(target, prop, value) {
    if (prop === "activePanel" && !VALID_PANELS.has(value)) {
      console.warn(`state.activePanel invalide: ${value}`);
      return true;
    }
    if (prop === "activeModal" && !VALID_MODALS.has(value)) {
      console.warn(`state.activeModal invalide: ${value}`);
      return true;
    }
    if (prop === "playlistFocus" && !VALID_PLAYLIST_FOCUS.has(value)) {
      console.warn(`state.playlistFocus invalide: ${value}`);
      return true;
    }
    target[prop] = value;
    return true;
  }
});
export {
  state
};
