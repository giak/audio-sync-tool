# EPIC-012 — Beatgrid P5 : bande d'énergie basse + numéros de barre

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Basse
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P5 (§5.2–5.3)

## Objectif

Visualiser le rythme (basse/kick) et la structure (barres) dans l'éditeur, pour valider/corriger le
calage à l'œil.

## Tâches

- [x] **Numéros de barre** : « 1, 2, 3… » tous les 4 beats (lignes `strong`) en tête de grille.
      Numérotation **relative** depuis le beat 1 (la phase NML n'est pas le downbeat — acceptable,
      cf. plan §5 note). Masqués si l'espacement < 1,5 % du conteneur (illisible → lignes seules).
- [x] **Bande d'énergie basse** : mini-strip 24 px sous la waveform, RMS filtré **40–150 Hz** (kick),
      calculé **côté client** depuis le buffer décodé de wavesurfer (`getDecodedData`) — zéro réseau,
      fonctionne aussi en visualisation seule, pas de double décodage (le serveur EPIC-010 reste pour
      le BPM/phase).
- [x] **Pipeline bande** : biquad RBJ bandpass 40–150 Hz sur le signal complet (fs réelle) **puis**
      sous-échantillonnage à ~400 Hz (filtrage avant décimation = anti-repliement correct — une
      décimation par moyenne laisserait le battement des HF dans la bande) → RMS par fenêtre (160
      barres) → normalisation avec seuil 2 % (pas de kick → bande plate, pas de faux rythme).
      Calcul **différé** (setTimeout 0) : ne bloque jamais le rendu initial.
- [x] Styles : bande discrète (24 px, `pointer-events: none`, z-index 1 sous la grille 2 et les
      régions 5), numéros petits (`--text-dim`).
- [x] Tests : `bassband.test.ts` (kick 60 Hz détecté, hats 8 kHz → bande plate, silence, barCount,
      position temporelle des pics) + `cueEditor.test.ts` (bande rendue au ready, buffer indisponible
      → pas de bande sans erreur, buffer trop court, numéros aux bons %, masquage serré, reset).

## Validation

- **654 vitest** (shuffle) / **160 pytest** — typecheck 0 · lint 0 · build OK.
- Ordre filtre→décimation validé par le test DSP : le biquad seul atténue le 8 kHz de −38 dB ;
  le seuil 2 % fait le reste (résidu hors bande → bande plate).
- La bande couvre **toute la durée affichée** (flex sur toute la largeur, barres = durée/160).

## Fichiers impactés (prévision)

`static/src/render/cueEditor.ts` · `static/src/beatgrid.ts` (éventuel helper bande) ·
`static/style.css` · `templates/index.html` · tests vitest

## Dépendances

- Facultatif : EPIC-010 (données serveur) pour la bande sans double décodage client.
- EPIC-009/010 pour la phase (barres alignées).

## Notes / Risques

- La bande basse est un **outil de validation visuelle** : ne doit jamais gêner le dessin des régions
  (pointer-events: none, z-index sous la grille).
- Les barres sont numérotées relativement au beat 1 de la grille (pas au downbeat de la mesure) —
  les barres « 1 » peuvent être décalées d'un temps (limite documentée du plan §9).
