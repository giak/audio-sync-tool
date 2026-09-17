"""Tests des gardes et statuts de scripts/collect_itunes.py (EPIC-033 T5) —
sans réseau : `candidates` et le JSONL sont simulés."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import collect_itunes


# ── Garde tokens ─────────────────────────────────────────────────────────────

def test_garde_artiste_intersection():
    it = {'artistName': 'Adam Beyer', 'trackName': 'Remainings III'}
    assert collect_itunes.guard(it, 'adam beyer', 'remainings iii')
    # artiste incompatible → rejet
    it2 = {'artistName': 'Carl Cox', 'trackName': 'Remainings III'}
    assert not collect_itunes.guard(it2, 'adam beyer', 'remainings iii')


def test_garde_normalisation_casse_accents():
    # Leçon forensique EPIC-033 : comparaison SANS normalisation → 0 match.
    it = {'artistName': 'Monika Kruse', 'trackName': 'Latin Lovers'}
    assert collect_itunes.guard(it, 'MONIKA KRUSE', 'latin lovers')
    it2 = {'artistName': 'Beyoncé', 'trackName': 'Résumé'}
    assert collect_itunes.guard(it2, 'beyonce', 'resume')


def test_garde_titre_inclusion_tolere_version_longue():
    # Le titre du résultat peut enrichir la requête (remix, long version)…
    it = {'artistName': 'Popof', 'trackName': 'Acid Cult (Original Mix)'}
    assert collect_itunes.guard(it, 'popof', 'acid cult')
    # …mais jamais la retrancher.
    it2 = {'artistName': 'Popof', 'trackName': 'Acid'}
    assert not collect_itunes.guard(it2, 'popof', 'acid cult')


def test_garde_artiste_manquant_sur_un_cote():
    # Requête sans artiste : seule l'inclusion du titre décide.
    it = {'artistName': 'Nimportequi', 'trackName': 'Paranoid Dancer 3'}
    assert collect_itunes.guard(it, None, 'paranoid dancer 3')


# ── Statuts (lookup avec candidates simulées) ────────────────────────────────

def item(artist, track, year, ms):
    return {'artistName': artist, 'trackName': track,
            'releaseDate': f'{year}-05-01T12:00:00Z', 'trackTimeMillis': ms}


def test_lookup_found_duree_verifiee(monkeypatch):
    durs = {220}
    items = [item('Neelix', 'Promise (Original Mix)', '2024', 220_000)]
    monkeypatch.setattr(collect_itunes, 'candidates', lambda a, t: items)
    res = collect_itunes.lookup('neelix', 'promise', durs)
    assert res['status'] == 'found' and res['year'] == '2024'
    assert res['source'] == 'itunes'


def test_lookup_lax_annee_unique_duree_non_verifiable(monkeypatch):
    # Durée hors garde (mix long) : pas de strict, mais année unique → lax.
    durs = {300}
    items = [item('Naems', 'Follow Me', '2024', 500_000)]
    monkeypatch.setattr(collect_itunes, 'candidates', lambda a, t: items)
    res = collect_itunes.lookup('naems', 'follow me', durs)
    assert res['status'] == 'lax' and res['year'] == '2024'


def test_lookup_ambiguous_plusieurs_annees_compatibles(monkeypatch):
    durs = {220}
    items = [item('Axel Bartsch', 'Drumfiles 2.0', '2001', 220_000),
             item('Axel Bartsch', 'Drumfiles 2.0 (Rework)', '2002', 221_000)]
    monkeypatch.setattr(collect_itunes, 'candidates', lambda a, t: items)
    res = collect_itunes.lookup('axel bartsch', 'drumfiles 2 0', durs)
    assert res['status'] == 'ambiguous' and res['years'] == ['2001', '2002']


def test_lookup_none_aucun_compatible(monkeypatch):
    durs = {220}
    items = [item('Carl Cox', 'Autre Morceau', '2005', 300_000)]
    monkeypatch.setattr(collect_itunes, 'candidates', lambda a, t: items)
    res = collect_itunes.lookup('felix da housecat', 'vengeance of a bad man', durs)
    assert res['status'] == 'none' and res['year'] is None


def test_lookup_sans_duree_connue_passe_lax(monkeypatch):
    # durs vide : aucun strict possible, année unique → lax (pas found).
    items = [item('Brainpain', 'Chosen One', '2015', 220_000)]
    monkeypatch.setattr(collect_itunes, 'candidates', lambda a, t: items)
    res = collect_itunes.lookup('brainpain', 'chosen one', set())
    assert res['status'] == 'lax'


# ── Reprise JSONL : erreurs re-jetables ──────────────────────────────────────

def test_done_keys_rejette_les_erreurs(monkeypatch, tmp_path):
    prog = tmp_path / 'itunes_cache.jsonl'
    rows = [
        {'key': 'a\tok', 'status': 'found', 'year': '2020'},
        {'key': 'b\terr', 'status': 'error', 'years': ['HTTPError: 403']},
        {'key': 'c\tlax', 'status': 'lax', 'year': '2003'},
    ]
    prog.write_text('\n'.join(json.dumps(r) for r in rows) + '\n')
    monkeypatch.setattr(collect_itunes, 'PROG', str(prog))
    done = collect_itunes.done_keys()
    assert set(done) == {'a\tok', 'c\tlax'}      # l'erreur est re-jetable
    assert done['c\tlax']['year'] == '2003'
