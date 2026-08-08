# EPIC-010 — Beatgrid P3 : analyse serveur kick/phase (basse/rythme)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P3, §4 (recherche web)

## Objectif

Calculer le **calage BPM + phase** côté serveur pour les **76,3 % de pistes sans grille native** (ni
TEMPO ni TYPE=4, mesuré sur la collection réelle — voir EPIC-008), avec un
vrai calage sur la basse/le kick — pas seulement un BPM à phase 0.

## Contexte (recherche web — plan §4)

- **Kick = ancre rythmique** (EDM/techno 4/4) : filtre passe-bande **40–150 Hz** (Butterworth 2–4) →
  ODF (`max(0, RMS[n] − RMS[n−1])`, frame 2048/hop 512) → autocorrélation → BPM ; **phase** =
  `argmax_φ Σ_k ODF(φ + k·T)` (scan φ ∈ [0, T], pas ~5 ms).
- Options : **librosa** `beat_track` (tempo+phase, DP Ellis 2007) · **madmom** `DBNDownBeatTracker`
  (RNN+DBN, downbeat 1 natif, état de l'art) · **essentia** `RhythmExtractor2013` · pipeline maison.
- Dépendances à documenter (numpy/scipy/librosa) ; analyse **une fois par piste** (premières 60–90 s
  suffisent), mise en cache (cf. EPIC-009).

## Tâches (réalisées)

- [x] **Pipeline DSP maison** (pas librosa/madmom — décision review KISS) : `analysis.py` en pur Python
      (stdlib + ffmpeg subprocess, ZÉRO dépendance lourde). Décodage : `.wav` via stdlib `wave`
      (testable sans ffmpeg), autres formats via ffmpeg `-t 90 -ac 1 -ar 4000 -f s16le` (anti-alias
      fait par la résample). Pipeline : filtre passe-bande 40–150 Hz (biquad RBJ ordre 2) → ODF
      (RMS frame 2048/hop 512 équivalent + diff half-wave) → autocorrélation comb 4 harmoniques
      (port de `detectTempoFromOnsets` beatgrid.ts) → BPM ; **interpolation parabolique du lag**
      (précision sub-frame : sans elle, 126 BPM tombe entre 2 frames ODF → période dérivée → phase
      fausse) ; scan de phase φ = argmax Σ ODF(φ + k·T), pas 5 ms.
- [x] Endpoint `POST /api/track/analyze` (path) → `{bpm, phase, confidence}` ; 404 fichier absent,
      403 hors dossiers (réutilise `_beatgrid_path_or_error` d'EPIC-009), 422 décodage impossible.
- [x] Bouton « 🔍 Analyser » à la demande dans l'éditeur (état ⏳ disabled, ré-armé en finally) — en
      plus de l'auto-détection client au ready. Ne remplace JAMAIS une grille native NML active
      (cascade native > analyse).
- [x] Résultat écrit dans le cache beatgrid (EPIC-009) avec `source: 'detected'` + `confidence` ;
      `GET /api/beatgrid` renvoie la confidence ; badge `auto · 87 %`.
- [x] Repli : pas de kick 4/4 (breakbeat, ambiant) → ODF large bande (sans filtre) ; si toujours rien
      → `bpm: null` + notice → saisie BPM manuelle.
- [x] Tests : `test_analysis.py` (15 tests DSP sur kick synthétique : BPM/phase modulo T, biquad
      DC+55 Hz, scan de phase, décodage WAV mono/stéréo, fallback sans ffmpeg) ; `test_app.py`
      (endpoint kick → BPM/phase/confidence + cache persisté, silence → null + notice, 400/404/403).

## Fichiers impactés

`analysis.py` (nouveau) · `app.py` (`POST /api/track/analyze`, GET beatgrid + confidence) ·
`static/src/render/cueEditor.ts` (`analyzeOnServer`, `_confidence`, badge %) ·
`templates/index.html` (bouton 🔍 Analyser) · `static/style.css` (état ⏳) · `test_analysis.py`
(nouveau) · `test_app.py` · `static/src/render/cueEditor.test.ts`

**Aucune nouvelle dépendance** : `requirements.txt` inchangé (ffmpeg = binaire système, déjà présent
sur ubuntu-latest et la machine ; le repli stdlib `wave` couvre les .wav sans lui).

## Dépendances

- Cache beatgrid (EPIC-009) pour la persistance.
- Le downbeat (barres numérotées exactes) n'est utile que si l'affichage des barres est livré (EPIC-012) ;
  la **phase** seule suffit pour le snap (priorité).

## Notes / Risques

- Temps de calcul borné : `-t 90` à ffmpeg (60–90 s suffisent pour BPM+phase), env. 2–3 s en pur
  Python — acceptable pour un bouton à la demande (jamais sur le chemin de l'auto-détection).
- `madmom` reste à réserver si le downbeat (barres numérotées) devient nécessaire (EPIC-012).
- La phase est définie **modulo la période** (scan φ ∈ [0, T)) — grille équivalente, comme Traktor.
- Le repli large bande n'est pas un détecteur de downbeat : il donne BPM+phase sur le flux global
  quand le kick 4/4 est absent ; si même ça échoue → BPM manuel (UI existante).

## Validation (2026-08-08)

- **635 vitest** (8 nouveaux : bouton → POST + application bpm/phase/confiance, badge « auto · % »,
  grille native non écrasée, grille MANUELLE non écrasée, notice bpm null, erreur API, double clic
  → 1 requête, reset à la fermeture) / **153 pytest** (15 `test_analysis.py` + 4 endpoint : kick,
  silence → null, corrompu → 422, erreurs 400/404/403) — shuffle vert.
- Typecheck 0 · Lint 0 · Build OK. Aucun commit (working tree à commiter avec EPIC-009 suite).
