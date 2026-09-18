#!/usr/bin/env python3
"""Passe Discogs d'appoint sur requêtes REFORMULÉES (EPIC-033 P1).

Les clés 'none' Discogs l'ont été avec la requête brute (artist= + track=)
: 0 résultat brut — la requête est le problème, pas le catalogue. Cette
passe reformule la requête, mêmes gardes, cache séparé.

Reformulation (reform(), testée — cas issus du diagnostic réel des
1 531 introuvables, mémoire Mnemolite 023a51c9) :
  1. Junk-artiste (marqueur de face seul, vide, « unknown ») : la requête
     est découpée au PREMIER marqueur de face du champ titre —
     'b1 digitalism zdarlight' → artiste 'digitalism', titre 'zdarlight'.
  2. Marqueur de face en tête du champ artiste retiré
     ('b1 arkus p' → 'arkus p').
  3. Suffixes junk coupés ('freak ktmp3' → 'freak', 'www …' enlevé).

Journal : data/discogs_reform_cache.jsonl — chaque ligne porte la requête
envoyée ('query') : une clé pourra être re-formulée autrement plus tard
sans écraser l'historique. Reprise : clés présentes sautées, lignes
'error' re-jetables (comme collect_discogs.py). LECTURE SEULE sur le corpus.

Usage : ./venv/bin/python scripts/collect_discogs_reform.py
        [--max-seconds=N] [--limit=N] [--report] — depuis la racine.
"""
import argparse
import json
import re
import time

from collect_discogs import dg_get, guard, lookup
from collect_years import load_keys, tokens
from collect_years import PROG as MB_PROG

PROG = 'data/discogs_reform_cache.jsonl'
DG_PROG = 'data/discogs_cache.jsonl'
IT_PROG = 'data/itunes_cache.jsonl'

# Marqueur de face comme champ artiste ENTIer : a1…d9, aa, bb
SIDE_MARKER = re.compile(r'^(?:[a-d][1-9]|aa|bb)$', re.I)
# Marqueur de face comme token, à retirer/découper ('a1', 'a 1', 'b1'…)
SIDE_TOKEN = re.compile(r'\b(?:[a-d][\s._-]?[1-9]|aa|bb)\b', re.I)
# Marqueur de face en TÊTE d'un champ (à retirer : 'b1 real jack' → 'real jack')
LEAD_MARKER = re.compile(r'^(?:[a-d][\s._-]?[1-9]|aa|bb)[\s._-]+', re.I)
# Numéro de matrice/catalogue en tête de champ ('128609 feieralarm…')
LEAD_NUM = re.compile(r'^\d{1,6}[\s._-]+')
# Suffixes junk : indices de rip / annonce de site
JUNK = re.compile(r'(?:\bktmp3\b|\bwww\b.*|\S+\.(?:org|com|net|fr)\b'
                  r'|\bvinyl\b|\bwebrip\b|\bfull\s+vinyl\b)', re.I)

JUNK_ARTIST_WORDS = ('unknown', 'inconnu', 'untitled', 'untitle')


def _junk_artist(a):
    a = a.strip().lower()
    return (not a or SIDE_MARKER.match(a) or len(a) <= 2
            or any(w in a for w in JUNK_ARTIST_WORDS))


def reform(artist, title):
    """(artiste, titre) d'origine → requête Discogs reformulée (artiste, titre)."""
    a, t = artist.strip(), title.strip()

    # 1) Junk-artiste : découpe du champ titre au premier marqueur de face,
    #    1er mot du reste = artiste (sonde validée : 'b1 digitalism zdarlight'
    #    → digitalism / zdarlight) ; un seul mot → requête titre-seul
    if _junk_artist(a):
        m = SIDE_TOKEN.search(t)
        if m:
            rest = t[m.end():].strip()
            words = rest.split()
            if len(words) >= 2:
                a2, t2 = words[0], ' '.join(words[1:])
            else:
                a2, t2 = '', rest
        else:
            a2, t2 = '', t
    else:
        a2 = SIDE_TOKEN.sub(' ', a)          # 2) 'b1 arkus p' → 'arkus p'
        t2 = t

    # 2bis) marqueur de face en tête de titre, tous chemins
    t2 = LEAD_MARKER.sub('', t2)
    # 2ter) numéro de matrice/catalogue en tête de titre ('128609 feieralarm…')
    t2 = LEAD_NUM.sub('', t2)

    # 3) Suffixes junk + espaces
    t2 = JUNK.sub(' ', t2)
    return a2.strip(), ' '.join(t2.split()).strip()


def targets(year_path=MB_PROG, discogs_path=DG_PROG, itunes_path=IT_PROG,
            keys=None):
    """Clés introuvables toutes sources confondues (aucun statut concluant
    dans year_cache / discogs / itunes), avec n de fichiers et durées."""
    def last_wins(path):
        last = {}
        try:
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        r = json.loads(line)
                        last[r['key']] = r
        except FileNotFoundError:
            pass
        return last

    pools = [last_wins(p) for p in (year_path, discogs_path, itunes_path)]
    unclaimed = {k for k in set.union(*[set(p) for p in pools])
                 if not any(p.get(k, {}).get('status') in ('found', 'lax',
                                                           'ambiguous')
                            for p in pools)}
    if keys is None:
        _, _, keys = load_keys()
    return [(k, keys[k]['n'], keys.get(k, {}).get('durs', set()))
            for k in sorted(unclaimed) if k in keys]


def done_keys():
    """Reprise : lignes valides, 'error' re-jetables (idem collect_discogs)."""
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


def _append(rec):
    with open(PROG, 'a') as f:
        f.write(json.dumps(rec, ensure_ascii=False) + '\n')


def run(max_seconds=None, limit=None):
    t0 = time.monotonic()
    done = done_keys()
    todo = [(k, n, durs) for k, n, durs in targets() if k not in done]
    if limit:
        todo = todo[:limit]
    print(f"clés introuvables reformulables : {len(todo)} "
          f"(déjà faites : {len(done)})", flush=True)
    if not todo:
        return
    for i, (key, n, durs) in enumerate(todo):
        if max_seconds and time.monotonic() - t0 > max_seconds:
            print(f'budget atteint après {i} clés — reprise possible', flush=True)
            return
        artist, title = key.split('\t', 1)
        ra, rt = reform(artist, title)
        rec = {'key': key, 'artist': artist, 'title': title, 'n_files': n,
               'query': f'{ra} — {rt}'.strip(' —'), 'status': 'none',
               'source': 'reform', 'year': None, 'years': []}
        if not tokens(rt):                 # requête sans titre : aucun espoir
            _append(rec)
            continue
        try:
            res = lookup(ra, rt, durs)     # gardes identiques (tokens + ±15 s)
            if res.get('status') in ('found', 'lax', 'ambiguous'):
                # marque reform : n'écrase jamais le cache d'origine
                res['source'] = f"reform_{res.get('source') or 'discogs'}"
            rec.update(res)
        except Exception as e:
            rec.update(status='error', years=[f'{type(e).__name__}: {e}'[:80]])
        _append(rec)
        if (i + 1) % 25 == 0:
            print(f'[{i + 1}/{len(todo)}] {ra[:20]} — {rt[:24]} → '
                  f'{rec["status"]}', flush=True)
        time.sleep(1.05)                   # ~57 req/min < 60 (règle Discogs)


def report():
    done = done_keys()
    st = {}
    for r in done.values():
        st[r['status']] = st.get(r['status'], 0) + 1
    print(f'=== RAPPORT DISCOGS REFORM ({len(done)} clés valides) ===')
    print(dict(st))
    for kind in ('found', 'lax', 'ambiguous'):
        ex = [r for r in done.values() if r['status'] == kind][:8]
        if ex:
            print(f'— {kind} —')
            for r in ex:
                print(f'  [{r.get("query", "")}] → '
                      f'{r.get("year") or r.get("years")}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--max-seconds', type=int, default=None)
    ap.add_argument('--limit', type=int, default=None)
    ap.add_argument('--report', action='store_true')
    args = ap.parse_args()
    if args.report:
        report()
    else:
        run(args.max_seconds, args.limit)
