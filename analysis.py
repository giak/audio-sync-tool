"""Analyse audio serveur — BPM + phase (beatgrid) par pipeline DSP maison.

EPIC-010 (Beatgrid P3). Décision review KISS : PAS de librosa/madmom tant que
ce pipeline ne se prouve pas insuffisant (dépendances lourdes, madmom = RNN
sur-dimensionné pour le snap). Pipeline (plan §4, recherche web) :

  décodage (wave stdlib pour .wav, ffmpeg sinon) → mono ~4 kHz →
  filtre passe-bande 40–150 Hz (kick, biquad RBJ ordre 2) → ODF
  (RMS par frame 2048/hop 512 équivalent + diff half-wave) →
  autocorrélation (comb 4 harmoniques, port de beatgrid.ts) → BPM ;
  phase φ = argmax_φ Σ_k ODF(φ + k·T) (scan 5 ms).

Repli : piste sans kick 4/4 (breakbeat, ambiant) → même détection sur l'ODF
large bande (sans filtre) ; si toujours rien → bpm None (BPM manuel UI).

Décodage : .wav via stdlib wave (testable sans ffmpeg) ; autres formats via
ffmpeg -t 90 -ac 1 -ar 4000 -f s16le (le ré-échantillonnage ffmpeg fait
l'anti-alias). Borne : premières MAX_SECONDS secondes suffisent pour BPM+phase.
"""
import math
import struct
import subprocess
import wave

ANALYSIS_RATE = 4000      # Hz — ré-échantillonnage avant analyse (kick ≤ 150 Hz)
MAX_SECONDS = 90          # durée analysée (suffisant, borne le temps de calcul)
BANDPASS_LO, BANDPASS_HI = 40.0, 150.0
# frame 2048 / hop 512 à 44,1 kHz (≈ 46 ms / 11,6 ms) → équivalent à 4 kHz.
HOP = 46                  # hop en échantillons (512 × 4000 / 44100 ≈ 46,4)
FRAME = 4 * HOP           # frame = 4 × hop (comme 2048 = 4 × 512)
MIN_BPM, MAX_BPM = 70, 180
PHASE_SCAN_STEP_S = 0.005  # pas du scan de phase (5 ms)


class AnalysisError(Exception):
    """Décodage/analyse impossible (format, ffmpeg absent, audio vide…)."""


# ── Décodage ──────────────────────────────────────────────────────────────


def _decode_ffmpeg(path):
    """→ (samples float mono ~4 kHz, rate). ffmpeg fait la résample + anti-alias."""
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-t', str(MAX_SECONDS),
           '-ac', '1', '-ar', str(ANALYSIS_RATE), '-f', 's16le', '-']
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as exc:
        raise AnalysisError(f'ffmpeg indisponible : {exc}') from exc
    if proc.returncode != 0:
        err = proc.stderr.decode(errors='replace').strip()[:200]
        raise AnalysisError(f'décodage ffmpeg impossible : {err}')
    raw = proc.stdout
    if len(raw) < 2:
        raise AnalysisError('audio vide ou illisible')
    n = len(raw) // 2
    return [struct.unpack_from('<h', raw, i * 2)[0] / 32768.0 for i in range(n)], ANALYSIS_RATE


def _decode_wav_stdlib(path):
    """→ (samples float mono au taux natif, rate). Repli sans ffmpeg pour .wav."""
    try:
        with wave.open(path, 'rb') as w:
            ch = w.getnchannels()
            sw = w.getsampwidth()
            rate = w.getframerate()
            n = min(w.getnframes(), MAX_SECONDS * rate)
            raw = w.readframes(n)
    except (wave.Error, OSError) as exc:
        raise AnalysisError(f'WAV illisible : {exc}') from exc
    if sw not in (1, 2):
        raise AnalysisError('WAV : seuls 8/16 bits sont supportés (repli sans ffmpeg)')
    if sw == 1:
        samples = [(b - 128) / 128.0 for b in raw]
    else:
        n = len(raw) // 2
        samples = [struct.unpack_from('<h', raw, i * 2)[0] / 32768.0 for i in range(n)]
    if ch > 2:
        raise AnalysisError('WAV : mono/stéréo seulement (repli sans ffmpeg)')
    if ch == 2:
        samples = [(samples[i] + samples[i + 1]) * 0.5 for i in range(0, len(samples) - 1, 2)]
    return samples, rate


def decode_to_pcm(path):
    """→ (samples float mono, rate). ffmpeg d'abord ; .wav en repli stdlib."""
    try:
        return _decode_ffmpeg(path)
    except AnalysisError:
        if path.lower().endswith('.wav'):
            return _decode_wav_stdlib(path)
        raise


# ── DSP ───────────────────────────────────────────────────────────────────


def _biquad_bandpass(fs, f_lo, f_hi, q=None):
    """Coefficients biquad RBJ bandpass (ordre 2, gain de crête 0 dB).

    f0 = moyenne géométrique de la bande ; Q = f0 / largeur → pente douce,
    exactement le « thump » du kick 40–150 Hz sans résonance.
    """
    f0 = math.sqrt(f_lo * f_hi)
    if q is None:
        q = f0 / (f_hi - f_lo)
    w0 = 2 * math.pi * f0 / fs
    alpha = math.sin(w0) / (2 * q)
    b0, b1, b2 = alpha, 0.0, -alpha
    a0 = 1.0 + alpha
    a1, a2 = -2 * math.cos(w0), 1.0 - alpha
    return (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def _apply_biquad(samples, coeffs):
    """Passe le signal dans le biquad (boucle directe, ordre 2)."""
    b0, b1, b2, a1, a2 = coeffs
    out = [0.0] * len(samples)
    x1 = x2 = y1 = y2 = 0.0
    for i, x in enumerate(samples):
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[i] = y
        x2, x1 = x1, x
        y2, y1 = y1, y
    return out


def _odf(samples, hop=HOP):
    """ODF half-wave rectifiée : RMS par frame (stride 4, comme le client) puis
    différence première positive (max(0, RMS[n] − RMS[n−1]))."""
    frame = 4 * hop
    n = len(samples)
    rms = []
    i = 0
    while i + frame <= n:
        acc = 0.0
        cnt = 0
        for j in range(i, i + frame, 4):
            s = samples[j]
            acc += s * s
            cnt += 1
        rms.append(math.sqrt(acc / cnt))
        i += hop
    odf = []
    prev = 0.0
    for v in rms:
        odf.append(max(0.0, v - prev))
        prev = v
    return odf


def _detect_tempo(onsets, frame_rate, min_bpm=MIN_BPM, max_bpm=MAX_BPM):
    """Port serveur de detectTempoFromOnsets (beatgrid.ts) — comb 4 harmoniques.

    → (bpm arrondi 1 décimale, score de corrélation normalisé) ou (None, 0.0)
    si pas de périodicité exploitable (silence, bruit non rythmique).
    """
    n = len(onsets)
    if n < 20 or frame_rate <= 0:
        return None, 0.0
    mean = sum(onsets) / n
    variance = 0.0
    energy = 0.0
    for v in onsets:
        d = v - mean
        variance += d * d
        energy += v * v
    if variance <= energy * 1e-10:
        return None, 0.0
    min_lag = max(1, int(math.floor(frame_rate * 60 / max_bpm)))
    max_lag = min(n - 1, int(math.ceil(frame_rate * 60 / min_bpm)))
    if max_lag <= min_lag:
        return None, 0.0
    def score_at(lag):
        """Score du comb pour un lag donné (réutilisé par l'interpolation)."""
        if lag < 1 or lag >= n:
            return -1.0
        score = 0.0
        for k in range(1, 5):
            step = lag * k
            if step >= n:
                break
            w = 1.0 / k
            for i in range(n - step):
                score += w * (onsets[i] - mean) * (onsets[i + step] - mean)
        return score / variance

    best_lag, best_score = 0, -1.0
    for lag in range(min_lag, max_lag + 1):
        s = score_at(lag)
        if s > best_score:
            best_score, best_lag = s, lag
    if best_lag <= 0 or best_score <= 0:
        return None, 0.0
    # Interpolation parabolique autour du meilleur lag : le tempo réel tombe
    # souvent ENTRE deux frames ODF (ex. 126 BPM → lag 41,4). Sans affinage,
    # le BPM est quantifié (~±1,5 BPM) et la période dérive → le scan de phase
    # décroche. Parabole sur (lag−1, lag, lag+1) → lag fractionnaire précis.
    lag_float = float(best_lag)
    s_prev = score_at(best_lag - 1)
    s_next = score_at(best_lag + 1)
    denom = s_prev - 2 * best_score + s_next
    if abs(denom) > 1e-12:
        frac = 0.5 * (s_prev - s_next) / denom
        if -0.5 <= frac <= 0.5:
            lag_float += frac
    bpm = 60 * frame_rate / lag_float
    if not (20 <= bpm <= 400):
        return None, 0.0
    return round(bpm, 2), best_score


def _phase_scan(odf, frame_rate, bpm, step_s=PHASE_SCAN_STEP_S):
    """φ (secondes) = position du premier beat : argmax_φ Σ_k ODF(φ + k·T).

    Scan φ ∈ [0, T) par pas de 5 ms sur l'index ODF le plus proche (résolution
    ~11,6 ms à 4 kHz/hop 46 — le nudge manuel affine ensuite, EPIC-009).
    """
    period = 60.0 / bpm
    t_odf = 1.0 / frame_rate
    n = len(odf)
    best_phi, best = 0.0, -1.0
    phi = 0.0
    while phi < period - 1e-9:
        score = 0.0
        k = 0
        while True:
            idx = int(round((phi + k * period) / t_odf))
            if idx >= n:
                break
            score += odf[idx]
            k += 1
        if score > best:
            best, best_phi = score, phi
        phi += step_s
    return best_phi


def _decimate(samples, rate_in, rate_out=ANALYSIS_RATE):
    """Décimation moyenne glissante (anti-alias simple) vers ~rate_out Hz."""
    d = rate_in // rate_out
    if d < 2:
        return samples
    out = []
    acc = 0.0
    cnt = 0
    for s in samples:
        acc += s
        cnt += 1
        if cnt == d:
            out.append(acc / d)
            acc = 0.0
            cnt = 0
    return out


def analyze_samples(samples, rate):
    """DSP pur sur un signal mono float → {bpm, phase, confidence} ou None (< 2 s).

    Kick d'abord (ODF filtré 40–150 Hz) ; repli ODF large bande si aucun tempo
    (breakbeat/ambiant sans kick 4/4) ; sinon bpm None (BPM manuel UI).
    """
    if rate > ANALYSIS_RATE:
        samples = _decimate(samples, rate)
        rate = ANALYSIS_RATE
    if len(samples) < rate * 2:
        return None
    coeffs = _biquad_bandpass(rate, BANDPASS_LO, BANDPASS_HI)
    kick = _apply_biquad(samples, coeffs)
    odf = _odf(kick)
    bpm, score = _detect_tempo(odf, rate / HOP)
    used = odf
    if bpm is None:
        used = _odf(samples)
        bpm, score = _detect_tempo(used, rate / HOP)
    if bpm is None:
        return {'bpm': None, 'phase': None, 'confidence': 0.0}
    phase = _phase_scan(used, rate / HOP, bpm)
    confidence = max(0.0, min(1.0, score))
    return {'bpm': bpm, 'phase': round(phase, 3), 'confidence': round(confidence, 3)}


def analyze_path(path):
    """Analyse un fichier audio → {bpm, phase, confidence} (bpm None si échec)."""
    samples, rate = decode_to_pcm(path)
    return analyze_samples(samples, rate)
