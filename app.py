import os
import re
import sys
import json
import math
import shutil
import multiprocessing
import unicodedata
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
# Dossiers racine vides créés via l'UI (➕) : le scan n'indexe que les fichiers
# audio, donc un dossier vide disparaîtrait au prochain rendu sans ce fichier.
EXTRA_DIRS_PATH = os.path.join(DATA_DIR, 'extra_dirs.json')


def load_json(path, default=None, log_corrupt=True):
    """Charge un JSON avec un retour au défaut sur fichier corrompu (EPIC-013).

    Plus jamais de 500 non formaté sur un JSON partiellement écrit (crash,
    disque plein…) : on retourne le défaut et on journalise l'incident.
    """
    if not os.path.exists(path):
        return default
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        if log_corrupt:
            try:
                log_journal({'timestamp': datetime.now().isoformat(),
                             'action': 'JSON corrompu (défaut utilisé)',
                             'details': os.path.basename(path),
                             'status': 'error'})
            except Exception:
                pass  # ne jamais bloquer le retour au défaut
        return default


def save_json(path, data):
    """Écriture atomique : .tmp + os.replace — jamais de fichier à moitié écrit.

    Même rigueur que save_nml (EPIC-013) : un crash pendant l'écriture laisse le
    fichier précédent intact, pas un JSON tronqué.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


MUSIC_EXTENSIONS = ('.mp3', '.flac', '.wav', '.ogg', '.m4a', '.wma')

# EPIC-028 : nom du dossier trash (fichiers déplacés, jamais effacés).
# Sous-dossier de la racine source (décision utilisateur), élagué du scan.
TRASH_DIRNAME = '_trash'


def load_extra_dirs():
    """Dossiers racine vides créés via l'UI (➕) — hors cache de scan."""
    return load_json(EXTRA_DIRS_PATH, [])


def save_extra_dirs(dirs):
    """Persistance triée/dédupliquée des dossiers racine additionnels."""
    save_json(EXTRA_DIRS_PATH, sorted(set(dirs)))

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
    """Return (year, duration_seconds, codec_str, genre_str)."""
    year = None
    duration = None
    genre = None
    codec = os.path.splitext(path)[1].lower()[1:].upper()
    if not HAS_MUTAGEN:
        return year, duration, codec, genre
    try:
        audio = MutagenFile(path, easy=False)
        if audio is None:
            return year, duration, codec, genre
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
            # Genre : TCON (content type) — valeur additive
            try:
                tcon = audio.tags.get('TCON')
                if tcon:
                    genre = str(tcon[0] if isinstance(tcon, (list, tuple)) else tcon)
            except Exception:
                pass
        # MP4 / M4A : tag (c)day (découvert via EPIC-033 — des M4A taggés
        # étaient comptés « sans année » par le scan)
        if year is None and hasattr(audio, 'tags') and audio.tags:
            try:
                val = audio.tags.get('\xa9day')
            except Exception:
                val = None
            if val:
                if isinstance(val, (list, tuple)):
                    val = val[0]
                year = str(val)[:4]
            # M4A genre : ©gen
            if genre is None:
                try:
                    val = audio.tags.get('\xa9gen')
                except Exception:
                    val = None
                if val:
                    if isinstance(val, (list, tuple)):
                        val = val[0]
                    genre = str(val)
        # FLAC / Vorbis
        if hasattr(audio, 'get'):
            if year is None:
                for tag in ('DATE', 'YEAR'):
                    val = audio.get(tag)
                    if val and val[0]:
                        year = str(val[0])[:4]
                        break
            if genre is None:
                for tag in ('GENRE', 'STYLE'):
                    val = audio.get(tag)
                    if val and val[0]:
                        genre = str(val[0])
                        break
    except Exception:
        pass
    return year, duration, codec, genre


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


JOURNAL_MAX_ENTRIES = 500


def log_journal(entry):
    """Append an entry to the journal, borné à JOURNAL_MAX_ENTRIES (rotation tête)."""
    # log_corrupt=False : un journal corrompu retourne [] sans re-journaliser
    # (sinon récursion load_json → log_journal → load_json…).
    journal = load_json(JOURNAL_PATH, [], log_corrupt=False)
    journal.append(entry)
    if len(journal) > JOURNAL_MAX_ENTRIES:
        journal = journal[-JOURNAL_MAX_ENTRIES:]
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
    # Cache-buster: la plus récente mtime de script.js ET style.css, pour que le
    # navigateur rafraîchisse le CSS/JS dès qu'un des deux fichiers change.
    base = os.path.dirname(os.path.abspath(__file__))
    paths = (
        os.path.join(base, 'static', 'dist', 'script.js'),
        os.path.join(base, 'static', 'style.css'),
    )
    mt = [int(os.path.getmtime(p)) for p in paths if os.path.exists(p)]
    cache_buster = str(max(mt)) if mt else '1'
    return render_template('index.html', cache_buster=cache_buster)


@app.route('/ping')
def ping():
    return jsonify({'ok': True, 'timestamp': datetime.now().isoformat()})


def _scan_file(full_path, rel_path):
    """Worker function — called in child process (must be top-level for pickle)."""
    filename = os.path.basename(full_path)
    year, duration, codec, genre = get_audio_meta(full_path)
    return (filename, {'path': rel_path, 'year': year, 'duration': duration, 'codec': codec, 'genre': genre})


def index_files(directory, phase_label='source'):
    index = {}
    if not os.path.isdir(directory):
        return index

    # Collect file list
    tasks = []
    for root, dirs, files in os.walk(directory):
        # Élagage _trash (EPIC-028) : les fichiers déplacés au trash ne doivent
        # pas être ré-indexés — le trash se remplirait lui-même à chaque scan.
        dirs[:] = [d for d in dirs if d != TRASH_DIRNAME]
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


# Cache parse NML (EPIC-013) : l'index est reconstruit uniquement si le fichier
# change (mtime+taille) — le parse de la collection réelle coûte ~0,5 s.
# Clé = chemin réel : chaque fichier (y compris les fixtures de test) a sa propre
# entrée, aucune fuite entre collections.
_nml_cache: dict = {}


def _invalidate_nml_cache():
    _nml_cache.clear()


def get_nml_index():
    """Retourne (tree, index, nml_path) ou (None, {}, '') si non configuré/invalide."""
    path = get_traktor_nml_path()
    if not path or not os.path.exists(path):
        return None, {}, path or ''
    real = os.path.realpath(path)
    key = os.path.getmtime(real), os.path.getsize(real)
    cached = _nml_cache.get(real)
    if cached and cached[0] == key:
        return cached[1], cached[2], real
    try:
        tree = nml_module.load_nml(real)
        idx = nml_module.build_index(tree)
        _nml_cache[real] = (key, tree, idx)
        return tree, idx, real
    except ET.ParseError:
        return None, {}, real


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
    # FILESIZE NML en Ko arrondi (convention Traktor) — EPIC-015 : la taille
    # disque en octets ne matchait jamais la collection réelle (0/300 fichiers).
    filesize = nml_module.filesize_kb(os.path.getsize(local))
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
    # FILESIZE NML en Ko arrondi (convention Traktor, EPIC-015) : c'est aussi la
    # valeur écrite dans INFO/FILESIZE (build_entry_element) — cohérente avec
    # l'index, sinon la piste ajoutée serait introuvable au prochain match.
    filesize = nml_module.filesize_kb(os.path.getsize(local))
    hits = idx.get((filename, filesize), [])
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
    # Verrou (EPIC-013) : ligne de défense serveur — le bouton est déjà désactivé
    # côté UI, mais un double GET (rechargement, script) ne doit pas lancer deux
    # indexations concurrentes.
    if _scan_progress['running']:
        return jsonify({'error': 'Scan déjà en cours'}), 409
    active = get_active_config()
    source_dir = active.get('source_data', '')
    epars_dirs = active.get('epars_dirs', [])

    reset_scan_progress()

    try:
        result = {
            'source': {},
            'epars': {}
        }
        if source_dir:
            result['source'][source_dir] = index_files(source_dir, 'Source Data')
        for d in epars_dirs:
            result['epars'][d] = index_files(d, 'Éparpillé')
        result['extra_dirs'] = load_extra_dirs()
        result['source_index'] = _build_source_index(result.get('source', {}))

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
    finally:
        # Toujours relâcher le verrou, même en cas d'erreur (sinon plus aucun scan).
        _scan_progress['running'] = False


@app.route('/load')
def load_cached():
    data = load_json(CACHE_PATH, {'source': {}, 'epars': {}})
    data.setdefault('source', {})
    data['extra_dirs'] = load_extra_dirs()
    data.setdefault('source_index', {})
    return jsonify(data)


@app.route('/mkdir', methods=['POST', 'DELETE'])
def mkdir_source_dir():
    """Créer (POST) ou retirer de l'index (DELETE) un dossier racine de Source Data.

    Le scan (os.walk) n'indexe que les fichiers audio : un dossier vide créé
    via l'UI serait invisible au prochain rendu. On le trace donc dans
    data/extra_dirs.json, réinjecté dans /load et /scan.
    DELETE ne supprime jamais rien du disque — il retire uniquement le dossier
    de l'index (règle DATA-SAFETY).
    """
    data = request.json
    if data is None:
        return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400
    root = data.get('root', '')
    name = (data.get('name') or '').strip()
    if not root or not name:
        return jsonify({'ok': False, 'error': 'Missing required key: root, name'}), 400
    if '/' in name or '\\' in name or name in ('.', '..'):
        return jsonify({'ok': False, 'error': 'Nom de dossier invalide'}), 400

    if not is_path_allowed(os.path.join(root, name)):
        return jsonify({'ok': False, 'error': 'Path not within allowed directories'}), 403

    target = os.path.join(root, name)

    if request.method == 'DELETE':
        dirs = load_extra_dirs()
        if target not in dirs:
            return jsonify({'ok': False, 'error': "Dossier introuvable dans l'index"}), 404
        dirs.remove(target)
        save_extra_dirs(dirs)
        log_journal({
            'timestamp': datetime.now().isoformat(),
            'action': "Dossier retiré de l'index",
            'details': target,
            'status': 'mkdir'
        })
        return jsonify({'ok': True, 'name': name})

    try:
        os.makedirs(target, exist_ok=True)
    except OSError as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

    dirs = load_extra_dirs()
    if target not in dirs:
        dirs.append(target)
        save_extra_dirs(dirs)
    log_journal({
        'timestamp': datetime.now().isoformat(),
        'action': 'Dossier créé',
        'details': target,
        'status': 'mkdir'
    })
    return jsonify({'ok': True, 'name': name, 'path': target})


@app.route('/copy', methods=['POST'])
def copy_file():
    def _resp(ok, **kw):
        """Build consistent response with metadata when available."""
        src = kw.pop('_src', None)
        if src and os.path.exists(src):
            year, duration, codec, genre = get_audio_meta(src)
        else:
            year = duration = codec = genre = None
        return jsonify({'ok': ok, 'year': year, 'duration': duration, 'codec': codec, 'genre': genre, **kw})

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

    dst = _collision_dst(os.path.join(dst_dir, filename), src)
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
        year, duration, codec, genre = get_audio_meta(dst)
        for source_dir in list(cache.get('source', {}).keys()):
            if dst_dir == source_dir or dst_dir.startswith(source_dir.rstrip('/') + '/'):
                rel = os.path.relpath(dst_dir, source_dir) if dst_dir != source_dir else '.'
                rel_path = os.path.join(rel, filename) if rel != '.' else filename
                cache['source'][source_dir][filename] = {
                    'path': rel_path, 'year': year, 'duration': duration, 'codec': codec, 'genre': genre
                }
                save_json(CACHE_PATH, cache)
                break

    return _resp(True, _src=dst)


@app.route('/move', methods=['POST'])
def move_file():
    """Move a file to a destination dir — EPIC-028 trash: move, never erase.

    Symétrique de /copy : shutil.move, is_path_allowed() sur source ET
    destination, collision → suffixe -2/-3 (fichier existant préservé).
    """
    data = request.json
    if data is None:
        return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400
    for key in ('source_path', 'dest_dir'):
        if key not in data:
            return jsonify({'ok': False, 'error': f'Missing required key: {key}'}), 400
    src = data['source_path']
    dst_dir = data['dest_dir']
    filename = os.path.basename(data.get('filename') or src)

    if not os.path.exists(src):
        return jsonify({'ok': False, 'error': 'Source file not found'}), 404
    if not is_path_allowed(src) or not is_path_allowed(os.path.join(dst_dir, filename)):
        return jsonify({'ok': False, 'error': 'Path not within allowed directories'}), 403

    dst = os.path.join(dst_dir, filename)
    if os.path.abspath(dst) == os.path.abspath(src):
        return jsonify({'ok': False, 'error': 'Source and destination are identical'}), 400
    os.makedirs(dst_dir, exist_ok=True)
    try:
        final_dst = _collision_dst(dst, src)
        shutil.move(src, final_dst)
    except (OSError, shutil.Error) as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

    log_journal({
        'timestamp': datetime.now().isoformat(),
        'source': src,
        'destination': final_dst,
        'filename': os.path.basename(final_dst),
        'status': 'moved-to-trash' if TRASH_DIRNAME in os.path.realpath(final_dst).split(os.sep) else 'moved'
    })

    # Remove from cache (source side) + add (dest side) if applicable
    cache = load_json(CACHE_PATH)
    if cache:
        _move_cache_update(cache, src, filename, final_dst)

    return jsonify({'ok': True, 'filename': os.path.basename(final_dst), 'destination': final_dst})


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


@app.route('/journal', methods=['GET', 'DELETE'])
def journal():
    if request.method == 'DELETE':
        # Vider le journal (EPIC-013) — rotation bornée + remise à zéro explicite.
        save_json(JOURNAL_PATH, [])
        return jsonify({'ok': True})
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


def _collision_dst(dst, src):
    """Suffix -2/-3… if dst exists — never overwrite (EPIC-028).

    Le fichier existant est préservé ; le NOUVEAU fichier porte le suffixe.
    Calculé AVANT copy2/move (une suffixation post-hoc ne peut pas restaurer
    le contenu écrasé). samefile : src/dst identiques → pas de suffixe.
    """
    if not os.path.exists(dst) or os.path.samefile(src, dst):
        return dst
    base, ext = os.path.splitext(dst)
    n = 2
    while os.path.exists(f"{base}-{n}{ext}"):
        n += 1
    return f"{base}-{n}{ext}"


def _move_cache_update(cache, src, filename, final_dst):
    """Mirror the /move effect into the /load cache: remove source entry, add dest entry."""
    src_dir = os.path.dirname(src)
    removed = False
    # Remove from the source side (epars) — key is the filename at that level
    for epars_dir in list(cache.get('epars', {}).keys()):
        if src_dir == epars_dir or src_dir.startswith(epars_dir.rstrip('/') + '/'):
            cache['epars'][epars_dir].pop(filename, None)
            removed = True
            break
    if not removed:
        for source_dir in list(cache.get('source', {}).keys()):
            if src_dir == source_dir or src_dir.startswith(source_dir.rstrip('/') + '/'):
                cache['source'][source_dir].pop(filename, None)
                break
    # Add to the dest side if dest is under a scanned root
    year, duration, codec, genre = get_audio_meta(final_dst)
    dest_dir = os.path.dirname(final_dst)
    base = os.path.basename(final_dst)
    for source_dir in list(cache.get('source', {}).keys()):
        if dest_dir == source_dir or dest_dir.startswith(source_dir.rstrip('/') + '/'):
            rel = os.path.relpath(dest_dir, source_dir) if dest_dir != source_dir else '.'
            rel_path = os.path.join(rel, base) if rel != '.' else base
            cache['source'][source_dir][base] = {
                'path': rel_path, 'year': year, 'duration': duration, 'codec': codec, 'genre': genre
            }
            break
    save_json(CACHE_PATH, cache)


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


# ── Années manquantes (EPIC-033 T2/T4) — caches collectes MB/Deezer/Discogs/iTunes ──

YEAR_CACHE_PATH = os.path.join(DATA_DIR, 'year_cache.jsonl')
DISCOGS_CACHE_PATH = os.path.join(DATA_DIR, 'discogs_cache.jsonl')
ITUNES_CACHE_PATH = os.path.join(DATA_DIR, 'itunes_cache.jsonl')
REFORM_CACHE_PATH = os.path.join(DATA_DIR, 'discogs_reform_cache.jsonl')
REFORM2_CACHE_PATH = os.path.join(DATA_DIR, 'discogs_reform2_cache.jsonl')
BEATPORT_CACHE_PATH = os.path.join(DATA_DIR, 'beatport_cache.jsonl')
YOUTUBE_CACHE_PATH = os.path.join(DATA_DIR, 'youtube_topic_cache.jsonl')

# Miroir de scripts/collect_years.py (NOISE + artist_title) : le parse des clés
# de cache doit être identique au collecteur, sans importer scripts/.
_YEARS_NOISE = re.compile(
    r"\b(remix|remaster(ed)?|edit|version|mix|hq|hd|official|video|audio|lyrics?|"
    r"feat\.?|ft\.?|radio|single|album|club|extended|original|instrumental|acoustic|"
    r"live|vol\.?\s*\d*|volume)\b", re.I)


def _years_strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def _artist_title(fn):
    """(artiste|None, titre) depuis un nom de fichier — miroir collect_years.py."""
    n = _years_strip_accents(fn.rsplit('.', 1)[0].lower())
    m = re.match(r'^\s*(?:\(\d{1,3}\))?\s*\[([^\]]+)\]\s*(.+)$', n)
    if m:
        return _YEARS_NOISE.sub(' ', m.group(1)).strip(), _YEARS_NOISE.sub(' ', m.group(2)).strip()
    n = re.sub(r'^\s*\d{1,3}[\s._-]+', '', n)
    n = re.sub(r'\([^)]*\)', ' ', n)
    n = re.sub(r'\[[^\]]*\]', ' ', n)
    n = n.replace('_', ' ')
    if ' - ' in n:
        segs = n.split(' - ')
    elif n.count('-') == 1:
        segs = re.split(r'\s*-\s*', n)
    else:
        segs = [n]
    segs = [re.sub(r'[-_.]+', ' ', s) for s in segs]
    segs = [re.sub(r'\s+', ' ', s).strip() for s in segs]
    segs = [s for s in segs if s and not re.fullmatch(r'\d{1,3}', s)]
    if not segs:
        return None, None
    if len(segs) >= 2:
        a, t = segs[0], segs[-1]
    else:
        t = re.sub(r'^\d{1,4}\s+', '', segs[0])
        m2 = re.match(r'^(.{2,40}?)\s+-\s+(.+)$', t)
        if m2:
            a, t = m2.group(1), m2.group(2)
        else:
            a = None
    a = re.sub(r'^\d{1,4}\s+', '', a) if a else None
    return (_YEARS_NOISE.sub(' ', a).strip() if a else None), _YEARS_NOISE.sub(' ', t).strip()


def _build_source_index(source_files):
    """Construit l'index artiste → styles depuis les fichiers source.
    Pour chaque fichier source, parse l'artiste (nom de fichier) et la
   /styles (sous-dossier). Retourne {artiste_normalisé: [styles triés]}.
    Utilisé par /scan pour alimenter les suggestions de style côté client.
    """
    index = {}  # artiste normalisé → set de styles
    for source_dir, files in source_files.items():
        for filename, meta in files.items():
            path = meta.get('path', '')
            slash = path.find('/')
            if slash <= 0:
                continue  # fichier à la racine, pas de style
            folder_name = path[:slash]  # ex. 'techno_acid_1990'
            # Extraire le style (sans la tranche YYYY)
            m = re.match(r'^(.+)_(\d{4})$', folder_name)
            style = m.group(1) if m else folder_name
            # Parser l'artiste
            artist, _ = _artist_title(filename)
            if not artist:
                continue
            artist_norm = _years_strip_accents(artist.lower().strip())
            if not artist_norm:
                continue
            index.setdefault(artist_norm, set())
            index[artist_norm].add(style)
    return {k: sorted(v) for k, v in index.items()}


def _load_years_caches():
    """Clé → résultat consolidé (priorité MB/Deezer > Discogs > iTunes >
    reform ; un pool ne revendique une clé que si son statut est concluant —
    cf. scripts/report_years.py). Lignes 'error' ignorées (re-jetables).
    Dernière ligne gagnante PAR FICHIER (l'historique JSONL contient des lignes
    périmées des runs corrigés), priorité ENTRE fichiers ensuite."""
    pools = []
    for path in (YEAR_CACHE_PATH, DISCOGS_CACHE_PATH, ITUNES_CACHE_PATH,
                 REFORM_CACHE_PATH, REFORM2_CACHE_PATH, BEATPORT_CACHE_PATH,
                 YOUTUBE_CACHE_PATH):
        if not os.path.exists(path):
            continue
        pool = {}
        try:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        r = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if r.get('status') in ('none', 'error'):
                        continue
                    pool[r['key']] = r
        except OSError:
            continue
        pools.append((os.path.basename(path), pool))
    resolved = {}
    for name, pool in pools:
        for k, r in pool.items():
            if k not in resolved:
                resolved[k] = (name, r)
    return resolved


def _years_wave(pool, rec):
    """Vague de confiance d'un résultat (règles scripts/apply_years.py) :
    le consensus « fenêtre ≤ 2 ans » ne vaut que pour MB/Deezer (Discogs et
    iTunes ambiguous ont d'autres sémantiques)."""
    st = rec.get('status')
    if st == 'found' and rec.get('year'):
        return 'certaines'
    if st == 'ambiguous':
        try:
            cands = [int(y) for y in rec.get('years') or [] if str(y).isdigit()]
        except (TypeError, ValueError):
            cands = []
        if (pool == 'year_cache.jsonl' and len(cands) >= 2
                and max(cands) - min(cands) <= 2):
            return 'certaines'
        return 'a_revue'
    if st == 'lax':
        return 'a_revue'
    return 'introuvables'


@app.route('/years/preview')
def years_preview():
    """Vue « Années manquantes » : résultats consolidés par clé avec leurs
    fichiers (sans année au dernier scan, format géré), vagues séparées.
    LECTURE SEULE : l'application reste faite par scripts/apply_years.py."""
    resolved = _load_years_caches()
    cache = load_json(CACHE_PATH, {})
    by_wave = {'certaines': [], 'a_revue': []}
    files_no_year = 0
    n_introuvables = 0
    for side in ('source', 'epars'):
        for base, files in cache.get(side, {}).items():
            for fn, meta in files.items():
                if meta.get('year'):
                    continue
                files_no_year += 1
                # Miroir collect_years.load_keys : clé parsée sur le NOM de
                # fichier (meta.path peut contenir des sous-dossiers).
                a, t = _artist_title(fn)
                if not t:
                    n_introuvables += 1   # non parsable : aucune piste
                    continue
                key = f'{a or ""}\t{t}'
                entry = resolved.get(key)
                if entry is None:
                    # Introuvable : aucune source n'a conclu. Pas de liste
                    # (aucune action possible) — un compteur honnête suffit.
                    n_introuvables += 1
                    continue
                pool_name, rec = entry
                # Consensus MB/Deezer : année effective = 1ʳᵉ sortie (min des
                # candidates), même sémantique que scripts/apply_years.py.
                rec = dict(rec)
                if rec.get('status') == 'ambiguous' and rec.get('year') is None:
                    try:
                        cands = [int(y) for y in rec.get('years') or []
                                 if str(y).isdigit()]
                    except (TypeError, ValueError):
                        cands = []
                    if (pool_name == 'year_cache.jsonl' and len(cands) >= 2
                            and max(cands) - min(cands) <= 2):
                        rec['year'] = str(min(cands))
                        rec['source'] = 'consensus'
                item = {
                    'path': os.path.join(base, meta['path']) if meta.get('path') else os.path.join(base, fn),
                    'filename': fn,
                    'artist': a,
                    'title': t,
                    'status': rec.get('status'),
                    'source': rec.get('source'),
                    'year': rec.get('year'),
                    'years': rec.get('years') or [],
                }
                by_wave[_years_wave(pool_name, rec)].append(item)
    return jsonify({
        'files_no_year': files_no_year,
        'certaines': by_wave['certaines'],
        'a_revue': by_wave['a_revue'],
        'introuvables': n_introuvables,
    })


# ── EPIC-033 P2 : persistance des choix de revue (vue Années → apply_years --review)

REVIEW_PATH = os.path.join(DATA_DIR, 'year_review.json')


@app.route('/years/review', methods=['GET', 'POST'])
def years_review():
    """Choix de revue humaine de la vue Années — pattern ratings : fichier JSON
    data/year_review.json, clé = 'artiste\ttitre', valeur = année 'YYYY' ou
    null (rejet). GET lit, POST fusionne puis sauvegarde. Clé invalide (sans
    tabulation) ou année non numérique → 400, rien n'est écrit.
    Ne touche JAMAIS aux fichiers audio : l'application des tags reste
    scripts/apply_years.py --review."""
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        choices = data.get('choices')
        if not isinstance(choices, dict):
            return jsonify({'ok': False, 'error': 'choices (dict) requis'}), 400
        clean = {}
        for k, v in choices.items():
            if not isinstance(k, str) or '\t' not in k:
                return jsonify({'ok': False, 'error': f'clé invalide : {k!r}'}), 400
            if v is None:
                clean[k] = None
            elif isinstance(v, str) and v.isdigit() and len(v) == 4:
                clean[k] = v
            else:
                return jsonify({'ok': False, 'error': f'valeur invalide pour {k!r}'}), 400
        reviews = load_json(REVIEW_PATH, {})
        reviews.update(clean)
        save_json(REVIEW_PATH, reviews)
        return jsonify({'ok': True, 'count': len(reviews)})
    return jsonify(load_json(REVIEW_PATH, {}))


# ── EPIC-035 P3 : persistance des choix de style (vue Sync → apply_styles --review)

STYLES_REVIEW_PATH = os.path.join(DATA_DIR, 'style_review.json')


def _known_styles():
    """Ensemble des styles connus, dérivé des dossiers source du cache
    (même grammaire que la taxonomie client : style = 1er segment de path,
    sans la tranche YYYY éventuelle). Cache vide → ensemble vide."""
    cache = load_json(CACHE_PATH, {})
    styles = set()
    for files in cache.get('source', {}).values():
        for meta in files.values():
            path = meta.get('path', '')
            slash = path.find('/')
            if slash <= 0:
                continue  # fichier à la racine, pas de style
            folder = path[:slash]
            m = re.match(r'^(.+)_(\d{4})$', folder)
            styles.add(m.group(1) if m else folder)
    return styles


@app.route('/styles/review', methods=['GET', 'POST'])
def styles_review():
    """Choix de style humains (vue Sync, palette g) — pattern /years/review :
    fichier data/style_review.json, clé = fullpath épars, valeur = {"style":
    "…", "tranche": AAAA|null} ou null (retrait). GET lit, POST fusionne puis
    sauvegarde. Style hors taxonomie (dossiers source du cache) → 400, rien
    n'est écrit. Ne touche JAMAIS aux fichiers audio : l'écriture TCON reste
    scripts/apply_styles.py --review."""
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        choices = data.get('choices')
        if not isinstance(choices, dict):
            return jsonify({'ok': False, 'error': 'choices (dict) requis'}), 400
        known = _known_styles()
        clean = {}
        for k, v in choices.items():
            if not isinstance(k, str) or not k:
                return jsonify({'ok': False, 'error': f'clé invalide : {k!r}'}), 400
            if v is None:
                clean[k] = None
            elif (isinstance(v, dict) and isinstance(v.get('style'), str) and v['style']
                  and (v.get('tranche') is None or (isinstance(v.get('tranche'), int)
                                                    and 1980 <= v['tranche'] <= 2100))):
                if v['style'] not in known:
                    return jsonify({'ok': False, 'error': f'style inconnu : {v["style"]!r}'}), 400
                clean[k] = {'style': v['style'], 'tranche': v.get('tranche')}
            else:
                return jsonify({'ok': False, 'error': f'valeur invalide pour {k!r}'}), 400
        reviews = load_json(STYLES_REVIEW_PATH, {})
        reviews.update(clean)
        save_json(STYLES_REVIEW_PATH, reviews)
        return jsonify({'ok': True, 'count': len(reviews)})
    return jsonify(load_json(STYLES_REVIEW_PATH, {}))


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
    # Debugger Werkzeug uniquement en développement (EPIC-013) : le reloader et
    # le débogueur interactif n'ont pas leur place en usage quotidien.
    debug = '--debug' in sys.argv
    app.run(debug=debug, threaded=True, port=8765)
