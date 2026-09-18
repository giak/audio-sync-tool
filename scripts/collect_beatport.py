#!/usr/bin/env python3
"""Passe Beatport sur le résidu (clés 'none' MB/Deezer/Discogs/iTunes/reform)
— LECTURE SEULE sur le corpus ; n'écrit que dans data/beatport_cache.jsonl
(reprise : clés présentes sautées, erreurs re-jetables au run suivant).

Prérequis (EPIC-033 P1) — Beatport n'ouvre PAS la création d'applications
OAuth au public (confirmé : beets-beatport4 « not possible to request API
access the normal way »). Méthode éprouvée = token du portail docs :
  1. Ouvrir https://api.beatport.com/v4/docs/ + l'onglet Réseau du navigateur.
  2. Cliquer « Login with Beatport » et se connecter.
  3. Chercher la requête POST vers /v4/auth/o/token/ et copier sa réponse JSON.
  4. La coller dans data/beatport_token.json (chmod 600, git-ignoré).
Variante automatisée (optionnelle) : data/beatport_oauth.json
{"client_id": "...", "client_secret": "..."} (app OAuth privée, si un jour
accordée) → grant client_credentials / password géré ici + token cache.

API : /v4/catalog/search/ ('track' + 'release') → années de sortie ; garde
durée via /v4/catalog/tracks/{id}/ (length_ms, ±15 s d'une durée connue —
contrôle strict, mieux servi que la tracklist Discogs). Statuts identiques
aux autres collecteurs : found (tokens+durée) / lax (année unique) /
ambiguous (≥ 2 années) / none.

Usage : ./venv/bin/python scripts/collect_beatport.py [--report]
        [--max-seconds=N] — depuis la racine du projet.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

from collect_years import tokens

from collect_discogs_reform import targets as reform_targets

PROG = 'data/beatport_cache.jsonl'
OAUTH_FILE = 'data/beatport_oauth.json'
TOKEN_FILE = 'data/beatport_token.json'
UA = 'audio-sync-tool/0.1 ( https://github.com/giak/audio-sync-tool )'
BASE = 'https://api.beatport.com/v4'


# ── OAuth2 (doc officielle : password grant OU client_credentials) ─────────

def load_oauth():
    try:
        with open(OAUTH_FILE) as f:
            o = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        raise SystemExit(
            f'{OAUTH_FILE} absent : créez une OAuth Application Beatport '
            '(settings developer) puis écrivez {"client_id": "...", '
            '"client_secret": "..."} dans ce fichier (chmod 600).')
    if not o.get('client_id') or not o.get('client_secret'):
        raise SystemExit(f'{OAUTH_FILE} incomplet (client_id/client_secret).')
    return o


def load_token():
    """Token cache valide, sinon None. Tolère le JSON BRUT copié du portail
    docs (access_token + expires_in, sans expires_at) : l'émission est alors
    datée par le mtime du fichier."""
    try:
        with open(TOKEN_FILE) as f:
            t = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    if not t.get('access_token'):
        return None
    if 'expires_at' not in t:
        try:
            emitted = os.path.getmtime(TOKEN_FILE)
        except OSError:
            return None
        t['expires_at'] = emitted + int(t.get('expires_in', 3600))
    if t['expires_at'] <= time.time() + 60:
        return None
    return t


def fetch_token():
    """Token : cache/portal d'abord ; sinon grant OAuth si app privée."""
    cached = load_token()
    if cached:
        return cached
    if not os.path.exists(OAUTH_FILE):
        raise SystemExit(
            f'{TOKEN_FILE} absent ou expiré. Récupérez le token du portail :\n'
            '  1. https://api.beatport.com/v4/docs/ + onglet Réseau (F12)\n'
            '  2. « Login with Beatport » → connectez-vous\n'
            '  3. Copiez la réponse JSON du POST /v4/auth/o/token/\n'
            f'  4. Collez-la dans {TOKEN_FILE} (chmod 600)')
    o = load_oauth()
    fields = {'client_id': o['client_id'], 'client_secret': o['client_secret']}
    if o.get('username') and o.get('password'):
        fields.update(grant_type='password',
                      username=o['username'], password=o['password'])
    else:
        fields['grant_type'] = 'client_credentials'
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(
        f'{BASE}/auth/o/token/', data=data, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            tok = json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f'OAuth token refusé (HTTP {e.code}) : {e.read()[:200]}')
    tok['expires_at'] = time.time() + int(tok.get('expires_in', 36000))
    with open(TOKEN_FILE, 'w') as f:
        json.dump(tok, f)
    return tok


def bp_get(url, _retry=2):
    """GET Beatport authentifié (Bearer) ; retry sur 502/503, Retry-After sur 429."""
    tok = fetch_token()
    delays = [2, 10, 30]
    last = None
    for attempt in range(len(delays) + 1):
        req = urllib.request.Request(url, headers={
            'Authorization': f"Bearer {tok['access_token']}", 'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (502, 503) and attempt < len(delays):
                time.sleep(delays[attempt])
                continue
            if e.code == 429 and attempt < len(delays):
                time.sleep(int(e.headers.get('Retry-After') or delays[attempt]))
                continue
            raise
    raise last


# ── Gardes (identiques aux autres collecteurs) ─────────────────────────────

def guard_track(tr, artist, title):
    """Tokens artiste ET titre compatibles (normalisation collect_years)."""
    ta_q, tt_q = tokens(artist), tokens(title)
    ta_r = tokens(' '.join(a.get('name', '') for a in tr.get('artists', [])))
    tt_r = tokens(tr.get('name', ''))
    if ta_q and ta_r and not (ta_q & ta_r):
        return False
    if tt_q and tt_r and not (tt_q & tt_r):
        return False
    return True


def track_len_ms(track_id):
    """Durée exacte du morceau (length_ms) via l'endpoint détail."""
    try:
        d = bp_get(f'{BASE}/catalog/tracks/{track_id}/')
        return int(d.get('length_ms') or 0)
    except Exception:
        return 0


def lookup(artist, title, durs):
    """Beatport → dict de résultat : found (tokens + durée ±15 s),
    lax (année unique, durée non vérifiable), ambiguous (≥ 2 années), none."""
    q = urllib.parse.urlencode({'query': f'{artist} {title}'.strip(),
                                'per_page': 5})
    data = bp_get(f'{BASE}/catalog/search/?{q}')

    def year_of(hit):
        d = hit.get('release_date') or hit.get('date', {}).get('released') or ''
        m = re.match(r'^(\d{4})', str(d))
        return m.group(1) if m else None

    # Tracks d'abord (durée vérifiable), releases ensuite (année d'album).
    tracks = [t for t in data.get('tracks', []) if guard_track(t, artist, title)]
    years = {year_of(t) for t in tracks}
    years.discard(None)
    if tracks and len(years) == 1:
        t0 = tracks[0]
        ms = track_len_ms(t0.get('id'))
        if ms and durs:
            sec = ms // 1000
            if any(abs(sec - d) <= 15 for d in durs):
                return {'status': 'found', 'source': 'beatport_strict',
                        'year': next(iter(years)), 'years': sorted(years)}
        # durée non vérifiable → lax (comme Discogs : pas de garde, pas de certitude)
        return {'status': 'lax', 'source': 'beatport', 'year': next(iter(years)),
                'years': sorted(years)}
    if tracks and len(years) > 1:
        return {'status': 'ambiguous', 'source': 'beatport', 'year': None,
                'years': sorted(years)}

    # Relais releases (années d'album) si aucun track concluant.
    rels = [r for r in data.get('releases', [])
            if tokens(r.get('name', '')) & (tokens(title) or tokens(artist))]
    ryears = sorted({year_of(r) for r in rels} - {None})
    if len(ryears) == 1:
        return {'status': 'lax', 'source': 'beatport_release', 'year': ryears[0],
                'years': ryears}
    if len(ryears) > 1:
        return {'status': 'ambiguous', 'source': 'beatport', 'year': None,
                'years': ryears}
    return {'status': 'none', 'source': None, 'year': None, 'years': []}


# ── Reprise / run / rapport (pattern collect_discogs_reform) ───────────────

def done_keys():
    done = {}
    try:
        with open(PROG) as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    if r.get('status') == 'error':
                        continue
                    done[r['key']] = r
    except FileNotFoundError:
        pass
    return done


def run(max_seconds=None):
    t0 = time.monotonic()
    done = done_keys()
    todo = [(k, n, durs) for k, n, durs in reform_targets() if k not in done]
    print(f"clés résiduelles à traiter : {len(todo)} "
          f"(déjà faites : {len(done)})", flush=True)
    if not todo:
        return
    for i, (key, n, durs) in enumerate(todo):
        if max_seconds and time.monotonic() - t0 > max_seconds:
            print(f'budget atteint après {i} clés — reprise possible', flush=True)
            return
        artist, title = key.split('\t', 1)
        rec = {'key': key, 'artist': artist, 'title': title, 'n_files': n,
               'status': 'none', 'source': None, 'year': None, 'years': []}
        try:
            rec.update(lookup(artist, title, durs))
        except Exception as e:
            rec.update(status='error', years=[f'{type(e).__name__}: {e}'[:80]])
        with open(PROG, 'a') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        if (i + 1) % 25 == 0:
            print(f'[{i + 1}/{len(todo)}] {artist[:20]} — {title[:24]} → '
                  f'{rec["status"]}', flush=True)
        time.sleep(1.05)   # ~57 req/min, prudent (limite officielle non publiée)


def report():
    done = done_keys()
    st = Counter()
    ex = {'found': [], 'lax': [], 'ambiguous': []}
    for r in done.values():
        st[r['status']] += 1
        if r['status'] in ex and len(ex[r['status']]) < 8:
            ex[r['status']].append(
                f'  {r["artist"]} — {r["title"]} → {r.get("year") or r.get("years")}')
    print(f'=== RAPPORT BEATPORT ({len(done)} clés valides) ===')
    print(dict(st))
    for kind, rows in ex.items():
        if rows:
            print(f'— {kind} —')
            print('\n'.join(rows))


if __name__ == '__main__':
    if '--report' in sys.argv:
        report()
    else:
        mx = None
        for arg in sys.argv[1:]:
            if arg.startswith('--max-seconds='):
                mx = int(arg.split('=')[1])
        run(mx)
