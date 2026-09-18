"""Tests de scripts/report_years.py (EPIC-033 T5) — consolidation des vagues
sur les sources, sans réseau : caches redirigés vers tmp_path."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import report_years


def write_caches(tmp_path, monkeypatch, ycache, dcache, icache, rcache=None,
                 r2cache=None, bpcache=None, cache=None):
    (tmp_path / 'year_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in ycache) + '\n')
    (tmp_path / 'discogs_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in dcache) + '\n')
    (tmp_path / 'itunes_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in icache) + '\n')
    # Cache reform TOUJOURS redirigé (il existe sur disque : le run en cours
    # l'écrit — un test non isolé lirait des données réelles).
    (tmp_path / 'discogs_reform_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in (rcache or [])) + '\n')
    (tmp_path / 'discogs_reform2_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in (r2cache or [])) + '\n')
    (tmp_path / 'beatport_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in (bpcache or [])) + '\n')
    monkeypatch.setattr(report_years, 'BP_CACHE', str(tmp_path / 'beatport_cache.jsonl'))
    if cache is not None:
        (tmp_path / 'cache.json').write_text(json.dumps(cache))
    monkeypatch.setattr(report_years, 'YEAR_CACHE', str(tmp_path / 'year_cache.jsonl'))
    monkeypatch.setattr(report_years, 'DG_CACHE', str(tmp_path / 'discogs_cache.jsonl'))
    monkeypatch.setattr(report_years, 'IT_CACHE', str(tmp_path / 'itunes_cache.jsonl'))
    monkeypatch.setattr(report_years, 'RF_CACHE', str(tmp_path / 'discogs_reform_cache.jsonl'))
    monkeypatch.setattr(report_years, 'RF2_CACHE', str(tmp_path / 'discogs_reform2_cache.jsonl'))
    monkeypatch.setattr(report_years, 'CACHE', str(tmp_path / 'cache.json'))


def rec(key, status, **kw):
    r = {'key': key, 'status': status, 'n_files': 1}
    r.update(kw)
    return r


def test_priorite_year_cache_puis_discogs_puis_itunes(monkeypatch, tmp_path):
    # Même clé conclue par plusieurs sources : la PREMIÈRE gagne (pas de double
    # comptage) ; un 'none' en amont laisse la place au pool suivant.
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tA', 'found', year='1990'),
                         rec('\tB', 'none')],
                 dcache=[rec('\tA', 'lax', year='2001'),
                         rec('\tB', 'found', year='1995')],
                 icache=[rec('\tA', 'lax', year='2010'),
                         rec('\tB', 'lax', year='2011')])
    pool = report_years.load_all()
    assert pool['\tA'] == ('year_cache', pool['\tA'][1])
    assert pool['\tA'][1]['year'] == '1990'
    assert pool['\tB'] == ('discogs', pool['\tB'][1])
    assert pool['\tB'][1]['year'] == '1995'


def test_itunes_revendique_si_amont_none(monkeypatch, tmp_path):
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tC', 'none')],
                 dcache=[rec('\tC', 'none')],
                 icache=[rec('\tC', 'found', year='2024')])
    pool = report_years.load_all()
    assert pool['\tC'][0] == 'itunes' and pool['\tC'][1]['year'] == '2024'


def test_consensus_fenetre_2_ans_mb_deezer_uniquement(monkeypatch, tmp_path):
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tSerre', 'ambiguous', years=['2002', '2003']),
                         rec('\tLarge', 'ambiguous', years=['1995', '2014'])],
                 dcache=[rec('\tDSerre', 'ambiguous', years=['2002', '2003'])],
                 icache=[])
    pool = report_years.load_all()
    assert report_years.wave_of('year_cache', pool['\tSerre'][1]) == 'certaines'
    assert report_years.wave_of('year_cache', pool['\tLarge'][1]) == 'a_revue'
    # Discogs/iTunes ambiguous : pas de consensus automatique (sémantique autre)
    assert report_years.wave_of('discogs', pool['\tDSerre'][1]) == 'a_revue'


def test_vagues_statuts_simples(monkeypatch, tmp_path):
    lax = rec('\tL', 'lax', year='2003')
    amb = rec('\tM', 'ambiguous', years=['1999', '2001'])
    assert report_years.wave_of('itunes', lax) == 'a_revue'
    assert report_years.wave_of('discogs', amb) == 'a_revue'
    assert report_years.wave_of('year_cache',
                                rec('\tF', 'found', year='1990')) == 'certaines'


def test_lignes_error_ignores(monkeypatch, tmp_path):
    # Un enregistrement en 'error' ne masque pas un résultat valide antérieur…
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tD', 'error', years=['HTTPError: 503']),
                         rec('\tD', 'none')],
                 dcache=[rec('\tD', 'lax', year='2009')],
                 icache=[])
    pool = report_years.load_all()
    # …et le 'none' final laisse Discogs revendiquer la clé.
    assert pool['\tD'][0] == 'discogs' and pool['\tD'][1]['year'] == '2009'


def test_cles_non_revendiquees_introuvables(monkeypatch, tmp_path):
    # Universe via load_keys() (monkeypatché pour rester sans disque) :
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tX', 'found', year='2000')],
                 dcache=[], icache=[])
    fake_keys = {'\tX': {'n': 1, 'durs': set()}, '\tY': {'n': 2, 'durs': set()}}
    monkeypatch.setattr(report_years, 'load_keys', lambda: (0, 0, fake_keys))
    pool = report_years.load_all()
    assert report_years.wave_of(*pool['\tX']) == 'certaines'
    assert '\tY' not in pool   # jamais revendiquée → introuvable au comptage


def test_reform_dernier_rideau_sans_chevauchement(monkeypatch, tmp_path):
    # Le pool reform ne cible que des clés 'none' partout ailleurs (par
    # construction du collecteur) : il ne doit jamais masquer un pool amont.
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tA', 'found', year='1990'),
                         rec('\tC', 'none')],
                 dcache=[rec('\tB', 'lax', year='2003'),
                         rec('\tC', 'none')],
                 icache=[rec('\tA', 'lax', year='2010'),
                         rec('\tB', 'none'),
                         rec('\tC', 'none')],
                 rcache=[rec('\tA', 'found', year='1999'),   # masqué par MB
                         rec('\tB', 'ambiguous', years=['2003', '2005']),
                         rec('\tC', 'found', year='2007')])
    pool = report_years.load_all()
    assert pool['\tA'][0] == 'year_cache'   # reform ne l'écrase pas
    assert pool['\tA'][1]['year'] == '1990'
    assert pool['\tB'][0] == 'discogs'
    assert pool['\tC'][0] == 'reform'       # résolue par le dernier rideau
    assert report_years.wave_of(*pool['\tC']) == 'certaines'


def test_reform_lax_et_ambiguous_en_a_revue(monkeypatch, tmp_path):
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tL', 'none'), rec('\tM', 'none')],
                 dcache=[rec('\tL', 'none'), rec('\tM', 'none')],
                 icache=[],
                 rcache=[rec('\tL', 'lax', year='2009'),
                         rec('\tM', 'ambiguous', years=['2003', '2005'])])
    pool = report_years.load_all()
    # Mêmes règles que Discogs/iTunes : pas de consensus automatique reform.
    assert report_years.wave_of(*pool['\tL']) == 'a_revue'
    assert report_years.wave_of(*pool['\tM']) == 'a_revue'


def test_reform2_dernier_rideau_sans_chevauchement(monkeypatch, tmp_path):
    # reform2 (junk-artiste numérique) : même contrat que reform — dernier
    # rideau, ne cible que des clés 'none' partout, jamais d'écrasement amont.
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tA', 'found', year='1990'), rec('\tN', 'none')],
                 dcache=[rec('\tB', 'lax', year='2003'), rec('\tN', 'none')],
                 icache=[],
                 rcache=[rec('\tD', 'lax', year='2008'), rec('\tN', 'none')],
                 r2cache=[rec('\tA', 'found', year='2077'),   # masqué par MB
                          rec('\tB', 'ambiguous', years=['2003', '2077']),
                          rec('\tC', 'found', year='2007'),   # résolue v2
                          rec('\tD', 'found', year='2077'),   # masqué par reform
                          rec('\tN', 'lax', year='2011')])
    pool = report_years.load_all()
    assert pool['\tA'][0] == 'year_cache'   # v2 ne l'écrase pas
    assert pool['\tC'][0] == 'reform2'      # résolue par le dernier rideau
    assert report_years.wave_of(*pool['\tC']) == 'certaines'
    assert pool['\tN'][0] == 'reform2'
    assert report_years.wave_of(*pool['\tN']) == 'a_revue'  # lax v2 → à revue


def test_beatport_dernier_rideau_sans_chevauchement(monkeypatch, tmp_path):
    write_caches(tmp_path, monkeypatch,
                 ycache=[rec('\tA', 'found', year='1990'), rec('\tN', 'none')],
                 dcache=[], icache=[],
                 rcache=[rec('\tB', 'lax', year='2005')],
                 bpcache=[rec('\tA', 'found', year='2077'),
                          rec('\tB', 'found', year='2077'),
                          rec('\tN', 'found', year='2007',
                              source='beatport_strict')])
    pool = report_years.load_all()
    assert pool['\tA'][0] == 'year_cache'    # Beatport ne masque pas l'amont
    assert pool['\tB'][0] == 'reform'
    assert pool['\tN'][0] == 'beatport'
    assert report_years.wave_of(*pool['\tN']) == 'certaines'
