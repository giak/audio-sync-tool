#!/usr/bin/env python3
"""Audit des années DÉJÀ écrites par les sources à sémantique « édition ».

Contexte (EPIC-040) : la première passe de collecte écrivait l'année de la
première source qui concluait. Deezer n'avait aucune garde artiste/titre et son
`release_date` est celle de l'ALBUM MATCHÉ — donc d'une RÉÉDITION. Cas fondateur :
Phantasia « Inner Light » (1991, R&S) écrit en 2024 parce que Deezer a matché
l'album « Ooo » (2024-01-15). 408 écritures Deezer, dont 173 ≥ 2015 (42 %).

Ce script reprend chaque écriture `source=deezer` (+ autres sources « édition »
via --sources) du journal, rejoue le moteur CORRIGÉ (garde tokens, deux
orientations de clé, MusicBrainz + Deezer + Discogs) et classe :

  confirme     l'année écrite est corroborée par une source « première sortie »
  contredit    une source « première sortie » dit autre chose → proposition
  non_verifie  aucune source « première sortie » ne parle (Deezer seul, ou rien)

LECTURE SEULE par défaut : le rapport et `data/year_audit.json` sont écrits,
aucun tag n'est touché. `--apply` n'écrit que les `contredit` (journal = backup,
`apply_years.py --undo` restaure l'ancienne valeur).

Usage (racine du projet) :
  ./venv/bin/python scripts/audit_applied_years.py [--limit N] [--sources=deezer,itunes]
  ./venv/bin/python scripts/audit_applied_years.py --apply --only=contredit
"""
import argparse
import json
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apply_years import JOURNAL, current_year, journal_append, write_year  # noqa: E402
from collect_years import (CACHE, Pacer, artist_title, lookup,  # noqa: E402
                           tags_artist_title)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIT_PATH = os.path.join(ROOT, 'data', 'year_audit.json')
# Sources dont l'année est la date de l'ÉDITION matchée (donc suspecte d'être une
# réédition) : ce sont celles à re-vérifier. Les sources « première sortie »
# (musicbrainz, discogs) ne sont pas auditées ici.
EDITION_SOURCES = ('deezer', 'itunes', 'beatport_strict', 'youtube_topic_strict',
                   'reform_strict', 'reform2_strict')
FIRST_SOURCES = ('musicbrainz', 'discogs')


def load_writes(sources):
    """Dernière écriture OK par chemin, filtrée sur les sources d'édition."""
    last = {}
    with open(JOURNAL) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            if e.get('ok') and e.get('source') in sources:
                last[e['path']] = e
    return last


def load_durations():
    """{chemin absolu: durée} depuis le scan (garde durée du moteur)."""
    with open(CACHE) as f:
        cache = json.load(f)
    durs = {}
    for side in ('source', 'epars'):
        for base, files in cache.get(side, {}).items():
            for fn, meta in files.items():
                rel = meta.get('path')
                if rel and meta.get('duration'):
                    durs[os.path.join(base, rel)] = meta['duration']
    return durs


def classify(applied, rec):
    """(statut, proposition, motif) pour une année écrite face au moteur.

    On ne propose un changement que sur la SIGNATURE DE RÉÉDITION : l'année
    écrite vient d'une source « édition » et une source « première sortie »
    annonce une année ANTÉRIEURE (1991 vs l'album « Ooo » de 2024).
    Un désaccord sans cette signature va en revue SANS proposition : c'est le cas
    d'un remix ou d'une édition tardive du même morceau (« Stompbox (Spor
    Remix) » écrit 2007, MusicBrainz 2012) — la logique « le plus ancien =
    l'original » n'y tient pas, seule la revue humaine tranche.
    """
    sources = rec.get('sources') or {}
    first = {p: y for p, y in sources.items() if p in FIRST_SOURCES}
    applied = str(applied)
    if first:
        years = set(first.values())
        if applied in years:
            return 'confirme', applied, f"première sortie confirmée par {sorted(first)}"
        proposed = min(first.values(), key=int)
        detail = ', '.join(f'{p}={y}' for p, y in sorted(sources.items()))
        if applied.isdigit() and int(proposed) < int(applied):
            return ('contredit', proposed,
                    f'écrit {applied} (édition) mais sortie d\'origine {proposed} '
                    f'[{detail}]')
        return ('a_revoir', None,
                f'écrit {applied} ; désaccord sans signature de réédition [{detail}]')
    if sources:
        return ('non_verifie', None,
                'seule une source « édition » parle : ' + ', '.join(
                    f'{p}={y}' for p, y in sorted(sources.items())))
    if rec.get('candidates'):
        return ('non_verifie', None,
                'aucune source concluante (candidates : '
                + '/'.join(rec['candidates'][:6]) + ')')
    return 'non_verifie', None, 'aucune source'


def audit(sources, limit=None, report_every=25, match=None):
    writes = load_writes(sources)
    durs = load_durations()
    paths = sorted(writes)
    if match:
        needle = match.lower()
        paths = [p for p in paths if needle in p.lower()]
    if limit:
        paths = paths[:limit]
    print(f'audit de {len(paths)} écritures (sources : {", ".join(sources)})',
          flush=True)
    pacer = Pacer(1.05)
    memo = {}
    out, stats = {}, Counter()
    for i, path in enumerate(paths):
        e = writes[path]
        rel = os.path.basename(path)
        a, t = artist_title(rel)
        # Les tags du fichier tranchent l'ordre artiste/titre quand le nom est
        # ambigu ou collé (EPIC-040) : ils sont essayés en premier par le moteur.
        id3 = tags_artist_title(path) if os.path.exists(path) else (None, None)
        alt = id3 if all(id3) else None
        applied = str(e.get('new'))[:4]
        if not t:
            out[path] = {'applied': applied, 'status': 'non_verifie',
                         'reason': 'nom de fichier illisible'}
            stats['non_verifie'] += 1
            continue
        key = (a or '') + '\t' + t + ('\t' + alt[0] if alt else '')
        if key not in memo:
            try:
                memo[key] = lookup(a or None, t, {durs[path]} if path in durs else set(),
                                   pacer, alt=alt)
            except Exception as ex:
                memo[key] = {'status': 'error', 'sources': {},
                             'errors': [f'{type(ex).__name__}: {ex}'[:90]]}
        rec = memo[key]
        status, proposed, reason = classify(applied, rec)
        out[path] = {'applied': applied, 'status': status, 'proposed': proposed,
                     'reason': reason, 'sources': rec.get('sources') or {},
                     'candidates': rec.get('candidates') or [],
                     'evidence': rec.get('evidence') or [],
                     'variant': rec.get('variant')}
        stats[status] += 1
        if (i + 1) % report_every == 0:
            print(f'[{i + 1}/{len(paths)}] {dict(stats)}', flush=True)
            save(out)
    save(out)
    return out, stats


def save(out):
    os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
    with open(AUDIT_PATH, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1, sort_keys=True)


def apply_corrections(out, only=('contredit',), dry=True):
    """Écrit les propositions du rapport. Journal = backup (old → new)."""
    items = [(p, d) for p, d in sorted(out.items())
             if d.get('status') in only and d.get('proposed')]
    ok = skip = err = 0
    print(f'{len(items)} corrections à appliquer ({", ".join(only)})'
          + ('' if not dry else ' — DRY-RUN'))
    for p, d in items:
        try:
            if not os.path.exists(p):
                skip += 1
                print('MANQUANT   ', p, flush=True)
                continue
            cur = current_year(p)
            if cur != d['applied']:
                skip += 1
                print(f'INCHANGE DEPUIS L\'AUDIT ({cur}) {p}', flush=True)
                continue
            if dry:
                print(f"  {p}\n     {d['applied']} → {d['proposed']}  ({d['reason']})",
                      flush=True)
                continue
            frame = write_year(p, d['proposed'])
            check = current_year(p)
            journal_append({'path': p, 'old': d['applied'], 'new': d['proposed'],
                            'source': 'audit:' + '+'.join(sorted(d['sources'])),
                            'frame': frame, 'ok': check == d['proposed']})
            if check == d['proposed']:
                ok += 1
            else:
                err += 1
                print('ECHEC VERIF', p, flush=True)
        except Exception as ex:
            err += 1
            print('ERREUR     ', p, ':', ex, flush=True)
    if not dry:
        print(f'== AUDIT APPLY : ok={ok} skip={skip} err={err}')
    return ok, skip, err


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sources', default='deezer',
                    help='sources du journal à auditer (défaut : deezer)')
    ap.add_argument('--limit', type=int, default=None)
    ap.add_argument('--match', default=None,
                    help='ne traiter que les chemins contenant cette chaîne')
    ap.add_argument('--report', action='store_true', help='rapport du dernier audit')
    ap.add_argument('--apply', action='store_true',
                    help='appliquer les corrections du rapport (dry-run sans --yes)')
    ap.add_argument('--yes', action='store_true',
                    help='écrire réellement les corrections')
    ap.add_argument('--only', default='contredit',
                    help='statuts à corriger (défaut : contredit)')
    args = ap.parse_args()

    if args.report:
        out = json.load(open(AUDIT_PATH))
        stats = Counter(d['status'] for d in out.values())
        print(f'{len(out)} entrées : {dict(stats)}')
        for status in ('contredit', 'confirme'):
            rows = [(p, d) for p, d in sorted(out.items()) if d['status'] == status]
            print(f'\n— {status} ({len(rows)}) —')
            for p, d in rows[:15]:
                print(f"  {d['applied']} → {d.get('proposed') or '—':5} "
                      f"{os.path.basename(p)}\n      {d['reason']}")
        return

    if args.apply:
        out = json.load(open(AUDIT_PATH))
        only = tuple(x.strip() for x in args.only.split(',') if x.strip())
        apply_corrections(out, only=only, dry=not args.yes)
        return

    sources = tuple(x.strip() for x in args.sources.split(',') if x.strip())
    out, stats = audit(sources, args.limit, match=args.match)
    print(f'\n=== AUDIT : {dict(stats)} (détail dans {AUDIT_PATH}) ===')
    for status in ('contredit', 'a_revoir', 'confirme', 'non_verifie'):
        rows = [(p, d) for p, d in sorted(out.items()) if d['status'] == status]
        print(f'\n— {status} : {len(rows)} —')
        for p, d in rows[:12]:
            print(f"  {d['applied']} → {d.get('proposed') or '—':5} {os.path.basename(p)}")
            print(f"      {d['reason']}{' | ' + json.dumps(d['sources'], ensure_ascii=False) if d['sources'] else ''}")


if __name__ == '__main__':
    main()
