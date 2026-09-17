#!/usr/bin/env python3
"""Passe Discogs sur les clés 'none' du cache MB/Deezer — LECTURE SEULE sur le
corpus ; n'écrit que dans data/discogs_cache.jsonl (reprise : clés présentes
sautées, SAUF les erreurs → re-jetables au run suivant).

Prérequis : token Discogs dans data/discogs_token (chmod 600, git-ignoré).
Usage : ./venv/bin/python scripts/collect_discogs.py [--max-seconds=N] [--report]
À lancer depuis la racine du projet.
"""
import json, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

from collect_years import load_keys, tokens
from collect_years import PROG as MB_PROG

PROG = 'data/discogs_cache.jsonl'
TOKEN_FILE = 'data/discogs_token'
UA = 'audio-sync-tool/0.1 ( https://github.com/giak/audio-sync-tool )'


def dg_get(url):
    """GET Discogs avec token ; retry sur 502/503, respect de Retry-After sur 429."""
    with open(TOKEN_FILE) as f:
        token = f.read().strip()
    delays = [2, 10, 30]
    last = None
    for attempt in range(len(delays) + 1):
        req = urllib.request.Request(url, headers={
            'Authorization': f'Discogs token={token}', 'User-Agent': UA})
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


def split_rt(rt):
    """'Artist - Title' (résultat search) → (artiste, titre) : split au 1er ' - '."""
    parts = rt.split(' - ', 1)
    return (parts[0], parts[1]) if len(parts) == 2 else ('', rt)


def guard(result, artist, title):
    """Garde tokens : artiste ET titre compatibles avec la requête."""
    ra, rt_ = split_rt(result.get('title', ''))
    ta_q, tt_q = tokens(artist), tokens(title)
    ta_r, tt_r = tokens(ra), tokens(rt_)
    if ta_q and ta_r and not (ta_q & ta_r):
        return False
    if tt_q and tt_r and not (tt_q & tt_r):
        return False
    return True


def track_duration(master, title, durs):
    """Durée du morceau dans la tracklist du master (±15 s d'une durée connue).
    Retourne None si absent/lacunaire — la tracklist Discogs est incomplète (~30 %)."""
    qt = tokens(title)
    for tr in master.get('tracklist', []):
        dt = tr.get('duration') or ''
        if not re.fullmatch(r'\d{1,2}:\d{2}', dt):
            continue
        tt = tokens(tr.get('title', ''))
        if qt and tt and len(qt & tt) >= max(1, len(qt) // 2):
            mm, ss = dt.split(':')
            sec = int(mm) * 60 + int(ss)
            if durs and any(abs(sec - d) <= 15 for d in durs):
                return sec
    return None


def search(artist, title):
    q = urllib.parse.urlencode({'artist': artist, 'track': title, 'per_page': 5})
    return dg_get(f'https://api.discogs.com/database/search?{q}')


def lookup(artist, title, durs):
    """Discogs → dict de résultat : found (tokens+durée), lax (année unique,
    durée non vérifiable), ambiguous (≥ 2 années), none."""
    data = search(artist, title)
    compat = [x for x in data.get('results', []) if guard(x, artist, title)]
    years = sorted({str(x['year']) for x in compat if x.get('year')})
    if not compat:
        return {'status': 'none', 'source': None, 'year': None, 'years': []}
    if len(years) == 1:
        first = compat[0]
        mid = first.get('master_id') if first.get('type') == 'release' else first.get('id')
        sec = None
        if mid:
            try:
                sec = track_duration(dg_get(f'https://api.discogs.com/masters/{mid}'),
                                     title, durs)
            except Exception:
                sec = None
        if sec is not None:
            return {'status': 'found', 'source': 'discogs_strict', 'year': years[0],
                    'years': [years[0]]}
        return {'status': 'lax', 'source': 'discogs', 'year': years[0],
                'years': [years[0]]}
    return {'status': 'ambiguous', 'source': 'discogs', 'year': None, 'years': years}


def done_keys():
    """Clés déjà traitées. Les lignes en 'error' sont ignorées → re-jetables."""
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
    total, noyear, keys = load_keys()
    done = done_keys()
    targets = []
    with open(MB_PROG) as f:
        for line in f:
            r = json.loads(line)
            if r['status'] == 'none' and r['artist'] and r['key'] not in done:
                targets.append(r)
    print(f"clés 'none' à traiter : {len(targets)} (déjà faites : {len(done)})",
          flush=True)
    if not targets:
        return
    for i, r in enumerate(targets):
        if max_seconds and time.monotonic() - t0 > max_seconds:
            print(f'budget atteint après {i} clés — reprise possible', flush=True)
            return
        artist, title = r['artist'], r['title']
        durs = keys.get(r['key'], {}).get('durs', set())
        rec = {'key': r['key'], 'artist': artist, 'title': title,
               'n_files': r['n_files'], 'status': 'none', 'source': None,
               'year': None, 'years': []}
        try:
            rec.update(lookup(artist, title, durs))
        except Exception as e:
            rec.update(status='error', years=[f'{type(e).__name__}: {e}'[:80]])
        with open(PROG, 'a') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        if (i + 1) % 25 == 0:
            print(f'[{i + 1}/{len(targets)}] {artist[:20]} — {title[:24]} → '
                  f'{rec["status"]}', flush=True)
        time.sleep(1.05)   # ~57 req/min < 60


def report():
    done = done_keys()
    st = Counter()
    examples = {'found': [], 'lax': [], 'ambiguous': []}
    for r in done.values():
        st[r['status']] += 1
        if r['status'] in examples and len(examples[r['status']]) < 10:
            examples[r['status']].append(
                f'  {r["artist"]} — {r["title"]} → {r.get("year") or r.get("years")}')
    print(f'=== RAPPORT DISCOGS ({len(done)} clés valides) ===')
    print(dict(st))
    for kind, ex in examples.items():
        if ex:
            print(f'— {kind} —')
            print('\n'.join(ex))


if __name__ == '__main__':
    if '--report' in sys.argv:
        report()
    else:
        mx = None
        for arg in sys.argv[1:]:
            if arg.startswith('--max-seconds='):
                mx = int(arg.split('=')[1])
        run(mx)
