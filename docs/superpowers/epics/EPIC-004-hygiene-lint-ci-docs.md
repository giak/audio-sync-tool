# EPIC-004 — Hygiène : lint 0 + CI GitHub Actions + docs à jour

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute (P2)
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §5 (points 1, 7, 8)

## Objectif

Réaligner l'hygiène du dépôt sur la réalité : lint à 0 erreur, un CI qui bloque les régressions, et des
docs qui reflètent les vrais chiffres.

## Tâches

- [x] **Lint 0 erreur** : corrigé les ~65 erreurs Biome (imports inutilisés dans `commands/filter.ts`,
      `commands/rating.ts`, etc. + formatage) → `npm run lint` à 0.
- [x] **CI GitHub Actions minimal** (`.github/workflows/ci.yml`) : typecheck + lint + vitest + pytest.
- [x] **README.md à jour** : chiffres réels (616 vitest / 128 pytest, nb de fichiers, routes), suppression
      des références aux fichiers `.js` inexistants (`script.test.js`, `integration.test.js`), statut
      réel du lint.
- [x] **TESTING-GUIDE.md à jour** : mêmes corrections de fichiers/références.

## Fichiers impactés

`static/src/*` (nettoyage lint) · `.github/workflows/ci.yml` (créé) · `README.md` · `docs/TESTING-GUIDE.md`

## Validation

- `npm run lint` → 0 erreur.
- `npm test` (616) + `./venv/bin/python -m pytest` (128) verts en CI et en local.
- Workflow YAML validé.

## Traçabilité (commits)

> Commit : `7fe615b` (`chore(ci): lint biome 0 erreur + workflow GitHub Actions
> (typecheck/lint/vitest/pytest) + docs chiffres réels [EPIC-004]`).

## Décisions

- Lint via **Biome** (config déjà en place, `biome.json`) — pas de nouvel outil.
- CI en 3 étapes lisibles (typecheck+lint / vitest / pytest) plutôt qu'un job monolithique.
