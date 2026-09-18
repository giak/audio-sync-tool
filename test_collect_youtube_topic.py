"""Tests de scripts/collect_youtube_topic.py (EPIC-033) — sans réseau :
ciblage (none, plausible ≥ 2015, exclusions), garde-fous d'acceptation
(chaîne - Topic, tokens, durée ±15 s, release_date requis), classification,
journal et reprise. La recherche yt-dlp et l'extraction complète sont mockées."""
import json
import sys

import pytest

sys.path.insert(0, 'scripts')
import collect_youtube_topic as yt


def simple_artist_title(fn):
    """Découpe déterministe pour les fixtures ('artiste - titre.mp3')."""
    stem = fn.rsplit('.', 1)[0]
    a, _, t = stem.partition(' - ')
    return a, t


@pytest.fixture(autouse=True)
def fixed_artist_title(monkeypatch):
    monkeypatch.setattr(yt, 'artist_title', simple_artist_title)


# ── Ciblage ────────────────────────────────────────────────────────────────

def _cache(*entries):
    """cache.json minimal : [(base, fn, meta), …] côté 'source'."""
    src = {}
    for base, fn, meta in entries:
        src.setdefault(base, {})[fn] = meta
    return {'source': src, 'epars': {}}


def test_last_status_none_lit_les_cache_et_ignore_les_errors(tmp_path):
    c = tmp_path / 'none.jsonl'
    c.write_text(
        '{"key": "a\\tb", "status": "none"}\n'
        '{"key": "c\\td", "status": "found", "year": 2018}\n'
        '{"key": "e\\tf", "status": "error"}\n'
        '{"key": "a\\tb", "status": "none"}\n', encoding='utf-8')
    assert yt.last_status_none(str(c)) == {'a\tb'}


def test_last_status_none_cache_absent():
    assert yt.last_status_none('/nonexistent/zz.jsonl') == set()


def test_dirs_of_key_match_par_nom_de_fichier():
    cache = _cache(
        ('/m', 'ki ki - what s a girl to do.mp3',
         {'path': '2021_06/ki ki - what s a girl to do.mp3', 'duration': 200}),
        ('/m', 'ki ki - what s a girl to do.wav',
         {'path': 'old/ki ki - what s a girl to do.wav', 'duration': 201}))
    assert yt.dirs_of_key(cache, 'ki ki\twhat s a girl to do') == \
        {'/m/2021_06', '/m/old'}


def test_dirs_of_key_autre_cle_vide():
    cache = _cache(('/m', 'a - b.mp3', {'path': 'x/a - b.mp3'}))
    assert yt.dirs_of_key(cache, 'autre\tcle') == set()


def test_plausible_year_max_des_chemins():
    assert yt.plausible_year({'/m/select_2021_10_23'}) == 2021
    assert yt.plausible_year({'/m/x', '/m/2024_02_14'}) == 2024
    assert yt.plausible_year({'/m/techno groove'}) is None


def test_ciblage_filtrage_complet(tmp_path, monkeypatch):
    cache = _cache(
        ('/m', 'ki ki - what s a girl to do.mp3',
         {'path': '2024_02_14/ki ki - what s a girl to do.mp3',
          'duration': 149}),
        ('/m', 'old track - x.mp3',
         {'path': '1998/old track - x.mp3', 'duration': 210}),
        ('/m', 'ghost - null part.mp3',
         {'path': 'techno groove/ghost - null part.mp3', 'duration': 220}))
    none = {'ki ki\twhat s a girl to do',   # plausible 2024 → cible
            'old track\tx',                 # plausible 1998 → hors périmètre
            'ghost\tnull part',             # aucun signal d'année → exclu
            '\tsans artiste',               # junk-artiste → exclu
            'absent\tdu cache'}             # n=0 → exclu
    monkeypatch.setattr(yt, '_load_keys_safe',
                        lambda: (5, 5, {k: {'n': 1, 'durs': {149}}
                                        for k in none}))
    todo = yt._build_targets(cache, none)
    assert [t[0] for t in todo] == ['ki ki\twhat s a girl to do']
    assert todo[0][1] == 1
    assert todo[0][2] == {149}
    assert todo[0][3] == 2024


def test_ciblage_durs_vide_si_cle_absente_du_scan(tmp_path, monkeypatch):
    # clé none journalisée mais plus aucun fichier sans année : n=0 → exclu
    cache = _cache()
    monkeypatch.setattr(yt, '_load_keys_safe', lambda: (0, 0, {}))
    assert yt._build_targets(cache, {'a\tb'}) == []


# ── Garde-fous de match ────────────────────────────────────────────────────

ENTRIES = [
    {'id': 'T1', 'title': "KI/KI - What's a Girl to Do in '25",
     'channel': 'KI/KI - Topic', 'duration': 149},
    {'id': 'T2', 'title': "KI/KI - What's a Girl to Do in '25 (Extended Mix)",
     'channel': 'Future House Music', 'duration': 272},
    {'id': 'S1', 'title': 'sicko mode x push up - slowed + reverb',
     'channel': 'slō - Topic', 'duration': 134},
    {'id': 'X1', 'title': 'artist - title', 'channel': 'Official Channel',
     'duration': 149},
]


def test_match_topic_exige_la_chaine_topic():
    assert [h['id'] for h in yt.match_topic(ENTRIES, 'ki/ki',
                                            "what's a girl to do in '25",
                                            {149})] == ['T1']


def test_match_topic_exige_tous_les_tokens():
    # 'slō - Topic' mais titre dérivé : 'captain k' absent du titre vidéo
    assert yt.match_topic(ENTRIES, 'sicko mode x push up', 'captain k',
                          {233}) == []
    # token 'extended' exigé manquant → rejeté même si chaîne Topic
    assert yt.match_topic(
        ENTRIES, 'ki/ki', "what's a girl to do in '25 extended", {272}) == []


def test_match_topic_exige_la_duree_15s():
    assert yt.match_topic(ENTRIES, 'ki/ki', "what's a girl to do in '25",
                          {400}) == []
    # tolérance : 149 ± 15 → [134, 164] ; 149 ok, 272 non
    assert [h['id'] for h in yt.match_topic(ENTRIES, 'ki/ki',
                                            "what's a girl to do in '25",
                                            {400, 149})] == ['T1']
    assert yt.match_topic(ENTRIES, 'ki/ki', "what's a girl to do in '25",
                          {135}) != []      # 135 ∈ [134, 164] → accepté


def test_match_topic_sans_duree_connu_accepte():
    # durs vide (durée absente du scan) : le garde-fou durée ne bloque pas
    assert [h['id'] for h in yt.match_topic(ENTRIES, 'ki/ki',
                                            "what's a girl to do in '25",
                                            set())] == ['T1']


def test_match_tokens_ignores_les_chiffres_purs():
    assert yt.match_tokens('artist', '01 intro') == {'artist', 'intro'}


def test_classify_zero_un_deux_concluants():
    h1 = [{'id': 'a', 'title': 't', 'year': '2023'}]
    h2 = [{'id': 'a', 'title': 't', 'year': '2023'},
          {'id': 'b', 'title': 't2', 'year': '2023'}]
    h3 = [{'id': 'a', 'title': 't', 'year': '2023'},
          {'id': 'b', 'title': 't2', 'year': '2025'}]
    assert yt.classify([], 2021) == ('none', None, [])
    assert yt.classify(h1, 2021) == ('lax', '2023', ['2023'])
    assert yt.classify(h2, 2021) == ('found', '2023', ['2023'])
    # cohérent = release_year ≥ plausible − 2 (tolérance dossier) : 2023 vs
    # plausible 2023 → found ; 2023 vs plausible 2026 → reédition → ambiguous
    assert yt.classify(h2, 2023) == ('found', '2023', ['2023'])
    assert yt.classify(h2, 2026)[0] == 'ambiguous'
    assert yt.classify(h2, 2020) == ('found', '2023', ['2023'])
    assert yt.classify(h3, 2021) == ('ambiguous', None, ['2023', '2025'])


# ── lookup : recherche + extraction mockées ────────────────────────────────

def test_lookup_requete_reform2(monkeypatch):
    seen = {}

    def fake_search(q, n=yt.SEARCH_N):
        seen['q'] = q
        return []

    monkeypatch.setattr(yt, 'yt_search', fake_search)
    yt.lookup('#07 enzyme x\topbokken', 1, {200}, 2016)
    assert seen['q'] == 'enzyme x opbokken'


def test_lookup_full_sans_release_date_exclu(monkeypatch):
    monkeypatch.setattr(yt, 'yt_search', lambda q, n=yt.SEARCH_N: [
        {'id': 'V1', 'title': 'artist - title', 'channel': 'artist - Topic',
         'duration': 200}])
    monkeypatch.setattr(yt, '_full', lambda vid: {
        'release_date': None, 'upload_date': '20160501'})
    rec = yt.lookup('artist\ttitle', 1, {200}, 2015)
    assert rec['status'] == 'none'
    assert rec['videos'] == []


def test_lookup_found_avec_release_date(monkeypatch):
    monkeypatch.setattr(yt, 'yt_search', lambda q, n=yt.SEARCH_N: [
        {'id': 'V1', 'title': 'artist - title', 'channel': 'artist - Topic',
         'duration': 200},
        {'id': 'V2', 'title': 'artist title x', 'channel': 'artist - Topic',
         'duration': 199}])
    monkeypatch.setattr(yt, '_full', lambda vid: {
        'release_date': '20210426' if vid == 'V1' else '20210501'})
    rec = yt.lookup('artist\ttitle', 1, {200}, 2015)
    assert rec['status'] == 'found'
    assert rec['year'] == '2021'
    assert len(rec['videos']) == 2


def test_lookup_lax_une_seule_video(monkeypatch):
    monkeypatch.setattr(yt, 'yt_search', lambda q, n=yt.SEARCH_N: [
        {'id': 'V1', 'title': 'artist - title', 'channel': 'artist - Topic',
         'duration': 200}])
    monkeypatch.setattr(yt, '_full', lambda vid: {'release_date': '20210426'})
    rec = yt.lookup('artist\ttitle', 1, {200}, 2015)
    assert rec['status'] == 'lax'
    assert rec['year'] == '2021'


def test_lookup_ambiguous_annees_distinctes(monkeypatch):
    monkeypatch.setattr(yt, 'yt_search', lambda q, n=yt.SEARCH_N: [
        {'id': 'V1', 'title': 'artist - title', 'channel': 'artist - Topic',
         'duration': 200},
        {'id': 'V2', 'title': 'artist - title', 'channel': 'artist - Topic',
         'duration': 201}])
    monkeypatch.setattr(yt, '_full', lambda vid: {
        'release_date': '20210426' if vid == 'V1' else '20240101'})
    rec = yt.lookup('artist\ttitle', 1, {200}, 2015)
    assert rec['status'] == 'ambiguous'
    assert rec['years'] == ['2021', '2024']


def test_lookup_sans_tokens_de_titre_none_immediat(monkeypatch):
    monkeypatch.setattr(
        yt, 'yt_search',
        lambda q, n=yt.SEARCH_N: (_ for _ in ()).throw(
            AssertionError('aucune recherche attendue')))
    rec = yt.lookup('artist\ta', 1, {200}, 2015)     # tokens(rt) vide
    assert rec['status'] == 'none'
    assert rec['videos'] == []


# ── Journal / reprise ──────────────────────────────────────────────────────

def test_done_keys_ignore_les_errors_et_garde_le_dernier(tmp_path):
    c = tmp_path / 'cache.jsonl'
    c.write_text(
        '{"key": "a\\tb", "status": "none"}\n'
        '{"key": "a\\tb", "status": "error"}\n'
        '{"key": "a\\tb", "status": "found", "year": 2021}\n', encoding='utf-8')
    assert yt.done_keys(str(c))['a\tb']['status'] == 'found'


def test_run_reprise_et_journalisation(tmp_path, monkeypatch):
    prog = tmp_path / 'yt.jsonl'
    prog.write_text('{"key": "done\\tx", "status": "none"}\n', encoding='utf-8')
    monkeypatch.setattr(yt, 'PROG', str(prog))
    monkeypatch.setattr(yt, 'targets',
                        lambda: [('done\tx', 1, {200}, 2021),
                                 ('todo\ty', 1, {200}, 2021)])
    monkeypatch.setattr(yt, 'done_keys', lambda path=None: {
        'done\tx': {'key': 'done\tx', 'status': 'none'}})
    monkeypatch.setattr(
        yt, 'lookup',
        lambda k, n, d, p, verified=False: {
            'key': k, 'artist': 'todo', 'title': 'y',
            'n_files': n, 'query': 'todo y', 'status': 'found',
            'source': 'youtube', 'year': '2021',
            'years': ['2021'], 'videos': [], 'plausible': p,
            'mode': 'verified' if verified else 'topic'})
    monkeypatch.setattr(yt.time, 'sleep', lambda s: None)
    yt.run()
    rows = [json.loads(l) for l in prog.read_text().splitlines() if l.strip()]
    # ligne 1 = reprise préexistante (NON re-requêtée), ligne 2 = nouvelle clé
    assert [r['key'] for r in rows] == ['done\tx', 'todo\ty']
    assert rows[1]['status'] == 'found'


def test_run_capture_les_exceptions_en_error(tmp_path, monkeypatch):
    prog = tmp_path / 'yt.jsonl'
    monkeypatch.setattr(yt, 'PROG', str(prog))

    def boom(k, n, d, p, verified=False):
        raise RuntimeError('réseau mort')

    monkeypatch.setattr(yt, 'targets', lambda: [('boom\tx', 1, {200}, 2021)])
    monkeypatch.setattr(yt, 'done_keys', lambda path=None: {})
    monkeypatch.setattr(yt, 'lookup', boom)
    monkeypatch.setattr(yt.time, 'sleep', lambda s: None)
    yt.run()
    rows = [json.loads(l) for l in prog.read_text().splitlines() if l.strip()]
    assert rows[0]['status'] == 'error'
    assert 'RuntimeError' in rows[0]['error']


def test_append_et_done_keys_roundtrip(tmp_path):
    p = tmp_path / 'c.jsonl'
    yt._append({'key': 'a\tb', 'status': 'lax', 'year': '2021'}, str(p))
    assert yt.done_keys(str(p))['a\tb']['year'] == '2021'


# ── Tier --verified (chaînes officielles vérifiées / art tracks fusionnés) ──

def test_year_from_desc_ligne_p_dart_track():
    # description réelle d'art track fusionné (Daft Punk — One More Time)
    d = ('Provided to YouTube by Daft Life Ltd./ADA France\n\n'
         'One More Time · Daft Punk\n\nDiscovery\n\n'
         '℗ 2001 Daft Life Limited\n\nWriter: Thomas Bangalter\n\n'
         'Auto-generated by YouTube.\n')
    assert yt.year_from_desc(d) == '2001'


def test_year_from_desc_released_on():
    d = ('Provided to YouTube by Label\n\nTrack · Artist\n\n'
         'Released on: 2021-04-26\n\nAuto-generated by YouTube.')
    assert yt.year_from_desc(d) == '2021'


def test_year_from_desc_promo_jamais():
    # description promo (chaîne label vérifiée) : pas de signature autogen →
    # même si une année traîne dans le texte, AUCUNE année n'est extraite
    d = ('Buy / Stream: lnk.to/_Aria\n\nArgy returns to Afterlife…\n\n'
         'Released on: 2023-09-21 by Afterlife')
    assert yt.year_from_desc(d) is None
    d2 = ('Provided to YouTube by X\n\nTrack · Artist\n\n'
          'Auto-generated by YouTube.')
    assert yt.year_from_desc(d2) is None       # autogen sans année → None


def test_match_verified_gate_chaine_et_annee():
    fulls = {
        'V1': {'title': 'artist - title', 'channel': 'Label Official',
               'channel_is_verified': True, 'duration': 200,
               'release_date': None,
               'description': '℗ 2021 Label\nAuto-generated by YouTube.'},
        'V2': {'title': 'artist - title', 'channel': 'Random Uploader',
               'channel_is_verified': False, 'duration': 200,
               'description': '℗ 2021 X\nAuto-generated by YouTube.'},
        'V3': {'title': 'artist - title', 'channel': 'Label Official',
               'channel_is_verified': True, 'duration': 200,
               'description': 'Buy / Stream: lnk.to/x'},       # pas d'année
    }
    hits = yt.match_verified(fulls, 'artist', 'title', {200})
    assert [h['id'] for h in hits] == ['V1']
    assert hits[0]['year'] == '2021'


def test_match_verified_garde_fous_tokens_duree_et_priorite_release():
    fulls = {
        'V1': {'title': 'artist - autre morceau',
               'channel_is_verified': True, 'duration': 200,
               'description': '℗ 2021 X'},                    # tokens KO
        'V2': {'title': 'artist - title', 'channel_is_verified': True,
               'duration': 400, 'description': '℗ 2021 X'},   # durée KO
        'V3': {'title': 'artist - title', 'channel_is_verified': True,
               'duration': 200, 'release_date': '20230426',
               'description': '℗ 2001 Y'},                    # release > desc
    }
    hits = yt.match_verified(fulls, 'artist', 'title', {200})
    assert [h['id'] for h in hits] == ['V3']
    assert hits[0]['year'] == '2023'


def test_classify_verified_jamais_de_found():
    h2 = [{'id': 'a', 'title': 't', 'year': '2023'},
          {'id': 'b', 'title': 't2', 'year': '2023'}]
    # même 2 vidéos concordantes : le tier vérifié reste en lax (revue)
    assert yt.classify(h2, 2020, found_allowed=False) == \
        ('lax', '2023', ['2023'])
    # ... alors que le mode topic passerait en found
    assert yt.classify(h2, 2020, found_allowed=True)[0] == 'found'


def test_lookup_verified_tout_en_lax(monkeypatch):
    monkeypatch.setattr(yt, 'yt_search', lambda q, n=yt.SEARCH_N: [
        {'id': 'V1', 'title': 'artist - title', 'channel': 'Label Official',
         'duration': 200},
        {'id': 'V2', 'title': 'artist - title', 'channel': 'Label Official',
         'duration': 201}])

    def fake_full(vid):
        return {'title': 'artist - title', 'channel': 'Label Official',
                'channel_is_verified': True, 'duration': 200,
                'release_date': '20210426' if vid == 'V1' else '20210501'}

    monkeypatch.setattr(yt, '_full', fake_full)
    rec = yt.lookup('artist\ttitle', 1, {200}, 2015, verified=True)
    assert rec['mode'] == 'verified'
    assert rec['status'] == 'lax'          # 2 vidéos concordantes → quand même lax
    assert rec['year'] == '2021'


def test_run_reinterroge_les_none_de_l_autre_mode(tmp_path, monkeypatch):
    prog = tmp_path / 'yt.jsonl'
    prog.write_text(
        '{"key": "none topic\\tx", "status": "none", "mode": "topic"}\n'
        '{"key": "lax topic\\tx", "status": "lax", "mode": "topic", '
        '"year": "2021"}\n', encoding='utf-8')
    monkeypatch.setattr(yt, 'PROG', str(prog))
    monkeypatch.setattr(yt, 'targets',
                        lambda: [('none topic\tx', 1, {200}, 2021),
                                 ('lax topic\tx', 1, {200}, 2021)])
    asked = []

    def fake_lookup(k, n, d, p, verified=False):
        asked.append((k, verified))
        return {'key': k, 'status': 'none', 'mode': 'verified',
                'query': '', 'years': []}

    monkeypatch.setattr(yt, 'lookup', fake_lookup)
    monkeypatch.setattr(yt, 'done_keys', lambda path=None: {
        'none topic\tx': {'key': 'none topic\tx', 'status': 'none',
                          'mode': 'topic'},
        'lax topic\tx': {'key': 'lax topic\tx', 'status': 'lax',
                         'mode': 'topic', 'year': '2021'}})
    monkeypatch.setattr(yt.time, 'sleep', lambda s: None)
    yt.run(verified=True)
    # seule la clé none du mode topic est re-interrogée, en mode verified
    assert asked == [('none topic\tx', True)]
