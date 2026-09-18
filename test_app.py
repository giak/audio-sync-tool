import json
import os
import struct
import tempfile
import pytest
from xml.etree import ElementTree as ET
import app as app_module
from app import (
    app,
    JOURNAL_MAX_ENTRIES,
    _invalidate_nml_cache,
    _scan_progress,
    get_audio_meta,
    get_nml_index,
    log_journal,
    save_json,
    load_json,
    index_files,
    get_active_config,
    is_path_allowed,
)


@pytest.fixture(autouse=True)
def clean_state(monkeypatch, tmp_path):
    monkeypatch.setattr('app.CONFIG_PATH', str(tmp_path / 'config.json'))
    monkeypatch.setattr('app.JOURNAL_PATH', str(tmp_path / 'journal.json'))
    monkeypatch.setattr('app.CACHE_PATH', str(tmp_path / 'cache.json'))
    monkeypatch.setattr('app.PLAYLISTS_PATH', str(tmp_path / 'playlists.json'))
    monkeypatch.setattr('app.RATINGS_PATH', str(tmp_path / 'ratings.json'))
    monkeypatch.setattr('app.BEATGRID_PATH', str(tmp_path / 'beatgrids.json'))


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


def make_cfg(source_data='', epars_dirs=None):
    return {
        'active': 0,
        'configs': [{'name': 'test', 'source_data': source_data, 'epars_dirs': epars_dirs or []}]
    }


def test_cache_buster_covers_css(client):
    """Le cache-buster doit refléter la mtime de style.css, pas seulement celle de
    script.js — sinon le navigateur sert une CSS périmée (cache définitif)."""
    import app as app_module

    base = os.path.dirname(os.path.abspath(app_module.__file__))
    css_path = os.path.join(base, 'static', 'style.css')
    assert os.path.exists(css_path)

    future = 2_000_000_000
    orig = os.stat(css_path).st_mtime
    os.utime(css_path, (future, future))
    try:
        html = client.get('/').data.decode()
    finally:
        os.utime(css_path, (orig, orig))

    target = f'/static/style.css?v={int(future)}'
    assert target in html, f'style.css non invalidé par le cache-buster: attendu {target}'
def test_log_journal():
    """Test that log_journal() appends entries correctly."""
    from app import JOURNAL_PATH

    # Ensure journal file does not exist yet
    if os.path.exists(JOURNAL_PATH):
        os.remove(JOURNAL_PATH)

    # First entry
    entry1 = {
        'timestamp': '2026-06-22T10:00:00',
        'action': 'Scan terminé',
        'details': '42 fichiers source, 7 fichiers épars (3 dossiers)',
        'status': 'scan'
    }
    log_journal(entry1)

    assert os.path.exists(JOURNAL_PATH)

    with open(JOURNAL_PATH) as f:
        data = json.load(f)
    assert len(data) == 1
    assert data[0]['action'] == 'Scan terminé'
    assert data[0]['status'] == 'scan'
    assert data[0]['details'] == '42 fichiers source, 7 fichiers épars (3 dossiers)'

    # Second entry — should append, not overwrite
    entry2 = {
        'timestamp': '2026-06-22T10:01:00',
        'action': 'Config sauvegardée',
        'details': 'Profil : test',
        'status': 'config'
    }
    log_journal(entry2)

    with open(JOURNAL_PATH) as f:
        data = json.load(f)
    assert len(data) == 2
    assert data[0]['status'] == 'scan'
    assert data[1]['status'] == 'config'
    assert data[1]['details'] == 'Profil : test'

    # Third entry of type 'copied'
    entry3 = {
        'timestamp': '2026-06-22T10:02:00',
        'source': '/src/song.mp3',
        'destination': '/dst/song.mp3',
        'filename': 'song.mp3',
        'status': 'copied'
    }
    log_journal(entry3)

    with open(JOURNAL_PATH) as f:
        data = json.load(f)
    assert len(data) == 3
    assert data[2]['filename'] == 'song.mp3'
    assert data[2]['status'] == 'copied'


def test_config_default(client):
    rv = client.get('/config')
    assert rv.status_code == 200
    assert rv.json == {'active': 0, 'configs': []}


def test_config_save_and_read(client):
    payload = make_cfg(
        source_data='/home/giak/Music/select/style/',
        epars_dirs=['/media/giak/music/--[ montage audio/']
    )
    rv = client.post('/config', json=payload)
    assert rv.status_code == 200
    assert rv.json == {'ok': True}

    rv = client.get('/config')
    assert rv.status_code == 200
    assert rv.json == payload


def test_scan_finds_mp3_and_flac(client):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        os.makedirs(src)
        open(os.path.join(src, 'song.mp3'), 'w').close()
        open(os.path.join(src, 'track.flac'), 'w').close()
        open(os.path.join(src, 'notes.txt'), 'w').close()

        client.post('/config', json=make_cfg(source_data=src))
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

        client.post('/config', json=make_cfg(epars_dirs=[ep]))
        rv = client.get('/scan')
        data = rv.json
        assert 'lost.mp3' in data['epars'][ep]


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
        assert rv.json['ok'] is True
        assert 'year' in rv.json
        assert 'duration' in rv.json
        assert 'codec' in rv.json
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


def test_load_empty_cache(client):
    rv = client.get('/load')
    assert rv.status_code == 200
    # extra_dirs : dossiers racine créés via ➕ (toujours présent dans la réponse)
    assert rv.json == {'source': {}, 'epars': {}, 'extra_dirs': []}


def test_load_after_scan(client):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        os.makedirs(src)
        open(os.path.join(src, 'song.mp3'), 'w').close()

        client.post('/config', json={
            'active': 0,
            'configs': [{'name': 'test', 'source_data': src, 'epars_dirs': []}]
        })
        client.get('/scan')

        rv = client.get('/load')
        data = rv.json
        assert src in data['source']
        assert 'song.mp3' in data['source'][src]
# --- get_active_config tests ---

def test_get_active_config_default(client):
    """Returns minimal config when no config exists."""
    cfg = get_active_config()
    assert cfg == {'source_data': '', 'epars_dirs': []}


def test_get_active_config_valid(client):
    """Returns the active profile from a saved config."""
    payload = make_cfg(
        source_data='/src',
        epars_dirs=['/ep1', '/ep2']
    )
    client.post('/config', json=payload)

    cfg = get_active_config()
    assert cfg['source_data'] == '/src'
    assert cfg['epars_dirs'] == ['/ep1', '/ep2']


def test_get_active_config_missing_keys(client):
    """Handles missing keys in active config gracefully via .get() defaults."""
    client.post('/config', json={'active': 0, 'configs': [{'name': 'empty'}]})
    cfg = get_active_config()
    assert cfg.get('source_data', '') == ''
    assert cfg.get('epars_dirs', []) == []
    assert cfg['name'] == 'empty'


# --- index_files tests ---

def test_index_files_flat_directory():
    """Indexes mp3 and flac files, skips non-music files."""
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, 'a.mp3'), 'w').close()
        open(os.path.join(tmp, 'b.flac'), 'w').close()
        open(os.path.join(tmp, 'c.txt'), 'w').close()

        idx = index_files(tmp)
        assert 'a.mp3' in idx
        assert 'b.flac' in idx
        assert 'c.txt' not in idx
        assert idx['a.mp3']['path'] == 'a.mp3'


def test_index_files_subdirectories():
    """Indexes files in subfolders with correct relative paths."""
    with tempfile.TemporaryDirectory() as tmp:
        sub = os.path.join(tmp, 'sub')
        nested = os.path.join(sub, 'nested')
        os.makedirs(nested)
        open(os.path.join(tmp, 'root.mp3'), 'w').close()
        open(os.path.join(sub, 'sub.mp3'), 'w').close()
        open(os.path.join(nested, 'deep.mp3'), 'w').close()

        idx = index_files(tmp)
        assert idx['root.mp3']['path'] == 'root.mp3'
        assert idx['sub.mp3']['path'] == 'sub/sub.mp3'
        assert idx['deep.mp3']['path'] == 'sub/nested/deep.mp3'


def test_index_files_no_music():
    """Returns empty dict when no music files present."""
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, 'notes.txt'), 'w').close()
        open(os.path.join(tmp, 'image.png'), 'w').close()
        idx = index_files(tmp)
        assert idx == {}


def test_index_files_parallel_parity():
    """Parallel scan (100+ files) produces correct results."""
    with tempfile.TemporaryDirectory() as tmp:
        # Create 110 dummy .mp3 files — triggers ProcessPoolExecutor path
        for i in range(110):
            open(os.path.join(tmp, f'track_{i:03d}.mp3'), 'w').close()
        # Also add a non-music file — should be ignored
        open(os.path.join(tmp, 'notes.txt'), 'w').close()

        idx = index_files(tmp)
        assert len(idx) == 110
        for i in range(110):
            fname = f'track_{i:03d}.mp3'
            assert fname in idx
            assert idx[fname]['path'] == fname
            assert 'year' in idx[fname]
            assert 'duration' in idx[fname]
            assert 'codec' in idx[fname]
            assert idx[fname]['codec'] == 'MP3'  # from extension
        assert 'notes.txt' not in idx


def test_index_files_parallel_with_subdirs():
    """Parallel scan handles subdirectories and deduplication correctly."""
    with tempfile.TemporaryDirectory() as tmp:
        sub = os.path.join(tmp, 'sub')
        nested = os.path.join(sub, 'nested')
        os.makedirs(nested)
        # 120 files total across directories — triggers parallel path
        for i in range(40):
            open(os.path.join(tmp, f'root_{i:03d}.mp3'), 'w').close()
        for i in range(40):
            open(os.path.join(sub, f'sub_{i:03d}.mp3'), 'w').close()
        for i in range(40):
            open(os.path.join(nested, f'deep_{i:03d}.mp3'), 'w').close()

        idx = index_files(tmp)
        assert len(idx) == 120
        assert idx['root_000.mp3']['path'] == 'root_000.mp3'
        assert idx['sub_000.mp3']['path'] == 'sub/sub_000.mp3'
        assert idx['deep_000.mp3']['path'] == 'sub/nested/deep_000.mp3'


# --- /config error case ---

def test_config_post_no_json_body(client):
    """POST /config with JSON null body returns 400 (request.json is None)."""
    rv = client.post('/config', data='null', content_type='application/json')
    assert rv.status_code == 400
    assert rv.json['ok'] is False
    assert rv.json['error'] == 'Request body must be JSON'


# --- /copy error cases ---

def test_copy_missing_keys(client):
    """Missing required keys returns 400."""
    # Missing source_path
    rv = client.post('/copy', json={'dest_dir': '/tmp', 'filename': 'x.mp3'})
    assert rv.status_code == 400
    assert rv.json['ok'] is False
    assert 'source_path' in rv.json['error']


def test_copy_no_json_body(client):
    """Request with JSON null body returns 400 (request.json is None)."""
    rv = client.post('/copy', data='null', content_type='application/json')
    assert rv.status_code == 400
    assert rv.json['ok'] is False
    assert rv.json['error'] == 'Request body must be JSON'


# --- EPIC-028 P1bis : /move (trash — déplacer, jamais effacer) ---

def test_move_file_and_journal(client):
    """Déplacement basique : fichier absent de la source, présent à destination,
    entrée journal status=moved."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        src_dir = os.path.join(tmp, 'src')
        dst_dir = os.path.join(tmp, 'dst')
        os.makedirs(src_dir)
        src_file = os.path.join(src_dir, 'song.mp3')
        open(src_file, 'w').close()

        rv = client.post('/move', json={'source_path': src_file, 'dest_dir': dst_dir})
        assert rv.status_code == 200
        assert rv.json['ok'] is True
        assert rv.json['filename'] == 'song.mp3'
        assert not os.path.exists(src_file)          # déplacé — la source est vide
        assert os.path.exists(os.path.join(dst_dir, 'song.mp3'))

        rv = client.get('/journal')
        assert rv.json[-1]['status'] == 'moved'
        assert rv.json[-1]['filename'] == 'song.mp3'


def test_move_into_trash_dir_status(client):
    """Destination sous un dossier _trash → journal status=moved-to-trash."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        trash = os.path.join(tmp, '_trash', '2026-09-15')
        src_file = os.path.join(tmp, 'song.mp3')
        open(src_file, 'w').close()

        rv = client.post('/move', json={'source_path': src_file, 'dest_dir': trash})
        assert rv.status_code == 200
        assert os.path.exists(os.path.join(trash, 'song.mp3'))

        rv = client.get('/journal')
        assert rv.json[-1]['status'] == 'moved-to-trash'


def test_move_never_overwrites_existing(client):
    """Collision : le fichier existant est préservé, le nouveau porte -2."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        src_dir = os.path.join(tmp, 'src')
        os.makedirs(src_dir)
        src_file = os.path.join(src_dir, 'song.mp3')
        with open(src_file, 'w') as f:
            f.write('nouveau')
        existing = os.path.join(tmp, 'song.mp3')
        with open(existing, 'w') as f:
            f.write('existant')

        rv = client.post('/move', json={'source_path': src_file, 'dest_dir': tmp})
        assert rv.status_code == 200
        with open(existing) as f:
            assert f.read() == 'existant'             # l'ancien est intact
        with open(os.path.join(tmp, 'song-2.mp3')) as f:
            assert f.read() == 'nouveau'              # le nouveau porte le suffixe
        assert not os.path.exists(src_file)


def test_move_allowed_both_sides(client):
    """is_path_allowed() sur la source ET la destination (CWE-22)."""
    with tempfile.TemporaryDirectory() as tmp:
        src_file = os.path.join(tmp, 'song.mp3')
        open(src_file, 'w').close()

        # Destination hors des dossiers autorisés (config vide → rien n'est autorisé)
        rv = client.post('/move', json={'source_path': src_file, 'dest_dir': '/tmp'})
        assert rv.status_code == 403
        assert 'allowed' in rv.json['error']


def test_move_missing_source_and_keys(client):
    rv = client.post('/move', json={'dest_dir': '/tmp'})
    assert rv.status_code == 400
    assert 'source_path' in rv.json['error']

    rv = client.post('/move', json={'source_path': '/nonexistent/x.mp3', 'dest_dir': '/tmp'})
    assert rv.status_code == 404

    rv = client.post('/move', data='null', content_type='application/json')
    assert rv.status_code == 400


def test_move_updates_cache(client):
    """/move reflète l'effet dans le cache /load (retrait source, ajout dest)."""
    with tempfile.TemporaryDirectory() as tmp:
        src_dir = os.path.join(tmp, 'epars')
        dst_dir = os.path.join(tmp, 'source')
        os.makedirs(src_dir)
        src_file = os.path.join(src_dir, 'song.mp3')
        open(src_file, 'w').close()

        client.post('/config', json=make_cfg(source_data=dst_dir, epars_dirs=[src_dir]))
        client.get('/scan')
        import app as app_module
        cache = app_module.load_json(app_module.CACHE_PATH)
        assert 'song.mp3' in cache['epars'][src_dir]

        rv = client.post('/move', json={'source_path': src_file, 'dest_dir': dst_dir})
        assert rv.status_code == 200

        cache = app_module.load_json(app_module.CACHE_PATH)
        assert 'song.mp3' not in cache['epars'][src_dir]   # retiré de l'épars
        assert 'song.mp3' in cache['source'][dst_dir]      # ajouté à la source


def test_scan_excludes_trash_dir(client):
    """L'élagage _trash du os.walk : le trash n'est pas ré-indexé (EPIC-028)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        trash = os.path.join(src, '_trash', '2026-09-15')
        os.makedirs(trash)
        open(os.path.join(src, 'kept.mp3'), 'w').close()
        open(os.path.join(trash, 'buried.mp3'), 'w').close()

        client.post('/config', json=make_cfg(source_data=src))
        rv = client.get('/scan')
        files = rv.json['source'][src]
        assert 'kept.mp3' in files
        assert 'buried.mp3' not in files


def test_copy_collision_suffix_preserves_existing(client):
    """EPIC-028 : /copy ne doit plus écraser — le nouveau fichier porte -2."""
    with tempfile.TemporaryDirectory() as tmp:
        src_dir = os.path.join(tmp, 'src')
        os.makedirs(src_dir)
        src_file = os.path.join(src_dir, 'song.mp3')
        with open(src_file, 'w') as f:
            f.write('nouveau')
        existing = os.path.join(tmp, 'song.mp3')
        with open(existing, 'w') as f:
            f.write('existant')

        rv = client.post('/copy', json={
            'source_path': src_file, 'dest_dir': tmp, 'filename': 'song.mp3'
        })
        assert rv.status_code == 200
        with open(existing) as f:
            assert f.read() == 'existant'             # l'ancien est intact
        with open(os.path.join(tmp, 'song-2.mp3')) as f:
            assert f.read() == 'nouveau'              # le nouveau porte le suffixe


def test_copy_same_file(client):
    """Copying a file onto itself returns 500 (SameFileError)."""
    with tempfile.TemporaryDirectory() as tmp:
        src_file = os.path.join(tmp, 'song.mp3')
        open(src_file, 'w').close()

        # Try to copy to the exact same path
        rv = client.post('/copy', json={
            'source_path': src_file,
            'dest_dir': tmp,
            'filename': 'song.mp3'
        })
        assert rv.status_code == 500
        assert rv.json['ok'] is False


# --- /scan subdirectories & edge cases ---

def test_scan_with_subdirectories(client):
    """Files in subdirectories appear in scan results with correct paths."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        sub = os.path.join(src, 'subdir')
        os.makedirs(sub)
        open(os.path.join(src, 'root.mp3'), 'w').close()
        open(os.path.join(sub, 'child.mp3'), 'w').close()

        client.post('/config', json=make_cfg(source_data=src))
        rv = client.get('/scan')
        data = rv.json
        assert 'root.mp3' in data['source'][src]
        assert 'child.mp3' in data['source'][src]
        assert data['source'][src]['child.mp3']['path'] == 'subdir/child.mp3'


def test_scan_nonexistent_source_dir(client):
    """Scan with a non-existent source_data path returns empty gracefully."""
    client.post('/config', json=make_cfg(source_data='/no/such/dir'))
    rv = client.get('/scan')
    assert rv.status_code == 200
    assert rv.json['source'] == {'/no/such/dir': {}}
    assert rv.json['epars'] == {}


# --- /mkdir tests ---

@pytest.fixture
def clean_extra_dirs(monkeypatch, tmp_path):
    """Isolate data/extra_dirs.json in tmp_path for /mkdir tests."""
    monkeypatch.setattr('app.EXTRA_DIRS_PATH', str(tmp_path / 'extra_dirs.json'))


def test_mkdir_creates_root_dir_and_persists(client, clean_extra_dirs):
    """POST /mkdir crée le dossier disque + le trace dans extra_dirs.json."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        rv = client.post('/mkdir', json={'root': tmp, 'name': 'Ambient'})
        assert rv.status_code == 200
        assert rv.json['ok'] is True
        assert os.path.isdir(os.path.join(tmp, 'Ambient'))
        # Persisté dans extra_dirs.json (via app.EXTRA_DIRS_PATH isolé)
        assert load_json(app_module.EXTRA_DIRS_PATH, []) == [os.path.join(tmp, 'Ambient')]


def test_mkdir_idempotent(client, clean_extra_dirs):
    """POST /mkdir sur un dossier existant → 200, pas de doublon dans l'index."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        rv1 = client.post('/mkdir', json={'root': tmp, 'name': 'Ambient'})
        rv2 = client.post('/mkdir', json={'root': tmp, 'name': 'Ambient'})
        assert rv1.status_code == 200
        assert rv2.status_code == 200
        assert load_json(app_module.EXTRA_DIRS_PATH, []).count(os.path.join(tmp, 'Ambient')) == 1


def test_mkdir_invalid_name_rejected(client, clean_extra_dirs):
    """Nom vide / '.' / '..' / avec séparateur → 400, rien créé."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        for bad in ('', 'a/b', 'a\\\\b', '.', '..'):
            rv = client.post('/mkdir', json={'root': tmp, 'name': bad})
            assert rv.status_code == 400, f'name={bad!r}'
        assert os.listdir(tmp) == []


def test_mkdir_outside_allowed_returns_403(client, clean_extra_dirs):
    """POST /mkdir sur un root hors config → 403, rien créé."""
    with tempfile.TemporaryDirectory() as tmp:
        outside = os.path.join(tmp, 'outside')
        os.makedirs(outside)
        client.post('/config', json=make_cfg(source_data=os.path.join(tmp, 'allowed')))
        rv = client.post('/mkdir', json={'root': outside, 'name': 'Nope'})
        assert rv.status_code == 403
        assert not os.path.exists(os.path.join(outside, 'Nope'))


def test_mkdir_delete_removes_from_index_only(client, clean_extra_dirs):
    """DELETE /mkdir retire le dossier de l'index, jamais du disque (DATA-SAFETY)."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        client.post('/mkdir', json={'root': tmp, 'name': 'Temporaire'})
        target = os.path.join(tmp, 'Temporaire')
        # Non-vide : la garantie « jamais rien supprimé du disque » est prouvée
        # par un contenu qui doit survivre au DELETE.
        open(os.path.join(target, 'keep.mp3'), 'w').close()

        rv = client.delete('/mkdir', json={'root': tmp, 'name': 'Temporaire'})
        assert rv.status_code == 200
        assert os.path.isdir(target)  # disque intact
        assert os.path.exists(os.path.join(target, 'keep.mp3'))
        assert load_json(app_module.EXTRA_DIRS_PATH, []) == []

        # Deuxième DELETE → 404 (déjà retiré)
        rv2 = client.delete('/mkdir', json={'root': tmp, 'name': 'Temporaire'})
        assert rv2.status_code == 404


def test_mkdir_requires_json_body(client, clean_extra_dirs):
    """POST /mkdir sans JSON → 415 (Flask: content-type absent), comme /copy."""
    rv = client.post('/mkdir')
    assert rv.status_code == 415


def test_mkdir_root_missing_key(client, clean_extra_dirs):
    """POST /mkdir sans root/name → 400."""
    rv = client.post('/mkdir', json={'root': '/x'})
    assert rv.status_code == 400


def test_load_and_scan_inject_extra_dirs(client, clean_extra_dirs):
    """Les dossiers ➕ ressortent dans /load et /scan (extra_dirs)."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        client.post('/mkdir', json={'root': tmp, 'name': 'Ambient'})
        assert client.get('/load').json['extra_dirs'] == [os.path.join(tmp, 'Ambient')]
        scan = client.get('/scan').json
        assert scan['extra_dirs'] == [os.path.join(tmp, 'Ambient')]


# --- /audio tests ---

def test_serve_audio_valid(client):
    """Serves an audio file with correct mimetype."""
    with tempfile.TemporaryDirectory() as tmp:
        mp3 = os.path.join(tmp, 'test.mp3')
        flac = os.path.join(tmp, 'test.flac')
        open(mp3, 'w').close()
        open(flac, 'w').close()

        # Register tmp as allowed dir (is_path_allowed requires config)
        client.post('/config', json=make_cfg(source_data=tmp))

        rv = client.get('/audio?path=' + mp3)
        assert rv.status_code == 200
        assert rv.mimetype == 'audio/mpeg'

        rv = client.get('/audio?path=' + flac)
        assert rv.status_code == 200
        assert rv.mimetype == 'audio/flac'


def test_serve_audio_missing_path(client):
    """Missing path param returns 404."""
    rv = client.get('/audio')
    assert rv.status_code == 404


def test_serve_audio_nonexistent_file(client):
    """Non-existent file returns 404."""
    rv = client.get('/audio?path=/nonexistent/file.mp3')
    assert rv.status_code == 404


def test_serve_audio_path_traversal_blocked(client):
    """Path traversal via .. is blocked with 404."""
    with tempfile.TemporaryDirectory() as tmp:
        client.post('/config', json=make_cfg(source_data=tmp))
        # ../ escape normalizes outside allowed dir → 404
        traversal = os.path.join(tmp, '..', '..', 'etc', 'passwd')
        rv = client.get('/audio?path=' + traversal)
        assert rv.status_code == 404


# --- get_audio_meta edge cases ---

def test_get_audio_meta_m4a_cday():
    """Lit l'année du tag MP4 (c)day — des M4A taggés étaient comptés sans
    année par le scan (découvert via le script apply_years, EPIC-033)."""
    import app as app_module

    class MockInfo:
        length = 300.0

    class MockMP4:
        info = MockInfo()

        class tags:
            @staticmethod
            def get(key):
                return {'\xa9day': ['2019']}.get(key)

    def mock_mutagen_file(path, easy=False):
        if path.endswith('.m4a'):
            return MockMP4()
        return None

    original_mutagen = app_module.MutagenFile
    app_module.MutagenFile = mock_mutagen_file
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'test.m4a')
            open(path, 'w').close()
            year, duration, codec = get_audio_meta(path)
            assert year == '2019'
            assert duration == 300
            assert codec == 'M4A'
    finally:
        app_module.MutagenFile = original_mutagen

def test_get_audio_meta_corrupt_file():
    """Returns None for year/duration, extension codec for a corrupt file."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'broken.ogg')
        # Write random bytes, not a valid OGG file
        with open(path, 'wb') as f:
            f.write(b'\x00\x01\x02' * 100)

        year, duration, codec = get_audio_meta(path)
        assert year is None
        assert duration is None
        assert codec == 'OGG'  # from extension


def test_get_audio_meta_ogg_vorbis():
    """Extracts year from Vorbis comment tags (monkeypatch)."""
    # Building a synthetic OGG Vorbis file from scratch requires complex
    # codebook/setup headers. Instead, monkeypatch MutagenFile to verify
    # the Vorbis tag-reading code path.
    import app as app_module

    class MockInfo:
        length = 0.0
        channels = 2
        sample_rate = 44100

    class MockOgg:
        info = MockInfo()
        def get(self, key):
            return {'date': ['2022'], 'album': ['Test']}.get(key.lower())

    def mock_mutagen_file(path, easy=False):
        if path.endswith('.ogg'):
            return MockOgg()
        return None

    original_mutagen = app_module.MutagenFile
    app_module.MutagenFile = mock_mutagen_file
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'test.ogg')
            open(path, 'w').close()

            year, duration, codec = get_audio_meta(path)
            assert year == '2022'
            assert duration == 0
            assert codec == 'OGG'
    finally:
        app_module.MutagenFile = original_mutagen


def test_get_audio_meta_ogg_vorbis_year_fallback():
    """Uses YEAR tag when DATE is absent in Vorbis comments."""
    import app as app_module

    class MockInfo:
        length = 60.0
        channels = 2
        sample_rate = 44100

    class MockOggYearOnly:
        info = MockInfo()
        def get(self, key):
            return {'year': ['2005'], 'album': ['Test']}.get(key.lower())

    def mock_mutagen_file(path, easy=False):
        if path.endswith('.ogg'):
            return MockOggYearOnly()
        return None

    original_mutagen = app_module.MutagenFile
    app_module.MutagenFile = mock_mutagen_file
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'test.ogg')
            open(path, 'w').close()

            year, duration, codec = get_audio_meta(path)
            assert year == '2005'
            assert duration == 60
            assert codec == 'OGG'
    finally:
        app_module.MutagenFile = original_mutagen


def test_get_audio_meta_no_mutagen():
    """When mutagen is not installed, returns extension codec only."""
    import app as app_module

    original_has_mutagen = app_module.HAS_MUTAGEN
    app_module.HAS_MUTAGEN = False
    try:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'test.mp3')
            open(path, 'w').close()

            year, duration, codec = get_audio_meta(path)
            assert year is None
            assert duration is None
            assert codec == 'MP3'
    finally:
        app_module.HAS_MUTAGEN = original_has_mutagen


# --- load_json / save_json tests ---

def test_save_and_load_json():
    """Round-trip: save then load JSON."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'data.json')
        data = {'key': 'value', 'list': [1, 2, 3]}
        save_json(path, data)
        assert os.path.exists(path)
        result = load_json(path)
        assert result == data


def test_load_json_default():
    """Returns default value when file does not exist."""
    result = load_json('/nonexistent/path.json', default={'fallback': True})
    assert result == {'fallback': True}


def test_load_json_nonexistent_no_default():
    """Returns None when file does not exist and no default given."""
    result = load_json('/nonexistent/path.json')
    assert result is None


# --- Cache invalidation tests ---

def test_config_save_invalidates_cache_only_when_paths_change(client):
    """Saving config with same paths keeps the cache; different paths invalidate it."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'src')
        os.makedirs(src)
        open(os.path.join(src, 'song.mp3'), 'w').close()

        # Save config + scan to populate cache
        client.post('/config', json=make_cfg(source_data=src))
        client.get('/scan')

        import app as app_module
        assert os.path.exists(app_module.CACHE_PATH)

        # Save SAME config — cache should survive
        client.post('/config', json=make_cfg(source_data=src))
        assert os.path.exists(app_module.CACHE_PATH)

        # Save config with DIFFERENT source_data — cache should be deleted
        other = os.path.join(tmp, 'other')
        client.post('/config', json=make_cfg(source_data=other))
        assert not os.path.exists(app_module.CACHE_PATH)

        # Save config with DIFFERENT epars_dirs — cache should be deleted
        client.get('/scan')  # re-populate
        assert os.path.exists(app_module.CACHE_PATH)
        client.post('/config', json=make_cfg(source_data=other, epars_dirs=['/new/path']))
        assert not os.path.exists(app_module.CACHE_PATH)


def test_copy_updates_cache(client):
    """Copying a file updates the scan cache (adds file to source data)."""
    with tempfile.TemporaryDirectory() as tmp:
        src_dir = os.path.join(tmp, 'src')
        dst_dir = os.path.join(tmp, 'dst')
        os.makedirs(src_dir)
        src_file = os.path.join(src_dir, 'song.mp3')
        open(src_file, 'w').close()

        # Populate cache via scan (source = dst_dir)
        client.post('/config', json=make_cfg(source_data=dst_dir))
        client.get('/scan')

        import app as app_module
        assert os.path.exists(app_module.CACHE_PATH)

        # Copy a file into the source data directory
        client.post('/copy', json={
            'source_path': src_file,
            'dest_dir': dst_dir,
            'filename': 'song.mp3'
        })

        # Cache still exists and now contains the copied file
        assert os.path.exists(app_module.CACHE_PATH)
        cache = load_json(app_module.CACHE_PATH)
        assert dst_dir in cache['source']
        assert 'song.mp3' in cache['source'][dst_dir]



def test_is_path_allowed_valid_path(client):
    """Path inside source_data returns True."""
    with tempfile.TemporaryDirectory() as tmp:
        mp3 = os.path.join(tmp, 'song.mp3')
        open(mp3, 'w').close()
        client.post('/config', json=make_cfg(source_data=tmp))
        assert is_path_allowed(mp3) is True


def test_is_path_allowed_parent_blocked(client):
    """Path outside allowed dirs returns False."""
    with tempfile.TemporaryDirectory() as tmp:
        allowed = os.path.join(tmp, 'allowed')
        blocked = os.path.join(tmp, 'blocked')
        os.makedirs(allowed)
        os.makedirs(blocked)
        mp3 = os.path.join(blocked, 'song.mp3')
        open(mp3, 'w').close()
        client.post('/config', json=make_cfg(source_data=allowed))
        assert is_path_allowed(mp3) is False


def test_is_path_allowed_symlink_outside(client):
    """Symlink pointing outside allowed tree returns False."""
    with tempfile.TemporaryDirectory() as tmp:
        allowed = os.path.join(tmp, 'allowed')
        os.makedirs(allowed)
        # Symlink inside allowed dir pointing to /etc/passwd
        symlink = os.path.join(allowed, 'escape')
        os.symlink('/etc/passwd', symlink)
        client.post('/config', json=make_cfg(source_data=allowed))
        assert is_path_allowed(symlink) is False


def test_is_path_allowed_symlink_inside(client):
    """Symlink pointing inside allowed tree returns True."""
    with tempfile.TemporaryDirectory() as tmp:
        allowed = os.path.join(tmp, 'allowed')
        sub = os.path.join(allowed, 'sub')
        os.makedirs(sub)
        mp3 = os.path.join(sub, 'song.mp3')
        open(mp3, 'w').close()
        # Symlink at allowed root pointing into sub/
        symlink = os.path.join(allowed, 'link-to-song')
        os.symlink(mp3, symlink)
        client.post('/config', json=make_cfg(source_data=allowed))
        assert is_path_allowed(symlink) is True


def test_is_path_allowed_symlink_inside_relative(client):
    """Symlink with relative target inside allowed tree returns True."""
    with tempfile.TemporaryDirectory() as tmp:
        allowed = os.path.join(tmp, 'allowed')
        notes = os.path.join(allowed, 'notes')
        os.makedirs(notes)
        mp3 = os.path.join(notes, 'song.mp3')
        open(mp3, 'w').close()
        # Symlink at allowed root with relative target
        symlink = os.path.join(allowed, 'link')
        os.symlink('notes/song.mp3', symlink)
        client.post('/config', json=make_cfg(source_data=allowed))
        assert is_path_allowed(symlink) is True


def test_is_path_allowed_empty_path(client):
    """Empty path returns False."""
    assert is_path_allowed('') is False


def test_is_path_allowed_nonexistent_path(client):
    """Non-existent path returns False."""
    assert is_path_allowed('/tmp/definitely_does_not_exist_12345/song.mp3') is False


def test_is_path_allowed_epars_dir(client):
    """Path in an epars_dir is also allowed."""
    with tempfile.TemporaryDirectory() as tmp:
        ep = os.path.join(tmp, 'epars')
        os.makedirs(ep)
        mp3 = os.path.join(ep, 'lost.mp3')
        open(mp3, 'w').close()
        client.post('/config', json=make_cfg(epars_dirs=[ep]))
        assert is_path_allowed(mp3) is True


def test_is_path_allowed_traversal_attempt(client):
    """Path traversal via .. is blocked (realpath normalizes it)."""
    with tempfile.TemporaryDirectory() as tmp:
        allowed = os.path.join(tmp, 'allowed')
        os.makedirs(allowed)
        client.post('/config', json=make_cfg(source_data=allowed))
        # Try to escape via .. 
        traversal = os.path.join(allowed, '..', 'outside.mp3')
        assert is_path_allowed(traversal) is False


def test_delete_success(client):
    """POST /delete removes a file from source data + cache + journal."""
    with tempfile.TemporaryDirectory() as tmp:
        mp3 = os.path.join(tmp, 'song.mp3')
        open(mp3, 'w').close()
        client.post('/config', json=make_cfg(source_data=tmp))
        # Populate cache via scan
        client.get('/scan')
        assert os.path.exists(mp3)

        rv = client.post('/delete', json={'path': mp3})
        assert rv.status_code == 200
        assert rv.json['ok'] is True
        assert rv.json['filename'] == 'song.mp3'
        assert not os.path.exists(mp3)

        # Check cache was cleaned
        rv = client.get('/load')
        cache = rv.json
        assert 'song.mp3' not in cache['source'][tmp]

        # Check journal
        rv = client.get('/journal')
        assert any(e['status'] == 'deleted' for e in rv.json)


def test_delete_nonexistent(client):
    """POST /delete on non-existent file returns 404."""
    rv = client.post('/delete', json={'path': '/tmp/does_not_exist.mp3'})
    assert rv.status_code == 404


def test_delete_outside_allowed(client):
    """POST /delete on file outside allowed dirs returns 403."""
    with tempfile.TemporaryDirectory() as tmp:
        allowed = os.path.join(tmp, 'allowed')
        outside = os.path.join(tmp, 'outside')
        os.makedirs(allowed)
        os.makedirs(outside)
        mp3 = os.path.join(outside, 'blocked.mp3')
        open(mp3, 'w').close()
        client.post('/config', json=make_cfg(source_data=allowed))
        rv = client.post('/delete', json={'path': mp3})
        assert rv.status_code == 403
        assert os.path.exists(mp3)  # file untouched


def test_delete_missing_path_key(client):
    """POST /delete with missing path returns 400."""
    rv = client.post('/delete', json={})
    assert rv.status_code == 400


def test_delete_no_json_body(client):
    """POST /delete with no body returns 400."""
    rv = client.post('/delete', data='null', content_type='application/json')
    assert rv.status_code == 400


# ── Playlist tests ─────────────────────────────────────────────────────────


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
        'name': 'delete-me',
        'tracks': [{'filename': 'x.mp3', 'fullPath': '/x.mp3', 'relPath': 'x.mp3'}]
    })
    rv = client.delete('/playlists/delete-me')
    assert rv.status_code == 200
    assert rv.json['ok'] is True

    rv = client.get('/playlists')
    assert len(rv.json) == 0


def test_playlists_rename(client):
    """PUT /playlists/<name> renames a playlist."""
    client.post('/playlists', json={
        'name': 'old-name',
        'tracks': [{'filename': 'a.mp3', 'fullPath': '/a.mp3', 'relPath': 'a.mp3'}]
    })
    rv = client.put('/playlists/old-name', json={'name': 'new-name'})
    assert rv.status_code == 200
    assert rv.json['ok'] is True
    assert rv.json['playlist']['name'] == 'new-name'

    # Old name should no longer exist
    rv = client.get('/playlists')
    names = [p['name'] for p in rv.json]
    assert 'old-name' not in names
    assert 'new-name' in names


def test_playlists_rename_not_found(client):
    """PUT /playlists/<name> returns 404 for nonexistent playlist."""
    rv = client.put('/playlists/nonexistent', json={'name': 'new-name'})
    assert rv.status_code == 404


def test_playlists_rename_no_body(client):
    """PUT /playlists/<name> returns 400 when name is missing."""
    client.post('/playlists', json={
        'name': 'test',
        'tracks': [{'filename': 'a.mp3', 'fullPath': '/a.mp3', 'relPath': 'a.mp3'}]
    })
    rv = client.put('/playlists/test', json={})
    assert rv.status_code == 400


def test_playlists_delete_not_found(client):
    """DELETE /playlists/<name> returns 404 for nonexistent playlist."""
    rv = client.delete('/playlists/nonexistent')
    assert rv.status_code == 404


def test_playlists_export_success(client):
    """POST /playlists/export creates hard links in _playlists/<name>."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'source')
        os.makedirs(src)

        track_path = os.path.join(src, 'track.mp3')
        open(track_path, 'w').close()

        # Set config so export knows the source base
        client.post('/config', json={
            'active': 0,
            'configs': [{'name': 'test', 'source_data': src, 'epars_dirs': []}]
        })

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
    # Must configure source_data so the route gets past the config check
    client.post('/playlists', json={
        'name': 'broken',
        'tracks': [{
            'filename': 'ghost.mp3',
            'fullPath': '/nonexistent/ghost.mp3',
            'relPath': 'ghost.mp3'
        }]
    })
    client.post('/config', json={
        'active': 0,
        'configs': [{'name': 'test', 'source_data': '/tmp/dummy', 'epars_dirs': []}]
    })
    rv = client.post('/playlists/export', json={'name': 'broken'})
    assert rv.status_code == 409
    assert rv.json['ok'] is False
    assert 'ghost.mp3' in rv.json['missing']


def test_playlists_export_not_found(client):
    """POST /playlists/export returns 404 for nonexistent playlist."""
    rv = client.post('/playlists/export', json={'name': 'no-such-pl'})
    assert rv.status_code == 404


def test_playlists_export_no_source_config(client):
    """POST /playlists/export returns 400 when no source data is configured."""
    client.post('/playlists', json={
        'name': 'orphan',
        'tracks': [{'filename': 'x.mp3', 'fullPath': '/x.mp3', 'relPath': 'x.mp3'}]
    })
    rv = client.post('/playlists/export', json={'name': 'orphan'})
    assert rv.status_code == 400
    assert rv.json['ok'] is False
    assert 'source' in rv.json['error'].lower()


def test_playlists_export_cross_device_fallback(client):
    """When os.link raises EXDEV, fall back to shutil.copy2."""
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

            export_dir = os.path.join(src, '_playlists', 'cross-device')
            assert os.path.exists(os.path.join(export_dir, 'track.mp3'))
    finally:
        app_module.os.link = original_link


# ── Ratings tests ────────────────────────────────────────────────────────────


def test_ratings_default_empty(client):
    """GET /ratings returns empty object when no ratings exist."""
    rv = client.get('/ratings')
    assert rv.status_code == 200
    assert rv.json == {}


def test_ratings_save_and_read(client):
    """PUT /ratings saves a rating, GET /ratings reads it back."""
    rv = client.put('/ratings', json={
        '/home/giak/Music/song.mp3': 85,
    })
    assert rv.status_code == 200
    assert rv.json == {'ok': True}

    rv = client.get('/ratings')
    assert rv.status_code == 200
    assert rv.json['/home/giak/Music/song.mp3'] == 85


def test_ratings_overwrite(client):
    """PUT /ratings overwrites existing rating for same path."""
    client.put('/ratings', json={'/path/song.mp3': 50})
    client.put('/ratings', json={'/path/song.mp3': 90})
    rv = client.get('/ratings')
    assert rv.json['/path/song.mp3'] == 90


def test_ratings_multiple_files(client):
    """PUT /ratings accepts multiple entries at once."""
    client.put('/ratings', json={
        '/path/a.mp3': 85,
        '/path/b.mp3': 72,
        '/path/c.mp3': 95,
    })
    rv = client.get('/ratings')
    assert len(rv.json) == 3
    assert rv.json['/path/a.mp3'] == 85
    assert rv.json['/path/b.mp3'] == 72
    assert rv.json['/path/c.mp3'] == 95


def test_ratings_invalid_value(client):
    """PUT /ratings returns 400 for out-of-range value."""
    rv = client.put('/ratings', json={'/path/song.mp3': 150})
    assert rv.status_code == 400

    rv = client.put('/ratings', json={'/path/song.mp3': -5})
    assert rv.status_code == 400

    rv = client.put('/ratings', json={'/path/song.mp3': 'abc'})
    assert rv.status_code == 400


def test_ratings_null_value_removes_key(client):
    """PUT /ratings with null value removes that key from ratings."""
    client.put('/ratings', json={'/path/song.mp3': 85})
    client.put('/ratings', json={'/path/song.mp3': None})
    rv = client.get('/ratings')
    assert '/path/song.mp3' not in rv.json


def test_ratings_persistence_across_requests(client):
    """Ratings persist between requests (no in-memory only)."""
    client.put('/ratings', json={'/path/song.mp3': 42})
    rv1 = client.get('/ratings')
    rv2 = client.get('/ratings')
    assert rv1.json == rv2.json


def test_playlists_export_overwrite_existing(client):
    """Re-exporting a playlist overwrites existing hard links."""
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
            'name': 're-export',
            'tracks': [{
                'filename': 'track.mp3',
                'fullPath': track_path,
                'relPath': 'track.mp3'
            }]
        })

        # First export
        rv1 = client.post('/playlists/export', json={'name': 're-export'})
        assert rv1.status_code == 200

        export_dir = os.path.join(src, '_playlists', 're-export')
        first_export_path = os.path.join(export_dir, 'track.mp3')
        assert os.path.exists(first_export_path)

        # Modify the source file (new content)
        with open(track_path, 'w') as f:
            f.write('new content')

        # Second export — should overwrite
        rv2 = client.post('/playlists/export', json={'name': 're-export'})
        assert rv2.status_code == 200
        assert os.path.exists(first_export_path)

        # The hard-linked file should now reflect the new content
        with open(first_export_path) as f:
            content = f.read()
        assert content == 'new content'


def test_playlists_create_no_name(client):
    """POST /playlists with missing name returns 400."""
    rv = client.post('/playlists', json={'tracks': []})
    assert rv.status_code == 400
    assert rv.json['ok'] is False


def test_playlists_export_no_body(client):
    """POST /playlists/export with no body returns 400."""
    rv = client.post('/playlists/export', json={})
    assert rv.status_code == 400
    assert rv.json['ok'] is False


def _synchsafe(n):
    """Encode a 28-bit integer as 4 synchsafe bytes (ID3v2)."""
    result = bytearray(4)
    for i in range(3, -1, -1):
        result[i] = n & 0x7F
        n >>= 7
    return bytes(result)


def test_get_audio_meta_mp3():
    """Test extraction of year, duration, and codec from an MP3 file with ID3 tags."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'test.mp3')

        # --- Build ID3v2.3 tag with TYER=2021 and TDRC=2021 ---
        tyer = b'TYER' + _synchsafe(5) + b'\x00\x00' + b'\x00' + b'2021'
        tdrc = b'TDRC' + _synchsafe(5) + b'\x00\x00' + b'\x00' + b'2021'
        id3_frames = tyer + tdrc
        id3_header = b'ID3\x03\x00\x00' + _synchsafe(len(id3_frames))
        id3 = id3_header + id3_frames

        # Pad ID3 tag to 1024 bytes
        if len(id3) < 1024:
            id3 += b'\x00' * (1024 - len(id3))

        # --- Build MPEG1 Layer3 frames (128kbps, 44100Hz, stereo, no padding) ---
        # 128kbps → bitrate index 9 → byte2 = 0x90
        header = b'\xff\xfb\x90\x00'
        frame_data = b'\x55' * 413  # 417 total - 4 header = 413 data
        mpeg_frame = header + frame_data

        # 39 frames ≈ 1.0 second at 128kbps 44100Hz
        mpeg_data = mpeg_frame * 39

        with open(path, 'wb') as f:
            f.write(id3)
            f.write(mpeg_data)

        year, duration, codec = get_audio_meta(path)
        assert year == '2021'
        assert duration == 1  # ~1.0 sec rounded
        assert codec is not None
        assert 'MP3' in codec
        assert '128' in codec


def _flac_crc8(data):
    """FLAC CRC-8 (polynomial x^8 + x^2 + x^1 + x^0)."""
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) if (crc & 0x80) else (crc << 1)
            crc &= 0xFF
    return crc


def test_get_audio_meta_flac():
    """Test extraction of year, duration, and codec from a FLAC file with Vorbis comments."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'test.flac')

        sr = 44100
        ch = 2
        bps = 16
        total_samples = 44100  # ~1 second

        # --- fLaC marker ---
        data = bytearray(b'fLaC')

        # --- STREAMINFO block (type 0, not-last) ---
        streaminfo = bytearray()
        streaminfo += struct.pack('>HH', 4096, 4096)   # min/max block size
        streaminfo += b'\x00' * 6                       # min/max frame size (0 = unknown)
        # Pack 20+3+5+4 bits into 32-bit big-endian:
        # sample_rate(20) | (ch-1)(3) | (bps-1)(5) | total_samples_hi(4)
        packed = (sr << 12) | ((ch - 1) << 9) | ((bps - 1) << 4) | ((total_samples >> 32) & 0xF)
        streaminfo += struct.pack('>I', packed)
        streaminfo += struct.pack('>I', total_samples & 0xFFFFFFFF)
        streaminfo += b'\x00' * 16                       # MD5

        data += b'\x00'                                    # block header: not-last, type 0
        data += struct.pack('>I', len(streaminfo))[1:]     # 24-bit size
        data += streaminfo

        # --- Vorbis comment block (type 4, last) ---
        vendor = b'reference libFLAC 1.3.0'
        comments = [b'DATE=2021', b'YEAR=2021']
        vorbis = bytearray()
        vorbis += struct.pack('<I', len(vendor)) + vendor
        vorbis += struct.pack('<I', len(comments))
        for c in comments:
            vorbis += struct.pack('<I', len(c)) + c

        data += b'\x84'                                    # block header: last, type 4
        data += struct.pack('>I', len(vorbis))[1:]         # 24-bit size
        data += vorbis

        # --- Minimal audio frame (SUBFRAME_CONSTANT, silent stereo 16-bit) ---
        # Frame header: sync 0x3FFE(14) reserved(1) blocking(1) blocksize(4)
        #   samplerate(4) channels(4) bps(3) reserved(1)
        # = 32 bits = 0x3FF9C010 (variable blocksize 4096, SR from streaminfo, stereo, bps from streaminfo)
        frame = bytearray()
        frame += struct.pack('>I', 0xFFF9C010)              # frame header
        frame += b'\x00'                                    # sample number 0 (UTF-8)
        frame += bytes([_flac_crc8(frame)])                 # CRC-8 of header bytes so far

        # Subframe L: SUBFRAME_CONSTANT, value=0, 16-bit
        # 7-bit header (wasted=0, type=000000) + 16-bit signed value
        # First byte: [0][000000][v15=0] = 0x00
        frame += b'\x00'
        # Remaining 15 bits of 16-bit value (v14..v0) are all 0
        # Packed as 15 bits: b'\x00\x00' (but only 7 bits of the 3rd byte are used)
        frame += b'\x00\x00'
        # After 23 bits we're 7 bits into byte 3

        # Subframe R: SUBFRAME_CONSTANT, value=0, 16-bit
        # Starting at bit 7 of current byte
        # Header bits 0-6: [wasted=0][type=000000] = 0000000
        # Header bit 7 (v15 of value): 0
        # But we're at bit offset 7, so the first bit of subframe R is the 8th bit of byte 3
        # Byte 3 currently: 0x00 with bit 7 used. Wait, we're consumed 7 bits.
        #
        # Let me redo this more carefully with a bit buffer approach.
        # After subframe L (23 bits): 2 complete bytes + 7 bits
        # We're at byte offset 2 from start of subframe data, bit offset 7.
        # Subframe R header (7 bits) needs to span across byte boundary.
        #
        # Instead of hand-packing, let's use a bit accumulator.

        # --- Simpler approach: use subframe VERBATIM for predictable byte sizes ---
        # Each subframe VERBATIM has: 1+6=7 bits header + blocksize*bps bits of samples
        # With 4096 samples * 16 bits = 65536 bits = 8192 bytes per subframe.
        # That's way too large.

        # Let me use subframe CONSTANT but with proper bit-level packing.

        # Actually, let me try an even simpler frame: FIXED subframe with 0th order predictor
        # SUBFRAME_FIXED(0): 1+6=7 bits header + 16 bits warmup + (blocksize-1)*16 bits residuals
        # With blocksize=4096, that's still huge.

        # OK, let me just write a few KB of clever garbage that looks like subframe data
        # and hope mutagen doesn't validate deeply. Or better: write the bit-packing properly.

        # Let me use a BitWriter helper.
        bits = []  # list of (byte_offset, bit_offset_within_byte, value, num_bits)
        # This is getting too complex. Let me try a different approach.

        # I'll write the subframes as bytes, accepting that the bit alignment might
        # be slightly off. If the test fails, I'll iterate.

        # Actually, the cleanest approach: write subframes as SUBFRAME_CONSTANT
        # using a precise bit buffer.

        class BitBuf:
            def __init__(self):
                self.bytes = bytearray()
                self.bitpos = 0  # total bits written
            def write(self, value, nbits):
                for i in range(nbits - 1, -1, -1):
                    bit = (value >> i) & 1
                    byte_idx = self.bitpos // 8
                    if byte_idx >= len(self.bytes):
                        self.bytes.append(0)
                    if bit:
                        self.bytes[byte_idx] |= 1 << (7 - (self.bitpos % 8))
                    self.bitpos += 1
            def to_bytes(self):
                # Pad to byte boundary
                if self.bitpos % 8:
                    self.bitpos += 8 - (self.bitpos % 8)
                # Ensure bytes allocated
                while len(self.bytes) < (self.bitpos // 8):
                    self.bytes.append(0)
                return bytes(self.bytes[:self.bitpos // 8])

        buf = BitBuf()
        # Subframe L: wasted=0, type=CONSTANT(000000), value=0 (16-bit signed)
        buf.write(0, 1)    # wasted_bits flag
        buf.write(0, 6)    # subframe type = CONSTANT
        buf.write(0, 16)   # constant value
        # Subframe R: same
        buf.write(0, 1)
        buf.write(0, 6)
        buf.write(0, 16)
        subframe_data = buf.to_bytes()

        frame += subframe_data

        # CRC-16 of the entire frame (including header, excluding sync bits in header)
        # FLAC CRC-16: polynomial x^16 + x^15 + x^2 + x^0
        def flac_crc16(data):
            crc = 0
            for b in data:
                crc ^= (b << 8)
                for _ in range(8):
                    crc = ((crc << 1) ^ 0x8005) if (crc & 0x8000) else (crc << 1)
                    crc &= 0xFFFF
            return crc

        frame += struct.pack('>H', flac_crc16(frame))

        data += frame

        with open(path, 'wb') as f:
            f.write(data)

        year, duration, codec = get_audio_meta(path)
        assert year == '2021'
        assert duration == 1  # 44100 samples / 44100 Hz = 1.0 sec
        assert codec is not None
        assert 'FLAC' in codec


def test_nml_status_unconfigured(client):
    rv = client.get('/api/nml/status')
    data = rv.get_json()
    assert data == {'configured': False, 'path': '', 'lastModified': None}


def test_nml_status_configured(client, tmp_path, monkeypatch):
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


def test_track_match_single(client, tmp_path, monkeypatch):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(tmp_path)})
    filename = 'Carbon Decay - In The Warehouse.mp3'  # de la fixture
    local = tmp_path / filename
    local.write_bytes(b'x' * 5243 * 1024)
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert len(data['entries']) == 1
    assert data['multiple'] is False
    assert data['entries'][0]['filename'] == filename


def test_track_match_blocks_path_outside_allowed_dirs(client, tmp_path, monkeypatch):
    """B13 : /api/track/match refuse un chemin hors des dossiers autorisés (403)
    — la route lisait getsize() de n'importe quel fichier existant (fuite d'info)."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    allowed = tmp_path / 'allowed'
    os.makedirs(allowed)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(allowed)})
    # Fichier EXISTANT mais hors des dossiers autorisés (frère de tmp_path).
    local = tmp_path / 'Carbon Decay - In The Warehouse.mp3'
    local.write_bytes(b'x' * 5243 * 1024)
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 403
    assert rv.get_json()['ok'] is False
    # Chemin dans les dossiers autorisés → toujours OK.
    in_allowed = allowed / 'Carbon Decay - In The Warehouse.mp3'
    in_allowed.write_bytes(b'x' * 5243 * 1024)
    rv2 = client.get('/api/track/match', query_string={'path': str(in_allowed)})
    assert rv2.status_code == 200


def test_track_match_exposes_native_grid(client, tmp_path, monkeypatch):
    """P1 : /api/track/match expose la grille native (TEMPO + TYPE=4/GRID) —
    {bpm, phase, quality} — pour que l'éditeur cale la grille sans détection."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(tmp_path)})
    filename = 'Carbon Decay - In The Warehouse.mp3'
    local = tmp_path / filename
    local.write_bytes(b'x' * 5243 * 1024)
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 200
    grid = rv.get_json()['entries'][0]['grid']
    assert grid is not None
    assert grid['bpm'] == pytest.approx(133.0)
    assert grid['phase'] == pytest.approx(55.387418)
    assert grid['quality'] == pytest.approx(100.0)


def test_track_match_grid_none_without_data(client, tmp_path, monkeypatch):
    """Piste sans TEMPO ni grille TYPE=4 → grid: None (le frontend détectera)."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(tmp_path)})
    import nml
    tree = nml.load_nml(str(nml_path))
    coll = tree.getroot().find('./COLLECTION')
    e = ET.SubElement(coll, 'ENTRY', {'ARTIST': 'A', 'TITLE': 'NoGrid', 'TYPE': 'TRACK'})
    ET.SubElement(e, 'LOCATION', {'DIR': '/:', 'FILE': 'NOGRID.mp3', 'VOLUME': 'X'})
    ET.SubElement(e, 'INFO', {'FILESIZE': '42'})
    nml.save_nml(str(nml_path), tree)
    local = tmp_path / 'NOGRID.mp3'
    local.write_bytes(b'x' * 42 * 1024)
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 200
    assert rv.get_json()['entries'][0]['grid'] is None


# ── Beatgrid cache (EPIC-009) ─────────────────────────────────────────────


def test_beatgrid_empty(client, tmp_path):
    """GET /api/beatgrid renvoie {} quand aucun cache n'existe pour la piste."""
    mp3 = tmp_path / 'song.mp3'
    mp3.write_bytes(b'x' * 10)
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.get('/api/beatgrid', query_string={'path': str(mp3)})
    assert rv.status_code == 200
    assert rv.get_json() == {}


def test_beatgrid_roundtrip(client, tmp_path):
    """PUT puis GET : {bpm, phase, source} persistés entre requêtes."""
    mp3 = tmp_path / 'song.mp3'
    mp3.write_bytes(b'x' * 10)
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.put('/api/beatgrid', json={
        'path': str(mp3), 'bpm': 128.5, 'phase': 1.25, 'source': 'manual'})
    assert rv.status_code == 200
    assert rv.get_json() == {'ok': True}
    rv = client.get('/api/beatgrid', query_string={'path': str(mp3)})
    assert rv.status_code == 200
    assert rv.get_json() == {'bpm': 128.5, 'phase': 1.25, 'source': 'manual'}


def test_beatgrid_stale_when_file_changes(client, tmp_path):
    """Le cache est invalidé si FILESIZE change (fichier audio remplacé)."""
    mp3 = tmp_path / 'song.mp3'
    mp3.write_bytes(b'x' * 10)
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    client.put('/api/beatgrid', json={
        'path': str(mp3), 'bpm': 128, 'phase': 0, 'source': 'detected'})
    # Le fichier change de taille → le cache ne s'applique plus.
    mp3.write_bytes(b'x' * 20)
    rv = client.get('/api/beatgrid', query_string={'path': str(mp3)})
    assert rv.status_code == 200
    assert rv.get_json() == {}


def test_beatgrid_outside_allowed_dirs(client, tmp_path):
    """PUT/GET /api/beatgrid refusent un chemin hors dossiers autorisés (403)."""
    allowed = tmp_path / 'allowed'
    allowed.mkdir()
    client.post('/config', json=make_cfg(source_data=str(allowed)))
    outside = tmp_path / 'song.mp3'
    outside.write_bytes(b'x' * 10)
    rv = client.put('/api/beatgrid', json={
        'path': str(outside), 'bpm': 128, 'phase': 0, 'source': 'manual'})
    assert rv.status_code == 403
    rv = client.get('/api/beatgrid', query_string={'path': str(outside)})
    assert rv.status_code == 403


def test_beatgrid_invalid_payload(client, tmp_path):
    """PUT avec payload invalide → 400 (bpm hors bornes, source inconnue)."""
    mp3 = tmp_path / 'song.mp3'
    mp3.write_bytes(b'x' * 10)
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    # bpm hors bornes (garde 20–400, comme le frontend)
    rv = client.put('/api/beatgrid', json={
        'path': str(mp3), 'bpm': 1.0, 'phase': 0, 'source': 'manual'})
    assert rv.status_code == 400
    # source inconnue
    rv = client.put('/api/beatgrid', json={
        'path': str(mp3), 'bpm': 128, 'phase': 0, 'source': 'hack'})
    assert rv.status_code == 400
    # path manquant
    rv = client.put('/api/beatgrid', json={'bpm': 128, 'phase': 0, 'source': 'manual'})
    assert rv.status_code == 400


def test_beatgrid_missing_file(client, tmp_path):
    """GET/PUT sur un fichier inexistant → 404."""
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.get('/api/beatgrid', query_string={'path': str(tmp_path / 'ghost.mp3')})
    assert rv.status_code == 404
    rv = client.put('/api/beatgrid', json={
        'path': str(tmp_path / 'ghost.mp3'), 'bpm': 128, 'phase': 0, 'source': 'manual'})
    assert rv.status_code == 404


# ── Analyse serveur kick/phase (EPIC-010) ─────────────────────────────────


def _kick_wav(path, bpm=128.0, phase=0.25, seconds=6.0, rate=44100):
    """WAV PCM 16-bit : kick 55 Hz amorti chaque beat (4/4), phase décalée.
    Le signal COMPLET est écrit (silences inclus) — un WAV tronqué aux seuls
    kicks produirait un « tempo » faux à la lecture."""
    import array
    import math
    import wave

    n = int(seconds * rate)
    sig = [0.0] * n
    interval = 60.0 / bpm
    t = phase
    while t < seconds - 0.01:
        i0 = int(t * rate)
        for j in range(min(int(0.03 * rate), n - i0)):
            tt = j / rate
            sig[i0 + j] = math.sin(2 * math.pi * 55 * tt) * math.exp(-tt / 0.008)
        t += interval
    pcm = array.array('h', (int(max(-1.0, min(1.0, v)) * 32767) for v in sig))
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def test_analyze_endpoint_kick(client, tmp_path):
    """POST /api/track/analyze sur un kick 4/4 → BPM + phase + confidence,
    et le résultat est persisté dans le cache beatgrid (source detected)."""
    wav = tmp_path / 'kick.wav'
    _kick_wav(wav, bpm=128.0, phase=0.25)
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.post('/api/track/analyze', json={'path': str(wav)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert data['bpm'] == pytest.approx(128.0, abs=2.0)
    assert data['phase'] == pytest.approx(0.25, abs=0.05)
    assert data['confidence'] > 0.3
    # Persisté dans le cache beatgrid (EPIC-009) — réutilisé à la prochaine ouverture.
    rv2 = client.get('/api/beatgrid', query_string={'path': str(wav)})
    cached = rv2.get_json()
    assert cached['bpm'] == pytest.approx(128.0, abs=2.0)
    assert cached['source'] == 'detected'
    assert cached['confidence'] > 0.3


def test_analyze_endpoint_no_beat_returns_null(client, tmp_path):
    """Piste sans kick exploitable (silence) → bpm None + notice, pas d'erreur."""
    import wave

    wav = tmp_path / 'silence.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b'\x00' * (44100 * 3 * 2))  # 3 s de silence 16-bit
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.post('/api/track/analyze', json={'path': str(wav)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert data['bpm'] is None
    assert data['confidence'] == 0.0
    assert 'notice' in data


def test_analyze_endpoint_corrupt_file_422(client, tmp_path):
    """Fichier corrompu/illisible → 422 (AnalysisError), pas de cache écrit."""
    wav = tmp_path / 'corrupt.wav'
    wav.write_bytes(b'RIFF\x00\x00\x00\x00WAVE')  # en-tête tronqué
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.post('/api/track/analyze', json={'path': str(wav)})
    assert rv.status_code == 422
    data = rv.get_json()
    assert data['ok'] is False
    # Aucun cache écrit pour un fichier corrompu.
    rv2 = client.get('/api/beatgrid', query_string={'path': str(wav)})
    assert rv2.get_json() == {}


def test_analyze_endpoint_errors(client, tmp_path):
    """path manquant → 400 ; fichier inexistant → 404 ; hors dossiers → 403."""
    client.post('/config', json=make_cfg(source_data=str(tmp_path)))
    rv = client.post('/api/track/analyze', json={})
    assert rv.status_code == 400
    rv = client.post('/api/track/analyze', json={'path': str(tmp_path / 'ghost.mp3')})
    assert rv.status_code == 404
    allowed = tmp_path / 'allowed'
    allowed.mkdir()
    client.post('/config', json=make_cfg(source_data=str(allowed)))
    outside = tmp_path / 'kick.wav'
    _kick_wav(outside)
    rv = client.post('/api/track/analyze', json={'path': str(outside)})
    assert rv.status_code == 403


def test_cues_write_ok(client, tmp_path, monkeypatch):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    filename = 'Carbon Decay - In The Warehouse.mp3'
    filesize = 5243
    local = tmp_path / filename
    # EPIC-015 : FILESIZE en Ko — fichier de 5243 Ko pour matcher la fixture.
    local.write_bytes(b'x' * filesize * 1024)
    rv = client.post('/api/track/cues', json={
        'path': str(local),
        'filename': filename,
        'filesize': str(filesize),
        'cues': [{'type': '0', 'start': '10.0', 'len': '0.000000', 'hotcue': 0,
                  'name': 'n.n.', 'displ_order': '0'}]
    })
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert (tmp_path / 'c.nml.bak.nml').exists()


# ── Écriture de la grille dans le NML (EPIC-011) ──────────────────────────


def _load_nml_tree(path):
    import nml
    return nml.load_nml(str(path))


def test_grid_write_ok_and_readable(client, tmp_path, monkeypatch):
    """POST /api/track/grid écrit TEMPO + TYPE=4/GRID et le backup .bak est créé."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    rv = client.post('/api/track/grid', json={
        'filename': 'Carbon Decay - In The Warehouse.mp3',
        'filesize': '5243',
        'bpm': 126.5, 'phase': 2.25, 'quality': 100,
    })
    assert rv.status_code == 200
    assert rv.get_json()['ok'] is True
    assert (tmp_path / 'c.nml.bak.nml').exists()
    # Relu depuis le fichier : grille écrite + lisible.
    tree = _load_nml_tree(nml_path)
    entry = tree.getroot().find('.//ENTRY')
    import nml
    grid = nml.get_beatgrid(entry)
    assert grid is not None
    assert grid['bpm'] == pytest.approx(126.5)
    assert grid['phase'] == pytest.approx(2.25)
    tempo = entry.find('TEMPO')
    assert tempo.get('BPM') == '126.500000'
    assert tempo.get('BPM_QUALITY') == '100.000000'


def test_grid_write_rejects_invalid(client, tmp_path, monkeypatch):
    """BPM hors bornes / phase négative / payload manquant → 400."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    base = {'filename': 'Carbon Decay - In The Warehouse.mp3', 'filesize': '5243'}
    rv = client.post('/api/track/grid', json={**base, 'bpm': 1.0})       # aberrant
    assert rv.status_code == 400
    rv = client.post('/api/track/grid', json={**base, 'bpm': 128, 'phase': -1})
    assert rv.status_code == 400
    rv = client.post('/api/track/grid', json={})
    assert rv.status_code == 400
    rv = client.post('/api/track/grid', json={**base, 'bpm': 'abc'})
    assert rv.status_code == 400


def test_grid_write_entry_not_found(client, tmp_path, monkeypatch):
    """Clé (FILE, FILESIZE) inconnue → 404."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    rv = client.post('/api/track/grid', json={
        'filename': 'ghost.mp3', 'filesize': '1', 'bpm': 128, 'phase': 0})
    assert rv.status_code == 404


def test_cues_post_409_multiple(client, tmp_path, monkeypatch):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})
    # index ambigu : 2 ENTRIES de même (FILE, FILESIZE)
    import nml
    tree = nml.load_nml(str(nml_path))
    coll = tree.getroot().find('./COLLECTION')
    for i in range(2):
        e = ET.SubElement(coll, 'ENTRY', {'ARTIST': 'A', 'TITLE': f'T{i}', 'TYPE': 'TRACK'})
        ET.SubElement(e, 'LOCATION', {'DIR': '/:', 'FILE': 'DUP.mp3', 'VOLUME': 'X'})
        ET.SubElement(e, 'INFO', {'FILESIZE': '1'})
    nml.save_nml(str(nml_path), tree)

    rv = client.post('/api/track/cues', json={
        'path': str(tmp_path/'x.mp3'), 'filename': 'DUP.mp3', 'filesize': '1',
        'cues': [{'type': '0', 'start': '0', 'len':'0', 'hotcue': 0}]
    })
    assert rv.status_code == 409
    data = rv.get_json()
    assert data['ok'] is False
    assert data['error'] == 'multiple'
    assert len(data['entries']) == 2


def test_export_nml_written(client, tmp_path, monkeypatch):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    export_root = tmp_path / 'export'
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path),
        'traktor_export_root': str(export_root),
        'traktor_export_volume': 'TRAKTOR_USB',
        'source_data': str(tmp_path)})
    pl_name = 'pl'
    client.post('/playlists', json={'name': pl_name, 'tracks': [
        {'filename': 'Carbon Decay - In The Warehouse.mp3',
         'fullPath': str(tmp_path / 'Carbon Decay - In The Warehouse.mp3'),
         'duration': 132}]})
    (tmp_path / 'Carbon Decay - In The Warehouse.mp3').write_bytes(b'x' * 5243 * 1024)
    rv = client.post('/playlists/export', json={'name': pl_name})
    assert rv.status_code == 200
    assert os.path.exists(export_root / 'collection.nml')
    assert '<NML' in (export_root / 'collection.nml').read_text()


def test_config_preserves_traktor_nml_path(client):
    payload = make_cfg(source_data='/src')
    payload['configs'][0]['traktor_nml_path'] = '/data/collection.nml'
    assert client.post('/config', json=payload).status_code == 200
    rv = client.get('/config')
    assert rv.status_code == 200
    assert rv.json['configs'][0]['traktor_nml_path'] == '/data/collection.nml'


def test_config_roundtrip_export_fields(client):
    """B8 : traktor_export_root + traktor_export_volume survivent au round-trip config."""
    payload = make_cfg(source_data='/src')
    payload['configs'][0]['traktor_export_root'] = '/media/giak/TRAKTOR_USB'
    payload['configs'][0]['traktor_export_volume'] = 'TRAKTOR_USB'
    assert client.post('/config', json=payload).status_code == 200
    rv = client.get('/config')
    cfg = rv.json['configs'][0]
    assert cfg['traktor_export_root'] == '/media/giak/TRAKTOR_USB'
    assert cfg['traktor_export_volume'] == 'TRAKTOR_USB'


def test_export_nml_error_message_without_root(client, tmp_path, monkeypatch):
    """B8 : nml_path configuré mais pas de traktor_export_root → réponse explicite
    (nml_error), plus d'échec silencieux. L'export physique, lui, réussit."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    src = tmp_path / 'source'
    os.makedirs(src)
    track = src / 'Carbon Decay - In The Warehouse.mp3'
    track.write_bytes(b'x' * 5243 * 1024)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_root': '', 'traktor_export_volume': 'TRAKTOR_USB'})
    client.post('/playlists', json={'name': 'pl', 'tracks': [
        {'filename': track.name, 'fullPath': str(track), 'duration': 132}]})
    rv = client.post('/playlists/export', json={'name': 'pl'})
    assert rv.status_code == 200
    assert rv.json['ok'] is True
    assert 'nml_error' in rv.json
    assert 'traktor_export_root' in rv.json['nml_error']
    assert 'nml' not in rv.json
    # L'export physique a bien eu lieu (comportement historique)
    assert os.path.exists(src / '_playlists' / 'pl' / track.name)


def test_export_nml_location_rewritten_via_route(client, tmp_path, monkeypatch):
    """B8 : via la route, le collection.nml écrit porte le DIR relatif à la racine
    d'export (pl_dir sous export_root) — pas le chemin source Linux."""
    import nml as nml_mod
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    src = tmp_path / 'source'
    os.makedirs(src)
    track = src / 'Carbon Decay - In The Warehouse.mp3'
    track.write_bytes(b'x' * 5243 * 1024)
    export_root = tmp_path / 'export'
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_root': str(export_root), 'traktor_export_volume': 'TRAKTOR_USB'})
    client.post('/playlists', json={'name': 'pl', 'tracks': [
        {'filename': track.name, 'fullPath': str(track), 'duration': 132}]})
    rv = client.post('/playlists/export', json={'name': 'pl'})
    assert rv.status_code == 200
    assert rv.json['nml'] == str(export_root / 'collection.nml')
    # Les fichiers physiques sont copiés SOUS export_root (dans _playlists/pl)
    assert os.path.exists(export_root / '_playlists' / 'pl' / track.name)
    tree = nml_mod.load_nml(str(export_root / 'collection.nml'))
    loc = tree.getroot().find('./COLLECTION/ENTRY/LOCATION')
    assert loc.get('DIR') == '/:TRAKTOR_USB/:_playlists/:pl/:'
    assert loc.get('VOLUME') == 'TRAKTOR_USB'


# ── Cue editor — régressions de l'audit 2026-08-08 ──────────────────────────


# ── POST /api/track/add — piste absente → ENTRY créé dans la collection ────


def _setup_nml_and_src(tmp_path):
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    src = tmp_path / 'source'
    os.makedirs(src)
    return nml_path, src


def test_track_add_ok(client, tmp_path, monkeypatch):
    """Ajoute une piste absente : ENTRY écrit dans le fichier + backup + re-match OK."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    track = src / 'new-track.mp3'
    track.write_bytes(b'x' * 999 * 1024)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_volume': ''})

    rv = client.post('/api/track/add', json={'path': str(track)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert data['already'] is False
    assert data['entry']['filename'] == 'new-track.mp3'
    assert data['volume'] == 'TRAKTOR_USB'  # défaut config
    assert (tmp_path / 'c.nml.bak.nml').exists()

    import nml
    tree = nml.load_nml(str(nml_path))
    idx = nml.build_index(tree)
    assert ('new-track.mp3', '999') in idx
    # re-match → l'entrée est trouvée (sauvegarde des cues désormais possible)
    rv2 = client.get('/api/track/match', query_string={'path': str(track)})
    assert rv2.status_code == 200
    assert len(rv2.get_json()['entries']) == 1
    # journal
    rv3 = client.get('/journal')
    assert any(e['status'] == 'collection' for e in rv3.get_json())


def test_track_add_already_present(client, tmp_path, monkeypatch):
    """Piste déjà dans la collection → already:True, aucun doublon créé."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    track = src / 'Carbon Decay - In The Warehouse.mp3'  # présent dans la fixture
    track.write_bytes(b'x' * 5243 * 1024)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_volume': ''})

    rv = client.post('/api/track/add', json={'path': str(track)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert data['already'] is True
    import nml
    tree = nml.load_nml(str(nml_path))
    idx = nml.build_index(tree)
    assert len(idx[('Carbon Decay - In The Warehouse.mp3', '5243')]) == 1  # pas de doublon


def test_track_add_file_at_source_root(client, tmp_path, monkeypatch):
    """Fichier À LA RACINE du dossier source (config avec slash final — cas réel)
    → DIR = volume seul, pas le chemin Linux absolu."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    track = src / 'root.mp3'
    track.write_bytes(b'x' * 7)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src) + os.sep,
        'traktor_export_volume': 'TRAKTOR_USB'})

    rv = client.post('/api/track/add', json={'path': str(track)})
    assert rv.status_code == 200
    import nml
    tree = nml.load_nml(str(nml_path))
    locs = [e for e in tree.getroot().findall('./COLLECTION/ENTRY/LOCATION')
            if e.get('FILE') == 'root.mp3']
    assert len(locs) == 1
    assert locs[0].get('DIR') == '/:TRAKTOR_USB/:'


def test_track_add_volume_too_long(client, tmp_path, monkeypatch):
    """Volume de plus de 64 caractères → 400 (le NML reste intact)."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    track = src / 'v.mp3'
    track.write_bytes(b'x' * 3)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src)})
    rv = client.post('/api/track/add', json={'path': str(track), 'volume': 'V' * 100})
    assert rv.status_code == 400
    assert 'volume' in rv.get_json()['error']


def test_track_add_volume_override(client, tmp_path, monkeypatch):
    """Le volume fourni dans la requête est respecté (LOCATION/VOLUME + DIR)."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    sub = src / 'house' / '2024'
    os.makedirs(sub)
    track = sub / 'over.mp3'
    track.write_bytes(b'x' * 42)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_volume': 'TRAKTOR_USB'})

    rv = client.post('/api/track/add', json={'path': str(track), 'volume': 'D:'})
    assert rv.status_code == 200
    assert rv.get_json()['volume'] == 'D:'
    import nml
    tree = nml.load_nml(str(nml_path))
    locs = [e for e in tree.getroot().findall('./COLLECTION/ENTRY/LOCATION') if e.get('FILE') == 'over.mp3']
    assert len(locs) == 1
    loc = locs[0]
    assert loc.get('VOLUME') == 'D:'
    # DIR relatif au dossier source : house/2024
    assert loc.get('DIR') == '/:D:/:house/:2024/:'


def test_track_add_missing_file(client, tmp_path, monkeypatch):
    """Fichier inexistant → 404."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src)})
    rv = client.post('/api/track/add', json={'path': str(src / 'ghost.mp3')})
    assert rv.status_code == 404


def test_track_add_no_nml(client, tmp_path, monkeypatch):
    """NML non configuré → 400."""
    with tempfile.TemporaryDirectory() as tmp:
        track = os.path.join(tmp, 'x.mp3')
        open(track, 'w').close()
        monkeypatch.setattr('app.get_active_config', lambda: {'source_data': tmp})
        rv = client.post('/api/track/add', json={'path': track})
        assert rv.status_code == 400
        assert 'NML' in rv.get_json()['error']


def test_track_add_outside_allowed(client, tmp_path, monkeypatch):
    """Fichier hors des dossiers autorisés → 403 (cohérent avec /audio)."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    outside = tmp_path / 'elsewhere'
    os.makedirs(outside)
    track = outside / 'leak.mp3'
    track.write_bytes(b'x' * 5)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src)})
    rv = client.post('/api/track/add', json={'path': str(track)})
    assert rv.status_code == 403


def test_main_execution_registers_track_cues_route(monkeypatch):
    """Régression B1 : en exécution `python app.py` (run_name='__main__'), la route
    /api/track/cues DOIT être enregistrée. Elle était déclarée après le bloc
    `if __name__ == '__main__': app.run(...)` → 404 réel alors que pytest passait."""
    import runpy
    import flask

    # Neutralise app.run() : on vérifie l'enregistrement des routes, pas le serveur.
    monkeypatch.setattr(flask.Flask, 'run', lambda self, **kw: None)
    mod = runpy.run_path('app.py', run_name='__main__')
    rules = {str(r.rule) for r in mod['app'].url_map.iter_rules()}
    assert '/api/track/cues' in rules
    assert '/api/nml/status' in rules


def _setup_cues_nml(client, tmp_path, monkeypatch, nml_name='c.nml'):
    """Configure un NML jouable + une piste matchée pour les tests de la route cues."""
    nml_path = tmp_path / nml_name
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    # source_data = tmp_path : /api/track/match exige le chemin dans les dossiers
    # autorisés (garde is_path_allowed, alignée sur /audio — audit B13).
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(tmp_path)})
    filename = 'Carbon Decay - In The Warehouse.mp3'
    filesize = 5243
    local = tmp_path / filename
    # FILESIZE NML en Ko (EPIC-015) : le fichier doit faire 5243 Ko = 5243*1024
    # octets pour matcher — un fichier de 5243 octets (l'ancien bug) ne matche pas.
    local.write_bytes(b'x' * filesize * 1024)
    return filename, str(filesize)


def test_cues_post_rejects_bad_type(client, tmp_path, monkeypatch):
    """B6 : type de cue hors {0,5} → 400 (le serveur reste la ligne de défense)."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '9', 'start': '10.0', 'len': '0', 'hotcue': 0}]})
    assert rv.status_code == 400
    assert 'type' in rv.json['error']


def test_cues_post_rejects_bad_hotcue(client, tmp_path, monkeypatch):
    """B6 : hotcue hors 0..7 ou non entier → 400."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '0', 'start': '10.0', 'len': '0', 'hotcue': 8}]})
    assert rv.status_code == 400
    assert 'hotcue' in rv.json['error']

    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '0', 'start': '10.0', 'len': '0', 'hotcue': 'abc'}]})
    assert rv.status_code == 400
    assert 'hotcue' in rv.json['error']


def test_cues_post_rejects_negative_start(client, tmp_path, monkeypatch):
    """B6 : start ou len négatif ou non numérique → 400."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '0', 'start': '-5', 'len': '0', 'hotcue': 0}]})
    assert rv.status_code == 400
    assert 'start' in rv.json['error']

    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '5', 'start': '10.0', 'len': 'x', 'hotcue': 1}]})
    assert rv.status_code == 400
    assert 'len' in rv.json['error']


def test_cues_post_rejects_nan_and_inf(client, tmp_path, monkeypatch):
    """B6 : start/len 'nan' ou 'inf' passeraient `val < 0` → rejetés par isfinite."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    for bad in ('nan', 'inf'):
        rv = client.post('/api/track/cues', json={
            'filename': filename, 'filesize': filesize,
            'cues': [{'type': '0', 'start': bad, 'len': '0', 'hotcue': 0}]})
        assert rv.status_code == 400, f'start={bad} doit être rejeté'
        assert 'start' in rv.json['error']


def test_cues_post_rejects_float_hotcue(client, tmp_path, monkeypatch):
    """B6 : un hotcue flottant (2.5) ne doit pas être tronqué silencieusement."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '0', 'start': '10.0', 'len': '0', 'hotcue': 2.5}]})
    assert rv.status_code == 400
    assert 'hotcue' in rv.json['error']


def test_cues_post_valid_still_ok(client, tmp_path, monkeypatch):
    """B6 : un cue valide passe toujours la validation (200)."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    rv = client.post('/api/track/cues', json={
        'filename': filename, 'filesize': filesize,
        'cues': [{'type': '0', 'start': '10.0', 'len': '0.000000', 'hotcue': 0,
                  'name': 'n.n.', 'displ_order': '0'}]})
    assert rv.status_code == 200
    assert rv.json['ok'] is True


def test_track_match_exposes_dir_volume(client, tmp_path, monkeypatch):
    """Le sélecteur d'homonymes reçoit DIR/VOLUME pour discriminer les entrées."""
    filename, filesize = _setup_cues_nml(client, tmp_path, monkeypatch)
    local = tmp_path / filename
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 200
    e = rv.json['entries'][0]
    assert 'dir' in e and e['dir']
    assert 'volume' in e and e['volume']


def test_cues_post_with_entry_writes_selected(client, tmp_path, monkeypatch):
    """Avec `entry` (désambiguïsation multi-match), le POST écrit la BONNE ENTRY."""
    import nml as nml_mod

    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {'traktor_nml_path': str(nml_path)})

    # 2 ENTRIES ambiguës (même FILE + même FILESIZE)
    tree = nml_mod.load_nml(str(nml_path))
    coll = tree.getroot().find('./COLLECTION')
    for i in range(2):
        e = ET.SubElement(coll, 'ENTRY', {'ARTIST': 'A', 'TITLE': f'T{i}', 'TYPE': 'TRACK'})
        ET.SubElement(e, 'LOCATION', {'DIR': '/:', 'FILE': 'DUP.mp3', 'VOLUME': 'X'})
        ET.SubElement(e, 'INFO', {'FILESIZE': '1'})
    nml_mod.save_nml(str(nml_path), tree)

    rv = client.post('/api/track/cues', json={
        'path': str(tmp_path / 'x.mp3'), 'filename': 'DUP.mp3', 'filesize': '1',
        'entry': 1,
        'cues': [{'type': '0', 'start': '42.0', 'len': '0.000000', 'hotcue': 0,
                  'name': 'n.n.', 'displ_order': '0'}]
    })
    assert rv.status_code == 200
    assert rv.get_json()['ok'] is True

    tree2 = nml_mod.load_nml(str(nml_path))
    entries = tree2.getroot().findall('./COLLECTION/ENTRY')
    hits = [e for e in entries if e.find('LOCATION').get('FILE') == 'DUP.mp3']
    assert len(hits) == 2
    assert nml_mod.get_cues(hits[0]) == []
    cues1 = nml_mod.get_cues(hits[1])
    assert cues1 and cues1[0]['start'] == '42.0'


# ── EPIC-013 : robustesse backend ──────────────────────────────────────────

def test_save_json_atomic_no_tmp_leftover(tmp_path):
    """save_json écrit via .tmp + os.replace : pas de fichier .tmp résiduel."""
    p = tmp_path / 'x.json'
    save_json(str(p), {'a': 1})
    assert p.exists()
    assert not (tmp_path / 'x.json.tmp').exists()
    assert json.loads(p.read_text()) == {'a': 1}


def test_load_json_corrupt_returns_default(tmp_path):
    """JSON corrompu → défaut, pas d'exception (et une entrée journal 'error')."""
    p = tmp_path / 'corrupt.json'
    p.write_text('{pas du json')
    assert load_json(str(p), []) == []
    # L'incident est journalisé (le journal est indépendant du fichier corrompu).
    from app import JOURNAL_PATH
    journal = json.loads(open(JOURNAL_PATH).read())
    assert any(e['status'] == 'error' and 'JSON' in e['action'] for e in journal)


def test_load_json_missing_returns_default(tmp_path):
    assert load_json(str(tmp_path / 'absent.json'), {'x': 1}) == {'x': 1}


def test_journal_rotation_bounded():
    """Le journal est borné à JOURNAL_MAX_ENTRIES (rotation de tête)."""
    for i in range(JOURNAL_MAX_ENTRIES + 50):
        log_journal({'timestamp': f't{i}', 'action': f'a{i}', 'details': '', 'status': 'scan'})
    from app import JOURNAL_PATH
    data = json.loads(open(JOURNAL_PATH).read())
    assert len(data) == JOURNAL_MAX_ENTRIES
    # Les 50 plus anciennes ont été tronquées — la plus ancienne restante est t50.
    assert data[0]['action'] == 'a50'
    assert data[-1]['action'] == f'a{JOURNAL_MAX_ENTRIES + 49}'


def test_scan_verrou_409(client, monkeypatch):
    """Un second scan pendant un scan en cours → 409 (verrou serveur)."""
    _scan_progress['running'] = True
    try:
        rv = client.get('/scan')
        assert rv.status_code == 409
    finally:
        _scan_progress['running'] = False


def test_scan_relache_le_verrou_apres_erreur(client, monkeypatch, tmp_path):
    """Le verrou est relâché même si le scan lève (finally)."""
    def boom(*a, **k):
        raise RuntimeError('indexation plantée')
    monkeypatch.setattr('app.index_files', boom)
    monkeypatch.setattr('app.get_active_config',
                        lambda: {'source_data': '', 'epars_dirs': ['/nonexistent']})
    # Flask en mode TESTING propage l'exception → pytest.raises.
    with pytest.raises(RuntimeError):
        client.get('/scan')
    assert _scan_progress['running'] is False


def test_journal_delete_clears(client):
    """DELETE /journal vide le journal et le GET renvoie []."""
    log_journal({'timestamp': 't', 'action': 'a', 'details': '', 'status': 'scan'})
    rv = client.delete('/journal')
    assert rv.status_code == 200
    assert rv.get_json() == {'ok': True}
    assert client.get('/journal').get_json() == []


def test_nml_cache_by_mtime(client, monkeypatch, tmp_path):
    """get_nml_index cache par (realpath, mtime+size) : pas de re-parse inutile."""
    import app as app_mod
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_traktor_nml_path', lambda: str(nml_path))
    _invalidate_nml_cache()

    calls = []
    orig_load = app_mod.nml_module.load_nml
    def counting_load(p):
        calls.append(p)
        return orig_load(p)
    monkeypatch.setattr(app_mod.nml_module, 'load_nml', counting_load)

    tree1, idx1, path1 = get_nml_index()
    tree2, idx2, path2 = get_nml_index()  # cache hit — load_nml pas rappelé
    assert len(calls) == 1
    assert tree1 is tree2
    assert idx1 is idx2

    # Le fichier change → re-parse (mtime+size différents).
    nml_path.write_text('<NML><COLLECTION><ENTRY TYPE="TRACK"><INFO/></ENTRY></COLLECTION></NML>')
    tree3, idx3, _ = get_nml_index()
    assert len(calls) == 2
    assert tree3 is not tree1


# ── EPIC-015 : FILESIZE en Ko (convention Traktor) ────────────────────────


def test_track_match_matches_real_sized_file_in_kib(client, tmp_path, monkeypatch):
    """EPIC-015 : un fichier RÉEL (≥ 3 Mo, Ko ≠ octets) matche la fixture dont le
    FILESIZE est en Ko — avant le fix, le match en octets renvoyait toujours []."""
    nml_path = tmp_path / 'c.nml'
    nml_path.write_text(open('tests/fixtures/nml-sample.xml').read())
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(tmp_path)})
    filename = 'Carbon Decay - In The Warehouse.mp3'  # FILESIZE='5243' (Ko) dans la fixture
    local = tmp_path / filename
    local.write_bytes(b'x' * 5243 * 1024)  # 5 368 832 octets = 5243 Ko
    rv = client.get('/api/track/match', query_string={'path': str(local)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert len(data['entries']) == 1
    assert data['entries'][0]['filename'] == filename
    # La valeur exposée est le FILESIZE du NML (Ko) — pas la taille disque en octets.
    assert data['entries'][0]['filesize'] == '5243'


def test_track_add_writes_filesize_in_kib(client, tmp_path, monkeypatch):
    """EPIC-015 : la piste ajoutée (EPIC-007) écrit INFO/FILESIZE en Ko (convention
    Traktor) — sinon elle serait introuvable au re-match et Traktor lirait une
    taille fausse."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    track = src / 'new-track.mp3'
    track.write_bytes(b'x' * 999 * 1024)  # 999 Ko = 1 022 976 octets
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_volume': ''})

    rv = client.post('/api/track/add', json={'path': str(track)})
    assert rv.status_code == 200
    assert rv.get_json()['already'] is False

    import nml as nml_mod
    tree = nml_mod.load_nml(str(nml_path))
    idx = nml_mod.build_index(tree)
    # FILESIZE écrit = 999 Ko (et non 1 022 976 octets — le bug octets).
    assert ('new-track.mp3', '999') in idx
    assert ('new-track.mp3', '1022976') not in idx
    # Re-match OK (round-trip add → match, le flux EPIC-007).
    rv2 = client.get('/api/track/match', query_string={'path': str(track)})
    assert rv2.status_code == 200
    assert len(rv2.get_json()['entries']) == 1


def test_track_add_already_present_matches_in_kib(client, tmp_path, monkeypatch):
    """EPIC-015 : already=True détecté en Ko — un fichier de 5243 Ko est reconnu
    comme présent (avant le fix : détecté absent → doublon créé)."""
    nml_path, src = _setup_nml_and_src(tmp_path)
    track = src / 'Carbon Decay - In The Warehouse.mp3'  # présent (FILESIZE='5243' Ko)
    track.write_bytes(b'x' * 5243 * 1024)
    monkeypatch.setattr('app.get_active_config', lambda: {
        'traktor_nml_path': str(nml_path), 'source_data': str(src),
        'traktor_export_volume': ''})

    rv = client.post('/api/track/add', json={'path': str(track)})
    assert rv.status_code == 200
    data = rv.get_json()
    assert data['ok'] is True
    assert data['already'] is True
    import nml as nml_mod
    tree = nml_mod.load_nml(str(nml_path))
    idx = nml_mod.build_index(tree)
    assert len(idx[('Carbon Decay - In The Warehouse.mp3', '5243')]) == 1  # pas de doublon


# ── EPIC-033 T2/T4 : /years/preview (consolidation des caches d'années) ────

def _write_years_caches(monkeypatch, tmp_path, ycache, dcache=None, icache=None,
                        rcache=None):
    """Écrit les caches d'années de test + monkeypatch des chemins app.
    Le cache reform est TOUJOURS redirigé (il existe sur disque, écrit en
    direct par la passe en cours — sans redirection, les tests liraient
    des données réelles)."""
    def dump(name, rows):
        p = tmp_path / name
        p.write_text('\n'.join(json.dumps(r) for r in rows) + '\n')
        return str(p)

    monkeypatch.setattr('app.YEAR_CACHE_PATH', dump('year_cache.jsonl', ycache))
    monkeypatch.setattr('app.DISCOGS_CACHE_PATH',
                        dump('discogs_cache.jsonl', dcache or []))
    monkeypatch.setattr('app.ITUNES_CACHE_PATH',
                        dump('itunes_cache.jsonl', icache or []))
    monkeypatch.setattr('app.REFORM_CACHE_PATH',
                        dump('discogs_reform_cache.jsonl', rcache or []))


def _years_cache_json(tmp_path, files):
    """cache.json minimal : {'source': {base: {fn: meta}}}."""
    base = str(tmp_path / 'music')
    payload = {'source': {base: {}}, 'epars': {}}
    for fn, meta in files.items():
        m = {'path': fn}
        m.update(meta)
        payload['source'][base][fn] = m
    return base, payload


def test_years_preview_vagues_et_conservation(client, tmp_path, monkeypatch):
    """Toutes les files sans année sont comptées (somme = files_no_year) et
    réparties par vague ; les non-parsables restent introuvables."""
    _write_years_caches(monkeypatch, tmp_path,
                        ycache=[{'key': 'foo\tbar', 'status': 'found',
                                 'year': '1990', 'source': 'musicbrainz'}],
                        dcache=[{'key': 'baz\tqux', 'status': 'lax',
                                 'year': '2009'}])
    base, payload = _years_cache_json(tmp_path, {
        'foo - bar.mp3': {},                     # found MB → certaines
        'Baz - Qux (Remix).flac': {},            # lax Discogs → a_revue
        'Inconnu - Quelqu_un.mp3': {},           # aucune conclusion → introuvable
        '05. .mp3': {},                          # non parsable → introuvable
    })
    monkeypatch.setattr('app.CACHE_PATH', str(tmp_path / 'cache.json'))
    (tmp_path / 'cache.json').write_text(json.dumps(payload))

    rv = client.get('/years/preview')
    assert rv.status_code == 200
    d = rv.get_json()
    assert d['files_no_year'] == 4
    assert len(d['certaines']) == 1
    assert d['certaines'][0]['year'] == '1990'
    assert d['certaines'][0]['title'] == 'bar'
    assert len(d['a_revue']) == 1
    assert d['a_revue'][0]['year'] == '2009' and d['a_revue'][0]['status'] == 'lax'
    assert d['introuvables'] == 2
    assert len(d['certaines']) + len(d['a_revue']) + d['introuvables'] == d['files_no_year']


def test_years_preview_priorite_entre_sources(client, tmp_path, monkeypatch):
    """Priorité MB/Deezer > Discogs > iTunes ; un 'none' amont laisse passer
    le pool suivant ; le consensus ≤ 2 ans ne vaut PAS pour Discogs."""
    _write_years_caches(
        monkeypatch, tmp_path,
        ycache=[{'key': 'found mb\tx', 'status': 'found', 'year': '1990'},
                {'key': 'relay\tx', 'status': 'none'}],
        dcache=[{'key': 'found mb\tx', 'status': 'lax', 'year': '2001'},
                {'key': 'serre dg\tx', 'status': 'ambiguous',
                 'years': ['2002', '2003']}],
        icache=[{'key': 'relay\tx', 'status': 'lax', 'year': '2024'}])
    base, payload = _years_cache_json(tmp_path, {
        'Found MB - x.mp3': {},
        'Serre DG - x.mp3': {},   # ambigu Discogs fenêtre ≤ 2 : reste à revue
        'Relay - x.mp3': {},      # MB none → iTunes lax
    })
    monkeypatch.setattr('app.CACHE_PATH', str(tmp_path / 'cache.json'))
    (tmp_path / 'cache.json').write_text(json.dumps(payload))

    d = client.get('/years/preview').get_json()
    certain = {it['artist']: it['year'] for it in d['certaines']}
    review = {it['artist'] for it in d['a_revue']}
    assert certain == {'found mb': '1990'}   # pas le lax Discogs 2001
    assert review == {'serre dg', 'relay'}   # ambigu Discogs : pas de consensus
    relay = next(it for it in d['a_revue'] if it['artist'] == 'relay')
    assert relay['year'] == '2024'  # iTunes revendique le none MB


def test_years_preview_derniere_ligne_par_fichier(client, tmp_path, monkeypatch):
    """Deux lignes même clé : la DERNIÈRE gagne (runs corrigés), pas la
    première — et si la dernière est 'error', le fichier retombe introuvable
    (pas de résultat périmé)."""
    _write_years_caches(monkeypatch, tmp_path,
                        ycache=[{'key': 'a\tb', 'status': 'ambiguous',
                                 'years': ['1995', '2014']},
                                {'key': 'a\tb', 'status': 'found',
                                 'year': '2000'},
                                {'key': 'c\td', 'status': 'found',
                                 'year': '1999'},
                                {'key': 'c\td', 'status': 'error',
                                 'years': ['HTTPError: 503']}])
    base, payload = _years_cache_json(tmp_path, {
        'A - B.mp3': {}, 'C - D.mp3': {}})
    monkeypatch.setattr('app.CACHE_PATH', str(tmp_path / 'cache.json'))
    (tmp_path / 'cache.json').write_text(json.dumps(payload))

    d = client.get('/years/preview').get_json()
    # c/d : found puis error → l'error est ignorée, le found antérieur reste
    # valide (sémantique commune collecteurs / report_years.last_valid).
    assert sorted((it['artist'], it['year']) for it in d['certaines']) == \
        [('a', '2000'), ('c', '1999')]
    assert d['introuvables'] == 0


def test_years_preview_ne_propose_pas_les_fichiers_annes(client, tmp_path, monkeypatch):
    """Un fichier avec année au scan n'entre jamais dans la preview."""
    _write_years_caches(monkeypatch, tmp_path,
                        ycache=[{'key': 'c\td', 'status': 'found', 'year': '1990'}])
    base, payload = _years_cache_json(tmp_path, {
        'A - B.mp3': {'year': '1984'},   # déjà année → exclu
        'C - D.mp3': {},                 # sans année → candidat
    })
    monkeypatch.setattr('app.CACHE_PATH', str(tmp_path / 'cache.json'))
    (tmp_path / 'cache.json').write_text(json.dumps(payload))

    d = client.get('/years/preview').get_json()
    assert d['files_no_year'] == 1
    assert len(d['certaines']) == 1


def test_years_preview_pool_reform_dernier_rideau(client, tmp_path, monkeypatch):
    """Le pool reform (Discogs requêtes reformulées) résout les clés 'none'
    partout ailleurs : found → certaines, lax → a_revue — et ne masque
    JAMAIS une conclusion amont (pas de chevauchement par construction)."""
    _write_years_caches(
        monkeypatch, tmp_path,
        ycache=[{'key': 'digitalism\tzdarlight', 'status': 'none'},
                {'key': 'lfo\tfreak', 'status': 'none'},
                {'key': 'tim xavier\treal jack', 'status': 'found',
                 'year': '2001', 'source': 'musicbrainz'}],
        dcache=[{'key': 'digitalism\tzdarlight', 'status': 'none'},
                {'key': 'lfo\tfreak', 'status': 'none'}],
        icache=[{'key': 'digitalism\tzdarlight', 'status': 'none'}],
        rcache=[{'key': 'digitalism\tzdarlight', 'status': 'found',
                 'year': '2005', 'source': 'reform_discogs'},
                {'key': 'lfo\tfreak', 'status': 'lax', 'year': '2009',
                 'source': 'reform_discogs'},
                {'key': 'tim xavier\treal jack', 'status': 'lax',
                 'year': '2003', 'source': 'reform_discogs'}])
    base, payload = _years_cache_json(tmp_path, {
        'Digitalism - Zdarlight.mp3': {},   # reform found → certaines
        'LFO - Freak.mp3': {},              # reform lax → a_revue
        'Tim Xavier - Real Jack.mp3': {},   # MB found → PAS écrasé par reform
    })
    monkeypatch.setattr('app.CACHE_PATH', str(tmp_path / 'cache.json'))
    (tmp_path / 'cache.json').write_text(json.dumps(payload))

    d = client.get('/years/preview').get_json()
    certain = {it['artist']: (it['year'], it['source'])
               for it in d['certaines']}
    review = {it['artist'] for it in d['a_revue']}
    assert certain['digitalism'] == ('2005', 'reform_discogs')
    assert certain['tim xavier'] == ('2001', 'musicbrainz')  # amont intact
    assert review == {'lfo'}
    assert len(d['certaines']) + len(d['a_revue']) + d['introuvables'] \
        == d['files_no_year'] == 3
