"""Tests de scripts/collect_discogs_reform.py (EPIC-033 P1) — sans réseau :
reformulation sur les cas réels du diagnostic, ciblage et run simulés
(réseau mocké, JSONL redirigé vers tmp_path)."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import collect_discogs_reform as cdr


# ── Reformulation : cas réels du diagnostic ──────────────────────────────────

def test_reform_junk_artiste_avec_marqueur():
    # '∅ — b1 digitalism zdarlight' → artiste/titre retrouvés par la garde
    assert cdr.reform('', 'b1 digitalism zdarlight') == ('digitalism', 'zdarlight')


def test_reform_marqueur_dans_artiste():
    # 'b1 arkus p — personal source' (sonde live : 0 brut → 1 brut, année 2004)
    assert cdr.reform('b1 arkus p', 'personal source') == ('arkus p', 'personal source')


def test_reform_marqueur_dans_titre():
    # sonde live : 3 bruts, garde 0 (titre non confirmé) → statut none/revue
    assert cdr.reform('tim xavier', 'b1 real jack') == ('tim xavier', 'real jack')


def test_reform_suffixe_junk():
    # sonde live : lfo — freak → 5 bruts, garde 5, années 2003/2004/2023
    assert cdr.reform('lfo', 'freak ktmp3') == ('lfo', 'freak')


def test_reform_url_junk():
    # sonde live : tom wax — rave will never die → 5 bruts, garde 3, année 2021
    assert cdr.reform('tom wax', 'rave will never die www groovytunes org') == \
        ('tom wax', 'rave will never die')


def test_reform_sans_marqueur_inchangee():
    assert cdr.reform('distorted waves of ohm', 'herculean') == \
        ('distorted waves of ohm', 'herculean')


def test_reform_titre_tout_marqueur_requête_vide():
    # rien de demandable → statut none non re-jetable côté run()
    assert cdr.reform('a1', 'a1') == ('', '')


def test_reform_unknown_artist():
    assert cdr.reform('unknown artist', 'masquenada') == ('', 'masquenada')


# ── Ciblage : clés introuvables toutes sources confondues ───────────────────

def _write_jsonl(path, recs):
    with open(path, 'w') as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')


def test_targets_exclut_les_concluants(tmp_path):
    y, d, i = tmp_path / 'y.jsonl', tmp_path / 'd.jsonl', tmp_path / 'i.jsonl'
    _write_jsonl(y, [{'key': 'serre\tx', 'status': 'found', 'year': '1990'},
                     {'key': 'amb\tx', 'status': 'ambiguous', 'years': ['2002', '2003']},
                     {'key': 'none\tmb', 'status': 'none', 'artist': 'none', 'title': 'mb'}])
    _write_jsonl(d, [{'key': 'none\tmb', 'status': 'none'}])
    _write_jsonl(i, [{'key': 'it\tlax', 'status': 'lax', 'year': '2020'}])
    keys = {'none\tmb': {'n': 2, 'durs': {100}},
            'serre\tx': {'n': 1, 'durs': set()},
            'amb\tx': {'n': 1, 'durs': set()},
            'it\tlax': {'n': 1, 'durs': {90}}}
    got = cdr.targets(str(y), str(d), str(i), keys=keys)
    assert [k for k, _, _ in got] == ['none\tmb']
    assert got[0][1] == 2 and got[0][2] == {100}


# ── Run : réseau mocké, JSONL tmp ────────────────────────────────────────────

class FakeTokens:
    """tokens(rt) simulé : non vide dès que rt contient un mot."""

    def __call__(self, s):
        return {w for w in str(s).split() if w and len(w) > 2}


def test_run_ecrit_requete_et_statuts(tmp_path, monkeypatch):
    monkeypatch.setattr(cdr, 'PROG', str(tmp_path / 'reform.jsonl'))
    monkeypatch.setattr(cdr, 'tokens', FakeTokens())
    monkeypatch.setattr(cdr, 'targets', lambda **kw: [
        ('lfo\tfreak ktmp3', 2, {205}),
        ('a1\ta1', 1, set()),
    ])

    def fake_lookup(ra, rt, durs):
        assert (ra, rt) == ('lfo', 'freak')
        assert durs == {205}
        return {'status': 'found', 'source': 'discogs_strict', 'year': '2003',
                'years': ['2003']}

    monkeypatch.setattr(cdr, 'lookup', fake_lookup)
    monkeypatch.setattr(cdr.time, 'sleep', lambda s: None)
    cdr.run()
    recs = [json.loads(l) for l in open(tmp_path / 'reform.jsonl') if l.strip()]
    assert len(recs) == 2
    found = next(r for r in recs if r['key'] == 'lfo\tfreak ktmp3')
    assert found['query'] == 'lfo — freak'
    assert found['status'] == 'found' and found['year'] == '2003'
    assert found['source'] == 'reform_discogs_strict'   # marqué reform
    empty = next(r for r in recs if r['key'] == 'a1\ta1')
    assert empty['query'] == '' and empty['status'] == 'none'


def test_run_reprise_saute_et_rejette_erreurs(tmp_path, monkeypatch):
    prog = tmp_path / 'reform.jsonl'
    monkeypatch.setattr(cdr, 'PROG', str(prog))
    monkeypatch.setattr(cdr, 'tokens', FakeTokens())
    todo = [('serre\txxx', 1, set()), ('erreurs\txxx', 1, set()),
            ('nouveau\tzzz', 1, {120})]
    monkeypatch.setattr(cdr, 'targets', lambda **kw: todo)
    # JSONL pré-existant : 1 trouvée + 1 erreur re-jetable
    _write_jsonl(prog, [{'key': 'serre\txxx', 'status': 'found', 'year': '1990'},
                        {'key': 'erreurs\txxx', 'status': 'error', 'years': ['HTTPError: 502']}])
    monkeypatch.setattr(cdr, 'lookup', lambda ra, rt, durs:
                        {'status': 'lax', 'source': 'discogs', 'year': '2001',
                         'years': ['2001']})
    monkeypatch.setattr(cdr.time, 'sleep', lambda s: None)
    cdr.run()
    # l'error a bien été re-jetée et re-interrogée : elle a une ligne valide
    real_done = cdr.done_keys()
    assert set(real_done) == {'serre\txxx', 'erreurs\txxx', 'nouveau\tzzz'}
    recs = [json.loads(l) for l in open(prog) if l.strip()]
    # ancienne ligne error conservée (historique additif) + nouvelle ligne err
    assert [r['key'] for r in recs] == ['serre\txxx', 'erreurs\txxx',
                                        'erreurs\txxx', 'nouveau\tzzz']
    assert recs[2]['status'] == 'lax' and recs[2]['source'] == 'reform_discogs'
    assert recs[3]['status'] == 'lax' and recs[3]['query'] == 'nouveau — zzz'


def test_run_max_seconds_budget(tmp_path, monkeypatch):
    monkeypatch.setattr(cdr, 'PROG', str(tmp_path / 'reform.jsonl'))
    monkeypatch.setattr(cdr, 'tokens', FakeTokens())
    monkeypatch.setattr(cdr, 'targets', lambda **kw: [
        ('aaa\txxx', 1, set()), ('bbb\tyyy', 1, set())])
    calls = []

    def fake_lookup(ra, rt, durs):
        calls.append(ra)
        return {'status': 'none', 'source': None, 'year': None, 'years': []}

    monkeypatch.setattr(cdr, 'lookup', fake_lookup)
    monkeypatch.setattr(cdr.time, 'sleep', lambda s: None)
    # t0 capturé au 1er appel, budget dépassé dès le 2e tour de boucle
    times = iter([0, 0, 999])
    monkeypatch.setattr(cdr.time, 'monotonic', lambda: next(times))
    cdr.run(max_seconds=100)
    assert len(calls) == 1          # le 2e item n'a pas été interrogé
