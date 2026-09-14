# EPIC-023 — Refonte de la popup « ❓ Raccourcis & Légende » (modal-xl, grille 4 colonnes)

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-14 · **Dernière mise à jour** : 2026-09-14
> **Priorité** : Basse (UI cosmétique, zéro risque sur les fonctionnalités)
> **Docs liées** : [spec](docs/superpowers/specs/2026-09-14-legend-modal-redesign-design.md) · [plan](docs/superpowers/plans/2026-09-14-legend-modal-redesign.md)

## Objectif

Rendre la popup ❓ Raccourcis & Légende réellement utile : fenêtre plus grande
(`modal-xl` 860–1200px), contenu complet (badges NML + raccourcis du cue editor
manquants) et agencement clair — une colonne par contexte (Légende / Sync /
Playlist / Cue editor), touches alignées, repli responsive 2→1 colonnes.

## Contexte & découvertes

Le contenu de la popup datait d'avant EPIC-001 → 021 : les badges NML (`✓`/`≈`/`✕`),
le badge `✅ playlist` et tous les raccourcis du cue editor étaient absents. La
modal était limitée à 640px avec un `flex` mal dimensionné. Une découverte
supplémentaire pendant l'implémentation :

- **Bug cache-buster** (`app.py:218`) : le `?v=` des assets ne dépendait que de
  la mtime de `static/dist/script.js`, pas de `static/style.css`. Toute
  modification purement CSS restait en cache navigateur → la refonte n'était
  pas visible tant que le JS n'était pas rebuildé. Fix : cache-buster = mtime
  **max** de script.js et style.css (TDD, test `test_cache_buster_covers_css`).

## Tâches

- [x] Story 1 — HTML : modal en `modal-xl` + colonne Légende (LED + badges NML)
- [x] Story 2 — CSS : `modal-xl`, grille 4 colonnes responsive, `.badge-demo`, `#legend-footer`, kbd 12.5px
- [x] Story 3 — HTML : colonnes Raccourcis Sync + Playlist (labels harmonisés)
- [x] Story 4 — HTML : colonne Raccourcis Cue editor + pied de modal (notes Échap/seek)
- [x] Story 5 — Fix cache-buster CSS (app.py + test)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `templates/index.html` | Modal-legend : 4 colonnes, chips NML, footer, suppression Navigation pages |
| `static/style.css` | `.modal-xl`, grille `#legend-grid`, `.badge-demo`, media queries, `.legend-row` aligné |
| `app.py` | Cache-buster sur mtime max (JS + CSS) |
| `test_app.py` | `test_cache_buster_covers_css` (régression cache CSS) |
| `docs/superpowers/specs/2026-09-14-legend-modal-redesign-design.md` | spec |
| `docs/superpowers/plans/2026-09-14-legend-modal-redesign.md` | plan |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0 erreur
- [x] Tests frontend (`npm test`) — 730/730 (29 fichiers)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — 174/174
- [x] Lint (`npm run lint`) — ↑ 12 erreurs **pré-existantes** (imports non triés,
      `useIterableCallbackReturn`) dans `static/src`, non liées à cette EPIC —
      à traiter dans une EPIC « dette » dédiée
- [x] Build (`npm run build`) — OK
- [x] Smoke test intégration (test client) : 4 `.legend-section`, 4 `.badge-demo`,
      `modal-xl`, grid 4 colonnes + replis servis, CSS invalidée (nouveau `?v=`)
- [ ] Smoke visuel navigateur : check 4 colonnes alignées + chips + repli responsive

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `fe466aa` | docs(spec): popup Raccourcis & Légende — design modal-xl + grille 4 colonnes |
| `1293143` | docs(plan): refonte popup Raccourcis & Légende — modal-xl, grille 4 colonnes |
| `d1688dd` | feat(ui): legend modal en modal-xl + colonne Légende (LED + badges NML) |
| `f4dfc49` | feat(ui): legend — modal-xl, grille 4 colonnes responsive, badge-demo, footer |
| `deb9785` | feat(ui): legend — colonnes Raccourcis Sync + Playlist |
| `5b99f02` | feat(ui): legend — colonne Cue editor + pied de modal (notes Échap/seek) |
| `275653c` | fix(backend): cache-buster couvre style.css (mtime max JS+CSS) |

## Décisions

- **Une colonne par contexte** (duplication des raccourcis courants assumée) :
  lisibilité > économie d'écriture (idem spec).
- **modal-xl plutôt que modal-lg** : 4 colonnes lisibles à 860-1200px ; repli
  responsive en pur CSS (≤1100px → 2 cols, ≤640px → 1 col, ≤1180px → 92vw).
- **Badges NML en chips `.badge-demo`** cohérents avec `matchStatus.ts` (texte
  identique `✓ NML` / `≈ homonymes` / `✕ non importé`).
- **Pas de test DOM sur le template** : le template Jinja n'est pas importé en
  vitest (YAGNI, validation par smoke). En revanche, **le bug cache-buster a été
  verrouillé par un test backend TDD** (régression).
- **Section « Navigation pages » supprimée** : redondante avec la toolbar.

## Notes / Risques

- Le repli responsive de la modal passe en 2 colonnes sous 1100px — vérifié via
  test client (CSS servie), mais le rendu visuel final dépend du smoke navigateur.
- Les 12 erreurs lint pré-existantes dans `static/src` (dont `useIterableCallbackReturn`
  introduit par une version plus récente de Biome) ne sont pas corrigées ici — hors
  scope. Proposition : EPIC « dette » dédiée (formatage + imports triés).