#!/usr/bin/env python3
"""Collecte des années manquantes — MusicBrainz (1 req/s) puis Deezer. LECTURE SEULE
sur le corpus : n'écrit que dans le cache de résultats.

- Source : data/cache.json (côtés source/epars) → fichiers sans année.
- Clés (artiste, titre) parsées des noms, dédupliquées.
- MusicBrainz d'abord (1 req/s, UA conforme), Deezer en relais (sans clé).
- Garde : durée du candidat ±15 s d'UNE des durées connues de la clé ;
  compatibilité artiste/titre par tokens NORMALISÉS (casse/accents) ;
  homonymes → ambigu (années candidates).
- Résultats incrémentaux : data/year_cache.jsonl (reprise : clés déjà présentes sautées).
- Rapport : ./venv/bin/python scripts/collect_years.py --report

À lancer depuis la racine du projet : ./venv/bin/python scripts/collect_years.py [--max-seconds=N]
"""
import json, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error
from collections import Counter, defaultdict

CACHE = 'data/cache.json'
PROG = 'data/year_cache.jsonl'
MB_UA = 'audio-sync-tool/0.1 ( https://github.com/giak/audio-sync-tool )'
DZ_UA = 'audio-sync-tool/0.1'

NOISE = re.compile(
    r"\b(remix|remaster(ed)?|edit|version|mix|hq|hd|official|video|audio|lyrics?|"
    r"feat\.?|ft\.?|radio|single|album|club|extended|original|instrumental|acoustic|"
    r"live|vol\.?\s*\d*|volume)\b", re.I)


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def artist_title(fn):
    """Parser corrigé (validé sur le corpus) : crochets d'en-tête, tirets non
    espacés, numéros de piste, underscores. Retourne (artiste|None, titre)."""
    n = strip_accents(fn.rsplit('.', 1)[0].lower())
    m = re.match(r'^\s*(?:\(\d{1,3}\))?\s*\[([^\]]+)\]\s*(.+)$', n)
    if m:  # '(03) [manu kenton] access' → artiste entre crochets
        return NOISE.sub(' ', m.group(1)).strip(), NOISE.sub(' ', m.group(2)).strip()
    n = re.sub(r'^\s*\d{1,3}[\s._-]+', '', n)          # '07 - ', '01. '
    n = re.sub(r'\([^)]*\)', ' ', n)
    n = re.sub(r'\[[^\]]*\]', ' ', n)
    n = n.replace('_', ' ')                             # underscores → espaces
    if ' - ' in n:
        segs = n.split(' - ')
    elif n.count('-') == 1:
        segs = re.split(r'\s*-\s*', n)
    else:
        segs = [n]
    segs = [re.sub(r'[-_.]+', ' ', s) for s in segs]
    segs = [re.sub(r'\s+', ' ', s).strip() for s in segs]
    segs = [s for s in segs if s and not re.fullmatch(r'\d{1,3}', s)]
    if not segs:
        return None, None
    if len(segs) >= 2:
        a, t = segs[0], segs[-1]
    else:
        t = re.sub(r'^\d{1,4}\s+', '', segs[0])
        m2 = re.match(r'^(.{2,40}?)\s+-\s+(.+)$', t)
        if m2:
            a, t = m2.group(1), m2.group(2)
        else:
            a = None
    a = re.sub(r'^\d{1,4}\s+', '', a) if a else None    # '420 david strasser' → 'david strasser'
    return (NOISE.sub(' ', a).strip() if a else None), NOISE.sub(' ', t).strip()


def tokens(s):
    """Tokens normalisés (minuscule, sans accents, >1 char)."""
    s = strip_accents((s or '').lower())
    return set(w for w in s.split() if len(w) > 1)


def tok_compat(a, b):
    if not a or not b:
        return False
    ta, tb = tokens(a), tokens(b)
    return bool(ta & tb)


def get(url, ua, timeout=15, retries=3):
    delays = [5, 15, 30]
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': ua})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < retries:
                time.sleep(delays[min(attempt, len(delays) - 1)])
                continue
            raise
        except Exception:
            if attempt < retries:
                time.sleep(delays[min(attempt, len(delays) - 1)])
                continue
            raise
    raise RuntimeError('unreachable')


def load_keys():
    keys = defaultdict(lambda: {'n': 0, 'durs': set()})
    total_files, noyear = 0, 0
    with open(CACHE) as f:
        cache = json.load(f)
    for side in ('source', 'epars'):
        for base, files in cache.get(side, {}).items():
            for fn, meta in files.items():
                total_files += 1
                if meta.get('year'):
                    continue
                noyear += 1
                a, t = artist_title(fn)
                if not t:
                    continue
                k = f'{a or ""}\t{t}'
                keys[k]['n'] += 1
                if meta.get('duration'):
                    keys[k]['durs'].add(meta['duration'])
    return total_files, noyear, keys


def done_keys():
    done = {}
    try:
        with open(PROG) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                done[rec['key']] = rec
    except FileNotFoundError:
        pass
    return done


class Pacer:
    """Rate-limit global : ≥1.05 s entre deux appels MusicBrainz."""

    def __init__(self, min_interval):
        self.min = min_interval
        self.last = 0.0

    def wait(self):
        now = time.monotonic()
        d = now - self.last
        if d < self.min:
            time.sleep(self.min - d)
        self.last = time.monotonic()


def mb_lookup(a, t, durs, pacer):
    """MusicBrainz recording search → ('found'|'ambiguous'|'none', year, years).
    Les gardes artiste/titre/durée ne portent que sur les records AVEC année
    (un record sans first-release-date n'est pas une réponse)."""
    qq = f'recording:"{t}"' + (f' AND artist:"{a}"' if a else '')
    url = ('https://musicbrainz.org/ws/2/recording/?query=' +
           urllib.parse.quote(qq) + '&fmt=json&limit=8')
    pacer.wait()
    r = get(url, MB_UA)
    years, seen_titles = [], []
    for rec in r.get('recordings', [])[:8]:
        rartist = ' '.join(ac.get('artist', {}).get('name', '')
                           for ac in rec.get('artist-credit', []))
        if a and not tok_compat(a, rartist):
            continue
        rtitle = rec.get('title', '')
        if not tok_compat(t, rtitle):
            continue
        frd = rec.get('first-release-date') or ''
        if not frd:
            continue
        ln = rec.get('length')
        if ln and durs and abs(ln / 1000 - min(durs, key=lambda d: abs(d - ln / 1000))) > 15:
            continue
        years.append(frd[:4])
        seen_titles.append(f'{rartist} — {rtitle}')
    if not years:
        return 'none', None, []
    distinct = sorted(set(years))
    if len(distinct) == 1:
        return 'found', distinct[0], seen_titles[:3]
    return 'ambiguous', None, distinct


def dz_candidates(a, t):
    """Recherche Deezer : filtres stricts puis texte libre. Retourne items."""
    tries = []
    if a:
        tries.append(f'artist:"{a}" track:"{t}"')
        tries.append(f'{a} {t}')
    else:
        tries.append(t)
    for q in tries:
        url = 'https://api.deezer.com/search?q=' + urllib.parse.quote(q) + '&limit=5'
        s = get(url, DZ_UA, timeout=10)
        items = s.get('data') or []
        if items:
            return items
        time.sleep(0.3)
    return []


def dz_lookup(a, t, durs):
    """Deezer → ('found'|'ambiguous'|'none', year, years)."""
    items = dz_candidates(a, t)
    passing = []
    for it in items:
        if durs and abs(it['duration'] - min(durs, key=lambda d: abs(d - it['duration']))) > 15:
            continue
        passing.append(it)
    if not passing:
        return 'none', None, []
    years = []
    for it in passing[:3]:
        alb = get(f"https://api.deezer.com/album/{it['album']['id']}", DZ_UA, timeout=10)
        rd = alb.get('release_date')
        if rd:
            years.append(rd[:4])
        time.sleep(0.3)
    if not years:
        return 'none', None, []
    distinct = sorted(set(years))
    if len(distinct) == 1:
        return 'found', distinct[0], []
    return 'ambiguous', None, distinct


def lookup(a, t, durs, pacer):
    """MB d'abord ; Deezer en relais si MB ne conclut pas."""
    try:
        st, year, years = mb_lookup(a, t, durs, pacer)
        if st == 'found':
            return {'status': 'found', 'source': 'musicbrainz', 'year': year,
                    'years': years}
        if st == 'ambiguous':
            return {'status': 'ambiguous', 'source': 'musicbrainz', 'year': None,
                    'years': years}
    except Exception as e:
        err = f'{type(e).__name__}: {e}'[:80]
    else:
        err = None
    try:
        dz = dz_lookup(a, t, durs)
    except Exception as e2:
        out = {'status': 'error', 'source': None, 'year': None, 'years': []}
        if err:
            out['mb_error'] = err
        out['dz_error'] = f'{type(e2).__name__}: {e2}'[:80]
        return out
    if dz[0] == 'found':
        out = {'status': 'found', 'source': 'deezer', 'year': dz[1], 'years': dz[2]}
    elif dz[0] == 'ambiguous':
        out = {'status': 'ambiguous', 'source': 'deezer', 'year': None, 'years': dz[2]}
    else:
        out = {'status': 'none', 'source': None, 'year': None, 'years': []}
    if err:
        out['mb_error'] = err
    return out


def run(max_seconds=None):
    t0 = time.monotonic()
    total, noyear, keys = load_keys()
    done = done_keys()
    todo = [k for k in keys if k not in done]
    print(f'fichiers={total} sans_annee={noyear} cles={len(keys)} '
          f'deja_faites={len(done)} a_traiter={len(todo)}', flush=True)
    pacer = Pacer(1.05)
    with open(PROG, 'a') as out:
        for i, k in enumerate(todo):
            if max_seconds and time.monotonic() - t0 > max_seconds:
                print(f'budget atteint après {i} clés — reprise possible', flush=True)
                return
            a, t = (k.split('\t')[0] or None), k.split('\t')[1]
            meta = keys[k]
            res = lookup(a, t, meta['durs'], pacer)
            rec = {'key': k, 'artist': a, 'title': t, 'n_files': meta['n'], **res}
            out.write(json.dumps(rec, ensure_ascii=False) + '\n')
            out.flush()
            if (i + 1) % 50 == 0:
                print(f'[{i + 1}/{len(todo)}] {a or "?"} — {t} → {res["status"]}',
                      flush=True)


def report():
    total, noyear, keys = load_keys()
    done = done_keys()
    todo = [k for k in keys if k not in done]
    st_keys, st_files = Counter(), Counter()
    src_counter, year_hist = Counter(), Counter()
    amb, none_l, err_l = [], [], []
    for k, rec in done.items():
        n = rec.get('n_files', 1)
        st_keys[rec['status']] += 1
        st_files[rec['status']] += n
        if rec.get('source'):
            src_counter[rec['source']] += 1
        if rec['status'] == 'found':
            year_hist[rec['year']] += n
        elif rec['status'] == 'ambiguous':
            amb.append(rec)
        elif rec['status'] == 'none':
            none_l.append(rec)
        else:
            err_l.append(rec)
    amb.sort(key=lambda r: -r.get('n_files', 0))
    none_l.sort(key=lambda r: -r.get('n_files', 0))
    files_done = sum(st_files.values())
    print('=== RAPPORT COLLECTE ANNÉES (partiel si reste > 0) ===')
    print(f'fichiers sans année : {noyear} ; clés uniques : {len(keys)} ; '
          f'interrogées : {len(done)} ; restantes : {len(todo)}')
    print(f'\nPar clés    : found={st_keys["found"]} ambiguous={st_keys["ambiguous"]} '
          f'none={st_keys["none"]} error={st_keys["error"]}')
    print(f'Par fichiers: found={st_files["found"]} ambiguous={st_files["ambiguous"]} '
          f'none={st_files["none"]} error={st_files["error"]} '
          f'(traités={files_done}/{noyear})')
    if files_done:
        print(f'Taux de couverture certaine : {100 * st_files["found"] / files_done:.0f}% '
              f'des traités, {100 * st_files["found"] / noyear:.0f}% du corpus sans année')
    print(f'Sources     : {dict(src_counter)}')
    if year_hist:
        print('\n— Répartition des années (fichiers) —')
        for y in sorted(year_hist):
            bar = '█' * max(1, round(year_hist[y] / max(year_hist.values()) * 40))
            print(f'  {y}  {year_hist[y]:5}  {bar}')
        decades = Counter()
        for y, n in year_hist.items():
            if y and len(y) == 4 and y.isdigit():
                decades[f'{y[:3]}0'] += n
        print('Par décennie:', dict(sorted(decades.items())))
    print(f'\n— Ambiguïtés : {st_keys["ambiguous"]} clés / {st_files["ambiguous"]} fichiers —')
    for r in amb[:12]:
        print(f'  [{r["n_files"]}f] {r["artist"] or "?"} — {r["title"]} → {r.get("years", [])}')
    print(f'\n— Non trouvés : {st_keys["none"]} clés / {st_files["none"]} fichiers —')
    for r in none_l[:12]:
        print(f'  [{r["n_files"]}f] {r["artist"] or "?"} — {r["title"]}')
    if err_l:
        print(f'\n— Erreurs : {len(err_l)} —')
        for r in err_l[:5]:
            print(f'  {r["artist"] or "?"} — {r["title"]} : {r.get("mb_error") or r.get("dz_error")}')


if __name__ == '__main__':
    if '--report' in sys.argv:
        report()
    else:
        mx = None
        for arg in sys.argv[1:]:
            if arg.startswith('--max-seconds='):
                mx = int(arg.split('=')[1])
        run(mx)
