import os
import json
import math
import shutil
import multiprocessing
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_file, abort
import nml as nml_module
from xml.etree import ElementTree as ET

try:
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_PATH = os.path.join(DATA_DIR, 'config.json')
JOURNAL_PATH = os.path.join(DATA_DIR, 'journal.json')
CACHE_PATH = os.path.join(DATA_DIR, 'cache.json')
PLAYLISTS_PATH = os.path.join(DATA_DIR, 'playlists.json')
RATINGS_PATH = os.path.join(DATA_DIR, 'ratings.json')


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


MUSIC_EXTENSIONS = ('.mp3', '.flac', '.wav', '.ogg', '.m4a', '.wma')

# ── Scan progress tracking ────────────────────────────────────────────────
_scan_progress = {
    'running': False,
    'phase': '',
    'current': 0,
    'total': 0,
    'current_dir': '',
}


def reset_scan_progress():
    _scan_progress['running'] = True
    _scan_progress['phase'] = ''
    _scan_progress['current'] = 0
    _scan_progress['total'] = 0
    _scan_progress['current_dir'] = ''


def update_scan_progress(phase, current_dir, current, total):
    _scan_progress['phase'] = phase
    _scan_progress['current_dir'] = current_dir
    _scan_progress['current'] = current
    _scan_progress['total'] = total


@app.route('/scan-progress')
def scan_progress():
    return jsonify(_scan_progress)


def get_audio_meta(path):
    """Return (year, duration_seconds, codec_str)."""
    year = None
    duration = None
    codec = os.path.splitext(path)[1].lower()[1:].upper()
    if not HAS_MUTAGEN:
        return year, duration, codec
    try:
        audio = MutagenFile(path, easy=False)
        if audio is None:
            return year, duration, codec
        if hasattr(audio.info, 'length') and audio.info.length is not None:
            duration = round(audio.info.length)
        if hasattr(audio.info, 'bitrate') and audio.info.bitrate:
            codec = f'{codec} {audio.info.bitrate // 1000}kbps'
        # ID3 tags (MP3)
        if hasattr(audio, 'tags') and audio.tags:
            for tag in ('TDRC', 'TYER', 'TORY'):
                val = audio.tags.get(tag)
                if val:
                    year = str(val)[:4]
                    break
        # FLAC / Vorbis
        if year is None and hasattr(audio, 'get'):
            for tag in ('DATE', 'YEAR'):
                val = audio.get(tag)
                if val and val[0]:
                    year = str(val[0])[:4]
                    break
    except Exception:
        pass
    return year, duration, codec


def log_journal(entry):
    """Append an entry to the journal."""
    journal = load_json(JOURNAL_PATH, [])
    journal.append(entry)
    save_json(JOURNAL_PATH, journal)


@app.route('/config', methods=['GET', 'POST'])
def config():
    cfg = load_json(CONFIG_PATH, {'active': 0, 'configs': []})
    if request.method == 'POST':
        if request.json is None:
            return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400

        # Only invalidate cache if the active config's paths actually changed
        old_active = get_active_config() if os.path.exists(CACHE_PATH) else None
        save_json(CONFIG_PATH, request.json)
        new_active = get_active_config()
        if old_active and (
            old_active.get('source_data') != new_active.get('source_data') or
            set(old_active.get('epars_dirs', [])) != set(new_active.get('epars_dirs', []))
        ):
            if os.path.exists(CACHE_PATH):
                os.remove(CACHE_PATH)

        active_cfg = request.json.get('configs', [{}])
        idx = request.json.get('active', 0)
        name = active_cfg[idx].get('name', '?') if idx < len(active_cfg) else '?'
        log_journal({
            'timestamp': datetime.now().isoformat(),
            'action': 'Config sauvegardée',
            'details': f'Profil : {name}',
            'status': 'config'
        })
        return jsonify({'ok': True})
    return jsonify(cfg)


@app.route('/')
def index():
    # Cache-buster: use dist script.js mtime so browser always gets fresh JS/CSS
    script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static', 'dist', 'script.js')
    cache_buster = str(int(os.path.getmtime(script_path))) if os.path.exists(script_path) else '1'
    return render_template('index.html', cache_buster=cache_buster)


@app.route('/ping')
def ping():
    return jsonify({'ok': True, 'timestamp': datetime.now().isoformat()})


def _scan_file(full_path, rel_path):
    """Worker function — called in child process (must be top-level for pickle)."""
    filename = os.path.basename(full_path)
    year, duration, codec = get_audio_meta(full_path)
    return (filename, {'path': rel_path, 'year': year, 'duration': duration, 'codec': codec})


def index_files(directory, phase_label='source'):
    index = {}
    if not os.path.isdir(directory):
        return index

    # Collect file list
    tasks = []
    for root, dirs, files in os.walk(directory):
        for f in files:
            if f.lower().endswith(MUSIC_EXTENSIONS):
                full_path = os.path.join(root, f)
                rel = os.path.relpath(root, directory)
                rel_path = os.path.join(rel, f) if rel != '.' else f
                tasks.append((full_path, rel_path))

    total = len(tasks)
    update_scan_progress(phase_label, '🔍 Indexation…', 0, total)

    # Sequential fallback for small libraries — process pool overhead not worth it
    if total < 100:
        current = 0
        for full_path, rel_path in tasks:
            current += 1
            filename, entry = _scan_file(full_path, rel_path)
            index[filename] = entry
            if current % 10 == 0 or current == total:
                update_scan_progress(phase_label, filename, current, total)
        return index

    # Parallel scan via ProcessPoolExecutor
    workers = max(1, multiprocessing.cpu_count() - 1)
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_scan_file, full_path, rel_path) for full_path, rel_path in tasks]
        current = 0
        for future in as_completed(futures):
            filename, entry = future.result()
            index[filename] = entry
            current += 1
            if current % 10 == 0 or current == total:
                update_scan_progress(phase_label, filename, current, total)
    return index


def get_active_config():
    cfg = load_json(CONFIG_PATH, {'active': 0, 'configs': []})
    configs = cfg.get('configs', [])
    idx = cfg.get('active', 0)
    if configs and 0 <= idx < len(configs):
        return configs[idx]
    return {'source_data': '', 'epars_dirs': []}


def get_traktor_nml_path():
    cfg = get_active_config()
    return cfg.get('traktor_nml_path', '')


def get_nml_index():
    """Retourne (tree, index, nml_path) ou (None, {}, '') si non configuré/invalide."""
    path = get_traktor_nml_path()
    if not path or not os.path.exists(path):
        return None, {}, path or ''
    try:
        tree = nml_module.load_nml(path)
        return tree, nml_module.build_index(tree), path
    except ET.ParseError:
        return None, {}, path


@app.route('/api/nml/status')
def nml_status():
    path = get_traktor_nml_path()
    if not path or not os.path.exists(path):
        return jsonify({'configured': False, 'path': path or '', 'lastModified': None})
    mtime = os.path.getmtime(path)
    return jsonify({'configured': True, 'path': path, 'lastModified': mtime})


@app.route('/api/track/match')
def track_match():
    local = request.args.get('path', '')
    if not local or not os.path.exists(local):
        return jsonify({'ok': False, 'error': 'fichier introuvable'}), 404
    tree, idx, nml_path = get_nml_index()
    if not tree:
        return jsonify({'ok': False, 'error': 'NML non configuré ou invalide'}), 400
    filename = os.path.basename(local)
    filesize = str(os.path.getsize(local))
    hits = idx.get((filename, filesize), [])
    entries = []
    for e in hits:
        meta = nml_module.get_entry_meta(e)
        entries.append({**meta, 'cues': nml_module.get_cues(e)})
    return jsonify({'ok': True, 'entries': entries, 'multiple': len(entries) > 1})


@app.route('/scan')
def scan():
    active = get_active_config()
    source_dir = active.get('source_data', '')
    epars_dirs = active.get('epars_dirs', [])

    reset_scan_progress()

    result = {
        'source': {},
        'epars': {}
    }
    if source_dir:
        result['source'][source_dir] = index_files(source_dir, 'Source Data')
    for d in epars_dirs:
        result['epars'][d] = index_files(d, 'Éparpillé')

    _scan_progress['running'] = False
    save_json(CACHE_PATH, result)

    src_count = sum(len(v) for v in result['source'].values())
    epars_count = sum(len(v) for v in result['epars'].values())
    dirs_count = len(result['epars'])
    log_journal({
        'timestamp': datetime.now().isoformat(),
        'action': 'Scan terminé',
        'details': f'{src_count} fichiers source, {epars_count} fichiers épars ({dirs_count} dossier{"s" if dirs_count > 1 else ""})',
        'status': 'scan'
    })

    return jsonify(result)


@app.route('/load')
def load_cached():
    return jsonify(load_json(CACHE_PATH, {'source': {}, 'epars': {}}))


@app.route('/copy', methods=['POST'])
def copy_file():
    def _resp(ok, **kw):
        """Build consistent response with metadata when available."""
        src = kw.pop('_src', None)
        if src and os.path.exists(src):
            year, duration, codec = get_audio_meta(src)
        else:
            year = duration = codec = None
        return jsonify({'ok': ok, 'year': year, 'duration': duration, 'codec': codec, **kw})

    data = request.json
    if data is None:
        return _resp(False, error='Request body must be JSON'), 400
    for key in ('source_path', 'dest_dir', 'filename'):
        if key not in data:
            return _resp(False, error=f'Missing required key: {key}'), 400
    src = data['source_path']
    dst_dir = data['dest_dir']
    filename = os.path.basename(data['filename'])

    if not os.path.exists(src):
        return _resp(False, _src=src, error='Source file not found'), 404

    dst = os.path.join(dst_dir, filename)
    os.makedirs(dst_dir, exist_ok=True)
    try:
        shutil.copy2(src, dst)
    except (OSError, shutil.SameFileError) as e:
        return _resp(False, _src=src, error=str(e)), 500

    log_journal({
        'timestamp': datetime.now().isoformat(),
        'source': src,
        'destination': dst,
        'filename': filename,
        'status': 'copied'
    })

    # Update cache so /load reflects the new file on refresh
    cache = load_json(CACHE_PATH)
    if cache:
        year, duration, codec = get_audio_meta(dst)
        for source_dir in list(cache.get('source', {}).keys()):
            if dst_dir == source_dir or dst_dir.startswith(source_dir.rstrip('/') + '/'):
                rel = os.path.relpath(dst_dir, source_dir) if dst_dir != source_dir else '.'
                rel_path = os.path.join(rel, filename) if rel != '.' else filename
                cache['source'][source_dir][filename] = {
                    'path': rel_path, 'year': year, 'duration': duration, 'codec': codec
                }
                save_json(CACHE_PATH, cache)
                break

    return _resp(True, _src=dst)


@app.route('/delete', methods=['POST'])
def delete_file():
    """Delete a file from the source data directory + clean cache + log."""
    data = request.json
    if data is None:
        return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400

    path = data.get('path', '')
    if not path:
        return jsonify({'ok': False, 'error': 'Missing required key: path'}), 400

    if not os.path.exists(path):
        return jsonify({'ok': False, 'error': 'File not found'}), 404

    if not is_path_allowed(path):
        return jsonify({'ok': False, 'error': 'Path not within allowed directories'}), 403

    filename = os.path.basename(path)
    parent_dir = os.path.dirname(path)

    try:
        os.remove(path)
    except OSError as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

    log_journal({
        'timestamp': datetime.now().isoformat(),
        'action': 'Fichier supprimé',
        'details': f'{path}',
        'filename': filename,
        'status': 'deleted'
    })

    # Remove from cache
    cache = load_json(CACHE_PATH)
    if cache:
        for source_dir in list(cache.get('source', {}).keys()):
            if parent_dir == source_dir or parent_dir.startswith(source_dir.rstrip('/') + '/'):
                cache['source'][source_dir].pop(filename, None)
                save_json(CACHE_PATH, cache)
                break

    return jsonify({'ok': True, 'filename': filename})


@app.route('/journal')
def journal():
    return jsonify(load_json(JOURNAL_PATH, []))


AUDIO_EXT_MAP = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wma': 'audio/x-ms-wma',
}


# ── Path traversal protection ─────────────────────────────────────────────

def get_allowed_dirs():
    """Return set of realpaths for all directories the user is allowed to read."""
    active = get_active_config()
    candidates = []
    source = active.get('source_data', '')
    if source:
        candidates.append(source)
    candidates.extend(active.get('epars_dirs', []))
    allowed = set()
    for d in candidates:
        try:
            allowed.add(os.path.realpath(d))
        except OSError:
            pass
    return allowed


def is_path_allowed(path):
    """Check path is within allowed directories — prevents path traversal (CWE-22)."""
    if not path:
        return False
    try:
        real = os.path.realpath(path)
    except OSError:
        return False
    for base in get_allowed_dirs():
        if real == base or real.startswith(base + os.sep):
            return True
    return False


@app.route('/audio')
def serve_audio():
    path = request.args.get('path', '')
    if not path or not os.path.exists(path) or not is_path_allowed(path):
        abort(404)
    ext = os.path.splitext(path)[1].lower()
    mimetype = AUDIO_EXT_MAP.get(ext, 'application/octet-stream')
    return send_file(path, mimetype=mimetype)


# ── Ratings routes ─────────────────────────────────────────────────────────


@app.route('/ratings', methods=['GET', 'PUT'])
def ratings():
    if request.method == 'PUT':
        data = request.json
        if not data or not isinstance(data, dict):
            return jsonify({'ok': False, 'error': 'Body must be a JSON object'}), 400

        ratings_data = load_json(RATINGS_PATH, {})

        for path, value in data.items():
            if value is None:
                ratings_data.pop(path, None)
            elif not isinstance(value, int) or value < 0 or value > 100:
                return jsonify({'ok': False, 'error': f'Valeur invalide pour {path}: {value}'}), 400
            else:
                ratings_data[path] = value

        save_json(RATINGS_PATH, ratings_data)
        return jsonify({'ok': True})

    return jsonify(load_json(RATINGS_PATH, {}))


# ── Playlist routes ────────────────────────────────────────────────────────


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

    # Determine output directory under source data
    cfg = get_active_config()
    source_base = cfg.get('source_data', '')
    if not source_base:
        return jsonify({'ok': False, 'error': 'Aucun dossier source configuré'}), 400

    # Check all source files still exist
    missing = []
    for track in pl['tracks']:
        if not os.path.exists(track['fullPath']):
            missing.append(track['filename'])

    if missing:
        return jsonify({'ok': False, 'missing': missing}), 409

    pl_dir = os.path.join(source_base, '_playlists', name)
    os.makedirs(pl_dir, exist_ok=True)

    # Create hard links (fall back to copy2 on cross-device)
    fallback = False
    for track in pl['tracks']:
        src = track['fullPath']
        dst = os.path.join(pl_dir, track['filename'])
        if os.path.exists(dst):
            os.remove(dst)  # overwrite existing
        try:
            os.link(src, dst)
        except OSError as e:
            if hasattr(e, 'errno') and e.errno == 18:  # EXDEV
                shutil.copy2(src, dst)
                fallback = True
            else:
                return jsonify({'ok': False, 'error': str(e)}), 500

    # Update manifest
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

    cfg = get_active_config()
    nml_path = cfg.get('traktor_nml_path', '')
    nml_out = None
    if nml_path and os.path.exists(nml_path):
        try:
            nml_out = nml_module.build_export_nml(
                pl['tracks'], nml_path,
                cfg.get('traktor_export_root', ''), cfg.get('traktor_export_volume', 'TRAKTOR_USB'))
        except (OSError, ET.ParseError) as exc:
            log_journal({'timestamp': datetime.now().isoformat(),
                         'action': 'Export NML échoué',
                         'details': str(exc), 'status': 'error'})
    if nml_out:
        result['nml'] = nml_out

    return jsonify(result)


@app.route('/playlists/<name>', methods=['PUT', 'DELETE'])
def update_or_delete_playlist(name):
    if request.method == 'PUT':
        data = request.json
        if not data or 'name' not in data:
            return jsonify({'ok': False, 'error': 'Missing required key: name'}), 400

        playlists_data = load_json(PLAYLISTS_PATH, [])
        pl = next((p for p in playlists_data if p['name'] == name), None)
        if not pl:
            return jsonify({'ok': False, 'error': 'Playlist introuvable'}), 404

        new_name = data['name']
        now = datetime.now().isoformat()

        new_pl = dict(pl)
        new_pl['name'] = new_name
        new_pl['updated'] = now

        playlists_data = [p for p in playlists_data if p['name'] != name]
        # Check if new name already exists
        existing = next((p for p in playlists_data if p['name'] == new_name), None)
        if existing:
            existing.update(new_pl)
            existing['created'] = existing.get('created', now)
        else:
            playlists_data.append(new_pl)

        save_json(PLAYLISTS_PATH, playlists_data)
        return jsonify({'ok': True, 'playlist': new_pl})

    # DELETE
    playlists_data = load_json(PLAYLISTS_PATH, [])
    pl = next((p for p in playlists_data if p['name'] == name), None)
    if not pl:
        return jsonify({'ok': False, 'error': 'Playlist introuvable'}), 404

    playlists_data = [p for p in playlists_data if p['name'] != name]
    save_json(PLAYLISTS_PATH, playlists_data)
    return jsonify({'ok': True})


@app.route('/api/track/cues', methods=['POST'])
def track_cues():
    data = request.json
    if not data or 'cues' not in data:
        return jsonify({'ok': False, 'error': 'cues manquant'}), 400
    filename = data.get('filename', '')
    filesize = data.get('filesize', '')
    if not filename:
        return jsonify({'ok': False, 'error': 'filename manquant'}), 400
    tree, idx, path = get_nml_index()
    if not tree:
        return jsonify({'ok': False, 'error': 'NML non configuré'}), 400
    hits = idx.get((filename, filesize))
    if not hits:
        return jsonify({'ok': False, 'error': 'ENTRY introuvable'}), 404
    sel = data.get('entry')
    if sel is None:
        if len(hits) > 1:
            infos = [nml_module.get_entry_meta(e) for e in hits]
            return jsonify({'ok': False, 'error': 'multiple', 'entries': infos}), 409
        entry = hits[0]
    else:
        try:
            entry = hits[int(sel)]
        except (ValueError, IndexError):
            return jsonify({'ok': False, 'error': 'entry invalide'}), 400
    cues = []
    for c in data['cues']:
        if not isinstance(c, dict) or not any(k in c for k in ('type', 'start')):
            return jsonify({'ok': False, 'error': 'cue invalide'}), 400
        # Validation serveur (audit B6) : type ∈ {0,5}, hotcue entier 0..7,
        # start/len numériques ≥ 0. Le client peut être défaillant (ancien bundle) ;
        # le serveur reste la ligne de défense contre un NML corrompu.
        cue_type = str(c.get('type', '0'))
        if cue_type not in ('0', '5'):
            return jsonify({'ok': False, 'error': f'type de cue invalide: {cue_type}'}), 400
        try:
            hotcue = float(c.get('hotcue', -1))
        except (TypeError, ValueError):
            return jsonify({'ok': False, 'error': 'hotcue non entier'}), 400
        if not hotcue.is_integer() or hotcue < 0 or hotcue > 7:
            return jsonify({'ok': False, 'error': f'hotcue invalide: {c.get("hotcue")!r}'}), 400
        hotcue = int(hotcue)
        for key in ('start', 'len'):
            raw = c.get(key, '0')
            try:
                val = float(raw)
            except (TypeError, ValueError):
                return jsonify({'ok': False, 'error': f'{key} non numérique: {raw!r}'}), 400
            # isfinite : rejette aussi nan/inf qui passeraient `val < 0` (audit B6).
            if not math.isfinite(val) or val < 0:
                return jsonify({'ok': False, 'error': f'{key} invalide: {raw!r}'}), 400
        cues.append({'type': cue_type,
                     'start': str(c.get('start', '0.0')),
                     'len': str(c.get('len', '0.000000')),
                     'hotcue': hotcue,
                     'name': str(c.get('name', 'n.n.')),
                     'displ_order': str(c.get('displ_order', '0')),
                     'color': c.get('color', '')})
    nml_module.write_cues(entry, cues)
    try:
        nml_module.save_nml(path, tree)
    except OSError as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    log_journal({'timestamp': datetime.now().isoformat(),
                 'action': 'Cues/loops enregistrés',
                 'filename': filename, 'details': f'{len(cues)} cues',
                 'status': 'cues'})
    return jsonify({'ok': True})


if __name__ == '__main__':
    app.run(debug=True, threaded=True, port=8765)
