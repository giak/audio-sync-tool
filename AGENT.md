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
  ├── storage: JSON in data/ (config, journal, cache, playlists)
  └── user: Christophe/Giak (music collection)

%DATA-SAFETY [priorité: ABSOLUE]
  #1: NE JAMAIS rm/rm -f/rm -rf sur chemins utilisateur
  #2: NE JAMAIS écraser data/ sans confirmation
  #3: NE JAMAIS modifier config/journal/cache/playlists sans demande
  #4: NE JAMAIS supprimer cache (auto-régénéré)
  #5: Demander avant opération destructive
  $data_files: data/config.json, data/journal.json, data/cache.json, data/playlists.json
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
    #Vérifier dates, chiffres, noms propres
    #Sourcer primaire (URLs, fichiers)
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

%STRUCTURE [arbre: 16 entrées racine]
  app.py ← Flask (8765)
  test_app.py ← pytest (49 tests)
  templates/index.html ← 2-panel + Playlist UI
  static/ ← 9 modules ES + *.test.js (151 tests)
    script.js ← routage clavier + toolbar
    state.js ← état global mutable
    api.js ← fetch wrapper
    audio.js ← togglePlay, seek, stop
    focus.js ← navigation spatiale ↑↓←→Tab
    ui.js ← modales, filtre palette
    render.js ← DOM rendering (epars, source, journal, playlist)
    actions.js ← config, scan, copy
    playlist.js ← CRUD + drag-drop
    utils.js ← formatTime, formatDuration, computeStatus
  data/ ← NE PAS TOUCHER
  docs/superpowers/ ← specs + plans + rapports
  docs/superpowers/epics/ ← REGISTRE des évolutions (README index + 1 fichier par EPIC)
    #règle: toute évolution/amélioration → nouvelle EPIC + entrée à l'index
    #règle: EPIC livrée → statut 🟢 + commits + tests dans le fichier
  AGENT.md ← ce fichier

%ARCHITECTURE
  $routes: /config, /scan, /load, /copy, /journal, /audio, /playlists
  $storage_logic: load_json()/save_json() ← data/
  $metadata: mutagen ← année, durée, codec
  $export: os.link ← fallback shutil.copy2 (EXDEV)
  $journal: append-only, horodaté

  %ARCHITECTURE.keyboard
    ~normal: Tab↔panels, ↑↓nav, ←→columns, Enter play, Space select, F5 copy, F7 filter, Escape close
    ~playlist: Tab↔source/sidebar, ↑↓nav, Space toggle, Enter play, F7 filter, Delete remove, Ctrl+S save, Ctrl+E export, Ctrl+↑↓ reorder, Escape exit+save
    !playlist intercepté avant normal — return explicite après chaque touche

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