import os
import json
import shutil
from datetime import datetime
from flask import Flask, request, jsonify, render_template, send_file, abort

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_PATH = os.path.join(DATA_DIR, 'config.json')
JOURNAL_PATH = os.path.join(DATA_DIR, 'journal.json')


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


@app.route('/config', methods=['GET', 'POST'])
def config():
    cfg = load_json(CONFIG_PATH, {'active': 0, 'configs': []})
    if request.method == 'POST':
        if request.json is None:
            return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400
        save_json(CONFIG_PATH, request.json)
        return jsonify({'ok': True})
    return jsonify(cfg)


@app.route('/')
def index():
    return render_template('index.html')


def index_files(directory):
    index = {}
    if not os.path.isdir(directory):
        return index
    for root, dirs, files in os.walk(directory):
        for f in files:
            if f.lower().endswith(MUSIC_EXTENSIONS):
                rel = os.path.relpath(root, directory)
                rel_path = os.path.join(rel, f) if rel != '.' else f
                index[f] = rel_path
    return index


def get_active_config():
    cfg = load_json(CONFIG_PATH, {'active': 0, 'configs': []})
    configs = cfg.get('configs', [])
    idx = cfg.get('active', 0)
    if configs and 0 <= idx < len(configs):
        return configs[idx]
    return {'source_data': '', 'epars_dirs': []}


@app.route('/scan')
def scan():
    active = get_active_config()
    source_dir = active.get('source_data', '')
    epars_dirs = active.get('epars_dirs', [])

    result = {
        'source': {},
        'epars': {}
    }
    if source_dir:
        result['source'][source_dir] = index_files(source_dir)
    for d in epars_dirs:
        result['epars'][d] = index_files(d)
    return jsonify(result)


@app.route('/copy', methods=['POST'])
def copy_file():
    data = request.json
    if data is None:
        return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400
    for key in ('source_path', 'dest_dir', 'filename'):
        if key not in data:
            return jsonify({'ok': False, 'error': f'Missing required key: {key}'}), 400
    src = data['source_path']
    dst_dir = data['dest_dir']
    filename = os.path.basename(data['filename'])

    if not os.path.exists(src):
        return jsonify({'ok': False, 'error': 'Source file not found'}), 404

    dst = os.path.join(dst_dir, filename)
    os.makedirs(dst_dir, exist_ok=True)
    try:
        shutil.copy2(src, dst)
    except (OSError, shutil.SameFileError) as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

    journal = load_json(JOURNAL_PATH, [])
    journal.append({
        'timestamp': datetime.now().isoformat(),
        'source': src,
        'destination': dst,
        'filename': filename,
        'status': 'copied'
    })
    save_json(JOURNAL_PATH, journal)

    return jsonify({'ok': True})


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


@app.route('/audio')
def serve_audio():
    path = request.args.get('path', '')
    if not path or not os.path.exists(path):
        abort(404)
    ext = os.path.splitext(path)[1].lower()
    mimetype = AUDIO_EXT_MAP.get(ext, 'application/octet-stream')
    return send_file(path, mimetype=mimetype)


if __name__ == '__main__':
    app.run(debug=True, port=8765)
