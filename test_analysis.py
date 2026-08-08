"""Tests du pipeline DSP d'analyse kick/phase (EPIC-010).

Signal synthétique : kick 55 Hz amorti chaque beat (4/4), phase décalée —
le pipeline doit retrouver BPM et position du premier beat (phase).
"""
import math
import os
import struct
import wave

import pytest

from analysis import (AnalysisError, _apply_biquad, _biquad_bandpass, _decode_wav_stdlib,
                      _detect_tempo, _odf, _phase_scan, analyze_samples, decode_to_pcm)


def make_kick(bpm=128.0, phase=0.25, seconds=6.0, rate=44100, silence_before=None):
    """Génère un signal mono float : kick 55 Hz (enveloppe exponentielle 30 ms)
    chaque beat, positionné à `phase` + k·(60/bpm). Si silence_before est fourni,
    c'est la phase exacte (bruit non)."""
    n = int(seconds * rate)
    out = [0.0] * n
    if silence_before is None:
        silence_before = phase
    interval = 60.0 / bpm
    t = silence_before
    while t < seconds - 0.01:
        i0 = int(t * rate)
        # 30 ms de kick : sinus 55 Hz avec enveloppe exp(-t/0.008)
        for j in range(min(int(0.03 * rate), n - i0)):
            tt = j / rate
            out[i0 + j] = math.sin(2 * math.pi * 55 * tt) * math.exp(-tt / 0.008)
        t += interval
    return out


def write_kick_wav(path, bpm=128.0, phase=0.25, seconds=6.0, rate=44100, ch=1):
    """Écrit un WAV PCM 16-bit mono/stéréo du kick synthétique (tests décodage)."""
    sig = make_kick(bpm=bpm, phase=phase, seconds=seconds, rate=rate)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i, v in enumerate(sig):
            s = int(max(-1.0, min(1.0, v)) * 32767)
            frames += struct.pack('<h', s)
            if ch == 2:
                frames += struct.pack('<h', s)
        w.writeframes(bytes(frames))


# ── Détection BPM (autocorrélation comb) ──────────────────────────────────


def test_detect_tempo_finds_bpm_on_periodic_onsets():
    """Des onsets périodiques à 128 BPM → 128 (tolérance 1 BPM)."""
    frame_rate = 86.0  # ~4000/46, cf. HOP
    period = frame_rate * 60.0 / 128.0
    onsets = [0.0] * 1000
    k = 0
    while int(round(k * period)) < len(onsets):
        onsets[int(round(k * period))] = 1.0
        k += 1
    bpm, score = _detect_tempo(onsets, frame_rate)
    assert bpm == pytest.approx(128.0, abs=1.0)
    assert score > 0.5


def test_detect_tempo_flat_signal_returns_none():
    """Signal constant (variance nulle) → aucun tempo (pas d'erreur)."""
    assert _detect_tempo([0.5] * 200, 86.0) == (None, 0.0)
    assert _detect_tempo([], 86.0) == (None, 0.0)


def test_detect_tempo_harmonic_found_when_tempo_out_of_range():
    """Tempo vrai hors plage (≈ 25,8 BPM) : le comb retrouve l'HARMONIQUE dans
    la plage (période 200 frames ≡ lag 50 × 4) — comportement conçu (comme le
    client beatgrid.ts), le score sert de jauge de confiance."""
    frame_rate = 86.0
    onsets = [0.0] * 2000
    for i in range(0, 2000, 200):  # 25,8 BPM — hors plage 70–180
        onsets[i] = 1.0
    bpm, score = _detect_tempo(onsets, frame_rate)
    assert bpm is not None
    # période 200 frames → lag 50 → 60×86/50 = 103,2 BPM (4e harmonique du tempo réel)
    assert bpm == pytest.approx(103.2, abs=1.0)
    assert score > 0.1  # corrélation réelle mesurée (pics rares → score modéré)


# ── Filtre passe-bande kick ───────────────────────────────────────────────


def test_biquad_bandpass_passes_55hz_blocks_dc():
    """Le biquad 40–150 Hz laisse passer un 55 Hz et élimine la composante DC."""
    rate = 4000
    n = rate  # 1 s
    sig = [0.0] * n
    for i in range(n):
        t = i / rate
        sig[i] = 0.5 + 0.5 * math.sin(2 * math.pi * 55 * t)  # DC + 55 Hz
    coeffs = _biquad_bandpass(rate, 40.0, 150.0)
    out = _apply_biquad(sig, coeffs)
    # DC éliminé : moyenne quasi nulle après filtrage.
    mean = sum(out) / len(out)
    assert abs(mean) < 0.01
    # Le 55 Hz reste : amplitude RMS significative.
    rms = math.sqrt(sum(x * x for x in out) / len(out))
    assert rms > 0.05


# ── Scan de phase ─────────────────────────────────────────────────────────


def test_phase_scan_finds_first_beat():
    """ODF avec un pic à 0.25 s puis tous les 60/128 s → phase = 0.25 s (±0.02)."""
    bpm = 128.0
    frame_rate = 86.0
    t_odf = 1.0 / frame_rate
    n = int(6.0 * frame_rate)
    odf = [0.0] * n
    t = 0.25
    while t < 6.0:
        odf[int(round(t / t_odf))] = 1.0
        t += 60.0 / bpm
    phase = _phase_scan(odf, frame_rate, bpm)
    assert phase == pytest.approx(0.25, abs=0.02)


# ── Pipeline complet (signal synthétique) ─────────────────────────────────


@pytest.mark.parametrize('bpm,phase', [(128.0, 0.25), (124.0, 1.5), (126.0, 3.0)])
def test_analyze_samples_kick_bpm_and_phase(bpm, phase):
    """Pipeline complet : BPM ±2 et phase ±0.05 s sur un kick 4/4 synthétique.
    La phase est définie MODULO la période (scan φ ∈ [0, T) — grille identique)."""
    sig = make_kick(bpm=bpm, phase=phase, seconds=8.0)
    res = analyze_samples(sig, 44100)
    assert res is not None
    assert res['bpm'] == pytest.approx(bpm, abs=2.0)
    expected = phase % (60.0 / bpm)
    assert res['phase'] == pytest.approx(expected, abs=0.05)
    assert res['confidence'] > 0.3


def test_analyze_samples_silence_returns_none():
    """Silence → pas de tempo (bpm None, confiance 0) — pas d'exception."""
    res = analyze_samples([0.0] * (44100 * 4), 44100)
    assert res == {'bpm': None, 'phase': None, 'confidence': 0.0}


def test_analyze_samples_too_short_returns_none():
    """Moins de 2 s → None (pas d'analyse exploitable)."""
    assert analyze_samples(make_kick(seconds=0.5), 44100) is None


# ── Décodage WAV (repli stdlib, sans ffmpeg) ──────────────────────────────


def test_decode_wav_stdlib_mono(tmp_path):
    path = tmp_path / 'kick.wav'
    write_kick_wav(path, bpm=128.0, phase=0.25, seconds=2.0)
    samples, rate = _decode_wav_stdlib(str(path))
    assert rate == 44100
    assert len(samples) == 2 * 44100
    assert max(abs(s) for s in samples) > 0.5  # le kick est bien là


def test_decode_wav_stdlib_stereo_downmix(tmp_path):
    path = tmp_path / 'kick-stereo.wav'
    write_kick_wav(path, bpm=128.0, phase=0.25, seconds=2.0, ch=2)
    samples, rate = _decode_wav_stdlib(str(path))
    assert len(samples) == 2 * 44100  # downmix mono
    assert max(abs(s) for s in samples) > 0.5


def test_decode_wav_stdlib_rejects_non_wav(tmp_path):
    path = tmp_path / 'notaudio.wav'
    path.write_bytes(b'RIFFxxxxxxxx')
    with pytest.raises(AnalysisError):
        _decode_wav_stdlib(str(path))


def test_decode_to_pcm_wav_fallback_without_ffmpeg(tmp_path, monkeypatch):
    """decode_to_pcm sur un .wav fonctionne même si ffmpeg est indisponible."""
    path = tmp_path / 'kick.wav'
    write_kick_wav(path, bpm=128.0, phase=0.25, seconds=2.0)

    def boom(*_a, **_k):
        raise OSError('ffmpeg absent')

    monkeypatch.setattr('analysis.subprocess.run', boom)
    samples, rate = decode_to_pcm(str(path))
    assert rate == 44100
    assert len(samples) == 2 * 44100


def test_odf_edges():
    """_odf : pas d'erreur sur signal vide ou plus court qu'une frame."""
    assert _odf([]) == []
    assert _odf([0.1] * 10) == []  # < 1 frame
    odf = _odf([1.0] * 2000)
    assert len(odf) > 0
    assert all(v >= 0 for v in odf)  # half-wave : jamais négatif
