# EPIC-019 — Renommage + recolorisation des cues (double-clic slot/région)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne (P1 du benchmark)
> **Docs liées** : [rapport benchmark](2026-08-08-waveform-cue-beatgrid-benchmark.md) §P1

## Objectif

Donner aux hot cues un **nom et une couleur** éditables — le standard des logiciels DJ
pro (Traktor, rekordbox, Serato, Engine DJ : 8 pads couleur + noms de cue). Le format NML
les supporte déjà (`NAME`, `RED/GREEN/BLUE`) : il s'agit de les **rendre visibles et
éditables** dans le cue editor, avec **round-trip complet** (lecture depuis Traktor,
écriture vers Traktor).

## Tâches

- [x] **Source de vérité `_cueMeta`** (`cueEditor.ts`) : `Map<slot, {name?, color?}>` peuplé
      depuis les cues chargés (le nom `'n.n.'` par défaut de Traktor = pas de nom) — les
      régions wavesurfer ne portent pas les métadonnées, ce Map les restitue (même pattern
      que `_displOrders` EPIC-003/B9)
- [x] **Nom affiché dans la région** : `reg.setContent(<span class="cue-region-name">)`
      à la création des régions (round-trip lecture)
- [x] **Couleur de région** : propagée par `cuesToRegions` (`color: c.color`, fallback
      `#55aaff` / `#ffaa00` pour les loops TYPE=5) — round-trip lecture déjà en place
- [x] **Éditeur double-clic** : `openCueMetaEditor(slot)` — **double-clic sur un slot**
      (badge) **ou sur une région** (via `region-double-clicked`) → popover `#cue-editor-metaeditor`
      ancré dans `.modal-content` (position: relative) : champ nom + **palette de 8 couleurs**
      (swatches, sélection = couleur courante), boutons OK / Annuler
- [x] Slot vide au double-clic → **pose d'abord un cue au curseur**, puis édition immédiate
- [x] **Apply** : `applyCueMeta()` → `_cueMeta.set` + `region.setOptions({color})` +
      `setContent` (ou vidage si nom retiré) + `refreshSlotBadges()` (badge : `--cue-color`
      appliqué au slot, tooltip « slot — nom »)
- [x] **Save** : `onSaveClicked()` injecte `cue.name`/`cue.color` depuis `_cueMeta` dans le
      payload → écrit dans le NML (champs `NAME`/`RED/GREEN/BLUE` du CUE_V2, déjà gérés par
      `build_cue_element`)
- [x] Reset : `_cueMeta`/`_metaEditingSlot` remis à zéro au render et au destroy
- [x] `templates/index.html` : popover `#cue-editor-metaeditor` (slot, nom, palette, OK/Annuler)
- [x] `static/style.css` : popover (position absolue dans la modal, z-index), swatches
      (boutons ronds, bordure sélection), `--cue-color` sur les badges de slot, nom de région
- [x] Tests : 7 (double-clic slot → éditeur ouvert pré-rempli, **pose + édition sur slot vide**,
      double-clic région → éditeur ouvert, apply → nom/couleur appliqués à la région + meta,
      **save → name/color dans le payload** (DISPL_ORDER préservé), round-trip lecture : nom
      affiché dans la région, **suppression clic droit → méta nettoyée, re-pose vierge**)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/cueEditor.ts` | `_cueMeta`, éditeur nom/couleur, double-clic, injection save, badges | 
| `templates/index.html` | popover `#cue-editor-metaeditor` |
| `static/style.css` | popover, swatches, `--cue-color` badges, nom de région |
| `static/src/render/cueEditor.test.ts` | mock + 6 tests EPIC-019 |
| `docs/superpowers/epics/EPIC-019-renommage-couleur-cues.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — ✓
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Tests ciblés : `cueEditor.test.ts` — 111 ✓ (7 nouveaux)
- [x] Review critique appliquée : nettoyage `_cueMeta` à la suppression (clic droit + Suppr,
      pas de nom fantôme sur re-pose — sémantique Traktor) ; vérifié que `setCueAtPlayhead`
      mute le MÊME slot (`setOptions`, id inchangé) → la méta suit, pas de perte au déplacement ;
      fragilité test documentée (un fixture avec nom ≠ 'n.n.' doit mocker `addRegion` →
      `{setContent, setOptions}`, sinon crash)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat(ui): EPIC-019 — renommage + recolorisation des cues (double-clic slot/région)` |

## Décisions (KISS)

- **`_cueMeta` par slot** (clé = `r.id` = slot hotcue) plutôt qu'un stockage dans les régions :
  wavesurfer ne persiste pas les métadonnées custom — le Map est la source de vérité, comme
  `_displOrders`. Une seule map pour nom + couleur, zéro champ nouveau dans `CueDTO` côté serveur.
- **Popover custom** plutôt qu'une `prompt()` (bannies en EPIC-014) : champ nom + palette dans
  un seul endroit, cohérent avec l'UX de la modal.
- **Double-clic** comme déclencheur (slot ET région) — pas de mode édition explicite : c'est
  le geste standard des DAW/DJ software, découvert sans friction.
- **Couleurs = palette fixe de 8** (une par slot, style Traktor) plutôt qu'un color picker
  libre : zéro dépendance, cohérent, suffisant pour différencier les 8 slots.
- Pas de migration serveur : le NML porte déjà `NAME`/`RED/GREEN/BLUE` ; seul le payload
  front est enrichi.

## Notes / Risques

- Le nom `'n.n.'` de Traktor (défaut) est traité comme « pas de nom » — non affiché, champ
  vide à l'édition, pas réécrit inutilement au save (seul `meta.name` défini est injecté).
- Événement natif `region-double-clicked` du plugin Regions (v7.12, vérifié dans les types
  du bundle) — pas de détection manuelle `ev.detail >= 2` nécessaire.
- La couleur du slot vide au round-trip : la région porte la couleur du NML ; les nouveaux
  cues prennent la couleur par défaut de leur type (hotcue `#55aaff`, loop `#ffaa00`).
- **Annuler l'éditeur après un double-clic sur slot vide** laisse le cue posé au curseur
  (la pose est immédiate, comme un clic simple) — choix assumé, cohérent avec `onSlotClicked`.
- **Suppression (clic droit / Suppr)** : `_cueMeta` est nettoyé pour le slot supprimé → un
  cue re-posé au même slot repart sans nom/couleur (sémantique Traktor : supprimer un hotcue
  efface tout).
