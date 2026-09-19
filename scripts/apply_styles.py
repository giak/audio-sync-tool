#!/usr/bin/env python3
"""Applique les styles choisis (EPIC-035 P3) dans les tags ID3 des fichiers.

Pattern scripts/apply_years.py (EPIC-033) : dry-run par défaut, --apply pour
écrire, journal additif JSONL portant l'ANCIENNE valeur (TCON est un tag
remplacé, pas ajouté — le journal EST le backup), --undo restaure.

Source des choix : data/style_review.json (vue Sync → POST /styles/review),
clé = fullpath épars, valeur = {"style": "…", "tranche": AAAA|null} ou null
(retrait). Le style est appliqué à l'épars ET à sa copie rangée si elle
existe (même nom de fichier sous un dossier du même style dans les racines
source du cache) — sinon la copie à droite garderait son ancien genre.
Idempotent : un fichier dont le genre lu == style cible est sauté (skip).

Usage (racine du projet) :
  ./venv/bin/python scripts/apply_styles.py            # dry-run
  ./venv/bin/python scripts/apply_styles.py --apply    # écrit les tags
  ./venv/bin/python scripts/apply_styles.py --undo     # restaure old_genre
  ./venv/bin/python scripts/apply_styles.py --report   # résumé du journal
  options : --limit N
"""
import argparse
import json
import os
import re
import sys
import time

try:
    from mutagen.flac import FLAC
    from mutagen.id3 import ID3, ID3NoHeaderError, TCON
    from mutagen.mp4 import MP4
    from mutagen.wave import WAVE
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'cache.json')
REVIEW_PATH = os.path.join(ROOT, 'data', 'style_review.json')
JOURNAL = os.path.join(ROOT, 'data', 'style_apply_journal.jsonl')
# Formats dont l'écriture est gérée ET relue par get_audio_meta (app.py).
# .wma exclu : l'app ne lit pas les tags ASF (YAGNI).
SUPPORTED_EXTS = ('.mp3', '.flac', '.wav', '.m4a', '.mp4')


def current_genre(path):
    """Genre lisible par get_audio_meta (app.py) : TCON (ID3 : MP3, WAV+ID3),
    GENRE (Vorbis : FLAC), (c)gen (M4A). Chaque accès est isolé : un tags
    Vorbis lève ValueError sur une clé non-Vorbis."""
    try:
        audio = MutagenFile(path, easy=False)
    except Exception:
        return None
    if audio is None:
        return None
    tags = getattr(audio, 'tags', None)
    if tags is not None:
        try:
            val = tags.get('TCON')
            if val:
                if isinstance(val, (list, tuple)):
                    val = val[0]
                return str(val)
        except Exception:
            pass
        try:
            val = tags.get('\xa9gen')
            if val:
                if isinstance(val, (list, tuple)):
                    val = val[0]
                return str(val)
        except Exception:
            pass
    if hasattr(audio, 'get'):
        for name in ('GENRE', 'STYLE'):
            try:
                val = audio.get(name)
            except Exception:
                val = None
            if val:
                if isinstance(val, (list, tuple)):
                    val = val[0]
                return str(val)
    return None


def load_review():
    """Choix valides : {fullpath: (style, tranche)} (retraits null ignorés,
    fichier absent ou corrompu → {})."""
    if not os.path.exists(REVIEW_PATH):
        return {}
    try:
        with open(REVIEW_PATH) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    out = {}
    for k, v in data.items():
        if isinstance(v, dict) and v.get('style'):
            out[k] = (str(v['style']), v.get('tranche'))
    return out


def _style_from_source_path(rel_path):
    """Style du dossier source ('techno_acid_1990/x.mp3' → 'techno_acid'),
    None si fichier à la racine."""
    slash = rel_path.find('/')
    if slash <= 0:
        return None
    folder = rel_path[:slash]
    m = re.match(r'^(.+)_(\d{4})$', folder)
    return m.group(1) if m else folder


def build_worklist(limit=None):
    """Items {path, style, twin} à partir des choix de revue.
    Formats non gérés (.wma/.ogg) et fichiers disparis du disque sont signalés
    au dry-run, exclus à l'apply. Retourne (items, stats)."""
    review = load_review()
    cache = load_cache_safe()
    items = []
    stats = {'unsupported': 0, 'missing': 0, 'candidate': 0, 'no_twin': 0}
    for fullpath, (style, _tranche) in review.items():
        if os.path.splitext(fullpath)[1].lower() not in SUPPORTED_EXTS:
            stats['unsupported'] += 1
            continue
        if not os.path.exists(fullpath):
            stats['missing'] += 1
            continue
        stats['candidate'] += 1
        twin = _twin_copy_path_from(cache, fullpath)
        if not twin:
            stats['no_twin'] += 1
        items.append({'path': fullpath, 'style': style, 'twin': twin})
    if limit:
        items = items[:limit]
    return items, stats


def load_cache_safe():
    if not os.path.exists(CACHE):
        return {}
    try:
        with open(CACHE) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def _twin_copy_path_from(cache, fullpath):
    """Chemin de la copie rangée de `fullpath` (même nom de fichier sous un
    dossier d'un style quelconque dans une racine source), None si absente du
    cache. L'épars `/epars/_techno/x.mp3` a pour jumeau possible
    `/src/techno_1990/x.mp3` — recherche par nom de fichier."""
    filename = os.path.basename(fullpath)
    for src_root, files in (cache.get('source') or {}).items():
        for fn, meta in files.items():
            if fn != filename:
                continue
            if _style_from_source_path(meta.get('path', '')) is None:
                continue
            candidate = os.path.join(src_root, meta['path'])
            if candidate != fullpath:
                return candidate
    return None


def write_genre(path, style):
    """Écrit le style dans le tag genre natif du format ; retourne le tag.
    MP3 : TCON (v2.2 GP? ignoré — v2.3/v2.4 couverts). FLAC : GENRE (Vorbis).
    WAV : chunk ID3 (TCON). M4A : (c)gen."""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.mp3':
        try:
            tags = ID3(path)
        except ID3NoHeaderError:
            tags = ID3()
            tags.filename = path
        tags.add(TCON(encoding=0, text=style))
        tags.save()
        return 'TCON'
    if ext == '.flac':
        audio = FLAC(path)
        audio['GENRE'] = style
        audio.save()
        return 'GENRE'
    if ext == '.wav':
        audio = WAVE(path)
        if audio.tags is None:
            audio.add_tags()
        audio.tags.add(TCON(encoding=0, text=style))
        audio.save()
        return 'TCON'
    if ext in ('.m4a', '.mp4'):
        audio = MP4(path)
        if audio.tags is None:
            audio.add_tags()
        audio.tags['\xa9gen'] = [style]
        audio.save()
        return '\xa9gen'
    raise ValueError('format non gere : ' + ext)


def restore_genre(path, old_genre):
    """Restaure l'ancienne valeur : retire le tag genre si old était None
    (frame absent avant l'écriture), sinon réécrit old. Idempotent : renvoie
    True si une modification a eu lieu."""
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == '.mp3' or ext == '.wav':
            if ext == '.mp3':
                tags = ID3(path)
                save = tags.save
            else:
                audio = WAVE(path)
                tags = audio.tags
                if tags is None:
                    return False
                save = audio.save
            had = bool(tags.getall('TCON'))
            if old_genre is None:
                if not had:
                    return False
                tags.delall('TCON')
                save()
                return True
            tags.add(TCON(encoding=0, text=old_genre))
            save()
            return True
        if ext == '.flac':
            audio = FLAC(path)
            if old_genre is None:
                if 'GENRE' not in audio:
                    return False
                del audio['GENRE']
            else:
                audio['GENRE'] = old_genre
            audio.save()
            return True
        if ext in ('.m4a', '.mp4'):
            audio = MP4(path)
            if audio.tags is None:
                return False
            if old_genre is None:
                if '\xa9gen' not in audio.tags:
                    return False
                del audio.tags['\xa9gen']
            else:
                audio.tags['\xa9gen'] = [old_genre]
            audio.save()
            return True
    except Exception:
        return False
    return False


def journal_append(entry):
    entry['ts'] = time.strftime('%Y-%m-%dT%H:%M:%S')
    with open(JOURNAL, 'a') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')


def _paths_of(it):
    """(fichier principal, jumeau éventuel) — le jumeau est tagué avec le
    même style (la copie rangée ne doit pas garder 'Blues')."""
    if it.get('twin') and os.path.exists(it['twin']):
        return it['path'], it['twin']
    return it['path'], None


def do_dryrun(items, stats):
    by_ext = {}
    missing_twin = 0
    already = 0
    for it in items:
        ext = os.path.splitext(it['path'])[1].lower()
        by_ext[ext] = by_ext.get(ext, 0) + 1
        if current_genre(it['path']) == it['style']:
            already += 1
        if not it.get('twin'):
            missing_twin += 1
    print('=== DRY-RUN (aucune ecriture) ===')
    print('choix de style :', len(items))
    print('par extension :', dict(sorted(by_ext.items())))
    print('deja au style cible (a sauter) :', already)
    print('sans copie rangee retrouvee :', missing_twin)
    print('format non gere (ex. .wma) :', stats['unsupported'])
    print('introuvables sur disque :', stats['missing'])
    print('fichiers epars absents du disque comptes ci-dessus.')


def do_apply(items):
    ok = skip = err = 0
    for i, it in enumerate(items):
        path = it['path']
        style = it['style']
        try:
            if not os.path.exists(path):
                skip += 1
                print('MANQUANT   ', path, flush=True)
                continue
            main_path, twin_path = _paths_of(it)
            for target in (main_path, twin_path):
                if target is None:
                    continue
                cur = current_genre(target)
                if cur == style:
                    skip += 1
                    print('DEJA STYLE ', style, target, flush=True)
                    continue
                tag = write_genre(target, style)
                check = current_genre(target)
                journal_append({'path': target, 'old': cur, 'new': style,
                                'style': style, 'tag': tag,
                                'ok': check == style,
                                'twin': target == twin_path})
                if check == style:
                    ok += 1
                else:
                    err += 1
                    print('ECHEC VERIF', target, flush=True)
        except Exception as e:
            err += 1
            print('ERREUR     ', path, ':', e, flush=True)
        if (i + 1) % 50 == 0:
            print('[%d/%d] ok=%d skip=%d err=%d' % (i + 1, len(items), ok, skip, err),
                  flush=True)
    print('== APPLY : %d items : ok=%d skip=%d err=%d' % (len(items), ok, skip, err))


def do_undo(limit=None):
    """Restaure old_genre pour chaque écriture ok du journal (dans l'ordre —
    le journal est append-only, la dernière écriture d'un chemin est la
    bonne base de restauration)."""
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
        entries = entries[-limit:]
    # Dernière écriture par chemin (l'ordre inverse = la plus récente d'abord)
    last_by_path = {}
    for e in entries:
        last_by_path[e['path']] = e
    done = 0
    for e in reversed(entries):
        if last_by_path.get(e['path']) is not e:
            continue  # une écriture plus récente existe pour ce chemin
        try:
            if restore_genre(e['path'], e.get('old')):
                done += 1
            else:
                print('RIEN A RESTAURER', e['path'], flush=True)
        except Exception as ex:
            print('ERREUR UNDO', e['path'], ':', ex, flush=True)
    print('== UNDO : %d/%d genres restaurés' % (done, len(last_by_path)))


def journal_report():
    if not os.path.exists(JOURNAL):
        print('journal absent — aucune ecriture enregistrée')
        return
    ok = err = 0
    by_ext = {}
    with open(JOURNAL) as f:
        for line in f:
            line = line.strip()
            if line:
                e = json.loads(line)
                if e.get('ok'):
                    ok += 1
                    ext = os.path.splitext(e['path'])[1].lower()
                    by_ext[ext] = by_ext.get(ext, 0) + 1
                else:
                    err += 1
    print('journal : %d ecritures OK, %d echecs' % (ok, err))
    print('par extension :', dict(sorted(by_ext.items())))


def main():
    ap = argparse.ArgumentParser(
        description='Applique les styles choisis dans les tags ID3 (dry-run par défaut).')
    ap.add_argument('--apply', action='store_true',
                    help='ecrire reellement (défaut : dry-run)')
    ap.add_argument('--undo', action='store_true',
                    help='restaurer les anciens genres (journal)')
    ap.add_argument('--report', action='store_true',
                    help='resume du journal')
    ap.add_argument('--limit', type=int, default=None)
    args = ap.parse_args()
    if args.report:
        journal_report()
        return
    if args.undo:
        do_undo(args.limit)
        return
    items, stats = build_worklist(args.limit)
    if args.apply:
        do_apply(items)
    else:
        do_dryrun(items, stats)


if __name__ == '__main__':
    main()
