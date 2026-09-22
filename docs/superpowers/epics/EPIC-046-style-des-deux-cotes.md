# EPIC-046 — Le style se lit des deux côtés

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : [spec](../specs/2026-09-22-style-des-deux-cotes-design.md) · EPIC-035 (cellule épars) · EPIC-043 (style écrit à la copie)

## Objectif

Après une copie F5 (ou un `g` sur un fichier rangé), **voir** dans la colonne
Source Data que le tag genre a été écrit — la colonne de droite ne montrait
aucun style du tout.

## Contexte & découvertes

Signalé comme « l'ID3 ne se met pas à jour dans les 2 colonnes ». Vérifié sur
bac à sable : l'écriture **est** correcte (journal `copy-f5` ×2, relecture
mutagen `techno_acid` sur l'épars **et** la copie, statut `✓ … écrit`). Ce qui
manque est la **surface** : `makeFileEl(..., onCueEditFn)` rend la table source
en 7 colonnes `play, nom, note, année, codec, durée, cues` — le genre n'y
apparaît nulle part. Corollaire : `g` sur un fichier rangé écrit le tag mais
**rien ne change à l'écran**.

## Tâches

- [x] `makeFileTable(true, true)` → 8 colonnes + `has-style` (largeurs
      `col:nth-child(5..8)`, la 8ᵉ = cues)
- [x] `insertSourceStyleCell` (styleCell.ts) : chip `✓ style` / `style ≠` (ambre,
      `title` = `tag : X`) / `style ?` (gris), clic = `g`
- [x] `refreshSourceStyleCells` + branchement dans `patchSourceFileAfterCopy`
      (genre relu par `/copy`) et après écriture depuis la palette sur une
      cible rangée
- [x] Source de la déclaration : **dossier** (1ᵉʳ segment du chemin relatif) —
      `styleOfDestDir` réutilisé, déjà testé
- [x] Tests : colgroup 8 colonnes, les trois états du chip, patch après copie,
      rafraîchissement après `g` rangé

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/styleCell.ts` | `insertSourceStyleCell`, `refreshSourceStyleCells`, `sourceStyleOf` |
| `static/src/render/sourceTree.ts` | table 8 colonnes + insertion de la cellule |
| `static/src/domPatches.ts` | cellule Style sur la ligne créée par la copie |
| `static/src/render/stylePalette.ts` | rafraîchit la cellule source après un `pick` |
| `static/styles/pages/sync.css` | `col:nth-child(8)`, états `≠` / `?` |

## Validation

- [x] Typecheck (`npx tsc --noEmit`)
- [x] Tests frontend (`npx vitest run`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat: EPIC-046 — la colonne Source Data montre le style (et le dit)` |

## Décisions

- _La déclaration de style d'un fichier rangé est son DOSSIER, pas un choix de
  session : les deux cellules ont la même forme, pas la même règle._
- _Trois états, un mot : `✓` (accord), `≠` (divergence, à corriger), `?` (tag
  vide). Pas de quatrième état, pas de couleur de plus._
- _Patch ciblé (`dataset.fullpath`), jamais de re-render du panneau — même
  contrat que le reste du flux F5._

## Notes / Risques

- La cellule se contente de **lire** le genre du scan : après un `g` sur un
  fichier rangé qui n'est pas affiché, elle ne peut pas être rafraîchie —
  l'index est patché, le rendu suivra.
