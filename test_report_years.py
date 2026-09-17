"""Tests de scripts/report_years.py (EPIC-033 T5) — consolidation des vagues
sur les 4 sources, sans réseau : caches redirigés vers tmp_path."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import report_years


def write_caches(tmp_path, monkeypatch, ycache, dcache, icache, cache=None):
    (tmp_path / 'year_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in ycache) + '\n')
    (tmp_path / 'discogs_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in dcache) + '\n')
    (tmp_path / 'itunes_cache.jsonl').write_text(
        '\n'.join(json.dumps(r) for r in icache) + '\n')
    if cache is not None:
        (tmp_path / 'cache.json').write_text(json.dumps(cache))
    monkeypatch.setattr(report_years, 'YEAR_CACHE', str(tmp_path / 'year_cache.jsonl'))
    monkeypatch.setattr(report_years, 'DG_CACHE', str(tmp_path / 'discogs_cache.jsonl'))
    monkeypatch.setattr(report_years, 'IT_CACHE', str(tmp_path / 'itunes_cache.jsonl'))
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
