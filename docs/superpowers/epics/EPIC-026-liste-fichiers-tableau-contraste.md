# EPIC-026 — Liste fichiers en vrai tableau + contraste renforcé

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-15 · **Dernière mise à jour** : 2026-09-15
> **Priorité** : Haute (affichage cœur — plainte utilisateur répétée)
> **Docs liées** : mesures headless `/tmp/opencode/measure-*.html` (session)

## Objectif

Rendre la liste des morceaux (page **Sync** : éparpillé + source) réellement
lisible : métadonnées (année / codec / durée) **alignées verticalement comme
un tableau**, aucun vide résiduel à droite, textes clairs sur fond sombre.

## Contexte & découvertes

- 3 essais de disposition en `display: grid` (commits `0650f37`, `3723252`,
  `69f0db7`) mesurés fiables au headless Chrome (alignements ≈) mais l'utilisateur
  rapportait toujours un « vide à droite » — l'alignement intersecté épars/source
  en `column-count` restait perçu comme cassé.
- Découverte forensique : une **7ᵉ colonne orpheline** (bouton « Cues ») laissait
  54 px de blanc dans l'épars, où les lignes n'ont jamais de bouton Cues.
- Décision issue de l'utilisateur (2026-09-15) : « Cues » **partout sauf épars**,
  et la **durée collée au bord droit**.
- Contraste jugé insuffisant sur fond sombre (`#050510`) : passage de la palette
  texte en 2 passes d'éclaircissement.
- Vérifié : le cache-buster CSS (`app.py:214-225`) couvre déjà `script.js` **et**
  `style.css` (mtime max) → le « aucune visibilité » côté utilisateur venait du
  cache navigateur (Ctrl+F5), pas d'un bug serveur.

## Tâches

- [x] Remplacer le `div.file-row` grid par une vraie `<table class="file-table">`
      + `<colgroup>` `table-layout: fixed` (colonnes fixes, `width:100%` sur le
      nom de fichier) — `makeFileTable()` dans `fileRow.ts`.
- [x] Rendus `<tr>`/`<td>` dans `fileRow.ts`, `sourceTree.ts`, `eparsUI.ts`,
      `domPatches.ts` (lignes ajoutées après copie : 7 colonnes avec bouton Cues).
- [x] Cellules année/codec/durée **toujours rendues** (vides si absentes) → plus
      aucun décalage de colonnes entre lignes.
- [x] Épars : table 6 colonnes (sans colonne Cues) → durée = dernière colonne,
      collée au bord droit.
- [x] Textes éclaircis (2 passes) : `--text-primary/secondary/muted/dim` +
      message vide du journal (`journalUI.ts` → `var(--text-muted)`).
- [x] Selecteur de focus-Nav mis à jour (`sourceTree.ts:203` → `.file-table .file-row`).
- [x] Tests : 5 assertions `toBeNull` → cellules présentes vides
      (`fileRow.test.ts`, `render.test.ts`) + mocks `makeFileTable` ajoutés.

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/style.css` | Table (`.file-table`, colgroup), `td` alignements, palette texte éclaircie |
| `static/src/render/fileRow.ts` | `makeFileEl` → `<tr>`/`<td>` (6-7 colonnes), `makeFileTable(withCuesCol)` |
| `static/src/render/sourceTree.ts` | Table par dossier (7 cols, Cues), selecteur focus |
| `static/src/render/eparsUI.ts` | Table 6 colonnes (sans Cues) |
| `static/src/domPatches.ts` | Ligne OTA `<tr>`/`<td>` + bouton Cues + migration `.file-table` si absente |
| `static/src/render/journalUI.ts` | Message vide → `var(--text-muted)` |
| `static/src/render/fileRow.test.ts` | 3 assertions cellules présentes vides |
| `static/src/render.test.ts` | 1 assertion cellules présentes vides |
| `static/src/render/{sourceTree,eparsUI,playlistUI}.test.ts` | Mocks `makeFileTable` |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0 erreur
- [x] Tests frontend (`npm test`) — **739 passed**
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **174 passed**
- [x] Build (`npm run build`) — validation bundle OK
- [x] Vérification utilisateur (2026-09-15) : rendu OK sur page Sync

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `0650f37` | fix(ui): alignement colonnes metadonnees des lignes fichiers (grid) |
| `3723252` | fix(ui): codec/kbps sur une ligne (nowrap) + largeurs fixes alignées |
| `69f0db7` | fix(ui): lignes en tableau - rating avant l'annee, Cues colle le bord droit, plus de zone vide |
| `272b59d` | fix(ui): liste source en vrai tableau (<table> + colgroup, table-layout: fixed) — colonnes année/codec/durée toujours alignées, plus de vide à droite |
| `8f1785a` | fix(ui): 'Cues' uniquement hors épars — l'épars passe en table 6 colonnes, la durée se colle au bord droit |
| `621d68c` | fix(ui): textes éclaircis — meilleur contraste sur fond sombre (texte principal, secondaire, muted, dim + message journal) |
| `2a327c8` | fix(ui): textes encore plus clairs — contraste renforcé (primary/secondary/muted/dim) |

## Décisions

- **Vraie `<table>` plutôt que grid** : l'utilisateur l'exige explicitement
  (« fait un tableau », « c'est une mise en page CSS/HTML ») ; `table-layout:
  fixed` + colgroup garantit l'alignement par construction, avec `width:100%`
  sur la colonne nom de fichier pour absorber l'espace résiduel (aucun vide à
  droite). Réf. validate : technique MDN `table-layout` + `width` sur les `<col>`.
- **« Cues » partout sauf épars** (directive utilisateur 2026-09-15) :
  `makeFileTable(withCuesCol)` 7 colonnes pour source/playlists, 6 pour l'épars.
- **Cellules méta toujours rendues** : une cellule conditionnelle au milieu
  décalerait les colonnes suivantes — l'alignement table exige des cellules
  vides plutôt qu'absentes.
- **Palette texte éclaircie par variables `--text-*`** : un seul endroit à
  ajuster, aucune couleur codée en dur (sauf badges statut = conservés).
- **Pas d'EPIC-separée** pour la page Sync : ce travail devient EPIC-026
  (« série de correctifs UI sur un même domaine » → règlement EPIC).

## Notes / Risques

- `.cue-btn` de `playlistUI.ts:162` (pistes playlist) **conservé** — le CSS
  `.cue-btn` / `.cue-cell` reste utilisé en dehors des tables fichiers.
- `domPatches` : fallback de migration crée la `.file-table` si absente (fixtures
  et vieux DOM), strictement sans effet en production (les tables sont toujours
  rendues par `sourceTree`).
- La colonne codec est alignée à droite (bloc propre avec année/durée) — à
  re-centrer si l'utilisateur le préfère.