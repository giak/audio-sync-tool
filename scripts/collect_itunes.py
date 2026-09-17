#!/usr/bin/env python3
"""Passe iTunes Search API sur les clés 'none' des passes MB/Deezer/Discogs —
LECTURE SEULE sur le corpus ; n'écrit que dans data/itunes_cache.jsonl
(reprise : clés présentes sautées, SAUF les erreurs → re-jetables au run suivant).

iTunes Search API : sans clé, « limited to approximately 20 calls per minute »
(doc Apple performance-partners.apple.com/search-api, vérifiée 2026-09-17) ;
entity=song → releaseDate (ISO 8601) + trackTimeMillis (ms).

Gardes :
- tokens artiste compatibles (intersection normalisée, cf. collect_years.tokens) ;
- tokens du titre de la requête INCLUS dans le titre du résultat (les versions
  remixées/longues peuvent ajouter des tokens, jamais en retrancher) ;
- strict : durée ±15 s d'UNE des durées connues de la clé → found ;
- lax : aucun strict mais une année unique parmi les compatibles tokens
  (durée non vérifiable — mix/édition) ;
- ambiguous : ≥ 2 années distinctes ; none : rien de compatible.

Cible : les ~1 806 fichiers dont la clé est 'none' dans year_cache.jsonl ET non
couverts par discogs_cache.jsonl.

Usage : ./venv/bin/python scripts/collect_itunes.py [--max-seconds=N] [--report]
À lancer depuis la racine du projet.
"""
import json, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

from collect_years import load_keys, tokens, Pacer
from collect_years import PROG as MB_PROG

PROG = 'data/itunes_cache.jsonl'
DG_PROG = 'data/discogs_cache.jsonl'
UA = 'audio-sync-tool/0.1'
PACER = Pacer(3.05)          # ≥3.05 s entre deux appels → ~19 req/min < 20


def get(url, timeout=15, retries=3):
    """GET iTunes avec pacer global ; retry sur 403 (throttle) et 5xx."""
    delays = [10, 30, 60]
    last = None
    for attempt in range(retries + 1):
        PACER.wait()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (403, 429, 502, 503) and attempt < retries:
                time.sleep(delays[min(attempt, len(delays) - 1)])
                continue
            raise
        except Exception:
            if attempt < retries:
                time.sleep(delays[min(attempt, len(delays) - 1)])
                continue
            raise
    raise last


def guard(item, artist, title):
    """Garde tokens : artiste compatible (intersection) si les deux côtés sont
    renseignés ; tokens du titre de la requête inclus dans ceux du résultat."""
    ta_q, tt_q = tokens(artist), tokens(title)
    ta_r, tt_r = tokens(item.get('artistName', '')), tokens(item.get('trackName', ''))
    if ta_q and ta_r and not (ta_q & ta_r):
        return False
    if tt_q and not tt_q <= tt_r:
        return False
    return True


def candidates(artist, title):
    """Requêtes successives jusqu'à obtenir des résultats ; items uniques par trackId."""
    tries = []
    if artist:
        tries.append(f'artist:"{artist}" track:"{title}"')
        tries.append(f'{artist} {title}')
    else:
        tries.append(title)
    seen, items = set(), []
    for q in tries:
        url = ('https://itunes.apple.com/search?term=' + urllib.parse.quote(q) +
               '&entity=song&limit=10')
        for it in get(url).get('results', []):
            ident = it.get('trackId')
            if ident and ident not in seen:
                seen.add(ident)
                items.append(it)
        if items:
            break
    return items


def lookup(artist, title, durs):
    """iTunes → dict de résultat : found (tokens+durée), lax (année unique,
    durée non vérifiable), ambiguous (≥ 2 années), none."""
    compat = [x for x in candidates(artist, title) if guard(x, artist, title)]
    if not compat:
        return {'status': 'none', 'source': None, 'year': None, 'years': []}

    def year_of(it):
        y = (it.get('releaseDate') or '')[:4]
        return y if y.isdigit() else None

    strict = []
    for it in compat:
        ln = it.get('trackTimeMillis')
        if ln and durs and abs(ln / 1000 - min(durs, key=lambda d: abs(d - ln / 1000))) <= 15:
            strict.append(it)
    years = sorted({y for y in map(year_of, strict) if y})
    if years:
        if len(years) == 1:
            return {'status': 'found', 'source': 'itunes', 'year': years[0],
                    'years': years}
        return {'status': 'ambiguous', 'source': 'itunes', 'year': None,
                'years': years}
    # Aucun strict : passe lax — tokens seuls, durée non vérifiable.
    years = sorted({y for y in map(year_of, compat) if y})
    if not years:
        return {'status': 'none', 'source': None, 'year': None, 'years': []}
    if len(years) == 1:
        return {'status': 'lax', 'source': 'itunes', 'year': years[0], 'years': years}
    return {'status': 'ambiguous', 'source': 'itunes', 'year': None, 'years': years}


def dg_resolved():
    """Clés où Discogs a déjà conclu (found/lax/ambiguous) — hors périmètre.
    none/error Discogs restent ciblés (pas de conclusion)."""
    resolved = set()
    try:
        with open(DG_PROG) as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    if r.get('status') in ('found', 'lax', 'ambiguous'):
                        resolved.add(r['key'])
    except FileNotFoundError:
        pass
    return resolved


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
    resolved = dg_resolved()
    targets = []
    with open(MB_PROG) as f:
        for line in f:
            r = json.loads(line)
            if (r['status'] == 'none' and r['key'] not in done
                    and r['key'] not in resolved):
                targets.append(r)
    print(f"clés introuvables (none MB/Deezer, non résolues Discogs) : "
          f"{len(targets)} (déjà faites : {len(done)} ;Discogs couvre : "
          f"{len(resolved)})", flush=True)
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
            print(f'[{i + 1}/{len(targets)}] {(artist or "?")[:20]} — '
                  f'{title[:24]} → {rec["status"]}', flush=True)


def report():
    done = done_keys()
    st_k, st_f = Counter(), Counter()
    examples = {'found': [], 'lax': [], 'ambiguous': []}
    for r in done.values():
        st_k[r['status']] += 1
        st_f[r['status']] += r.get('n_files', 1)
        if r['status'] in examples and len(examples[r['status']]) < 10:
            examples[r['status']].append(
                f'  [{r.get("n_files", 1)}f] {r["artist"] or "?"} — {r["title"]} '
                f'→ {r.get("year") or r.get("years")}')
    print(f'=== RAPPORT ITUNES ({len(done)} clés valides) ===')
    print(f'par clés    : {dict(st_k)}')
    print(f'par fichiers: {dict(st_f)}')
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
