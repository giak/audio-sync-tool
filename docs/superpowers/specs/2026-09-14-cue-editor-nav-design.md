# Design : Point d'entrée nav « 🎛️ Cue Editor » (header)

> **Date** : 2026-09-14 · **Statut** : validé (brainstorming) → prêt pour plan
> **Objets concernés** : `templates/index.html` (nav header), `static/style.css`
> (`.page-btn:disabled`), `static/src/state.ts` (`lastCueTrack`),
> `static/src/render/cueEditor.ts` (mémorisation + enable), `static/src/script.ts`
> (handler nav)
> **Hors scope** : EPIC-022 backlog (a11y/responsive cue editor), tri des 12
> erreurs biome pré-existantes (EPIC « dette » à créer).

## Problème

Le cue editor n'est accessible qu'en cliquant une ligne de playlist ou via le
menu contexte de l'arbre source (`openCueEditor({filename, fullPath})`). Aucun
point d'entrée dans la navigation du header : pour rouvrir la piste qu'on
venait d'éditer, il fallait la retrouver dans la liste. De plus, rien n'est
mémorisé — pas de notion de « piste courante ».

## Objectifs

1. Donner au header un **point d'entrée** vers le cue editor, visible et stable.
2. **Rouvrir la dernière piste éditée** en un clic (mémorisée en session).
3. État **grisé tant qu'aucune piste n'a été ouverte** (le cue editor exige
   une piste — pas de roman : pas de « choix de piste » sans source).

## Choix retenus (validés en session)

- **Approche A** : bouton dans `#page-nav` (à côté de 📦 Sync / 🎵 Playlist).
  Le cue editor devient le 3ᵉ « écran » du header, même si c'est une modale.
  Rejetée : `#toolbar` (le traite comme utilitaire, moins visible).
- **Rouvrir la dernière piste** (`state.lastCueTrack`) plutôt qu'une logique
  de focus contextuel (KISS) — aucune « piste courante » n'existe aujourd'hui.
- **Libellé** : « 🎛️ Cue Editor » (cohérent avec le titre de la modale
  « 🎛 Éditeur cues / loops » et la colonne « Cue editor » de la légende).

## Design

### State (`static/src/state.ts`)

- Nouveau champ `lastCueTrack: PlaylistTrackLite | null` (défaut `null`),
  type importé de `render/cueEditor.ts` en **`import type`** (érasé à la
  compilation → zéro cycle d'import à l'exécution malgré la dépendance inverse).
- Pas de validation Proxy supplémentaire (champ opaque, non critique).

### Mémorisation (`static/src/render/cueEditor.ts`)

- Au **tout début** de `openCueEditor(track)` (avant les appels API) :
  `state.lastCueTrack = track` puis enable du bouton nav
  (`document.getElementById('page-cue')?.disabled = false`).
- Placement volontairement en amont des cas d'échec : si le NML n'est pas
  configuré ou la piste supprimée, le bouton reste actif pour réessayer
  (le toast existant s'affiche déjà).

### HTML (`templates/index.html`)

- Dans `#page-nav`, après `#page-playlist` :
  `<button id="page-cue" class="page-btn" disabled title="Ouvre un cue (ligne playlist ou [Cues])">🎛️ Cue Editor</button>`.
- Le bouton ne prend jamais la classe `active` (ce n'est pas une page).

### CSS (`static/style.css`)

- Règle `.page-btn:disabled` : `opacity: .55; cursor: not-allowed;`
  et surcharge du `:hover` (aucun effet de survol). Le reste hérite de
  `.page-btn`.

### Câblage (`static/src/script.ts`)

- Handler `#page-cue` (dans le bloc toolbar bindings) :
  - si `activeModal === 'cueEditor'` et `state.lastCueTrack` sur la même
    `fullPath` → **no-op** (refocus sans recharger) ;
  - sinon → `openCueEditor(state.lastCueTrack)`.
- Aucune interaction avec `playlistMode` (le cue editor est une modale, Échap
  ferme comme avant ; le clic sur 📦 Sync continue de quitter le mode Playlist).

## Erreurs & cas limites

| Cas | Comportement |
|---|---|
| Aucune piste ouverte | Bouton `disabled` (title explicite) — clic impossible |
| Piste supprimée / NML non configuré | Toast existant d'`openCueEditor`, bouton reste actif (re-tentative) |
| Clic alors que le cue est déjà ouvert sur la même piste | No-op |
| Deux ouvertures de suite de pistes différentes | `lastCueTrack` écrase la valeur précédente |

## Tests

- `static/src/state.test.ts` : `lastCueTrack` présent, défaut `null`.
- `static/src/render/cueEditor.test.ts` : après `openCueEditor(track)` sur un
  mini-DOM avec `#page-cue` → `state.lastCueTrack` = track et bouton non
  grassé. (Suivre le pattern de mock DOM existant du fichier.)
- Pas de test DOM sur le template (convention EPIC-023 : template Jinja non
  importé en vitest) ; clic réel vérifié en smoke (build + navigation
  bouton → modale ouverte/fermée).
- Suite complète : `npm test` (730+), `npm run typecheck`, `npm run build`,
  `./venv/bin/python -m pytest -q` (aucun impact backend attendu).

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `templates/index.html` | Bouton `#page-cue` dans `#page-nav` |
| `static/style.css` | `.page-btn:disabled` |
| `static/src/state.ts` | Champ `lastCueTrack` |
| `static/src/render/cueEditor.ts` | Mémorisation + enable bouton |
| `static/src/script.ts` | Handler clic nav |
| `static/src/state.test.ts` | Champ défaut |
| `static/src/render/cueEditor.test.ts` | Mémorisation + enable |