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
    info = entry.find('INFO')
    if info is not None:
        meta['filesize'] = info.get('FILESIZE', '')
        meta['playtime'] = info.get('PLAYTIME', '')
    return meta