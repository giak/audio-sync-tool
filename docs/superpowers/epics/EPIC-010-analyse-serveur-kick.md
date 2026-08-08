# EPIC-010 — Beatgrid P3 : analyse serveur kick/phase (basse/rythme)

> **Statut** : ⚪ Backlog
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P3, §4 (recherche web)

## Objectif

Calculer le **calage BPM + phase** côté serveur pour les **76 % de pistes sans grille native**, avec un
vrai calage sur la basse/le kick — pas seulement un BPM à phase 0.

## Contexte (recherche web — plan §4)

- **Kick = ancre rythmique** (EDM/techno 4/4) : filtre passe-bande **40–150 Hz** (Butterworth 2–4) →
  ODF (`max(0, RMS[n] − RMS[n−1])`, frame 2048/hop 512) → autocorrélation → BPM ; **phase** =
  `argmax_φ Σ_k ODF(φ + k·T)` (scan φ ∈ [0, T], pas ~5 ms).
- Options : **librosa** `beat_track` (tempo+phase, DP Ellis 2007) · **madmom** `DBNDownBeatTracker`
  (RNN+DBN, downbeat 1 natif, état de l'art) · **essentia** `RhythmExtractor2013` · pipeline maison.
- Dépendances à documenter (numpy/scipy/librosa) ; analyse **une fois par piste** (premières 60–90 s
  suffisent), mise en cache (cf. EPIC-009).

## Tâches (proposées)

- [ ] Choisir l'implémentation : pipeline DSP maison (zéro grosse dépendance) vs librosa vs madmom —
      décision à trancher (précision vs poids vs dépendances).
- [ ] Endpoint `POST /api/track/analyze` (path) → `{bpm, phase, confidence}` ; 404 si fichier absent,
      403 hors dossiers autorisés.
- [ ] Bouton « 🔍 Analyser (basse/phase) » à la demande dans l'éditeur (état ⏳ analyse…), en plus de
      l'auto-détection au ready pour les pistes sans grille native.
- [ ] Résultat écrit dans le cache beatgrid (EPIC-009) ; badge `auto` + confiance affichée.
- [ ] Repli : pistes sans kick 4/4 (breakbeat, ambiant) → flux spectral large bande + BPM manuel.
- [ ] Tests : analyse sur signal synthétique (kick périodique) → BPM/phase attendus ; erreurs 404/403 ;
      flux frontend.

## Fichiers impactés (prévision)

`app.py` · nouveau module serveur (ex. `analysis.py`) · `static/src/render/cueEditor.ts` ·
`static/src/beatgrid.ts` (réutilisation `detectTempoFromOnsets`) · `templates/index.html` ·
`test_app.py` · tests vitest · `requirements/venv` (dépendances)

## Dépendances

- Cache beatgrid (EPIC-009) pour la persistance.
- Le downbeat (barres numérotées exactes) n'est utile que si l'affichage des barres est livré (EPIC-012) ;
  la **phase** seule suffit pour le snap (priorité).

## Notes / Risques

- Temps de calcul à borner (premières 60–90 s de la piste).
- `madmom` est lourd (modèles) — à réserver si le downbeat devient nécessaire.
