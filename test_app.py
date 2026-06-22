import json
import os
import tempfile
import pytest
from app import app, CONFIG_PATH, JOURNAL_PATH


@pytest.fixture(autouse=True)
def clean_state():
    for p in [CONFIG_PATH, JOURNAL_PATH]:
        if os.path.exists(p):
            os.remove(p)


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
