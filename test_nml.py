import os
import xml.etree.ElementTree as ET
import pytest
from nml import (load_nml, build_index, get_cues, get_beatgrid, get_entry_meta, write_cues,
                 save_nml, build_export_nml, build_entry_element, append_entry, upsert_beatgrid)

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


def test_get_beatgrid_native():
    """Grille native Traktor : TEMPO BPM/BPM_QUALITY + CUE_V2 TYPE=4 (START=phase)
    + GRID/BPM → {bpm, phase, quality}. La fixture porte une vraie grille."""
    tree = load_nml(DATA)
    entry = tree.getroot().find('.//ENTRY')
    grid = get_beatgrid(entry)
    assert grid is not None
    assert grid['bpm'] == pytest.approx(133.0)
    assert grid['phase'] == pytest.approx(55.387418)  # START de la TYPE=4
    assert grid['quality'] == pytest.approx(100.0)


def test_get_beatgrid_none_without_data():
    """ENTRY sans TEMPO ni grille TYPE=4 → None (pas de grille native)."""
    entry = ET.Element('ENTRY', {'TITLE': 'x'})
    ET.SubElement(entry, 'LOCATION', {'FILE': 'x.mp3', 'VOLUME': 'C:', 'DIR': '/:'})
    assert get_beatgrid(entry) is None


def test_get_beatgrid_rejects_low_quality():
    """BPM_QUALITY < 50 → grille rejetée (analyse non fiable)."""
    entry = ET.Element('ENTRY', {'TITLE': 'x'})
    ET.SubElement(entry, 'TEMPO', {'BPM': '128.000000', 'BPM_QUALITY': '12.0'})
    assert get_beatgrid(entry) is None


def test_get_beatgrid_grid_overrides_tempo():
    """Le GRID de la CUE_V2 TYPE=4 prime sur TEMPO (grille analysée = vérité)."""
    entry = ET.Element('ENTRY', {'TITLE': 'x'})
    ET.SubElement(entry, 'TEMPO', {'BPM': '100.0', 'BPM_QUALITY': '90.0'})
    cue = ET.SubElement(entry, 'CUE_V2', {'TYPE': '4', 'START': '12.5', 'HOTCUE': '-1'})
    ET.SubElement(cue, 'GRID', {'BPM': '140.0'})
    grid = get_beatgrid(entry)
    assert grid['bpm'] == pytest.approx(140.0)
    assert grid['phase'] == pytest.approx(12.5)


def test_get_beatgrid_rejects_absurd_bpm():
    """BPM aberrants de la collection réelle (1.0, 17178) → None : une grille à
    1 BPM n'a aucun sens (garde de plausibilité 20–400)."""
    entry = ET.Element('ENTRY', {'TITLE': 'x'})
    ET.SubElement(entry, 'TEMPO', {'BPM': '1.0', 'BPM_QUALITY': '100.0'})
    assert get_beatgrid(entry) is None
    entry2 = ET.Element('ENTRY', {'TITLE': 'y'})
    ET.SubElement(entry2, 'TEMPO', {'BPM': '17178.0', 'BPM_QUALITY': '100.0'})
    assert get_beatgrid(entry2) is None


def test_get_beatgrid_grid_authoritative_despite_low_quality():
    """GRID présent → autoritaire : BPM_QUALITY basse de TEMPO ne rejette pas
    (la grille analysée est la vérité, TEMPO peut être périmé)."""
    entry = ET.Element('ENTRY', {'TITLE': 'x'})
    ET.SubElement(entry, 'TEMPO', {'BPM': '120.0', 'BPM_QUALITY': '10.0'})
    cue = ET.SubElement(entry, 'CUE_V2', {'TYPE': '4', 'START': '3.0', 'HOTCUE': '-1'})
    ET.SubElement(cue, 'GRID', {'BPM': '124.0'})
    grid = get_beatgrid(entry)
    assert grid is not None
    assert grid['bpm'] == pytest.approx(124.0)

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


def test_upsert_beatgrid_creates_tempo_and_grid(tmp_path):
    """EPIC-011 : upsert sur un ENTRY sans grille → TEMPO (après INFO) + CUE_V2 TYPE=4
    AutoGrid + GRID enfant créés, au format exact Traktor (6 décimales)."""
    tree = load_nml(DATA)
    entry = tree.getroot().find('.//ENTRY')
    # Retire la grille existante pour simuler une piste non analysée par Traktor.
    for c in list(entry.findall('CUE_V2')):
        if c.get('TYPE') == '4':
            entry.remove(c)
    for t in list(entry.findall('TEMPO')):
        entry.remove(t)
    assert get_beatgrid(entry) is None

    cue4 = upsert_beatgrid(entry, 124.0, 2.25, 100)

    # TEMPO créé APRÈS INFO (ordre réel Traktor) avec BPM_QUALITY.
    tempo = entry.find('TEMPO')
    assert tempo is not None
    assert tempo.get('BPM') == '124.000000'
    assert tempo.get('BPM_QUALITY') == '100.000000'
    tags = [c.tag for c in entry]
    assert tags.index('INFO') < tags.index('TEMPO') < tags.index('CUE_V2')
    # CUE_V2 TYPE=4 + GRID enfant, exactement un seul.
    assert cue4.get('TYPE') == '4'
    assert cue4.get('NAME') == 'AutoGrid'
    assert cue4.get('START') == '2.250000'
    assert cue4.get('HOTCUE') == '-1'
    grid = cue4.find('GRID')
    assert grid is not None and grid.get('BPM') == '124.000000'
    assert len([c for c in entry.findall('CUE_V2') if c.get('TYPE') == '4']) == 1
    # get_beatgrid relit la grille écrite.
    g = get_beatgrid(entry)
    assert g['bpm'] == pytest.approx(124.0)
    assert g['phase'] == pytest.approx(2.25)


def test_upsert_beatgrid_updates_existing_without_duplicating():
    """EPIC-011 : un TYPE=4 existant est mis à jour (START + GRID/BPM), jamais dupliqué."""
    tree = load_nml(DATA)
    entry = tree.getroot().find('.//ENTRY')
    before = [c for c in entry.findall('CUE_V2') if c.get('TYPE') == '4']
    assert len(before) == 1

    upsert_beatgrid(entry, 130.5, 8.0, 100)
    upsert_beatgrid(entry, 131.0, 8.5, 100)  # seconde écriture → update, pas ajout

    after = [c for c in entry.findall('CUE_V2') if c.get('TYPE') == '4']
    assert len(after) == 1
    assert after[0].get('START') == '8.500000'
    assert after[0].find('GRID').get('BPM') == '131.000000'
    assert entry.find('TEMPO').get('BPM') == '131.000000'
    # Les autres cues (TYPE=0) sont intacts.
    assert len([c for c in entry.findall('CUE_V2') if c.get('TYPE') == '0']) == 1


def test_upsert_beatgrid_preserved_by_write_cues_roundtrip(tmp_path):
    """EPIC-011 : après upsert, la sauvegarde des CUES (write_cues + save_nml) préserve
    la grille — round-trip complet : fichier relu → grille toujours là."""
    path = tmp_path / 'c.nml'
    path.write_text(open(DATA).read())
    tree = load_nml(str(path))
    entry = tree.getroot().find('.//ENTRY')
    upsert_beatgrid(entry, 124.0, 2.25, 100)
    # Sauvegarde des cues éditables (l'utilisateur ajoute un cue A).
    write_cues(entry, [{'type': '0', 'start': '10.0', 'len': '0.0', 'hotcue': 0,
                        'name': 'n.n.', 'displ_order': '3', 'color': ''}])
    save_nml(str(path), tree)

    tree2 = load_nml(str(path))
    entry2 = tree2.getroot().find('.//ENTRY')
    g = get_beatgrid(entry2)
    assert g is not None
    assert g['bpm'] == pytest.approx(124.0)
    assert g['phase'] == pytest.approx(2.25)


def test_upsert_beatgrid_phase_zero_is_written():
    """EPIC-011 : une phase à 0 (début de fichier) est bien écrite (0.000000)."""
    tree = load_nml(DATA)
    entry = tree.getroot().find('.//ENTRY')
    upsert_beatgrid(entry, 128.0, 0.0, 100)
    cue4 = next(c for c in entry.findall('CUE_V2') if c.get('TYPE') == '4')
    assert cue4.get('START') == '0.000000'


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
