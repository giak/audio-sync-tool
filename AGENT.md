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
  ├── pages: sync | playlist | dups (routeur goPage)
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
  templates/index.html ← pages Sync/Playlist/Doublons + modales
  static/ ← 42 modules ES (src/ + render/ + commands/) + 34 *.test.ts (811 tests)
    script.js ← orchestrateur (nav handlers, toolbar)
    router.js ← goPage('sync'|'playlist'|'dups') — source de vérité nav
    state.js ← état global mutable (EventEmitter, Proxy)
    api.js ← fetch wrapper (retry réseau)
    audio.js ← togglePlay, seek, stop
    focus.js ← navigation spatiale ↑↓←→Tab + twin-hint jumeau
    ui.js ← modales, toasts
    render.js ← assembler (re-export render/)
    actions.js ← config, scan, copy, move, replace, mkdir, groupes
    filterEngine.js ← matcher tokens filtrage (casse/accents, nom+année+codec)
    dupDetect.js ← matching doublons (durée ±2 s + nom fuzzy ≥ 0,88)
    dupGroups.js ← groupes de versions (union-find) + arbitrage qualité
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
    $router: state.page ('sync'|'playlist'|'dups') ← router.js goPage()
    #layouts et boutons nav mutuellement exclusifs (source de vérité unique)
    !playlistMode dérivé: playlistMode === (page === 'playlist')

  %ARCHITECTURE.keyboard
    ~normal: Tab↔panels, ↑↓nav, ←→columns, Enter play, Space select, F5 copy, R replace-homonyme, F7// filter-chip, Escape exit-chip/close
    ~playlist: Tab↔source/sidebar, ↑↓nav, Space toggle, Enter play, F7 filter, Delete remove, Ctrl+S save, Ctrl+E export, Ctrl+↑↓ reorder
    ~dups: ↑↓ groupes, clic membre = override gagnant, R applique plan (perdants rangés → _trash), Échap → sync
    !clavier scopé page via registry (ctx.page) + activeModal:null — modal dialogue bloque tout
    !F7// focusent le chip de la liste focusée (render/filterChip.js, input.filter-input)
    !filtres mémorisés par scope dans state.filters (sync-epars, sync-source ; P1: playlist-*, dups)

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