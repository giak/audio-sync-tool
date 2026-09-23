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
    monkeypatch.setattr(cy, 'mb_lookup', lambda a, t, d, p, req=(): mb)
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d, req=(): dz or
                        {'status': 'none', 'year': None, 'years': [], 'evidence': []})
    monkeypatch.setattr(cy, 'discogs_vote', lambda a, t, d: dg or
                        {'status': 'none', 'year': None, 'years': []})


def test_regression_phantasia_2024_ne_conclut_pas(monkeypatch):
    """LE cas de l'utilisateur : nom « Inner Light - Phantasia » (titre puis
    artiste), Deezer voit une réédition 2024, Discogs connaît la première sortie
    1991. Résultat attendu : RIEN n'est écrit, proposition 1991."""
    def mb(a, t, d, p):
        return ('none', None, [])

    def dz(a, t, d, require=()):
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
    assert rec['v'] == cy.ENGINE_VERSION


def test_deux_sources_concordantes_ecrivent(monkeypatch):
    _stub_sources(monkeypatch, mb=('found', '1991', ['1991']))
    monkeypatch.setattr(cy, 'discogs_vote',                        lambda a, t, d, req=(): {'status': 'found', 'year': '1991',
                                                 'years': ['1991']})
    rec = cy.lookup('phantasia', 'inner light', set(), cy.Pacer(0))
    assert rec['status'] == 'found' and rec['year'] == '1991'
    assert rec['source'] == 'discogs+musicbrainz'
    assert rec['n_sources'] == 2


def test_une_seule_source_ne_conclut_pas(monkeypatch):
    _stub_sources(monkeypatch, mb=('none', None, []))
    monkeypatch.setattr(cy, 'dz_lookup',
                        lambda a, t, d, req=(): {'status': 'found', 'year': '2024',
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


def _stub_web(monkeypatch, results, provider='html', error=None):
    """Fournisseur de recherche remplacé : AUCUN réseau dans les tests."""
    monkeypatch.setattr(cy.web_search, 'search',
                        lambda q, limit=5, timeout=10, fetch=None: {
                            'results': results, 'provider': provider, 'error': error})


def test_web_vote_extrait_des_candidats(monkeypatch):
    """EPIC-049 : le moteur est LOCAL (DuckDuckGo) et ne produit que des
    candidats — deux résultats concordants font un `web_proposed`, jamais un vote."""
    _stub_web(monkeypatch, [
        {'title': 'Phantasia - Inner Light (1991) Discogs',
         'url': 'https://www.discogs.com/release/x', 'snippet': 'released April 1991'},
        {'title': 'Phantasia - Inner Light [1991]',
         'url': 'https://www.youtube.com/watch?v=y', 'snippet': 'R&S 1991'},
    ])
    rec = cy.web_vote('phantasia', 'inner light')
    assert rec['web_candidates'] == ['1991']
    assert rec['web_proposed'] == '1991'      # ≥ 2 résultats concordants
    assert rec['status'] == 'candidates'
    assert rec['provider'] == 'html'


def test_web_vote_sans_fournisseur_est_ignore(monkeypatch):
    """Aucun moteur joignable → statut `skip` ET la raison remonte (un
    fournisseur muet se déclare : « pas de réponse » ≠ « pas de moteur »)."""
    _stub_web(monkeypatch, [], provider=None,
              error='mcp: URLError · html: page anti-robot (202/anomaly)')
    rec = cy.web_vote('a', 'b')
    assert rec['status'] == 'skip'
    assert rec['web_candidates'] == []
    assert 'anti-robot' in rec['error']


def test_collect_years_ne_reference_plus_brave():
    """Brave Search (payant) est RETIRÉ : aucun résidu dans le moteur."""
    with open(cy.__file__) as f:
        src = f.read()
    assert 'BRAVE' not in src and 'brave' not in src
    assert not hasattr(cy, 'search_token')


# ─── 4bis. EPIC-048 : un remix ne date pas de l'original ──────────────────

def _mb_payload(*records):
    """Réponse MusicBrainz minimale pour `mb_lookup` (deux enregistrements :
    l'original 1990 et le remix Cosmic Gate 2004 du même titre)."""
    return {'recordings': list(records)}


def _mb_rec(title, date, artist='Age Of Love'):
    return {'title': title, 'first-release-date': date,
            'artist-credit': [{'artist': {'name': artist}}]}


def test_mb_lookup_exige_le_remixeur_quand_le_nom_en_porte_un(monkeypatch):
    """LA garde d'EPIC-048, testée sur le VRAI `mb_lookup` (seul `get` est
    remplacé) : sans crédit exigé, l'original 1990 répond ; avec
    `require=('cosmic','gate')`, l'enregistrement qui ne NOMME pas le remixeur
    est écarté et seul le remix 2004 reste — c'est la date de la version du
    fichier, pas celle de l'original."""
    monkeypatch.setattr(cy, 'get', lambda url, ua, timeout=15, retries=3: _mb_payload(
        _mb_rec('The Age Of Love', '1990-01-01'),
        _mb_rec('The Age Of Love (Cosmic Gate Mix)', '2004-05-10'),
    ))
    pacer = cy.Pacer(0)
    assert cy.mb_lookup('age of love', 'the age of love', set(), pacer) == \
        ('ambiguous', None, ['1990', '2004'])
    assert cy.mb_lookup('age of love', 'the age of love', set(), pacer,
                        ('cosmic', 'gate')) == ('found', '2004', ['Age Of Love — The Age Of Love (Cosmic Gate Mix)'])
    # Et la garde n'écarte pas un remix qui, lui, ne nomme personne dans la
    # réponse : « Extended Mix » est un mot de VERSION → aucun crédit requis.
    assert cy.remix_mod.remix_credit('x - y (Extended Mix).mp3')['kind'] == 'original'


def test_remix_sans_source_nommante_ne_propose_pas_l_annee_de_l_original(monkeypatch):
    """Quand PLUS AUCUNE source ne nomme le remixeur, rien ne conclut (donc rien
    n'est écrit) et la seule suggestion utile vient de la piste web — cherchée
    AVEC le remixeur (« 2004 » pour le Cosmic Gate Mix), jamais 1990."""
    # Stubs qui honorent le contrat réel : `req` non vide → la source se taît
    # (c'est exactement ce que font mb_lookup/dz_lookup, testé ci-dessus).
    monkeypatch.setattr(cy, 'mb_lookup', lambda a, t, d, p, req=():
                        ('none', None, []) if req else ('found', '1990', ['1990']))
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d, req=():
                        {'status': 'none', 'year': None, 'years': [], 'evidence': []})
    monkeypatch.setattr(cy, 'discogs_vote', lambda a, t, d: {
        'status': 'ambiguous', 'year': None, 'years': ['1990', '1992', '2009']})
    seen = []
    def web(a, t, extra='', **_):
        seen.append(extra)
        return {'status': 'candidates', 'web_candidates': ['2004'],
                'web_proposed': '2004', 'evidence': []}
    monkeypatch.setattr(cy, 'web_vote', web)

    rec = cy.lookup('age of love', 'the age of love', set(), cy.Pacer(0),
                    require=('cosmic', 'gate'), remix_label='cosmic gate mix')
    assert rec['status'] == 'ambiguous' and rec['year'] is None   # rien d'écrit
    assert rec['web_candidates'] == ['2004']
    assert rec['proposed'] == '2004'          # le remix, pas l'original
    assert rec['required_remix'] == ['cosmic', 'gate']
    assert seen == ['cosmic gate mix']        # la recherche web porte le remixeur

    # Sans consensus web : AUCUNE suggestion — 1990 (l'original) est un piège,
    # pas une proposition. Mesuré : la 2ᵉ passe web a rendu 1999/2004, sans
    # consensus, et `proposed` retombait sur 1990.
    monkeypatch.setattr(cy, 'web_vote', lambda a, t, extra='', **_: {
        'status': 'candidates', 'web_candidates': ['1999', '2004'],
        'web_proposed': None, 'evidence': []})
    rec2 = cy.lookup('age of love', 'the age of love', set(), cy.Pacer(0),
                     require=('cosmic', 'gate'), remix_label='cosmic gate mix')
    assert rec2['proposed'] is None
    assert rec2['web_candidates'] == ['1999', '2004']   # la piste reste visible


def test_web_candidat_n_est_jamais_un_vote(monkeypatch):
    """L'année trouvée sur le web ne peut pas conclure : elle alimente les
    candidats et `web_proposed`, jamais `sources` (la règle des 2 sources ne se
    contourne pas avec un moteur de recherche)."""
    _stub_sources(monkeypatch, mb=('none', None, []))
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d, req=(): {
            'status': 'found', 'year': '2024', 'years': ['2024'], 'evidence': []})
    monkeypatch.setattr(cy, 'web_vote', lambda a, t, extra='': {
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
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, d, req=(): {
        'status': 'none', 'year': None, 'years': [], 'evidence': []})
    monkeypatch.setattr(cy, 'discogs_vote', lambda a, t, d: {
        'status': 'found', 'year': '1991', 'years': ['1991']})
    monkeypatch.setattr(cy, 'web_vote', lambda a, t, extra='': {
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
        {'key': 'c\td', 'status': 'single', 'year': '1999', 'v': cy.ENGINE_VERSION},
    )) + '\n')
    monkeypatch.setattr(cy, 'PROG', str(cache))
    done = cy.done_keys()
    assert 'a\tb' not in done        # v1 (Deezer sans garde) → à re-collecter
    assert done['c\td']['year'] == '1999'


# ─── 6. clés construites depuis les TAGS (chantier 1 102 clés) ─────────────

def _write_scan_cache(tmp_path, monkeypatch, files):
    """data/cache.json minimal : files = [(side, base, fn, meta)]."""
    cache = {'source': {}, 'epars': {}}
    for side, base, fn, meta in files:
        cache[side].setdefault(base, {})[fn] = meta
    (tmp_path / 'cache.json').write_text(json.dumps(cache))
    monkeypatch.setattr(cy, 'CACHE', str(tmp_path / 'cache.json'))


def test_load_keys_from_tags_cle_depuis_les_tags(tmp_path, monkeypatch):
    """Le nom ment sur l'ordre (`Gb - Maddix, Fēlēs - My Gasoline…` → clé
    `gb / my gasoline (extended mix)`) ; les tags disent la vérité. La clé
    tags est `maddix\tmy gasoline (extended mix)` — la vraie requête."""
    d = tmp_path / 'e'
    d.mkdir()
    from mutagen.id3 import ID3, TIT2, TPE1
    tags = ID3()
    tags.add(TIT2(encoding=1, text='My Gasoline (Extended Mix)'))   # UTF-16 : Fēlēs
    tags.add(TPE1(encoding=1, text='Maddix, Fēlēs'))
    tags.save(d / 'Gb - Maddix, Feles - My Gasoline (Extended Mix).mp3', v2_version=4)
    with open(d / 'Gb - Maddix, Feles - My Gasoline (Extended Mix).mp3', 'ab') as f:
        for _ in range(3):
            f.write(b'\xff\xfb\x90\x00' + b'\x00' * 413)
    _write_scan_cache(tmp_path, monkeypatch, [
        ('epars', str(d), 'Gb - Maddix, Feles - My Gasoline (Extended Mix).mp3',
         {'path': 'Gb - Maddix, Feles - My Gasoline (Extended Mix).mp3',
          'duration': 161}),
    ])
    total, noyear, tagged, keys = cy.load_keys_from_tags()
    assert total == noyear == 1 and tagged == 1
    assert 'Maddix, Fēlēs\tMy Gasoline (Extended Mix)' in keys
    assert keys['Maddix, Fēlēs\tMy Gasoline (Extended Mix)']['source'] == 'tags'
    assert keys['Maddix, Fēlēs\tMy Gasoline (Extended Mix)']['durs'] == {161}


def test_load_keys_from_tags_sans_tags_complets_aucune_cle(tmp_path, monkeypatch):
    """Un fichier sans tags complets ne produit PAS de clé-tags (il reste
    servi par sa clé-nom — aucune perte par rapport au pipeline existant)."""
    d = tmp_path / 'e'
    d.mkdir()
    make_mp3(d / 'x.mp3')                      # aucun tag
    make_flac(d / 'y.flac', title='seulement un titre')
    _write_scan_cache(tmp_path, monkeypatch, [
        ('epars', str(d), 'x.mp3', {'path': 'x.mp3'}),
        ('epars', str(d), 'y.flac', {'path': 'y.flac'}),
    ])
    _total, _noyear, tagged, keys = cy.load_keys_from_tags()
    assert tagged == 0 and keys == {}


def test_run_keys_from_tags_marque_l_enregistrement(tmp_path, monkeypatch):
    """La collecte en mode tags écrit `key_source: 'tags'` sur ses lignes —
    l'origine de la clé est traçable dans year_cache.jsonl (le champ `source`
    d'un found porte déjà les providers)."""
    d = tmp_path / 'e'
    d.mkdir()
    make_mp3(d / 'a.mp3', artist='Phantasia', title='Inner Light')
    _write_scan_cache(tmp_path, monkeypatch, [
        ('epars', str(d), 'a.mp3', {'path': 'a.mp3'}),
    ])
    monkeypatch.setattr(cy, 'PROG', str(tmp_path / 'year_cache.jsonl'))
    monkeypatch.setattr(cy, 'mb_lookup', lambda a, t, durs, p, require=():
                        ('found', '1991', ['1991']))
    monkeypatch.setattr(cy, 'dz_lookup', lambda a, t, durs, req=(): {
        'status': 'none', 'year': None, 'years': [], 'evidence': []})
    monkeypatch.setattr(cy, 'discogs_vote', lambda a, t, durs: {
        'status': 'found', 'year': '1991', 'years': ['1991']})
    monkeypatch.setattr(cy, 'web_vote', lambda a, t, extra='': {
        'status': 'none', 'web_candidates': [], 'web_proposed': None,
        'evidence': []})
    cy.run(keys_from_tags=True)
    rec = json.loads((tmp_path / 'year_cache.jsonl').read_text().splitlines()[0])
    assert rec['key'] == 'Phantasia\tInner Light'
    assert rec['key_source'] == 'tags'
    assert rec['status'] == 'found' and rec['year'] == '1991'
