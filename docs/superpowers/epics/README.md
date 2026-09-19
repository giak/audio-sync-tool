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
| [EPIC-029](EPIC-029-router-doublons-v2-legende.md) | Routeur de pages (`state.page` — répare la nav télescopée) + vue Doublons v2 (groupes de versions, arbitrage qualité + override) + légende refaite (5 sections, états complets) | 🟢 Livrée (`bb4c7d8`) | Haute | EPIC-028 (suite UX) |
| [EPIC-030](EPIC-030-filtre-rapide-universel.md) | Filtre rapide universel par liste : chips persistants au-dessus de chaque colonne (5 scopes mémorisés session), moteur partagé nom+année+codec, F7 toggle / `/` ouvre, Échap ferme — garde `isInput` structurelle | ⏸️ En pause (décision 2026-09-16, EPIC-031 prioritaire) — P0 Sync + chip playlist-source livrés (`850584a`, `b109c12`, `56431a9`), chips playlist-tracks/dups en attente | Haute | brainstorm session 2026-09-16 (design dans l'EPIC) |
| [EPIC-032](EPIC-032-matching-doublons-niveaux.md) | Doublons à deux niveaux : mêmes enregistrements (arbitrage/trash, v1) + **versions d'un même morceau** réunies par clé artiste/titre (parsing + inclusion de tokens, durées libres — jamais trashées automatiquement) | 🟢 Livrée (2026-09-17, prototype validé sur vraies données : 5 Energy Flash réunis, ~600 clusters, garde trash alignée sur la durée du gagnant) | Haute | EPIC-028 (moteur v1) |
| [EPIC-031](EPIC-031-clavier-centralise-grammaire-catalogue.md) | Clavier : matrice de caractérisation (touches × contextes — bindings morts/shadowés = rouge CI), légende **générée** depuis les bindings labellisés (test bijection), grammaire des touches (Échap = pile de fermeture explicite), ergonomie sync (Space→M déplacer, écoute en chaîne, `?` aide). KISS : pas de nouveau sous-système — visibilité plutôt qu'architecture | 🟡 P0+P1 livrés (P0 `b66d091`, P1 2026-09-17) — matrice 78 cellules + 5 invariants (IDX dérivés du registry : shuffle-proof), 4 findings corrigés (Échap modale>filtre, fallback menu remplacé par l'état `isContextMenuOpen`, Alt+←/→ vivants, clavier dups déshadowé), pile Échap complète menu→modale→filtre→dossier→audio (invariant 4), légende générée + bijection, `?` légende, menu contextuel clavier (Shift+F10, ↑↓+Enter) ; P2 ergonomie à venir | Haute | bugs clavier 2026-09-16 (bindings morts, touches volées) |
| [EPIC-033](EPIC-033-enrichissement-annees-id3.md) | Enrichissement des années ID3 manquantes (57 % du corpus) : 7 sources — MusicBrainz (1ʳᵉ sortie, 1 req/s) → Deezer → Discogs (token) → iTunes → Discogs reformulé ×2 (junk-artiste/marqueurs/suffixes) → YouTube (Topic + tier vérifié) — consolidation **1 443 certaines / 782 à revue / 1 473 introuvables**, apply mutagen par vagues de confiance (**2 161 écritures au journal**, backup additif, `--undo`) + vue « Années manquantes » (preview → confirmation, jamais écraser) + **P2** : export des choix (**e**/💾 → `POST /years/review`) consommé par `apply_years.py --review` (override humain) | 🏁 **Clôturée (2026-09-18)** — revue soldée (692 choix, 59 rejets), apply final idempotent, **76 % du corpus avec année** (vs 43 %) ; restes = données inexistantes en ligne (voir bilan de clôture dans l'epic) | Haute | mémoires Mnemolite `9539d4ab`, `32392db0`, `357e89d8` (bilan final) |
| [EPIC-034](EPIC-034-ux-rangement-sync-player-pastille.md) | UX rangement Sync : player audio des cartes (Années/Doublons, ▶/⏹ player global), pastille « déjà rangé » sur les épars jumeaux sous le filtre source, auto-expansion mémoire du dossier destination après F5 | 🟢 Livrée (2026-09-19, `c6546a0`, `ca21e21`, `6e02f87`) | Haute | EPIC-030/028/033 (socles) |
| [EPIC-035](EPIC-035-rangement-par-style.md) | Rangement par style : palette clavier `g` (1 style parmi 25, chord tranche), destination `style_tranche` **calculée** depuis l'année, suggestions locales (segments du chemin épars, voisinage artiste, genre ID3 aliasé, borne d'acquisition), aperçu groupé par dossier → F5 batch, écriture `TCON` via export → `apply_styles.py` (journal `old_genre` + `--undo`) | 🟢 **P1+P2+P3 livrés (2026-09-19, `c6fcfdf` → `e6dfa82`)** — P1 socle clavier (live headless) · P2 suggestions locales (moteur 4 signaux, chip « suggéré », `Enter` = accepter) · P3 TCON (`/styles/review` + `apply_styles.py` : journal `old_genre`, `--undo`, tag épars + copie, chip « écrit » ✓) ; P4 backlog | Haute | spec `2026-09-19-rangement-par-style-design.md` · plan `2026-09-19-rangement-par-style.md` |
| [EPIC-036](EPIC-036-refactoring-architecture.md) | Refactoring architecture : dette Phase 0 (flaky shuffle, gate 3 graines fixes, audit listeners, CSS mort via PurgeCSS), noyau `core/` (format/feedback/subscribe/dom), squelette de liste commun aux 5 pages, CSS en 4 couches, perf mesurée — strangler fig, **pas de framework** (verdict mesuré) | 🟡 **Phase 0 livrée (2026-09-19, `e623dd0`)** — 2 flaky corrigés (`state.filters` non réinitialisé), gate shuffle reproductible, 0 fuite listener, 21 lignes CSS mortes supprimées ; Phases 1-4 backlog | Moyenne | étude `refactoring/2026-09-19-refactoring-architecture.md` |

## État actuel du projet (2026-09-19)

- Tests : **979 vitest** (40 fichiers) / **237 pytest** (test_app 152, test_nml 29,
  test_analysis 15, test_apply_years 11, test_collect_discogs_reform 12,
  test_collect_itunes 10, test_report_years 8) — tous verts.
- **EPIC-034 livrée** (2026-09-19, `c6546a0` `ca21e21` `6e02f87`) : trois frictions du
  workflow de rangement soldées — player audio des cartes Années/Doublons (▶/⏹ réutilisant
  le player global, `playingPath()` re-marque après chaque re-render), pastille « ⤷ déjà
  rangé » sur les épars dont le jumeau est consultable sous le filtre source actif
  (sémantique identique à l'arbre, refresh croisé — jamais périmée), auto-expansion
  mémoire du dossier destination après F5 (`revealSourceDir` idempotent, zéro vol de
  focus). Vérifié en live sur données réelles.
- Filtre à deux niveaux des arbres source (2026-09-19, EPIC-030, `4f4eff2` + `87a1006`) :
  le terme du chip ne matche que les **dossiers** par défaut — l'expansion (manuelle ou
  auto) rend TOUS les fichiers (vérifier un doublon sous filtre) ; toggle 📄 fichiers
  opt-in (recherche par nom de fichier, comportement historique préservé derrière).
- **EPIC-033 livrée** (2026-09-17, `a1810d6`) : 3 704 fichiers sans année (57 %) → 4 passes
  sans clé (MB/Deezer/Discogs/iTunes), consolidation 1 427 certaines / 642 à revue /
  1 629 introuvables, **1 349 tags appliqués** (journal = backup, `--undo` idempotent),
  vue « Années manquantes » (revue interactive). **Clôturée le 2026-09-18** après les
  passes reform ×2 / Beatport (en pause) / YouTube : revue soldée (692 choix — 633 années
  + 59 rejets), apply final idempotent (**2 161 écritures** au journal), **76 % du corpus
  avec année** — suite : EPIC-033-bis (re-scan du disque).
- EPIC-023–027 livrées (2026-09) : refonte popup Légende (4 colonnes) + fix cache-buster
  CSS, point d'entrée nav Cue Editor, lecture playlist, liste fichiers en vrai tableau
  `<table>` + colgroup `table-layout: fixed` (EPIC-026), et **EPIC-027** (création d'un
  dossier racine Source Data via bouton ➕ — `/mkdir` + `data/extra_dirs.json`, retrait
  index-only).
- Session 2026-09-15 hors EPIC (fixes directs, tests inclus) : F5 copie avec focus sur
  ligne fichier d'un dossier déplié (`04d93e1`), Tab focus retenu + visibilité focus
  colonne gauche (`0f572df`), lint 0 erreur sur 63 fichiers (`1194c51`).
- **EPIC-030 P0 livré** (2026-09-16) : filtre rapide côté Sync — chips intégrés
  `sync-epars`/`sync-source`, moteur partagé nom+année+codec, palette flottante
  retirée, focus/caret conservés à travers les re-renders (`850584a` + `b109c12`).
- **EPIC-035 P1+P2 livrés** (2026-09-19, 11 commits P1 `c6fcfdf` → `cd12601`, P2 `09705b3`)
  : rangement par style au clavier — taxonomie dérivée des 86 dossiers (25 styles),
  palette `g` (couche DOM, registry intact), colonne Style, filtre épars par sous-dossier,
  aperçu `e` groupé par dossier → `copyFilesTo` (extrait du F5). Zéro backend en P1.
  **P2** : genre ID3 lu au scan (TCON/GENRE/©gen), `_build_source_index` (artiste→styles
  au scan, servi par /load), moteur pur `styleSuggest.ts` (4 signaux : chemin 0,50 ·
  artiste 0,40 · session 0,20 · genre 0,15 ; ex æquo → null ; seuil 0,25), chip
  « suggéré » pointillé + % dans la colonne Style, `Enter` = accepter dans la palette.
  Gate P2 : 1 091 vitest / 302 pytest. Live P2 + calibration des poids au prochain usage
  réel. **P3 livré** (`e6dfa82`) : écriture TCON via export → script —
  `POST /styles/review` (400 hors taxonomie), `scripts/apply_styles.py` (dry-run défaut,
  journal `old_genre` = backup, `--undo` idempotent, tag épars + copie rangée), chip
  « écrit ✓ » quand le genre du scan == style. Gate P3 : 1 095 vitest / 317 pytest.
  Reste P4 (confort) + live P3 sur données réelles après un premier usage.
- **EPIC-036 Phase 0 livrée** (2026-09-19, `e623dd0`) : hygiène avant refactoring —
  2 flaky corrigés (tests filtre laissaient `state.filters` pollué :
  `sourceTree.test.ts` + `yearsUI.test.ts` ; 5 graines shuffle × 1 095 verts),
  3 graines fixes shuffle ajoutées à la CI (la CI tirait déjà une graine aléatoire,
  mais un échec n'était pas reproductible), audit listeners `document`/`window`
  (7 sites : zéro fuite réelle, consigné), audit PurgeCSS (`npm run audit:css`)
  → 1 famille morte confirmée supprimée (ancienne table doublons EPIC-028, 21 lignes).
- Prochains chantiers : **EPIC-036 Phase 1** (modules `core/` : format, feedback,
  dom, subscribe — cf. `docs/refactoring/2026-09-19-refactoring-architecture.md`),
  **EPIC-035 P4** (confort : reprise `style_review.json`, onglet
  Config Styles, dossier pré-surligné), **EPIC-033-bis** (re-scan du corpus puis collectes incrémentales sur les ~3 551 nouveaux fichiers sans année), **EPIC-031 P2**
  (ergonomie sync : M déplacer, écoute en chaîne), reprise **EPIC-030 P1**
  (chips playlist-tracks + dups), **EPIC-022** (backlog, priorité Haute — a11y + responsive
  cue editor) ; EPIC-028/029 : validation visuelle des vues Doublons sur données réelles.
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
