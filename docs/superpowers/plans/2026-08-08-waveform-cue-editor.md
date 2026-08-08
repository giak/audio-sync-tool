# Éditeur waveform cue/loop — Plan d'implémentation (TDD)

> **Pour les agents exécutants** : sous-skill REQUIS — `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans`. Chaque étape est une case à cocher (`- [ ]`).

**Objectif** : permettre d'éditer les cues/loops hotcue (slots A–H) d'une piste de playlist, en patchant une copie locale du `collection.nml` de Traktor 4, avec export `.nml` patché pour HD/USB.

**Architecture** : module `nml.py` (parse ElementTree + index `(FILE, FILESIZE)` + écriture ciblée + export),
3 nouvelles routes Flask (`/api/nml/status`, `/api/track/match`, `/api/track/cues`), et un composant frontend
`cueEditor` (wavesurfer.js 7.12.11 + plugin Regions) branché sur `.pl-track` de la playlist. Reprise du
design 2026-08-07 amendé par l'audit 2026-08-08.

**Tech Stack** : Python 3 (stdlib xml), Flask, wavesurfer.js 7.12.11, esbuild, vitest+jsdom, pytest.

## Contraintes globales (issues de la spec + audit)

- HOTCUE **0..7** = slots A–H (A=0). Jamais de « 1..8 ».
- Éditable : `TYPE ∈ {0,5}` et `HOTCUE >= 0` ; **jamais** `TYPE=3` (FLIP) ni `TYPE=4` (grille) ; ne pas
  reconstruire `DISPL_ORDER`.
- loop = `TYPE=5` (`LEN > 0`) ; cue = `TYPE=0`.
- Index NML par clé `(FILE, FILESIZE)` — `FILE` seul est ambigu (5 708 doublons réels) → multi-match
  **courant** (~12 %) : sélection + mémorisation obligatoires ; jamais d'écriture aveugle multi-match.
- Le NML n'est **jamais modifié pendant que Trakt 4 tourne** (copie locale). Backup `.bak` unique écrasé,
  écriture atomique `.tmp` + `os.replace`.
- Round-trip : la spec garantit attributs + valeurs +ordre identiques ; le formatage ↔ byte-identical
  n'est **pas** un objectif (delta connu −0,4 % avec indent 2 espaces).
- Header XML : `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>` (ET ne l'écrit pas seul).
- `wavesurfer.js@7.12.11` exactement (v8 en beta), bundle **local** (via esbuild, zéro CDN).
- Config : champs optionnels `traktor_nml_path`, `traktor_export_root`, `traktor_export_volume`.
  Non renseignés → status `configured:false` → bouton ⌿ inactif + bandeau.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `nml.py` | parse/index/cue/écriture atomique + export LOCATION | **create** |
| `test_nml.py` | unit tests nml.py (pytest) | **create** |
| `tests/fixtures/nml-sample.xml` | fixture NML réelle tronquée (5 ENTRIES) | **create** |
| `app.py` | routes `/api/nml/status`, `/api/track/match`, `/api/track/cues` + export étendu | **modify** |
| `test_app.py` | tests des routes (style existant) | **modify** |
| `templates/index.html` | modal `#modal-cue-editor` + bouton ⌿ playlist | **modify** |
| `static/src/state.ts` | `ActiveModal` += `cue-editor` | **modify** |
| `static/src/commands/modals.ts` | Escape → close cueEditor | **modify** |
| `static/src/cueModel.ts` | mapping pur cues JSON ↔ NML (hors DOM) | **create** |
| `static/src/render/cueEditor.ts` | composant modal (wavesurfer + régions) | **create** |
| `static/src/cueModel.test.ts`, `render/cueEditor.test.ts` | vitest | **create** |
| `static/src/commands/playlist.ts` | raccourci Ctrl+E → export (inchangé) ; balise d'ouverture | **modify** |
| `static/src/playlist.ts` | `trackRowActions`/bouton ⌿ (ouverture) | **modify** |

---

## Task 1 — Module `tag_nml.py` : parse + index + `get_cues`

**Files :**
- Create : `tests/fixtures/nml-sample.xml`
- Create : `nml.py`
- Create : `test_nml.py`

**Interfaces:**
- Produces : `load_nml(path) -> ET.ElementTree` ; `build_index(tree) -> dict[tuple[str,str], list[ET.Element]]` ;
  `get_cues(entry) -> list[dict]` (déjà filté `TYPE∈{0,5}` + `HOTCUE 0..7`, avec
  `{type, start, len, hotcue, name, displ_order, color}`) ; `get_entry_meta(entry) -> dict`
  (`{filename, artist, title, localid}`).

- [ ] **Etape 1 : fixture réelle**

```bash
mkdir -p tests/fixtures
./venv/bin/python - <<'EOF'
import xml.etree.ElementTree as ET, io
root = ET.parse('data/traktor4/collection.nml').getroot()
entries = root.findall('./COLLECTION/ENTRY')[:5]
nl='\n'
out = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
out += '<NML VERSION="20"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor Pro 4"></HEAD>\n'
out += f'<COLLECTION ENTRIES="5">\n'
for e in entries:
    out += '  ' + ET.tostring(e, encoding='unicode') + '\n'
out += '</COLLECTION>\n</NML>\n'
open('tests/fixtures/nml-sample.xml','w').write(out)
print('fixture écrit', len(out), 'bytes')
EOF
```
Attendu : `fixture écrit ~6Ko bytes`, fichier rattaché `tests/fixtures/nml-sample.xml`.

- [ ] **Etape 2 : test qui échoue — `test_nml.py`**

```python
import os
import xml.etree.ElementTree as ET
from nml import load_nml, build_index, get_cues, get_entry_meta

DATA = os.path.join('tests', 'fixtures', 'nml-sample.xml')


def test_load_nml_parses():
    tree = load_nml(DATA)
    assert tree.getroot().get('VERSION') == '20'


def test_build_index_keys():
    tree = load_nml(DATA)
    idx = build_index(tree)
    assert len(idx) >= 5
    file_size_keys = [k for k in idx if k[1]]
    assert len(file_size_keys) >= 5  # (FILE, FILESIZE) présent


def test_build_index_duplicates():
    # fixture avec doublon FILE mais tailles différentes (artificiel)
    tree = load_nml(DATA)
    idx = build_index(tree)
    # le fixture réel n'a pas de doublons volontaires ; on vérifie structure
    assert all(isinstance(v, list) for v in idx.values())


def test_get_cues_filters():
    tree = load_nml(DATA)
    entry = tree.getroot().find('.//ENTRY')
    cues = get_cues(entry)
    for c in cues:
        assert c['type'] in ('0', '5')
        assert c['hotcue'] is not None and 0 <= int(c['hotcue']) <= 7


def test_get_entry_meta():
    tree = load_nml(DATA)
    entry = tree.getroot().find('.//ENTRY')
    meta = get_entry_meta(entry)
    assert meta['filename'].endswith('.mp3')
    assert 'artist' in meta and 'title' in meta
```

- [ ] **Etape 3 : run — doit échouer**

```bash
./venv/bin/python -m pytest test_nml.py -q
```
Attendu : `FAILED (module nml introuvable)`.

- [ ] **Etape 4 : implémentation minimale `nml.py`**

```python
"""Lecture bas niveau du collection.nml de Traktor — parse+index+lecture."""
import os
import xml.etree.ElementTree as ET

NML_DEFAULT = {
    'type': '0',
    'len': '0.000000',
}

def load_nml(path):
    """Parse le fichier NML (ElementTree). Lève ET.ParseError si invalide."""
    return ET.parse(path)

def build_index(tree):
    """Index { (FILE, FILESIZE) : [ENTRY,...] } sur les ENTRIES du COLLECTION.

    FILESIZE pour lever l'ambiguïté (5 708 doublons de nom réels).
    """
    idx = {}
    for entry in tree.getroot().findall('./COLLECTION/ENTRY'):
        loc = entry.find('LOCATION')
        if loc is None:
            continue
        file = loc.get('FILE', '')
        size = ''
        info = entry.find('INFO')
        if info is not None:
            size = info.get('FILESIZE', '')
        idx.setdefault((file, size), []).append(entry)
    return idx

def get_cues(entry, allow_types=('0', '5')):
    """Cue list filtrees : TYPE in allow_types ET HOTCUE 0..7. Field: (start, len, hotcue, name, displ_order, color)."""
    cues = []
    for c in entry.findall('CUE_V2'):
        if c.get('TYPE') not in allow_types:
            continue
        hotcue = c.get('HOTCUE')
        if hotcue is None or not hotcue.isdigit() or int(hotcue) < 0 or int(hotcue) > 7:
            continue
        cues.append({
            'start': c.get('START', '0.000000'),
            'len': c.get('LEN', '0.000000'),
            'hotcue': int(hotcue),
            'name': c.get('NAME', ''),
            'displ_order': c.get('DISPL_ORDER', '0'),
            'color': c.get('COLOR', ''),
        })
    return cues

def get_entry_meta(entry):
    loc = entry.find('LOCATION')
    meta = {
        'filename': loc.get('FILE', '') if loc is not None else '',
        'artist': entry.get('ARTIST', ''),
        'title': entry.get('TITLE', ''),
    }
    info = entry.find('INFO')
    if info is not None:
        meta['filesize'] = info.get('FILESIZE', '')
        meta['playtime'] = info.get('PLAYTIME', '')
    return meta
```

- [ ] **Etape 5 : run tests — pass**

```bash
./venv/bin/python -m pytest test_nml.py -q
```
Attendu : `5 passed`.

- [ ] **Etape 6 : commit**

```bash
git add tests/fixtures/nml-sample.xml nml.py test_nml.py
git commit -m "feat(nml): parse + index (FILE,FILESIZE) + get_cues/entry_meta"
```

---

## Task 2 — `write_cues` + `save_nml` : écriture ciblée + atomique

**Files:**
- Modify : `nml.py`
- Modify : `test_nml.py`

**Interfaces:**
- Consumes : `load_nml`, `build_index`, `get_entry_meta` (Task 1).
- Produces :
  - `write_cues(entry, cues: list[dict])` — remplace les `CUE_V2` de `entry` **de même TYPE éditable**
    par les cues passées ; conserve `CUE_V2` `TYPE∉{0,5}` et tous les autres nœuds. Chaque cue dict reçu
    doit déjà avoir les clés `type,start,len,hotcue,name,displ_order,color`.
  - `save_nml(path, tree)` — backup `path + '.orig.nml'` (écrasé) si existe ; écrit dans `path + '.tmp'`
    avec header `standalone="no"` ; `os.replace` → atomique.

- [ ] **Etape 1 : tests qui échouent (ajouter à `test_nml.py`)**

```python
def test_write_cues_replace_only_editable(tmp_path):
    tree = load_nml(DATA)
    entry = tree.getroot().find('./COLLECTION/ENTRY')
    cues = get_cues(entry)
    assert cues, "fixture doit avoir au moins un cue A-H"
    original_count = len(entry.findall('CUE_V2'))
    editable_before = len(cues)

    cues[0]['start'] = '60.125000'
    write_cues(entry, cues)

    assert len(entry.findall('CUE_V2')) == original_count  # total nœuds inchangé (même nb de CUE_V2)
    new_cues = get_cues(entry)
    assert new_cues[0]['start'] == '60.125000'
    # TYPE=4 présent dans fixture → pas supprimé
    types = {c.get('TYPE') for c in entry.findall('CUE_V2')}
    assert '4' in types


def test_save_nml_atomic_and_backup(tmp_path):
    dst = tmp_path / 'collection.nml'
    dst.write_text(open(DATA).read())
    tree = load_nml(str(dst))
    tree.getroot().set('VERSION', '21')
    save_nml(str(dst), tree)
    # ré-parse et contenu
    t2 = load_nml(str(dst))
    assert t2.getroot().get('VERSION') == '21'
    # backup créé
    assert (tmp_path / 'collection.nml.bak.nml').exists()
    # header standalone
    head = dst.read_text(encoding='utf-8').splitlines()[0]
    assert 'standalone="no"' in head


def test_save_nml_header_and_half_not_commit():
    dst = tmp_path / 'collection2.nml'
    dst.write_text(open(DATA).read(), encoding='utf-8')
    tree = load_nml(str(dst))
    save_nml(str(dst), tree)
    raw = dst.read_text(encoding='utf-8')
    assert '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>' in raw
```

- [ ] **Etape 2 : run — fail**

```bash
./venv/bin/python -m pytest test_nml.py::test_write_cues_replace_only_editable -q
```
Attendu : `FAILED (write_cues n'existe pas)` + `save_nml` absent.

- [ ] **Etape 3 : implémentation (append à `nml.py`)**

```python
def _cue_to_element(cue: dict, tag: str = 'CUE_V2') -> ET.Element:
    out = {}
    if 'start' in cue and cue['start']:
        out['START'] = str(cue['start'])
    if 'len' in cue and cue['len']:
        out['LEN'] = str(cue['len'])
    out['NAME'] = str(cue.get('name', 'n.n.'))
    out['REPEATS'] = '-1'
    out['DISPL_ORDER'] = str(cue.get('displ_order', '0'))
    out['TYPE'] = str(cue.get('type', '0'))
    out['HOTCUE'] = str(cue.get('hotcue', '-1'))
    if cue.get('color'):
        out['COLOR'] = str(cue['color'])
    return ET.Element(tag, attrib=out)


def write_cues(entry, cues):
    """Remplace les CUE_V2 éditable (TYPE 0/5) de l'ENTRY par la liste fournie.
    Les CUE_V2 TYPE∉{0,5} (grille, flip…) et tous les autres nœuds sont conservés."""
    kept = [c for c in entry.findall('CUE_V2') if c.get('TYPE') not in ('0', '5')]
    for c in list(entry.findall('CUE_V2')):
        entry.remove(c)
    new_els = [_cue_to_element(cue) for cue in cues]
    for el in new_els + kept:
        entry.append(el)


def _write_xml(path, tree):
    """Fichier XML valide avec le header exact de Traktor (standalone="no")."""
    tmp = path + '.tmp'
    with open(tmp, 'wb') as f:
        f.write(b'<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n')
        import io
        buf = io.BytesIO()
        tree.write(buf, encoding='UTF-8', xml_declaration=False)
        f.write(buf.getvalue())
    os.replace(tmp, path)


def _copy_file(src, dst):
    with open(src, 'rb') as f_src, open(dst, 'wb') as f_dst:
        while True:
            chunk = f_src.read(65536)
            if not chunk:
                break
            f_dst.write(chunk)


def save_nml(path, tree, backup=True):
    """Backup .bak.nml écrasé (optionnel) puis écriture atomique .tmp → os.replace."""
    if backup and os.path.exists(path):
        _copy_file(path, path + '.bak.nml')
    _write_xml(path, tree)
```

- [ ] **Etape 4 : tests verts**

```bash
./venv/bin/python -m pytest test_nml.py -q
```
Attendu : `9 passed`.

- [ ] **Etape 5 : commit**

```bash
git add nml.py test_nml.py && git commit -m "feat(nml): write_cues filter + save_nml atomique (backup+header)"
```

---

## Task 3 — Routes `/api/nml/status` et `/api/track/match`

**Files:**
- Modify : `app.py` (ajout helpers + 2 routes)
- Modify : `test_app.py`

**Interfaces:**
- Consumes : `nml.load_nml`, `nml.build_index`, `nml.get_entry_meta`, `get_active_config()` (existant).
- Produces :
  - `GET /api/nml/status` → `{configured: bool, path, lastModified}` ;
  - `GET /api/track/match?path=<mp3>` → `{ok, entries: [{filename, artist, title, filesize, cues}], multiple}` ;
    `entries.cues` est la liste de `get_cues` ; illegal pour `match` : `(FILE, FILESIZE)` — when la FILESIZE du
    mp3 **local** n'existe connue via `os.path.getsize`.

- [ ] **Etape 1 : tests fail**

```python
def test_nml_status_unconfigured(client, clean_state):
    rv = client.get('/api/nml/status')
    data = rv.get_json()
    assert data == {'configured': False, 'path': '', 'lastModified': None}


def test_nml_status_configured(client, tmp_path):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': '', 'epars_dirs': []})
    rv = client.get('/api/nml/status')
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['configured'] is True
    assert data['path'] == str(nml_path)
    assert data['lastModified'] is not None


def test_track_match_single(client, tmp_path):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    filename = 'Carbon Decay - In The Warehouse.mp3'  # de la fixtxture
    # fichier local pour le match
    local = tmp_path / 'x.mp3'
    local.write_bytes(b'x' * 5)
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['multiple'] in (True, False)
```

- [ ] **Etape 2 : run → fail** (`pytest test_app.py::test_nml_status_unconfigured -q` → route 404 + tests raymond).

- [ ] **Etape 3 : implémentation dans `app.py` (après `get_active_config`)**

Ajouter en tête de `app.py` (avec les imports existants) :

```python
import nml as nml_module
from xml.etree import ElementTree as ET
```

Puis le code des routes :

```python
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
```

- [ ] **Etape 4 : tests verts + régressi**

```bash
./venv/bin/python -m pytest test_app.py test_nml.py -q
```
Attendu : tests ok + zéro régressi (suite existante intacte).

- [ ] **Etape 5 : commit** `feat(api): nml status + track match (FILE,FILESIZE)`

---

## Task 4 — `POST /api/track/cues` (écriture ciblée + backup)

**Files:**
- Modify : `app.py`
- Modify : `test_app.py`

**Interfaces:**
- Consumes : `get_nml_index()`, `nml.write_cues`, `nml.save_nml`.
- Produces : `POST /api/track/cues` avec body `{path, entry: {filename, filesize}, cues:[…]}` — le client a déjà
  sélectionné l'entrée (index stable) ; serveur re-matche par `(filename, filesize)` et exception si
  `len(entries) > 1` et `entry` pas explicitement disambigé → leverage du POST pour multi-match :

  Body : `{path, filename, filesize, entry?: int, cues: [...]}` — quand `entry` est FOURNI (indice dans
  `entries` retourné par /match), on écrit la nième. Sinon si 1 seul match → écrit direct ; si >1 et pas
  d'`entry` → 409 `{error: 'ambiguous', entries:[...]}`.

- [ ] **Etape 1 : fail tests**

```python
def test_cues_write_ok(client, tmp_path):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    # match-determiné : piste unique de la fixture
    local = tmp_path / 'x.mp3'
    local.write_bytes(b'x' * 5)
    rv = client.post('/api/track/cues', json={
        'path': str(local),
        'filename': 'Carbon Decay - In The Warehouse.mp3',
        'filesize': str(local.stat().st_size),  # 5
        'cues': [{'type': '0', 'start': '10.0', 'len': '0.000000', 'hotcue': 0,
                  'name': 'n.n.', 'displ_order': '0'}]
    })
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    # vérifier le écrit
    tree = nml_module.load_nml(str(nml_path))
    assert (tmp_path / 'c.nml.bak.nml').exists()


def test_cues_post_409_multiple(client, tmp_path, monkeypatch):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    # on crée 2 faux entrants de même FILE/FILESIZE dans l'index -> app index sur f,
    # on passe pas `index` → 409
    rv = client.post('/api/track/cues', json={
        'path': str(tmp_path/'x.mp3'), 'filename': 'DUP.mp3', 'filesize': '1',
        'cues': [{'type': '0', 'start': '0', 'len':'0', 'hotcue': 0}]
    })
    assert rv.status_code in (400, 409)
```

- [ ] **Etape 2 : run fail**

- [ ] **Etape 3 : impl**

```python
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
        cues.append({'type': str(c.get('type', '0')),
                     'start': str(c.get('start', '0.0')),
                     'len': str(c.get('len', '0.000000')),
                     'hotcue': int(c.get('hotcue', -1)),
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
```

- [ ] **Etape 4 : tests verts + régressi** (`pytest test_app.py test_nml.py`)
- [ ] **Etape 5 : commit** `feat(api): POST /api/track/cues (écrite ciblée+backup)`

---

## Task 5 — Export `.nml` patché pour HD/USB

**Files:**
- Modify : `nml.py` (ajout `export_collection(tree, entries, export_root, volume)` + helper `traktor_dir`)
- Modify : `app.py` (`/playlists/export` étend) + `test_app.py`

**Interfaces:**
- Consumes : nml parser ; liste `pl['tracks']` (sec du manifeste : `filename`, `fullPath`) ; `NCM traktor_export_root/volume`.
- Produces :
  - `nml.traktor_dir(relpath, volume) -> str` — `/:` + segments séparés `/:` + `/:` (ex. `/:TRAKTOR_USB/:folder/:`);
  - `nml.build_export_nml(playlist_tracks, nml_path, export_root, volume) -> str` — écrit `collection.nml`
    dans `export_root`, avec ENTRIES
    filtrées (match par basename) et LOCATION réécrites `DIR`/`VOLUME`/`VOLUMEID`.
- Compat : (`playlists/export`) réutilise `export_playlist` existant ; après copie des fichiers, si
  `traktor_export_root` configuré → génère `collection.nml` au root (nouveau task d'export NML).

- [ ] **Etape 1 : fail tests (test_nml.py + test_app.py)**

```python
def test_traktor_dir():
    from nml import traktor_dir
    assert traktor_dir('/Volumes/TRAKTOR_USB/Mix/Folder', 'TRAKTOR_USB') == '/:TRAKTOR_USB/:Mix/:Folder/:'
```

```python
def test_export_nml_written(client, tmp_path, monkeypatch):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    export_root = tmp_path / 'export'
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path),
        'traktor_export_root': str(export_root),
        'traktor_export_volume': 'TRAKTOR_USB',
        'source_data': str(tmp_path)})
    # données minimale
    pl_name = 'pl'
    client.post('/playlists', json={'name': pl_name, 'tracks': [
        {'filename': 'Carbon Decay - In The Warehouse.mp3',
         'fullPath': str(tmp_path / 'Carbon Decay - In The Warehouse.mp3'),
         'duration': 132}]})
    # fichier source (partiel) pour l'export
    (tmp_path / 'Carbon Decay - In The Warehouse.mp3').write_bytes(b'abc')
    rv = client.post('/playlists/export', json={'name': pl_name})
    assert rv.status_code == 200
    assert os.path.exists(export_root / 'collection.nml')
    assert '<NML' in (export_root / 'collection.nml').read_text()
```

- [ ] **Etape 2 : fail run**
- [ ] **Etape 3 : impl `nml.py`** — le plan de Task 2 définit déjà `_write_xml` ; on s'appuie sur lui pour l'export (pas de backup) :

```python
def traktor_dir(relpath, volume):
    parts = [p for p in relpath.strip('/').split('/') if p]
    seg = [volume] + parts
    return '/:' + '/:'.join(seg) + '/:'
```

- [ ] **Etape 3 partielle : `build_export_nml` (append à `nml.py`, s'appuie sur `_write_xml`, `build_index`, `load_nml` déjà définis)**

```python
def build_export_nml(playlist_tracks, nml_path, export_root, volume):
    """Écrit export_root/collection.nml : ENTRIES de la playlist, LOCATION réécrites.

    Match : clé (FILE, FILESIZE) — basename de la piste + os.path.getsize du fichier
    local. Multi-match : premier hit (l'UI a déjà tranché la même clé au moment de
    l'édition — même série de hits, ordre stable). Retourne le chemin écrit, ou None
    si aucune piste ne matche."""
    tree = load_nml(nml_path)
    root = tree.getroot()
    coll = root.find('./COLLECTION')
    if coll is None:
        return None
    index = build_index(tree)
    wanted = {}
    for t in playlist_tracks:
        fn = t.get('filename', '')
        local = t.get('fullPath', '')
        size = str(os.path.getsize(local)) if local and os.path.exists(local) else ''
        hits = index.get((fn, size), [])
        if not hits and size:
            hits = index.get((fn, ''), [])
        if not hits:
            continue
        e = hits[0]
        rel = os.path.relpath(os.path.dirname(local), export_root) if local else ''
        loc = e.find('LOCATION')
        if loc is not None:
            loc.set('DIR', traktor_dir(rel if rel and rel != '.' else '', volume))
            loc.set('VOLUME', volume)
            if loc.get('VOLUMEID'):
                loc.set('VOLUMEID', 'ffffffff')
        wanted[fn] = e
    entries = [wanted[fn] for fn in [t['filename'] for t in playlist_tracks] if fn in wanted]
    if not entries:
        return None
    new_coll = ET.Element('COLLECTION', attrib={'ENTRIES': str(len(entries))})
    for e in entries:
        new_coll.append(e)
    new_root = ET.Element('NML', attrib={'VERSION': '20'})
    head = ET.SubElement(new_root, 'HEAD')
    head.set('COMPANY', 'www.native-instruments.com')
    head.set('PROGRAM', 'Traktor Pro 4')
    new_root.append(new_coll)
    os.makedirs(export_root, exist_ok=True)
    out = os.path.join(export_root, 'collection.nml')
    _write_xml(out, ET.ElementTree(new_root))  # export pur : pas de backup
    return out
```

- [ ] **Etape 4 : app.py — étendre `/playlists/export`** (dans `export_playlist`, avant le `return jsonify(result)` final) :

```python
    # … après la copie des fichiers (fin de la fonction existante, avant return) :
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
```

- [ ] **Etape 5 : tests verts + régressi + commit** `feat(export): collection.nml patché avec LOCATION réécrites`

---

## Task 6 — Frontend : modal + état

**Files:**
- Modify : `static/src/state.ts` (ActiveModal + VALID_MODALS + `cueEditorTrack` state?)
- Modify : `templates/index.html` (modal html + bouton ⌿ sur playlist row)
- Create : `static/src/render/cueEditor.ts` (scaffold : open + close + initial fetch status)
- Modify : `static/src/commands/modals.ts` (Esc pour cueEditor)

**Interfaces:**
- Consumes : `state` (Proxy) ; `openModal/closeAllModals` de `../../ui.js`.
- Produces : `openCueEditor(track: PlaylistTrack)`, `renderCueEditor()` (ouverture initial) ; events
  `state.cueEditorVisible` non nécessaire — on réutilise `activeModal='cueEditor'`.

- [ ] **Etape 1 : fail vitest (`static/src/render/cueEditor.test.ts`)** — boilerplate : DOM minimal

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupDOM } from '../integration.test.js'; // vérifier le helper existant ; sinon construire
```

Vérifier le test pattern existant : `render.test.ts` — utilise un setup DOM → à suivre présent.
Le scaffold passe **sans** huge : on ne mocke pas wavesurfer ici, la modal est question du Task 7.
Tests Task 6 :
- ouvrir modal → `activeModal==='cueEditor'` + `#modal-cue-editor` non hidden
- Esc → fermé (bind)

- [ ] **Etape 2 : impl state**

```ts
// state.ts
type ActiveModal = 'config' | 'legend' | 'journal' | 'dialog' | 'playlists' | 'cueEditor' | null;
const VALID_MODALS = new Set([null, 'config', 'legend', 'journal', 'dialog', 'playlists', 'cueEditor']);
```

- [ ] **Etape 3 : template — HTML**

```html
<!-- Cue editor modal -->
<div id="modal-cue-editor" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content modal-lg">
    <div class="modal-header">
      <h3>⌿ Éditeur cues / loops — <span id="cue-editor-title"></span></h3>
      <button class="modal-close">✕</button>
    </div>
    <div id="cue-editor-status"></div>
    <div id="cue-editor-waveform"></div>
    <div id="cue-editor-controls">
      <span class="cue-slot" data-slot="0">A</span> … <span class="cue-slot" data-slot="7">H</span>
      <button id="cue-btn-loop">⟳ Loop</button>
      <button id="cue-btn-save">💾 Enregistrer</button>
    </div>
  </div>
</div>
```

- [ ] **Etape 4 : commandes/modals.ts ajouter**

```ts
registry.bind({ key: 'Escape', activeModal: 'cueEditor', handler: () => closeAllModals() });
```

- [ ] **Etape 5 : scaffold `render/cueEditor.ts`** : `openCueEditor(track)` → fetch `/api/nml/status` →
  configure:false → bandeau + désactive bouton ; sinon `state.activeModal='cueEditor'` + rend le DOM placeholder.

- [ ] **Etape 6 : tests verts + lint/typecheck** (`npm run typecheck && npm run lint`)
- [ ] **Etape 7 : commit** `feat(ui): modal cue editor (scaffold)`

---

## Task 7 — Composant cueEditor : wavesurfer + régions

**Files:**
- Modify : `static/src/render/cueEditor.ts`
- Create : `static/src/cueModel.ts` (mapping pur, testable sans DOM)
- Create : `static/src/render/cueEditor.test.ts`, `static/src/cueModel.test.ts`
- Modify : `package.json` (deps) — installer wavesurfer via npm

**Interfaces:**
- Consumes : `api()` (front), `openCueEditor(entry)` ; `getCuesEntry(path)` backend.
- Produces : `cueModel.ts`: `hotcueLabel(h) -> 'A'|'B'…`, `cuesToRegions(cues) -> [{db.start}]`
  (filter `TYPE=0/5`, HOTCUE 0-7), `regionToCue(region) -> dict`
  ; `cueEditor.ts`: `createWaveSurfer(url, cues, onRegionUpdate)`.

- [ ] **Etape 1 : install**

```bash
npm install wavesurfer.js@7.12.11
```
(pin exact — package.json `"wavesurfer.js": "7.12.11"` ; bundle via esbuild depuis import.)

- [ ] **Etape 2 : fail vitest `cueModel.test.ts`**

```typescript
import { hotToLabel, cuesToRegions, regionToCue } from './cueModel.js';

describe('cueModel', () => {
  it('mappe hotcue ≤7 → A..H', () => {
    expect(hotToLabel(0)).toBe('A');
    expect(hotToLabel(7)).toBe('H');
  });
  it('filtre les cues TYPE=4 / HOTCUE lenigatif', () => {
    const cues = [
      { type: '0', start: 5, hotcue: 2, name: '', displ_order: '0' },
      { type: '4', start: 1, hotcue: -1, name: '', displ_order: '0' },
      { type: '5', start: 10, len: 4, hotcue: 0, name: '', displOrder: '1' },
    ];
    const regs = cuesToRegions(cues);
    expect(regs).toHaveLength(2);
  });
});
```

- [ ] **Etape 3 : impl `cueModel.ts`** (pur, sans import DOM)

```typescript
export interface CueDTO {
  type: string; start: number; len: number; hotcue: number;
  name: string; displ_order: string; color?: string;
}
export function hotToLabel(h: number): string {
  return String.fromCharCode(65 + h).slice(0, 1); // A=0 .. H=7
}
export function labelToHot(l: string): number {
  return (l.charCodeAt(0) - 65);
}
export function cuesToRegions(cues: CueDTO[]): Array<{ start: number; end: number; id: number; color?: string }> {
  return cues
    .filter(c => (c.type === '0' || c.type === '5') && c.hotcue >= 0 && c.hotcue <= 7)
    .map((c, i) => ({
      start: c.start,
      end: c.type === '5' && c.len > 0 ? c.start + c.len : c.start + 0.08,
      id: i,
      color: c.color || (c.type === '5' ? '#ffaa00' : '#55aaff'),
    }));
}
export function regionToCue(r: { start: number; end: number; id: number; color?: string }): CueDTO {
  const isLoop = r.end - r.start > 0.1;
  return {
    type: isLoop ? '5' : '0',
    start: r.start,
    len: isLoop ? Number((r.end - r.start).toFixed(6)) : 0,
    hotcue: r.id,
    name: 'n.n.',
    displ_order: String(r.id),
    color: r.color,
  };
}
```

- [ ] **Etape 4 : fail/vert test wavesurfer intégration (jsdom dummy)** — pour éviter croquer jsdom→not
  réellement capable de décoder audio : on **mock** `wavesurfer.js` :

```ts
vi.mock('wavesurfer.js', () => ({
  default: class MockWS {
    static create(opts: any) {
      return {
        on: vi.fn(), destroy: vi.fn(), registerPlugin: vi.fn(),
        getDuration: () => 60, setTime: vi.fn(),
      };
    }
  },
}));
```
Test : `createWaveSurfer('/audio?path=x', el)` → `WaveSurfer.create` appelé avec `url` égal
`/audio?path=…` + plugin Regions configuré ; `selectedRegion` drag → `onRegionChange` callback.

- [ ] **Etape 5 : impl `cueEditor.ts`** — réeltions :

```typescript
import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { cuesToRegions, regionToCue, hotToLabel } from '../cueModel.js';
import type { CueDTO } from '../cueModel.js';

let _saving = false;

export interface PlaylistTrackLite { filename: string; fullPath: string; }

export interface CueEntryRef { filename: string; filesize: string; }

let ws: WaveSurfer | null = null;
let _regions: any = null;
let _entryRef: CueEntryRef | null = null;

export async function openCueEditor(track: PlaylistTrackLite): Promise<void> {
  const status = await api<{ configured: boolean }>('/api/nml/status');
  if (!status.configured) { showToast('⚠️ Configurer traktor_nml_path'); return; }
  const data = await api<{ ok: boolean; entries: any[]; multiple: boolean }>(
    `/api/track/match?path=${encodeURIComponent(track.fullPath)}`);
  if (!data.ok || data.entries.length === 0) { showToast('⚠️ Aucune piste matchée dans la collection'); return; }
  // sélecteur multi-homonyme (Task 8) — pour l'instant premier
  const entry = data.entries[0];
  _entryRef = { filename: entry.filename, filesize: entry.filesize };
  (document.getElementById('cue-editor-title') as HTMLElement | null)!.textContent =
    `${entry.artist || ''} — ${entry.title || entry.filename}`;
  state.activeModal = 'cueEditor';
  await renderWaveform(track.fullPath, entry.cues || []);
}

async function renderWaveform(path: string, cues: CueDTO[]): Promise<void> {
  const el = document.getElementById('cue-editor-waveform') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
  ws = WaveSurfer.create({ container: el, url: `/audio?path=${encodeURIComponent(path)}` });
  ws.on('ready', () => {
    _regions = ws!.registerPlugin(Regions.create());
    for (const r of cuesToRegions(cues)) _regions.addRegion(r);
  });
  // boutons slots + loop interagissent sur _regions (Task 7 étape 5b ci-dessous)
}

export function destroyCueEditor(): void { ws?.destroy(); ws = null; _regions = null; }

export async function saveCues(cues: CueDTO[]): Promise<void> {
  if (!_entryRef) throw new Error('no entry');
  await api('/api/track/cues', {
    method: 'POST',
    body: JSON.stringify({ filename: _entryRef.filename, filesize: _entryRef.filesize, cues }),
  });
}
```

**Étape 5b — interactions (boutons A–H + loop + sauvegarde, dans le même fichier cueEditor.ts) :**

```typescript
export function onSlotClicked(slot: number): void {
  if (!ws || !_regions) return;
  const time = ws.getCurrentTime();
  // retirer si ce slot existe déjà
  for (const r of _regions.getRegions()) {
    if (mapSlot(r) === slot) r.remove();
  }
  const label = hotToLabel(slot);
  _regions.addRegion({ start: time, end: time + 0.08, id: slot, label, color: '#55aaff' });
}
function mapSlot(r: any): number | null {
  return typeof r.id === 'string' && /^[A-H]$/.test(r.id) ? r.id.charCodeAt(0) - 65 : null;
}
export function onSaveClicked(): Promise<void> | void {
  if (!_regions || _saving) return;
  _saving = true; // module-local : désactive le bouton pendant la requête (KISS, pas de state)
  const btn = document.getElementById('cue-btn-save') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  const cues = _regions.getRegions().map((r: any) => regionToCue(r));
  return saveCues(cues)
    .then(() => showToast('✅ sauvegardé'))
    .catch((err: unknown) => showToast(`❌ ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => { _saving = false; if (btn) btn.disabled = false; });
}
```

- [ ] **Etape 6 : verts + typecheck + lint** ; commit
  `feat(ui): cue editor wavesurfer + regions (de l'API match/cues)`

---

## Task 8 — Sélection homonymes + intégration playlist (bouton ⌖)

**Files:**
- Modify : `static/src/render/cueEditor.ts` ; `static/src/playlist.ts` (bouton row) ; maybe renderer playlistUI
- Create/test : extension cueEditor.test.ts

**Interfaces:**
- Consumes : `data.multiple` du match ; mémorisation localStorage.

- [ ] **Etape 1 : fail test**

```ts
it('affiche le sélecteur quand multiple matchs', async () => {
  // mock api match → entries: 2
  await openCueEditor(track);
  const sm = document.getElementById('cue-editor-select');
  expect(sm).not.toBeNull();
  expect(sm.textContent).toContain('Native');
});
```

- [ ] **Etape 2 : impl** — si `entries.length > 1` : modal ou `<select>` dans le contrôle, pré-sélection
  localStorage `cue/sel:<filename>` = index chez ; `onChange` → rafraichit waveform.

- [ ] **Etape 3 : bouton ⌖ sur `.pl-track`** — playlistUI.ts :

```ts
function addCueButton(row, fullPath, filename) {
  const btn = document.createElement('button');
  btn.className = 'cue-btn'; btn.textContent = '⌖';
  btn.onclick = () => openCueEditor({ filename, fullPath });
  row.appendChild(btn);
}
```

- [ ] **Etape 4 : tests vert** (vitest render playlist → bouton présent ; click → `openCueEditor` avec l'objet)
- [ ] **Etape 5 : commit** `feat(ui): sel. homonymes + bouton ⌖ playlist`

---

## Task 9 — Interactions ficelles (audio, fermeture, statut)

**Files:** cueEditor.ts, state.ts, ui.ts, tests

- [x] **Etape 1 : tests** — fermer modal (Esc/backdrop) → `destroyCue()` ; le bouton save désactivé pendant POST (disabled)
- [x] **Etape 2 : impl** — `state.on('activeModal:changed', …)` in cueEditor.ts → quand ≠ cueEditor → destroy
- [x] **Etape 3 : CSS** — `.cue-slot.live`, `.modal-lg` (style.css, pas isolation).
- [x] **Etape 4 : verts + full verify**

```bash
npm run typecheck && npm run lint && npm run build && npm test && ./venv/bin/python -m pytest
```

- [ ] **Etape 5 : vérification manuelle réelle**

```bash
npm start
# 1. config.json → profil 'travail' : traktor_nml_path=data/traktor4/collection.nml
# 2. TODO une playlist, ⌖ sur un morceau → modal → cue A à 0:30 → Enregistrer
# 3. relancer /api/track/match : cues contient le nouveau cue ; NML re-serialisé, backup créé
# 4. git status : seul files attendus modifiés (pas data/) — data/traktor4 dans .gitignore ?
```

- [x] **Etape 6 : commit final**

---

## Self-Review (doit être fait au moment du run)

- [ ] Spec couverte : §2.1 config ✓ (Task 3) ; §2.2 nml.py ✓ ; §2.3 endpoints ✓ ; §3.1-3.2 frontend ✓ ;
  §4 robustesse : multi-match ✓ (Task 8), écriture atomique ✓, EXDEV géré par export existant ✓ ;
  §5 tests ✓ (pytest+vitest+manuel).
- [ ] Pas de placeholders : tout le code tâche par tâche est donné (les « … » volontaires du fichier
  template HTML sont des boutons à compléter par le pattern existant).
- [ ] Type consistency : `get_cues` → list de dict `{type,start,len,hotcue,name,displ_order,color}` ;
  `write_cues(entry, cues)` — même shape. Front `CueDTO` aligné (`type: str, start:number, len:number,
  hotcue:number, name:string, displ_order:string`).