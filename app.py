import os
import json
import shutil
from datetime import datetime
from flask import Flask, request, jsonify, render_template

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
    if request.method == 'POST':
        if request.json is None:
            return jsonify({'ok': False, 'error': 'Request body must be JSON'}), 400
        save_json(CONFIG_PATH, request.json)
        return jsonify({'ok': True})
    return jsonify(load_json(CONFIG_PATH, {}))


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


@app.route('/scan')
def scan():
    cfg = load_json(CONFIG_PATH, {})
    source_dir = cfg.get('source_data', '')
    epars_dirs = cfg.get('epars_dirs', [])

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
    filename = data['filename']

    if not os.path.exists(src):
        return jsonify({'ok': False, 'error': 'Source file not found'}), 404

    dst = os.path.join(dst_dir, filename)
    os.makedirs(dst_dir, exist_ok=True)
    shutil.copy2(src, dst)

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


if __name__ == '__main__':
    app.run(debug=True, port=8765)
