# EPIC-021 — Undo/redo dans le cue editor (poses/suppressions de cues et loops)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne (P2 du benchmark — le 1er « confort » d'édition)
> **Docs liées** : [rapport benchmark](2026-08-08-waveform-cue-beatgrid-benchmark.md) §P2

## Objectif

Pouvoir **annuler / rétablir** les mutations de cues et loops dans l'éditeur waveform
(poses, suppressions, déplacements, renommage/couleur) — le garde-fou manquant pour
l'édition de prep : une pose ratée, une suppression par clic droit ou par erreur, un
déplacement involontaire se réparent en un geste.

## Conception (KISS)

**Snapshot complet de l'état des régions**, pas de command pattern : 8 slots max, un
snapshot (structure + métadonnées + DISPL_ORDER) est minuscule et la restauration est
triviale (remove tout → re-addRegion). Deux piles `_undoStack`/`_redoStack`.

- `snapshotCurrent()` : régions (id/start/end/color) + `_cueMeta` (nom/couleur) +
  `_displOrders` (round-trip).
- `pushHistory()` : pousse l'état AVANT une mutation, vide le redo, met à jour les
  boutons. Garde `_restoring` : rien n'est poussé pendant une restauration.
- `restoreSnapshot()` : coupe la boucle en lecture si elle a disparu, remove des régions
  (sur une **copie** — remove() splices la liste), restaure méta + DISPL_ORDER, recrée.
- `undoCues()`/`redoCues()` exportées ; boutons `↺`/`↻` désactivés quand la pile est vide.

### Points d'accroche (push AVANT la mutation)

| Mutation | Point |
|---|---|
| Pose d'un cue (clic slot / touche 1-8) | `onSlotClicked` |
| Déplacement du cue sous le curseur (touche C) | `setCueAtPlayhead` (branche setOptions) |
| Pose au premier slot libre (touche C) | via `onSlotClicked` |
| Suppression (Suppr) | `deleteRegionAtCursor` |
| Suppression (clic droit) | handler `region-clicked` |
| **Loop dessiné (drag)** | `region-initialized` (id string) : émis AVANT que la région soit dans la liste → push de l'état sans le loop |
| Renommage/couleur | `applyCueMeta` |

Garde `if (_restoring) return` dans le handler `region-created` : pendant une
restauration, `addRegion` ré-émet `region-created` → ne pas re-snapper les positions
restaurées ni re-pousser.

## Tâches

- [x] `cueEditor.ts` : interface `CueSnapshot`, piles `_undoStack`/`_redoStack`, flag
      `_restoring`, `snapshotCurrent`/`pushHistory`/`restoreSnapshot`/`undoCues`/`redoCues`/
      `updateHistoryButtons`
- [x] Accroches : `onSlotClicked`, `setCueAtPlayhead`, `deleteRegionAtCursor`,
      `region-clicked` (clic droit), `region-initialized` (loop), `applyCueMeta`
- [x] Garde `_restoring` dans `region-created` + copie de la liste avant remove (bug
      classique splice pendant itération, attrapé par le test de suppression 2 cues)
- [x] Reset des piles à l'ouverture (render) et à la fermeture (destroy)
- [x] UI : boutons `↺`/`↻` dans le transport (titles + Ctrl+Z/Ctrl+Shift+Z), raccourcis
      clavier dans `onModalKeydown`, CSS `.cue-play:disabled`, hint mis à jour
- [x] Tests : 7 tests EPIC-021 (pose→undo→redo, undo/redo vides, suppression→undo,
      loop dessiné→undo, pose C→undo, déplacement C→undo, reset à la fermeture)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/cueEditor.ts` | piles + snapshot + accroches + boutons + raccourcis + resets |
| `static/src/render/cueEditor.test.ts` | 8 tests undo/redo + store de régions mocké fidèle au plugin |
| `templates/index.html` | boutons ↺/↻ + hint |
| `static/style.css` | `.cue-play:disabled` |
| `docs/superpowers/epics/EPIC-021-undo-redo-cue-editor.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — ✓
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Tests ciblés : `cueEditor.test.ts` — 121 ✓ (7 nouveaux) ; suite complète 730 ✓
- [x] Review critique appliquée : copie de la liste avant remove (bug splice), garde
      `_restoring` dans `region-created`, test loop fidèle au plugin (ajout au store avant
      `region-created`), scénarios C corrigés (fenêtre de détection réaliste)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `f978798` | `feat(ui): EPIC-021 — undo/redo dans le cue editor (poses/suppressions de cues et loops)` |

## Décisions (KISS)

- **Snapshots plutôt que commandes inverses** : 8 régions max, un snapshot est un objet
  minuscule ; une pile de commandes (apply/unapply par action) serait de l'over-engineering
  pour un état aussi petit. La restauration « tout retirer + recréer » est atomique et
  couvre toutes les mutations (y compris renommage/couleur) sans code par cas.
- **Snapshot AVANT la mutation** (push puis muter) : l'undo restaure exactement l'état
  antérieur — pas de calcul d'inverse fragile.
- **`region-initialized` pour le loop dessiné** plutôt que `region-created` : le plugin
  émet `region-initialized` AVANT d'ajouter la région à sa liste (vérifié dans le source
  v7.12, `enableDragSelection` → `new Region` → `emit("region-initialized")` → au "end"
  `saveRegion`). Un push à `region-created` capturerait un état déjà muté.
- **Les déplacements par drag/resize direct d'une région ne sont pas dans l'historique**
  (documenté) : le plugin émet `region-update` à chaque pixel sans événement « début de
  geste » fiable — une micro-édition au drag n'a pas besoin d'undo ; les déplacements
  intentionnels passent par C (couvert) ou re-posent. **Conséquence UX à connaître** : après
  un drag (état muté sans snapshot), Ctrl+Z annule l'action PRÉCÉDENTE — l'utilisateur voit
  un saut, pas un no-op. Accepté (KISS) ; une vraie couverture exigerait un événement
  plugin de début de drag, inexistant en v7.

## Notes / Risques

- La touche C pose sur un slot libre si le curseur n'est sur aucun cue → undo retire le
  cue posé (test couvert).
- Pendant la restauration, la boucle en lecture est coupée si elle n'existe plus dans le
  snapshot (même logique que la suppression manuelle) — pas de lecture fantôme.
- Le renommage/couleur est couvert (push dans `applyCueMeta`) : l'undo d'un nom appliqué
  par erreur fonctionne, cohérent avec l'ensemble.
