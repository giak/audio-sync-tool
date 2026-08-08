# EPIC-018 — Minimap/overview + bande basse colorée (waveform 3-bandes, étape 1)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne (P1 du benchmark)
> **Docs liées** : [rapport benchmark](2026-08-08-waveform-cue-beatgrid-benchmark.md) §5 P1

## Objectif

Améliorer la **lisibilité de la waveform** (l'écart n°2 du benchmark vs les pros) :
- **Minimap / overview** : vue d'ensemble de la piste (intro/drop/breakdown/outro) avec
  viewport synchronisé au zoom/scroll de la waveform principale, clic = seek — l'équivalent
  du *needle search / overview* de Serato, rekordbox et Engine DJ.
- **Waveform 3-bandes — étape 1 pragmatique** : colorer la **bande d'énergie basse**
  existante (EPIC-012) en **rouge** — le standard RGB DJ (red = low, green = mid, blue =
  high) — pour identifier visuellement le kick d'un coup d'œil. (80 % du bénéfice pour 20 %
  du coût ; le rendu mid/high complet reste une étape ultérieure.)

## Tâches

- [x] **Minimap** (`cueEditor.ts`) : plugin `Minimap` de wavesurfer v7 (disponible dans le
      bundle) enregistré dans un **conteneur dédié** `#cue-editor-minimap` (sous la waveform,
      hors overlays grille/bande — pas de chevauchement), `height: 56`, overlayColor cyan
      translucide, dégradation silencieuse si le conteneur est absent
- [x] `templates/index.html` : `<div id="cue-editor-minimap">` entre la waveform et le transport
- [x] `static/style.css` : hauteur/bord/fond du minimap ; `.bass-bar` recoloré en **rouge**
      (dégradé), titre « bande d'énergie basse 40–150 Hz (kick) » sur le conteneur
- [x] Compatibilité : le minimap ne gêne pas le zoom EPIC-017 (test d'interférence), la bande
      basse reste masquée en zoom (EPIC-017), destruction propre via `ws.destroy()` (le plugin
      retire son wrapper → pas de double minimap au re-render homonymes)
- [x] Tests : mock du plugin minimap + 6 tests (création dans le conteneur avec assertion non
      triviale de l'instance enregistrée, dégradation sans conteneur, **re-render homonymes →
      un minimap par rendu**, compatibilité zoom, titre de la bande, bande masquée en zoom)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/cueEditor.ts` | import Minimap, enregistrement dans `#cue-editor-minimap`, title de la bande basse |
| `templates/index.html` | conteneur `#cue-editor-minimap` |
| `static/style.css` | styles minimap + bande basse rouge (RGB DJ) |
| `static/src/render/cueEditor.test.ts` | mock minimap + 5 tests EPIC-018 |
| `docs/superpowers/epics/EPIC-018-minimap-bande-basse-coloree.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — ✓
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Tests ciblés : `cueEditor.test.ts` — 104 ✓ (6 nouveaux)
- [x] Review critique appliquée : assertion non triviale de l'instance minimap + test du
      re-render homonymes ; vérification source du plugin (le minimap **réutilise les peaks
      décodés du parent** — pas de second fetch — et applique bien `height: 56`, sans héritage
      du `height: 'auto'` du parent)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat(ui): EPIC-018 — minimap/overview synchronisée au zoom + bande basse colorée (RGB DJ)` |

## Décisions (KISS)

- **Conteneur dédié au minimap** plutôt qu'`insertPosition` dans la waveform : évite tout
  chevauchement avec les overlays existants (grille en %, bande basse absolue) et reste
  stable en plein écran.
- **Bande basse rouge (étape 1)** plutôt que le rendu RGB complet dès maintenant : le coût
  est une couleur + un title, et la lisibilité du kick est le gain principal. Le rendu
  mid/high (3-bandes complet) sera une EPIC dédiée.
- Le minimap charge l'audio par la même URL (cache navigateur local) — pas de changement
  d'API serveur.

## Notes / Risques

- Vérifié dans le source du plugin (v7.12) : le minimap construit sa mini-waveform depuis
  `ws.getDecodedData()` (`peaks` + `duration`, `url: undefined`) — **aucun second fetch** ;
  son `height: 56` est appliqué par fusion d'options propres (pas d'héritage du
  `height: 'auto'` du parent). Le viewport overlay est synchronisé automatiquement à
  `ws.zoom()`/scroll (EPIC-017) via les événements `scroll`/`redraw` du parent.
- Fullscreen : le minimap reste en dessous de la waveform agrandie (layout inchangé).
- Étape suivante (P1-4 complet) : calcul client 3-bandes (low/mid/high) + rendu RGB de la
  waveform principale — à traiter dans une EPIC dédiée si souhaité.
