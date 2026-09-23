# EPIC-056 — Découpage cueEditor.ts (1 701 lignes) + son test (2 525)

> **Statut** : ⚪ Backlog
> **Créée** : 2026-09-23 · **Dernière mise à jour** : 2026-09-23
> **Priorité** : Basse
> **Docs liées** : EPIC-001 (cue editor) · EPIC-017-021 (zoom, minimap, cues éditables, RGB, undo) · EPIC-036 (squelettes de liste)

## Objectif

`render/cueEditor.ts` est le plus gros module frontend (**1 701 lignes**, test
**2 525 lignes**) : il accumule waveform + zoom + minimap + 3 bandes RGB + cues
éditables + undo/redo + beatgrid + NML round-trip. Chaque ajout depuis EPIC-017
grossit le même fichier ; le coût se paie en revue (diffs illisibles) et en
couverture de branches (le sous-domaine le moins couvert du projet).

## Contexte & découvertes

Sous-domaines déjà isolés dans le fichier (imports et helpers propres) :

| Sous-domaine | Contenu |
|---|---|
| Waveform + zoom + minimap | init wavesurfer, `ws.zoom()`, plugin minimap, viewport |
| Bandes RGB | `computeRGBBands` (déjà dans `bands.ts`) + rendu 3 couches |
| Cues | pose 1-8/C, Suppr/clic droit, popover nom/couleur, `_cueMeta` |
| Loops | dessin/lire, `region-initialized` |
| Undo/redo | piles de snapshots, `_restoring` |
| Beatgrid/NML | snap, nudge, `◎ Beat 1`, `💾 Grille`, round-trip |

## Tâches

- [ ] Extraire les sous-domaines en modules frères (`cueEditor/` répertoire :
      `waveform.ts`, `cues.ts`, `undo.ts`, `beatgrid.ts`) — un commit par
      module, 97+ tests cueEditor verts entre chaque
- [ ] Le test 2 525 lignes suit le même découpage (par sous-domaine)
- [ ] `cueEditor.ts` final = orchestration + listeners globaux (cible < 400 lignes)

## Validation

- [ ] Gate inchangé (1 230 vitest / 371 pytest / typecheck / lint / build)
- [ ] Round-trip NML re-vérifié (fixture `tests/fixtures/nml-sample.xml`)
- [ ] Smoke navigateur : poser un cue, undo, grille, export

## Notes / Risques

- Priorité Basse : le module est **stable** (aucune régression depuis EPIC-021)
  — le découpage est de la lisibilité, pas du déblocage. Ne pas le mélanger
  avec une évolution fonctionnelle.
