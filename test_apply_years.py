"""Tests de scripts/apply_years.py (EPIC-033 T3) — fichiers audio minimaux réels.
Sans réseau, sans toucher à data/ : caches et journal redirigés vers tmp_path."""
import json
import os
import struct
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import apply_years

pytestmark = pytest.mark.skipif(not apply_years.HAS_MUTAGEN, reason='mutagen requis')


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
    # 'fLaC' + STREAMINFO valide (34 o, entête de bloc = 3 octets de longueur) :
    # blocksize 4096/4096, sr 44100, mono, 16 bits
    sr_ch_bps = (44100 << 44) | (15 << 36)   # sr 20b | canaux-1 3b (0) | bps-1 5b
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


# ── Fixtures caches ──────────────────────────────────────────────────────────

@pytest.fixture
def env(tmp_path, monkeypatch):
    """Caches year/discogs + journal redirigés, base audio réelle."""
    music = tmp_path / 'music'
    music.mkdir()
    cache = {'source': {str(music): {}}}

    def add(name, **meta):
        (music / name).write_bytes(b'')
        m = {'path': name}
        m.update(meta)
        cache['source'][str(music)][name] = m

    add('t1.mp3')                       # found MB → candidat
    add('t2.flac')                      # found Deezer → candidat
    add('t3.wav')                       # found discogs_strict → candidat
    add('t4.wma')                       # found mais format non géré
    add('amb.wav')                      # ambigu → exclu
    add('lax.m4a')                      # discogs lax → exclu
    add('deja.mp3', year='2000')        # année au scan → pas candidat
    add('large.wav')                    # ambigu spread large → candidat via --review
    add('inconnu.mp3')                  # aucune clé found → no_match
    (music / '05. .mp3').write_bytes(b'')  # non parsable
    cache['source'][str(music)]['05. .mp3'] = {'path': '05. .mp3'}

    # Règle EPIC-040 : une année n'est écrite que si ≥2 providers INDÉPENDANTS
    # concordent — les fixtures donnent donc 2 votes par clé certaine (v≥2 =
    # moteur corrigé).
    ycache = tmp_path / 'year_cache.jsonl'
    ycache.write_text('\n'.join(json.dumps(r) for r in [
        {'key': '\tt1', 'status': 'found', 'year': '1990', 'v': 2,
         'sources': {'musicbrainz': '1990', 'discogs': '1990'}},
        {'key': '\tt2', 'status': 'found', 'year': '1995', 'v': 2,
         'sources': {'deezer': '1995', 'musicbrainz': '1995'}},
        {'key': '\tt4', 'status': 'found', 'year': '1985', 'v': 2,
         'sources': {'musicbrainz': '1985', 'itunes': '1985'}},
        # v1 : moteur d'avant la garde → ignoré (à re-collecter)
        {'key': '\tv1_seul', 'status': 'found', 'year': '2024', 'source': 'deezer'},
        # une seule source : JAMAIS écrite (revue humaine)
        {'key': '\tune_source', 'status': 'single', 'year': '2024', 'v': 2,
         'sources': {'deezer': '2024'}},
        {'key': '\tamb', 'status': 'ambiguous', 'year': None,
         'years': ['1996', '1999', '2005']},  # spread large → reste ambigu
        {'key': '\tserre', 'status': 'ambiguous', 'year': None,
         'years': ['2002', '2003']},          # un seul provider ambigu → revue
        {'key': '\tlarge', 'status': 'ambiguous', 'year': None,
         'years': ['1995', '2014']},          # spread large → reste ambigu
    ]) + '\n')
    dcache = tmp_path / 'discogs_cache.jsonl'
    dcache.write_text('\n'.join(json.dumps(r) for r in [
        {'key': '\tt3', 'status': 'found', 'year': '2001', 'source': 'discogs_strict'},
        {'key': '\tlax', 'status': 'lax', 'year': '2010'},
    ]) + '\n')
    monkeypatch.setattr(apply_years, 'CACHE', str(tmp_path / 'cache.json'))
    monkeypatch.setattr(apply_years, 'YEAR_CACHE', str(ycache))
    monkeypatch.setattr(apply_years, 'DG_CACHE', str(dcache))
    monkeypatch.setattr(apply_years, 'JOURNAL', str(tmp_path / 'journal.jsonl'))
    # Caches iTunes + reform + choix de revue : vides par défaut (redirigés).
    monkeypatch.setattr(apply_years, 'IT_CACHE', str(tmp_path / 'itunes_cache.jsonl'))
    monkeypatch.setattr(apply_years, 'RF_CACHE', str(tmp_path / 'discogs_reform_cache.jsonl'))
    monkeypatch.setattr(apply_years, 'RF2_CACHE', str(tmp_path / 'discogs_reform2_cache.jsonl'))
    # YouTube : 5ᵉ pool d'appoint depuis le retrait de Beatport (EPIC-049).
    monkeypatch.setattr(apply_years, 'YT_CACHE', str(tmp_path / 'youtube_topic_cache.jsonl'))
    monkeypatch.setattr(apply_years, 'REVIEW_PATH', str(tmp_path / 'year_review.json'))
    for p in ('itunes_cache.jsonl', 'discogs_reform_cache.jsonl',
              'youtube_topic_cache.jsonl'):
        (tmp_path / p).write_text('')
    # iTunes corrobore t3 (discogs_strict 2001) : 2 providers indépendants.
    (tmp_path / 'itunes_cache.jsonl').write_text(
        json.dumps({'key': '\tt3', 'status': 'found', 'year': '2001',
                    'source': 'itunes'}) + '\n')
    (tmp_path / 'cache.json').write_text(json.dumps(cache))
    return tmp_path, music


# ── Tests ────────────────────────────────────────────────────────────────────

def test_load_found_exige_deux_providers(env):
    """Règle EPIC-040 : corroboration par 2 providers indépendants."""
    found = apply_years.load_found()
    assert found['\tt1'] == ('1990', 'discogs+musicbrainz')   # 2 providers concordants
    assert found['\tt2'] == ('1995', 'deezer+musicbrainz')
    assert found['\tt3'] == ('2001', 'discogs+itunes')  # discogs + pool iTunes
    assert '\tamb' not in found      # ambigu exclu
    assert '\tlax' not in found      # discogs lax exclu
    # une seule source ne conclut JAMAIS (le 2024 de Deezer seul, c'est l'erreur)
    assert '\tune_source' not in found
    assert '\tv1_seul' not in found  # moteur v1 (sans garde) → ignoré
    # ambigu d'un seul provider : plus de « consensus » silencieux → revue
    assert '\tserre' not in found
    assert '\tlarge' not in found    # spread large = vraies sorties distinctes
    assert found.get('\tamb') is None


def test_pools_comptent_une_voix_par_provider(env):
    """Les pools d'appoint comptent UNE voix par provider indépendant :
    iTunes seul ne conclut pas ; iTunes + Discogs concordants concluent ;
    reform/reform2 ne doublent pas Discogs (c'est le même site) ; une année
    discordante du pool n'écrase pas la vague corroborée."""
    tmp_path, _ = env
    (tmp_path / 'itunes_cache.jsonl').write_text(json.dumps(
        {'key': '\tnouveau_it', 'status': 'found', 'year': '1985',
         'source': 'itunes'}) + '\n')
    assert '\tnouveau_it' not in apply_years.load_found()   # une voix : insuffisant

    with open(tmp_path / 'discogs_cache.jsonl', 'a') as f:
        f.write(json.dumps({'key': '\tnouveau_it', 'status': 'found',
                            'year': '1985', 'source': 'discogs_strict'}) + '\n')
    found = apply_years.load_found()
    assert found['\tnouveau_it'] == ('1985', 'discogs+itunes')

    # reform et reform2 sont deux requêtes Discogs : pas de corroboration interne
    for name in ('discogs_reform_cache.jsonl', 'discogs_reform2_cache.jsonl'):
        (tmp_path / name).write_text(json.dumps(
            {'key': '\tseul_reform', 'status': 'found', 'year': '1977',
             'source': 'reform_discogs'}) + '\n')
    assert '\tseul_reform' not in apply_years.load_found()

    # désaccord entre providers : jamais écrit (revue)
    with open(tmp_path / 'youtube_topic_cache.jsonl', 'w') as f:
        f.write(json.dumps({'key': '\tnouveau_it', 'status': 'found',
                            'year': '2001', 'source': 'youtube_topic_strict'}) + '\n')
    assert '\tnouveau_it' not in apply_years.load_found()


def test_review_override_et_rejets_ignores(env):
    """--review : un choix humain OVERRIDE la consolidation (source 'review') ;
    les rejets (null) sont ignorés ; fichier corrompu → {} ; sans --review,
    les choix sont ignorés."""
    tmp_path, _ = env
    (tmp_path / 'year_review.json').write_text(json.dumps({
        '\tlarge': '2014',       # ambigu spread large → l'humain tranche
        '\tnon\tpas': None,      # rejet : ignoré
    }))
    review = apply_years.load_review()
    assert review == {'\tlarge': '2014'}
    items, _ = apply_years.build_worklist(review=review)
    large = next(i for i in items if os.path.basename(i['path']) == 'large.wav')
    assert (large['year'], large['source']) == ('2014', 'review')
    # Re-vérification : sans review, large.wav n'est PAS candidat
    items0, _ = apply_years.build_worklist()
    assert not any(os.path.basename(i['path']) == 'large.wav' for i in items0)
    # Fichier corrompu → {}
    (tmp_path / 'year_review.json').write_text('{oops')
    assert apply_years.load_review() == {}


def test_build_worklist_selection(env):
    tmp_path, music = env
    items, stats = apply_years.build_worklist()
    names = {os.path.basename(i['path']) for i in items}
    assert names == {'t1.mp3', 't2.flac', 't3.wav'}
    assert stats['no_match'] >= 2      # inconnu + lax + amb
    assert stats['unsupported'] == 1   # le .wma
    assert stats['parse_fail'] == 1    # '05. .mp3'
    # 'deja.mp3' a une année au scan → jamais candidat
    assert 'deja.mp3' not in names


def test_mp3_tdrc_sur_tag_v24(env):
    _, music = env
    p = str(music / 't1.mp3')
    make_mp3(p, v2_version=4)
    frame = apply_years.write_year(p, '1990')
    assert frame == 'TDRC'
    assert apply_years.current_year(p) == '1990'


def test_mp3_tyer_sur_tag_v23(env):
    _, music = env
    p = str(music / 't1.mp3')
    make_mp3(p, v2_version=3)
    frame = apply_years.write_year(p, '1990')
    assert frame == 'TYER'
    assert apply_years.current_year(p) == '1990'


def test_flac_date_write_and_undo(env):
    _, music = env
    p = str(music / 't2.flac')
    make_flac(p)
    assert apply_years.current_year(p) is None
    assert apply_years.write_year(p, '1995') == 'DATE'
    assert apply_years.current_year(p) == '1995'
    assert apply_years.remove_year_frame(p, 'DATE') is True
    assert apply_years.current_year(p) is None
    # idempotent : rien à retirer une seconde fois
    assert apply_years.remove_year_frame(p, 'DATE') is False


def test_wav_write_and_undo(env):
    _, music = env
    p = str(music / 't3.wav')
    make_wav(p)
    assert apply_years.write_year(p, '2001') == 'TDRC'
    assert apply_years.current_year(p) == '2001'
    assert apply_years.remove_year_frame(p, 'TDRC') is True
    assert apply_years.current_year(p) is None


def test_mp3_sans_header_id3v2(env):
    """MP3 sans aucun header ID3v2 (brut ou ID3v1 seul) : un tag est créé."""
    _, music = env
    p = str(music / 't1.mp3')
    with open(p, 'wb') as f:      # 3 frames MPEG, aucun tag
        for _ in range(3):
            f.write(b'\xff\xfb\x90\x00' + b'\x00' * 413)
    assert apply_years.current_year(p) is None
    assert apply_years.write_year(p, '1988') == 'TDRC'
    assert apply_years.current_year(p) == '1988'


def test_apply_journalise_et_verifie(env, capsys):
    _, music = env
    make_mp3(str(music / 't1.mp3'))
    make_wav(str(music / 't3.wav'))
    make_flac(str(music / 't2.flac'))
    (music / 't2.flac').unlink()       # candidat disparu du disque
    items, _ = apply_years.build_worklist()
    apply_years.do_apply(items)
    out = capsys.readouterr().out
    assert '== APPLY : 3 items : ok=' in out
    assert 'MANQUANT' in out
    # journal : 2 écritures ok (mp3 + wav), le fichier absent est skip
    entries = [json.loads(l) for l in open(apply_years.JOURNAL) if l.strip()]
    assert len([e for e in entries if e['ok']]) == 2
    assert entries[0]['new'] == '1990' and entries[0]['frame'] == 'TDRC'
    assert apply_years.current_year(str(music / 't1.mp3')) == '1990'
    assert apply_years.current_year(str(music / 't3.wav')) == '2001'


def test_apply_idempotent_ne_crase_pas(env, capsys):
    _, music = env
    make_mp3(str(music / 't1.mp3'))
    items, _ = apply_years.build_worklist()
    apply_years.do_apply(items)
    apply_years.do_apply(items)        # second passage : tout skip
    out = capsys.readouterr().out
    assert 'DEJA ANNEE' in out
    entries = [json.loads(l) for l in open(apply_years.JOURNAL) if l.strip()]
    assert len([e for e in entries if e['ok']]) == 1


def test_undo_restablit_lenregistre(env, capsys):
    _, music = env
    make_mp3(str(music / 't1.mp3'))
    p = str(music / 't1.mp3')
    items, _ = apply_years.build_worklist()
    apply_years.do_apply(items)
    assert apply_years.current_year(p) == '1990'
    apply_years.do_undo()
    assert apply_years.current_year(p) is None
    apply_years.do_undo()              # idempotent
    out = capsys.readouterr().out
    assert 'RIEN A RETIRER' in out


def test_undo_restaure_une_correction(env, capsys):
    """Les corrections d'audit (EPIC-040) ne sont pas additives : `old` est
    renseigné. `--undo` doit alors RESTAURER l'ancienne année, pas retirer le
    frame — sinon une correction d'année serait irréversible."""
    _, music = env
    p = str(music / 't1.mp3')
    make_mp3(p)
    apply_years.write_year(p, '2024')            # année fausse en place
    apply_years.journal_append({'path': p, 'old': '2024', 'new': '1991',
                                'source': 'audit:discogs', 'frame': 'TDRC',
                                'ok': True})
    apply_years.write_year(p, '1991')
    assert apply_years.current_year(p) == '1991'
    apply_years.do_undo()
    assert apply_years.current_year(p) == '2024'  # restaurée, pas effacée
    out = capsys.readouterr().out
    assert '1 anciennes années restaurées' in out


def test_dryrun_necrit_rien(env, capsys):
    _, music = env
    make_flac(str(music / 't2.flac'))
    before = (music / 't2.flac').read_bytes()
    items, stats = apply_years.build_worklist()
    apply_years.do_dryrun(items, stats)
    assert (music / 't2.flac').read_bytes() == before
    assert not os.path.exists(apply_years.JOURNAL)
