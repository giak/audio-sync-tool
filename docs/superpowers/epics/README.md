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
| [EPIC-036](EPIC-036-refactoring-architecture.md) | Refactoring architecture : dette Phase 0 (flaky shuffle, gate 3 graines fixes, audit listeners, CSS mort via PurgeCSS), noyau `core/` (format/feedback/subscribe/dom), squelette de liste commun aux 5 pages, CSS en couches bundlées esbuild, perf mesurée — strangler fig, **pas de framework** (verdict mesuré) | ✅ **Phases 0-4 livrées (2026-09-19, `e623dd0`+`a5e2e08`+`30f9400`+`b60d8dc`+`d6c2e08`)** — CSS en couches (preuve cascade + captures 0 px), perf mesurée (content-visibility rejetée sur spec+profil, normalizeName mémoïsé) | Moyenne | étude `refactoring/2026-09-19-refactoring-architecture.md` |
| [EPIC-037](EPIC-037-filtre-colonnes-sticky-clavier-annees.md) | Chip de filtre des colonnes : filtre « année honnête » (texte **et** chiffres, deux colonnes — `2020` gardait 493 lignes dont 333 d'une autre année via les sous-dossiers datés), chip **collé** (sticky sync, pattern playlist/years), clic dans le champ **sans scroll** (handler de panneau), `↓` dans la liste **de sa colonne** (bindings scope-aware) | 🟢 **Livrée (2026-09-21)** — `2020` → **189** gardées (contre 493) et `1993` → 127 mesurés sur la collection ; chip collé + clic sans scroll + `↓` dans SA colonne prouvés headless **5/5** (`scripts/proof_filter_chip.py`, contrôle sticky inclus), tests validés par mutation ; **P1 bis (arbre Source Data) écarté** par décision — limite assumée et tracée (`1993` → 0 dossier à droite, 59 fichiers taggés 1993) | Haute | spec `2026-09-21-filtre-colonnes-sync-design.md` |
| [EPIC-038](EPIC-038-player-audio-singleton.md) | Player audio **singleton strict** : `currentAudio` assigné synchroniquement (fini l'assignation tardive au `.then`), génération de lecture anti-promesses périmées, `releaseAudio` (pause + `src=''` + handlers détachés), marques nettoyées en un point — une seule piste audible à la fois, quel que soit le point d'entrée | 🟢 **Livré (2026-09-21)** — `playSeq` + `releaseAudio` + assignation synchrone ; +4 tests de course (A→B avant résolution = un seul élément non pausé, prouvé par mutation) ; gate 1 133 vitest / 317 pytest | Haute | spec `2026-09-21-player-singleton-design.md` |
| [EPIC-040](EPIC-040-annees-corroboration-2-sources.md) | **Années corroborées** : plus jamais une réédition écrite comme année du morceau. Trois défauts cumulés (ordre artiste/titre deviné depuis le nom, **Deezer sans garde artiste/titre**, `release_date` d'album pris pour la première sortie) → 408 écritures Deezer dont **173 ≥ 2015 (42,4 %)** contre 12 % pour MusicBrainz. Corrigé par orientations multiples (tags → nom → nom inversé, la garde tranche), garde tokens partout, Discogs en 3ᵉ provider, et **règle des 2 providers indépendants concordants** (sinon revue, rien n'est écrit) ; audit des années déjà écrites + `--undo` qui restaure | 🟡 **Moteur + audit livrés (2026-09-21)** — cas signalé corrigé (**Phantasia « Inner Light » 2024 → 1991**, journal `old=2024`) ; 11 nouveaux tests dont la régression, validés par mutation ; providers **Discogs** (3ᵉ, en direct) · **YouTube Topic** (4ᵉ, `--youtube`) · **recherche web Brave** (candidats seulement, ne vote jamais) ; **reste** : re-collecte complète + exposition en revue (vue Années) + audit des 408 (commandes dans l'EPIC) | Haute | spec `2026-09-21-annees-corroboration-design.md` · EPIC-033 · mémoire MnemoLite `a4494da3` |
| [EPIC-041](EPIC-041-palette-g-ecriture-immediate-scope.md) | **Palette `g` : tags écrits tout de suite + scope** — le choix d'un style **et** d'une année écrit le tag du fichier immédiatement (avant : le TCON attendait un script hors navigateur, l'année n'était **jamais** écrite) ; `g` agit sur le **morceau surligné**, Éparpillé **ou** Source Data (avant : garde `activePanel` ⇒ `g` muet après un simple clic dans la colonne droite) ; la modale montre **tout** (57 années 1970→2026 + tous les styles, grille de styles défilante) | 🟢 **Livré (2026-09-22)** — `POST /styles/apply` + `/years/apply` (confinement aux racines, relecture, journal partagé ⇒ `--undo` des scripts les annule) ; preuve headless **9/9** (10/10 avec 42 styles) sur les tags **relus sur disque**, + **preuve par mutation** des 2 gardes neuves (garde `activePanel` réintroduite → 4/9 en échec = `g` silencieux) ; gate **1 142 vitest / 335 pytest**, lint 0 | Haute | spec `2026-09-22-palette-g-scope-design.md` · EPIC-035 (socle) |
| [EPIC-042](EPIC-042-legende-lisible-colonnes-familles.md) | **Légende lisible** : la modale « ❓ Raccourcis & Légende » se lit d'un coup d'œil — colonnes **jamais étirées** (avant : cellules de grille étirées, **2 385 px** de vide interne, lignes 19 → 141 px), **une abscisse par section** (`subgrid`, avant : jusqu'à **7 abscisses**), **familles de touches** (8 lignes « Échap — fermer X » → **1**, 31 bindings → 12 lignes), libellés raccourcis (**89 → 71 lignes**), un marqueur par ligne, **une seule abscisse de libellé pour toute la feuille** (piste des touches à largeur fixe `--legend-key: 110px`) et **flux multi-colonnes** (4 colonnes ≥ 1 850 px, sinon 2, sinon 1 — le palier 3 est écarté après mesure) | 🟢 **Livré (2026-09-22)** — harnais `scripts/measure_legend.py` **13/13** à 3440, 2560, 1920, 1600, 1366, 1000 et 700 px (**3/10** avant), **0** libellé coupé partout, modale entière à l'écran ≥ 1600 px (668/668), contrastes inchangés ; preuve par mutation exécutée (`subgrid` retiré → alignement en échec ; famille à 1 membre → 2 tests en échec) ; **deux régressions corrigées le même jour** : (1) un template d'une autre version **effaçait** les sections statiques (*États* vide) → contrat non destructif + vérification **H** ; (2) la table de colonnes figée jetait la 4ᵉ colonne sous 1 500 px (colonne orpheline de 1 233 px à 1 366 px) → **flux multi-colonnes** + vérification **I**, contrat F scoped aux largeurs tenables ; gate **1 145 vitest / 335 pytest**, lint 0 | Moyenne | harnais `scripts/measure_legend.py` · EPIC-031 (légende générée + bijection) · EPIC-023 (refonte) |
| [EPIC-039](EPIC-039-focus-lisible-listes.md) | **Focus lisible** : le curseur (morceau **ou** dossier) doit sauter aux yeux dans toutes les listes. Grammaire unique — boîte d'accent 2 px + barre 4 px + fond teinté — au lieu de l'empilement de traits translucides d'origine (`--border-focus` 35 % = **1,17:1** de contraste) ; panneau actif passé de 3,38:1 à 11,45:1 ; cartes Années/Doublons alignées (ambre conservé, sémantique de revue) | 🟢 **Livré (2026-09-21)** — mesure headless **8/8** (`scripts/measure_focus_visibility.py`, contraste calculé comme le navigateur le rend + contrôle de sensibilité par réinjection des règles d'origine) : dossier 1 px/1,17:1 → **2 px/9,79:1**, ligne barre 3 → **4 px** et boîte **2 px/9,79:1**, panneau **11,45:1**, clic réel = la ligne cliquée focusée. Zéro TS touché (seule la peinture change) | Haute | harnais `scripts/measure_focus_visibility.py` (captures avant/après) |
| [EPIC-043](EPIC-043-style-ecrit-a-la-copie-f5.md) | **Le style est écrit à la copie** : F5 range **et** tague — le nom du dossier de destination (`<style>_<tranche>`, la déclaration de style de l'app) est écrit dans le tag genre **sur l'épars et sur la copie**, tout de suite, dans le journal partagé des scripts (`source: "copy-f5"`). L'année n'est **jamais** touchée ; pas de validation contre la taxonomie (un dossier neuf marche du premier coup) ; hors grammaire = rien ; idempotent (aucune ligne de journal si `old == style`) ; **jamais bloquant** (copie `ok`, échec rapporté) | 🟢 **Livré (2026-09-22)** — `POST /copy` renvoie `style` / `style_writes` / `style_error` ; `genre` patché des deux côtés côté client + cellule *Style* rafraîchie + phrase de consentement dans la modale F5 ; gate **1 154 vitest / 342 pytest**, lint 0, typecheck 0 | Haute | spec `2026-09-22-style-a-la-copie-design.md` · EPIC-035 (grammaire) · EPIC-041 (écriture immédiate) · EPIC-034 (flux F5) |
| [EPIC-044](EPIC-044-alignement-genres-arborescence.md) | **Le stock de genres rejoint l'arborescence** : EPIC-043 avait fermé la fuite pour le futur (chaque copie écrit le style du dossier cible), mais sur 1 604 rangés **1 023 contredisaient** leur dossier (« Techno », « Electronic », « Dance »…) et **258** n'avaient aucun genre. `A` (page Sync) ouvre un **aperçu** (rien n'est écrit), puis un dialogue à **deux modes** — corriger + remplir, ou **remplir seulement les vides** — et écrit via le **journal partagé** des scripts (`source: "align"` ⇒ `apply_styles.py --undo` restaure, y compris `old: null`). Le **disque est autoritaire** (un cache périmé n'écrase jamais un genre en mode « vides »), l'**année n'est jamais touchée**, un échec n'interrompt pas le lot, et les épars sont **hors périmètre** (leur genre est une entrée de suggestion, pas un rangement) | 🟢 **Livré (2026-09-22)** — aperçu réel : 323 alignés / 1 023 à corriger / 258 sans genre / 0 hors grammaire ; dry-run **1 281** écritures (mode `tous`) et **258** (mode `vides`) en **0,46 s**, aucun tag touché ; gate **1 171 vitest / 351 pytest**, lint 0, typecheck 0 | Haute | spec `2026-09-22-alignement-genres-design.md` · EPIC-043 · EPIC-035 · EPIC-033/040 (même forme) |
| [EPIC-045](EPIC-045-revue-annees-ecrites.md) | **L'audit des années écrites a enfin une surface** : EPIC-040 avait corrigé le robinet **et** classé les écritures passées (`data/year_audit.json`, 408 entrées) — mais ce fichier n'était lisible par personne dans l'app, et la vue Années ne montre que les fichiers **sans** année. Sur les 408 auditées : **23 confirmées · 38 contredites** (le tag dit autre chose que la première sortie, **proposition** fournie) **· 8 à revoir · 339 non vérifiées**. La vue Années ouvre désormais sur une section **⟲** : badge `écrit 2024 → 1991`, sources et fiche de sortie, **Corriger** (écriture immédiate, journal partagé `source: "audit:revue"` ⇒ `apply_years.py --undo` **restaure** l'année d'avant), candidates cliquables, **Garder** (rien n'est touché, le cas sort de la file) et **lots sous confirmation**. Le disque est autoritaire (`deja`, pas de réécriture ni de journal), les refus sont nommés sans interrompre le lot, et une route absente laisse la page **inchangée** | 🟢 **Livré (2026-09-22)** — 11 pytest (dont `--undo` réellement exécuté), 17 vitest, gate **1 188 vitest / 362 pytest**, lint 0 ; **bout en bout dans le navigateur sur bac à sable** : tag relu sur disque (2024 → **1991**, genre intact), journal partagé, `--undo` → 2024 restauré ; lecture sur la collection réelle : 408 / 23 / 38 / 8 / 339, **46 à trancher**, aucune écriture déclenchée | Haute | spec `2026-09-22-revue-annees-ecrites-design.md` · EPIC-040 (dernier maillon) · EPIC-033 · EPIC-041/043/044 (même grammaire) |
| [EPIC-046](EPIC-046-style-des-deux-cotes.md) | **Le style se lit des deux côtés** : la colonne Source Data n'avait **aucune** colonne Style — une copie F5 (EPIC-043) ou un `g` sur un rangé écrivaient le tag sans que rien ne change à l'écran. La table source passe à **8 colonnes** (play, nom, note, année, STYLE, codec, durée, cues) ; la référence y est le **dossier** (un fichier rangé est *dans* sa déclaration de style) : `✓ style` = accord, `style ≠` = divergence (ambre), `style ?` = tag vide, dossier hors grammaire = colonne vide (aucune cible inventée) | 🟢 **Livré (2026-09-22)** — cellule insérée aussi à la création d'une ligne par la copie ; genre lu au scan propagé jusqu'au DOM (`FileEntry.genre`) ; **forme réelle corrigée par EPIC-050** (double slash de la racine à slash final → la cellule était absente chez l'utilisateur) | Haute | spec `2026-09-22-style-des-deux-cotes-design.md` · EPIC-035 · EPIC-043 · EPIC-050 |
| [EPIC-047](EPIC-047-palette-complete-echelle.md) | **Palette complète et à l'échelle de l'écran** : la palette ne montrait que les styles **ayant des fichiers** (92 dossiers sur le disque, **86** dans la taxonomie : `breakbeat_2000`, `house_1990`, `techno_hard_2005`… manquaient, et `/styles/apply` refusait `breakbeat` en 400 « style inconnu ») ; elle mesurait **560 px fixes** (22 % de l'écran à 2 560 px, 4 colonnes figées) et chaque bouton portait un pavé de touche `<kbd>` dans un bouton **cliquable**. La source de vérité redevient le **disque** (dossier vide = déclaration de style), la largeur devient `clamp(560px, 44vw, 1180px)`, les colonnes `auto-fill`, et `<kbd>` disparaît (`title` + pied de palette) | 🟢 **Livré (2026-09-22)** — mesuré au navigateur : palette **1126×185 px = 44 %** à 2 560 px, 5 colonnes, **0** `<kbd>`, 57 années ; `breakbeat`/`house` (dossiers **vides**) acceptés par `/styles/apply`, style inconnu toujours refusé en 400 ; 🗑 cache un dossier du disque (`hidden_dirs.json`) | Haute | spec `2026-09-22-palette-complete-echelle-design.md` · EPIC-035 · EPIC-041 |
| [EPIC-048](EPIC-048-remix-annee-originale.md) | **Un remix ne date pas de l'original** : `age of love - the age of love (cosmic gate mix)(tasnoise).mp3` concluait **1990** — l'année de l'original — parce que `artist_title()` supprimait les segments parenthésés et que `NOISE` effaçait `mix`/`remix`/`edit` **avant** la recherche : la version de remix devenait invisible au lieu d'être vérifiée. Nouveau module `remix_credit` (crédit = premier segment qui **nomme quelqu'un**, `(cosmic gate mix)` et non `(tasnoise)` ; « Extended Mix » n'est personne), garde `require` sur MusicBrainz **et** Deezer (la source doit nommer le remixeur), recherche web passée **avec** le remixeur, moteur **v3** et `--only=remix` pour re-collecter les seules clés concernées | 🟢 **Livré (2026-09-22)** — mesuré en direct : `statut ambiguous · aucune année écrite · proposé 2004 · web 2004` (Discogs « 2004, CD ») contre **1990 écrit avant** ; sans consensus web, **aucune** suggestion (on ne propose pas l'année de l'original) ; 5 tests dont le filtre testé sur le **vrai** `mb_lookup` | Haute | spec `2026-09-22-remix-annee-originale-design.md` · EPIC-040 · EPIC-033 |
| [EPIC-049](EPIC-049-recherche-web-locale.md) | **Recherche web locale, Brave retiré, Beatport de côté** : `BRAVE_API_KEY` (payant, jamais configuré) faisait un provider **mort** et `collect_beatport.py` un provider **jamais lancé** (token recopié à la main, friction refusée deux fois) — deux sources annoncées mais inexistantes. Le moteur web passe au **DuckDuckGo local** (MCP `search`, `http://localhost:8010/mcp`, `data/search_mcp.json` ou `SEARCH_MCP_URL` pour le changer) avec repli HTML `html.duckduckgo.com` ; `/years/web-status` **sonde** (1 s, sans clé) et la vue Années peut dire « recherche web indisponible » ; Beatport supprimé du pipeline et des caches | 🟢 **Livré (2026-09-22)** — mesuré : provider `html` (MCP non démarré), résultats Discogs/Wikipedia pertinents, aucune clé requise ; `collect_beatport.py` + ses 10 tests **supprimés**, plus aucune référence Beatport dans le code | Moyenne | spec `2026-09-22-recherche-web-locale-design.md` · EPIC-040 · EPIC-033 (passe mise en pause) |
| [EPIC-050](EPIC-050-ecriture-visible-et-double-slash.md) | **L'écriture se voit, et sur la forme réelle des chemins** : trois défauts derrière « ça ne met pas à jour » — (1) `/styles/apply` et `/years/apply` **ne patchaient pas l'index** (contrairement à `/copy` et `/styles/align`) : disque `house`, cache `techno_hard`, donc cellule périmée au rechargement et `/styles/audit` comptant encore un cas corrigé ; (2) la config réelle (`…/style/`) produit un **double slash** dans les chemins, et `sourceStyleOf` rendait `null` → **aucune cellule Style** et aucun alignement ; (3) `g` sur un rangé ouvrait la palette **sans rien écrire**. L'index est patché par la route qui écrit (conditionné au succès relu, `cache_updated`), les slashes sont pliés à la comparaison, et `g` sur un rangé écrit le style **déclaré par son dossier** | 🟢 **Livré (2026-09-22)** — 6 pytest + 6 vitest ; navigateur (config à slash final) : `g` → `✓ techno_hard`, `cache_updated: true`, `/load` d'accord avec le disque, année **1990 intacte** ; gate **1 201 vitest / 367 pytest**, lint 0, typecheck 0 | Haute | spec `2026-09-22-ecriture-visible-et-double-slash-design.md` · EPIC-041 · EPIC-043 · EPIC-046 |

## État actuel du projet (2026-09-22)

- **Session 2026-09-22 — EPIC-046 à EPIC-050 livrées** (5 EPIC d'un seul
  signalement : « ça ne met pas à jour, la modale est trop petite, la liste des
  styles est incomplète, `<kbd>r</kbd>` ne sert à rien, le remix date de 1990,
  Brave n'est pas gratuit, Beatport déconne »). Ce que la mesure a établi, dans
  l'ordre où ça s'est découvert :
  - **le tag était bien écrit** — la copie F5 écrivait `techno_hard` sur l'épars
    **et** la copie (journal `copy-f5` ×2, année intacte, relu par mutagen) ; ce
    qui manquait était la **surface** (EPIC-046 : colonne Style absente côté
    Source Data) ;
  - **et la surface elle-même était cassée chez toi** : la config réelle
    (`source_data = …/style/`) produit un chemin à **double slash** et
    `sourceStyleOf` rendait `null` → cellule vide, `g` sans effet (EPIC-050) ;
  - **l'index ne suivait pas le disque** : après `/styles/apply` le disque disait
    `house` et le cache `techno_hard`, donc la cellule revenait en arrière au
    rechargement et `/styles/audit` comptait encore un cas corrigé (EPIC-050) ;
  - **`g` sur un rangé n'écrivait rien** (il ouvrait la palette) — il écrit
    maintenant le style **déclaré par le dossier**, une frappe (EPIC-050) ;
  - la palette ne montrait que les styles **ayant des fichiers** : 86 des 92
    dossiers du disque, et un dossier vide faisait refuser son style (`400`) —
    elle lit maintenant le disque, s'adapte à l'écran (44 % à 2 560 px au lieu
    de 560 px fixes) et ne porte plus de `<kbd>` dans un bouton cliquable
    (EPIC-047) ;
  - le remix : `age of love - the age of love (cosmic gate mix)` concluait
    **1990** ; la version de remix était **effacée** avant la recherche —
    désormais le crédit est lu, la source doit **nommer le remixeur**, et la
    piste web (cherchée avec lui) propose **2004**, jamais l'année de l'original
    (EPIC-048) ;
  - Brave (payant, jamais configuré) et Beatport (jamais lancé) étaient deux
    sources **annoncées mais inexistantes** : le moteur web est local
    (DuckDuckGo, MCP `search` sur `localhost:8010`), avec sonde et repli HTML,
    et Beatport est sorti du pipeline (EPIC-049).
  Aucune écriture n'a été faite sur la bibliothèque réelle : les 1 281 genres,
  les 38 années contredites et les tags à reprendre attendent des clics.
- **Session 2026-09-22 — EPIC-045 livrée** : EPIC-040 avait demandé trois choses —
  la re-collecte, l'audit des 408, et **l'exposition des items en revue**. L'audit
  est fait (408 entrées : 23 confirmées, **38 contredites** avec proposition,
  8 à revoir, 339 non vérifiées) mais il vivait dans un JSON que personne
  n'ouvre — et la vue Années ne montre que les fichiers **sans** année, donc rien
  ne pouvait jamais contredire un « 2024 » écrit sur un morceau de 1991. La
  section **⟲** de la vue Années comble ce trou : elle affiche `écrit 2024 →
  1991` avec les années de chaque source (`musicbrainz 1995 · deezer 2004`) et la
  fiche de sortie, puis **Corriger** (écriture immédiate, journal partagé
  `audit:revue`, `--undo` restaure l'année d'avant), une **autre candidate**, ou
  **Garder** (rien n'est touché, le cas quitte la file — décision persistée).
  Deux pièges trouvés en chemin : les décisions se comptaient sous `garde` alors
  que le POST écrit `garder` (l'item gardé restait proposé — corrigé à la racine,
  vocabulaire unique), et `evidence` est une liste d'**objets** de sortie (le
  premier rendu réel affichait `[object Object]`). Preuve : bac à sable distinct
  (config/audit/journal redirigés) → clic réel dans le navigateur, tag relu sur
  disque, boucle `--undo` exécutée ; la bibliothèque réelle n'a **pas** été
  touchée (elle attend un clic).
- **Session 2026-09-22 — EPIC-044 livrée** : EPIC-043 avait rendu F5 **complète**
  (elle range **et** tague), mais elle ne corrigeait que le futur. Mesuré sur la
  collection : **1 023** des 1 604 fichiers rangés portent un genre qui contredit
  leur dossier et **258** n'en ont aucun — la cellule *Style* (chip « écrit ✓ »),
  le filtre et l'indice de suggestion travaillaient donc sur une valeur qui
  contredit le rangement dans deux fichiers rangés sur trois. Désormais `A`
  (page Sync) fait l'aperçu (`GET /styles/audit`, borné : compteurs, 12 styles,
  20 exemples) puis l'écriture confirmée (`POST /styles/align`) — **deux modes
  visibles** : *corriger + remplir* ou *remplir seulement les vides*. Le serveur
  recalcule tout (aucun style, aucun chemin ne vient du client), **le disque
  tranche** fichier par fichier (cache périmé ⇒ `non_vide`, jamais d'écrasement),
  l'année n'est pas touchée, et le journal est celui des scripts : `--undo`
  restaure — vérifié par un test qui appelle vraiment `apply_styles.py --undo`.
  Aperçu réel : 323 / 1 023 / 258, dry-run 1 281 écritures en 0,46 s sans toucher
  un tag.
- **Session 2026-09-22 — EPIC-043 livrée** : F5 copiait le fichier **sans toucher aux
  tags**, donc le rangement par style (EPIC-035) avait deux moitiés qui ne se
  rejoignaient jamais — un fichier rangé dans `techno_acid_1990` pouvait garder
  `genre = Blues`, et le scan suivant relisait le genre fautif (cellule *Style* sans
  chip « écrit ✓ », filtre genre et signal `styleSuggest` sur une valeur qui contredit
  le rangement). Or le nom du dossier cible **est** la déclaration de style. Désormais
  `POST /copy` dérive le style du **premier segment** du chemin relatif à la racine
  Source Data (même grammaire que `parseFolderName`, table de noms testée des deux
  côtés) et l'écrit sur **les deux fichiers** de la paire : l'épars d'origine et la
  copie. L'année n'est jamais écrite ; un dossier hors grammaire (`_trash`, `2008_08`,
  capitalisé) n'écrit rien ; l'écriture est **idempotente** (`old == style` → ni
  écriture ni journal, les copies sont fréquentes) et **jamais bloquante** (échec
  rapporté dans `style_writes[].error`, la copie reste `ok`). Le journal est celui des
  scripts (`data/style_apply_journal.jsonl`, `source: "copy-f5"`) : `apply_styles.py
  --undo` annule aussi une copie. Côté client, le `genre` est patché sur l'épars **et**
  sur l'entrée source, la cellule *Style* est rafraîchie, le statut annonce l'écriture
  (`· style « techno » écrit (epars + copie)` / *déjà à jour* / *non écrit : raison*) et
  la modale F5 prévient **avant** (une phrase, pas de case à cocher). Périmètre : la
  route `/copy`, donc F5 simple, F5 batch, aperçu `e` (le toast porte la note) et
  remplacement — `/move` (trash) hors périmètre.
- **Session 2026-09-22 — EPIC-042 livrée** : la modale « ❓ Raccourcis & Légende » était
  illisible. Mesuré **avant** correction sur l'état d'alors (`25ce79c`, worktree détaché, le
  working tree jamais muté) : **3/10** au harnais — `#legend-grid` était une grille de 4 pistes
  de **262 px** dont les cellules étaient **étirées** à la hauteur de la plus haute (2 385 px de
  vide interne, hauteur de ligne 19 → 141 px), **56 libellés sur 89** renvoyés à la ligne, et
  chaque ligne était sa propre grille `max-content 1fr` → **7 abscisses** dans une section.
  Corrigé : 4 colonnes flex **jamais étirées** (affectation écrite pour équilibrer : ratio
  1,65 → **1,32**), sections en 2 pistes + **`subgrid`** (une seule abscisse par section),
  **familles de touches** (`legendFamily`/`legendFamilyTitle` : 31 bindings → 12 lignes, les 8
  lignes « Échap fermer X » n'en font plus qu'une, touches dédoublonnées), libellés raccourcis
  (**89 → 71 lignes**), un marqueur par ligne, pied de modale 3 → 1 note (zéro information
  perdue : les autres notes décrivent des bindings désormais présents dans les sections).
  Preuve : `scripts/measure_legend.py` **10/10** (modale ouverte par la touche **réelle** `?`,
  `0` libellé coupé, **668 = 668** px donc aucun défilement, libellé 12,02:1 / touche 16,22:1
  — contrastes **inchangés**, aucune amélioration revendiquée) + **preuve par mutation
  exécutée** (`subgrid` retiré → A seul en échec ; famille réduite à 1 membre → 2 tests en
  échec) ; le harnais lui-même a été corrigé — il lisait la couleur de la **ligne** au lieu du
  libellé et annonçait donc 17,88:1 au lieu de 12,02:1. Gate : **1 144 vitest / 335 pytest**,
  typecheck 0, lint 0, build OK. Reste : mesure fine des replis responsive (< 1 400 px).

  **Régression corrigée le même jour** — retour d'usage immédiat : « il y a régression, où sont
  les légendes des états (pastilles, sélection…) ? ». Vérifié dans l'app qui tournait :
  « États → **0 ligne** », « Cue editor → 0 ligne ». Cause : le process Flask servait le
  **template d'avant le commit** (Jinja compile au chargement, `debug` éteint) pendant que le
  navigateur prenait le **nouveau bundle** ; le rendu détachait les sections statiques **par
  `data-legend-section`** — attribut absent de l'ancien HTML — puis `replaceChildren` les
  **effaçait en silence**. Le harnais ne pouvait pas le voir (il copie le template du workspace :
  bundle et template y sont toujours de la même version, et ses 10 vérifications testaient la
  **forme**, plus un total de lignes). Corrigé sur trois fronts : **contrat non destructif**
  (statique reconnue par attribut, sinon **adoptée par son titre**, sinon **conservée** en queue de
  grille + `console.warn`), **vérification H** du harnais (« aucune section vide : une légende
  muette = une légende fausse »), et **test de contrat** écrit d'abord (rouge sur le code fautif).
  Reproduction mesurée du skew : ancien template × bundle fautif = **3/11** (H ❌, sections vides),
  ancien template × bundle corrigé = **6/11** (sections revenues par adoption ; leur ancienne mise
  en forme reste), template + bundle courants = **11/11**. Dans l'app : la légende des états est
  **revenue sans redémarrer le serveur** (« États — page Sync → 12 lignes ») ; la mise en forme
  neuve des statiques demande le redémarrage (le template est compilé au chargement — piège
  d'exploitation consigné dans l'EPIC).

  **Deuxième régression, même journée** : « la mise en page est cassée !!! c'est moche, l'UI n'est
  pas pratique ». Reproduite au harnais dès qu'on le lance à une autre largeur : à 1 366 px, la
  boîte modale (1 284 px) ne contenait que **3 des 4 colonnes figées** — la 4ᵉ était jetée en
  dessous, **pleine largeur (1 233 px)**, soit 1 182 px de contenu dans 786, ratio de colonnes
  2,32 et 29 libellés sur 2 lignes (15 à 1 440 px). La **table de colonnes écrite à la main**
  était juste à 1 600 px et fausse ailleurs ; le harnais ne mesurait qu'une largeur — **même angle
  mort que le template**. Corrigé en **supprimant la table** : flux multi-colonnes
  (`columns: 320px`), sections entières (`break-inside: avoid`), 4 colonnes au-dessus de 1 500 px
  (mêmes hauteurs qu'avant, 425/500/425/563) et **2 colonnes équilibrées** en dessous (ratio 1,07,
  237 px de défilement — plutôt qu'un 3ᵉ niveau mesuré puis écarté : ratio 1,92, colonne trouée).
  Nouvelle vérification **I** du harnais (« colonnes de largeur homogène — aucune colonne
  orpheline », agnostique de la technique) et contrat **F** scoped : « la modale tient sans
  défilement » n'est exigé qu'à partir de 1 600 px de large, et le harnais **affiche** le
  défilement au lieu de le taire. Résultat : **12/12 à 1920, 1600, 1440, 1366, 1100, 900 et
  700 px**, 0 libellé coupé partout. Gate final : **1 145 vitest / 335 pytest**, lint 0, build OK,
  `audit:css` aucune classe morte.

  **Troisième retour, même journée** (écran 2 560 px) : « tout flotte, rien n'est calé, c'est à
  refaire totalement cette mise en page ! ta preview ne reflète pas la réalité ». Les deux
  reproches sont fondés : la piste des touches était en `max-content` **par section** — sept
  abscisses de libellé différentes sur la feuille (mesuré en direct : 630, 653, 990, 1043…) — et
  la modale plafonnait à 1 460 px, avec une colonne unique de **1 332 px** occupée par la section
  « Cue editor » de l'ancien markup. Corrigé : piste des touches à **largeur fixe** (token
  `--legend-key: 110px`, `subgrid` supprimé : moins de CSS pour plus d'alignement), modale
  `min(1800px, 95vw)`, et palier 3 colonnes **écarté après mesure** (inéquilibrable avec ces sept
  sections : 410 px contre 770 px, ratio 1,88) → 4 colonnes de 416 px ≥ 1 850 px sinon 2 sinon 1.
  Nouvelle vérification **J** (« aucun marqueur plus large que la piste des touches » : c'est elle
  qui rend la largeur fixe sûre) et vérification **A** passée au niveau de la **colonne**.
  Mesuré **13/13 à 3440, 2560, 1920, 1600, 1366, 1000 et 700 px** : abscisses `[523, 969, 1415,
  1861]`, 0 libellé coupé, 0 espace mort, aucun défilement à 1 400 px de haut. Gate rejoué :
  **1 145 vitest / 335 pytest**, lint 0, build OK.

- **Session 2026-09-22 — EPIC-041 livrée** : retour d'usage « la touche `g` sur un morceau ne
  fonctionne pas correctement ; choisir un style doit mettre à jour de suite le style ID3, et
  pareillement l'année ; dans la modale il faut tout voir, styles et années ». Trois couches
  fautives, mesurées headless avant correction : (1) le **binding** exigeait
  `activePanel: 'epars'` → un clic dans la colonne droite rendait `g` inerte (aucune palette,
  aucun message) et un morceau de Source Data n'était pas taggable ; (2) la modale ne
  proposait que **9 paliers** au lieu des années ; (3) la palette **n'écrivait aucun tag** — le
  TCON n'arrivait qu'après aperçu `e` + `apply_styles.py --review` hors navigateur, l'année
  jamais. Corrigé : `POST /styles/apply` + `/years/apply` (validation → confinement aux
  racines configurées → journal `old` → écriture du frame natif → **relecture**), journal
  **partagé** avec les scripts (`source: "palette"` ⇒ `--undo` les annule) ; `g` **scope-aware**
  (fichier > dossier, panneau actif en arbitre, sélection Espace épars-only) avec messages
  honnêtes ; cibles Source Data taguées **sans** créer de choix de rangement ; 57 années
  toujours entières + grille de styles défilante. Preuve : `scripts/proof_style_palette.py`
  **9/9** (monde normal) / **10/10** (`PROOF_EXTRA_STYLES=40`), tags relus **sur disque** par
  mutagen, + preuve par mutation (garde `activePanel` réintroduite ⇒ 4/9 en échec). Gate :
  **1 142 vitest / 335 pytest**, typecheck 0, lint 0, build OK. Reste : premier usage réel
  (frames de production, ressenti du scope).

- **Session 2026-09-21 — EPIC-040 : années corroborées** : signalement « Inner Light /
  Phantasia, j'ai du 2024 alors que c'est du 1991 ». Fait vérifié (MnemoLite cache miss →
  web → mémoire `a4494da3` `CONFIRME` : R&S, **avril 1991**) puis cause trouvée **par
  mesure** : la clé était construite en devinant « Artiste - Titre » (`'inner light
  \tphantasia'`), Deezer n'avait **aucune garde artiste/titre** (seule la durée filtrait,
  et pas du tout sans durée connue) et renvoie la `release_date` de l'**album matché** —
  « Ooo », 2024-01-15, pour un morceau de 1991. 408 écritures Deezer, **173 ≥ 2015 (42,4 %)**
  vs 12 % pour MusicBrainz. Corrigé : orientations multiples (tags du fichier → nom → nom
  inversé, la garde tokens tranche), garde artiste+titre sur Deezer, **Discogs** en 3ᵉ
  provider, **règle des 2 providers indépendants concordants** (un seul parle → revue, rien
  n'est écrit ; `reform`/`reform2` comptés comme Discogs), cache versionné `v:2` (le v1 est
  ignoré → re-collecte), `--undo` qui **restaure** les corrections. Nouvel outil
  `scripts/audit_applied_years.py` (classe `confirme`/`contredit`/`a_revoir`/`non_verifie`,
  dry-run par défaut, `--apply --yes`). **Cas signalé corrigé sur le disque** (2024 → 1991,
  les 2 fichiers), 326 pytest dont 11 nouveaux verrouillages validés par mutation. **Reste** :
  re-collecte complète, exposition des items en revue dans la vue Années, audit des 408.
- **Session 2026-09-21 — EPIC-039 livrée** : retour d'usage « le focus est un cadre bleu
  entouré d'un liseret, ça doit se voir d'un coup d'œil ». Diagnostic mesuré (et non
  supposé) : la grammaire d'origine empilait deux traits translucides — `outline: 1px
  solid var(--border-focus)` (rgba 35 % d'alpha → **1,17:1**) sur la cellule du nom **plus**
  un `outline` de dossier de même couleur, le tout sur un fond `--bg-focus` partagé avec
  le survol et la sélection. Corrigé par une grammaire unique (boîte d'accent 2 px + barre
  4 px + teinte cyan 14 %) appliquée aux lignes, aux dossiers, aux pistes de playlist et
  aux cartes Années/Doublons, et panneau actif porté à **11,45:1** (bordure d'accent +
  anneau `inset`). Preuve : `scripts/measure_focus_visibility.py` **8/8** (contraste rendu
  mesuré via canvas, avant/après dans le même rendu + contrôle de sensibilité). Zéro
  fichier TypeScript modifié : les classes étaient déjà posées, seule la peinture change.
  ⚠ le CSS est bundlé (`static/dist/script.css`) : `npm run build` est obligatoire avant
  toute mesure navigateur.
- Tests (2026-09-21) : **1 137 vitest** (50 fichiers) / **326 pytest** (test_collect_years 11,
  test_app 160,
  test_collect_youtube_topic 31, test_nml 29, test_analysis 15, test_apply_years 15,
  test_apply_styles 14, test_collect_discogs_reform 12, test_collect_discogs_reform2 11,
  test_collect_beatport 10, test_collect_itunes 10, test_report_years 10) — tous verts.
- **Session 2026-09-21 — EPIC-037/038 ouvertes (⚪ backlog)** : retour d'usage réel de
  5 frictions du filtre/listes, instruites par lecture de code **et** mesure sur la
  collection (`data/cache.json`, lecture seule — épars 5 092 fichiers / 3 631 avec année,
  source 1 604) : `2020` sur l'épars gardait **493 lignes dont 333 d'une autre année**
  (1993 ×14, 1997 ×9…) parce que le terme matchait le **sous-dossier daté**
  (`2020_02_25/…`) ; chip non collé (aucune règle sticky sync) ; clic dans le champ →
  `scrollIntoView` via le handler de panneau ; `↓` codé en dur vers la colonne droite ;
  et course du player (`currentAudio` assigné au `.then` → deux `<audio>` audibles).
  Design détaillé, chiffres cibles et tests dans les specs liées. **EPIC-037 P2+P3 livrés**
  (chip collé `sync.css`, clic dans le champ sans scroll `script.ts` + `commands/filter.ts`,
  test vitest validé par mutation, preuve headless 4/4 `scripts/proof_filter_chip.py`),
  **P1 moteur + épars** (`filterEngine.ts` : `2020` → 189 gardées contre 493, `1993` → 127,
  `_schranz` → 79 == mesure EPIC-035) et **EPIC-038 livrée** (`audio.ts` singleton strict :
  `playSeq`, `releaseAudio`, assignation synchrone — 4 tests de course, preuve par mutation).
  **P4** (`↓` entre dans la liste de SA colonne, `Tab` symétrique, `currentFilterScope`
  déplacé dans filterChip.ts) — **EPIC-037 complète**. **P1 bis (filtre par année de la
  colonne Source Data) écarté** par décision (2026-09-21) : le filtre de droite reste par
  nom de dossier — limite mesurée et assumée (`1993` → 0 dossier à droite alors que
  59 fichiers source y sont taggés 1993).
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
- **EPIC-036 Phase 3 livrée** (2026-09-19, `b60d8dc`) : `style.css` (1 500 lignes) →
  `static/styles/` en couches (tokens · base · components · pages ×7) importées par
  `script.ts`, bundlées esbuild → `dist/script.css` ; équivalence de cascade prouvée
  (`check_css_equiv.py` : multiset + ordre des 410 règles, 3 collapses documentés) ;
  preuve rendu 7 captures avant/après **0 pixel** (harnais `capture_ui.py` :
  animations gelées + chemin de monde fixe, 2 causes de non-déterminisme éliminées) ;
  `audit-css.mjs` corrigé (PurgeCSS multi-fichiers) — 0 classe morte. Gate : 1 120
  vitest ×3 graines / 317 pytest.
- **EPIC-036 Phases 0+1+2 livrées** (2026-09-19, `e623dd0` + `a5e2e08` + `30f9400`)
  : Phase 0 — hygiène (2 flaky corrigés, shuffle 3 graines fixes en CI, audit
  listeners : zéro fuite, PurgeCSS : ancienne table doublons supprimée). Phase 1 —
  noyau `core/` (format / feedback / subscribe / dom) : 0 site `toLocaleString('fr')`
  et 0 accès direct `#status-text` hors core, 6 gardes hidden centralisés,
  save/restore scroll en un point, doublon local yearsUI éliminé, cueEditor exclu
  (setStatus slot-scopé). Phase 2 — double passe de filtre fusionnée (1 appel
  `matchesTokens`/fichier sur 5 092), squelette d'arbre partagé
  (`buildSourceTrees` + `finishSourcePanel`), 6ᵉ wipe sur `beginRender`,
  `appendPanelEmpty` ×5, domPatches conservé (verdict documenté), **wc -l net −34**.
  Gate P2 : 1 120 vitest / 317 pytest. Doc dev : `static/src/README.md` +
  `AGENT.md` %ARCHITECTURE.core.
- **EPIC-036 Phase 4 livrée** (2026-09-19, `d6c2e08`) : perf mesurée Chrome headless
  (harnais `scripts/perf_ui.py`, 5 092 épars, durées réalistes) — rendu initial
  1 363 ms, filtre 52-64 ms, re-render post-copie 102 ms ; `content-visibility`
  **rejetée** (inapplicable aux `<tr>`, profil dominé par la construction DOM),
  `styleSuggest` fermé (≤ 0,2 %) ; seul correctif : `normalizeName` mémoïsé
  (rendu −14 %, copie −48 %, iso-comportement prouvé). Rapport :
  `docs/refactoring/phase4/rapport-perf.md`.
- Prochains chantiers : **EPIC-035 P4** (confort : reprise `style_review.json`, onglet
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
