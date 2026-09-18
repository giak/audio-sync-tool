#!/usr/bin/env python3
"""Passe Discogs d'appoint v2 — junk-artiste NUMÉRIQUE/SYMBOLE (EPIC-033).

La passe reform (v1) a couvert 1 530/1 531 clés introuvables : le résidu est
son lot de 'none' (1 396), dont ~556 à ARTISTE JUNK que v1 ne gérait pas :
numéro de matrice, n° de série, préfixes de rip ('#07 enzyme x — opbokken',
'2cb 006b1 tik tok', '204 — juan atkins - model 500', '2006 prodigy — outta
space'). L'info réelle est souvent APRÈS le premier token numérique/symbole.

Reformulation v2 (reform2(), testée sur les cas réels) :
  1. Junk-artiste numérique/symbole : les tokens junk de TÊTE de l'artiste
     ('#07', '2cb 006b1', '204', '2006', '######…') sont RETIRÉS — le reste
     de l'artiste est conservé ET LE TITRE EST PRÉSERVÉ ('2006 prodigy —
     outta space' → 'prodigy — outta space', '#07 enzyme x — opbokken' →
     'enzyme x — opbokken').
  2. Artiste vide/entièrement junk après retrait : découpe du titre au
     premier marqueur de face (règle v1 : 'b1 digitalism zdarlight' →
     digitalism / zdarlight).
  3. Règles v1 appliquées d'abord et ensuite (marqueurs en tête, suffixes
     junk) — v2 = v1 + retrait de préfixe, jamais l'inverse.

Interdit de re-requête identique (EPIC-033) : une clé dont la requête v2
serait IDENTIQUE à la requête que v1 a réellement envoyée (journalisée dans
son cache) est SKIPPÉE ; les clés déjà conclusives en v1 aussi.

Journal : data/discogs_reform2_cache.jsonl — requête journalisée ('query'),
comme v1. Reprise : clés présentes sautées, lignes 'error' re-jetables.

APERÇU PAR DÉFAUT : sans --go, le script n'interroge RIEN — décomptes par
règle + échantillon avant → après. --go lance le run réel.

Usage : ./venv/bin/python scripts/collect_discogs_reform2.py [--go]
        [--limit=N] [--report] — depuis la racine du projet.
"""
import argparse
import json
import re
import sys
import time
from collections import Counter

sys.path.insert(0, 'scripts')
from collect_discogs import lookup as dg_lookup
from collect_discogs_reform import (JUNK, LEAD_MARKER, LEAD_NUM, SIDE_TOKEN,
                                    _junk_artist, done_keys as v1_done_keys,
                                    reform as reform_v1,
                                    targets as v1_targets)
from collect_years import tokens

PROG = 'data/discogs_reform2_cache.jsonl'

# Préfixe '#' collé à un mot ('#07' → '07') ou seul
HASH_LEAD = re.compile(r'^#+(?=\w)|^#+$')
# Token de pure ponctuation/symboles ('######…')
PUNCT_ONLY = re.compile(r'^[\W_]+$')
# N° de série court : ≤ 4 caractères alphanumériques contenant un chiffre
# ('2cb', '006b1' a 5 → non ; '204', 'b1', '2cb' oui)
SERIAL = re.compile(r'^(?=\w*\d)\w{1,4}$', re.I)
# Année plausible isolée en tête ('2006')
YEAR = re.compile(r'^(19\d{2}|20[0-2]\d)$')


def junk_word(w):
    """Token junk de tête : '#…', symboles seuls, n° de série court, année,
    entier pur."""
    w0 = HASH_LEAD.sub('', w.lower())
    if not w0 or PUNCT_ONLY.match(w0):
        return True
    return bool(w0.isdigit() or SERIAL.match(w0))


def numeric_junk(artist):
    """Artiste junk NUMÉRIQUE/SYMBOLE : ne commence pas par une vraie lettre
    (hors retrait du '#')."""
    a = HASH_LEAD.sub('', artist.strip(), count=1).strip()
    if not a or not a[0].isalpha():
        return True
    first = a.split()[0].lower()
    return bool(PUNCT_ONLY.match(first) or SERIAL.match(first))


def strip_junk_prefix(artist):
    """Retire les tokens junk de TÊTE ; retourne (artiste_nettoyé, n_retirés).
    S'arrête au premier token non-junk."""
    words = artist.split()
    i = 0
    while i < len(words) and junk_word(words[i]):
        i += 1
    return ' '.join(words[i:]), i


def _norm(s):
    """Requête saine pour l'API : '=' → espace (Discogs 403 sinon, cf.
    'one phantasia=inner light'), espaces réduits."""
    return ' '.join(s.replace('=', ' ').split())


def reform2(artist, title):
    """(artiste, titre) → requête v2 (artiste, titre)."""
    a, t = reform_v1(artist, title)
    if not (_junk_artist(a) or numeric_junk(a)):
        return a, t
    # 1) retrait des tokens junk de tête de l'artiste, titre préservé
    a2, stripped = strip_junk_prefix(a)
    # une année retirée en tête ne compte pas comme info d'artiste perdue
    if a2 and stripped:
        years = sum(1 for w in a.split()[:stripped] if YEAR.match(w))
        t = LEAD_MARKER.sub('', t)
        t = LEAD_NUM.sub('', t)
        t = JUNK.sub(' ', t)
        return _norm(a2), _norm(t)
    # 2) artiste vide/entièrement junk : découpe v1 du titre
    m = SIDE_TOKEN.search(t)
    if m:
        rest = t[m.end():].strip()
        w = rest.split()
        if len(w) >= 2:
            a2, t2 = w[0], ' '.join(w[1:])
        elif rest:
            a2, t2 = '', rest
        else:
            a2, t2 = '', ''
        t2 = LEAD_MARKER.sub('', t2)
        t2 = LEAD_NUM.sub('', t2)
        t2 = JUNK.sub(' ', t2)
        return a2.strip(), _norm(t2).strip()
    return '', _norm(t)


# ── Ciblage / aperçu / run ─────────────────────────────────────────────────

def targets2():
    """Clés v2 : résidu v1_targets() moins les clés conclusives v1, moins les
    re-requêtes identiques (requête v2 == requête v1 réellement envoyée)."""
    v1 = v1_done_keys()
    todo = []
    for k, n, durs in v1_targets():
        v1_rec = v1.get(k)
        if v1_rec and v1_rec.get('status') in ('found', 'lax', 'ambiguous'):
            continue                     # déjà conclusif en v1
        artist, title = k.split('\t', 1)
        q1 = (v1_rec or {}).get('query') \
            if v1_rec else f"{reform_v1(*k.split(chr(9), 1))}"
        ra2, rt2 = reform2(artist, title)
        q2 = f'{ra2} — {rt2}'.strip(' —')
        if not q2 or q2 == q1:
            continue                     # rien de neuf ou re-requête interdite
        todo.append((k, q1 or '', q2, n, durs))
    return todo


def preview(limit=40):
    todo = targets2()
    rules = Counter()
    for k, q1, q2, n, durs in todo:
        artist = k.split('\t', 1)[0]
        a2, stripped = strip_junk_prefix(artist.strip())
        if a2 and stripped:
            rules['prefixe_retire_artiste'] += 1
        elif not artist.strip() or not a2:
            rules['split_titre_v1'] += 1
        else:
            rules['autre'] += 1
    print(f'clés où v2 change la requête : {len(todo)}')
    print('par règle :', dict(rules))
    print(f'\n— échantillon avant → après ({min(limit, len(todo))} affichés) —')
    for k, q1, q2, n, durs in todo[:limit]:
        print(f'  [{q1[:40]}] → [{q2[:40]}]')


def done_keys2():
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


def run(limit=None):
    done = done_keys2()
    todo = [(k, q2, n, durs) for k, q1, q2, n, durs in targets2()
            if k not in done]
    if limit:
        todo = todo[:limit]
    print(f'clés v2 à interroger : {len(todo)} (déjà faites : {len(done)})',
          flush=True)
    if not todo:
        return
    for i, (key, q2, n, durs) in enumerate(todo):
        artist, title = key.split('\t', 1)
        ra, rt = reform2(artist, title)
        rec = {'key': key, 'artist': artist, 'title': title, 'n_files': n,
               'query': q2, 'status': 'none', 'source': 'reform2',
               'year': None, 'years': []}
        if not tokens(rt):
            _append(rec)
            continue
        try:
            res = dg_lookup(ra, rt, durs)
            if res.get('status') in ('found', 'lax', 'ambiguous'):
                res['source'] = f'reform2_{res.get("source") or "discogs"}'
            rec.update(res)
        except Exception as e:
            rec.update(status='error', years=[f'{type(e).__name__}: {e}'[:80]])
        _append(rec)
        if (i + 1) % 25 == 0:
            print(f'[{i + 1}/{len(todo)}] {ra[:20]} — {rt[:24]} → '
                  f'{rec["status"]}', flush=True)
        time.sleep(1.05)   # ~57 req/min < 60 (règle Discogs)


def report():
    done = done_keys2()
    st = Counter()
    ex = {'found': [], 'lax': [], 'ambiguous': []}
    for r in done.values():
        st[r['status']] += 1
        if r['status'] in ex and len(ex[r['status']]) < 8:
            ex[r['status']].append(
                f'  [{r.get("query", "")[:32]}] → {r.get("year") or r.get("years")}')
    print(f'=== RAPPORT REFORM2 ({len(done)} clés valides) ===')
    print(dict(st))
    for kind, rows in ex.items():
        if rows:
            print(f'— {kind} —')
            print('\n'.join(rows))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--go', action='store_true',
                    help='lancer réellement (défaut : aperçu lecture-seule)')
    ap.add_argument('--limit', type=int, default=None)
    ap.add_argument('--report', action='store_true')
    args = ap.parse_args()
    if args.report:
        report()
    elif args.go:
        run(args.limit)
    else:
        preview()
