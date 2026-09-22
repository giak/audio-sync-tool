#!/usr/bin/env python3
"""Tests du moteur de collecte d'années (EPIC-040).

Verrouille les trois causes de l'erreur « 2024 sur un morceau de 1991 »
(Phantasia « Inner Light », R&S 1991, écrit 2024 par la première passe) :

1. l'ordre artiste/titre n'est plus une hypothèse : les deux orientations du nom
   ET les tags du fichier sont essayés, la garde tokens tranche ;
2. Deezer a la même garde artiste+titre que MusicBrainz (avant : seule la durée
   filtrait, donc zéro filtre dès que le fichier n'avait pas de durée connue) ;
3. aucune source ne conclut seule : il faut 2 providers indépendants concordants,
   sinon rien n'est écrit (single/conflict → revue, avec proposition).

Aucun accès réseau : les fonctions de requête sont remplacées.
"""
import json
import struct
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import collect_years as cy  # noqa: E402


def make_mp3(path, artist=None, title=None):
    """MP3 minimal avec (ou sans) tags TPE1/TIT2."""
    from mutagen.id3 import ID3, TIT2, TPE1
    tags = ID3()
    if title:
        tags.add(TIT2(encoding=0, text=title))
    if artist:
        tags.add(TPE1(encoding=0, text=artist))
    tags.save(path, v2_version=4)
    with open(path, 'ab') as f:
        for _ in range(3):
            f.write(b'\xff\xfb\x90\x00' + b'\x00' * 413)


def make_flac(path, artist=None, title=None):
    sr_ch_bps = (44100 << 44) | (15 << 36)
    streaminfo = (struct.pack('>HH', 4096, 4096) + b'\x00\x00\x00' + b'\x00\x00\x00'
                  + struct.pack('>Q', sr_ch_bps) + bytes(16))
    with open(path, 'wb') as f:
        f.write(b'fLaC' + bytes([0x80]) + b'\x00\x00' + bytes([len(streaminfo)])
                + streaminfo)
    if artist or title:
        from mutagen.flac import FLAC
        audio = FLAC(path)
        if artist:
            audio['ARTIST'] = artist
        if title:
            audio['TITLE'] = title
        audio.save()


# ─── 1. orientations de clé ────────────────────────────────────────────────

def test_key_variants_ordre_de_confiance():
    """Tags d'abord, puis le nom, puis l'inverse du nom."""
    assert cy.key_variants('inner light', 'phantasia', alt=('phantasia', 'inner light')) == [
        ('phantasia', 'inner light'), ('inner light', 'phantasia')]
    # sans tags : les deux orientations du nom
    assert cy.key_variants('inner light', 'phantasia') == [
        ('inner light', 'phantasia'), ('phantasia', 'inner light')]
    # tags identiques au nom → pas de doublon
    assert cy.key_variants('a', 'b', alt=('a', 'b')) == [('a', 'b'), ('b', 'a')]
    # titre vide → ignoré
    assert cy.key_variants('a', '') == []
    assert cy.key_variants(None, 'b') == [(None, 'b')]


def test_tags_artist_title_lit_les_tags(tmp_path):
    """Le cas réel : nom collé, tags corrects."""
    p = tmp_path / 'inner lightphantasia.mp3'
    make_mp3(str(p), artist='Phantasia', title='Inner Light')
    assert cy.tags_artist_title(str(p)) == ('Phantasia', 'Inner Light')
    # nom déjà correct, mais c'est le tag qui tranche
    p2 = tmp_path / 'phantasia - inner light.flac'
    make_flac(str(p2), artist='Phantasia', title='Inner Light')
    assert cy.tags_artist_title(str(p2)) == ('Phantasia', 'Inner Light')
    # sans tags : (None, None)
    p3 = tmp_path / 'sans-tags.mp3'
    make_mp3(str(p3))
    assert cy.tags_artist_title(str(p3)) == (None, None)


# ─── 2. garde artiste/titre sur Deezer ─────────────────────────────────────

def test_deezer_rejette_un_autre_morceau(monkeypatch):
    """Avant EPIC-040, seule la durée filtrait : dès que le fichier n'avait pas
    de durée connue, le premier résultat Deezer était accepté tel quel. La garde
    tokens doit refuser un résultat qui n'est pas le morceau demandé."""
    autre = [{'artist': {'name': 'Inner City'}, 'title': 'Big Fun',
              'duration': 335, 'album': {'id': 1}}]
    monkeypatch.setattr(cy, 'dz_candidates', lambda a, t: autre)
    monkeypatch.setattr(cy, 'get', lambda *a, **k: {'release_date': '2024-01-15',
                                                    'title': 'Ooo'})
    assert cy.dz_lookup('phantasia', 'inner light', {335})['status'] == 'none'


def test_deezer_rejette_un_meme_titre_autre_artiste(monkeypatch):
    """Même titre, artiste différent : le piège des homonymes (reprise, morceau
    homonyme). Le titre matche et la durée est compatible — seule la garde
    ARTISTE peut le refuser."""
    homonyme = [{'artist': {'name': 'Sven Vath'}, 'title': 'Inner Light',
                 'duration': 337, 'album': {'id': 3}}]
    monkeypatch.setattr(cy, 'dz_candidates', lambda a, t: homonyme)
    monkeypatch.setattr(cy, 'get', lambda *a, **k: {'release_date': '2024-01-15',
                                                    'title': 'Ooo'})
    assert cy.dz_lookup('phantasia', 'inner light', {337})['status'] == 'none'


def test_deezer_accepte_et_garde_l_album(monkeypatch):
    """Un match légitime passe, et l'album (donc la réédition) reste visible."""
    item = [{'artist': {'name': 'Phantasia'}, 'title': 'Inner Light (Out of Orbit Remix)',
             'duration': 322, 'album': {'id': 7}}]
    monkeypatch.setattr(cy, 'dz_candidates', lambda a, t: item)
    monkeypatch.setattr(cy, 'get', lambda *a, **k: {'release_date': '2024-01-15',
                                                    'title': 'Ooo'})
    monkeypatch.setattr(cy.time, 'sleep', lambda s: None)
    rec = cy.dz_lookup('phantasia', 'inner light', {335})
    assert rec['status'] == 'found' and rec['year'] == '2024'
    assert rec['evidence'][0]['album'] == 'Ooo'
    assert rec['evidence'][0]['release_date'] == '2024-01-15'


def test_deezer_ignore_une_duree_trop_differente(monkeypatch):
    item = [{'artist': {'name': 'Phantasia'}, 'title': 'Inner Light',
             'duration': 500, 'album': {'id': 7}}]
    monkeypatch.setattr(cy, 'dz_candidates', lambda a, t: item)
    assert cy.dz_lookup('phantasia', 'inner light', {335})['status'] == 'none'


# ─── 3. règle des 2 providers indépendants concordants ─────────────────────

def _stub_sources(monkeypatch, mb=('none', None, []), dz=None, dg=None):
    monkeypatch.setattr(cy, 'mb_lookup', lambda a, t, d, p: mb)
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d: dz or
                        {'status': 'none', 'year': None, 'years': [], 'evidence': []})
    monkeypatch.setattr(cy, 'discogs_vote', lambda a, t, d: dg or
                        {'status': 'none', 'year': None, 'years': []})


def test_regression_phantasia_2024_ne_conclut_pas(monkeypatch):
    """LE cas de l'utilisateur : nom « Inner Light - Phantasia » (titre puis
    artiste), Deezer voit une réédition 2024, Discogs connaît la première sortie
    1991. Résultat attendu : RIEN n'est écrit, proposition 1991."""
    def mb(a, t, d, p):
        return ('none', None, [])

    def dz(a, t, d):
        # seul l'ordre (artiste, titre) a un sens pour Deezer
        if (a, t) == ('phantasia', 'inner light'):
            return {'status': 'found', 'year': '2024', 'years': ['2024'],
                    'evidence': [{'album': 'Ooo', 'release_date': '2024-01-15'}]}
        return {'status': 'none', 'year': None, 'years': [], 'evidence': []}

    def dg(a, t, d):
        if (a, t) == ('phantasia', 'inner light'):
            return {'status': 'found', 'year': '1991', 'years': ['1991']}
        return {'status': 'none', 'year': None, 'years': []}

    _stub_sources(monkeypatch, mb=('none', None, []))
    monkeypatch.setattr(cy, 'mb_lookup', mb)
    monkeypatch.setattr(cy, 'dz_lookup', dz)
    monkeypatch.setattr(cy, 'discogs_vote', dg)

    rec = cy.lookup('inner light', 'phantasia', {337}, cy.Pacer(0))
    assert rec['status'] == 'conflict'          # aucune source ne conclut seule
    assert rec['year'] is None                  # donc RIEN ne sera écrit
    assert rec['proposed'] == '1991'            # proposition pré-remplie
    assert rec['sources'] == {'deezer': '2024', 'discogs': '1991'}
    assert rec['classes'] == {'deezer': 'edition', 'discogs': 'first'}
    assert rec['variant'] == 'inverse'          # l'orientation a été auto-corrigée
    assert rec['v'] == 2


def test_deux_sources_concordantes_ecrivent(monkeypatch):
    _stub_sources(monkeypatch, mb=('found', '1991', ['1991']))
    monkeypatch.setattr(cy, 'discogs_vote',
                        lambda a, t, d: {'status': 'found', 'year': '1991',
                                         'years': ['1991']})
    rec = cy.lookup('phantasia', 'inner light', set(), cy.Pacer(0))
    assert rec['status'] == 'found' and rec['year'] == '1991'
    assert rec['source'] == 'discogs+musicbrainz'
    assert rec['n_sources'] == 2


def test_une_seule_source_ne_conclut_pas(monkeypatch):
    _stub_sources(monkeypatch, mb=('none', None, []))
    monkeypatch.setattr(cy, 'dz_lookup',
                        lambda a, t, d: {'status': 'found', 'year': '2024',
                                         'years': ['2024'], 'evidence': []})
    rec = cy.lookup('phantasia', 'inner light', set(), cy.Pacer(0))
    assert rec['status'] == 'single' and rec['year'] == '2024'
    assert rec['year'] == '2024' and rec['source'] is None   # jamais écrit


def test_providers_reform_comptes_comme_discogs(monkeypatch):
    """reform/reform2 sont des requêtes Discogs : les compter à part
    fabriquerait une fausse corroboration."""
    assert cy.PROVIDER['reform_strict'] == cy.PROVIDER['discogs_strict'] == 'discogs'
    assert cy.PROVIDER['reform2_strict'] == 'discogs'


# ─── 4. YouTube (vote d'édition) + recherche web (candidats seulement) ──────

class _FakeResp:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_web_vote_extrait_des_candidats(monkeypatch):
    monkeypatch.setattr(cy, 'search_token', lambda: 'jeton')
    payload = {'web': {'results': [
        {'title': 'Phantasia - Inner Light (1991) Discogs',
         'url': 'https://www.discogs.com/release/x',
         'description': 'released April 1991'},
        {'title': 'Phantasia - Inner Light [1991]',
         'url': 'https://www.youtube.com/watch?v=y',
         'description': 'R&S 1991'},
    ]}}
    monkeypatch.setattr(cy.urllib.request, 'urlopen', lambda *a, **k: _FakeResp(payload))
    rec = cy.web_vote('phantasia', 'inner light')
    assert rec['web_candidates'] == ['1991']
    assert rec['web_proposed'] == '1991'      # ≥ 2 résultats concordants
    assert rec['status'] == 'candidates'


def test_web_vote_sans_token_est_ignore(monkeypatch):
    monkeypatch.setattr(cy, 'search_token', lambda: None)
    assert cy.web_vote('a', 'b')['status'] == 'skip'


def test_web_candidat_n_est_jamais_un_vote(monkeypatch):
    """L'année trouvée sur le web ne peut pas conclure : elle alimente les
    candidats et `web_proposed`, jamais `sources` (la règle des 2 sources ne se
    contourne pas avec un moteur de recherche)."""
    _stub_sources(monkeypatch, mb=('none', None, []))
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d: {
        'status': 'found', 'year': '2024', 'years': ['2024'], 'evidence': []})
    monkeypatch.setattr(cy, 'web_vote', lambda a, t: {
        'status': 'candidates', 'web_candidates': ['1991'],
        'web_proposed': '1991', 'evidence': []})
    rec = cy.lookup('phantasia', 'inner light', set(), cy.Pacer(0))
    assert rec['status'] == 'single' and rec['year'] == '2024'   # web ≠ vote
    assert rec['web_candidates'] == ['1991'] and rec['web_proposed'] == '1991'
    assert 'web' not in (rec.get('sources') or {})
    assert rec['sources'] == {'deezer': '2024'}


def test_youtube_est_un_vote_d_edition_qui_corrobore(monkeypatch):
    """YouTube Topic compte comme provider indépendant (classe ÉDITION) : il ne
    conclut pas seul, mais il peut corroborer Discogs/MusicBrainz."""
    import types
    fake = types.SimpleNamespace(lookup=lambda key, n, durs, plausible, verified=False: {
        'status': 'found', 'year': '1991', 'years': ['1991'], 'videos': []})
    monkeypatch.setitem(sys.modules, 'collect_youtube_topic', fake)
    monkeypatch.setattr(cy, 'mb_lookup', lambda a, t, d, p: ('none', None, []))
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d: {
        'status': 'none', 'year': None, 'years': [], 'evidence': []})
    monkeypatch.setattr(cy, 'discogs_vote', lambda a, t, d: {
        'status': 'found', 'year': '1991', 'years': ['1991']})
    monkeypatch.setattr(cy, 'web_vote', lambda a, t: {
        'status': 'none', 'web_candidates': [], 'web_proposed': None,
        'evidence': []})
    rec = cy.lookup('phantasia', 'inner light', set(), cy.Pacer(0), youtube=True)
    assert rec['status'] == 'found' and rec['year'] == '1991'
    assert rec['sources'] == {'discogs': '1991', 'youtube': '1991'}
    assert rec['source'] == 'discogs+youtube'
    assert rec['classes'] == {'discogs': 'first', 'youtube': 'edition'}


# ─── 5. le cache v1 ne bloque pas la re-collecte ───────────────────────────

def test_done_keys_ignore_le_moteur_v1(tmp_path, monkeypatch):
    cache = tmp_path / 'year_cache.jsonl'
    cache.write_text('\n'.join(json.dumps(r) for r in (
        {'key': 'a\tb', 'status': 'found', 'year': '2024', 'source': 'deezer'},
        {'key': 'c\td', 'status': 'single', 'year': '1999', 'v': 2},
    )) + '\n')
    monkeypatch.setattr(cy, 'PROG', str(cache))
    done = cy.done_keys()
    assert 'a\tb' not in done        # v1 (Deezer sans garde) → à re-collecter
    assert done['c\td']['year'] == '1999'
