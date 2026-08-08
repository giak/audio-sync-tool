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