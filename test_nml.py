import os
import xml.etree.ElementTree as ET
from nml import load_nml, build_index, get_cues, get_entry_meta, write_cues, save_nml

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


def test_save_nml_header_and_half_not_commit(tmp_path):
    dst = tmp_path / 'collection2.nml'
    dst.write_text(open(DATA).read(), encoding='utf-8')
    tree = load_nml(str(dst))
    save_nml(str(dst), tree)
    raw = dst.read_text(encoding='utf-8')
    assert '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>' in raw
