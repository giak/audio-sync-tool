# Audio Sync Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task.

**Goal:** Build a web-based tool to scan scattered music folders, identify files missing from a source data directory, and enable one-click copy navigation.

**Architecture:** Single Flask app serving a two-panel web UI. Backend handles filesystem scanning, file copying, config/journal persistence. Frontend renders directory trees, computes file status (nouveau/doublon/traité), and manages click-to-copy workflow.

**Tech Stack:** Python 3 + Flask (backed), HTML/CSS/JS vanilla (frontend), JSON files (storage).

## Global Constraints

- Flask unique dépendance externe : `pip install flask`
- Aucune suppression de fichier — copie uniquement, jamais de déplacement
- Journal persistant dans `data/journal.json`
- Interface légère, zéro dépendance npm
- Port : 8765

---

### Task 1: Backend Core (app.py with all routes + tests)

**Files:**
- Create: `app.py`
- Create: `test_app.py`
- Create: `data/config.json` (auto-created at first use)
- Create: `data/journal.json` (auto-created at first use)

**Interfaces:**
- Produces: Flask routes `GET /`, `GET /scan`, `POST /copy`, `GET/POST /config`, `GET /journal`

- [ ] **Step 1: Write app.py skeleton with config + data helpers**

```python
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
```

- [ ] **Step 2: Write test for config routes + implement**

```python
# test_app.py
import json
import os
import tempfile
import pytest

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c

def test_config_default(client):
    rv = client.get('/config')
    assert rv.status_code == 200
    assert rv.json == {}

def test_config_save_and_read(client):
    payload = {
        'source_data': '/home/giak/Music/select/style/',
        'epars_dirs': ['/media/giak/music/--[ montage audio/']
    }
    rv = client.post('/config', json=payload)
    assert rv.status_code == 200
    assert rv.json == {'ok': True}

    rv = client.get('/config')
    assert rv.status_code == 200
    assert rv.json == payload
```

```python
# app.py — add config routes
@app.route('/config', methods=['GET', 'POST'])
def config():
    if request.method == 'POST':
        save_json(CONFIG_PATH, request.json)
        return jsonify({'ok': True})
    return jsonify(load_json(CONFIG_PATH, {}))


@app.route('/')
def index():
    return render_template('index.html')
```

- [ ] **Step 3: Run config tests**

Run: `python -m pytest test_app.py::test_config_default test_app.py::test_config_save_and_read -v`
Expected: 2 PASS

- [ ] **Step 4: Write scan test + implement scanner**

```python
def test_scan_finds_mp3_and_flac(client):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        os.makedirs(src)
        open(os.path.join(src, 'song.mp3'), 'w').close()
        open(os.path.join(src, 'track.flac'), 'w').close()
        open(os.path.join(src, 'notes.txt'), 'w').close()

        client.post('/config', json={'source_data': src, 'epars_dirs': []})
        rv = client.get('/scan')
        assert rv.status_code == 200
        data = rv.json
        assert 'song.mp3' in data['source'][src]
        assert 'track.flac' in data['source'][src]
        assert 'notes.txt' not in data['source'][src]


def test_scan_epars_dirs(client):
    with tempfile.TemporaryDirectory() as tmp:
        ep = os.path.join(tmp, 'epars')
        os.makedirs(ep)
        open(os.path.join(ep, 'lost.mp3'), 'w').close()

        client.post('/config', json={'source_data': '', 'epars_dirs': [ep]})
        rv = client.get('/scan')
        data = rv.json
        assert 'lost.mp3' in data['epars'][ep]
```

```python
# app.py — add scan endpoint
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
```

- [ ] **Step 5: Run scan tests**

Run: `python -m pytest test_app.py::test_scan_finds_mp3_and_flac test_app.py::test_scan_epars_dirs -v`
Expected: 2 PASS

- [ ] **Step 6: Write copy + journal tests + implement**

```python
def test_copy_file_and_journal(client):
    with tempfile.TemporaryDirectory() as tmp:
        src_dir = os.path.join(tmp, 'src')
        dst_dir = os.path.join(tmp, 'dst')
        os.makedirs(src_dir)
        src_file = os.path.join(src_dir, 'song.mp3')
        open(src_file, 'w').close()

        rv = client.post('/copy', json={
            'source_path': src_file,
            'dest_dir': dst_dir,
            'filename': 'song.mp3'
        })
        assert rv.status_code == 200
        assert rv.json == {'ok': True}
        assert os.path.exists(os.path.join(dst_dir, 'song.mp3'))

        rv = client.get('/journal')
        data = rv.json
        assert len(data) == 1
        assert data[0]['filename'] == 'song.mp3'
        assert data[0]['status'] == 'copied'


def test_copy_missing_source(client):
    rv = client.post('/copy', json={
        'source_path': '/nonexistent/song.mp3',
        'dest_dir': '/tmp',
        'filename': 'song.mp3'
    })
    assert rv.status_code == 404
```

```python
# app.py — add copy + journal endpoints
@app.route('/copy', methods=['POST'])
def copy_file():
    data = request.json
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
```

- [ ] **Step 7: Run all backend tests**

Run: `python -m pytest test_app.py -v`
Expected: 5 PASS

- [ ] **Step 8: Commit**

```bash
git add app.py test_app.py
git commit -m "feat: backend with scan, copy, config, journal endpoints"
```

---

### Task 2: Frontend (HTML + CSS + JavaScript)

**Files:**
- Create: `templates/index.html`
- Create: `static/style.css`
- Create: `static/script.js`

**Interfaces:**
- Consumes: Task 1 routes (`GET /scan`, `POST /copy`, `GET /journal`, `GET/POST /config`)
- Produces: Full two-panel UI with scan/new/duplicate display and click-to-copy

- [ ] **Step 1: Write index.html template**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Audio Sync Tool</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<div id="app">
  <header>
    <h1>Audio Sync Tool</h1>
    <div id="toolbar">
      <button id="btn-config">⚙️ Config</button>
      <button id="btn-scan">🔄 Scan</button>
      <button id="btn-journal">📋 Journal</button>
    </div>
  </header>

  <div id="config-panel" class="hidden">
    <h3>Configuration</h3>
    <label>Dossier source (source data) :
      <input type="text" id="cfg-source" placeholder="/home/giak/Music/select/style/">
    </label>
    <label>Dossiers éparpillés (un par ligne) :
      <textarea id="cfg-epars" rows="3" placeholder="/media/giak/music/--[ montage audio/"></textarea>
    </label>
    <button id="btn-save-config">Sauvegarder</button>
    <p id="config-status"></p>
  </div>

  <div id="main-panels">
    <div id="panel-left" class="panel">
      <h2>📂 Éparpillé</h2>
      <div id="epars-container"></div>
    </div>
    <div id="panel-right" class="panel">
      <h2>📂 Source Data</h2>
      <div id="source-container"></div>
    </div>
  </div>

  <div id="status-bar">
    <span id="status-text">Prêt. Configure les dossiers puis clique Scan.</span>
    <span id="selected-info" class="hidden"></span>
  </div>

  <div id="journal-panel" class="hidden">
    <h3>Journal des opérations</h3>
    <div id="journal-content"></div>
  </div>
</div>

<div id="confirm-dialog" class="hidden">
  <div id="dialog-content">
    <p id="dialog-msg"></p>
    <button id="dialog-confirm">Copier</button>
    <button id="dialog-cancel">Annuler</button>
  </div>
</div>

<script src="/static/script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write style.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #1e1e2e; color: #cdd6f4; height: 100vh; }
#app { display: flex; flex-direction: column; height: 100vh; }

header { background: #181825; padding: 12px 20px; display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #313244; }
header h1 { font-size: 18px; color: #cba6f7; }
#toolbar { display: flex; gap: 8px; }
#toolbar button { background: #313244; color: #cdd6f4; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
#toolbar button:hover { background: #45475a; }

#config-panel { background: #181825; padding: 16px 20px; border-bottom: 1px solid #313244; }
#config-panel label { display: block; margin-bottom: 10px; font-size: 13px; }
#config-panel input, #config-panel textarea { width: 100%; margin-top: 4px; padding: 6px 10px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; font-size: 13px; }
#config-panel textarea { font-family: monospace; }
#btn-save-config { background: #a6e3a1; color: #1e1e2e; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
#config-status { margin-top: 6px; font-size: 12px; color: #a6e3a1; }

#main-panels { display: flex; flex: 1; overflow: hidden; }
.panel { flex: 1; overflow-y: auto; padding: 12px; border-right: 1px solid #313244; }
.panel:last-child { border-right: none; }
.panel h2 { font-size: 14px; color: #89b4fa; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #313244; }

.directory { font-weight: 600; color: #f5c2e7; cursor: pointer; padding: 3px 0 3px 16px; font-size: 13px; }
.directory::before { content: '📁  '; }
.children { padding-left: 16px; }

.file { padding: 2px 0 2px 16px; font-size: 13px; cursor: default; border-radius: 3px; }
.file:hover { background: #313244; }
.file.nouveau { color: #89b4fa; cursor: pointer; }
.file.nouveau::after { content: ' ●'; color: #89b4fa; font-size: 10px; }
.file.doublon { color: #585b70; }
.file.doublon::after { content: ' ○'; color: #585b70; font-size: 10px; }
.file.traite { color: #a6e3a1; }
.file.traite::after { content: ' ▲'; color: #a6e3a1; font-size: 10px; }
.file.selected { background: #45475a; outline: 1px solid #89b4fa; }
.file.destination-hover { background: #313244; outline: 1px solid #a6e3a1; }

#status-bar { background: #181825; padding: 8px 20px; font-size: 13px; border-top: 1px solid #313244; display: flex; justify-content: space-between; }
#selected-info { color: #89b4fa; }

#journal-panel { background: #181825; padding: 16px 20px; border-top: 1px solid #313244; max-height: 200px; overflow-y: auto; }
#journal-content { font-size: 12px; font-family: monospace; }
#journal-content div { padding: 2px 0; }
#journal-content .copied { color: #a6e3a1; }
#journal-content .error { color: #f38ba8; }

#confirm-dialog { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
#dialog-content { background: #1e1e2e; padding: 24px; border-radius: 12px; text-align: center; border: 1px solid #313244; }
#dialog-content p { margin-bottom: 16px; font-size: 14px; }
#dialog-content button { margin: 0 8px; padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
#dialog-confirm { background: #a6e3a1; color: #1e1e2e; font-weight: 600; }
#dialog-cancel { background: #45475a; color: #cdd6f4; }

.hidden { display: none !important; }
```

- [ ] **Step 3: Write script.js**

```javascript
const state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  selectedFile: null,
  selectedEparDir: null
};

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

// Config
document.getElementById('btn-config').onclick = () => {
  document.getElementById('config-panel').classList.toggle('hidden');
};

document.getElementById('btn-save-config').onclick = async () => {
  const source = document.getElementById('cfg-source').value.trim();
  const epars = document.getElementById('cfg-epars').value.split('\n').map(s => s.trim()).filter(Boolean);
  await api('/config', {
    method: 'POST',
    body: JSON.stringify({ source_data: source, epars_dirs: epars })
  });
  document.getElementById('config-status').textContent = '✓ Configuration sauvegardée';
};

async function loadConfig() {
  const cfg = await api('/config');
  if (cfg.source_data) document.getElementById('cfg-source').value = cfg.source_data;
  if (cfg.epars_dirs) document.getElementById('cfg-epars').value = cfg.epars_dirs.join('\n');
}

// Scan
document.getElementById('btn-scan').onclick = async () => {
  document.getElementById('status-text').textContent = 'Scan en cours...';
  const data = await api('/scan');
  state.sourceFiles = data.source || {};
  state.eparsFiles = data.epars || {};
  state.journal = await api('/journal');
  renderAll();
  document.getElementById('status-text').textContent = 'Scan terminé. Clique un fichier ● puis un dossier destination.';
};

// Journal toggle
document.getElementById('btn-journal').onclick = () => {
  document.getElementById('journal-panel').classList.toggle('hidden');
  renderJournal();
};

function renderJournal() {
  const container = document.getElementById('journal-content');
  if (state.journal.length === 0) {
    container.innerHTML = '<div style="color:#585b70">Aucune opération enregistrée.</div>';
    return;
  }
  container.innerHTML = [...state.journal].reverse().map(e => {
    const cls = e.status === 'copied' ? 'copied' : 'error';
    return `<div class="${cls}">[${e.timestamp.slice(0,19)}] ${e.filename} → ${e.destination}</div>`;
  }).join('');
}

function getJournalFiles() {
  const set = new Set();
  for (const entry of state.journal) {
    if (entry.status === 'copied') set.add(entry.filename);
  }
  return set;
}

function computeStatus(filename) {
  const inSource = Object.values(state.sourceFiles).some(idx => filename in idx);
  const journaled = getJournalFiles();
  if (journaled.has(filename)) return 'traite';
  if (inSource) return 'doublon';
  return 'nouveau';
}

// Rendering
function renderAll() {
  renderEpars();
  renderSource();
  renderJournal();
}

function renderEpars() {
  const container = document.getElementById('epars-container');
  container.innerHTML = '';
  for (const [dirPath, files] of Object.entries(state.eparsFiles)) {
    const dirDiv = document.createElement('div');
    dirDiv.className = 'directory';
    const shortName = dirPath.split('/').filter(Boolean).pop() || dirPath;
    dirDiv.textContent = shortName;
    dirDiv.title = dirPath;
    container.appendChild(dirDiv);

    const fileList = document.createElement('div');
    fileList.className = 'children';
    container.appendChild(fileList);

    const sorted = Object.entries(files).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [filename, relPath] of sorted) {
      const div = document.createElement('div');
      const status = computeStatus(filename);
      div.className = `file ${status}`;
      div.textContent = filename;
      div.dataset.filename = filename;
      div.dataset.fullpath = dirPath + '/' + relPath;
      div.dataset.eparsDir = dirPath;

      if (status === 'nouveau') {
        div.onclick = () => selectFile(div, filename, dirPath);
      }

      fileList.appendChild(div);
    }
  }
}

function renderSource() {
  const container = document.getElementById('source-container');
  container.innerHTML = '';
  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    // Group files by directory
    const tree = {};
    for (const [filename, relPath] of Object.entries(files)) {
      const parts = relPath.split('/');
      if (parts.length === 1) {
        (tree['__root__'] = tree['__root__'] || []).push(filename);
      } else {
        let current = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]] = current[parts[i]] || {};
        }
        current['__files__'] = current['__files__'] || [];
        current['__files__'].push(filename);
      }
    }
    renderTree(tree, container, dirPath);
  }
}

function renderTree(node, container, basePath) {
  const dirs = Object.keys(node).filter(k => k !== '__root__' && k !== '__files__').sort();
  for (const dirName of dirs) {
    const div = document.createElement('div');
    div.className = 'directory';
    div.textContent = dirName;
    div.dataset.dirpath = basePath + '/' + dirName;
    div.onclick = () => selectDestination(div);
    container.appendChild(div);

    const childContainer = document.createElement('div');
    childContainer.className = 'children';
    container.appendChild(childContainer);
    renderTree(node[dirName], childContainer, basePath + '/' + dirName);
  }

  const rootFiles = node['__root__'] || [];
  const subFiles = node['__files__'] || [];
  for (const f of [...rootFiles, ...subFiles]) {
    const div = document.createElement('div');
    div.className = 'file doublon';
    div.textContent = f;
    container.appendChild(div);
  }
}

function selectFile(el, filename, eparDir) {
  document.querySelectorAll('.file.selected').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedFile = filename;
  state.selectedEparDir = eparDir;
  document.getElementById('selected-info').textContent = `Sélectionné : ${filename}`;
  document.getElementById('selected-info').classList.remove('hidden');
  document.getElementById('status-text').textContent = 'Clique un dossier dans le panneau Source Data pour copier.';
}

async function selectDestination(el) {
  if (!state.selectedFile || !state.selectedEparDir) {
    document.getElementById('status-text').textContent = 'Sélectionne d\'abord un fichier ● dans le panneau gauche.';
    return;
  }
  const destDir = el.dataset.dirpath;
  const srcPath = state.eparsFiles[state.selectedEparDir][state.selectedFile];

  const fullSrc = state.selectedEparDir + '/' + srcPath;

  // Confirm dialog
  document.getElementById('dialog-msg').textContent =
    `Copier "${state.selectedFile}" vers "${destDir}" ?`;
  document.getElementById('confirm-dialog').classList.remove('hidden');

  document.getElementById('dialog-confirm').onclick = async () => {
    document.getElementById('confirm-dialog').classList.add('hidden');
    const res = await api('/copy', {
      method: 'POST',
      body: JSON.stringify({
        source_path: fullSrc,
        dest_dir: destDir,
        filename: state.selectedFile
      })
    });
    if (res.ok) {
      state.journal = await api('/journal');
      renderAll();
      document.getElementById('status-text').textContent =
        `✓ ${state.selectedFile} copié vers ${destDir}`;
      state.selectedFile = null;
      state.selectedEparDir = null;
      document.getElementById('selected-info').classList.add('hidden');
    } else {
      document.getElementById('status-text').textContent = `✗ Erreur : ${res.error}`;
    }
  };

  document.getElementById('dialog-cancel').onclick = () => {
    document.getElementById('confirm-dialog').classList.add('hidden');
  };
}

// Init
loadConfig();
```

- [ ] **Step 4: Manual verification — start server and test in browser**

Run:
```bash
cd /home/giak/projects/audio-sync-tool
pip install flask
python app.py
```
Then open `http://localhost:8765`. Verify:
1. Config panel opens and saves paths
2. Scan button works and shows files with correct badges (● nouveau, ○ doublon, ▲ traité)
3. Clicking a ● file then a source folder shows confirm dialog
4. Confirm copies the file, badge turns ▲, journal updates

- [ ] **Step 5: Commit**

```bash
git add templates/index.html static/style.css static/script.js
git commit -m "feat: frontend with two-panel UI and click-to-copy workflow"
```

---

### Task 3: README + Final Smoke Test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Permet de repérer
les fichiers manquants et de les copier en un clic vers le bon sous-dossier.

## Installation

```bash
pip install flask
```

## Utilisation

```bash
python app.py
# → http://localhost:8765
```

1. **Config** — renseigne le dossier source (`/home/giak/Music/select/style/`)
   et les dossiers éparpillés (un par ligne)
2. **Scan** — analyse tous les dossiers
3. **Rangement** — clique un fichier ● (nouveau) puis un dossier dans le
   panneau Source Data pour le copier

### Badges

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — fichier pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ▲ vert | Traité — déjà copié lors d'une session précédente |

## Structure

```
audio-sync-tool/
├── app.py              # Serveur Flask
├── templates/index.html # Interface deux panneaux
├── static/
│   ├── style.css       # Styles (thème sombre)
│   └── script.js       # Logique client
├── data/
│   ├── config.json     # Configuration persistante
│   └── journal.json    # Historique des copies
└── README.md
```

## Tests

```bash
pip install pytest
python -m pytest test_app.py -v
```
```

- [ ] **Step 2: Final smoke test — full workflow**

Run the server, open browser, execute full workflow once:
1. Config paths → Save
2. Scan → verify files appear with correct badges
3. Copy a ● file → verify badge turns ▲ and journal entry appears
4. Restart server → verify journal persists (badges still ▲)
5. Run tests: `python -m pytest test_app.py -v` → 5 PASS

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with instructions"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Scanner (index by filename) | Task 1, Step 4 |
| Comparator (nouveau/doublon/traité) | Task 2, Step 3 (`computeStatus`) |
| Two-panel interface | Task 2, Step 1 (HTML), Step 2 (CSS) |
| Click file → click destination → copy | Task 2, Step 3 (`selectFile` + `selectDestination`) |
| Copy, no delete | Task 1, Step 6 (`shutil.copy2`) |
| Journal persistence | Task 1, Step 6 (journal.json) |
| Config persistence | Task 1, Step 2 (config.json) |
| Routes: /, /scan, /copy, /config, /journal | Task 1, all steps |
| No npm | Platform choice — Flask + vanilla JS |
| Port 8765 | Task 1, `app.run(port=8765)` |
