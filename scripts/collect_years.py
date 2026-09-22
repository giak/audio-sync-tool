#!/usr/bin/env python3
"""Collecte des années manquantes — MusicBrainz (1 req/s) puis Deezer. LECTURE SEULE
sur le corpus : n'écrit que dans le cache de résultats.

- Source : data/cache.json (côtés source/epars) → fichiers sans année.
- Clés (artiste, titre) parsées des noms, dédupliquées.
- MusicBrainz ET Deezer sont TOUJOURS interrogés tous les deux (EPIC-040) : la
  règle de décision est « 2 sources indépendantes concordantes », sinon rien
  n'est écrit (le cas part en revue). Avant, la première source qui concluait
  gagnait : une année Deezer n'était recoupée par personne.
- Orientations : le nom est parsé en (artiste, titre) — hypothèse « Artiste -
  Titre » — mais l'ordre est AMBIGU dans une collection (« Inner Light -
  Phantasia » = titre puis artiste). Les deux orientations sont donc essayées et
  c'est la GARDE qui tranche, pas une supposition.
- Garde : durée du candidat ±15 s d'UNE des durées connues de la clé (ignorée si
  aucune durée connue) ; compatibilité artiste/titre par tokens NORMALISÉS
  (casse/accents) — SUR LES DEUX SOURCES (Deezer n'en avait aucune avant EPIC-040,
  seul filtre la durée, inactif quand le fichier n'avait pas de durée :
  n'importe quelle requête renvoyait « found ») ; homonymes → ambigu.
- Sémantique : MusicBrainz `first-release-date` = première sortie ; Deezer
  `release_date` = date de l'ALBUM MATCHÉ, donc souvent une RÉÉDITION
  (cas fondateur : Phantasia « Inner Light » 1991, album « Ooo » 2024-01-15).
  Les deux valeurs sont conservées comme VOTES nommés, jamais confondues.
Providers interrogés (EPIC-040) : MusicBrainz + Deezer + Discogs **toujours**
  (Discogs si data/discogs_token existe) ; YouTube Topic avec `--youtube` (yt-dlp,
  coût réel par clé → à réserver aux clés non résolues : `--only=unresolved`).
- Recherche web (dernier recours, EPIC-049) : DuckDuckGo LOCAL (MCP `search`
  si lancé, sinon endpoint HTML) — **ne vote jamais**, elle ne produit que des
  CANDIDATS (`web_candidates`, `web_proposed`) soumis à la revue : un extrait
  web n'a pas le niveau de preuve d'une API de disques. Brave Search, payant et
  jamais configuré ici, a été retiré.
- Résultats incrémentaux : data/year_cache.jsonl (reprise : clés v≥2 déjà présentes sautées).
- Rapport : ./venv/bin/python scripts/collect_years.py --report
- Diagnostic d'une clé : ./venv/bin/python scripts/collect_years.py \
      --probe='artiste|titre' [--durs=337] [--youtube]

À lancer depuis la racine du projet : ./venv/bin/python scripts/collect_years.py [--max-seconds=N]
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error

import web_search
import remix_credit as remix_mod
from collections import Counter, defaultdict

CACHE = 'data/cache.json'
PROG = 'data/year_cache.jsonl'
MB_UA = 'audio-sync-tool/0.1 ( https://github.com/giak/audio-sync-tool )'
DZ_UA = 'audio-sync-tool/0.1'
# Version du moteur de collecte. 1 = première passe (Deezer sans garde, une
# seule source concluait) ; 2 = EPIC-040 (garde artiste/titre partout, deux
# orientations de clé, règle des 2 providers indépendants concordants).
ENGINE_VERSION = 3   # v3 = EPIC-048 : un remix doit PROUVER son remixeur

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


# Classe sémantique de chaque source — c'est LE point qui a produit l'erreur de
# 2024 : MusicBrainz (first-release-date) et Discogs disent la première sortie du
# morceau ; Deezer/iTunes/YouTube disent la date de l'ÉDITION matchée, donc
# d'une réédition. À vote égal, la classe « first » gagne pour la PROPOSITION
# (jamais pour l'écriture automatique : il faut 2 sources concordantes).
# Beatport est retiré (EPIC-049) : la passe n'a jamais tourné.
SOURCE_CLASS = {
    'musicbrainz': 'first', 'discogs': 'first',
    'deezer': 'edition', 'itunes': 'edition',
    'youtube': 'edition',
}

# Providers INDÉPENDANTS (EPIC-040) : les passes reform/reform2 sont des
# reformulations de DISCOGS, pas une source de plus — les compter séparément
# fabriquerait une « corroboration » entre deux requêtes du même site.
PROVIDER = {
    'musicbrainz': 'musicbrainz',
    'deezer': 'deezer',
    'discogs_strict': 'discogs',
    'discogs': 'discogs',
    'reform_strict': 'discogs',
    'reform2_strict': 'discogs',
    'youtube_topic_strict': 'youtube',
    'itunes': 'itunes',
    'human': 'human',
}


def key_variants(a, t, alt=None):
    """Orientations (artiste, titre) à essayer, dans l'ordre de confiance :
    les TAGS du fichier (`alt`), puis la lecture du nom, puis l'inverse du nom.
    L'ordre « Artiste - Titre » est une hypothèse, pas une certitude
    (« Inner Light - Phantasia » est en réalité titre - artiste), et quand le nom
    est un collage (« inner lightphantasia ») aucune heuristique ne s'en sort :
    seuls les tags le disent. Essayer les trois et laisser la garde tokens
    trancher est ce qui rend la collecte insensible à cette convention
    (EPIC-040)."""
    out = []

    def add(pair, need_artist=False):
        if not pair or not (pair[1] or '').strip():
            return
        if need_artist and not (pair[0] or '').strip():
            return
        p = ((pair[0] or '').strip() or None, pair[1].strip())
        if p not in out:
            out.append(p)

    add(alt)
    add((a, t))                  # une requête « titre seul » reste valable
    add((t, a), need_artist=True)   # échanger n'a de sens que si on a un artiste
    return out


def tags_artist_title(path):
    """(artiste, titre) lus dans les TAGS du format, ou (None, None).
    Le nom ne peut pas trancher l'ordre ; les tags, si. Exemple réel qui a
    produit l'erreur : `inner lightphantasia.mp3` porte artist=Phantasia,
    title=Inner Light — avec le nom seul la clé était « collée »."""
    try:
        from mutagen import File as MutagenFile
    except ImportError:
        return None, None
    try:
        audio = MutagenFile(path, easy=True)
        tags = getattr(audio, 'tags', None)
        if not tags:
            return None, None

        def one(*names):
            for n in names:
                try:
                    v = tags.get(n)
                except Exception:
                    v = None
                if v:
                    if isinstance(v, (list, tuple)):
                        v = v[0]
                    v = str(v).strip()
                    if v:
                        return v
            return None

        return one('artist', 'TPE1', 'ARTIST'), one('title', 'TIT2', 'TITLE')
    except Exception:
        return None, None


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
                # EPIC-048 : le crédit de remix vient du NOM (les parenthèses sont
                # retirées par artist_title, donc la clé ne le porte plus).
                credit = remix_mod.remix_credit(fn)
                if credit['kind'] == 'remix':
                    keys[k].setdefault('remix', credit['tokens'])
                    keys[k].setdefault('remix_label', credit['label'])
    return total_files, noyear, keys


def done_keys(min_version=ENGINE_VERSION):
    """Clés déjà traitées par le moteur COURANT (v ≥ ENGINE_VERSION).
    `min_version=0` rend TOUT l'historique (sert à `--only=remix` : reinterroger
    les seules clés de remix sans refaire les 1 400 autres).
    Les enregistrements v1 (première passe : aucune garde artiste/titre sur
    Deezer, une seule source pour conclure) sont ignorés — les clés sont
    ré-interrogées et la nouvelle ligne prime (dernier gagnant par clé)."""
    done = {}
    try:
        with open(PROG) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                if rec.get('v', 1) >= min_version:
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


def mb_lookup(a, t, durs, pacer, require=()):
    """MusicBrainz recording search → ('found'|'ambiguous'|'none', year, years).
    Les gardes artiste/titre/durée ne portent que sur les records AVEC année
    (un record sans first-release-date n'est pas une réponse).
    EPIC-048 : `require` = tokens du remixeur — quand ils sont fournis, un
    enregistrement qui ne le nomme PAS ne compte pas (sa date est celle de
    l'original : le cas `(cosmic gate mix)` concluait 1990)."""
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
        if require and not remix_mod.names_remixer(require, rtitle):
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


def dz_lookup(a, t, durs, require=()):
    """Deezer → dict(status, year, years, evidence).
    GARDE artiste ET titre obligatoire (EPIC-040) : avant, seule la durée
    filtrait — donc zéro filtre dès que le fichier n'avait pas de durée connue.
    `evidence` garde l'album et sa date : c'est là que se voit la réédition
    (album « Ooo » 2024-01-15 pour un morceau de 1991).
    EPIC-048 : `require` = tokens du remixeur — le morceau matché doit le nommer
    (titre OU album), sinon sa date d'édition est celle de l'original."""
    items = dz_candidates(a, t)
    passing = []
    for it in items:
        rartist = (it.get('artist') or {}).get('name') or ''
        rtitle = it.get('title') or ''
        ralbum = (it.get('album') or {}).get('title') or ''
        if a and not tok_compat(a, rartist):
            continue
        if not tok_compat(t, rtitle):
            continue
        if require and not (remix_mod.names_remixer(require, rtitle)
                           or remix_mod.names_remixer(require, ralbum)):
            continue
        if durs and abs(it['duration'] - min(durs, key=lambda d: abs(d - it['duration']))) > 15:
            continue
        passing.append(it)
    if not passing:
        return {'status': 'none', 'year': None, 'years': [], 'evidence': []}
    years, evidence = [], []
    for it in passing[:3]:
        try:
            alb = get(f"https://api.deezer.com/album/{it['album']['id']}", DZ_UA, timeout=10)
        except Exception:
            continue
        rd = alb.get('release_date')
        if rd:
            years.append(rd[:4])
            evidence.append({'album': alb.get('title'), 'release_date': rd,
                             'artist': (it.get('artist') or {}).get('name'),
                             'title': it.get('title')})
        time.sleep(0.3)
    if not years:
        return {'status': 'none', 'year': None, 'years': [], 'evidence': []}
    distinct = sorted(set(years))
    if len(distinct) == 1:
        return {'status': 'found', 'year': distinct[0], 'years': distinct,
                'evidence': evidence}
    return {'status': 'ambiguous', 'year': None, 'years': distinct,
            'evidence': evidence}


def lookup(a, t, durs, pacer, alt=None, youtube=False, web=True, require=(),
           remix_label=None):
    """Interroge MusicBrainz, Deezer et Discogs sur chaque orientation de clé
    (EPIC-040) ; `alt` = (artiste, titre) des tags du fichier, essayé en premier.
    Décision = 2 providers INDÉPENDANTS concordants :

      found     → ≥2 providers, même année → seule valeur écrite ensuite
      conflict  → ≥2 providers, années différentes → candidates, revue
      single    → un seul provider parle → ANNÉE CANDIDATE, rien n'est écrit
      ambiguous → un provider remonte plusieurs années, pas de consensus
      none      → personne ne conclut

    `sources` conserve le vote de chaque provider (sémantiques différentes :
    MusicBrainz/Discogs = première sortie, Deezer = album matché, donc souvent une
    réédition), `evidence` les albums Deezer vus, `variant` l'orientation qui a
    parlé ('tags', 'nom' ou 'inverse').
    """
    alts = {((alt or ('', ''))[0] or None, (alt or ('', ''))[1] or '')}
    for a2, t2 in key_variants(a, t, alt):
        variant = ('tags' if (a2, t2) in alts
                   else 'nom' if (a2, t2) == (a, t)
                   else 'inverse')
        votes, amb, errs, candidates = {}, [], [], set()
        web_candidates, web_proposed, web_evidence = set(), None, []
        try:
            mb_status, mb_year, mb_years = mb_lookup(a2, t2, durs, pacer, require)
        except Exception as e:
            mb_status, mb_year, mb_years = None, None, []
            errs.append(f'mb_error: {type(e).__name__}: {e}'[:90])
        # mb_lookup peut lever avant d'avoir posé une conclusion : statut None.
        if mb_status == 'found' and mb_year:
            votes['musicbrainz'] = str(mb_year)[:4]
        elif mb_status == 'ambiguous':
            amb += [str(y)[:4] for y in (mb_years or [])]
        try:
            dz = dz_lookup(a2, t2, durs, require)
        except Exception as e:
            dz = {'status': 'error', 'year': None, 'years': [], 'evidence': []}
            errs.append(f'dz_error: {type(e).__name__}: {e}'[:90])
        if dz.get('status') == 'found' and dz.get('year'):
            votes['deezer'] = str(dz['year'])[:4]
        elif dz.get('status') == 'ambiguous':
            amb += [str(y)[:4] for y in (dz.get('years') or [])]
        # Discogs : le troisième provider, et le seul « première sortie »
        # interrogeable à la demande (clé absente → erreur, pas de blocage).
        dg = discogs_vote(a2, t2, durs)
        if dg.get('status') == 'found' and dg.get('year'):
            votes['discogs'] = str(dg['year'])[:4]
        elif dg.get('status') in ('lax',):
            candidates.add(str(dg.get('year'))[:4])   # durée non vérifiable
        elif dg.get('status') == 'ambiguous':
            amb += [str(y)[:4] for y in (dg.get('years') or [])]
        if dg.get('error'):
            errs.append(f'discogs_error: {dg["error"]}'[:90])
        # YouTube Topic (opt-in : yt-dlp, coût réel par clé) — vote d'édition.
        if youtube:
            ytv = youtube_vote(a2, t2, durs)
            if ytv.get('status') == 'found' and ytv.get('year'):
                votes['youtube'] = str(ytv['year'])[:4]
            elif ytv.get('status') == 'ambiguous':
                amb += [str(y)[:4] for y in (ytv.get('years') or [])]
            if ytv.get('error'):
                errs.append(f'youtube_error: {ytv["error"]}'[:90])
        # Recherche web : CANDIDATS seulement (jamais un vote, cf. web_vote).
        if web:
            wb = web_vote(a2, t2, extra=remix_label or '')
            web_candidates |= set(wb.get('web_candidates') or [])
            if wb.get('web_proposed') and not web_proposed:
                web_proposed = str(wb['web_proposed'])
            web_evidence += wb.get('evidence') or []
            if wb.get('error'):
                errs.append(f'web_error: {wb["error"]}'[:90])

        if not votes and not amb:
            continue                    # orientation muette → essayer l'autre

        providers = {PROVIDER.get(k, k): v for k, v in votes.items()}
        distinct = sorted(set(providers.values()))
        candidates |= set(distinct) | {y for y in amb if y.isdigit()} | web_candidates
        if len(providers) >= 2 and len(distinct) == 1:
            status, year = 'found', distinct[0]
        elif len(providers) >= 2:
            status, year = 'conflict', None
        elif len(providers) == 1:
            status, year = 'single', distinct[0]
        else:
            status, year = 'ambiguous', None
        # Proposition par défaut, pour pré-remplir la revue : la plus ancienne
        # année annoncée par une source « première sortie », puis la plus
        # ancienne candidate connue. Jamais écrite automatiquement.
        first_votes = [y for p, y in providers.items()
                       if SOURCE_CLASS.get(p) == 'first' and y.isdigit()]
        numeric = sorted(int(y) for y in candidates if y.isdigit())
        proposed = None
        if first_votes:
            proposed = min(first_votes, key=int)
        elif year:
            proposed = year
        elif require:
            # EPIC-048 : REMIX dont aucune source ne nomme le remixeur. Les
            # années restantes parlent de l'ORIGINAL (1990 pour un remix de
            # 2004) — les proposer reviendrait à réécrire l'erreur signalée.
            # Reste la piste web, cherchée AVEC le remixeur ; et si elle n'a pas
            # de consensus, on ne propose RIEN (None) au lieu de proposer faux.
            proposed = web_proposed
        elif numeric:
            proposed = str(numeric[0])
        rec = {
            'status': status, 'year': year,
            'years': distinct or sorted(set(amb)),
            'candidates': [str(y) for y in numeric],
            'proposed': proposed,
            'web_candidates': sorted(web_candidates),
            'web_proposed': web_proposed,   # jamais écrite : piste de revue
            'classes': {p: SOURCE_CLASS.get(p) for p in providers},
            'sources': providers,
            'source': '+'.join(sorted(providers)) if status == 'found' else None,
            'n_sources': len(providers), 'variant': variant, 'v': ENGINE_VERSION,
        }
        if dz.get('evidence'):
            rec['evidence'] = dz['evidence'][:2]
        if web_evidence:
            rec['web_evidence'] = web_evidence[:3]
        if require:
            # Tracé : on sait que cette conclusion a été gardée par le remixeur.
            rec['required_remix'] = list(require)
        if errs:
            rec['errors'] = errs
        return rec

    return {'status': 'none', 'year': None, 'years': [], 'candidates': [],
            'proposed': None, 'web_candidates': [], 'web_proposed': None,
            'sources': {}, 'source': None, 'n_sources': 0,
            'variant': None, 'v': ENGINE_VERSION}


def run(max_seconds=None, youtube=False, web=True, only=None):
    """Collecte reprenable. `only='unresolved'` ne retraite que les clés dont
    l'enregistrement v2 n'est ni `found` ni `none` (single/conflict) — c'est là
    que YouTube (coûteux) et la recherche web servent à quelque chose : apporter
    la 2ᵉ voix manquante (ou confirmer le désaccord)."""
    t0 = time.monotonic()
    total, noyear, keys = load_keys()
    done = done_keys()
    if only == 'unresolved':
        todo = [k for k, r in done.items()
                if k in keys and r.get('status') in ('single', 'conflict')]
    elif only == 'remix':
        # EPIC-048 : la garde remix change le résultat → on refait les seules
        # clés dont le NOM porte un remixeur, tous millésimes du journal confondus.
        seen = done_keys(0)
        todo = [k for k in keys if keys[k].get('remix') and k in seen]
    else:
        todo = [k for k in keys if k not in done]
    print(f'fichiers={total} sans_annee={noyear} cles={len(keys)} '
          f'deja_faites={len(done)} a_traiter={len(todo)} '
          f'youtube={youtube} web={web} only={only}', flush=True)
    pacer = Pacer(1.05)
    with open(PROG, 'a') as out:
        for i, k in enumerate(todo):
            if max_seconds and time.monotonic() - t0 > max_seconds:
                print(f'budget atteint après {i} clés — reprise possible', flush=True)
                return
            a, t = (k.split('\t')[0] or None), k.split('\t')[1]
            meta = keys[k]
            res = lookup(a, t, meta['durs'], pacer, youtube=youtube, web=web,
                         require=tuple(meta.get('remix') or ()),
                         remix_label=meta.get('remix_label'))
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
    amb, none_l, err_l, single_l, conflict_l = [], [], [], [], []
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
        elif rec['status'] == 'single':
            single_l.append(rec)
        elif rec['status'] == 'conflict':
            conflict_l.append(rec)
        elif rec['status'] == 'none':
            none_l.append(rec)
        else:
            err_l.append(rec)
    amb.sort(key=lambda r: -r.get('n_files', 0))
    none_l.sort(key=lambda r: -r.get('n_files', 0))
    single_l.sort(key=lambda r: -r.get('n_files', 0))
    conflict_l.sort(key=lambda r: -r.get('n_files', 0))
    files_done = sum(st_files.values())
    print('=== RAPPORT COLLECTE ANNÉES (partiel si reste > 0) ===')
    print(f'fichiers sans année : {noyear} ; clés uniques : {len(keys)} ; '
          f'interrogées : {len(done)} ; restantes : {len(todo)}')
    print(f'\nPar clés    : found={st_keys["found"]} single={st_keys["single"]} '
          f'conflict={st_keys["conflict"]} ambiguous={st_keys["ambiguous"]} '
          f'none={st_keys["none"]} error={st_keys["error"]}')
    print(f'Par fichiers: found={st_files["found"]} single={st_files["single"]} '
          f'conflict={st_files["conflict"]} ambiguous={st_files["ambiguous"]} '
          f'none={st_files["none"]} error={st_files["error"]} '
          f'(traités={files_done}/{noyear})')
    print(f'Règle EPIC-040 : seuls les « found » (≥2 providers concordants) sont '
          f'écrits — single={st_keys["single"]} et conflict={st_keys["conflict"]} '
          f'vont en revue.')
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
    print(f'\n— Année d\'UNE seule source (candidate, NON écrite) : '
          f'{st_keys["single"]} clés / {st_files["single"]} fichiers —')
    for r in single_l[:10]:
        print(f'  [{r["n_files"]}f] {r["artist"] or "?"} — {r["title"]} → '
              f'{r.get("year")} ({r.get("sources")})')
    print(f'\n— Sources en DÉSACCORD (revue) : {st_keys["conflict"]} clés / '
          f'{st_files["conflict"]} fichiers —')
    for r in conflict_l[:10]:
        print(f'  [{r["n_files"]}f] {r["artist"] or "?"} — {r["title"]} → '
              f'{r.get("sources")}')
    print(f'\n— Non trouvés : {st_keys["none"]} clés / {st_files["none"]} fichiers —')
    for r in none_l[:12]:
        print(f'  [{r["n_files"]}f] {r["artist"] or "?"} — {r["title"]}')
    if err_l:
        print(f'\n— Erreurs : {len(err_l)} —')
        for r in err_l[:5]:
            print(f'  {r["artist"] or "?"} — {r["title"]} : {r.get("mb_error") or r.get("dz_error")}')


# Recherche web (EPIC-040, fournisseur remplacé en EPIC-049) : source de DERNIER
# RECOURS, et elle ne vote JAMAIS. Elle ne produit que des CANDIDATS affichés en
# revue — un extrait de page web n'a pas le niveau de preuve d'une API de
# disques, et la règle des 2 sources ne doit pas être contournée par un moteur de
# recherche. Le moteur est LOCAL (DuckDuckGo) : MCP `search` s'il tourne, sinon
# l'endpoint HTML — aucune clé, aucun service payant (Brave est retiré).
YEAR_RE = re.compile(r'\b(19[3-9]\d|20[0-4]\d)\b')


def web_vote(a, t, timeout=10, limit=5, extra=''):
    """Recherche web → {status, web_candidates, web_proposed, evidence, provider}.
    Candidats = années vues dans les titres/snippets/URLs des résultats.
    `web_proposed` n'est posé que si ≥ 2 résultats concordent (signal faible
    assumé comme tel). Aucune année web n'entre dans `sources` — c'est une
    PISTE, jamais une preuve. Aucun fournisseur joignable → `error` renseigné
    ("pas de réponse" n'est pas "pas de moteur").
    `extra` (EPIC-048) = le crédit de remix : sans lui la requête porte sur
    l'ORIGINAL, donc les résultats parlent de 1990 quand le fichier est un remix
    de 2004 — la piste web confirmait l'année fausse au lieu de la contredire."""
    q = f'{a + " " if a else ""}{t}{(" " + extra) if extra else ""} release year discogs'
    res = web_search.search(q, limit=limit, timeout=timeout)
    if not res['results']:
        out = {'status': 'skip' if res['provider'] is None else 'none',
               'web_candidates': [], 'web_proposed': None, 'evidence': [],
               'provider': res['provider']}
        if res.get('error'):
            out['error'] = res['error']
        return out
    counts, evidence = Counter(), []
    for h in res['results'][:limit]:
        blob = ' '.join(str(h.get(k) or '') for k in ('title', 'url', 'snippet'))
        yrs = [y for y in YEAR_RE.findall(blob)]
        if yrs:
            counts[Counter(yrs).most_common(1)[0][0]] += 1
        evidence.append({'title': (h.get('title') or '')[:120],
                         'url': h.get('url'), 'years': sorted(set(yrs))})
    candidates = sorted(counts, key=lambda y: (-counts[y], y))
    web_proposed = candidates[0] if candidates and counts[candidates[0]] >= 2 else None
    return {'status': 'candidates' if candidates else 'none',
            'web_candidates': candidates, 'web_proposed': web_proposed,
            'evidence': evidence[:3], 'provider': res['provider']}


def youtube_vote(a, t, durs):
    """Vote YouTube Topic (yt-dlp) — indice d'ÉDITION (`release_date` YouTube),
    donc jamais une première sortie : il ne peut que corroborer un `first`.
    Coût réel : une recherche + extractions par clé (sous-processus), d'où le
    flag `--youtube` (défaut off) — à réserver aux clés non résolues."""
    try:
        import collect_youtube_topic as yt
    except Exception as e:
        return {'status': 'skip', 'year': None, 'years': [],
                'error': f'{type(e).__name__}: {e}'[:90]}
    try:
        rec = yt.lookup((a or '') + '\t' + (t or ''), 1, durs, None)
    except Exception as e:
        return {'status': 'error', 'year': None, 'years': [],
                'error': f'{type(e).__name__}: {e}'[:90]}
    return {'status': rec.get('status') or 'none', 'year': rec.get('year'),
            'years': rec.get('years') or [], 'videos': rec.get('videos') or []}


def discogs_vote(a, t, durs):
    """Vote Discogs (token) — source à sémantique « première sortie » pour ce
    corpus (guard strict de collect_discogs : tokens artiste/titre + durée).
    Import paresseux : le module n'est requis que si le token est présent."""
    if not os.path.exists(os.path.join('data', 'discogs_token')):
        return {'status': 'skip', 'year': None, 'years': []}
    try:
        import collect_discogs as cd
    except Exception as e:                      # pas de token / import cassé
        return {'status': 'error', 'year': None, 'years': [],
                'error': f'{type(e).__name__}: {e}'[:90]}
    try:
        return cd.lookup(a, t, durs)
    except Exception as e:
        return {'status': 'error', 'year': None, 'years': [],
                'error': f'{type(e).__name__}: {e}'[:90]}


def probe(a, t, durs=None, youtube=False, web=True, name=None):
    """Outil de diagnostic : un lookup complet sur une clé, record affiché.
    `--probe='artiste|titre'` (+ `--durs=N` pour la garde durée, `--youtube`).
    `name` (nom de fichier) active la garde remix d'EPIC-048 comme en collecte."""
    credit = remix_mod.remix_credit(name or f'{a} - {t}')
    rec = lookup(a or None, t, durs or set(), Pacer(1.05),
                 youtube=youtube, web=web, require=tuple(credit['tokens']),
                 remix_label=credit['label'] or None)
    print(json.dumps(rec, ensure_ascii=False, indent=2))
    return rec


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--report' in args:
        report()
    elif any(x.startswith('--probe=') for x in args):
        spec = next(x.split('=', 1)[1] for x in args if x.startswith('--probe='))
        artist, _, title = spec.partition('|')
        durs = {int(x.split('=', 1)[1]) for x in args if x.startswith('--durs=')}
        fname = next((x.split('=', 1)[1] for x in args
                      if x.startswith('--name=')), None)
        probe(artist.strip(), title.strip(), durs,
              youtube='--youtube' in args, web='--no-web' not in args, name=fname)
    else:
        mx = None
        only = None
        for arg in args:
            if arg.startswith('--max-seconds='):
                mx = int(arg.split('=')[1])
            elif arg.startswith('--only='):
                only = arg.split('=', 1)[1]
        run(mx, youtube='--youtube' in args,
            web='--no-web' not in args, only=only)
