# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants, les copie en un clic vers le bon sous-dossier, et intègre un
**éditeur de cues/loops avec waveform** calé sur la collection **Traktor (NML)**
(beatgrid, BPM, grille native, export de playlists).

## Fonctionnalités

- **Sync** : scan des dossiers éparpillés, détection manquant/doublon (nom
  exact **et** homonymes probables — durée ±2 s + nom, LED ambre), copie en un
  clic (F5) vers la bonne source, remplacement d'homonyme de moindre qualité
  (R — l'ancien part dans `_trash/<date>/`, jamais effacé).
- **Filtre rapide** (chips intégrés au-dessus des colonnes Sync) : F7 ou /
  focus le chip de la colonne focusée, filtre en direct insensible casse/accents
  sur nom + **année** + codec, mémorisé par liste (changer de colonne/page le
  conserve), ✕/Backspace pour effacer.
- **Doublons** : vue dédiée des groupes de versions d'un même morceau (épars
  et/ou rangés) — arbitrage automatique par qualité (FLAC > 320 > 128), override
  au clic, application du plan (gagnant rangé à droite, perdants rangés → trash).
- **Playlist** : création/édition de playlists, notation (0–100), export par
  hard links, badge d'importation NML (`✓ NML` / `≈ homonymes` / `✕ non importé`).
- **Éditeur cues / loops (waveform)** : cues A–H (touches `1–8`), loops, zoom
  contrôlé (+/−, molette, « Fit », « 1 beat »), minimap synchronisée au zoom,
  waveform **3 bandes RGB** (low/mid/high standard DJ), renommage/recolorisation
  des cues, **undo/redo**.
- **Beatgrid** : snap sur BPM (détecté ou saisi), calage manuel de phase
  (`←/→ 1/4`, `◎ Beat 1`), analyse serveur kick/phase (DSP pur Python, bouton
  🔍 Analyser), **écriture de la grille dans le `collection.nml`** (TEMPO +
  TYPE=4 `AutoGrid`, bouton 💾 Grille).
- **Collection Traktor** : lecture de la collection NML, match par FILESIZE (Ko,
  convention Traktor), ajout des pistes absentes au collection, export NML
  configurable.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install flask mutagen
./venv/bin/pip install pytest          # pour les tests backend
```

> **Analyse serveur (bouton 🔍 Analyser)** : utilise `ffmpeg` (binaire système) pour décoder
> les mp3/flac/ogg. Les `.wav` fonctionnent sans (repli stdlib). Si ffmpeg est absent, seul le
> décodage WAV + la détection client restent disponibles.

```bash
npm install                            # pour le frontend (vitest, biome, esbuild)
```

## Utilisation

```bash
./venv/bin/python app.py
# → http://localhost:8765
```

L'outil a **trois pages** accessibles depuis la toolbar, plus un **éditeur de
cues** ouvert depuis la page Playlist (bouton « Cues » sur une ligne, ou menu
clic droit) :

| Page / Outil | Bouton | Fonction |
|------|--------|----------|
| **Sync** | 📦 Sync | Copier des fichiers éparpillés vers la source data (F5) |
| **Playlist** | 🎵 Playlist | Créer des playlists, noter les morceaux, exporter |
| **Doublons** | ↔ Doublons | Groupes de versions d'un même morceau, arbitrage qualité, perdants rangés → `_trash/` |
| **Cue editor** | « Cues » (ligne playlist) | Éditer cues/loops, zoom waveform, beatgrid, grille NML |

Les **outils** (⚙️ Config, 🔄 Scan, 📋 Journal, ❓ Raccourcis) sont
disponibles dans les pages.

> **Config** — renseigne aussi le chemin du `collection.nml` Traktor (champ
> *Traktor NML path*), nécessaire pour le match NML et l'écriture de la grille.

### Workflow de base

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
2. **Scan** — analyse tous les dossiers et extrait les métadonnées.
3. **Navigation** — au clavier uniquement : Tab, ↑↓, F5, F7.
4. **Playlist** — crée des playlists, sauvegarde, export par hard links.
5. **Cues** — ouvre l'éditeur waveform depuis une ligne de playlist.

### Raccourcis clavier (mode normal)

| Touche | Panel gauche (Éparpillé) | Panel droit (Source Data) |
|--------|--------------------------|---------------------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer dossiers |
| **← →** | — | Colonne suivante/précédente (2 colonnes) |
| **Shift + ← →** | Seek audio ±20s (pendant lecture) | |
| **Tab** | ↔ basculer de panneau | |
| **Entrée** | Jouer le fichier | Déplier/replier un dossier |
| **Espace** | Sélectionner le fichier | Déplier/replier un dossier |
| **F5** | Copier vers le dossier survolé (avec confirmation) | |
| **F7** / **/** | Focus le chip de filtre de la colonne focusée — tape pour filtrer (nom, année, codec) ; ✕ ou Backspace champ vide pour effacer | Même comportement sur l'arbre (auto-dépliage des branches matchées) |
| **Échap** | Sortir du chip / fermer modale / stopper l'audio | |
| **N** | Noter le fichier focusé (0-100, clic sur la zone de note aussi possible) | |
| **R** / double-clic | Remplacer l'homonyme (l'ancien rangé → `_trash/<date>/`) — seulement sur les lignes à LED ambre | |

### Raccourcis clavier (page Doublons)

| Touche | Action |
|--------|--------|
| **↑ ↓** | Naviguer les groupes de versions |
| **Clic sur un exemplaire** | Le désigner gagnant (override de l'arbitrage qualité) |
| **R** / bouton **✓ Appliquer** | Plan du groupe (confirmation) : gagnant rangé à droite, rangés perdants → `_trash/<date>/` |
| **Échap** / **📦 Sync** | Revenir à la page Sync |

> **Arbitrage qualité** : score par paliers — lossless (FLAC/WAV/AIFF/ALAC) =
> 100, ≥ 256 kbps = 80, 128-255 = 60, < 128 = 40 ; tie-breaks durée puis chemin.
> Le tooltip et la colonne « codec » permettent de juger ; la détection est une
> heuristique (revue humaine = confirmation obligatoire).

### Raccourcis clavier (page Playlist)

| Touche | Panneau Source | Panneau Sidebar |
|--------|----------------|-----------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer pistes |
| **Tab** | ↔ basculer de panneau | |
| **Entrée** | Jouer le fichier | — |
| **Espace** | Ajouter/retirer le morceau | — |
| **F7** / **/** | Filtrer les fichiers | — |
| **Delete** / **Backspace** | — | Supprimer la piste |
| **Ctrl + S** | Sauvegarder la playlist | |
| **Ctrl + E** | Exporter la playlist | |
| **Ctrl + ↑↓** | — | Réorganiser les pistes |
| **N** | Noter le fichier focusé (0-100, clic sur la zone de note aussi possible) | — |

> **Note :** Échap ne quitte plus la page Playlist. Pour revenir à Sync,
> cliquer sur **📦 Sync** dans la toolbar.

### Raccourcis clavier (éditeur de cues)

| Touche | Action |
|--------|--------|
| **← →** | Seek audio ±5s |
| **+/−** | Zoom waveform (molette aussi : ×1,25) |
| **1–8** | Poser un cue sur les slots A–H |
| **C** | Poser un cue au curseur (déplace l'existant si 8 pleins) |
| **Ctrl + Z** / **Ctrl + Shift + Z** | Annuler / rétablir (undo/redo) |
| **←/→ 1/4** | Calage manuel de la grille (nudge de phase ±1/4 beat) |
| **◎ Beat 1** | Poser le premier beat |
| **🔍 Analyser** | Analyse serveur de la basse/du kick (BPM + phase) |
| **💾 Grille** | Écrire la grille (TEMPO + TYPE=4) dans le collection.nml |
| **Suppr** / clic droit | Retirer / supprimer un cue |
| **Double-clic** (slot ou région) | Renommer / recolorer le cue |

### Badges

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ● vert | Traité — déjà copié (journal) |
| ● cyan | En cours de lecture |
| ✅ | Dans la playlist active (mode Playlist) |
| ✓ **NML** | Matché dans le collection.nml (sauvegardable) |
| ≈ **homonymes** | Plusieurs entrées NML homonymes (sélecteur au clic « Cues ») |
| ✕ **non importé** | Absent du collection.nml (visualisation seule) |

### Métadonnées affichées

Chaque fichier affiche : **Année** — **Codec** — **Durée**

### Workflow F5

1. Naviguer sur un fichier ● (panneau gauche)
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → modale de confirmation (**Entrée** valide, **Échap** annule)

### Page Playlist

1. Cliquer **🎵 Playlist** dans la toolbar → deux panneaux : Source / Sidebar
2. **Espace** sur un fichier → ajoute ✅ / retire
3. **Ctrl + S** → sauvegarde persistante
4. **Ctrl + E** → export par hard links vers `source_data/_playlists/<nom>/`
5. Revenir à Sync → cliquer **📦 Sync** dans la toolbar

### Éditeur de cues & beatgrid

1. Dans la page Playlist, cliquer **« Cues »** sur une ligne (ou clic droit →
   *Cues / loops (waveform)*) → modale waveform de la piste.
2. **Cues** — `1–8` ou **C** pose un cue ; **Suppr**/clic droit le retire ;
   double-clic pour le renommer/recolorer (écrit dans le NML au save).
3. **Zoom** — +/− ou molette, `Fit` (piste entière), `1 beat` (largeur ÷
   intervalle, nécessite BPM) ; la minimap sous la waveform reste synchronisée,
   clic = seek.
4. **Waveform** — 3 bandes RGB (rouge basse / vert médium / bleu aigu), downbeat
   différencié (trait ambre), numéros de barre tous les 4 beats.
5. **Beatgrid** — `←/→ 1/4` et `◎ Beat 1` calent la grille ; **🔍 Analyser**
   lance l'analyse serveur (BPM + phase, cache par piste) ; **💾 Grille** écrit
   TEMPO + TYPE=4 dans le `collection.nml`.

### Notation (Ratings)

Une note de 0 à 100 est visible sur **tous les fichiers** (mode Sync et
Playlist), affichée à droite du row après la durée. La zone de note est
cliquable (ouvre un edit inline en mode Playlist Source) et éditable au
clavier via la touche **N**.

Les notes sont stockées globalement (pas par playlist) dans
`data/ratings.json`, avec la clé = chemin absolu du fichier.

| Action | Raccourci / Gestuelle |
|--------|----------------------|
| **Éditer la note** | **N** sur fichier focusé (Sync ou Playlist) → input inline |
| **Éditer la note** | **Clic** sur la zone de note (`.file-rating`) → input inline |
| **Valider** | **Entrée** → sauvegarde immédiate |
| **Annuler** | **Échap** → retour à la note précédente |
| **Effacer** | Champ vide + **Entrée** → suppression de la note |
| **Valider auto** | **Blur** → sauvegarde automatique |

**Affichage :**
- `85` — note en chiffres tabulaires
- *vide* — pas encore noté
- Dans le sidebar Playlist : `—` si pas noté

**Implémentation :** fonction partagée `_startInlineRatingEdit()` dans render.ts,
avec deux points d'entrée `startRatingEdit()` (sidebar tracks) et
`startSourceRatingEdit()` (file-rows dans l'arbre source).

## Structure

```
audio-sync-tool/
├── app.py                 # Serveur Flask (port 8765, routes REST)
├── analysis.py            # Analyse serveur kick/phase (DSP pur Python, beatgrid P3)
├── nml.py                 # Parser/écriture collection Traktor (NML) : match, add, export, grille
├── templates/index.html   # Interface utilisateur
├── static/
│   ├── style.css          # Thème SCADA (JetBrains Mono, LED glow)
│   ├── src/               # Sources TypeScript (42 modules)
│   │   ├── commands/      # Command Pattern (10 modules)
│   │   ├── render/        # Component factories (11 modules — fileRow, cueEditor, playlistUI, dupsUI…)
│   │   ├── router.ts      # Routeur de pages (sync | playlist | dups)
│   │   ├── dupDetect.ts   # Détection doublons (durée ±2 s + nom fuzzy)
│   │   ├── dupGroups.ts   # Groupes de versions + arbitrage qualité
│   │   ├── script.ts      # Orchestrateur (~160 lignes)
│   │   ├── state.ts       # Proxy + EventEmitter + RAF batcher
│   │   └── *.test.ts      # 34 fichiers de test (vitest)
│   └── dist/              # Compilés par esbuild (gitignored)
├── data/                  # Config, journal, cache, playlists, ratings, beatgrids (gitignored)
├── docs/superpowers/      # Specs + plans d'implémentation
│   └── epics/             # ⭐ Registre des EPICs (traçabilité de toute évolution)
├── scripts/               # Outils Node (build, validation)
├── .github/workflows/     # CI : typecheck + lint + vitest + pytest
├── biome.json             # Linter + formateur Biome
├── vitest.config.js       # Tests frontend + coverage
├── tsconfig.json          # TypeScript config
├── package.json           # Dépendances JS
├── test_app.py            # Tests backend API (pytest)
├── test_analysis.py       # Tests DSP analyse kick/phase (pytest)
├── test_nml.py            # Tests parser/writer NML (pytest)
└── README.md
```

Routes REST principales : `/scan`, `/copy`, `/move`, `/config`, `/journal`,
`/ratings`, `/playlists[/<name>]`, `/mkdir`, `/api/nml/status`, `/api/track/match`,
`/api/track/add`, `/api/track/cues`, `/api/track/grid`, `/api/beatgrid`,
`/api/track/analyze`.

## Développement

Tout le code frontend est en **TypeScript**. Les fichiers `.js` sont des
artefacts de build (gitignorés) générés par esbuild.

```bash
npm run build              # Compilation unique .ts → .js
npm run dev                # Watch mode (compilation automatique)
npm run typecheck          # Vérification des types (tsc)
npm run lint               # Vérification Biome (0 erreurs — vérifié)
npm run lint:write         # Correction auto des problèmes
npm run format             # Formatage Biome
npm test                   # 811 tests, 34 fichiers
npm run test:shuffle       # Même suite en --sequence.shuffle (stabilité)
```

> **CI** : un workflow GitHub Actions (`.github/workflows/ci.yml`) vérifie
> typecheck, lint, vitest, pytest et le build sur chaque push/PR.

### Tests

#### Backend (pytest)

```bash
./venv/bin/python -m pytest -q
```

#### Frontend (vitest)

```bash
npm test                   # 811 tests, 34 fichiers
npm run coverage           # Clean → test → rapport (~91% lignes)
```

### Couverture

| Suite | Tests | Couverture |
|-------|-------|------------|
| Pytest | 190 | — |
| Vitest | 811 | 90.98% lignes/statements, 81.87% branches, 87.43% fonctions (mesure EPIC-021 — à rafraîchir) |

### Évolutions & traçabilité

Toute évolution/amélioration du projet est tracée dans une **EPIC**
(`docs/superpowers/epics/`) : registre central `README.md` + un fichier par
évolution (objectif, tâches cochables, fichiers, validation, commits, décisions).
Créer une nouvelle EPIC = copier `_template.md` + l'ajouter à l'index.
Statuts : ⚪ Backlog → 🔵 En cours → 🟢 Livré | 🟠 Bloqué | 🔴 Abandonné.

## Architecture (v0.2)

Le frontend utilise le **Command Pattern** pour router les entrées clavier.
Un `CommandRegistry` déclaratif remplace l'ancien handler monolithique
de 593 lignes. Les touches sont dispatchées vers 10 modules de commandes
(`registry`, `navigation`, `audio`, `copy`, `filter`, `rating`, `playlist`,
`modals`, `replace`, `dups`), scopés par page via `router.ts`
(`state.page` = sync | playlist | dups).

```
script.ts (~160 lignes, orchestrateur)
  └─▶ commands/ (8 modules, CommandRegistry)
state.ts (Proxy + EventEmitter + RAF batcher)
  └─▶ render/ (component factories — fileRow, sourceTree, playlistUI, cueEditor, index)
actions.ts (mutations state pures)
```

L'éditeur de cues (`render/cueEditor.ts`) pilote wavesurfer (waveform,
minimap, régions cues/loops) et conserve ses métadonnées dans des sources de
vérité internes (`_cueMeta`, `_displOrders`) pour un round-trip NML complet ;
la beatgrid s'appuie sur `bands.ts` (FFT fenêtrée, 3 bandes RGB) et le backend
(`analysis.py` + cache `data/beatgrids.json`).

**Tags git :**
- `v0.1-functional` — appli fonctionnelle (291 tests à l'époque)
- `v0.2-clean-architecture` — Command Pattern + EventEmitter (313 tests à l'époque)