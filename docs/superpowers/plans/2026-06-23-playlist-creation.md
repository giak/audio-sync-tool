# Playlist Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task.

**Goal:** Add a Playlist Creation mode to the Audio Sync Tool. Users navigate the Source Data tree, add tracks to named playlists (multiple simultaneous via tabs), reorder by drag & drop or keyboard, and export as hard-linked folders importable into Traktor 4.

**Architecture:** Extends the existing single-page Flask app. Backend adds 4 routes for playlist CRUD + export. Frontend adds a dedicated `playlist.js` module, a playlist panel component, and a keyboard-aware Playlist mode that replaces the two-panel view.

**Tech Stack:** Python 3 + Flask (backend), HTML/CSS/JS vanilla (frontend), JSON files (storage).

## Global Constraints

- Flask + mutagen : uniques dépendances externes (`pip install flask mutagen`)
- Aucune suppression de fichier — copie/suppression de hard links uniquement lors d'un export écrasé
- Manifest persistant dans `data/playlists.json`
- Interface légère, zéro dépendance npm
- Port : 8765

---

## Pre-flight Checklist (lecture obligatoire avant d'implémenter)

- [ ] Lire `docs/superpowers/specs/2026-06-23-playlist-creation-design.md` — spec complète
- [ ] Lire `static/state.js` — état existant, ajouter propriétés playlist
- [ ] Lire `static/script.js` — routage clavier, toolbar bindings
- [ ] Lire `static/render.js` — rendu Source Data (réutilisé pour arborescence)
- [ ] Lire `static/style.css` — styles existants, ajouter styles playlist
- [ ] Lire `app.py` — routes existantes, ajouter routes playlist
- [ ] Lire `test_app.py` — tests existants, ajouter tests playlist

---

### Task 1: Backend — Routes Playlist (app.py + tests)

**Files:**
- Modify: `app.py` — ajouter `PLAYLISTS_PATH`, 4 nouvelles routes
- Modify: `test_app.py` — ajouter tests playlist

**Interfaces:**
- Produces: `GET/POST /playlists`, `POST /playlists/export`, `DELETE /playlists/<name>`

- [ ] **Step 1: Ajouter PLAYLISTS_PATH dans app.py**

```python
PLAYLISTS_PATH = os.path.join(DATA_DIR, 'playlists.json')
```

- [ ] **Step 2: Écrire les tests playlist avec pytest**

```python
# --- Playlist tests ---

def test_playlists_empty(client):
    """GET /playlists returns empty list when no playlists exist."""
    rv = client.get('/playlists')
    assert rv.status_code == 200
    assert rv.json == []


def test_playlists_create_and_list(client):
    """POST /playlists creates a playlist, GET /playlists lists it."""
    payload = {
        'name': 'set-summer',
        'tracks': [
            {
                'filename': 'track.mp3',
                'fullPath': '/home/giak/Music/select/style/House/2024/track.mp3',
                'relPath': 'House/2024/track.mp3',
                'year': '2024',
                'duration': 240,
                'codec': 'MP3 320kbps'
            }
        ]
    }
    rv = client.post('/playlists', json=payload)
    assert rv.status_code == 200
    assert rv.json['ok'] is True
    assert rv.json['playlist']['name'] == 'set-summer'
    assert rv.json['playlist']['trackCount'] == 1

    rv = client.get('/playlists')
    assert rv.status_code == 200
    assert len(rv.json) == 1
    assert rv.json[0]['name'] == 'set-summer'


def test_playlists_overwrite(client):
    """POST /playlists with existing name overwrites (updates)."""
    tracks_a = [{'filename': 'a.mp3', 'fullPath': '/a.mp3', 'relPath': 'a.mp3'}]
    tracks_b = [{'filename': 'b.mp3', 'fullPath': '/b.mp3', 'relPath': 'b.mp3'}]

    client.post('/playlists', json={'name': 'pl', 'tracks': tracks_a})
    client.post('/playlists', json={'name': 'pl', 'tracks': tracks_b})

    rv = client.get('/playlists')
    pl = rv.json[0]
    assert pl['trackCount'] == 1
    assert pl['tracks'][0]['filename'] == 'b.mp3'


def test_playlists_delete(client):
    """DELETE /playlists/<name> removes the playlist manifest."""
    client.post('/playlists', json={
        'name': 'delete-me', 'tracks': [{'filename': 'x.mp3', 'fullPath': '/x.mp3', 'relPath': 'x.mp3'}]
    })
    rv = client.delete('/playlists/delete-me')
    assert rv.status_code == 200
    assert rv.json['ok'] is True

    rv = client.get('/playlists')
    assert len(rv.json) == 0


def test_playlists_delete_not_found(client):
    """DELETE /playlists/<name> returns 404 for nonexistent playlist."""
    rv = client.delete('/playlists/nonexistent')
    assert rv.status_code == 404


def test_playlists_export_success(client):
    """POST /playlists/export creates hard links in _playlists/<name>."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        os.makedirs(src)

        # Create a real file to hard-link
        track_path = os.path.join(src, 'track.mp3')
        open(track_path, 'w').close()

        # Set config so export knows the source base
        client.post('/config', json={
            'active': 0,
            'configs': [{'name': 'test', 'source_data': src, 'epars_dirs': []}]
        })

        # Create playlist with this track
        client.post('/playlists', json={
            'name': 'export-test',
            'tracks': [{
                'filename': 'track.mp3',
                'fullPath': track_path,
                'relPath': 'track.mp3',
                'year': '2024',
                'duration': 240,
                'codec': 'MP3 320kbps'
            }]
        })

        rv = client.post('/playlists/export', json={'name': 'export-test'})
        assert rv.status_code == 200
        assert rv.json['ok'] is True
        assert rv.json['count'] == 1
        assert 'export-test' in rv.json['dir']

        # Verify hard link was created
        export_dir = os.path.join(src, '_playlists', 'export-test')
        assert os.path.exists(os.path.join(export_dir, 'track.mp3'))

        # Verify it's a hard link (same inode as source)
        src_stat = os.stat(track_path)
        dst_stat = os.stat(os.path.join(export_dir, 'track.mp3'))
        assert src_stat.st_ino == dst_stat.st_ino

        # Verify manifest is updated
        rv = client.get('/playlists')
        pl = rv.json[0]
        assert pl['exported'] is not None
        assert pl['exportedDir'] == export_dir


def test_playlists_export_missing_files(client):
    """POST /playlists/export returns 409 when source files are missing."""
    client.post('/playlists', json={
        'name': 'broken',
        'tracks': [{
            'filename': 'ghost.mp3',
            'fullPath': '/nonexistent/ghost.mp3',
            'relPath': 'ghost.mp3'
        }]
    })
    rv = client.post('/playlists/export', json={'name': 'broken'})
    assert rv.status_code == 409
    assert rv.json['ok'] is False
    assert 'ghost.mp3' in rv.json['missing']


def test_playlists_export_not_found(client):
    """POST /playlists/export returns 404 for nonexistent playlist."""
    rv = client.post('/playlists/export', json={'name': 'no-such-pl'})
    assert rv.status_code == 404


def test_playlists_export_cross_device_fallback(client):
    """When os.link raises EXDEV, fall back to shutil.copy2 and warn."""
    # This is hard to unit-test on a single filesystem.
    # Mock os.link to raise OSError(18, 'Invalid cross-device link').
    import app as app_module
    original_link = os.link

    def mock_link(src, dst):
        raise OSError(18, 'Invalid cross-device link')

    app_module.os.link = mock_link
    try:
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, 'source')
            os.makedirs(src)
            track_path = os.path.join(src, 'track.mp3')
            open(track_path, 'w').close()

            client.post('/config', json={
                'active': 0,
                'configs': [{'name': 'test', 'source_data': src, 'epars_dirs': []}]
            })
            client.post('/playlists', json={
                'name': 'cross-device',
                'tracks': [{
                    'filename': 'track.mp3',
                    'fullPath': track_path,
                    'relPath': 'track.mp3'
                }]
            })
            rv = client.post('/playlists/export', json={'name': 'cross-device'})
            assert rv.status_code == 200
            assert rv.json['ok'] is True
            assert rv.json['fallback'] == 'copy'
            # File should exist (via copy2 fallback)
            export_dir = os.path.join(src, '_playlists', 'cross-device')
            assert os.path.exists(os.path.join(export_dir, 'track.mp3'))
    finally:
        app_module.os.link = original_link
```

- [ ] **Step 3: Implémenter les routes playlist dans app.py**

```python
# Après LOG_PATH, ajouter :
PLAYLISTS_PATH = os.path.join(DATA_DIR, 'playlists.json')


@app.route('/playlists', methods=['GET', 'POST'])
def playlists():
    if request.method == 'POST':
        data = request.json
        if not data or 'name' not in data:
            return jsonify({'ok': False, 'error': 'Missing required key: name'}), 400

        playlists_data = load_json(PLAYLISTS_PATH, [])
        name = data['name']
        tracks = data.get('tracks', [])
        now = datetime.now().isoformat()

        # Compute metadata
        total_duration = sum(t.get('duration', 0) for t in tracks)

        playlist_obj = {
            'name': name,
            'created': now,
            'updated': now,
            'exported': None,
            'exportedDir': None,
            'tracks': tracks,
            'trackCount': len(tracks),
            'totalDuration': total_duration,
        }

        # Overwrite if exists
        existing = next((p for p in playlists_data if p['name'] == name), None)
        if existing:
            existing.update(playlist_obj)
            existing['created'] = existing.get('created', now)
        else:
            playlists_data.append(playlist_obj)

        save_json(PLAYLISTS_PATH, playlists_data)
        return jsonify({'ok': True, 'playlist': playlist_obj})

    return jsonify(load_json(PLAYLISTS_PATH, []))


@app.route('/playlists/export', methods=['POST'])
def export_playlist():
    data = request.json
    if not data or 'name' not in data:
        return jsonify({'ok': False, 'error': 'Missing required key: name'}), 400

    name = data['name']
    playlists_data = load_json(PLAYLISTS_PATH, [])
    pl = next((p for p in playlists_data if p['name'] == name), None)
    if not pl:
        return jsonify({'ok': False, 'error': 'Playlist introuvable'}), 404

    # Vérifier que tous les fichiers existent
    missing = []
    for track in pl['tracks']:
        if not os.path.exists(track['fullPath']):
            missing.append(track['filename'])

    if missing:
        return jsonify({'ok': False, 'missing': missing}), 409

    # Créer le dossier _playlists/<name> dans Source Data
    cfg = get_active_config()
    source_base = cfg.get('source_data', '')
    if not source_base:
        return jsonify({'ok': False, 'error': 'Aucun dossier source configuré'}), 400

    pl_dir = os.path.join(source_base, '_playlists', name)

    # Vérifier si un export existe déjà et le signaler
    export_already_exists = os.path.exists(pl_dir) and len(os.listdir(pl_dir)) > 0

    os.makedirs(pl_dir, exist_ok=True)

    # Créer les hard links (ou copie physique si cross-device)
    fallback = False
    for track in pl['tracks']:
        src = track['fullPath']
        dst = os.path.join(pl_dir, track['filename'])
        if os.path.exists(dst):
            os.remove(dst)  # remplacer les hard links existants (écrasement)
        try:
            os.link(src, dst)
        except OSError as e:
            if hasattr(e, 'errno') and e.errno == 18:  # EXDEV
                shutil.copy2(src, dst)
                fallback = True
            else:
                return jsonify({'ok': False, 'error': str(e)}), 500

    # Mettre à jour le manifest
    pl['exported'] = datetime.now().isoformat()
    pl['exportedDir'] = pl_dir
    save_json(PLAYLISTS_PATH, playlists_data)

    result = {
        'ok': True,
        'dir': pl_dir,
        'count': len(pl['tracks']),
        'totalDuration': sum(t.get('duration', 0) for t in pl['tracks']),
    }
    if fallback:
        result['fallback'] = 'copy'
        result['warning'] = 'Certains fichiers ont été copiés (hard link impossible entre disques différents)'

    return jsonify(result)


@app.route('/playlists/<name>', methods=['DELETE'])
def delete_playlist(name):
    playlists_data = load_json(PLAYLISTS_PATH, [])
    pl = next((p for p in playlists_data if p['name'] == name), None)
    if not pl:
        return jsonify({'ok': False, 'error': 'Playlist introuvable'}), 404

    playlists_data = [p for p in playlists_data if p['name'] != name]
    save_json(PLAYLISTS_PATH, playlists_data)
    return jsonify({'ok': True})
```

- [ ] **Step 4: Exécuter les tests**

```bash
cd /home/giak/projects/audio-sync-tool
./venv/bin/python -m pytest test_app.py -v -k "playlist"
```

Expected: All playlist tests pass.

- [ ] **Step 5: Exécuter tous les tests**

```bash
./venv/bin/python -m pytest test_app.py -v
```

Expected: All existing + new tests pass.

- [ ] **Step 6: Commit**

```bash
git add app.py test_app.py
git commit -m "feat(backend): playlist CRUD + export routes with hard links"
```

---

### Task 2: Frontend — État + Module playlist.js

**Files:**
- Modify: `static/state.js` — ajouter propriétés playlist
- Create: `static/playlist.js` — module CRUD, export, drag-drop state

**Interfaces:**
- Produces: `playlist.js` exported functions (createPlaylist, addTrack, removeTrack, reorderTracks, savePlaylist, exportPlaylist, loadPlaylists, deletePlaylist)
- Consumes: `state.js` (state), `api.js` (api)

- [ ] **Step 1: Ajouter l'état playlist dans state.js**

```javascript
// Ajouter à l'objet state :
playlistMode: false,            // true quand on est en mode Playlist
playlists: [],                  // cache de GET /playlists (tableau d'objets)
activePlaylistIndex: null,      // index dans le Set fusionné (playlists + pendingPlaylists)
// pendingPlaylists stocke les tracks non sauvegardées { 'name': [tracks...] }
pendingPlaylists: {},
```

- [ ] **Step 2: Créer static/playlist.js**

```javascript
// ─── Playlist business logic: CRUD, export, drag-drop state ─────────────
import { state } from './state.js';
import { api } from './api.js';

/**
 * Load all playlists from server into state.playlists.
 * Called on init and after every save/delete.
 */
export async function loadPlaylists() {
  state.playlists = await api('/playlists');
}

/**
 * Save a playlist to the server (creates or overwrites).
 * Also updates state.playlists in-place.
 */
export async function savePlaylist(name, tracks) {
  const res = await api('/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, tracks })
  });
  // Refresh local cache
  await loadPlaylists();
  return res.playlist;
}

/**
 * Delete a playlist manifest from the server.
 * Does NOT remove exported hard links.
 */
export async function deletePlaylist(name) {
  const res = await api(`/playlists/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await loadPlaylists();
  return res.ok;
}

/**
 * Export (materialize) a playlist as hard-linked files in _playlists/<name>.
 * Returns { ok, dir, count, totalDuration, fallback, warning, missing }.
 */
export async function exportPlaylist(name) {
  return await api('/playlists/export', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}

// ── Temporary (pending) playlist state management ───────────────────────

/**
 * Get the tracks for a pending playlist. Returns tracks array or [].
 */
export function getPendingTracks(name) {
  return state.pendingPlaylists[name] || [];
}

/**
 * Set the tracks for a pending playlist.
 */
export function setPendingTracks(name, tracks) {
  state.pendingPlaylists[name] = tracks;
}

/**
 * Add a track to a pending playlist.
 * Returns true if added, false if already present (duplicate).
 */
export function addTrack(name, track) {
  const tracks = getPendingTracks(name);
  if (tracks.some(t => t.fullPath === track.fullPath)) return false;
  tracks.push(track);
  setPendingTracks(name, tracks);
  return true;
}

/**
 * Remove a track from a pending playlist by fullPath.
 */
export function removeTrack(name, fullPath) {
  let tracks = getPendingTracks(name);
  tracks = tracks.filter(t => t.fullPath !== fullPath);
  setPendingTracks(name, tracks);
}

/**
 * Move a track from oldIndex to newIndex (reorder) in a pending playlist.
 */
export function reorderTrack(name, oldIndex, newIndex) {
  const tracks = getPendingTracks(name);
  if (oldIndex < 0 || oldIndex >= tracks.length) return;
  if (newIndex < 0 || newIndex >= tracks.length) return;
  const [moved] = tracks.splice(oldIndex, 1);
  tracks.splice(newIndex, 0, moved);
  setPendingTracks(name, tracks);
}

/**
 * Create a new empty playlist in the pending state (not saved to server yet).
 * Returns the name.
 */
export function createNewPlaylist(name) {
  if (!state.pendingPlaylists[name]) {
    state.pendingPlaylists[name] = [];
  }
  return name;
}

/**
 * Remove a pending playlist entirely.
 */
export function removePendingPlaylist(name) {
  delete state.pendingPlaylists[name];
}
```

- [ ] **Step 3: Commit**

```bash
git add static/state.js static/playlist.js
git commit -m "feat(frontend): playlist state + CRUD/export module"
```

---

### Task 3: Frontend — Routage clavier + basculement de mode

**Files:**
- Modify: `static/script.js` — ajouter le bouton Playlist, la bascule de mode, le routage clavier conditionnel

**Interfaces:**
- Consumes: `playlist.js` (loadPlaylists, createNewPlaylist, addTrack, etc.)
- Consumes: `render.js` (renderPlaylistPanel, renderSource)

- [ ] **Step 1: Ajouter le bouton Playlist dans templates/index.html**

Dans la toolbar, ajouter `id="btn-playlist"` après le bouton Legend.

```html
<button id="btn-playlist">🎵 Playlist</button>
```

- [ ] **Step 2: Ajouter les containers HTML pour le mode Playlist**

Dans `templates/index.html`, après la div `#main-panels`, ajouter le layout mode Playlist (caché par défaut) :

```html
<!-- Playlist mode layout (hidden by default, shown when playlistMode === true) -->
<div id="playlist-layout" class="hidden">
  <div id="playlist-main">
    <div id="playlist-source" class="panel">
      <h2>📂 Source Data <span id="playlist-source-count"></span></h2>
      <div id="playlist-source-container"></div>
    </div>
    <div id="playlist-sidebar" class="panel">
      <div id="playlist-tabs">
        <!-- Dynamically rendered: tab bar with + button -->
      </div>
      <div id="playlist-panel">
        <!-- Dynamically rendered: track list + action buttons -->
      </div>
      <div id="playlist-actions">
        <button id="pl-save">💾 Sauvegarder</button>
        <button id="pl-export">📦 Exporter</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Ajouter le gestionnaire de mode Playlist dans script.js**

```javascript
// Nouvel import
import { loadPlaylists, createNewPlaylist, savePlaylist, exportPlaylist } from './playlist.js';
import { renderPlaylistPanel, renderPlaylistSource } from './render.js';

// ── Playlist mode toggle ────────────────────────────────────────────────
document.getElementById('btn-playlist').onclick = async () => {
  if (state.playlistMode) {
    exitPlaylistMode();
  } else {
    await enterPlaylistMode();
  }
};

async function enterPlaylistMode() {
  await loadPlaylists();
  state.playlistMode = true;

  // Masquer la vue normale, afficher la vue Playlist
  document.getElementById('main-panels').classList.add('hidden');
  document.getElementById('playlist-layout').classList.remove('hidden');

  // Créer un onglet vide si aucune playlist n'existe
  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    createNewPlaylist('playlist-1');
    state.activePlaylistIndex = 0;
  } else if (state.playlists.length > 0) {
    state.activePlaylistIndex = 0;
  }

  renderPlaylistSource();
  renderPlaylistPanel();
  document.getElementById('status-text').textContent = '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.';
}

function exitPlaylistMode() {
  // Sauvegarde automatique de toutes les playlists modifiées
  for (const [name, tracks] of Object.entries(state.pendingPlaylists)) {
    if (tracks.length > 0) {
      savePlaylist(name, tracks);
    }
  }
  state.playlistMode = false;
  document.getElementById('playlist-layout').classList.add('hidden');
  document.getElementById('main-panels').classList.remove('hidden');
  document.getElementById('status-text').textContent = 'Prêt.';
}
```

- [ ] **Step 4: Ajouter le routage clavier conditionnel dans script.js**

Dans le gestionnaire `document.addEventListener('keydown', ...)`, ajouter en tête (après les checks de modale) :

```javascript
// ── Mode Playlist keyboard handling ──
if (state.playlistMode) {
  if (e.key === 'Escape') { e.preventDefault(); exitPlaylistMode(); return; }
  if (e.key === 'Tab') { e.preventDefault(); togglePlaylistFocus(); return; }
  if (e.key === ' ' && !isInput) {
    e.preventDefault();
    if (playlistFocus === 'source') {
      toggleTrackInPlaylist();
    }
    return;
  }

  // F7 / — filtrer Source Data (inchangé)
  if ((e.key === 'F7' || e.key === '/') && !isInput) {
    e.preventDefault();
    openFilterPalette(/* setActivePanel= */ (p) => {}, renderPlaylistSource);
    return;
  }

  // Suppr / Backspace dans le panneau playlist → retirer le morceau
  if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && playlistFocus === 'sidebar') {
    e.preventDefault();
    const focused = document.querySelector('#playlist-tracks .focused');
    if (focused) {
      const removeBtn = focused.querySelector('.pl-track-remove');
      if (removeBtn) removeBtn.click();
    }
    return;
  }

  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrentPlaylist(); return; }
  if (e.ctrlKey && e.key === 'e') { e.preventDefault(); showExportModal(); return; }
  if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isInput) {
    e.preventDefault();
    moveTrackInPlaylist(e.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  // Fall through for ↑↓←→ Enter in Source Data tree
}
```

- [ ] **Step 5: Implémenter les fonctions helper du routage Playlist**

Ajouter dans script.js :

```javascript
let playlistFocus = 'source';  // 'source' | 'sidebar'

function togglePlaylistFocus() {
  playlistFocus = playlistFocus === 'source' ? 'sidebar' : 'source';
  document.getElementById('playlist-source').classList.toggle('panel-active');
  document.getElementById('playlist-sidebar').classList.toggle('panel-active');
}

function toggleTrackInPlaylist() {
  const container = document.getElementById('playlist-source-container');
  const focused = container.querySelector('.focused');
  if (!focused || !focused.classList.contains('file-row')) return;

  const label = focused.querySelector('.file');
  const filename = label?.textContent || '';
  const fullPath = label?.dataset?.fullpath || '';
  if (!fullPath) return;

  const activeName = getActivePlaylistName();
  const track = {
    filename,
    fullPath,
    relPath: label.dataset.fullpath,
    year: focused.querySelector('.year')?.textContent || null,
    duration: parseInt(focused.querySelector('.duration')?.textContent) || null,
    codec: focused.querySelector('.codec')?.textContent || null,
  };

  const added = addTrack(activeName, track);
  if (added) {
    label.classList.add('in-playlist');
    showToast(`➕ ${filename} ajouté`);
  } else {
    removeTrack(activeName, fullPath);
    label.classList.remove('in-playlist');
    showToast(`➖ ${filename} retiré`);
  }
  renderPlaylistPanel();
}

function getActivePlaylistName() {
  return state.pendingPlaylists ? Object.keys(state.pendingPlaylists)[state.activePlaylistIndex || 0] : 'playlist-1';
}

async function saveCurrentPlaylist() {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  if (tracks.length === 0) {
    showToast('⚠️ Playlist vide, rien à sauvegarder');
    return;
  }
  await savePlaylist(name, tracks);
  showToast(`💾 Playlist "${name}" sauvegardée (${tracks.length} morceaux)`);
}

async function showExportModal() {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  if (tracks.length === 0) {
    showToast('⚠️ Playlist vide, rien à exporter');
    return;
  }

  // Vérifier si l'export existe déjà (via une playlist sauvegardée)
  const savedPl = state.playlists.find(p => p.name === name);
  let existingWarning = '';
  if (savedPl?.exported && savedPl.exportedDir) {
    // On ne peut pas vérifier depuis le frontend si le dossier existe toujours
    existingWarning = ' (⚠️ l\'export précédent sera écrasé)';
  }

  document.getElementById('dialog-msg').innerHTML = `
    Exporter la playlist <strong>"${escapeHtml(name)}"</strong> ?<br>
    ${tracks.length} morceau${tracks.length > 1 ? 'x' : ''}${existingWarning}
  `;
  document.getElementById('dialog-confirm').textContent = '📦 Exporter';
  document.getElementById('dialog-cancel').textContent = 'Annuler';
  openModal('dialog');

  document.getElementById('dialog-confirm').onclick = async () => {
    closeAllModals();
    await savePlaylist(name, tracks);
    const res = await exportPlaylist(name);
    if (res.ok) {
      showToast(`📦 Playlist "${name}" exportée — ${res.count} morceaux dans ${res.dir}`);
      if (res.fallback === 'copy') {
        showToast(`⚠️ ${res.warning || 'Copie physique utilisée'}`);
      }
    } else if (res.missing) {
      showToast(`❌ Fichiers manquants : ${res.missing.join(', ')}`);
    } else {
      showToast(`❌ Erreur : ${res.error || 'Export échoué'}`);
    }
  };
  document.getElementById('dialog-cancel').onclick = closeAllModals;
}

function moveTrackInPlaylist(direction) {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  const focused = document.querySelector('#playlist-tracks .focused');
  if (!focused) return;
  const index = Array.from(focused.parentNode.children).indexOf(focused);
  reorderTrack(name, index, index + direction);
  renderPlaylistPanel();
}

// Simple toast notification (disappears after 3s)
function showToast(msg) {
  const el = document.getElementById('status-text');
  el.textContent = msg;
  clearTimeout(el._toastTimer);
  el._toastTimer = setTimeout(() => {
    if (state.playlistMode) {
      el.textContent = '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.';
    }
  }, 3000);
}
```

- [ ] **Step 6: Commit**

```bash
git add templates/index.html static/script.js
git commit -m "feat(frontend): playlist mode toggle + keyboard routing"
```

---

### Task 4: Frontend — Rendu du panneau Playlist

**Files:**
- Modify: `static/render.js` — ajouter renderPlaylistPanel, renderPlaylistSource

**Interfaces:**
- Produces: DOM rendering for the playlist sidebar (tabs, track list, action buttons)

- [ ] **Step 1: Ajouter renderPlaylistPanel dans render.js**

```javascript
// ═══════════════════════════════════════════════════════════════════════════
// Playlist mode rendering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render the playlist sidebar: tabs, track list, action buttons.
 */
export function renderPlaylistPanel() {
  renderPlaylistTabs();
  renderPlaylistTracks();
}

function renderPlaylistTabs() {
  const container = document.getElementById('playlist-tabs');
  container.innerHTML = '';

  const allNames = new Set([
    ...state.playlists.map(p => p.name),
    ...Object.keys(state.pendingPlaylists)
  ]);

  let idx = 0;
  for (const name of allNames) {
    const tab = document.createElement('span');
    tab.className = 'pl-tab' + (idx === state.activePlaylistIndex ? ' active' : '');
    tab.textContent = name;

    // Exported badge
    const pl = state.playlists.find(p => p.name === name);
    if (pl?.exported) {
      const badge = document.createElement('span');
      badge.className = 'pl-tab-badge';
      badge.textContent = '✅';
      tab.appendChild(badge);
    }

    // Close button
    const closeBtn = document.createElement('span');
    closeBtn.className = 'pl-tab-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closePlaylistTab(name);
    };
    tab.appendChild(closeBtn);

    tab.onclick = async () => {
      // Sauvegarde automatique de l'onglet actif avant de switcher
      const oldName = getActivePlaylistName();
      const oldTracks = getPendingTracks(oldName);
      if (oldTracks.length > 0) {
        await savePlaylist(oldName, oldTracks);
      }
      state.activePlaylistIndex = idx;
      renderPlaylistPanel();
    };
    container.appendChild(tab);
    idx++;
  }

  // Add button
  const addBtn = document.createElement('span');
  addBtn.className = 'pl-tab-add';
  addBtn.textContent = '+';
  addBtn.title = 'Nouvelle playlist';
  addBtn.onclick = () => {
    const name = prompt('Nom de la nouvelle playlist :', `playlist-${Date.now()}`);
    if (name && name.trim()) {
      createNewPlaylist(name.trim());
      state.activePlaylistIndex = allNames.size; // will be correct after re-render
      renderPlaylistPanel();
    }
  };
  container.appendChild(addBtn);
}

function renderPlaylistTracks() {
  const container = document.getElementById('playlist-panel');
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name) || [];
  const savedPl = state.playlists.find(p => p.name === name);
  const trackCount = tracks.length;
  const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const isExported = savedPl?.exported;

  let html = `<div class="pl-info">${trackCount} morceaux`;
  if (totalDuration > 0) {
    const m = Math.floor(totalDuration / 60);
    const s = totalDuration % 60;
    html += ` — ${m}:${s.toString().padStart(2, '0')}`;
  }
  if (isExported) {
    html += ` — ✅ Exportée le ${savedPl.exported.slice(0, 10)}`;
  }
  html += '</div>';

  if (tracks.length === 0) {
    html += '<div class="pl-empty">Aucun morceau. Navigue dans Source Data et appuie sur Espace pour ajouter.</div>';
  } else {
    html += '<div id="playlist-tracks" class="pl-tracks">';
    tracks.forEach((track, i) => {
      html += `<div class="pl-track" draggable="true" data-index="${i}">`;
      html += `<span class="pl-drag-handle">⬍</span>`;
      html += `<span class="pl-track-name">${escapeHtml(track.filename)}</span>`;
      if (track.year) html += `<span class="pl-track-year">${escapeHtml(track.year)}</span>`;
      if (track.codec) html += `<span class="pl-track-codec">${escapeHtml(track.codec)}</span>`;
      if (track.duration) {
        const m = Math.floor(track.duration / 60);
        const s = track.duration % 60;
        html += `<span class="pl-track-duration">${m}:${s.toString().padStart(2, '0')}</span>`;
      }
      html += `<span class="pl-track-remove" data-fullpath="${escapeHtml(track.fullPath)}">✕</span>`;
      html += '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;

  // Bind remove buttons
  container.querySelectorAll('.pl-track-remove').forEach(btn => {
    btn.onclick = () => {
      removeTrack(getActivePlaylistName(), btn.dataset.fullpath);
      renderPlaylistPanel();
    };
  });

  // Bind drag & drop events
  container.querySelectorAll('.pl-track').forEach(el => {
    el.ondragstart = (e) => {
      e.dataTransfer.setData('text/plain', el.dataset.index);
      el.classList.add('dragging');
    };
    el.ondragend = () => el.classList.remove('dragging');
    el.ondragover = (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    };
    el.ondragleave = () => el.classList.remove('drag-over');
    el.ondrop = (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = parseInt(el.dataset.index);
      reorderTrack(getActivePlaylistName(), fromIdx, toIdx);
      renderPlaylistPanel();
    };
  });
}

function closePlaylistTab(name) {
  const tracks = getPendingTracks(name);
  const savedPl = state.playlists.find(p => p.name === name);
  if (tracks.length > 0 && !savedPl?.exported) {
    if (!confirm(`Fermer la playlist "${name}" ? ${tracks.length} morceau(x) non exporté(s).`)) return;
  }
  removePendingPlaylist(name);
  // Switch to another tab if possible
  const keys = Object.keys(state.pendingPlaylists);
  state.activePlaylistIndex = Math.min(state.activePlaylistIndex || 0, keys.length - 1);
  renderPlaylistPanel();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render the Source Data tree inside the playlist layout.
 * Reuses the existing renderSource logic but targets a different container.
 * Also injects .in-playlist class for files already added.
 */
export function renderPlaylistSource() {
  const container = document.getElementById('playlist-source-container');
  container.innerHTML = '';
  state.sourceNodeMap.clear();

  // Build tree from state.sourceFiles (same logic as renderSource)
  const allTrees = [];
  let totalCount = 0;

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree = {};
    for (const [filename, data] of Object.entries(files)) {
      const parts = data.path.split('/');
      totalCount++;
      if (parts.length <= 1) continue;
      let current = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]] = current[parts[i]] || {};
      }
      (current['__files__'] = current['__files__'] || []).push({
        filename, relPath: data.path, year: data.year,
        duration: data.duration, codec: data.codec, baseDir: dirPath
      });
    }
    allTrees.push({ tree, dirPath });
  }

  const activeName = getActivePlaylistName();
  const pendingTracks = getPendingTracks(activeName);
  const inPlaylistPaths = new Set(pendingTracks.map(t => t.fullPath));

  for (const { tree, dirPath } of allTrees) {
    renderPlaylistDirTree(tree, container, dirPath, inPlaylistPaths);
  }

  document.getElementById('playlist-source-count').textContent =
    totalCount > 0 ? `(${totalCount.toLocaleString('fr')})` : '';
}

function renderPlaylistDirTree(node, container, basePath, inPlaylistPaths) {
  const dirNames = Object.keys(node).filter(k => k !== '__files__').sort();
  for (const name of dirNames) {
    const fullPath = basePath + '/' + name;
    const subNode = node[name];

    const dirEl = document.createElement('div');
    dirEl.className = 'directory';
    dirEl.dataset.dirpath = fullPath;
    dirEl.dataset.focuspath = fullPath;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    dirEl.appendChild(nameSpan);

    const files = subNode.__files__ || [];
    if (files.length > 0) {
      const countSpan = document.createElement('span');
      countSpan.className = 'dir-count';
      countSpan.textContent = `(${files.length})`;
      dirEl.appendChild(countSpan);
    }

    dirEl.onclick = () => togglePlaylistSourceDir(dirEl, subNode, fullPath, basePath, inPlaylistPaths);
    container.appendChild(dirEl);
    state.sourceNodeMap.set(fullPath, { node: subNode, baseDir: basePath });
  }
}

function togglePlaylistSourceDir(dirEl, node, fullPath, basePath, inPlaylistPaths) {
  const existingChildren = dirEl.querySelector('.children');
  if (existingChildren) {
    existingChildren.remove();
    dirEl.classList.remove('expanded');
    return;
  }
  dirEl.classList.add('expanded');
  const children = document.createElement('div');
  children.className = 'children';

  // Render subdirs
  const subNames = Object.keys(node).filter(k => k !== '__files__').sort();
  for (const name of subNames) {
    const subFullPath = fullPath + '/' + name;
    const subNode = node[name];
    const subDir = document.createElement('div');
    subDir.className = 'directory';
    subDir.dataset.dirpath = subFullPath;
    subDir.dataset.focuspath = subFullPath;
    subDir.textContent = name;
    const files = subNode.__files__ || [];
    if (files.length > 0) {
      const countSpan = document.createElement('span');
      countSpan.className = 'dir-count';
      countSpan.textContent = `(${files.length})`;
      subDir.appendChild(countSpan);
    }
    subDir.onclick = () => togglePlaylistSourceDir(subDir, subNode, subFullPath, basePath, inPlaylistPaths);
    children.appendChild(subDir);
    state.sourceNodeMap.set(subFullPath, { node: subNode, baseDir: basePath });
  }

  // Render files
  for (const f of (node.__files__ || [])) {
    const row = makeFileEl(f.filename, f.relPath, 'doublon', basePath + '/' + f.relPath, f.year, f.duration, f.codec);
    const label = row.querySelector('.file');
    label.dataset.fullpath = basePath + '/' + f.relPath;
    if (inPlaylistPaths.has(basePath + '/' + f.relPath)) {
      label.classList.add('in-playlist');
    }
    row.dataset.focuspath = basePath + '/' + f.relPath;
    children.appendChild(row);
  }

  dirEl.appendChild(children);
}
```

- [ ] **Step 2: Ajouter le style CSS pour le mode Playlist dans style.css**

```css
/* ===== Playlist Mode Layout =========================================== */
#playlist-layout { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
#playlist-main { display: flex; flex: 1; overflow: hidden; }
#playlist-source { flex: 1; overflow-y: auto; padding: 10px; border-right: 1px solid var(--border-panel); }
#playlist-source h2 { font-size: 15px; font-weight: 600; margin-bottom: 10px; border-bottom: 1px solid var(--border-panel); }
#playlist-sidebar { width: 340px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; padding: 10px; }

/* Tabs */
#playlist-tabs { display: flex; gap: 2px; margin-bottom: 8px; flex-wrap: wrap; }
.pl-tab {
  padding: 3px 8px; font-size: 12px; cursor: pointer;
  background: var(--bg-hover); color: var(--text-secondary);
  border: 1px solid var(--border-panel); border-radius: 3px 3px 0 0;
  display: flex; align-items: center; gap: 4px;
}
.pl-tab.active { background: var(--bg-focus); color: var(--accent); border-color: var(--border-active); }
.pl-tab-close {
  font-size: 11px; color: var(--text-muted); cursor: pointer; margin-left: 4px;
  padding: 0 2px; border-radius: 2px;
}
.pl-tab-close:hover { color: var(--led-red); background: var(--bg-hover); }
.pl-tab-add {
  padding: 3px 10px; font-size: 15px; cursor: pointer;
  color: var(--accent); background: var(--bg-hover);
  border: 1px dashed var(--border-panel); border-radius: 3px;
}
.pl-tab-add:hover { background: var(--bg-focus); border-color: var(--border-active); }
.pl-tab-badge { font-size: 9px; }

/* Track list */
#playlist-panel { flex: 1; overflow-y: auto; }
.pl-info { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.pl-empty { font-size: 13px; color: var(--text-dim); padding: 20px 10px; text-align: center; }
.pl-tracks { display: flex; flex-direction: column; gap: 1px; }

.pl-track {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 4px; font-size: 13px;
  cursor: default; border-radius: 2px;
}
.pl-track:hover { background: var(--bg-hover); }
.pl-track.focused { background: var(--bg-focus); outline: 1px solid var(--border-focus); }
.pl-track.dragging { opacity: 0.4; }
.pl-track.drag-over { border-top: 2px solid var(--accent); }

.pl-drag-handle { color: var(--text-dim); cursor: grab; padding: 0 2px; font-size: 14px; }
.pl-drag-handle:hover { color: var(--text-secondary); }
.pl-track-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-track-year { font-size: 12px; color: var(--text-muted); }
.pl-track-codec { font-size: 11px; color: var(--text-dim); }
.pl-track-duration { font-size: 12px; color: var(--text-secondary); min-width: 36px; text-align: right; }
.pl-track-remove { color: var(--text-muted); cursor: pointer; padding: 0 4px; font-size: 12px; }
.pl-track-remove:hover { color: var(--led-red); }

/* Action buttons */
#playlist-actions { display: flex; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border-panel); }
#playlist-actions button {
  flex: 1; padding: 5px 10px; cursor: pointer;
  font-size: 13px; border-radius: 3px; border: 1px solid var(--border-panel);
  background: var(--bg-hover); color: var(--text-secondary);
}
#playlist-actions button:hover { background: var(--bg-focus); color: var(--text-primary); }
#pl-save { border-color: var(--accent); color: var(--accent); }
#pl-save:hover { background: var(--border-emph); }
#pl-export { border-color: var(--accent-green); color: var(--accent-green); }
#pl-export:hover { background: rgba(0, 255, 136, 0.1); }

/* In-playlist indicator (file in Source tree that's been added) */
.file.in-playlist::after {
  content: ' ✅'; font-size: 10px; color: var(--led-green);
}
```

- [ ] **Step 3: Ajouter les imports manquants dans render.js**

En haut de render.js :

```javascript
import { createNewPlaylist, getPendingTracks, addTrack, removeTrack, reorderTrack, removePendingPlaylist } from './playlist.js';
```

- [ ] **Step 4: Commit**

```bash
git add static/render.js static/style.css
git commit -m "feat(frontend): playlist panel rendering with tabs, drag-drop, source tree"
```

---

### Task 5: Frontend — Modal Gestionnaire de playlists

**Files:**
- Modify: `templates/index.html` — ajouter `modal-playlists`
- Modify: `static/script.js` — bind du bouton Gérer
- Modify: `static/style.css` — styles gestionnaire

- [ ] **Step 1: Ajouter la modale de gestion dans index.html**

```html
<!-- Playlist manager modal -->
<div id="modal-playlists" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content">
    <div class="modal-header">
      <h3>🎵 Gestionnaire de playlists</h3>
      <button class="modal-close" data-modal="playlists">✕</button>
    </div>
    <div id="pl-manager-content">
      <!-- Rempli dynamiquement -->
    </div>
  </div>
</div>
```

- [ ] **Step 2: Ajouter la fonction renderPlaylistManager dans render.js**

```javascript
export function renderPlaylistManager() {
  const container = document.getElementById('pl-manager-content');
  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim)">Aucune playlist. Créez-en une depuis le mode Playlist.</div>';
    return;
  }

  const allNames = new Set([
    ...state.playlists.map(p => p.name),
    ...Object.keys(state.pendingPlaylists)
  ]);

  let html = '<table id="pl-manager-table"><thead><tr><th>Playlist</th><th>Morceaux</th><th>Durée</th><th>Export</th><th>Actions</th></tr></thead><tbody>';
  for (const name of allNames) {
    const saved = state.playlists.find(p => p.name === name);
    const pendingTracks = getPendingTracks(name);
    const tracks = saved?.tracks || pendingTracks || [];
    const count = tracks.length;
    const duration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const durStr = duration > 0 ? `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : '—';
    const exported = saved?.exported ? `✅ ${saved.exported.slice(0, 10)}` : '❌';

    html += `<tr>`;
    html += `<td>${escapeHtml(name)}</td>`;
    html += `<td>${count}</td>`;
    html += `<td>${durStr}</td>`;
    html += `<td>${exported}</td>`;
    html += `<td class="pl-mgr-actions">`;
    html += `<button class="pl-mgr-load" data-name="${escapeHtml(name)}">Charger</button>`;
    html += `<button class="pl-mgr-rename" data-name="${escapeHtml(name)}">Renommer</button>`;
    html += `<button class="pl-mgr-delete" data-name="${escapeHtml(name)}">Supprimer</button>`;
    html += `</td>`;
    html += `</tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;

  // Bind actions
  container.querySelectorAll('.pl-mgr-load').forEach(btn => {
    btn.onclick = () => {
      closeAllModals();
      // Load this playlist into pending state
      const name = btn.dataset.name;
      const saved = state.playlists.find(p => p.name === name);
      if (saved) {
        setPendingTracks(name, [...saved.tracks]);
      }
      if (!state.playlistMode) enterPlaylistMode();
      state.activePlaylistIndex = Array.from(
        new Set([...state.playlists.map(p => p.name), ...Object.keys(state.pendingPlaylists)])
      ).indexOf(name);
      renderPlaylistPanel();
    };
  });

  container.querySelectorAll('.pl-mgr-rename').forEach(btn => {
    btn.onclick = async () => {
      const oldName = btn.dataset.name;
      const newName = prompt('Nouveau nom :', oldName);
      if (newName && newName.trim() && newName !== oldName) {
        const saved = state.playlists.find(p => p.name === oldName);
        if (saved) {
          // Save with new name, delete old
          await savePlaylist(newName.trim(), saved.tracks);
          await deletePlaylist(oldName);
          // Move pending tracks too
          const pending = getPendingTracks(oldName);
          if (pending.length > 0) {
            setPendingTracks(newName.trim(), pending);
            removePendingPlaylist(oldName);
          }
          renderPlaylistManager();
        }
      }
    };
  });

  container.querySelectorAll('.pl-mgr-delete').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      if (!confirm(`Supprimer la playlist "${name}" ?\n(Cette action ne supprime pas les fichiers exportés.)`)) return;
      await deletePlaylist(name);
      removePendingPlaylist(name);
      renderPlaylistManager();
      renderPlaylistPanel();
    };
  });
}
```

- [ ] **Step 3: Ajouter le bouton « Gérer » dans l'interface Playlist**

Dans `index.html`, dans `#playlist-actions`, ajouter avant ou après les boutons existants :

```html
<button id="pl-manage">📋 Gérer</button>
```

Dans `script.js` :

```javascript
document.getElementById('pl-manage').onclick = () => {
  renderPlaylistManager();
  openModal('playlists');
};
```

- [ ] **Step 4: Commit**

```bash
git add templates/index.html static/render.js static/script.js static/style.css
git commit -m "feat(frontend): playlist manager modal (load/rename/delete)"
```

---

### Task 6: Tests frontend + intégration

**Files:**
- Ajouter: `static/playlist.test.js`

- [ ] **Step 1: Écrire les tests unitaires pour playlist.js**

```javascript
// static/playlist.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from './state.js';
import {
  getPendingTracks, setPendingTracks,
  addTrack, removeTrack, reorderTrack,
  createNewPlaylist, removePendingPlaylist
} from './playlist.js';

describe('playlist pending state', () => {
  beforeEach(() => {
    state.pendingPlaylists = {};
  });

  it('creates a new empty playlist', () => {
    createNewPlaylist('test-pl');
    expect(getPendingTracks('test-pl')).toEqual([]);
  });

  it('adds a track', () => {
    createNewPlaylist('pl');
    const track = { filename: 'song.mp3', fullPath: '/a/song.mp3', relPath: 'song.mp3' };
    const added = addTrack('pl', track);
    expect(added).toBe(true);
    expect(getPendingTracks('pl')).toHaveLength(1);
  });

  it('refuses duplicate tracks', () => {
    createNewPlaylist('pl');
    const track = { filename: 'song.mp3', fullPath: '/a/song.mp3', relPath: 'song.mp3' };
    addTrack('pl', track);
    const added = addTrack('pl', track);
    expect(added).toBe(false);
    expect(getPendingTracks('pl')).toHaveLength(1);
  });

  it('removes a track', () => {
    createNewPlaylist('pl');
    const track = { filename: 'song.mp3', fullPath: '/a/song.mp3', relPath: 'song.mp3' };
    addTrack('pl', track);
    removeTrack('pl', track.fullPath);
    expect(getPendingTracks('pl')).toHaveLength(0);
  });

  it('reorders tracks', () => {
    createNewPlaylist('pl');
    addTrack('pl', { filename: 'A', fullPath: '/a', relPath: 'a' });
    addTrack('pl', { filename: 'B', fullPath: '/b', relPath: 'b' });
    addTrack('pl', { filename: 'C', fullPath: '/c', relPath: 'c' });
    reorderTrack('pl', 0, 2);
    const tracks = getPendingTracks('pl');
    expect(tracks[0].filename).toBe('B');
    expect(tracks[1].filename).toBe('C');
    expect(tracks[2].filename).toBe('A');
  });

  it('removes a pending playlist', () => {
    createNewPlaylist('pl');
    addTrack('pl', { filename: 'A', fullPath: '/a', relPath: 'a' });
    removePendingPlaylist('pl');
    expect(state.pendingPlaylists).toEqual({});
  });
});
```

- [ ] **Step 2: Exécuter les tests frontend**

```bash
cd /home/giak/projects/audio-sync-tool
./node_modules/.bin/vitest run static/playlist.test.js
```

Expected: All tests pass.

- [ ] **Step 3: Exécuter les tests frontend**

```bash
cd /home/giak/projects/audio-sync-tool
./node_modules/.bin/vitest run static/playlist.test.js
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add static/playlist.test.js
git commit -m "test: playlist unit tests"
```

---

### Task 7: Test d'intégration — checklist de smoke test

**Objectif** : Valider manuellement tous les cas nominaux et edge cases de la spec (section 6) dans le navigateur.

**Prérequis** :
- Serveur lancé : `cd /home/giak/projects/audio-sync-tool && ./venv/bin/python app.py`
- Navigateur ouvert sur `http://localhost:8765`
- Source Data configuré et scanné (au moins 2-3 fichiers)

- [ ] **Cas 1 — Entrée en mode Playlist**
  1. Cliquer « 🎵 Playlist » dans la toolbar
  2. ✅ La vue normale (Éparpillé + Source Data) est masquée
  3. ✅ Source Data apparaît à gauche, panneau playlist vide à droite
  4. ✅ Un onglet par défaut « playlist-1 » est créé
  5. ✅ La barre de statut affiche « 🎵 Mode Playlist — Espace pour ajouter/retirer… »
  6. ✅ Re-cliquer « 🎵 Playlist » → sauvegarde auto + retour à la vue normale

- [ ] **Cas 2 — Ajout/retrait de morceaux**
  1. Déplier un dossier dans Source Data (clic)
  2. Focus sur un fichier (↑↓)
  3. **Espace** → ✅ le fichier apparaît dans le panneau playlist
  4. ✅ Un toast s'affiche : « ➕ filename.mp3 ajouté »
  5. ✅ Le fichier reçoit l'indicateur ✅ dans l'arborescence (`.in-playlist`)
  6. **Espace** à nouveau → ✅ le fichier disparaît du panneau
  7. ✅ Toast : « ➖ filename.mp3 retiré »
  8. ✅ L'indicateur ✅ disparaît

- [ ] **Cas 3 — Doublons (spec §6.2)**
  1. Ajouter un fichier à la playlist
  2. **Espace** sur le même fichier → ✅ retiré (pas de doublon, toggle)
  3. Ajouter deux fichiers différents → ✅ les deux apparaissent

- [ ] **Cas 4 — Multi-playlists (onglets, spec §3.3)**
  1. Cliquer « + » → prompt : nommer « set-a »
  2. Ajouter 2 fichiers à « set-a »
  3. Cliquer « + » → nommer « set-b »
  4. Ajouter 3 fichiers à « set-b »
  5. Cliquer sur l'onglet « set-a » → ✅ les 2 fichiers sont toujours là (sauvegarde auto au switch)
  6. ✅ La barre de statut ne change pas (pas d'erreur)

- [ ] **Cas 5 — Réordonnancement (spec §3.4)**
  1. Ajouter 3 fichiers (A, B, C) à une playlist
  2. Faire glisser C avant A (drag & drop) → ✅ l'ordre devient C, A, B
  3. **Ctrl+↑** sur B → ✅ l'ordre devient C, B, A
  4. **Ctrl+↓** sur C → ✅ l'ordre devient B, C, A

- [ ] **Cas 6 — Retrait par clavier (spec §3.4)**
  1. Ajouter 2 fichiers à une playlist
  2. **Tab** → focus sur le panneau playlist (sidebar actif)
  3. **↑↓** → naviguer dans la playlist
  4. **Suppr** → ✅ le fichier survolé est retiré
  5. **Backspace** → ✅ idem

- [ ] **Cas 7 — Sauvegarde (spec §3.5)**
  1. Ajouter des fichiers
  2. **Ctrl+S** → ✅ toast : « 💾 Playlist "x" sauvegardée (3 morceaux) »
  3. Ouvrir le gestionnaire → ✅ la playlist apparaît dans la liste
  4. Recharger la page → cliquer « 🎵 Playlist » → ✅ les playlists sont restaurées depuis le serveur

- [ ] **Cas 8 — Export réussi (spec §3.6, §6.4)**
  1. Ajouter des fichiers et sauvegarder
  2. **Ctrl+E** → ✅ modale de confirmation avec le nom et le nombre de morceaux
  3. Cliquer « Exporter » → ✅ toast : « 📦 Playlist exportée — N morceaux dans _playlists/… »
  4. Vérifier dans le terminal : le dossier `_playlists/<name>` existe
  5. ✅ Les fichiers sont des hard links (même inode que les originaux)
  6. L'onglet affiche le badge ✅ Exporté
  7. **Ctrl+E** à nouveau → ✅ la modale mentionne « l'export précédent sera écrasé »
  8. Confirmer → ✅ l'export est remplacé (les hard links sont recréés)

- [ ] **Cas 9 — Export avec fichiers manquants (spec §6.1)**
  1. Ajouter un fichier à une playlist
  2. Supprimer le fichier original depuis le terminal : `rm /chemin/vers/fichier.mp3`
  3. **Ctrl+E** → ✅ le serveur retourne 409 avec la liste des fichiers manquants
  4. ✅ Toast : « ❌ Fichiers manquants : fichier.mp3 »
  5. Remettre le fichier ou le retirer de la playlist → ✅ l'export redevient possible

- [ ] **Cas 10 — Export vide**
  1. Créer une nouvelle playlist (vide)
  2. **Ctrl+E** → ✅ toast : « ⚠️ Playlist vide, rien à exporter »

- [ ] **Cas 11 — Filtre Source Data (F7, spec §4.4)**
  1. En mode Playlist, appuyer sur **F7** ou **/** → ✅ la palette de filtre apparaît
  2. Taper un nom de dossier → ✅ l'arborescence est filtrée
  3. **Échap** → ✅ le filtre se ferme

- [ ] **Cas 12 — Lecture audio (spec §3.2)**
  1. En mode Playlist, **Entrée** sur un fichier → ✅ le lecteur audio en bas joue le morceau
  2. Le comportement est inchangé par rapport au mode normal

- [ ] **Cas 13 — Gestionnaire de playlists (spec §3.7)**
  1. Cliquer « 📋 Gérer » → ✅ modale liste toutes les playlists avec leurs stats
  2. Cliquer **Charger** → ✅ bascule en mode Playlist avec cette playlist chargée
  3. Cliquer **Renommer** → prompt, nouveau nom → ✅ le manifest est mis à jour
  4. Cliquer **Supprimer** → confirmation → ✅ le manifest est supprimé
  5. ✅ Les hard links exportés ne sont PAS supprimés (vérifier dans le terminal)

- [ ] **Cas 14 — Mode normal préservé**
  1. Quitter le mode Playlist (Échap)
  2. ✅ L'interface normale (Éparpillé + Source Data) fonctionne parfaitement
  3. ✅ F5 (copie), Scan, Config, Journal — tout est inchangé

- [ ] **Cas 15 — Nom existant (spec §6.3)**
  1. Sauvegarder une playlist « test »
  2. Créer une nouvelle playlist « test » et essayer de sauvegarder
  3. ✅ Le POST /playlists écrase silencieusement (le frontend peut éventuellement demander confirmation)

- [ ] **Cas 16 — Cross-device fallback (spec §6.5)**
  1. (Testable uniquement si un second filesystem est disponible, ex: clé USB)
  2. Configurer Source Data sur disque A, exporter vers `_playlists/` sur disque B
  3. ✅ L'export utilise `shutil.copy2` en fallback
  4. ✅ Toast : « ⚠️ Copie physique utilisée (disques différents) »

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Routes playlist CRUD | Task 1, Step 3 |
| Route export (hard links) | Task 1, Step 3 |
| Cross-device fallback | Task 1, Step 3 |
| Vérification fichiers manquants | Task 1, Step 3 |
| Tests backend | Task 1, Step 2 |
| Module playlist.js (CRUD, drag state) | Task 2, Step 2 |
| Bouton Playlist + bascule mode | Task 3, Step 3 |
| Routage clavier mode Playlist (Space, Ctrl+S, Ctrl+E, Tab, Ctrl+↑↓) | Task 3, Step 4-5 |
| Toast notifications | Task 3, Step 5 |
| Panneau playlist (tabs, tracks, drag-drop) | Task 4, Step 1 |
| Arborescence Source Data réutilisée | Task 4, Step 1 |
| Styles CSS playlist | Task 4, Step 2 |
| Indicateur in-playlist (✅) | Task 4, Step 2 |
| Gestionnaire de playlists (modale) | Task 5, Step 1-3 |
| Tests frontend | Task 6, Step 1-2 |
| Sauvegarde auto sur sortie | Task 3, Step 3 |
| Sauvegarde auto sur changement onglet | Task 4, Step 1 (renderPlaylistTabs → auto-save) |
