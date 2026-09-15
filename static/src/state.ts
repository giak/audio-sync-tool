// ─── Single source of truth for all app state with EventEmitter ────────────
// State is wrapped in a Proxy that validates critical fields on write.
// Invalid values are silently rejected (console.warn) to prevent corruption.
// Emits `${prop}:changed` events automatically on write, batched via RAF.

import type { PlaylistTrackLite } from './render/cueEditor.js';

// ── EventEmitter (Phase 3) ─────────────────────────────────────────────────
type Listener = () => void;
const _listeners = new Map<string, Set<Listener>>();
const _dirty = new Set<string>();
let _rafScheduled = false;

export function on(event: string, fn: Listener): () => void {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event)!.add(fn);
  return () => _listeners.get(event)?.delete(fn);
}

export function emit(event: string): void {
  _dirty.add(event);
  if (!_rafScheduled) {
    _rafScheduled = true;
    requestAnimationFrame(() => {
      _rafScheduled = false;
      for (const evt of _dirty) {
        for (const fn of _listeners.get(evt) || []) {
          fn();
        }
      }
      _dirty.clear();
    });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SourceFileEntry {
  path: string;
  year: string | null;
  duration: number | null;
  codec: string | null;
}

export interface FileIndex {
  [filename: string]: SourceFileEntry;
}

interface PlaylistTrack {
  filename: string;
  fullPath: string;
  relPath: string;
  year: string | null;
  duration: number | null;
  codec: string | null;
}

interface SavedPlaylist {
  name: string;
  tracks: PlaylistTrack[];
  exported?: string;
  exportedDir?: string;
}

export interface SourceFiles {
  [dir: string]: {
    [filename: string]: { path: string };
  };
}

export interface TreeNode {
  [key: string]: TreeNode | unknown[] | undefined;
  __files__?: unknown[];
}

export interface JournalEntry {
  timestamp: string;
  action: string;
  details: string;
  status: string;
  filename?: string;
  source?: string;
  destination?: string;
  [key: string]: unknown;
}

interface SourceNodeInfo {
  node: TreeNode;
  baseDir: string;
}

type ActiveModal = 'config' | 'legend' | 'journal' | 'dialog' | 'playlists' | 'cueEditor' | null;
type ActivePanel = 'epars' | 'source';
type PlaylistFocusZone = 'source' | 'sidebar';

interface AppState {
  sourceFiles: Record<string, FileIndex>;
  /** Dossiers racine vides créés via l'UI (➕) — le scan n'indexe que les fichiers
   *  audio, ils seraient invisibles sans ce suivi. Chemins absolus. */
  sourceExtraDirs: Set<string>;
  eparsFiles: Record<string, FileIndex>;
  journal: JournalEntry[];
  activeModal: ActiveModal;
  activePanel: ActivePanel;
  eparsFocusPath: string | null;
  sourceFocusPath: string | null;
  sourceExpanded: Set<string>;
  sourceNodeMap: Map<string, SourceNodeInfo>;
  sourceFilter: string;
  filterActive: boolean;
  audioSeekStep: number;
  playlistMode: boolean;
  playlists: SavedPlaylist[];
  activePlaylistIndex: number | null;
  pendingPlaylists: Record<string, PlaylistTrack[]>;
  playlistFocus: PlaylistFocusZone;
  playlistTrackFocusIndex: number | null;
  sourceManuallyExpanded: Set<string>;
  selectedEparsFiles: Map<string, EparsSelection>;
  lastSelectedEparsIndex: number | null;
  navHistory: Array<NavHistoryEntry>;
  navIndex: number;
  ratings: Record<string, number>;
  focusListId: 'epars' | 'source' | 'playlist-source' | 'playlist-tracks';
  lastCueTrack: PlaylistTrackLite | null;
}

export interface EparsSelection {
  filename: string;
  eparDir: string;
  fullpath: string;
}

interface NavHistoryEntry {
  panel: ActivePanel;
  focusPath: string | null;
}

const VALID_PANELS = new Set<ActivePanel>(['epars', 'source']);
const VALID_MODALS = new Set<ActiveModal>([null, 'config', 'legend', 'journal', 'dialog', 'playlists', 'cueEditor']);
const VALID_PLAYLIST_FOCUS = new Set<PlaylistFocusZone>(['source', 'sidebar']);

const _state: AppState = {
  sourceFiles: {},
  sourceExtraDirs: new Set(),
  eparsFiles: {},
  journal: [],
  activeModal: null,
  activePanel: 'epars',
  eparsFocusPath: null,
  sourceFocusPath: null,
  sourceExpanded: new Set(),
  sourceNodeMap: new Map(),
  sourceFilter: '',
  filterActive: false,
  audioSeekStep: 20,
  playlistMode: false,
  playlists: [],
  activePlaylistIndex: null,
  pendingPlaylists: {},
  playlistFocus: 'source',
  playlistTrackFocusIndex: null,
  sourceManuallyExpanded: new Set(),
  selectedEparsFiles: new Map(),
  lastSelectedEparsIndex: null,
  navHistory: [],
  navIndex: -1,
  ratings: {},
  focusListId: 'epars',
  lastCueTrack: null,
};

export const state = new Proxy<AppState>(_state, {
  set(target: AppState, prop: string | symbol, value: unknown): boolean {
    if (prop === 'activePanel' && !VALID_PANELS.has(value as ActivePanel)) {
      console.warn(`state.activePanel invalide: ${value}`);
      return true;
    }
    if (prop === 'activeModal' && !VALID_MODALS.has(value as ActiveModal)) {
      console.warn(`state.activeModal invalide: ${value}`);
      return true;
    }
    if (prop === 'playlistFocus' && !VALID_PLAYLIST_FOCUS.has(value as PlaylistFocusZone)) {
      console.warn(`state.playlistFocus invalide: ${value}`);
      return true;
    }
    const old = (target as unknown as Record<string, unknown>)[prop as string];
    (target as unknown as Record<string, unknown>)[prop as string] = value;
    if (old !== value) emit(`${String(prop)}:changed`);
    return true;
  },
});
