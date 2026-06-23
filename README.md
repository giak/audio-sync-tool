# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants et les copie en un clic vers le bon sous-dossier.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install flask mutagen
./venv/bin/pip install pytest          # pour les tests backend
```

```bash
npm install                            # pour le frontend (vitest, biome, esbuild)
```

## Utilisation

```bash
./venv/bin/python app.py
# → http://localhost:8765
```

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
2. **Scan** — analyse tous les dossiers et extrait les métadonnées.
3. **Navigation** — au clavier uniquement : Tab, ↑↓, F5, F7.
4. **Playlist** — crée des playlists, sauvegarde, export par hard links.

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
| **F7** / **/** | — | Focus le filtre de dossiers |
| **Échap** | Fermer modale / annuler le filtre / stopper l'audio | |

### Raccourcis clavier (mode Playlist)

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
| **Échap** | Quitter le mode Playlist | |

### Badges (LED)

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ● vert | Traité — déjà copié (journal) |
| ● cyan | En cours de lecture |
| ✅ | Dans la playlist active (mode Playlist) |

### Métadonnées affichées

Chaque fichier affiche : **Année** — **Codec** — **Durée**

### Workflow F5

1. Naviguer sur un fichier ● (panneau gauche)
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → modale de confirmation (**Entrée** valide, **Échap** annule)

### Mode Playlist

1. **🎵 Playlist** → deux panneaux : Source / Sidebar
2. **Espace** sur un fichier → ajoute ✅ / retire
3. **Ctrl + S** → sauvegarde persistante
4. **Ctrl + E** → export par hard links vers `source_data/_playlists/<nom>/`

## Structure

```
audio-sync-tool/
├── app.py                 # Serveur Flask (port 8765, 12 routes)
├── templates/index.html   # Interface utilisateur
├── static/
│   ├── style.css          # Thème SCADA (JetBrains Mono, LED glow)
│   ├── *.ts               # 10 modules TypeScript source
│   ├── *.js               # Compilés par esbuild (gitignored)
│   └── *.test.ts          # 9 fichiers de test (vitest)
├── data/                  # Config, journal, cache, playlists
├── biome.json             # Linter + formateur Biome
├── vitest.config.js       # Tests frontend + coverage
├── tsconfig.json          # TypeScript config
├── package.json           # Dépendances JS
├── test_app.py            # Tests backend (pytest)
└── README.md
```

## Développement

Tout le code frontend est en **TypeScript**. Les fichiers `.js` sont des
artefacts de build (gitignorés) générés par esbuild.

```bash
npm run build              # Compilation unique .ts → .js
npm run dev                # Watch mode (compilation automatique)
npm run typecheck          # Vérification des types (tsc)
npm run lint               # Vérification Biome (0 erreurs)
npm run lint:write         # Correction auto des problèmes
npm run format             # Formatage Biome
```

### Tests

#### Backend (pytest)

```bash
./venv/bin/python -m pytest test_app.py -v
```

#### Frontend (vitest)

```bash
npm test                   # 282 tests, 9 fichiers
npm run coverage           # Clean → test → rapport (90% lignes)
```

### Couverture

| Suite | Tests | Couverture |
|-------|-------|------------|
| Pytest | 52 | — |
| Vitest | 282 | 90% lignes, 79% branches |
