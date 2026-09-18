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
    !menu contextuel ouvert = état registry (ctx.isContextMenuOpen, EPIC-031) — ↓↑Enter Échap isole comme une modale ; surbrillance .ctx-highlight, focus DOM intact
    !matrice clavier (commands/keyboardMatrix.test.ts) : 78 cellules + 5 invariants (mort/shadowé/Échap-pile/labels), IDX dérivés du registry — shuffle-proof
    !légende GÉNÉRÉE depuis les bindings labellisés (label/group, render/legend.ts, bijection legend.test.ts) — éditer les raccourcis dans commands/*.ts, JAMAIS dans index.html
    !F7// focusent le chip de la liste focusée (render/filterChip.js, input.filter-input)
    !filtres mémorisés par scope dans state.filters (sync-epars, sync-source ; P1: playlist-*, dups)

  %ARCHITECTURE.years
    $pipeline: scripts/collect_years.py (MusicBrainz→Deezer, 1 req/s) → collect_discogs.py (60 req/min, token data/discogs_token) → collect_itunes.py (sans clé, ~20 req/min) → collect_discogs_reform.py (Discogs requêtes REFORMULÉES : junk-artiste split au 1ᵉʳ marqueur de face, suffixes junk coupés) → collect_discogs_reform2.py (junk-artiste NUMÉRIQUE : 1ᵉʳ token num/symbole retiré — matrice/série/année-tête/#, '=' → espace obligatoire (403 Discogs sinon), aperçu lecture-seule par défaut, --go) → collect_beatport.py (token copié du portail docs api.beatport.com/v4/docs — création d'app OAuth FERMÉE au public, méthode beets-beatport4 ; app privée optionnelle data/beatport_oauth.json ; durée EXACTE length_ms → beatport_strict) → collect_youtube_topic.py (yt-dlp sans compte, chaîne « - Topic » OBLIGATOIRE, tokens + durée ±15 s, release_date requis ; exécutée 2026-09-18 : 0/84 — chaînes Topic fusionnées 2025-2026 dans les profils artiste ; --verified = tier chaînes vérifiées, année release_date OU ℗/Released on d'art track auto-généré, TOUT en lax — jamais re-requêter une clé conclusive, ré-interroger les none de l'autre mode) → caches data/year_cache.jsonl + discogs_cache.jsonl + itunes_cache.jsonl + discogs_reform_cache.jsonl + discogs_reform2_cache.jsonl + beatport_cache.jsonl + youtube_topic_cache.jsonl (clé 'artiste\ttitre', reprise incrémentale, erreurs re-jetables)
    $apply: scripts/apply_years.py — vague « found » seule ; re-vérification de l'année sur disque AVANT écriture (jamais écraser) ; journal additif data/year_apply_journal.jsonl = backup ; --undo idempotent ; dry-run par défaut
    !frames par format: MP3 TYER(v2.3)/TDRC(v2.4) selon version du tag existant, FLAC DATE, WAV TDRC (chunk ID3), M4A ©day, .wma exclu (non relu par get_audio_meta)
    !caches consommés tels quels — ne JAMAIS re-interroger les clés collectées (3 h 30 MB) ; collecte = incrémentale uniquement
    !consolidation: scripts/report_years.py + GET /years/preview (app.py) — priorité par clé MB/Deezer > Discogs > iTunes > reform > reform2 > beatport > youtube (chaque pool d'appoint ne cible que des 'none' amont → zéro chevauchement) ; caches ABSENTS tolérés (passe jamais lancée) ; lignes 'error' re-jetables ; consensus fenêtre ≤ 2 ans = year_cache UNIQUEMENT
    !YouTube « - Topic » = source HONNÊTE seulement ère digitale ≥ ~2015 (biais réédition sur le vieux vinyle, mémoire ad9e92a8) — jamais automatique sur l'ère vinyle
    !revue humaine (EPIC-033 P2): vue Années → choix session → e/💾 POST /years/review → data/year_review.json → scripts/apply_years.py --review (choix OVERRIDE consolidation, source 'review') ; champ année libre = tranche hors candidates à la carte focusée ; jamais d'écriture depuis l'UI
    !Discogs « lax » + ambiguës + reform lax/ambigu = revue humaine (vue Années, ~years) — jamais d'application automatique

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