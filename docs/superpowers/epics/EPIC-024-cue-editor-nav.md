# EPIC-024 — Point d'entrée nav « 🎛️ Cue Editor »

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-14 · **Dernière mise à jour** : 2026-09-14
> **Priorité** : Basse (accessibilité nav, UI cosmétique)
> **Docs liées** : [spec](../specs/2026-09-14-cue-editor-nav-design.md)

## Objectif

Donner au header un point d'entrée « 🎛️ Cue Editor » qui rouvre la dernière piste éditée en un clic, grisé tant qu'aucune piste n'a été ouverte.

## Tâches

- [x] Task 1 — state.ts : lastCueTrack (défaut null)
- [x] Task 2 — HTML nav button + CSS `.page-btn:disabled`
- [x] Task 3 — cueEditor.ts : mémorisation + enable (TDD)
- [x] Task 4 — script.ts : handler nav + no-op guard + EPIC

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/state.ts` | Champ `lastCueTrack: PlaylistTrackLite \| null` |
| `static/src/state.test.ts` | Test défaut null |
| `templates/index.html` | Bouton `#page-cue` dans `#page-nav` |
| `static/style.css` | `.page-btn:disabled` |
| `static/src/render/cueEditor.ts` | Mémorisation + enable au début de `openCueEditor` |
| `static/src/render/cueEditor.test.ts` | Test lastCueTrack + DOM enable |
| `static/src/script.ts` | Handler clic `#page-cue` |

## Validation

- [x] Typecheck 0 erreur
- [x] Tests vitest 730+
- [x] Tests pytest 174+
- [x] Build OK
- [x] Smoke test : bouton présent + grassé dans le HTML servi

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `412fc47` | docs(spec): point d'entrée nav Cue Editor — lastCueTrack + bouton #page-cue grisé |
| `84b5e19` | feat(state): lastCueTrack |
| `9f9365d` | feat(ui): nav — bouton #page-cue |
| `e7191c7` | feat(cueEditor): openCueEditor mémorise lastCueTrack + active #page-cue |
| `2dd0838` | feat(nav): handler script.ts — clic #page-cue ouvre lastCueTrack |

## Décisions

- **`import type`** : lien `state.ts → cueEditor.ts` pour `PlaylistTrackLite` (zéro cycle runtime).
- **Aucune validation Proxy** : `lastCueTrack` est un champ opaque, non critique.
- **Enable dans `openCueEditor`** (et pas dans un listener) : KISS — l'ouverture est le seul point où une piste est validée et accessible.
- **No-op si déjà ouvert** : `activeModal === 'cueEditor'` sur la même piste → re-focus sans recharger.

## Notes

- Les 12 erreurs biome pré-existantes (imports, `useIterableCallbackReturn`) persistent — à traiter dans une EPIC « dette » dédiée.
