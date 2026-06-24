// ─── Playlist business logic: CRUD, export, drag-drop state ─────────────

import { api } from './api.js';
import { state, emit } from './state.js';

interface PlaylistTrack {
  filename: string;
  fullPath: string;
  relPath: string;
  year: string | null;
  duration: number | null;
  codec: string | null;
}

// ── Server-side operations ───────────────────────────────────────────────

/**
 * Load all playlists from server into state.playlists.
 * Called on init and after every save/delete.
 */
export async function loadPlaylists(): Promise<void> {
  state.playlists = await api('/playlists');
}

/**
 * Save a playlist to the server (creates or overwrites).
 * Also refreshes state.playlists in-place.
 * Returns the playlist object from the server.
 */
export async function savePlaylist(name: string, tracks: PlaylistTrack[]): Promise<Record<string, unknown>> {
  const res = await api<{ playlist: Record<string, unknown> }>('/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, tracks }),
  });
  // Refresh local cache so tabs stay in sync
  await loadPlaylists();
  return res.playlist;
}

/**
 * Rename a playlist on the server.
 * Sends PUT /playlists/<oldName> with the new name in the body.
 * Returns { ok, playlist } on success.
 */
export async function renamePlaylist(oldName: string, newName: string): Promise<Record<string, unknown>> {
  const res = await api(`/playlists/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    body: JSON.stringify({ name: newName }),
  });
  await loadPlaylists();
  return res;
}

/**
 * Delete a playlist manifest from the server.
 * Does NOT remove exported hard links.
 * Returns true on success.
 */
export async function deletePlaylist(name: string): Promise<boolean> {
  const res = await api<{ ok: boolean }>(`/playlists/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await loadPlaylists();
  return res.ok;
}

/**
 * Export (materialize) a playlist as hard-linked files in _playlists/<name>.
 * Returns { ok, dir, count, totalDuration, fallback, warning, missing }.
 */
export async function exportPlaylist(name: string): Promise<Record<string, unknown>> {
  return await api('/playlists/export', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// ── Temporary (pending) playlist state management ───────────────────────
// These functions manage the "pending" tracks — tracks that the user has
// added to a playlist but may not have saved to the server yet.

/**
 * Get the tracks for a pending playlist. Returns tracks array or [].
 */
export function getPendingTracks(name: string): PlaylistTrack[] {
  return state.pendingPlaylists[name] || [];
}

/**
 * Set the tracks for a pending playlist (full replace).
 */
export function setPendingTracks(name: string, tracks: PlaylistTrack[]): void {
  state.pendingPlaylists[name] = tracks;
}

/**
 * Add a track to a pending playlist.
 * Returns true if added, false if already present (duplicate, spec §6.2).
 */
export function addTrack(name: string, track: PlaylistTrack): boolean {
  const tracks = getPendingTracks(name);
  if (tracks.some(t => t.fullPath === track.fullPath)) return false;
  tracks.push(track);
  setPendingTracks(name, tracks);
  emit('eparsPlaylist:changed');
  return true;
}

/**
 * Remove a track from a pending playlist by fullPath.
 */
export function removeTrack(name: string, fullPath: string): void {
  let tracks = getPendingTracks(name);
  tracks = tracks.filter(t => t.fullPath !== fullPath);
  setPendingTracks(name, tracks);
  emit('eparsPlaylist:changed');
}

/**
 * Move a track from oldIndex to newIndex (reorder) in a pending playlist.
 */
export function reorderTrack(name: string, oldIndex: number, newIndex: number): void {
  const tracks = getPendingTracks(name);
  if (oldIndex < 0 || oldIndex >= tracks.length) return;
  if (newIndex < 0 || newIndex >= tracks.length) return;
  const [moved] = tracks.splice(oldIndex, 1);
  tracks.splice(newIndex, 0, moved);
  setPendingTracks(name, tracks);
  emit('eparsPlaylist:changed');
}

/**
 * Create a new empty playlist in the pending state (not saved to server yet).
 * If the name already exists, does nothing (no-op).
 * Returns the name.
 */
export function createNewPlaylist(name: string): string {
  if (!state.pendingPlaylists[name]) {
    state.pendingPlaylists[name] = [];
  }
  return name;
}

/**
 * Remove a pending playlist entirely (does not touch server).
 */
export function removePendingPlaylist(name: string): void {
  delete state.pendingPlaylists[name];
}

/**
 * Get the name of the currently active playlist.
 * Falls back to 'playlist-1' if nothing is set.
 */
export function getActivePlaylistName(): string {
  const keys = Object.keys(state.pendingPlaylists);
  const idx = state.activePlaylistIndex != null ? state.activePlaylistIndex : 0;
  return keys[idx] || 'playlist-1';
}
