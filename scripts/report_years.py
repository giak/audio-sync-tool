#!/usr/bin/env python3
"""Rapport consolidé des vagues de confiance, toutes sources d'années confondues —
LECTURE SEULE : fusionne year_cache.jsonl (MB/Deezer), discogs_cache.jsonl (strict
+ lax + ambiguous) et itunes_cache.jsonl, sans double comptage.

Priorité par clé : MB/Deezer d'abord (première collecte, sémantique 1ʳᵉ sortie),
puis Discogs, puis iTunes. La règle « consensus » d'apply_years.py est réutilisée
telle quelle : ambiguous avec toutes les candidates dans une fenêtre ≤ 2 ans →
certaine (1ʳᵉ sortie = min).

Une clé vaut pour tous les fichiers de la clé — `--files` rejoint data/cache.json
pour compter par fichier. Vagues identiques à apply_years.py :
- certaines  = found (toutes sources) + consensus ambiguous ≤ 2 ans (MB/Deezer
  uniquement — Discogs/iTunes ambiguous ont d'autres sémantiques) ;
- à revue    = ambiguous restantes (toutes sources) + lax (Discogs + iTunes) ;
- introuvable= status none partout, sans aucune conclusion d'aucune source.

Usage : ./venv/bin/python scripts/report_years.py [--files]
"""
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_years import artist_title, load_keys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'cache.json')
YEAR_CACHE = os.path.join(ROOT, 'data', 'year_cache.jsonl')
DG_CACHE = os.path.join(ROOT, 'data', 'discogs_cache.jsonl')
IT_CACHE = os.path.join(ROOT, 'data', 'itunes_cache.jsonl')


def last_valid(recs):
    """Dernier enregistrement valide d'une clé (ignore les lignes 'error')."""
    rec = None
    for r in recs:
        if r.get('status') == 'error':
            continue
        rec = r
    return rec


def load_all():
    """Clé → (résultat, source_pool). Priorité MB/Deezer > Discogs > iTunes :
    un pool ne revendique une clé que si son statut est concluant (found /
    ambiguous / lax) — un 'none' laisse la place au pool suivant."""
    pool_of = {}
    for path, pool in ((YEAR_CACHE, 'year_cache'), (DG_CACHE, 'discogs'),
                       (IT_CACHE, 'itunes')):
        by_key = defaultdict(list)
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    by_key[r['key']].append(r)
        for k, recs in by_key.items():
            if k in pool_of:
                continue
            rec = last_valid(recs)
            if rec and rec.get('status') != 'none':
                pool_of[k] = (pool, rec)
    return pool_of


def wave_of(pool, rec):
    """Vague de confiance d'un résultat consolidé (règle apply_years)."""
    st = rec.get('status')
    if st == 'found' and rec.get('year'):
        return 'certaines'
    if st == 'ambiguous':
        cands = [int(y) for y in rec.get('years', []) if str(y).isdigit()]
        if pool == 'year_cache' and len(cands) >= 2 and max(cands) - min(cands) <= 2:
            return 'certaines'
        return 'a_revue'
    if st == 'lax':
        return 'a_revue'
    return 'introuvables'


def main(files=False):
    pool_of = load_all()
    by_wave = Counter()
    by_src = Counter()
    years = Counter()
    review = defaultdict(list)
    if not files:
        # Univers complet des clés : une clé non revendiquée = introuvable.
        _, _, all_keys = load_keys()
        for k in all_keys:
            entry = pool_of.get(k)
            if entry is None:
                by_wave['introuvables'] += 1
                continue
            pool, rec = entry
            w = wave_of(pool, rec)
            by_wave[w] += 1
            by_src[(w, pool)] += 1
            if rec.get('year'):
                years[rec['year']] += 1
            if w == 'a_revue' and len(review['a_revue']) < 200:
                review['a_revue'].append((k, pool, rec))
    else:
        with open(CACHE) as f:
            cache = json.load(f)
        n_files = Counter()
        for side in ('source', 'epars'):
            for base, files_d in cache.get(side, {}).items():
                for fn, meta in files_d.items():
                    if meta.get('year'):
                        continue
                    a, t = artist_title(fn)
                    if not t:
                        n_files['sans_cle'] += 1
                        continue
                    key = (a or '') + '\t' + t
                    entry = pool_of.get(key)
                    if entry is None:
                        n_files['introuvables'] += 1
                        continue
                    pool, rec = entry
                    w = wave_of(pool, rec)
                    n_files[w] += 1
                    by_src[(w, pool)] += 1
                    if rec.get('year'):
                        years[rec['year']] += 1

    print('=== VAGUES CONSOLIDÉES (MB/Deezer → Discogs → iTunes) ===')
    if not files:
        print('(par clés ; lancez --files pour le décompte par fichiers)')
    else:
        print('(par fichiers sans année)')
    total = (n_files['certaines'] + n_files['a_revue'] + n_files['introuvables']) \
        if files else sum(by_wave.values())
    for w in ('certaines', 'a_revue', 'introuvables'):
        n = n_files[w] if files else by_wave[w]
        print(f'{w:12} : {n:5}  ({100 * n / total:.0f} %)')
    if files and n_files['sans_cle']:
        print(f'{"sans_cle":12} : {n_files["sans_cle"]:5}  (hors vagues — parsing)', 
              file=sys.stderr)
    print('\n— par source pool (clés) —')
    for w in ('certaines', 'a_revue', 'introuvables'):
        parts = {p: c for (ww, p), c in sorted(by_src.items()) if ww == w}
        print(f'{w:12} : {parts}')
    print(f'\nAnnées distinctes posées : {len(years)}')
    if years:
        top = years.most_common(8)
        print('plus fréquentes :', ', '.join(f'{y} ({n})' for y, n in top))

    if review['a_revue']:
        print(f'\n— échantillon à revue ({min(len(review["a_revue"]), 12)} affichés) —')
        for k, pool, rec in review['a_revue'][:12]:
            yr = rec.get('year') or rec.get('years') or []
            print(f'  [{rec.get("n_files", 1)}f] ({pool}) {k.replace(chr(9), " — ")} '
                  f'→ {yr}')


if __name__ == '__main__':
    main('--files' in sys.argv)
