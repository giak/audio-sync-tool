# EPIC-017 — Zoom waveform + raccourcis cue + downbeat différencié

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute (P0 du benchmark)
> **Docs liées** : [rapport benchmark](2026-08-08-waveform-cue-beatgrid-benchmark.md) §5 P0

## Objectif

Combler l'écart n°1 identifié par le benchmark vs les logiciels DJ pro (Traktor 4, rekordbox,
Serato, Denon, Mixxx) : la **manipulation de la waveform**. Le zoom est décrit par tous les
éditeurs pro comme *l'outil* de calage downbeat/BPM (« zoom 1 beat »). On ajoute aussi les
raccourcis clavier standard de pose de cue et la différenciation visuelle du downbeat.

## Tâches

- [x] **Zoom contrôlé** (`cueEditor.ts`) : `ws.zoom(pxPerSec)` avec paliers relatifs
      (`zoomBy(factor)`, borné [0, 20000]), « Fit » (`zoomToFit`, 0 = piste entière),
      « 1 beat » (`zoomToOneBeat`, largeur ÷ intervalle de beat — nécessite un BPM),
      molette sur la waveform (+1,25 / ÷1,25), touches `+`/`=`/`-`/`_`
- [x] **Grille synchronisée au zoom** : les lignes de beats sont positionnées dans la
      **fenêtre visible** (scrollLeft ÷ pxPerSec via `ws.getScroll()`, fallback largeur 800
      hors layout/jsdom) — la grille reste alignée sur la waveform à tout niveau de zoom ;
      re-desserte sur l'événement `scroll` de wavesurfer et après le reflow du zoom (rAF)
- [x] **Downbeat différencié** : le beat 1 de la grille (phase) porte la classe `beat1`
      (trait épais ambre + encoche haute) ; les débuts de barre (tous les 4 beats) gardent
      `strong` (cyan renforcé). Numéros de barre inchangés (EPIC-012)
- [x] **Raccourcis cue** : touches `1`–`8` = poser/déplacer le cue du slot A–H au curseur ;
      `C` = poser un cue au curseur (déplace l'existant sous le curseur, sinon premier slot
      libre, toast si 8 pleins) ; garde-fous : jamais interceptés avec Ctrl/Alt/Méta, ni
      depuis un champ INPUT/BUTTON, ni hors modal cueEditor
- [x] **Bande basse (EPIC-012) masquée en zoom** : elle couvre toute la piste et induirait
      en erreur dans une fenêtre visible partielle (`#cue-editor-waveform.zoomed`)
- [x] Boutons `−` / `+` / `Fit` / `1 beat` dans la barre transport + hint raccourcis à jour
- [x] Reset du zoom (fit) à chaque ouverture/re-render/fermeture
- [x] Tests : 15 nouveaux (zoom ×8, fenêtre visible, downbeat, raccourcis 1-8/C/+/-, toast
      slots pleins, ignoration hors modale, activation du bouton « 1 beat » à la saisie du BPM)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/cueEditor.ts` | zoom (applyZoom/zoomBy/zoomToFit/zoomToOneBeat), renderGrid fenêtre visible, raccourcis clavier, setCueAtPlayhead, wheel + boutons, resets |
| `templates/index.html` | boutons `−`/`+`/`Fit`/`1 beat` + hint raccourcis |
| `static/style.css` | `.cue-grid-line.beat1` (downbeat), `.strong` renforcé, bande basse masquée en zoom |
| `static/src/render/cueEditor.test.ts` | mock `zoom`/`getScroll` + 14 tests EPIC-017 |
| `docs/superpowers/epics/EPIC-017-zoom-raccourcis-downbeat.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — 700 ✓
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Tests ciblés : `cueEditor.test.ts` — 98 ✓ (15 nouveaux)
- [x] Review critique appliquée : bouton « 1 beat » rafraîchi à chaque changement de BPM
      (via `updateBpmBadge`), garde `_zoomPx <= 0` dans le handler `scroll`

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat(ui): EPIC-017 — zoom waveform (paliers, molette, 1 beat) + raccourcis cue 1-8/C + downbeat différencié` |

## Décisions (KISS)

- **Zoom relatif par paliers** (×1,5 boutons/touches, ×1,25 molette) plutôt qu'un slider :
  simple, prévisible, standard DJ. « 1 beat » = bouton dédié (nécessite BPM — grille).
- **Grille en % de la fenêtre visible** plutôt que de la piste : l'overlay DOM existant
  (EPIC-012) reste aligné sans restructurer le DOM wavesurfer ; `getScroll()` de v7
  fournit la fenêtre. La bande basse, elle, est masquée (elle n'est pas fenêtrée).
- **`C` = déplacer OU poser** : si un cue couvre déjà le curseur, il est déplacé (même slot,
  `setOptions`) ; sinon pose au premier slot libre — une touche pour les deux cas les plus
  fréquents, sans jamais écraser un autre slot.
- **Garde-fous clavier** : modificateurs (Ctrl/Alt/Méta) exclus + cibles INPUT/BUTTON
  exclues (cohérent avec l'existant) — pas de capture de raccourcis navigateur.

## Notes / Risques

- Le zoom utilise `wavesurfer.zoom()` (v7.12) ; le scroll horizontal est natif, le playhead
  reste centré pendant la lecture (`autoCenter` par défaut).
- Fenêtre visible : fallback largeur 800 quand `clientWidth` est 0 (jsdom / avant layout) —
  comportement déterministe en test, correct en réel après le reflow (l'événement `scroll`
  re-déclenche `renderGrid`).
- Sur de très longues pistes très zoomées, le nombre de lignes dessinées reste borné à la
  fenêtre visible (perf).
