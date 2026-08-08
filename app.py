import os
import json
import math
import shutil
import multiprocessing
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_file, abort
import analysis as analysis_module
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
# Cache de grille par piste (EPIC-009) — fichier séparé du cache de scan :
# {bpm, phase, source} persistés entre sessions pour les pistes sans grille NML.
BEATGRID_PATH = os.path.join(DATA_DIR, 'beatgrids.json')


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


def get_audio_tags(path):
    """Tags audio (title, artist, album) + bitrate/playtime — fallback nom de fichier."""
    stem = os.path.splitext(os.path.basename(path))[0]
    title = stem
    artist = album = ''
    bitrate = None
    playtime = None
    if not HAS_MUTAGEN:
        return title, artist, album, bitrate, playtime
    try:
        audio = MutagenFile(path, easy=False)
        if audio is None:
            return title, artist, album, bitrate, playtime
        if hasattr(audio.info, 'length') and audio.info.length is not None:
            playtime = audio.info.length
        if hasattr(audio.info, 'bitrate') and audio.info.bitrate:
            bitrate = audio.info.bitrate
        tags = getattr(audio, 'tags', None)
        if tags:
            def first(*keys):
                for k in keys:
                    v = tags.get(k)
                    if v:
                        return str(v[0] if isinstance(v, (list, tuple)) else v)
                return ''
            title = first('TIT2', 'title', 'TITLE') or title
            artist = first('TPE1', 'artist', 'ARTIST')
            album = first('TALB', 'album', 'ALBUM')
    except Exception:
        pass
    return title, artist, album, bitrate, playtime


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
    # Aligné sur /audio, /delete, /api/track/add : la route lisait getsize() de
    # n'importe quel chemin existant hors des dossiers autorisés (fuite d'info,
    # CWE-22 faible). La piste provient toujours de source_data/epars_dirs.
    if not is_path_allowed(local):
        return jsonify({'ok': False, 'error': 'chemin hors des dossiers autorisés'}), 403
    tree, idx, nml_path = get_nml_index()
    if not tree:
        return jsonify({'ok': False, 'error': 'NML non configuré ou invalide'}), 400
    filename = os.path.basename(local)
    filesize = str(os.path.getsize(local))
    hits = idx.get((filename, filesize), [])
    entries = []
    for e in hits:
        meta = nml_module.get_entry_meta(e)
        entries.append({**meta, 'cues': nml_module.get_cues(e), 'grid': nml_module.get_beatgrid(e)})
    return jsonify({'ok': True, 'entries': entries, 'multiple': len(entries) > 1})


@app.route('/api/track/add', methods=['POST'])
def track_add():
    """Ajoute une piste ABSENTE de la collection au collection.nml (ENTRY créé).

    VOLUME : celui de la requête, sinon traktor_export_volume de la config, sinon
    TRAKTOR_USB. DIR : chemin relatif au dossier source (ou dossier parent sinon).
    Traktor régénérera l'analyse (AUDIO_ID, BPM, beatgrid…) au prochain scan.
    """
    data = request.json
    if not data or 'path' not in data:
        return jsonify({'ok': False, 'error': 'path manquant'}), 400
    local = data.get('path', '')
    if not local or not os.path.exists(local):
        return jsonify({'ok': False, 'error': 'fichier introuvable'}), 404
    if not is_path_allowed(local):
        return jsonify({'ok': False, 'error': 'chemin hors des dossiers autorisés'}), 403
    tree, idx, nml_path = get_nml_index()
    if not tree:
        return jsonify({'ok': False, 'error': 'NML non configuré ou invalide'}), 400
    filename = os.path.basename(local)
    filesize = os.path.getsize(local)
    hits = idx.get((filename, str(filesize)), [])
    if hits:
        return jsonify({'ok': True, 'already': True,
                        'entry': nml_module.get_entry_meta(hits[0])})
    cfg = get_active_config()
    volume = str(data.get('volume') or cfg.get('traktor_export_volume') or 'TRAKTOR_USB').strip()
    if not volume:
        volume = 'TRAKTOR_USB'
    elif len(volume) > 64:
        return jsonify({'ok': False, 'error': 'volume invalide (max 64 caractères)'}), 400
    title, artist, album, _bitrate, playtime = get_audio_tags(local)
    source = cfg.get('source_data', '') or ''
    parent = os.path.dirname(local)
    # normpath des deux côtés : source_data peut porter un slash final (config
    # réelle) — un fichier À LA RACINE du dossier source donne rel='' (DIR=volume).
    src_norm = os.path.normpath(source) if source else ''
    par_norm = os.path.normpath(parent)
    try:
        if src_norm and (par_norm == src_norm or par_norm.startswith(src_norm + os.sep)):
            rel = os.path.relpath(par_norm, src_norm)
            if rel == '.':
                rel = ''  # fichier à la racine du dossier source → DIR = volume seul
        else:
            rel = parent.strip(os.sep)
    except ValueError:
        rel = parent.strip(os.sep)
    dir_attr = nml_module.traktor_dir(rel, volume)
    meta = {'filename': filename, 'title': title, 'artist': artist, 'album': album}
    entry_el = nml_module.build_entry_element(meta, filesize, playtime, volume, dir_attr)
    nml_module.append_entry(tree, entry_el)
    try:
        nml_module.save_nml(nml_path, tree)
    except OSError as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    log_journal({'timestamp': datetime.now().isoformat(),
                 'action': 'Piste ajoutée à la collection',
                 'filename': filename, 'details': f'VOLUME={volume} DIR={dir_attr}',
                 'status': 'collection'})
    return jsonify({'ok': True, 'already': False,
                    'entry': nml_module.get_entry_meta(entry_el),
                    'volume': volume, 'dir': dir_attr})


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

    # Determine output directory : racine d'export (volume) si configurée,
    # sinon comportement historique sous source_data.
    cfg = get_active_config()
    source_base = cfg.get('source_data', '')
    if not source_base:
        return jsonify({'ok': False, 'error': 'Aucun dossier source configuré'}), 400
    export_root = (cfg.get('traktor_export_root', '') or '').strip()
    export_volume = (cfg.get('traktor_export_volume', 'TRAKTOR_USB') or 'TRAKTOR_USB').strip() or 'TRAKTOR_USB'

    # Check all source files still exist
    missing = []
    for track in pl['tracks']:
        if not os.path.exists(track['fullPath']):
            missing.append(track['filename'])

    if missing:
        return jsonify({'ok': False, 'missing': missing}), 409

    # Les fichiers physiques vont dans export_root/_playlists/<name> quand la
    # racine d'export est configurée — le collection.nml généré y pointe.
    pl_dir = os.path.join(export_root, '_playlists', name) if export_root \
        else os.path.join(source_base, '_playlists', name)
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

    # NML : généré uniquement si la racine d'export est configurée ; sinon
    # message EXPLICITE au client (plus d'échec silencieux — audit B8).
    cfg = get_active_config()
    nml_path = cfg.get('traktor_nml_path', '')
    nml_out = None
    nml_error = None
    if nml_path and os.path.exists(nml_path):
        if not export_root:
            nml_error = ('traktor_export_root non configuré — collection.nml non généré. '
                         'Configure la racine d\'export dans ⚙️ Config puis réexporte.')
        else:
            try:
                nml_out = nml_module.build_export_nml(
                    pl['tracks'], nml_path, export_root, export_volume, pl_dir)
            except (OSError, ET.ParseError, ValueError) as exc:
                nml_error = str(exc)
                log_journal({'timestamp': datetime.now().isoformat(),
                             'action': 'Export NML échoué',
                             'details': str(exc), 'status': 'error'})
            if nml_out is None:
                nml_error = ('Aucune piste de la playlist trouvée dans la collection '
                             '(clé FILE+FILESIZE) — collection.nml non généré.')
                log_journal({'timestamp': datetime.now().isoformat(),
                             'action': 'Export NML incomplet',
                             'details': nml_error, 'status': 'error'})
    if nml_out:
        result['nml'] = nml_out
    if nml_error:
        result['nml_error'] = nml_error

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


@app.route('/api/track/grid', methods=['POST'])
def track_grid():
    """Écrit la grille calculée (TEMPO + CUE_V2 TYPE=4 + GRID) dans le NML (EPIC-011).

    C'est le « graal » : Traktor lui-même affichera la grille au prochain scan, et
    l'app n'analyse plus jamais la piste. La phase vient de l'analyse serveur
    (EPIC-010) ou de la correction manuelle (EPIC-009) ; BPM_QUALITY=100 par défaut.
    Backup .bak.nml automatique (save_nml) + validation des bornes 20–400 (EPIC-008).
    """
    data = request.json
    if not data or 'filename' not in data or 'bpm' not in data:
        return jsonify({'ok': False, 'error': 'filename/bpm manquants'}), 400
    filename = data.get('filename', '')
    filesize = data.get('filesize', '')
    if not filename:
        return jsonify({'ok': False, 'error': 'filename manquant'}), 400
    try:
        bpm = float(data.get('bpm'))
        phase = float(data.get('phase', 0))
        quality = float(data.get('quality', 100))
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'bpm/phase/quality non numériques'}), 400
    # Mêmes bornes que le frontend/le cache (garde 20–400) : on n'écrit jamais un BPM aberrant.
    if not math.isfinite(bpm) or bpm <= 20 or bpm >= 400:
        return jsonify({'ok': False, 'error': 'bpm invalide'}), 400
    if not math.isfinite(phase) or phase < 0:
        return jsonify({'ok': False, 'error': 'phase invalide'}), 400
    if not math.isfinite(quality) or quality < 0 or quality > 100:
        return jsonify({'ok': False, 'error': 'quality invalide'}), 400
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
    nml_module.upsert_beatgrid(entry, bpm, phase, quality)
    try:
        nml_module.save_nml(path, tree)
    except OSError as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    log_journal({'timestamp': datetime.now().isoformat(),
                 'action': 'Grille écrite dans la collection',
                 'filename': filename,
                 'details': f'{bpm} BPM, beat 1 à {phase:.3f}s',
                 'status': 'collection'})
    return jsonify({'ok': True, 'bpm': bpm, 'phase': phase})


# ── Beatgrid cache (EPIC-009) ─────────────────────────────────────────────


def _beatgrid_path_or_error(local):
    """Valide `local` pour le cache beatgrid → (realpath, None) ou (None, réponse)."""
    if not local or not os.path.exists(local):
        return None, (jsonify({'ok': False, 'error': 'fichier introuvable'}), 404)
    if not is_path_allowed(local):
        return None, (jsonify({'ok': False, 'error': 'chemin hors des dossiers autorisés'}), 403)
    return os.path.realpath(local), None


@app.route('/api/beatgrid', methods=['GET', 'PUT'])
def beatgrid_cache():
    """Cache de grille par piste (data/beatgrids.json), clé = chemin réel du fichier.

    - GET ?path=… → {bpm, phase, source} ou {} si absent / périmé (FILESIZE changé).
    - PUT {path, bpm, phase, source} → écrit. Le frontend persiste ainsi le BPM/phase
      détecté ou corrigé manuellement (cascade NML → cache → détection).
    """
    if request.method == 'PUT':
        data = request.json
        if not data or 'path' not in data:
            return jsonify({'ok': False, 'error': 'path manquant'}), 400
        local = data.get('path', '')
        real, err = _beatgrid_path_or_error(local)
        if err:
            return err
        bpm = data.get('bpm')
        phase = data.get('phase', 0)
        source = data.get('source', '')
        try:
            bpm = float(bpm)
            phase = float(phase)
        except (TypeError, ValueError):
            return jsonify({'ok': False, 'error': 'bpm/phase non numériques'}), 400
        # Mêmes bornes que le frontend (garde 20–400) : on ne cache jamais un BPM aberrant.
        if not math.isfinite(bpm) or bpm <= 20 or bpm >= 400:
            return jsonify({'ok': False, 'error': 'bpm invalide'}), 400
        if not math.isfinite(phase) or phase < 0:
            return jsonify({'ok': False, 'error': 'phase invalide'}), 400
        if source not in ('nml', 'detected', 'manual'):
            return jsonify({'ok': False, 'error': 'source invalide'}), 400
        cache = load_json(BEATGRID_PATH, {})
        cache[real] = {
            'bpm': bpm,
            'phase': phase,
            'source': source,
            # Invalidation : le fichier audio a changé (FILESIZE suffit en pratique).
            'filesize': os.path.getsize(local),
            'updated': datetime.now().isoformat(),
        }
        save_json(BEATGRID_PATH, cache)
        return jsonify({'ok': True})

    # GET
    local = request.args.get('path', '')
    real, err = _beatgrid_path_or_error(local)
    if err:
        return err
    entry = load_json(BEATGRID_PATH, {}).get(real)
    if not entry:
        return jsonify({})
    if entry.get('filesize') != os.path.getsize(local):
        return jsonify({})  # fichier remplacé → cache périmé
    resp = {'bpm': entry['bpm'], 'phase': entry.get('phase', 0),
            'source': entry.get('source', '')}
    # EPIC-010 : l'analyse serveur stocke une confiance (0..1) — le PUT manuel non.
    if entry.get('confidence') is not None:
        resp['confidence'] = entry['confidence']
    return jsonify(resp)


# ── Analyse serveur kick/phase (EPIC-010) ────────────────────────────────


@app.route('/api/track/analyze', methods=['POST'])
def track_analyze():
    """Analyse la basse/le kick côté serveur → {bpm, phase, confidence}.

    Pipeline DSP maison (analysis.py — KISS, pas de librosa/madmom) : décodage
    (wave stdlib / ffmpeg) → filtre 40–150 Hz → ODF → autocorrélation → BPM,
    puis scan de phase (position du premier beat). Résultat persisté dans le
    cache beatgrid (EPIC-009) avec source 'detected' — survit à la fermeture.
    Échec de décodage → 422 (fichier corrompu/format illisible).
    """
    data = request.json
    if not data or 'path' not in data:
        return jsonify({'ok': False, 'error': 'path manquant'}), 400
    local = data.get('path', '')
    real, err = _beatgrid_path_or_error(local)
    if err:
        return err
    try:
        result = analysis_module.analyze_path(local)
    except analysis_module.AnalysisError as e:
        return jsonify({'ok': False, 'error': str(e)}), 422
    if not result or result.get('bpm') is None:
        # Pas de tempo fiable (pas de kick 4/4, silence…) → repli BPM manuel UI.
        return jsonify({'ok': True, 'bpm': None, 'phase': None, 'confidence': 0.0,
                        'notice': 'Aucun tempo fiable détecté (pas de kick 4/4 ?) — saisis le BPM manuellement.'})
    cache = load_json(BEATGRID_PATH, {})
    cache[real] = {
        'bpm': result['bpm'],
        'phase': result['phase'],
        'source': 'detected',
        'confidence': result['confidence'],
        # Invalidation : le fichier audio a changé (FILESIZE suffit en pratique).
        'filesize': os.path.getsize(local),
        'updated': datetime.now().isoformat(),
    }
    save_json(BEATGRID_PATH, cache)
    return jsonify({'ok': True, **result})


if __name__ == '__main__':
    app.run(debug=True, threaded=True, port=8765)
