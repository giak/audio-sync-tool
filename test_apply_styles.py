"""Tests de scripts/apply_styles.py (EPIC-035 P3) — fichiers audio minimaux réels.
Sans réseau, sans toucher à data/ : cache et journal redirigés vers tmp_path.
Fabriques : mêmes patterns que test_apply_years.py."""
import json
import os
import struct
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import apply_styles

pytestmark = pytest.mark.skipif(not apply_styles.HAS_MUTAGEN, reason='mutagen requis')


# ── Fabriques de fichiers audio minimaux (valides pour mutagen) ─────────────

def make_mp3(path, v2_version=4):
    from mutagen.id3 import ID3, TIT2
    tags = ID3()
    tags.add(TIT2(encoding=0, text='x'))
    tags.save(path, v2_version=v2_version)
    # mutagen exige une synchro MPEG : 3 frames complètes (417 o à 128k/44,1 kHz)
    with open(path, 'ab') as f:
        for _ in range(3):
            f.write(b'\xff\xfb\x90\x00' + b'\x00' * 413)


def make_flac(path):
    sr_ch_bps = (44100 << 44) | (15 << 36)
    streaminfo = (struct.pack('>HH', 4096, 4096)
                  + b'\x00\x00\x00' + b'\x00\x00\x00'
                  + struct.pack('>Q', sr_ch_bps) + bytes(16))
    with open(path, 'wb') as f:
        f.write(b'fLaC' + bytes([0x80]) + b'\x00\x00' + bytes([len(streaminfo)]) + streaminfo)


def make_wav(path):
    fmt = struct.pack('<HHIIHH', 1, 1, 44100, 88200, 2, 16)
    data = b'\x00' * 8
    riff = b'WAVE' + b'fmt ' + struct.pack('<I', len(fmt)) + fmt + \
        b'data' + struct.pack('<I', len(data)) + data
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', len(riff)) + riff)


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def env(tmp_path, monkeypatch):
    """Cache + review + journal redirigés, base audio réelle.
    Structure : /epars (fichiers épars), /src/techno_1990 (copie rangée)."""
    epars = tmp_path / 'epars' / '_techno'
    epars.mkdir(parents=True)
    src = tmp_path / 'src' / 'techno_1990'
    src.mkdir(parents=True)
    epars_root = tmp_path / 'epars'

    cache = {
        'source': {str(tmp_path / 'src'): {
            't1.mp3': {'path': 'techno_1990/t1.mp3', 'year': None, 'duration': None, 'codec': None},
        }},
        'epars': {str(epars): {
            't1.mp3': {'path': '_techno/t1.mp3', 'year': None, 'duration': None, 'codec': None},
            't2.flac': {'path': '_techno/t2.flac', 'year': None, 'duration': None, 'codec': None},
            't3.wav': {'path': '_techno/t3.wav', 'year': None, 'duration': None, 'codec': None},
            't4.m4a': {'path': '_techno/t4.m4a', 'year': None, 'duration': None, 'codec': None},
            't5.wma': {'path': '_techno/t5.wma', 'year': None, 'duration': None, 'codec': None},
            'sansCopie.mp3': {'path': '_techno/sansCopie.mp3', 'year': None, 'duration': None, 'codec': None},
        }},
    }
    (tmp_path / 'cache.json').write_text(json.dumps(cache))

    # Le review pointe les fullpaths épars ; les fichiers sont créés réels
    # par les tests (make_*), les entrées cache servent surtout _twin_copy_path.
    review = {
        str(epars / 't1.mp3'): {'style': 'techno', 'tranche': 1990},
        str(epars / 't2.flac'): {'style': 'techno', 'tranche': 1990},
        str(epars / 't3.wav'): {'style': 'techno', 'tranche': 1990},
        str(epars / 't4.m4a'): {'style': 'techno', 'tranche': 1990},
        str(epars / 't5.wma'): {'style': 'techno', 'tranche': 1990},
        str(epars / 'sansCopie.mp3'): {'style': 'techno', 'tranche': 1990},
    }
    (tmp_path / 'style_review.json').write_text(json.dumps(review))

    monkeypatch.setattr(apply_styles, 'CACHE', str(tmp_path / 'cache.json'))
    monkeypatch.setattr(apply_styles, 'REVIEW_PATH', str(tmp_path / 'style_review.json'))
    monkeypatch.setattr(apply_styles, 'JOURNAL', str(tmp_path / 'journal.jsonl'))
    return tmp_path, epars, src


# ── load_review ─────────────────────────────────────────────────────────────

def test_load_review_filtre(env):
    tmp_path, _, _ = env
    review = apply_styles.load_review()
    assert review[str(tmp_path / 'epars' / '_techno' / 't1.mp3')] == ('techno', 1990)
    # Fichier corrompu → {}
    (tmp_path / 'style_review.json').write_text('{oops')
    assert apply_styles.load_review() == {}
    # Absent → {}
    os.remove(tmp_path / 'style_review.json')
    assert apply_styles.load_review() == {}


# ── current_genre / write_genre / restore_genre ─────────────────────────────

def test_mp3_tcon_write_and_restore(env):
    _, epars, _ = env
    p = str(epars / 't1.mp3')
    make_mp3(p)
    assert apply_styles.current_genre(p) is None
    assert apply_styles.write_genre(p, 'techno') == 'TCON'
    assert apply_styles.current_genre(p) == 'techno'
    # restore None → retire le tag ; idempotent
    assert apply_styles.restore_genre(p, None) is True
    assert apply_styles.current_genre(p) is None
    assert apply_styles.restore_genre(p, None) is False
    # restore avec ancienne valeur → réécrit
    apply_styles.write_genre(p, 'techno')
    assert apply_styles.restore_genre(p, 'Blues') is True
    assert apply_styles.current_genre(p) == 'Blues'


def test_flac_genre_write_and_restore(env):
    _, epars, _ = env
    p = str(epars / 't2.flac')
    make_flac(p)
    assert apply_styles.current_genre(p) is None
    assert apply_styles.write_genre(p, 'techno') == 'GENRE'
    assert apply_styles.current_genre(p) == 'techno'
    assert apply_styles.restore_genre(p, None) is True
    assert apply_styles.current_genre(p) is None
    assert apply_styles.restore_genre(p, None) is False


def test_wav_tcon_write_and_restore(env):
    _, epars, _ = env
    p = str(epars / 't3.wav')
    make_wav(p)
    assert apply_styles.write_genre(p, 'techno') == 'TCON'
    assert apply_styles.current_genre(p) == 'techno'
    assert apply_styles.restore_genre(p, None) is True


def test_m4a_gen_write_and_restore(env):
    _, epars, _ = env
    p = str(epars / 't4.m4a')
    # M4A minimal réel : boîtes ftyp+moov+free (mutagen tolère et complète)
    def make_m4a(path):
        ftyp = b'\x00\x00\x00\x18ftypM4A \x00\x00\x02\x00isomiso2'
        moov = b'\x00\x00\x00\x08moov'
        with open(path, 'wb') as f:
            f.write(ftyp + moov)
    make_m4a(p)
    from mutagen.mp4 import MP4
    MP4(p).add_tags()
    assert apply_styles.write_genre(p, 'techno') == '\xa9gen'
    assert apply_styles.current_genre(p) == 'techno'
    assert apply_styles.restore_genre(p, None) is True


def test_mp3_remplace_ancien_genre(env):
    """TCON est un tag REMPLACÉ : l'ancien genre disparaît (c'est le but)."""
    _, epars, _ = env
    p = str(epars / 't1.mp3')
    make_mp3(p)
    apply_styles.write_genre(p, 'Blues')
    assert apply_styles.current_genre(p) == 'Blues'
    apply_styles.write_genre(p, 'techno')
    assert apply_styles.current_genre(p) == 'techno'


# ── build_worklist ──────────────────────────────────────────────────────────

def test_build_worklist_twin_et_stats(env):
    tmp_path, epars, src = env
    make_mp3(str(epars / 't1.mp3'))
    make_mp3(str(src / 't1.mp3'))
    make_mp3(str(epars / 'sansCopie.mp3'))
    items, stats = apply_styles.build_worklist()
    by_name = {os.path.basename(i['path']): i for i in items}
    # t1 a une copie rangée (même nom sous techno_1990)
    assert by_name['t1.mp3']['twin'] == str(src / 't1.mp3')
    # sansCopie n'a pas de jumeau
    assert by_name['sansCopie.mp3']['twin'] is None
    assert stats['no_twin'] >= 1
    # .wma exclu
    assert all(os.path.basename(i['path']) != 't5.wma' for i in items)
    assert stats['unsupported'] == 1


# ── do_apply ────────────────────────────────────────────────────────────────

def test_apply_epars_et_jumeau_journalise_old(env, capsys):
    """L'apply tague l'épars ET la copie rangée, journalise old_genre."""
    _, epars, src = env
    make_mp3(str(epars / 't1.mp3'))
    make_mp3(str(src / 't1.mp3'))
    # La copie a déjà un genre 'Blues' → old doit être journalisé
    apply_styles.write_genre(str(src / 't1.mp3'), 'Blues')
    items, _ = apply_styles.build_worklist()
    apply_styles.do_apply(items)
    out = capsys.readouterr().out
    assert '== APPLY : 1 items : ok=' in out
    entries = [json.loads(l) for l in open(apply_styles.JOURNAL) if l.strip()]
    ok_entries = [e for e in entries if e['ok']]
    assert len(ok_entries) == 2  # épars + jumeau
    twin_entry = next(e for e in ok_entries if e.get('twin'))
    assert twin_entry['old'] == 'Blues'
    assert twin_entry['new'] == 'techno'
    assert apply_styles.current_genre(str(epars / 't1.mp3')) == 'techno'
    assert apply_styles.current_genre(str(src / 't1.mp3')) == 'techno'


def test_apply_idempotent_ne_reecrit_pas(env, capsys):
    _, epars, _ = env
    make_mp3(str(epars / 't1.mp3'))
    items, _ = apply_styles.build_worklist()
    apply_styles.do_apply(items)
    n1 = len([l for l in open(apply_styles.JOURNAL) if l.strip()])
    apply_styles.do_apply(items)        # second passage : tout skip
    out = capsys.readouterr().out
    assert 'DEJA STYLE' in out
    n2 = len([l for l in open(apply_styles.JOURNAL) if l.strip()])
    assert n1 == n2


def test_apply_manquant_exclu_du_worklist(env, capsys):
    """Un fichier listé dans le review mais absent du disque est exclu par
    build_worklist (stats['missing']) — l'apply ne le voit jamais."""
    _, _, _ = env
    items, stats = apply_styles.build_worklist()
    # t2.flac, t3.wav, t4.m4a, t5.wma, sansCopie.mp3 : absents du disque
    assert stats['missing'] == 5
    assert all(os.path.basename(i['path']) != 't2.flac' for i in items)
    # L'apply sur ces items (aucun) ne touche à rien
    apply_styles.do_apply(items)
    out = capsys.readouterr().out
    assert 'MANQUANT' not in out


# ── do_undo ─────────────────────────────────────────────────────────────────

def test_undo_restablit_les_deux_exemplaires(env, capsys):
    _, epars, src = env
    make_mp3(str(epars / 't1.mp3'))
    make_mp3(str(src / 't1.mp3'))
    apply_styles.write_genre(str(src / 't1.mp3'), 'Blues')
    items, _ = apply_styles.build_worklist()
    apply_styles.do_apply(items)
    assert apply_styles.current_genre(str(epars / 't1.mp3')) == 'techno'
    assert apply_styles.current_genre(str(src / 't1.mp3')) == 'techno'
    apply_styles.do_undo()
    assert apply_styles.current_genre(str(epars / 't1.mp3')) is None
    assert apply_styles.current_genre(str(src / 't1.mp3')) == 'Blues'
    apply_styles.do_undo()              # idempotent
    out = capsys.readouterr().out
    assert 'RIEN A RESTAURER' in out


def test_undo_derniere_ecriture_gagne(env, capsys):
    """Deux écritures successives du même fichier : l'undo restaure l'old de
    la DERNIÈRE écriture (pas celle d'avant)."""
    _, epars, _ = env
    p = str(epars / 't1.mp3')
    make_mp3(p)
    apply_styles.write_genre(p, 'Blues')      # old=None, new=Blues
    items = [{'path': p, 'style': 'techno', 'twin': None}]
    apply_styles.do_apply(items)              # old=Blues, new=techno
    apply_styles.do_apply(items)              # skip (déjà techno)
    apply_styles.do_undo()
    assert apply_styles.current_genre(p) == 'Blues'


# ── do_dryrun ───────────────────────────────────────────────────────────────

def test_dryrun_necrit_rien(env, capsys):
    _, epars, _ = env
    make_mp3(str(epars / 't1.mp3'))
    before = (epars / 't1.mp3').read_bytes()
    items, stats = apply_styles.build_worklist()
    apply_styles.do_dryrun(items, stats)
    assert (epars / 't1.mp3').read_bytes() == before
    assert not os.path.exists(apply_styles.JOURNAL)


# ── journal_report ──────────────────────────────────────────────────────────

def test_journal_report(env, capsys):
    _, epars, _ = env
    make_mp3(str(epars / 't1.mp3'))
    items, _ = apply_styles.build_worklist()
    apply_styles.do_apply(items)
    apply_styles.journal_report()
    out = capsys.readouterr().out
    assert '1 ecritures OK' in out
