# Spec — Le style se lit des deux côtés (EPIC-046)

Date : 2026-09-22 · Statut : validée · EPIC : EPIC-046

## 1. Le signalement, mesuré

> « j'ai copié un fichier éparpillé vers source data […] la mise à jour ID3 dans
> les **2 colonnes** ne s'est pas faite ? » — puis : « quand j'utilise `g`, cela
> ne met toujours pas à jour !!! »

Vérifié sur un bac à sable (serveur jetable, corpus factice, navigateur piloté) :

| Vérification | Résultat |
|---|---|
| `POST /copy` vers `techno_acid_1990` | journal `copy-f5` **2 lignes** (épars + copie) |
| Relecture mutagen après copie | `genre: ['techno_acid']` **sur les deux** |
| Statut affiché | `✓ … copié vers … · style « techno_acid » déjà à jour` |
| Cellule *Style* de la ligne épars | mise à jour (chip `✓ techno_acid`) |
| **Cellule *Style* de la ligne Source Data** | **il n'y en a pas** |

L'écriture est donc correcte ; ce qui manque est la **surface**. La table de
droite est rendue par `makeFileEl(..., onCueEditFn)` en 7 colonnes —
`play, nom, note, année, codec, durée, cues` — le genre n'y apparaît **nulle
part**. Conséquence directe, et c'est le second signalement : `g` sur un fichier
**rangé** écrit bien le tag (route `/styles/apply`, `roots` = source + épars)
mais **rien ne change à l'écran** hors de la barre d'état, qui défile. Pour un
fichier rangé — le cas où l'on corrige un tag — l'app est muette.

## 2. Décision

La colonne Source Data reçoit la **même** cellule `td.style-cell` que l'épars,
avec la sémantique de la page : à droite, un fichier est rangé, donc la
référence est **le dossier** (la déclaration de style, EPIC-035/043).

Trois états, un seul mot :

| État | Rendu | Sens |
|---|---|---|
| `entry.genre == style du dossier` | `✓ techno_acid` (vert) | le tag dit ce que le dossier déclare |
| `entry.genre` différent | `techno_acid ≠` (ambre, `title` = `tag : Techno`) | divergence à corriger — `g` puis `A` |
| aucun genre | `techno_acid ?` (gris) | la cellule dit la cible, le tag est vide |

Le chip n'est pas un bouton de plus : **clic = `g`** sur ce fichier (même
palette, même écriture), comme la cellule épars.

## 3. Contrat

- `makeFileTable(true, true)` → 8 colonnes, classe `has-style` (mêmes largeurs
  que l'épars : `col:nth-child(5..7)` déjà écrites pour 7 colonnes, décalées).
  ⚠ `has-style` cible `nth-child(5)`, `(6)`, `(7)` : sur une table source la
  5ᵉ colonne est *Style*, la 6ᵉ *codec*, la 7ᵉ *durée* — on ajoute
  `col:nth-child(8)` pour les cues. Vérifié par test de colgroup.
- `insertSourceStyleCell(row, fullpath, entry, dirStyle)` dans `styleCell.ts` —
  **ne remplace pas** `insertStyleCell` (épars) : les règles sont opposées
  (choix de session à gauche, dossier à droite).
- `refreshSourceStyleCells(fullpaths)` : patch ciblé par `dataset.fullpath`,
  appelé par `patchSourceFileAfterCopy` (ligne créée juste après la copie) et par
  `g` après écriture sur une cible rangée.
- `patchSourceFileAfterCopy` construit la cellule avec le **genre relu** par
  `/copy` (`res.genre`), pas la valeur d'avant.

## 4. Non-objectifs

- Pas de colonne *genre* côté épars : c'est la cellule *Style* (choix de session).
- Pas de re-render du panneau : patch ciblé, comme le reste du flux F5.
- Pas de modale : l'écriture reste immédiate, le statut la dit déjà.
