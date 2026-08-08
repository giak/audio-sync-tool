# EPIC-012 — Beatgrid P5 : bande d'énergie basse + numéros de barre

> **Statut** : ⚪ Backlog
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Basse
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P5 (§5.2–5.3)

## Objectif

Visualiser le rythme (basse/kick) et la structure (barres) dans l'éditeur, pour valider/corriger le
calage à l'œil.

## Tâches (proposées)

- [ ] **Numéros de barre** : « 1, 2, 3… » tous les 4 beats en tête de grille (les lignes `strong` de
      `renderGrid` marquent déjà les temps 1,5,9… → ajouter le libellé).
      ⚠️ Dépend du **downbeat** si on veut des barres « justes » (EPIC-010/madmom) ; sinon numérotation
      relative (acceptable pour le snap).
- [ ] **Bande d'énergie basse** : mini-strip sous la waveform du RMS filtré **40–150 Hz** (kick) —
      aide à valider que la grille coïncide avec les kicks ; calculé côté client (WebAudio) ou fourni
      par l'analyse serveur (EPIC-010) pour éviter un double décodage.
- [ ] Styles : bande discrète (hauteur ~24px, couleur atténuée), numéros petits (`--text-dim`).
- [ ] Tests : barres rendues aux bons % ; bande alignée sur la durée ; pas de casse en plein écran.

## Fichiers impactés (prévision)

`static/src/render/cueEditor.ts` · `static/src/beatgrid.ts` (éventuel helper bande) ·
`static/style.css` · `templates/index.html` · tests vitest

## Dépendances

- Facultatif : EPIC-010 (données serveur) pour la bande sans double décodage client.
- EPIC-009/010 pour la phase (barres alignées).

## Notes / Risques

- La bande basse est un **outil de validation visuelle** : ne doit jamais gêner le dessin des régions
  (pointer-events: none, z-index sous la grille).
