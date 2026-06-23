import { state } from "./state.js";
import { api } from "./api.js";
async function loadPlaylists() {
  state.playlists = await api("/playlists");
}
async function savePlaylist(name, tracks) {
  const res = await api("/playlists", {
    method: "POST",
    body: JSON.stringify({ name, tracks })
  });
  await loadPlaylists();
  return res.playlist;
}
async function renamePlaylist(oldName, newName) {
  const res = await api(`/playlists/${encodeURIComponent(oldName)}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName })
  });
  await loadPlaylists();
  return res;
}
async function deletePlaylist(name) {
  const res = await api(`/playlists/${encodeURIComponent(name)}`, { method: "DELETE" });
  await loadPlaylists();
  return res.ok;
}
async function exportPlaylist(name) {
  return await api("/playlists/export", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}
function getPendingTracks(name) {
  return state.pendingPlaylists[name] || [];
}
function setPendingTracks(name, tracks) {
  state.pendingPlaylists[name] = tracks;
}
function addTrack(name, track) {
  const tracks = getPendingTracks(name);
  if (tracks.some((t) => t.fullPath === track.fullPath)) return false;
  tracks.push(track);
  setPendingTracks(name, tracks);
  return true;
}
function removeTrack(name, fullPath) {
  let tracks = getPendingTracks(name);
  tracks = tracks.filter((t) => t.fullPath !== fullPath);
  setPendingTracks(name, tracks);
}
function reorderTrack(name, oldIndex, newIndex) {
  const tracks = getPendingTracks(name);
  if (oldIndex < 0 || oldIndex >= tracks.length) return;
  if (newIndex < 0 || newIndex >= tracks.length) return;
  const [moved] = tracks.splice(oldIndex, 1);
  tracks.splice(newIndex, 0, moved);
  setPendingTracks(name, tracks);
}
function createNewPlaylist(name) {
  if (!state.pendingPlaylists[name]) {
    state.pendingPlaylists[name] = [];
  }
  return name;
}
function removePendingPlaylist(name) {
  delete state.pendingPlaylists[name];
}
function getActivePlaylistName() {
  const keys = Object.keys(state.pendingPlaylists);
  const idx = state.activePlaylistIndex != null ? state.activePlaylistIndex : 0;
  return keys[idx] || "playlist-1";
}
export {
  addTrack,
  createNewPlaylist,
  deletePlaylist,
  exportPlaylist,
  getActivePlaylistName,
  getPendingTracks,
  loadPlaylists,
  removePendingPlaylist,
  removeTrack,
  renamePlaylist,
  reorderTrack,
  savePlaylist,
  setPendingTracks
};
