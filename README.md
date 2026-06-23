# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants et les copie en un clic vers le bon sous-dossier.

**Nouveau** : création de playlists, sauvegarde persistante et export
par hard links vers la source data.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install flask mutagen
./venv/bin/pip install pytest          # pour les tests backend
```

```bash
npm install                            # pour les tests frontend (vitest)
```

## Utilisation

```bash
./venv/bin/python app.py
# → http://localhost:8765
```

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
   Les configurations sont sauvegardées dans des presets nommés.
2. **Scan** — analyse tous les dossiers et extrait les métadonnées
   (année, durée, encodage). Une barre de progression indique l'avancement.
3. **Navigation** — au clavier uniquement : Tab, ↑↓, F5, F7.
4. **Playlist** — crée des playlists, ajoute/retire des morceaux, exporte
   par hard links.

### Raccourcis clavier (mode normal)

| Touche | Panel gauche (Éparpillé) | Panel droit (Source Data) |
|--------|--------------------------|---------------------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer dossiers |
| **← →** | — | Colonne suivante/précédente (layout 2 colonnes) |
| **Shift + ← →** | Seek audio −20s / +20s (quand un morceau joue) | |
| **Tab** | ↔ basculer de panneau | ↔ basculer de panneau |
| **Entrée** | Jouer le fichier | Déplier/replier un dossier |
| **Espace** | Sélectionner le fichier ● | Déplier/replier un dossier |
| **F5** | Copie le fichier survolé vers le dossier survolé (avec confirmation) | |
| **F7** | — | Focus le champ de filtrage des dossiers |
| **/** | — | Focus le champ de filtrage des dossiers |
| **Échap** | Fermer modale / annuler le filtre / stopper audio | |

### Raccourcis clavier (mode Playlist)

| Touche | Panneau Source | Panneau Sidebar |
|--------|----------------|-----------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer pistes |
| **Tab** | ↔ basculer de panneau | ↔ basculer de panneau |
| **Entrée** | Jouer le fichier | — |
| **Espace** | Ajouter/retirer le morceau | — |
| **/** ou **F7** | Filtrer les fichiers | — |
| **Delete** / **Backspace** | — | Supprimer la piste |
| **Ctrl + S** | Sauvegarder la playlist active | |
| **Ctrl + E** | Exporter la playlist active | |
| **Ctrl + ↑↓** | — | Réorganiser les pistes |
| **Échap** | Quitter le mode Playlist | |

### Badges (LED)

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ● vert | Traité — déjà copié (journal) |
| ● cyan | En cours de lecture |
| ✅ | **Morceau déjà dans la playlist** (mode Playlist) |

### Métadonnées affichées

Chaque fichier affiche :
- **Année** (tag ID3/FLAC) — à droite du nom
- **Codec** (ex: `MP3 320kbps`, `FLAC`) — après l'année
- **Durée** (format `m:ss`) — en fin de ligne

### Workflow F5 (copie)

1. **↑↓** sur un fichier ● dans le panneau gauche
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → modale de confirmation
5. **Entrée** pour valider, **Échap** pour annuler

Après copie, le panneau droit (Source Data) est mis à jour immédiatement
et le fichier apparaît en ○ gris (doublon) dans le dossier de destination.
Le compteur de la ligne de statut à gauche se met à jour aussi.

### Workflow Playlist

1. **🎵 Playlist** → entre en mode Playlist (deux panneaux : Source / Sidebar)
2. **Espace** sur un fichier → l'ajoute à la playlist active (✅ apparaît)
3. **Espace** à nouveau → le retire de la playlist
4. **Ctrl + ↑↓** dans le sidebar → réorganise les pistes
5. **Ctrl + S** → sauvegarde persistante
6. **Ctrl + E** → export par hard links dans `source_data/_playlists/<nom>/`

Les playlists sont sauvegardées dans `data/playlists.json` et survivent
aux redémarrages. L'export crée des hard links (pas de duplication disque)
et retombe sur `shutil.copy2` si les volumes sont différents.

> ⚠️ **Régression corrigée (2026-06-23)** : le panneau Source Data en mode
> Playlist affichait les fichiers **éparpillés** au lieu des fichiers **Source
> Data**. Fix : `renderPlaylistSource()` utilise désormais `state.sourceFiles`
> au lieu de `state.eparsFiles`.

## Structure

```
audio-sync-tool/
├── app.py                  # Serveur Flask (port 8765, 12 routes)
├── templates/
│   └── index.html          # Interface utilisateur
├── static/
│   ├── style.css           # Thème SCADA (JetBrains Mono, LED glow)
│   ├── script.js           # Orchestrateur + routeur clavier
│   ├── actions.js          # Logique métier (scan, copy, config)
│   ├── api.js              # Client HTTP (fetch wrapper)
│   ├── audio.js            # Player audio (play, stop, seek)
│   ├── focus.js            # Navigation spatiale (↑↓←→ Tab)
│   ├── playlist.js         # Logique playlist (CRUD, export, reorder)
│   ├── render.js           # Rendu DOM (panneaux, arbre, playlist)
│   ├── state.js            # Store central partagé
│   ├── ui.js               # Modales + palette de filtre
│   ├── utils.js            # Helpers purs (formatTime, computeStatus)
│   ├── *.test.js           # Tests unitaires et intégration (279 tests)
│   └── *.js                # Fichiers de config JS
├── data/
│   ├── config.json         # Presets de configuration
│   ├── journal.json        # Historique persistant des copies
│   ├── cache.json          # Cache du dernier scan
│   └── playlists.json      # Playlists sauvegardées
├── vitest.config.js        # Configuration des tests frontend
├── package.json            # Dépendances JS (vitest)
├── test_app.py             # Tests backend (pytest)
└── README.md
```

## Développement

### Dev watcher (TypeScript → JS)

```bash
npm run dev
```

Compile automatiquement `state.ts`, `utils.ts`, `api.ts` vers `.js` à chaque
sauvegarde. Laisse tourner en fond pendant que tu codes.

```bash
npm run build          # compilation unique
npm run typecheck      # vérification des types (0 erreurs)
```

### Tests

#### Backend (pytest)

```bash
./venv/bin/pip install pytest mutagen
./venv/bin/python -m pytest test_app.py -v
```

#### Frontend (vitest)

```bash
npm install
npx vitest run
```

Les deux suites tournent indépendamment. La CI peut les lancer en parallèle.

> 📖 **Guide de test** : voir [docs/TESTING-GUIDE.md](docs/TESTING-GUIDE.md) pour
> la philosophie de test UX, la matrice de couverture, et les templates.

### Couverture actuelle

| Suite | Tests | Fichiers |
|-------|-------|----------|
| Pytest | 52 | test_app.py |
| Vitest | 282 | 10 fichiers test |
| **Total** | **334** | — |
