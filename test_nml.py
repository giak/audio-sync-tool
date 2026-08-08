import os
import xml.etree.ElementTree as ET
import pytest
from nml import load_nml, build_index, get_cues, get_entry_meta, write_cues, save_nml, build_export_nml, build_entry_element, append_entry

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


def test_write_cues_preserves_hotcue_minus1(tmp_path):
    """B5 : les CUE_V2 TYPE∈{0,5} à HOTCUE=-1 (non éditables) ne sont PAS effacés
    par write_cues — ils ne sont pas restitués par get_cues mais doivent survivre."""
    tree = load_nml(DATA)
    entry = tree.getroot().find('./COLLECTION/ENTRY')
    # Ajoute un cue TYPE=0 HOTCUE=-1 (existe en vraie collection) + un TYPE=5 HOTCUE=-1
    ET.SubElement(entry, 'CUE_V2', {'TYPE': '0', 'HOTCUE': '-1', 'START': '1.0'})
    ET.SubElement(entry, 'CUE_V2', {'TYPE': '5', 'HOTCUE': '-1', 'START': '2.0'})

    cues = get_cues(entry)  # ne restitue PAS les HOTCUE=-1
    assert all(c['hotcue'] >= 0 for c in cues)
    write_cues(entry, cues)

    kept = [c for c in entry.findall('CUE_V2') if c.get('HOTCUE') == '-1']
    # Les 2 ajoutés (START 1.0 / 2.0) survivent — le compte exact dépend des
    # CUE_V2 de la fixture (ex. TYPE=4 HOTCUE=-1, légitimement conservé).
    starts = {c.get('START') for c in kept}
    assert {'1.0', '2.0'} <= starts, 'les HOTCUE=-1 doivent survivre à la sauvegarde'
    added = [c for c in kept if c.get('START') in ('1.0', '2.0')]
    assert all(c.get('TYPE') in ('0', '5') for c in added)


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


def test_build_entry_element_shape():
    """L'ENTRY construit pour une piste absente porte LOCATION + INFO/FILESIZE
    (clé de match) et les métadonnées fournies."""
    el = build_entry_element(
        {'filename': 'new-track.mp3', 'title': 'Titre', 'artist': 'Artiste', 'album': 'Album'},
        1234, 200.5, 'D:', '/:D:/:Mix/:',)
    assert el.tag == 'ENTRY'
    assert el.get('TITLE') == 'Titre'
    assert el.get('ARTIST') == 'Artiste'
    loc = el.find('LOCATION')
    assert loc is not None
    assert loc.get('FILE') == 'new-track.mp3'
    assert loc.get('DIR') == '/:D:/:Mix/:'
    assert loc.get('VOLUME') == 'D:'
    info = el.find('INFO')
    assert info is not None
    assert info.get('FILESIZE') == '1234'
    assert info.get('PLAYTIME') == '200'
    assert info.get('PLAYTIME_FLOAT') == '200.500000'
    assert info.get('PLAYCOUNT') == '0'
    assert el.find('MODIFICATION_INFO').get('AUTHOR_TYPE') == 'user'
    assert el.find('ALBUM').get('TITLE') == 'Album'


def test_build_entry_element_fallback_title_artist():
    """Sans tags : TITLE = nom de fichier (sans extension), ARTIST vide."""
    el = build_entry_element({'filename': 'only-file.mp3', 'artist': '', 'album': ''},
                             1, None, 'TRAKTOR_USB', '/:TRAKTOR_USB/:',)
    assert el.get('TITLE') == 'only-file'
    assert el.get('ARTIST') == ''
    assert el.find('INFO').get('PLAYTIME') is None


def test_append_entry_updates_count_and_index(tmp_path):
    """append_entry : ENTRIES incrémenté ET l'entrée est indexable (FILE, FILESIZE)."""
    tree = load_nml(DATA)
    coll = tree.getroot().find('./COLLECTION')
    before = int(coll.get('ENTRIES'))
    el = build_entry_element({'filename': 'added.mp3', 'title': 'A', 'artist': '', 'album': ''},
                             99, None, 'D:', '/:D:/:x/:',)
    append_entry(tree, el)
    assert int(coll.get('ENTRIES')) == before + 1
    idx = build_index(tree)
    assert ('added.mp3', '99') in idx
    assert len(idx[('added.mp3', '99')]) == 1


def test_traktor_dir():
    from nml import traktor_dir
    assert traktor_dir('Mix/Folder', 'TRAKTOR_USB') == '/:TRAKTOR_USB/:Mix/:Folder/:'
    assert traktor_dir('', 'TRAKTOR_USB') == '/:TRAKTOR_USB/:'


def _copy_fixture(tmp_path, name='c.nml'):
    dst = tmp_path / name
    dst.write_text(open(DATA).read(), encoding='utf-8')
    return str(dst)


def test_build_export_nml_rewrites_location(tmp_path):
    """B8 : DIR calculé depuis l'emplacement RÉEL des fichiers exportés (pl_dir),
    pas depuis le chemin source original. VOLUME + VOLUMEID réécrits."""
    nml_path = _copy_fixture(tmp_path)
    export_root = tmp_path / 'export'
    pl_dir = export_root / '_playlists' / 'mon-set'
    local = tmp_path / 'Carbon Decay - In The Warehouse.mp3'
    local.write_bytes(b'x' * 5243)  # FILESIZE réel de la fixture

    out = build_export_nml(
        [{'filename': 'Carbon Decay - In The Warehouse.mp3', 'fullPath': str(local)}],
        nml_path, str(export_root), 'TRAKTOR_USB', str(pl_dir))

    assert out == str(export_root / 'collection.nml')
    tree = load_nml(out)
    entries = tree.getroot().findall('./COLLECTION/ENTRY')
    assert len(entries) == 1
    loc = entries[0].find('LOCATION')
    assert loc.get('DIR') == '/:TRAKTOR_USB/:_playlists/:mon-set/:'
    assert loc.get('VOLUME') == 'TRAKTOR_USB'
    assert loc.get('VOLUMEID') == 'ffffffff'
    # FILE inchangé
    assert loc.get('FILE') == 'Carbon Decay - In The Warehouse.mp3'


def test_build_export_nml_dir_at_root(tmp_path):
    """pl_dir == export_root → DIR = '/:VOLUME/:'. (fichiers à la racine du volume)"""
    nml_path = _copy_fixture(tmp_path)
    export_root = tmp_path / 'export'
    local = tmp_path / 'Carbon Decay - In The Warehouse.mp3'
    local.write_bytes(b'x' * 5243)

    out = build_export_nml(
        [{'filename': 'Carbon Decay - In The Warehouse.mp3', 'fullPath': str(local)}],
        nml_path, str(export_root), 'TRAKTOR_USB', str(export_root))

    tree = load_nml(out)
    loc = tree.getroot().find('./COLLECTION/ENTRY/LOCATION')
    assert loc.get('DIR') == '/:TRAKTOR_USB/:'


def test_build_export_nml_requires_export_root(tmp_path):
    """B8 : export_root vide → ValueError explicite (plus d'échec silencieux
    silencieux via os.makedirs(''))."""
    nml_path = _copy_fixture(tmp_path)
    with pytest.raises(ValueError, match='traktor_export_root'):
        build_export_nml([], nml_path, '', 'TRAKTOR_USB', str(tmp_path))


def test_build_export_nml_requires_pl_dir_under_root(tmp_path):
    """pl_dir hors de export_root → ValueError explicite."""
    nml_path = _copy_fixture(tmp_path)
    export_root = tmp_path / 'export'
    outside = tmp_path / 'ailleurs'  # PAS sous export_root
    with pytest.raises(ValueError, match='n\'est pas sous la racine'):
        build_export_nml([], nml_path, str(export_root), 'TRAKTOR_USB', str(outside))
