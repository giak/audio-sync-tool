"""Tests de scripts/collect_discogs_reform2.py (EPIC-033 P1bis) — sans réseau :
reformulation v2 sur les cas réels de l'aperçu, ciblage (re-requête identique
interdite), run simulé + reprise."""
import json
import sys

import pytest

sys.path.insert(0, 'scripts')
import collect_discogs_reform2 as r2


# ── reform2 : cas réels de l'aperçu ─────────────────────────────────────────

def test_reform2_hash_et_numero_de_matrice():
    assert r2.reform2('#07 enzyme x', 'opbokken') == ('enzyme x', 'opbokken')
    assert r2.reform2('# the siren', 'dj misjah') == ('the siren', 'dj misjah')


def test_reform2_annee_en_tete_artiste():
    assert r2.reform2('2006 prodigy', 'outta space') == ('prodigy', 'outta space')


def test_reform2_artiste_entierement_numerique_titre_seul():
    # '204' = matrice entière → la requête devient le titre brut (porteur
    # de l'info réelle : 'juan atkins - model 500 - no ufo's')
    assert r2.reform2('204', "juan atkins - model 500 - no ufo's") == \
        ('', "juan atkins - model 500 - no ufo's")
    assert r2.reform2('cd1', 'water') == ('', 'water')


def test_reform2_prefixe_serie_partiel_limite_assumee():
    # '2cb' retiré (série), '006b1' conservé (5 caractères, hors règle) —
    # limite documentée : la requête reste plus propre que v1.
    assert r2.reform2('2cb 006b1 tik tok', 'future') == \
        ('006b1 tik tok', 'future')


def test_reform2_artiste_normal_inchange():
    # v2 ne touche JAMAIS un artiste plausible (règles v1 seulement)
    assert r2.reform2('distorted waves of ohm', 'herculean') == \
        ('distorted waves of ohm', 'herculean')


def test_reform2_normalise_titre_hote():
    # '=' et doubles espaces → requête saine : la requête exacte renvoie un
    # 403 reproductible de Discogs (cas réel 'one phantasia=inner light')
    assert r2.reform2('', 'techno sonic  one phantasia=inner light') == \
        ('', 'techno sonic one phantasia inner light')


def test_reform2_chemin_v1_conservé():
    # junk-artiste classique (vide) : le split v1 au marqueur de face reste
    assert r2.reform2('', 'b1 digitalism zdarlight') == \
        ('digitalism', 'zdarlight')
    assert r2.reform2('tim xavier', 'b1 real jack') == ('tim xavier', 'real jack')


def test_numeric_junk_et_junk_word():
    assert r2.numeric_junk('#07 enzyme x')
    assert r2.numeric_junk('204')
    assert r2.numeric_junk('2006 prodigy')
    assert r2.numeric_junk('2c sucker')
    assert not r2.numeric_junk('enzyme x')
    assert not r2.numeric_junk('dj misjah')
    assert r2.junk_word('#07') and r2.junk_word('204') and r2.junk_word('2006')
    assert r2.junk_word('2cb')          # série courte
    assert not r2.junk_word('006b1')    # 5 caractères : hors règle (documenté)
    assert not r2.junk_word('enzyme')


# ── Ciblage : interdit de re-requête identique ──────────────────────────────

def test_targets2_filtre_conclusifs_et_identiques(monkeypatch):
    fake_v1_targets = [('\ta', 1, set()), ('\tb', 1, set()), ('\tc', 1, set())]
    monkeypatch.setattr(r2, 'v1_targets', lambda: fake_v1_targets)
    monkeypatch.setattr(r2, 'v1_done_keys', lambda: {
        '\ta': {'status': 'found', 'year': '2000'},        # conclusif → exclu
        '\tb': {'status': 'none', 'query': 'unchanged — q'},  # identique → exclu
        '\tc': {'status': 'none', 'query': 'old — q'},
    })
    monkeypatch.setattr(r2, 'reform_v1',
                        lambda a, t: ('unchanged', 'q') if t == 'b' else ('x', t))
    todo = r2.targets2()
    keys = [k for k, *_ in todo]
    assert keys == ['\tc']               # seule c : none + requête changée


# ── Run simulé + reprise ────────────────────────────────────────────────────

@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(r2, 'PROG', str(tmp_path / 'reform2_cache.jsonl'))
    return tmp_path


def test_run_journalise_source_reform2(env, monkeypatch):
    # titre réaliste (un titre mono-token serait filtré par la garde tokens())
    monkeypatch.setattr(r2, 'targets2', lambda: [('\tartist\topbokken',
                                                  'old — q', 'new — q', 2, {238})])
    monkeypatch.setattr(r2, 'dg_lookup',
                        lambda a, t, d: {'status': 'found',
                                         'source': 'discogs_strict',
                                         'year': '1995', 'years': ['1995']})
    monkeypatch.setattr(r2.time, 'sleep', lambda s: None)
    r2.run()
    rows = [json.loads(l) for l in open(r2.PROG) if l.strip()]
    assert len(rows) == 1
    assert rows[0]['status'] == 'found' and rows[0]['year'] == '1995'
    assert rows[0]['source'] == 'reform2_discogs_strict'
    assert rows[0]['query'] == 'new — q'


def test_run_reprise_et_erreurs_rejetables(env, monkeypatch):
    monkeypatch.setattr(r2, 'targets2',
                        lambda: [('\ta\talpha', '', 'qa', 1, set()),
                                 ('\tb\tbeta', '', 'qb', 1, set())])
    with open(r2.PROG, 'w') as f:
        f.write(json.dumps({'key': '\ta\talpha', 'status': 'lax',
                            'year': '2001', 'query': 'qa'}) + '\n')
        f.write(json.dumps({'key': '\tb\tbeta', 'status': 'error',
                            'years': ['HTTPError: 502'], 'query': 'qb'}) + '\n')
    monkeypatch.setattr(r2, 'dg_lookup', lambda a, t, d: {'status': 'none'})
    monkeypatch.setattr(r2.time, 'sleep', lambda s: None)
    r2.run()
    rows = [json.loads(l) for l in open(r2.PROG) if l.strip()]
    assert len(rows) == 3                # 2 anciennes + b re-jetée
    assert sum(1 for r in rows if r['key'] == '\tb\tbeta') == 2
