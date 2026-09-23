#!/usr/bin/env python3
"""Applique les années « certaines » (vague found) aux fichiers sans année.
Dry-run par défaut : aucun tag n'est écrit sans --apply.

Sources : data/year_cache.jsonl (MB/Deezer) + data/discogs_cache.jsonl
(seul le statut strict de Discogs est certain ; « lax » exige une revue humaine)
+ itunes_cache.jsonl / discogs_reform_cache.jsonl (found uniquement — même
consolidation que report_years.py : priorité MB/Deezer > Discogs > iTunes > reform).
Les choix humains de la vue Années (data/year_review.json, option --review)
OVERRIDE la consolidation : une année choisie à la main bat toute source automatique.
RÈGLE DE CERTITUDE (EPIC-040, décision 2026-09-21) : une année n'est écrite que
si **≥2 providers INDÉPENDANTS annoncent la même** (reform/reform2 = Discogs).
Une source unique ou un désaccord entre sources ne s'écrivent JAMAIS : ces clés
partent en revue humaine (`data/year_review.json`, vue Années), avec la
proposition pré-remplie. Les enregistrements v1 de `year_cache.jsonl` (première
passe : Deezer sans garde artiste/titre, une seule source pour conclure) sont
ignorés — re-collecte nécessaire.
Chaque fichier est re-vérifié avant écriture : si une année est apparue depuis
le scan, il est sauté (jamais écraser une année existante).

Journal additif data/year_apply_journal.jsonl {path, old, new, source, frame,
ok, ts} : l'opération étant purement additive, le journal EST le backup ;
--undo retire les frames journalisés (idempotent).

Usage (racine du projet) :
  ./venv/bin/python scripts/apply_years.py            # dry-run
  ./venv/bin/python scripts/apply_years.py --apply    # écrit les tags
  ./venv/bin/python scripts/apply_years.py --review   # + choix de la vue Années
  ./venv/bin/python scripts/apply_years.py --undo     # retire les frames journalisés
  ./venv/bin/python scripts/apply_years.py --report   # résumé du journal
  options : --limit N
"""
import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_years import artist_title, tags_artist_title

try:
    from mutagen.flac import FLAC
    from mutagen.id3 import ID3, ID3NoHeaderError, TDRC, TYER
    from mutagen.mp4 import MP4
    from mutagen.wave import WAVE
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'cache.json')
YEAR_CACHE = os.path.join(ROOT, 'data', 'year_cache.jsonl')
DG_CACHE = os.path.join(ROOT, 'data', 'discogs_cache.jsonl')
IT_CACHE = os.path.join(ROOT, 'data', 'itunes_cache.jsonl')
RF_CACHE = os.path.join(ROOT, 'data', 'discogs_reform_cache.jsonl')
RF2_CACHE = os.path.join(ROOT, 'data', 'discogs_reform2_cache.jsonl')

YT_CACHE = os.path.join(ROOT, 'data', 'youtube_topic_cache.jsonl')
REVIEW_PATH = os.path.join(ROOT, 'data', 'year_review.json')
JOURNAL = os.path.join(ROOT, 'data', 'year_apply_journal.jsonl')
# Formats dont l'écriture est gérée ET relue par get_audio_meta (app.py).
# .wma exclus : l'app ne lit pas les tags ASF (YAGNI).
SUPPORTED_EXTS = ('.mp3', '.flac', '.wav', '.m4a', '.mp4')


def current_year(path):
    """Année lisible par get_audio_meta (app.py) : TDRC/TYER/TORY (ID3 : MP3,
    WAV+ID3), DATE/YEAR (Vorbis : FLAC), (c)day (M4A). Chaque accès est isolé :
    un tags Vorbis lève ValueError sur une clé non-Vorbis (ex. (c)day)."""
    try:
        audio = MutagenFile(path, easy=False)
    except Exception:
        return None
    if audio is None:
        return None
    tags = getattr(audio, 'tags', None)
    if tags is not None:
        for name in ('TDRC', 'TYER', 'TORY'):
            try:
                val = tags.get(name)
            except Exception:
                val = None
            if val:
                return str(val)[:4]
        try:
            val = tags.get('\xa9day')
            if val:
                if isinstance(val, (list, tuple)):
                    val = val[0]
                return str(val)[:4]
        except Exception:
            pass
    if hasattr(audio, 'get'):
        for name in ('DATE', 'YEAR'):
            try:
                val = audio.get(name)
            except Exception:
                val = None
            if val:
                if isinstance(val, (list, tuple)):
                    val = val[0]
                return str(val)[:4]
    return None


# Providers INDÉPENDANTS : reform/reform2 sont des requêtes DISCOSG reformulées,
# pas une source de plus — les compter à part fabriquerait une « corroboration »
# entre deux appels du même site (EPIC-040).
PROVIDER_OF = {
    'musicbrainz': 'musicbrainz', 'deezer': 'deezer', 'discogs': 'discogs',
    'discogs_strict': 'discogs', 'reform_strict': 'discogs',
    'reform2_strict': 'discogs',
    'youtube_topic_strict': 'youtube', 'itunes': 'itunes',
}


def load_votes():
    """{key: {provider: annee}} — TOUS les votes connus, par provider.

    Sources : `year_cache.jsonl` v≥2 (votes nommés par le moteur corrigé) puis
    les pools d'appoint (discogs_cache, iTunes, reform/reform2 → discogs,
    YouTube — Beatport retiré, EPIC-049). Les enregistrements **v1** de year_cache — première
    passe, sans garde artiste/titre sur Deezer et une seule source pour
    conclure — sont ignorés : ils doivent être re-collectés (EPIC-040).
    """
    votes = defaultdict(dict)

    def vote(key, provider, year):
        provider = PROVIDER_OF.get(provider, provider)
        if key and provider and year:
            votes[key][provider] = str(year)[:4]

    try:
        f = open(YEAR_CACHE)
    except FileNotFoundError:
        f = None
    if f:
        with f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r.get('v', 1) < 2:
                    continue
                for provider, year in (r.get('sources') or {}).items():
                    vote(r['key'], provider, year)
    for path, provider in ((DG_CACHE, 'discogs'), (IT_CACHE, 'itunes'),
                           (RF_CACHE, 'reform_strict'),
                           (RF2_CACHE, 'reform2_strict'),
                           (YT_CACHE, 'youtube_topic_strict')):
        try:
            f = open(path)
        except FileNotFoundError:
            continue
        with f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r.get('status') == 'found' and r.get('year'):
                    vote(r.get('key'), provider, r.get('year'))
    return votes


def corroborate(provider_votes):
    """Règle EPIC-040 : une année n'est CERTAINE que si ≥2 providers
    INDÉPENDANTS annoncent la MÊME année. Sinon `None`. Une source unique (même
    la meilleure) et un désaccord entre sources ne s'écrivent pas : ils vont en
    revue humaine. C'est ce qui manquait le 2026-09-17 : une année Deezer
    — seule, sans garde artiste/titre, prise sur l'album d'une RÉÉDITION —
    partait directement dans les tags (Phantasia « Inner Light », 1991, écrit
    2024 via l'album « Ooo »)."""
    if not provider_votes:
        return None
    years = set(provider_votes.values())
    if len(years) != 1 or len(provider_votes) < 2:
        return None
    return next(iter(years)), '+'.join(sorted(provider_votes))


def load_found():
    """{key: (annee, source)} — clés CORROBORÉES uniquement (≥2 providers
    indépendants concordants). Les choix humains de la vue Années sont injectés
    par `build_worklist(review=…)`, donc seulement avec `--review` : sans lui, un
    fichier de revue qui traîne ne doit pas influencer l'écriture."""
    found = {}
    for key, provider_votes in load_votes().items():
        verdict = corroborate(provider_votes)
        if verdict:
            found[key] = verdict
    return found


def load_review():
    """Choix de revue valides : {key: 'YYYY'} (rejets null ignorés, fichier
    absent ou corrompu → {})."""
    if not os.path.exists(REVIEW_PATH):
        return {}
    try:
        with open(REVIEW_PATH) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if v}


def build_worklist(limit=None, review=None, keys_from_tags=False):
    """Fichiers sans année dont la clé a une année certaine.
    review : {key: 'YYYY'} des choix humains (vue Années → /years/review) —
    OVERRIDE de la consolidation : un choix explicite bat toute source.
    keys_from_tags : chaque fichier est matché par la clé construite depuis
    ses TAGS (ordre artiste/titre sûr) D'ABORD, puis par la clé-nom — les
    enregistrements de la collecte `--keys-from-tags` ne serviraient à rien
    sans ça (leurs clés ne sont pas des clés-nom). Aucune écriture de plus :
    la règle des 2 sources s'applique au résultat de la clé, quelle que soit
    son origine. Retourne (items, stats) ; item = {path, year, source}."""
    found = load_found()
    for k, y in (review or {}).items():
        if y:
            found[k] = (str(y), 'review')
    with open(CACHE) as f:
        cache = json.load(f)
    items = []
    stats = Counter()
    for side in ('source', 'epars'):
        for base, files in cache.get(side, {}).items():
            for fn, meta in files.items():
                if meta.get('year'):
                    continue
                key = None
                if keys_from_tags:
                    ta, tt = tags_artist_title(os.path.join(base, meta['path']))
                    if tt and ta and (f'{ta}\t{tt}') in found:
                        key = f'{ta}\t{tt}'
                if key is None:
                    a, t = artist_title(fn)
                    if not t:
                        stats['parse_fail'] += 1
                        continue
                    key = (a or '') + '\t' + t
                if key not in found:
                    stats['no_match'] += 1
                    continue
                if os.path.splitext(fn)[1].lower() not in SUPPORTED_EXTS:
                    stats['unsupported'] += 1
                    continue
                stats['candidate'] += 1
                items.append({
                    'path': os.path.join(base, meta['path']),
                    'year': found[key][0],
                    'source': found[key][1],
                })
    if limit:
        items = items[:limit]
    return items, stats


def write_year(path, year):
    """Ecrit l'annee dans le frame natif du format ; retourne le nom du frame.
    MP3 : on garde la version du tag existant (TYER si v2.3, TDRC si v2.4) ;
    sans header ID3v2 du tout (ID3v1 seul ou rien), on en crée un — additif.
    FLAC : DATE (Vorbis). WAV : chunk ID3 (TDRC). M4A : (c)day."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.mp3':
        try:
            tags = ID3(path)
        except ID3NoHeaderError:
            tags = ID3()      # aucun tag ID3v2 : création (opération additive)
            tags.filename = path   # pour que save() cible le bon fichier
        v = getattr(tags, 'version', (2, 4))
        if v[0] < 2 or (v[0] == 2 and v[1] <= 3):
            tags.add(TYER(encoding=0, text=year))
            frame = 'TYER'
        else:
            tags.add(TDRC(encoding=0, text=year))
            frame = 'TDRC'
        tags.save()
        return frame
    if ext == '.flac':
        audio = FLAC(path)
        audio['DATE'] = year
        audio.save()
        return 'DATE'
    if ext == '.wav':
        audio = WAVE(path)
        if audio.tags is None:
            audio.add_tags()
        audio.tags.add(TDRC(encoding=0, text=year))
        audio.save()
        return 'TDRC'
    if ext in ('.m4a', '.mp4'):
        audio = MP4(path)
        if audio.tags is None:
            audio.add_tags()
        audio.tags['\xa9day'] = [year]
        audio.save()
        return '\xa9day'
    raise ValueError('format non gere : ' + ext)


def remove_year_frame(path, frame):
    """Retire le frame ajoute (annulation additive ; idempotent)."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.mp3':
        tags = ID3(path)
        removed = False
        for name in ('TYER', 'TDRC'):
            if frame in (None, name) and tags.getall(name):
                tags.delall(name)
                removed = True
        if removed:
            tags.save()
        return removed
    if ext == '.flac':
        audio = FLAC(path)
        if 'DATE' in audio and frame in (None, 'DATE'):
            del audio['DATE']
            audio.save()
            return True
        return False
    if ext == '.wav':
        audio = WAVE(path)
        if audio.tags and audio.tags.getall('TDRC') and frame in (None, 'TDRC'):
            audio.tags.delall('TDRC')
            audio.save()
            return True
        return False
    if ext in ('.m4a', '.mp4'):
        audio = MP4(path)
        if audio.tags and '\xa9day' in audio.tags and frame in (None, '\xa9day'):
            del audio.tags['\xa9day']
            audio.save()
            return True
        return False
    return False


def journal_append(entry):
    entry['ts'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    with open(JOURNAL, 'a') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')


def do_dryrun(items, stats):
    by_ext = Counter()
    by_src = Counter()
    missing = 0
    already = 0
    for it in items:
        by_ext[os.path.splitext(it['path'])[1].lower()] += 1
        by_src[it['source']] += 1
        if not os.path.exists(it['path']):
            missing += 1
        elif current_year(it['path']):
            already += 1
    print('=== DRY-RUN (aucune ecriture) ===')
    print('candidats :', len(items))
    print('par extension :', dict(sorted(by_ext.items())))
    print('par source    :', dict(sorted(by_src.items())))
    print('introuvables sur disque :', missing)
    print('avec annee deja (a sauter) :', already)
    print('sans annee certaine dans les caches :', stats['no_match'])
    print('format non gere (ex. .wma) :', stats['unsupported'])
    print('non parsables :', stats['parse_fail'])


def do_apply(items):
    ok = skip = err = 0
    for i, it in enumerate(items):
        path = it['path']
        year = it['year']
        try:
            if not os.path.exists(path):
                skip += 1
                print('MANQUANT   ', path, flush=True)
                continue
            cur = current_year(path)
            if cur:
                skip += 1
                print('DEJA ANNEE ', cur, path, flush=True)
                continue
            frame = write_year(path, year)
            check = current_year(path)
            journal_append({'path': path, 'old': None, 'new': year,
                            'source': it['source'], 'frame': frame,
                            'ok': check == year})
            if check == year:
                ok += 1
            else:
                err += 1
                print('ECHEC VERIF', path, flush=True)
        except Exception as e:
            err += 1
            print('ERREUR     ', path, ':', e, flush=True)
        if (i + 1) % 50 == 0:
            print('[%d/%d] ok=%d skip=%d err=%d' % (i + 1, len(items), ok, skip, err),
                  flush=True)
    print('== APPLY : %d items : ok=%d skip=%d err=%d' % (len(items), ok, skip, err))


def do_undo(limit=None):
    """Annule les écritures du journal.

    Deux cas : écriture ADDITIVE (`old` null — le fichier n'avait pas d'année) →
    on retire le frame ; écriture de CORRECTION (`old` renseigné — audit EPIC-040)
    → on RESTAURE l'ancienne valeur. Sans ça, `--undo` ne couvrirait pas les
    corrections d'audit et laisserait la nouvelle année en place."""
    entries = []
    if os.path.exists(JOURNAL):
        with open(JOURNAL) as f:
            for line in f:
                line = line.strip()
                if line:
                    e = json.loads(line)
                    if e.get('ok'):
                        entries.append(e)
    if limit:
        entries = entries[:limit]
    done = restore = 0
    for e in entries:
        try:
            if e.get('old'):
                write_year(e['path'], e['old'])
                restore += 1
            elif remove_year_frame(e['path'], e.get('frame')):
                done += 1
            else:
                print('RIEN A RETIRER', e['path'], flush=True)
        except Exception as ex:
            print('ERREUR UNDO', e['path'], ':', ex, flush=True)
    print('== UNDO : %d frames retires, %d anciennes années restaurées (/%d)'
          % (done, restore, len(entries)))


def journal_report():
    if not os.path.exists(JOURNAL):
        print('journal absent — aucune ecriture enregistrée')
        return
    ok = err = 0
    by_ext = Counter()
    with open(JOURNAL) as f:
        for line in f:
            line = line.strip()
            if line:
                e = json.loads(line)
                if e.get('ok'):
                    ok += 1
                    by_ext[os.path.splitext(e['path'])[1].lower()] += 1
                else:
                    err += 1
    print('journal : %d ecritures OK, %d echecs' % (ok, err))
    print('par extension :', dict(sorted(by_ext.items())))


def main():
    ap = argparse.ArgumentParser(
        description='Applique les années certaines (dry-run par défaut).')
    ap.add_argument('--apply', action='store_true',
                    help='ecrire reellement (défaut : dry-run)')
    ap.add_argument('--undo', action='store_true',
                    help='retirer les frames journalisés')
    ap.add_argument('--report', action='store_true',
                    help='resume du journal')
    ap.add_argument('--review', action='store_true',
                    help='injecter les choix de la vue Années (year_review.json)')
    ap.add_argument('--keys-from-tags', action='store_true',
                    help='matcher les fichiers par la clé de leurs TAGS '
                         '(collecte --keys-from-tags)')
    ap.add_argument('--limit', type=int, default=None)
    args = ap.parse_args()
    if args.report:
        journal_report()
        return
    if args.undo:
        do_undo(args.limit)
        return
    review = load_review() if args.review else None
    if args.review:
        print('choix de revue charges : %d' % len(review))
    items, stats = build_worklist(args.limit, review,
                                  keys_from_tags=args.keys_from_tags)
    if args.apply:
        do_apply(items)
    else:
        do_dryrun(items, stats)


if __name__ == '__main__':
    main()
