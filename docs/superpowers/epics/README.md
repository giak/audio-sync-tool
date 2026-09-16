# EPICs — Registre central (traçabilité)

> Chaque évolution/amélioration du projet est une **EPIC** : un fichier dédié sous `docs/superpowers/epics/`
> avec objectif, tâches cochables, fichiers impactés, validation, décisions et **traçabilité** (commits,
> journal, dates). Ce README est l'**index unique** : toute nouvelle évolution → nouvelle EPIC + entrée ici.
>
> Convention : `EPIC-NNN-slug.md` (NNN incrémental, jamais réutilisé). Statuts :
> `⚪ Backlog` → `🔵 En cours` → `🟢 Livré` | `🟠 Bloqué` | `🔴 Abandonné`.

## Règles d'or de la traçabilité

1. **Une évolution = une EPIC** (feature, correctif structurant, dette technique, refonte UX).
2. **Toute EPIC livrée** référence ses commits (`git log`), ses tests, et les docs liées (plan/spec/rapport).
3. **Toute EPIC backlog** pointe vers le plan/spec qui la détaille (jamais de promesse orpheline).
4. Mettre à jour le **statut + la date** dans ce README **et** dans le fichier EPIC.
5. Un bug ponctuel ne crée pas d'EPIC — il se règle en direct (mais une **série de bugs sur un même
   domaine** devient une EPIC « dette »).

## Index

| EPIC | Titre | Statut | Priorité | Doc liée |
|---|---|---|---|---|
| [EPIC-001](EPIC-001-cue-editor-waveform.md) | Éditeur waveform cue/loop (nml.py + routes + modal wavesurfer) | 🟢 Livré | — | plan `2026-08-08-waveform-cue-editor.md` |
| [EPIC-002](EPIC-002-correctifs-bloquants-audit.md) | Correctifs bloquants de l'audit (B1–B7) | 🟢 Livré | — | rapport `2026-08-08-audit-technique-ux.md` |
| [EPIC-003](EPIC-003-export-nml-configurable.md) | Export NML configurable + round-trip DISPL_ORDER (B8–B9) | 🟢 Livré | — | rapport audit |
| [EPIC-004](EPIC-004-hygiene-lint-ci-docs.md) | Lint 0 erreur + CI GitHub Actions + docs à jour | 🟢 Livré | — | rapport audit §P2 |
| [EPIC-005](EPIC-005-ux-cue-editor.md) | UX cue editor : accès playlist, plein écran, homonymes | 🟢 Livré | — | rapport audit §3 |
| [EPIC-006](EPIC-006-beatgrid-snap-loop.md) | Snap beatgrid (BPM détecté/saisi) + lecture de boucle | 🟢 Livré | — | plan `2026-08-08-beatgrid-calage-bpm-basse.md` |
| [EPIC-007](EPIC-007-ajout-piste-collection.md) | Ajouter une piste absente au collection.nml (POST /api/track/add) | 🟢 Livré | — | plan beatgrid |
| [EPIC-008](EPIC-008-grille-native-nml.md) | Grille native Traktor (TEMPO + TYPE=4/GRID) exposée et appliquée (P1) | 🟢 Livré | — | plan beatgrid §P1 |
| [EPIC-009](EPIC-009-phase-manuelle-cache.md) | Beatgrid P2 : contrôle de phase manuel + cache par piste | 🟢 Livré | Haute | plan beatgrid §P2 |
| [EPIC-010](EPIC-010-analyse-serveur-kick.md) | Beatgrid P3 : analyse serveur kick/phase (DSP maison) + bouton Analyser | 🟢 Livré | Haute | plan beatgrid §P3 |
| [EPIC-011](EPIC-011-ecriture-grille-nml.md) | Beatgrid P4 : écrire TEMPO+TYPE=4 dans le NML (le graal) | 🟢 Livré | Moyenne | plan beatgrid §P4 |
| [EPIC-012](EPIC-012-bande-basse-barres.md) | Beatgrid P5 : bande d'énergie basse + numéros de barre | 🟢 Livré | Basse | plan beatgrid §P5 |
| [EPIC-013](EPIC-013-robustesse-backend.md) | Robustesse backend : JSON atomique, verrou scan, cache parse, debug off | 🟢 Livré | Moyenne | rapport audit §6/B11/B12 |
| [EPIC-014](EPIC-014-ux-generale.md) | UX générale : focus trap, aria, police locale, prompt→modales, responsive | 🟢 Livré | Moyenne | rapport audit §4 |
| [EPIC-015](EPIC-015-filesize-ko-octets.md) | FILESIZE en Ko (convention Traktor) : match/add/export réparés sur la collection réelle | 🟢 Livré | Haute | rapport `2026-08-08-smoke-test-navigateur.md` |
| [EPIC-016](EPIC-016-badge-match-nml-playlist.md) | Badge « matché NML » / « homonymes » / « non importé » dans la playlist | 🟢 Livré | Moyenne | EPIC-015 (contexte match) |
| [EPIC-017](EPIC-017-zoom-raccourcis-downbeat.md) | Zoom waveform (paliers, molette, 1 beat) + raccourcis cue 1-8/C + downbeat différencié | 🟢 Livré | Haute | rapport `2026-08-08-waveform-cue-beatgrid-benchmark.md` §P0 |
| [EPIC-018](EPIC-018-minimap-bande-basse-coloree.md) | Minimap/overview synchronisée au zoom + bande basse colorée (RGB DJ, étape 1) | 🟢 Livré | Moyenne | rapport benchmark §P1 |
| [EPIC-019](EPIC-019-renommage-couleur-cues.md) | Renommage + recolorisation des cues (double-clic slot/région, round-trip NML) | 🟢 Livré | Moyenne | rapport benchmark §P1 |
| [EPIC-020](EPIC-020-waveform-3-bandes-rgb.md) | Waveform 3-bandes RGB complète (low/mid/high — FFT fenêtrée, standard DJ) | 🟢 Livré | Moyenne | rapport benchmark §P1-4 |
| [EPIC-021](EPIC-021-undo-redo-cue-editor.md) | Undo/redo dans le cue editor (poses/suppressions/déplacements de cues et loops) | 🟢 Livré | Moyenne | rapport benchmark §P2 |
| [EPIC-022](EPIC-022-a11y-responsive-cue-editor.md) | Accessibilité (aria-label) + responsive cue editor + correction bugs CSS (`--border`/`--text`) | ⚪ Backlog | Haute | audit UI/UX 2026-08-19 (session) |
| [EPIC-023](EPIC-023-legend-modal-redesign.md) | Refonte popup ❓ Raccourcis & Légende : modal-xl, grille 4 colonnes (Légende/Sync/Playlist/Cue editor) + fix cache-buster CSS | 🟢 Livré | Basse | spec/plan `2026-09-14-legend-modal-redesign*` |
| [EPIC-024](EPIC-024-cue-editor-nav.md) | Point d'entrée nav « 🎛️ Cue Editor » — lastCueTrack + bouton grisé | 🟢 Livré | Basse | spec `2026-09-14-cue-editor-nav-design.md` |
| [EPIC-025](EPIC-025-playlist-playback.md) | Lecture dans le panneau Playlist — bouton ▶ par piste + glow du nom | 🟢 Livré | Moyenne | spec `2026-09-14-playlist-playback-design.md` |
| [EPIC-026](EPIC-026-liste-fichiers-tableau-contraste.md) | Liste fichiers en vrai tableau (colgroup `table-layout: fixed`) + « Cues » hors épars + textes éclaircis | 🟢 Livré | Haute | mesures headless `/tmp/opencode/measure-*.html` |
| [EPIC-027](EPIC-027-mkdir-dossier-racine-source.md) | Créer un dossier racine Source Data via bouton ➕ (`/mkdir` + `extra_dirs.json`, retrait index-only) | 🟢 Livré | Moyenne | session 2026-09-15 |
| [EPIC-028](EPIC-028-doublons-remplacement-qualite.md) | Doublons épars ↔ source : détection (durée ±2 s + nom fuzzy) + remplacement qualité (FLAC vs MP3) via trash `_trash/` — jamais d'effacement | 🟢 Presque livrée (P0+P1+P1bis+P2, reste validation visuelle P2) | Haute | spec `2026-09-15-doublons-detection-design.md` (as-built inclus) |

## État actuel du projet (2026-09-16)

- Tests : **798 vitest** / **190 pytest** (test_app 146 + test_nml 29 + test_analysis 15) — tous verts.
- EPIC-023–027 livrées (2026-09) : refonte popup Légende (4 colonnes) + fix cache-buster
  CSS, point d'entrée nav Cue Editor, lecture playlist, liste fichiers en vrai tableau
  `<table>` + colgroup `table-layout: fixed` (EPIC-026), et **EPIC-027** (création d'un
  dossier racine Source Data via bouton ➕ — `/mkdir` + `data/extra_dirs.json`, retrait
  index-only).
- Session 2026-09-15 hors EPIC (fixes directs, tests inclus) : F5 copie avec focus sur
  ligne fichier d'un dossier déplié (`04d93e1`), Tab focus retenu + visibilité focus
  colonne gauche (`0f572df`), lint 0 erreur sur 63 fichiers (`1194c51`).
- Prochains chantiers : **EPIC-028** (backlog, priorité Haute — doublons épars ↔
  source, design validé 2026-09-15) et **EPIC-022** (backlog, priorité Haute) — a11y +
  responsive cue editor.
- Historique antérieur : voir ci-dessous (2026-08-08).

## Historique projet (2026-08-08)

- Tests : **672 vitest** / **173 pytest** — tous verts, y compris en `--sequence.shuffle` (25+ runs) (état 2026-08-08).
- EPIC-009 livrée (phase manuelle + cache beatgrid) : nudge ←/→ 1/4, « ◎ Beat 1 », cascade
  NML → cache (`data/beatgrids.json`) → détection, invalidation par FILESIZE.
- EPIC-010 livrée (analyse serveur kick/phase) : pipeline DSP maison pur Python (`analysis.py`,
  zéro dépendance lourde — décision review KISS), `POST /api/track/analyze` → {bpm, phase,
  confidence} persisté en cache (source detected), bouton « 🔍 Analyser » (état ⏳), badge
  « auto · % ». Filtre 40–150 Hz + ODF + autocorrélation (comb 4 harmoniques, interpolation
  parabolique du lag) + scan de phase 5 ms ; repli large bande si pas de kick 4/4.
- EPIC-011 livrée (écriture de la grille dans le NML, le « graal ») : `upsert_beatgrid` (TEMPO + CUE_V2
  TYPE=4 `AutoGrid` + GRID, 6 décimales, idempotent), `POST /api/track/grid` (backup + journal),
  bouton « 💾 Grille » (disabled sans BPM/ENTRY) + badge NML après écriture. Validation sur copie
  de la collection réelle (56 645 ENTRY) : format conforme, +3 grilles, round-trip sans perte.
- EPIC-012 livrée (P5, validation visuelle) : bande d'énergie basse 40-150 Hz sous la waveform
  (`bassband.ts`, biquad RBJ → décimation → RMS, calculée côté client depuis le buffer wavesurfer,
  différée, best-effort) + numéros de barre tous les 4 beats (masqués si trop serrés).
- EPIC-013 livrée (robustesse backend) : `save_json` atomique (.tmp+replace), `load_json` corrompu →
  défaut (+ journal error, sans récursion), verrou `/scan` (409, relâché en finally), journal borné
  500 + bouton « 🗑 Vider » (DELETE /journal), `app.run(debug)` via `--debug` uniquement, cache parse
  NML par (mtime+taille) — le graal EPIC-008→011 ne re-parse plus ~0,5 s à chaque GET.
- EPIC-014 livrée (UX générale) : police sans CDN (fallback mono système), focus trap + aria sur les
  modales, `prompt()`/`confirm()` → `confirmDialog`/`promptDialog` custom, canal toast séparé de la
  barre d'état, états vides (`.panel-empty`), responsive minimal < 1024 px, validation rating 0-100
  à la frappe. Cache-buster CSS déjà en place (vérifié) — ⚠ rem. EPIC-023 : il ne couvrait en fait
  que `script.js` (mtime max JS+CSS appliqué en 2026-09-14).
- EPIC-015 livrée (FILESIZE Ko, découvert par le smoke test navigateur) : le NML Traktor stocke
  INFO/FILESIZE en **Ko arrondis** (prouvé : 581/600 match avec `round(size/1024)` sur la collection
  réelle, 0/600 en octets) alors que le serveur comparait `os.path.getsize()` → match impossible
  (cue editor « visualisation seule » partout). Helper `filesize_kb()` (half-up `(size+512)//1024`),
  `track_match`/`track_add`/`build_export_nml` en Ko, `build_entry_element` écrit le Ko. Résultat :
  **97,5 % de match (78/80) sur la collection réelle via HTTP** (les non-matchés sont absents du NML).
- EPIC-016 livrée (badge match NML dans la playlist) : badge « ✓ NML » (matché, sauvegardable) /
  « ≈ homonymes » (sélecteur au clic Cues) / « ✕ non importé » (visualisation seule) / « ? »
  (erreur réseau neutre), rempli en lazy (placeholder « … », ne bloque jamais le rendu), cache de
  promesses par fullPath (dédup concurrente, `matchStatus.ts`), lots bornés de 8 requêtes,
  mutation in-place (data-fullpath conservé), invalidation + re-render après ajout de piste à la
  collection.
- EPIC-017 livrée (P0 du benchmark) : zoom waveform contrôlé — paliers ×1,5 (boutons +/−,
  touches +/−), molette ×1,25, « Fit » (piste entière) et « 1 beat » (largeur ÷ intervalle,
  nécessite BPM) via `ws.zoom()` ; la grille de beats est redessinée dans la **fenêtre visible**
  (scrollLeft ÷ px/s) pour rester alignée à tout zoom ; downbeat différencié (classe `beat1`,
  trait ambre) ; raccourcis cue `1–8` (slots A–H) et `C` (pose au curseur / déplace l'existant,
  toast si 8 pleins) ; bande basse masquée en zoom. 14 tests, 97 tests cueEditor.
- EPIC-018 livrée (P1 du benchmark) : **minimap/overview** — plugin Minimap de wavesurfer dans
  un conteneur dédié sous la waveform, viewport synchronisé au zoom/scroll (EPIC-017), clic =
  seek, dégradation silencieuse sans conteneur ; **bande basse colorée en rouge** (standard RGB
  DJ : red = low) + title explicite. 5 tests, 103 tests cueEditor.
- EPIC-019 livrée (P1 du benchmark) : **nom + couleur des cues éditables** — double-clic sur un
  slot OU une région → popover nom + palette de 8 couleurs ; slot vide → pose le cue d'abord ;
  round-trip NML complet (lecture `NAME`/`RED/GREEN/BLUE` affichés, écriture au save) via la
  source de vérité `_cueMeta` (les régions wavesurfer ne portent pas les métadonnées, même
  pattern que `_displOrders`). 6 tests, 113 tests cueEditor+cuemodel.
- EPIC-020 livrée (P1-4 du benchmark) : **waveform 3-bandes RGB complète** — `bands.ts` (ex
  `bassband.ts`) : `computeRGBBands` par FFT fenêtrée (séparation spectrale quasi parfaite ;
  découverte forensique : le biquad RBJ à Q faible fuit 20-35 % du hors-bande, cascade ordre 8
  nécessaire → FFT) ; rendu 3 couches superposées (rouge basse / vert médium / bleu aigu) en
  `mix-blend-mode: screen` (mélange additif), masquée en zoom. 10 tests, 723 vitest shuffle.
- EPIC-021 livrée (P2 du benchmark) : **undo/redo dans le cue editor** — piles de snapshots
  de l'état des régions (structure + `_cueMeta` + `_displOrders`), push AVANT chaque mutation
  (pose clic/1-8/C, suppression Suppr/clic droit, loop dessiné via `region-initialized` id
  string, renommage/couleur), restauration atomique (remove+re-addRegion, garde `_restoring`
  contre la ré-entrance plugin). Boutons ↺/↻ + Ctrl+Z / Ctrl+Shift+Z. 7 tests, 730 vitest.
- Typecheck 0 · Lint 0 · Build OK (bundle servi avec cache-buster).
- EPIC-002 → EPIC-009 livrées et **commitées** (`a21f1ae` → `3f3b669`), EPIC-001 à ses commits
  historiques, ce registre inclus dans `7bb1735`.
- Review critique des EPICs : `reports/2026-08-08-audit-epics-review.md` (corrections chiffres,
  stabilisation shuffle, sécurité `/api/track/match`).

## Créer une nouvelle EPIC

```bash
# 1. Copier le gabarit
cp docs/superpowers/epics/_template.md docs/superpowers/epics/EPIC-NNN-slug.md
# 2. Remplir + ajouter une ligne à l'index ci-dessus
# 3. Cocher au fil de l'eau ; passer le statut à 🟢 une fois tests verts + commit
```

Voir le [gabarit](_template.md) pour la structure type d'un fichier EPIC.
