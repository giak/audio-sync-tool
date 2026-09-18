"""Tests de scripts/collect_beatport.py (EPIC-033 P1) — sans réseau :
OAuth mocké (token cache + fetch), gardes, lookup simulé, run simulé avec
ciblage du résidu, reprise et erreurs re-jetables."""
import json
import sys

import pytest

sys.path.insert(0, 'scripts')
import collect_beatport as cb


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Caches + OAuth + token redirigés vers tmp_path."""
    monkeypatch.setattr(cb, 'PROG', str(tmp_path / 'beatport_cache.jsonl'))
    monkeypatch.setattr(cb, 'TOKEN_FILE', str(tmp_path / 'beatport_token.json'))
    monkeypatch.setattr(cb, 'OAUTH_FILE', str(tmp_path / 'beatport_oauth.json'))
    return tmp_path


def test_load_oauth_exige_client_id_secret(env):
    (env / 'beatport_oauth.json').write_text('{"client_id": "abc"}')
    with pytest.raises(SystemExit):
        cb.load_oauth()


def test_fetch_token_cache_et_expires(env):
    import time
    tok = {'access_token': 'T0K', 'expires_in': 36000}
    (env / 'beatport_token.json').write_text(
        json.dumps({**tok, 'expires_at': time.time() + 3600}))
    fetched = cb.fetch_token()
    assert fetched['access_token'] == 'T0K'


def test_token_brut_du_portail_docs(env):
    """JSON brut copié du portail docs (access_token + expires_in, sans
    expires_at) : accepté, émission datée par le mtime du fichier."""
    import os
    import time
    p = env / 'beatport_token.json'
    p.write_text(json.dumps({'access_token': 'PORTAL', 'expires_in': 36000}))
    old = time.time() - 3600          # émis il y a 1 h → encore valide
    os.utime(p, (old, old))
    tok = cb.load_token()
    assert tok and tok['access_token'] == 'PORTAL'
    assert tok['expires_at'] > time.time() + 3000
    # expiré (émis il y a 11 h) → None → fetch_token lèvera le message portail
    os.utime(p, (time.time() - 11 * 3600,) * 2)
    assert cb.load_token() is None


def test_fetch_token_sans_cache_ni_app_message_portail(env):
    with pytest.raises(SystemExit) as e:
        cb.fetch_token()
    assert 'portail' in str(e.value)


def test_fetch_token_client_credentials(env, monkeypatch):
    (env / 'beatport_oauth.json').write_text(json.dumps(
        {'client_id': 'id', 'client_secret': 'sec'}))
    calls = []

    def fake_urlopen(req, timeout=0):
        calls.append(req)
        body = json.dumps({'access_token': 'NEW', 'expires_in': 36000,
                           'token_type': 'Bearer'}).encode()

        class R:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

            def read(self):
                return body

            def load(self):
                return json.loads(body)

        import contextlib
        return R()

    monkeypatch.setattr(cb.urllib.request, 'urlopen', fake_urlopen)
    tok = cb.fetch_token()
    assert tok['access_token'] == 'NEW' and tok['expires_at'] > 0
    sent = calls[0].data.decode()
    assert 'grant_type=client_credentials' in sent
    # le token est mis en cache avec expires_at
    cached = json.loads((env / 'beatport_token.json').read_text())
    assert cached['access_token'] == 'NEW'


def test_guard_track_tokens(env):
    def tr(name, artists):
        return {'name': name, 'artists': [{'name': a} for a in artists]}

    assert cb.guard_track(tr('Personal Source', ['Arkus P.']), 'arkus p',
                          'personal source')
    assert not cb.guard_track(tr('Other Track', ['Arkus P.']), 'arkus p',
                              'personal source')
    assert not cb.guard_track(tr('Personal Source', ['Someone Else']),
                              'arkus p', 'personal source')


def test_lookup_found_avec_duree(env, monkeypatch):
    hits = {'tracks': [{'id': 42, 'name': 'The Siren',
                        'artists': [{'name': 'Dj Misjah'}],
                        'release_date': '1995-06-12'}],
            'releases': []}

    def fake_get(url):
        if 'search' in url:
            return hits
        return {'length_ms': 318000}     # 318 s = durée exacte

    monkeypatch.setattr(cb, 'bp_get', fake_get)
    res = cb.lookup('dj misjah', 'the siren', {320, 318})
    assert res['status'] == 'found' and res['source'] == 'beatport_strict'
    assert res['year'] == '1995'


def test_lookup_lax_sans_duree_et_ambiguous(env, monkeypatch):
    def mk(name, date, id_=1):
        return {'id': id_, 'name': name, 'artists': [{'name': 'A'}],
                'release_date': date}

    # année unique mais durée hors garde → lax (pas de certitude)
    monkeypatch.setattr(cb, 'bp_get', lambda url: {
        'tracks': [mk('X', '2006-01-01', 7)], 'releases': []})
    assert cb.lookup('a', 'x', {999})['status'] == 'lax'

    # deux années de tracks compatibles → ambiguous
    monkeypatch.setattr(cb, 'bp_get', lambda url: {
        'tracks': [mk('X', '2006-01-01', 1), mk('X', '2011-01-01', 2)],
        'releases': []})
    res = cb.lookup('a', 'x', set())
    assert res['status'] == 'ambiguous' and res['years'] == ['2006', '2011']

    # aucun résultat → none
    monkeypatch.setattr(cb, 'bp_get', lambda url: {'tracks': [], 'releases': []})
    assert cb.lookup('a', 'x', set())['status'] == 'none'


def test_run_cible_residu_et_journalise(env, monkeypatch):
    fake_targets = [('\tfoo bar', 2, {300}), ('baz\tqux', 1, set())]
    monkeypatch.setattr(cb, 'reform_targets', lambda: fake_targets)
    monkeypatch.setattr(cb, 'lookup',
                        lambda a, t, durs: {'status': 'found',
                                            'source': 'beatport_strict',
                                            'year': '2003', 'years': ['2003']})
    cb.run()
    rows = [json.loads(l) for l in open(cb.PROG) if l.strip()]
    assert len(rows) == 2 and rows[0]['key'] == '\tfoo bar'
    assert rows[0]['status'] == 'found' and rows[0]['year'] == '2003'


def test_run_reprise_et_erreurs_rejetables(env, monkeypatch):
    fake_targets = [('\tfoo', 1, set()), ('a\tb', 1, set())]
    monkeypatch.setattr(cb, 'reform_targets', lambda: fake_targets)
    with open(cb.PROG, 'w') as f:
        f.write(json.dumps({'key': '\tfoo', 'status': 'lax', 'year': '2001'}) + '\n')
        f.write(json.dumps({'key': 'a\tb', 'status': 'error',
                            'years': ['HTTPError: 503']}) + '\n')
    done = cb.done_keys()
    assert list(done) == ['\tfoo']          # l'error est re-jetable
    monkeypatch.setattr(cb, 'lookup', lambda a, t, d: {'status': 'none'})
    cb.run()
    rows = [json.loads(l) for l in open(cb.PROG) if l.strip()]
    assert len(rows) == 3                   # les 2 anciennes + 1 nouvelle a\tb
