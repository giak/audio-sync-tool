# DSL COMPRESSION: Audio Sync Tool — AGENT.md

## GLOSSAIRE

```
@  → projet/contexte
#  → règle impérative (était ◉ dans source)
!  → contrainte (était ◆ dans source)
$  → scope/périmètre (était ⟐ dans source)
%  → section (était △ dans source)
&  → donnée métrique/quantifiable
~  → workflow/process
```

## GRAPHE DE DÉPENDANCES

```
@AudioSyncTool
  ├── identity: "Audio Sync Tool — synchronisation fichiers audio"
  ├── stack: Python3.12 + Flask3.x + VanillaJS + Vitest + pytest + mutagen
  ├── port: 8765
  ├── storage: JSON in data/ (config, journal, cache, playlists, beatgrids, extra_dirs)
  ├── pages: sync | playlist | dups | years (routeur goPage)
  ├── trash: <source>/_trash/<date>/ — déplacer, JAMAIS effacer (EPIC-028)
  └── user: Christophe/Giak (music collection)

%DATA-SAFETY [priorité: ABSOLUE]
  #1: NE JAMAIS rm/rm -f/rm -rf sur chemins utilisateur
  #2: NE JAMAIS écraser data/ sans confirmation
  #3: NE JAMAIS modifier config/journal/cache/playlists sans demande
  #4: NE JAMAIS supprimer cache (auto-régénéré)
  #5: Demander avant opération destructive
  $data_files: data/config.json, data/journal.json, data/cache.json, data/playlists.json, data/beatgrids.json, data/extra_dirs.json
  $allowed_auto: Lire data/, créer /tmp/, modifier code, ajouter tests
  $needs_confirm: Supprimer/écraser data/, modifier config, supprimer audio, rm/rmdir/delete, modifier .gitignore

%RIGUEUR
  #1: Lire avant d'écrire
  #2: Ne pas casser les tests (vitest + pytest)
  #3: Chirurgie stricte — pas de refacto gratuit
  #4: Empathie — stress/frustration → écouter, pas justifier
  !Si stress utilisateur → priorité réparation

%HONESTY
  %HONESTY.1: Zéro flagornerie — vérité > politesse
    ! contradiction obligatoire si fait erroné
  %HONESTY.2: Anti-hallucination
    #Aveu d'ignorance si incertain
    #Chaîne de pensée (CoT) pour problèmes complexes
  %HONESTY.3: Directness
    #Style direct — pas d'intro/conclusion inutiles
    #Standalone results — prêts à publier
    #Précision médico-légale

%STACK
  $backend: Python 3.12 + Flask 3.x
  $frontend: HTML/CSS/JS vanilla (ES modules)
  $test_js: Vitest + jsdom
  $test_py: pytest
  $audio: mutagen (ID3/FLAC)
  $storage: JSON (data/)
  !Zéro dépendance npm frontend — npm only for devDeps

%STRUCTURE [arbre: 22 entrées racine (hors venv/node_modules/cache), 20 lignes documentées ici]
  app.py ← Flask (8765)
  test_app.py ← pytest (146 tests)
  test_nml.py ← pytest (29 tests)
  test_analysis.py ← pytest (15 tests)
  templates/index.html ← pages Sync/Playlist/Doublons/Années + modales
  static/ ← 45 modules ES (src/ + render/ + commands/) + 39 *.test.ts (927 tests)
    script.js ← orchestrateur (nav handlers, toolbar)
    router.js ← goPage('sync'|'playlist'|'dups'|'years') — source de vérité nav
    state.js ← état global mutable (EventEmitter, Proxy)
    api.js ← fetch wrapper (retry réseau)
    audio.js ← togglePlay, seek, stop
    focus.js ← navigation spatiale ↑↓←→Tab + twin-hint jumeau
    ui.js ← modales, toasts
    render.js ← assembler (re-export render/)
    actions.js ← config, scan, copy, move, replace, mkdir, groupes
    filterEngine.js ← matcher tokens filtrage (casse/accents, nom+année+codec)
    dupDetect.js ← matching doublons (durée ±2 s + nom fuzzy ≥ 0,88)
    dupGroups.js ← groupes de versions (union-find 2 passes : enregistrements + morceaux via musicKey) + arbitrage qualité (cohorte du gagnant uniquement)
    musicKey.js ← clé musicale (artiste, titre) depuis nom de fichier : parsing segments/pistes/parenthèses + tokens faibles
    playlist.js ← CRUD + drag-drop
    utils.js ← formatTime, formatDuration, computeStatus
  data/ ← NE PAS TOUCHER
  docs/superpowers/ ← specs + plans + rapports
  docs/superpowers/epics/ ← REGISTRE des évolutions (README index + 1 fichier par EPIC)
    #règle: toute évolution/amélioration → nouvelle EPIC + entrée à l'index
    #règle: EPIC livrée → statut 🟢 + commits + tests dans le fichier
  AGENT.md ← ce fichier

%ARCHITECTURE
  $routes: /config, /scan, /load, /copy, /move, /delete, /mkdir, /journal, /audio, /playlists
  $storage_logic: load_json()/save_json() ← data/
  $metadata: mutagen ← année, durée, codec
  $export: os.link ← fallback shutil.copy2 (EXDEV)
  $journal: append-only, horodaté (statuses: copied, moved, moved-to-trash, deleted, scan)

  %ARCHITECTURE.core (EPIC-036 P1 — helpers partagés, doc de contrat : static/src/README.md)
    $core/format.ts: fmtCount(n) (fr-FR — Node ICU = espace fine U+202F), plural(n, word, pl?) (pluriel si n > 1, 0 = singulier : comportement historique), byCountThenId(a, b) (tri volume desc puis id alpha) — pures, zéro dépendance ; JAMAIS de x.toLocaleString('fr') ni de pluriel fait main hors core/
    $core/feedback.ts: setStatus(msg) — barre #status-text, no-op sûr si absente ; sémantique : status = guidage, toast = confirmation d'action, dialog = décision (ne pas croiser les canaux)
    $core/subscribe.ts: subscribeVisible(event, containerId, render) — abonnement :changed + garde hidden en un point ; désabonnement renvoyé (contrat on())
    $core/dom.ts: beginRender(container) → restore(el) — wipe + save/restore scrollTop (rAF), restore no-op si nœud détaché ; variante directe acceptée (renderPlaylistTracks)
    !règle d'extraction: un module core/ n'est créé que s'il remplace ≥ 2 implémentations existantes écrites, tests verts avant ET après (YAGNI — pas d'abstraction anticipée) ; tout nouveau module passe par une EPIC

  %ARCHITECTURE.css (EPIC-036 P3 — CSS en couches, static/styles/)
    $couches: tokens.css (variables :root) · base.css (reset/focus/scrollbar) · components.css (familles transversales : modal, dialog, toast, filter-chip, panel-empty…) · pages/ (sync, sync-main, dups, years, playlist, overlays, cue-editor)
    $ordre: pages/index.css agrège les @import dans l'ordre de cascade de l'ancien style.css — NE PAS réordonner ; script.ts importe index.css, esbuild bundle → dist/script.css (cache-buster app.py couvre JS+CSS)
    !règles: nouvelle règle CSS = fichier de sa page ; transversale = components.css ; nouvelle variable = tokens.css uniquement (jamais 2 déclarations du même token) ; audit mort : npm run audit:css (rapport seul, vérif manuelle obligatoire)

  %ARCHITECTURE.pages
    $router: state.page ('sync'|'playlist'|'dups'|'years') ← router.js goPage()
    #layouts et boutons nav mutuellement exclusifs (source de vérité unique)
    !playlistMode dérivé: playlistMode === (page === 'playlist')

  %ARCHITECTURE.keyboard
    ~normal: Tab↔panels, ↑↓nav, ←→columns, Enter play, Space select, F5 copy, R replace-homonyme, F7// filter-chip, Escape pile: menu→modale→filtre→dossier→audio, ? légende, Shift+F10 menu clavier (EPIC-031)
    ~playlist: Tab↔source/sidebar, ↑↓nav, Space toggle, Enter play, F7 filter, Delete remove, Ctrl+S save, Ctrl+E export, Ctrl+↑↓ reorder
    ~dups: ↑↓ groupes, clic membre = override gagnant, R applique plan (perdants rangés → _trash), Échap → sync
    ~years: ↑↓ cartes à revue (ordre VISIBLE : saute hors-filtre et rejetés), F7 ou / = chip filtre scope 'years' (pattern filterChip EPIC-030 — cartes certaines ET à revue, terme mémorisé), clic = choisir année / rejeter (session locale — l'écriture reste scripts/apply_years.py), e = export choix, Échap → sync (EPIC-033)
    !sticky scroll (Années/Doublons/Playlist, même pattern CSS): le conteneur scrollable garde padding-top: 0 — l'espacement vit DANS le fond peint de l'élément collé (slot filtre ou #dups-head z3, barre z2, cartes/rows z-index:0 sinon elles peignent au-dessus) ; dups = sticky BOTTOM (.dup-card-actions, bouton Appliquer épinglé au bas du conteneur tant que la carte est visible) ; playlist-source = slot chip sticky avec margin négatif couvrant le padding du panneau ; sidebar playlist : actions déjà hors scroll par flex (rien à coller)
    !clavier scopé page via registry (ctx.page) + activeModal:null — modal dialogue bloque tout
    ~style (EPIC-035, page sync): g = palette de style (épars : sélection sinon ligne focusée), e = aperçu du rangement ; commands/style.js importé EN DERNIER dans script.ts (index matrice intacts)
    !palette g = COUCHE DOM focusée (render/stylePalette.ts, tabindex -1, keydown propre : stopPropagation + preventDefault SYSTÉMATIQUE hors Ctrl/Alt/Meta — F5 non annulé = RECHARGEMENT navigateur, constaté en live) — pattern ratingEdit, ZÉRO champ de contexte registry, aucun binding existant modifié
    !menu contextuel ouvert = état registry (ctx.isContextMenuOpen, EPIC-031) — ↓↑Enter Échap isole comme une modale ; surbrillance .ctx-highlight, focus DOM intact
    !matrice clavier (commands/keyboardMatrix.test.ts) : 78 cellules + 5 invariants (mort/shadowé/Échap-pile/labels), IDX dérivés du registry — shuffle-proof
    !légende GÉNÉRÉE depuis les bindings labellisés (label/group, render/legend.ts, bijection legend.test.ts) — éditer les raccourcis dans commands/*.ts, JAMAIS dans index.html
    !F7// focusent le chip de la liste focusée (render/filterChip.js, input.filter-input)
    !filtres mémorisés par scope dans state.filters (sync-epars, sync-source ; P1: playlist-*, dups)
    !arbres source/playlist-source = filtre à DEUX NIVEAUX (tree: true au chip) : le terme ne matche que les NOMS de dossiers par défaut — l'expansion (manuelle OU auto-étendue) rend TOUS les fichiers (consulter un dossier sous filtre = vérifier un doublon, ne jamais masquer) ; toggle 📄 fichiers opt-in (state 'files:<scope>') matche aussi les fichiers (dirHasMatchingFile + table filtrée à la source dans buildSourceChildren) — comportement historique préservé derrière le toggle
    !pastille « déjà rangé » (épars, EPIC-034) : dupMatches (EPIC-028) + jumeau CONSULTABLE sous le filtre sync-source actif (twinUnderFilteredDir — sémantique identique à l'arbre : dossiers, ou nom de fichier en mode 📄) → .dup-ranged + tooltip ⤷ ; rendu dans makeFileEl (discriminateur = selectEparsFileFn) ; renderSource rafraîchit renderEpars + restaure le focus (focusItemByPath) quand le panneau gauche est visible — les pastilles ne doivent jamais être périmées après un changement de filtre
    !auto-expansion mémoire post-copie (EPIC-034) : executeCopy appelle revealSourceDir(destDir) — le dossier destination s'ouvre si replié (toggle standard → l'expansion persiste dans sourceExpanded), JAMAIS de repli, jamais de vol de focus (toggleSourceDir(…, focusFirstChild=false)) ; appelé APRÈS state.sourceFiles = { … } (le re-render event-driven sinon écrase le patch ciblé)

  %ARCHITECTURE.years
    $pipeline: scripts/collect_years.py (MusicBrainz→Deezer, 1 req/s) → collect_discogs.py (60 req/min, token data/discogs_token) → collect_itunes.py (sans clé, ~20 req/min) → collect_discogs_reform.py (Discogs requêtes REFORMULÉES : junk-artiste split au 1ᵉʳ marqueur de face, suffixes junk coupés) → collect_discogs_reform2.py (junk-artiste NUMÉRIQUE : 1ᵉʳ token num/symbole retiré — matrice/série/année-tête/#, '=' → espace obligatoire (403 Discogs sinon), aperçu lecture-seule par défaut, --go) → collect_beatport.py (token copié du portail docs api.beatport.com/v4/docs — création d'app OAuth FERMÉE au public, méthode beets-beatport4 ; app privée optionnelle data/beatport_oauth.json ; durée EXACTE length_ms → beatport_strict) → collect_youtube_topic.py (yt-dlp sans compte, chaîne « - Topic » OBLIGATOIRE, tokens + durée ±15 s, release_date requis ; exécutée 2026-09-18 : 0/84 — chaînes Topic fusionnées 2025-2026 dans les profils artiste ; --verified = tier chaînes vérifiées, année release_date OU ℗/Released on d'art track auto-généré, TOUT en lax — jamais re-requêter une clé conclusive, ré-interroger les none de l'autre mode) → caches data/year_cache.jsonl + discogs_cache.jsonl + itunes_cache.jsonl + discogs_reform_cache.jsonl + discogs_reform2_cache.jsonl + beatport_cache.jsonl + youtube_topic_cache.jsonl (clé 'artiste\ttitre', reprise incrémentale, erreurs re-jetables)
    $apply: scripts/apply_years.py — vague « found » seule ; re-vérification de l'année sur disque AVANT écriture (jamais écraser) ; journal additif data/year_apply_journal.jsonl = backup ; --undo idempotent ; dry-run par défaut
    !frames par format: MP3 TYER(v2.3)/TDRC(v2.4) selon version du tag existant, FLAC DATE, WAV TDRC (chunk ID3), M4A ©day, .wma exclu (non relu par get_audio_meta)
    !caches consommés tels quels — ne JAMAIS re-interroger les clés collectées (3 h 30 MB) ; collecte = incrémentale uniquement
    !consolidation: scripts/report_years.py + GET /years/preview (app.py) — priorité par clé MB/Deezer > Discogs > iTunes > reform > reform2 > beatport > youtube (chaque pool d'appoint ne cible que des 'none' amont → zéro chevauchement) ; caches ABSENTS tolérés (passe jamais lancée) ; lignes 'error' re-jetables ; consensus fenêtre ≤ 2 ans = year_cache UNIQUEMENT
    !YouTube « - Topic » = source HONNÊTE seulement ère digitale ≥ ~2015 (biais réédition sur le vieux vinyle, mémoire ad9e92a8) — jamais automatique sur l'ère vinyle
    !revue humaine (EPIC-033 P2): vue Années → choix session → e/💾 POST /years/review → data/year_review.json → scripts/apply_years.py --review (choix OVERRIDE consolidation, source 'review') ; champ année libre = tranche hors candidates à la carte focusée ; jamais d'écriture depuis l'UI
    !player audio sur les pages à cartes (Années + Doublons, EPIC-034) : boutons ▶/⏹ réutilisant togglePlay (audio.js) + player bar globale + GET /audio — NE PAS dupliquer un player ; bouton = data-path + classe 'playing' re-marquée après CHAQUE re-render via playingPath() (les cartes sont re-rendues à chaque choix) ; clic ▶ ne doit JAMAIS déclencher l'action de la carte (stopPropagation : override gagnant dups / focus years)
    !Discogs « lax » + ambiguës + reform lax/ambigu = revue humaine (vue Années, ~years) — jamais d'application automatique
  %ARCHITECTURE.styles (EPIC-035 P1)
    $taxonomie: styles.ts (PUR) — parseFolderName `^([a-z]+(?:_[a-z]+)*?)(?:_(\d{4}))?$` sur les dossiers de 1ᵉʳ niveau de la racine Source Data + sourceExtraDirs ; 25 styles réels (18 datés + 7 hors temps = aucun dossier daté) ; trancheOf(y) = y - y%5 ; destFor(style, année, trancheForcée) → {dir, exists, needsYear} ; hotkeys dérivées (volume desc : initiales de segment → lettres de l'id → a-z libre)
    !chemin destination = `${root}/${name}` SANS normalisation (même convention que sourceTree data-dirpath, dupDetect sourceFullPath, copyFilesTo startsWith) — racine config à slash final → `…/style//techno_1990` ; normaliser casserait patch d'index, reveal et exclusion des jumeaux (revue 2026-09-19)
    $state: state.styleChoices Map<fullpath épars, {style, tranche|null}> — SESSION, toujours réaffecter une nouvelle Map ; taxonomie recalculée à la demande (mémo sur identité sourceFiles/sourceExtraDirs dans render/styleCell.ts currentTaxonomy)
    $ui: render/styleCell.ts (td.style-cell inséré devant .codec par eparsUI — makeFileEl INTACT, makeFileTable(false, true) = 7 col + .has-style ; refreshStyleCells = UNE passe DOM pour un lot ; updateStyleRecap dans #epars-status-line) · render/stylePalette.ts (chord lettre → chiffre tranche seulement pour les cibles SANS année ; timeless = commit immédiat ; lot = tranche appliquée aux sans-année seuls) · render/stylePreview.ts (buildRangementPlan PUR : groupes par dest.dir triés, exclus noYear/twinInDest/unknownStyle ; confirmDialog multi-ligne → #dialog-msg white-space: pre-line ; applyRangementPlan = copyFilesTo par dossier, séquentiel, retire des choix EXACTEMENT les fullpaths copiés)
    $copie: actions.ts copyFilesTo(destDir, files) → string[] fullpaths copiés — extrait du batch F5 (iso-comportement : patch index + DOM, journal rechargé, sélection vidée, revealSourceDir) ; /copy crée le dossier cible (os.makedirs) → pas de /mkdir
    $filtre: FilterSubject.path OPTIONNEL (chemin relatif épars) — fourni par eparsUI seul ; arbres source/playlist inchangés (twinUnderFilteredDir, dirHasMatchingFile intacts)
    !P1 = ZÉRO backend (pytest 298 intact) ; pas d'écriture ID3 ; tranche non forçable sur un fichier DÉJÀ daté (limite assumée, P4) ; hotkeys non configurables (styles.json = P4)
    !live headless CDP (2026-09-19, /copy mocké) : 79 lignes sous F7 `_schranz` (77 au 1ᵉʳ segment + 2 noms), palette 25 styles, lot 3 → 2 dossiers dont 1 à créer, isolation ArrowDown/Espace/F5 prouvée APRÈS le fix preventDefault ; colonne nom = 40,4 % à 1280 px (seuil du plan atteint)

%SURGERY [12 règles numérotées S1-S12]
  !S1: NE JAMAIS modifier signature fonction
    exceptions: ZÉRO appelant impacté (grep) + demande utilisateur
  !S2: NE JAMAIS modifier code partagé sans filet
    $shared_fns: buildSourceChildren(), toggleSourceDir(), renderDirTree(), makeFileEl()
    ~avant: git diff HEAD
    ~après: vitest run complet
  !S3: NE JAMAIS refactoring pendant bug fix
  !S4: NE JAMAIS >3 fichiers par requête
    contournement: découper en étapes 1-3 fichiers
  !S5: NE JAMAIS feature non demandée
  #S6: AVANT — lister fichiers impactés
  #S7: APRÈS — valider (git diff + scope + vitest run)
  #S8: SI test échoue — analyser cause
  #S9: Demander avant scope extension — TODO(@codebuff)
  #S10: GOLDEN PATH — npx vitest run après changement fonctionnel
  ~S11: Bug fix — 5 étapes (identifier→modifier→vérifier→git diff→test)
  ~S12: Behaviour change — 5 étapes (spec→fichiers→test-first→code→valider)

%WORK-RULES [8 règles]
  #W1: Lire avant modifier
  #W2: Ne pas casser tests
  #W3: Chirurgie — que ce qui est demandé
  #W4: Data safety — △DATA-SAFETY absolues
  #W5: Conventions style existant
  #W6: KISS — pas de sur-engineering
  #W7: Preuve — tests verts, smoke test
  #W8: Qualité frontend — transitions, hover, micro-interactions

%AGENT-FLUX
  AGENT.md → règles + architecture + contexte
  docs/ → specs + plans + décisions
  !distinction: AGENT.md ≠ code ≠ docs
```