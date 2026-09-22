# EPIC-047 — La palette de styles : complète, à l'échelle, sans `<kbd>`

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : [spec](../specs/2026-09-22-palette-complete-echelle-design.md) · EPIC-035 · EPIC-041 · EPIC-027 (📁 additionnels)

## Objectif

La palette `g` doit montrer **tous** les styles de la collection et se lire sur
un grand écran — elle en oubliait six et tenait dans 560 px.

## Contexte & découvertes

Trois mesures :

1. **Liste incomplète** — 92 dossiers sur le disque, 86 dans la taxonomie :
   `breakbeat_2000/2005`, `house_1990/1995`, `techno_hard_2005`,
   `techno_house_2010` sont **absents** (dossiers sans fichier audio ;
   `buildTaxonomy` et `_known_styles` dérivent des fichiers indexés). Le style
   `breakbeat` n'existe donc pas pour la palette — et `/styles/apply` le
   refuserait.
2. **Palette trop petite** — `getBoundingClientRect()` = **560 × 219 px** à
   2 560 × 1 400 de viewport : largeur constante, 4 colonnes figées.
3. **`<kbd>` décoratif** — `<kbd>h</kbd> hardcore` dans un bouton cliquable.

## Tâches

- [x] `/scan` écrit `cache['dirs']` (sous-dossiers de 1ᵉʳ niveau, absolus) ;
      `/load` expose `dirs` ; `buildTaxonomy` les reçoit comme les dossiers
      additionnels (dossier vide = style connu, `count: 0`)
- [x] `_known_styles()` lit la même source (palette et route ne divergent plus)
- [x] 🗑 `/mkdir` écrit `hidden_dirs` (rétro-compatible : `extra_dirs.json`
      ancien format *liste* toujours lu) ; `dirs` filtré
- [x] CSS : `clamp(560px, 44vw, 1180px)`, grilles `auto-fill`
      (`minmax(190px,1fr)` styles, `minmax(58px,1fr)` années), hauteur `50vh`
- [x] Boutons de style : nom + volume, touche en `title`, pied de palette
      « Lettre = style · clic = style »
- [x] Tests : 6 dossiers vides → `breakbeat` présent, `/styles/apply` l'accepte,
      `hidden_dirs` filtrés, marqueur de `<kbd>` absent des boutons

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `cache['dirs']`, `_source_root_dirs()`, `_known_styles()`, `hidden_dirs` |
| `static/src/render/styleCell.ts` | `buildTaxonomy(…, dirs)` |
| `static/src/render/stylePalette.ts` | bouton sans `<kbd>`, volume affiché |
| `static/src/styles.ts` | documentation de la source de vérité |
| `static/styles/pages/sync.css` | géométrie responsive |
| `static/src/actions.ts` | transmet `dirs` au state |

## Validation

- [x] Typecheck (`npx tsc --noEmit`)
- [x] Tests frontend (`npx vitest run`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat: EPIC-047 — la palette voit tous les styles et tient l'écran` |

## Décisions

- _La taxonomie reste dérivée du disque (aucune liste à maintenir) — mais du
  disque **des dossiers**, pas du disque **des fichiers**._
- _Le 🗑 garde son sens « retirer de l'index » via `hidden_dirs` : sans lui, un
  dossier retiré reviendrait au scan suivant, désormais que les dossiers vides
  sont visibles._
- _Le raccourci clavier reste actif (accélération), il n'est plus **affiché**
  comme un pavé de touche dans un bouton._

## Notes / Risques

- Le volume affiché vient de l'index (fichiers scannés) : un dossier vide
  affiche `0` — c'est honnête, et c'est justement l'information qui manquait.
