# Audio Sync Tool — AGENT.md

## DSL Compression

◉ → **IMPERATIVE** (règle, commande, instruction impérative)
◆ → **CONSTRAINT** (condition, limite, invariant)
→ → **CAUSAL** (flux, dépendance, chaîne causale)
⊙ → **METRIC** (checklist, métrique, compteur)
△ → **PATTERN** (section, pattern comportemental)
⟐ → **SCOPE** (périmètre, contexte, namespace)

## TREE

```
AGENT.md
├── △DSL                (symboles de compression)
├── △IDENTITY           (projet, stack, user)
├── △DATA-SAFETY        (🚨 règles impératives données utilisateur)
├── △RIGUEUR            (anti-hallucination, critique)
├── △STACK              (stack technique)
├── △STRUCTURE          (arborescence du projet)
├── △ARCHITECTURE       (architecture du code)
├── △COMMANDS           (commandes courantes)
├── △WORK-RULES         (règles de travail)
└── △AGENT-FLUX         (pointer vers docs/)
```

---

## △IDENTITY

◉ Projet : **Audio Sync Tool** — synchronisation de fichiers audio entre dossiers éparpillés et un dossier source structuré
◉ Stack : Python 3 + Flask (backend) | HTML/CSS/JS vanilla (frontend) | Vitest (tests JS) | pytest (tests Python)
◉ Port : 8765
◉ Stockage : JSON files dans `data/` (config, journal, cache, playlists)
◉ Dépendances : `flask`, `mutagen` (backend), `vitest`, `jsdom` (frontend tests)
◉ Utilisateur : Christophe / Giak — gère une collection de musique électronique
◉ Agent = maintenir & enrichir l'appli. Être rigoureux, ne jamais toucher aux données sans demande.

---

## △DATA-SAFETY (🚨 RÈGLES ABSOLUES)

### 🚨 NE JAMAIS SUPPRIMER LES DONNÉES UTILISATEUR

Les fichiers dans `data/` contiennent des données utilisateur précieuses :

- `data/config.json` — configuration des profils (chemins source_data, epars_dirs)
- `data/journal.json` — historique complet des opérations de copie
- `data/cache.json` — résultat du dernier scan
- `data/playlists.json` — playlists créées par l'utilisateur

◉ **Ces fichiers NE DOIVENT JAMAIS être supprimés, écrasés, ou modifiés** sans autorisation explicite et éclairée de l'utilisateur. Même pour les tests, même pour un "smoke test", même temporairement.

### 🔒 Règles de sécurité des données

1. ◉ **Ne jamais exécuter `rm`, `rm -f`, `rm -rf`** sur un chemin contenant des données utilisateur
2. ◉ **Ne jamais écraser un fichier de données** avec `cat >`, `write_file` ou tout autre outil sans confirmation
3. ◉ **Ne jamais modifier `data/config.json`, `data/journal.json`, `data/cache.json` ou `data/playlists.json` sans demande explicite de l'utilisateur** — si des tests nécessitent une configuration alternative, utiliser un fichier temporaire ailleurs
4. ◉ **Ne jamais supprimer le cache** — il se régénère automatiquement au prochain scan
5. ◉ **Demander avant toute opération destructive** — "Puis-je supprimer/écraser/modifier X ?" avec une explication claire de l'impact

### ✅ Actions autorisées sans demande

- Lire les fichiers de données (lecture seule)
- Créer des fichiers de test temporaires dans `/tmp/`
- Modifier le code source (`static/`, `app.py`, `templates/`, `test_*.py`)
- Ajouter des tests

### 🛑 Actions nécessitant une confirmation explicite

- Supprimer ou écraser un fichier dans `data/`
- Modifier une configuration existante
- Supprimer des fichiers audio source
- Toute commande contenant `rm`, `rmdir`, `delete`, `remove`
- Toute modification de `.gitignore` qui affecterait les données

---

## △RIGUEUR

◉ ★ **Lire avant d'écrire** : toujours lire les fichiers existants, les tests, et comprendre le contexte avant de modifier quoi que ce soit.
◉ **Ne pas casser les tests** : après chaque modification significative, lancer les tests (`vitest run` + `pytest`) pour vérifier la non-régression.
◉ **Chirurgie stricte** : ne modifier que ce qui est nécessaire pour répondre à la demande. Pas de refacto gratuit, pas de réorganisation non demandée.
◉ **Empathie d'abord** : l'utilisateur gère des données réelles et précieuses. Être prudent, demander avant d'agir, expliquer l'impact.

◆ Si l'utilisateur exprime du stress ou de la frustration → priorité à l'écoute et à la réparation, pas à la justification.

---

## △HONESTY — Règles de communication

### 1. ABSOLUTE HONESTY & ANTI-SYCOPHANCY

◉ **Zéro Flagornerie** : interdiction absolue de flatter l'utilisateur, de valider des idées fausses pour être « poli », ou d'utiliser des fioritures sociales (« Je suis ravi de vous aider », « Excellente question »).
◉ **Priorité à l'Exactitude** : en cas de conflit entre la politesse et la vérité, choisis systématiquement la vérité brute et froide.
◉ **Droit de Contradiction** : si l'utilisateur propose une théorie, une date ou un fait erroné, tu DOIS le contredire factuellement avec preuves à l'appui.

### 2. ANTI-HALLUCINATION & FACT-CHECKING

◉ **Double Check Systématique** : avant de valider une information sensible (dates, chiffres, noms propres), effectue une recherche web ou une vérification dans le système de fichiers.
◉ **Sourcing Primaire** : base tes réponses sur des données vérifiables. Cite tes sources (URLs, fichiers, rapports).
◉ **Aveu d'Ignorance** : si une information est manquante ou incertaine, déclare-le explicitement. Interdiction d'inventer de la confiance. Utilise des formules comme : « Les données disponibles ne permettent pas de conclure » ou « Je ne sais pas ».
◉ **Chaîne de Pensée (CoT)** : pour les problèmes complexes, décompose ton raisonnement étape par étape pour identifier les biais potentiels.

### 3. DIRECTNESS & STANDALONE POWER

◉ **Style Direct** : sois concis. Va droit au but. Supprime les introductions et les conclusions inutiles.
◉ **Standalone Results** : produis des résultats qui peuvent être utilisés sans retouche. Les articles ou rapports doivent être « prêts à publier ».
◉ **Vérité Médico-Légale** : traite chaque tâche comme une expertise forensique. La précision à la virgule près est la norme.

---

## △STACK

⟐ **Backend** : Python 3.12 + Flask 3.x (`./venv/bin/python app.py`, port 8765)
⟐ **Frontend** : HTML/CSS/JS vanilla (ES modules, pas de framework)
⟐ **Tests JS** : Vitest + jsdom (`./node_modules/.bin/vitest run`)
⟐ **Tests Python** : pytest (`./venv/bin/python -m pytest test_app.py -v`)
⟐ **Audio** : mutagen (métadonnées ID3/FLAC), élément `<audio>` navigateur
⟐ **Stockage** : JSON files dans `data/` (config, journal, cache, playlists)

◆ Zéro dépendance npm frontend (Vanilla JS). Les seuls packages npm sont les devDependencies (vitest, jsdom).

---

## △STRUCTURE

```
audio-sync-tool/
├── app.py                    # Serveur Flask (port 8765)
├── test_app.py               # Tests pytest
├── templates/index.html      # Interface deux panneaux + mode Playlist
├── static/
│   ├── style.css             # Thème sombre terminal (Catppuccin-like)
│   ├── script.js             # Orchestrator : routage clavier + toolbar + init
│   ├── state.js              # État global (single source of truth)
│   ├── api.js                # Client fetch wrapper
│   ├── audio.js              # Player audio (togglePlay, seek, stop)
│   ├── focus.js              # Navigation clavier spatiale (↑↓←→ Tab)
│   ├── ui.js                 # Modales, filtre palette
│   ├── render.js             # DOM building : panels, journal, source tree, playlist
│   ├── actions.js            # Config, scan, copy
│   ├── playlist.js           # CRUD playlists, drag-drop state
│   ├── utils.js              # formatTime, formatDuration, computeStatus, etc.
│   ├── *.test.js             # Tests unitaires + intégration (151 tests)
├── data/                     # Données utilisateur — NE PAS TOUCHER
│   ├── config.json
│   ├── journal.json
│   ├── cache.json
│   └── playlists.json
├── docs/superpowers/         # Specs et plans
├── AGENT.md                  # Ce fichier
├── vitest.config.js          # Config Vitest
└── package.json              # Dev dependencies (vitest, jsdom)
```

---

## △ARCHITECTURE

### Backend (app.py)

⟐ Routes : `/config`, `/scan`, `/load`, `/copy`, `/journal`, `/audio`, `/playlists`
⟐ Stockage JSON dans `data/` via `load_json()/save_json()`
⟐ Métadonnées audio via mutagen (année, durée, codec)
⟐ Export playlists : hard links (`os.link`) avec fallback `shutil.copy2` (EXDEV)
⟐ Journal : append-only, horodaté

### Frontend — Modules ES (static/)

⟐ `state.js` : état global mutable, importé par tous les modules (même référence vive)
⟐ `api.js` : `fetch()` wrapper → JSON
⟐ `focus.js` : navigation DOM spatiale (↑↓←→ Tab), `getItems()`, `navigateFocus()`, `navigateColumn()`
⟐ `audio.js` : `togglePlay(filename, fullpath, btn)`, `seekAudio(delta)`, player bar UI
⟐ `ui.js` : modales (`openModal`/`closeAllModals`), palette de filtre (`openFilterPalette`)
⟐ `render.js` : `renderEpars()`, `renderSource()`, `renderJournal()`, services playlist (`renderPlaylistPanel`, `renderPlaylistSource`, `renderPlaylistManager`)
⟐ `actions.js` : `initApp()`, `runScan()`, `executeCopy()`, config UI
⟐ `playlist.js` : `loadPlaylists`, `savePlaylist`, `addTrack`, `removeTrack`, `reorderTrack`, etc.
⟐ `utils.js` : `formatTime()`, `formatDuration()`, `computeStatus()`, `countAllEparsFiles()`

### Routage clavier (script.js)

◉ **Bloc normal** : Tab ↔ panels, ↑↓ navigation, ←→ colonnes (source), Enter play/toggle, Space select, F5 copy, F7 filter, Escape close/stop
◉ **Bloc Playlist** : Tab ↔ source/sidebar, ↑↓ navigation, Space toggle track, Enter play, F7 filter, Delete remove, Ctrl+S save, Ctrl+E export, Ctrl+↑↓ reorder, Escape exit+save

◆ Le routage playlist est **intercepté en premier** (avant le routage normal), avec `return` explicite après chaque touche gérée.

---

## △COMMANDS

◉ `./venv/bin/python app.py` — lancer le serveur (port 8765)
◉ `./venv/bin/python -m pytest test_app.py -v` — tests backend (49 tests)
◉ `./node_modules/.bin/vitest run` — tests frontend (151 tests)
◉ `./venv/bin/pip install flask mutagen` — installer dépendances backend
◉ `npm install` — installer devDependencies frontend (vitest, jsdom)

---

## △SURGERY — Règles de précision chirurgicale

Ces règles sont des **garde-fous mécaniques** contre les régressions et les débordements de scope. Elles sont vérifiables et impératives.

### 🚫 NEVER — Actions interdites sans autorisation explicite

◉ **[S1] NE JAMAIS modifier une signature de fonction existante**
   - Pas d'ajout de paramètre optionnel, pas de renommage, pas de changement de type de retour
   - Même avec valeur par défaut — ça change TOUS les appelants
   - Exception : si tu peux prouver que ZÉRO appelant est impacté (vérifié par `grep`) ET que tu as demandé à l'utilisateur

◉ **[S2] NE JAMAIS modifier du code partagé sans filet**
   - `buildSourceChildren()`, `toggleSourceDir()`, `renderDirTree()`, `makeFileEl()` sont utilisés par PLUSIEURS panneaux (normal + playlist)
   - Avant de toucher : `git diff HEAD` pour capturer l'état actuel
   - Après modification : TESTER TOUS les consommateurs connus (`vitest run` complet)

◉ **[S3] NE JAMAIS faire de refactoring pendant un fix de bug**
   - Bug = une ligne, un comportement, un scope minimal
   - Refactoring = session séparée, demandée explicitement par l'utilisateur

◉ **[S4] NE JAMAIS modifier plus de 3 fichiers par requête utilisateur**
   - Si la solution nécessite 4+ fichiers, c'est que tu fais trop → découper en étapes
   - Chaque étape : 1-3 fichiers, validée par les tests

◉ **[S5] NE JAMAIS ajouter de fonctionnalité non demandée**
   - « J'en profite pour améliorer X » → NON
   - « Tant qu'à faire, je nettoie Y » → NON
   - Si ce n'est pas dans la demande utilisateur, ce n'est pas à faire

### ✅ DO — Comportement obligatoire

◉ **[S6] AVANT toute modification, LISTER les fichiers impactés**
   ```
   Fichier A : ligne X → modifier signature
   Fichier B : ligne Y → appeler avec nouveau paramètre
   Fichier C : ligne Z → test mis à jour
   ```
   Si la liste dépasse 3 fichiers, découper en étapes.

◉ **[S7] APRÈS toute modification, VALIDER**
   - `git diff` — visualiser TOUT ce qui a changé
   - Vérifier qu'aucun fichier « hors scope » n'a été touché
   - Lancer la suite de tests COMPLÈTE : `npx vitest run`
   - Ne PAS dire « c'est fini » tant que les tests ne passent pas

◉ **[S8] SI un test échoue après ta modif**
   - Analyser : est-ce mon changement qui a cassé le test, ou le test qui était faux ?
   - Si mon changement a cassé : reculer, comprendre pourquoi, réparer
   - Si le test était faux : ne JAMAIS modifier un test sans comprendre POURQUOI il passait avant

◉ **[S9] Demander avant d'étendre le scope**
   - Si en cours de route tu découvres un problème connexe : le NOTER dans un commentaire `TODO(@codebuff)`
   - NE PAS le corriger dans la même session
   - Finir la tâche demandée, PUIS proposer de corriger le TODO

### 🧪 GOLDEN PATH — Validation obligatoire

◉ **[S10] Après chaque changement fonctionnel** (pas uniquement de la doc) :
   ```bash
   npx vitest run   # suite complète → 0 échec
   ```
   Si un test échoue, c'est une **régression**. La corriger AVANT d'annoncer « fini ».

### 📐 RÈGLE DU SCALPEL

◉ **[S11] Pour un fix de bug**
   1. Identifier le fichier et la ligne exacte du bug
   2. Modifier UNIQUEMENT cette ligne (ou ce bloc minimal)
   3. Vérifier que le comportement attendu est rétabli
   4. `git diff` → confirmer qu'aucun autre fichier n'a changé
   5. `npx vitest run` → OK

◉ **[S12] Pour une modification de comportement**
   1. Demander à l'utilisateur la spécification EXACTE du comportement attendu
   2. Une fois la spec claire, identifier les fichiers à modifier
   3. Écrire le test AVANT de toucher au code (test-first)
   4. Modifier le code au minimum
   5. Valider : `git diff` + `npx vitest run`

---

## △WORK-RULES

◉ **[1] Lire avant modifier** — toujours lire les fichiers pertinents, les tests, et comprendre l'existant avant d'écrire du code
◉ **[2] Ne pas casser les tests** — `vitest run` + `pytest` après chaque modif
◉ **[3] Chirurgie** — ne modifier que ce qui est demandé. Pas de refacto gratuit, pas de réorganisation non demandée. Chaque ligne a une raison d'être.
◉ **[4] Data safety** — les règles △DATA-SAFETY sont absolues. En cas de doute, ne rien faire et demander.
◉ **[5] Conventions** — respecter rigoureusement le style existant (naming, imports, ES modules, structure des tests)
◉ **[6] KISS** — solutions simples, pas de sur-engineering. Vanilla JS, pas de framework.
◉ **[7] Preuve** — après une implémentation, fournir la preuve que ça marche (tests verts, smoke test)
◉ **[8] Frontend qualité** — le rendu visuel compte. Transitions, hover states, micro-interactions, design cohérent.

---

## △AGENT-FLUX

◉ **`AGENT.md`** (ce fichier) = doc humaine (règles, architecture, contexte projet, consignes de travail).
◉ **`docs/`** = documentation projet (specs, plans, décisions d'architecture).

◆ Distinction : « ajoute une règle dans AGENT.md » → ce fichier · « modifie le code » → `static/`, `app.py`, `templates/` · « écrit une spec » → `docs/superpowers/specs/`
