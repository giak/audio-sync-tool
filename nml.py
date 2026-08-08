"""Lecture bas niveau du collection.nml de Traktor — parse+index+lecture."""
import os
from datetime import datetime
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
    """List cues : TYPE in allow_types ET HOTCUE 0..7 — {start,len,hotcue,name,displ_order,color}."""
    cues = []
    for c in entry.findall('CUE_V2'):
        if c.get('TYPE') not in allow_types:
            continue
        hotcue = c.get('HOTCUE')
        if hotcue is None or not hotcue.isdigit() or int(hotcue) < 0 or int(hotcue) > 7:
            continue
        cues.append({
            'type': c.get('TYPE', '0'),
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
    if loc is not None:
        # DIR/VOLUME exposés au sélecteur d'homonymes (discrimination réelle, audit B3).
        meta['dir'] = loc.get('DIR', '')
        meta['volume'] = loc.get('VOLUME', '')
    info = entry.find('INFO')
    if info is not None:
        meta['filesize'] = info.get('FILESIZE', '')
        meta['playtime'] = info.get('PLAYTIME', '')
    return meta

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
    """Remplace les CUE_V2 éditables (TYPE∈{0,5} ET HOTCUE 0..7) de l'ENTRY par la liste
    fournie. Sont conservés : les TYPE∉{0,5} (grille, flip…) ET les TYPE∈{0,5} à
    HOTCUE=-1 (non éditables, pas restitués par get_cues) — sinon ils seraient
    silencieusement effacés à la première sauvegarde (audit B5)."""
    kept = [c for c in entry.findall('CUE_V2')
            if c.get('TYPE') not in ('0', '5') or c.get('HOTCUE', '-1') == '-1']
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


def traktor_dir(relpath, volume):
    parts = [p for p in relpath.strip('/').split('/') if p]
    seg = [volume] + parts
    return '/:' + '/:'.join(seg) + '/:'


def build_export_nml(playlist_tracks, nml_path, export_root, volume, pl_dir):
    """Écrit export_root/collection.nml : ENTRIES de la playlist, LOCATION réécrites.

    Match : clé (FILE, FILESIZE) — basename de la piste + os.path.getsize du fichier
    local. Multi-match : premier hit (l'UI a déjà tranché la même clé au moment de
    l'édition — même série de hits, ordre stable). Retourne le chemin écrit, ou None
    si aucune piste ne matche.

    DIR : calculé depuis l'emplacement RÉEL des fichiers exportés (pl_dir, le dossier
    dans lequel la playlist a été matérialisée) relativement à export_root — plus depuis
    le chemin source original de chaque piste (correction audit B8)."""
    if not export_root:
        raise ValueError('traktor_export_root non configuré — collection.nml non généré')
    if not pl_dir:
        raise ValueError('dossier d\'export (pl_dir) manquant')
    rel = os.path.relpath(pl_dir, export_root)
    if rel == '..' or rel.startswith('..' + os.sep):
        raise ValueError(
            f"le dossier d'export {pl_dir!r} n'est pas sous la racine {export_root!r}")
    dir_attr = traktor_dir(rel if rel != '.' else '', volume)
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
        loc = e.find('LOCATION')
        if loc is not None:
            loc.set('DIR', dir_attr)
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
