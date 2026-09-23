# EPIC-053 — Le focus du dossier destination survit au re-render après copie

> **Statut** : 🟢 Livré (2026-09-23)
> **Créée** : 2026-09-23 · **Dernière mise à jour** : 2026-09-23
> **Priorité** : Haute
> **Docs liées** : EPIC-052 (clic = scroll immobile) · EPIC-036 (beginRender/restore) · EPIC-034 (flux F5)

## Objectif

Le workflow de rangement rapide — **sélection à gauche → F5 → ↑↓ → F5…** — exige que le
dossier de destination (colonne Source Data) **garde son focus** en permanence : après chaque
copie, Tab doit retomber sur CE dossier et ↑↓ doit s'en souvenir, sans re-viser à la souris.

## Contexte & découvertes

**Signalement, mot pour mot** : « je sélectionne un fichier éparpillé, je fais F5, je colle
vers "source data" dans un dossier. je navigue avec TAB pour passer d'une colonne à l'autre,
et je perds le focus du dossier "source data" quand je passe à "éparpillé". quand je fais
flèche bas sur la colonne "éparpillé", je perds le focus du dossier dans la colonne de droite.
il faut garder ce focus à droite, cela me permet de sélectionner un morceau à gauche, F5, je
colle, flèche bas, j'écoute, F5, etc. »

**Cause racine (lecture du code)** : chaque copie mute l'index source → événement
`sourceFiles:changed` → `renderSource()` reconstruit **tout le DOM de droite**. Le rebuild
effaçait `.focused` sans le restaurer : seule la colonne gauche avait sa restauration
(`eparsFocusPath`, ligne 639), pas la droite. Le focus du dossier disparaissait donc
**exactement au moment où l'utilisateur recommence son cycle** — Tab repartait du premier
dossier, ↑↓ ne se souvenait de rien.

Le mécanisme Tab lui-même était sain (`state.sourceFocusPath` persiste, `.focused` existe
dans chaque colonne indépendamment) : c'est le re-render post-copie qui détruisait l'état
visuel.

## Tâches

- [x] `renderSource()` restaure `state.sourceFocusPath` après le rebuild (`focusItemByPath`)
- [x] Restauration **silencieuse** (`preventScroll` — EPIC-052 : un re-render ne déplace jamais le scroll)
- [x] Deux tests de non-régression (chemin persisté / premier lancement sans chemin)
- [x] Gate complet : 1 230 vitest / 367 pytest, typecheck, lint, build

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/sourceTree.ts` | Restauration de `sourceFocusPath` en fin de `renderSource()` |
| `static/src/render/sourceTree.test.ts` | 2 tests de non-régression (mock `focusItemByPath` hissé `vi.hoisted`) |

## Validation

- [x] Typecheck (`npm run typecheck`)
- [x] Tests frontend (`npm test` — 1 230)
- [x] Tests backend (`./venv/bin/python -m pytest -q` — 367)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `5d67b5b` | fix: EPIC-053 — le focus du dossier source survit au re-render après copie |

## Décisions

- **Restauration au même endroit, jamais le premier item** : si le dossier focusé est replié
  au re-render, `focusItemByPath` retombe sur le premier item visible — acceptable, le
  dépliage est un geste explicite (clic/Entrée).
- **Silencieux** : cohérence avec EPIC-052 — seul un geste clavier déplace la vue ; un
  re-render ne le fait jamais.

## Notes / Risques

- Complément direct d'EPIC-052 (même domaine : focus et scroll). Les deux ensemble
  verrouillent le cycle de rangement F5 → ↑↓ → F5.
