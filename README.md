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

L'outil a **deux pages** accessibles depuis la toolbar :

| Page | Bouton | Fonction |
|------|--------|----------|
| **Sync** | 📦 Sync | Copier des fichiers éparpillés vers la source data (F5) |
| **Playlist** | 🎵 Playlist | Créer des playlists, noter les morceaux, exporter |

Les **outils** (⚙️ Config, 🔄 Scan, 📋 Journal, ❓ Raccourcis) sont
disponibles dans les deux pages.

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
| **N** | Noter le fichier focusé (0-100, clic sur la zone de note aussi possible) | |

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

### Page Playlist

1. Cliquer **🎵 Playlist** dans la toolbar → deux panneaux : Source / Sidebar
2. **Espace** sur un fichier → ajoute ✅ / retire
3. **Ctrl + S** → sauvegarde persistante
4. **Ctrl + E** → export par hard links vers `source_data/_playlists/<nom>/`
5. Revenir à Sync → cliquer **📦 Sync** dans la toolbar

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
├── app.py                 # Serveur Flask (port 8765, 17 routes)
├── templates/index.html   # Interface utilisateur
├── static/
│   ├── style.css          # Thème SCADA (JetBrains Mono, LED glow)
│   ├── src/               # Sources TypeScript (31 modules)
│   │   ├── commands/      # Command Pattern (8 modules)
│   │   ├── render/        # Component factories (10 modules)
│   │   ├── script.ts      # Orchestrateur (~120 lignes)
│   │   ├── state.ts       # Proxy + EventEmitter + RAF batcher
│   │   └── *.test.ts      # 25 fichiers de test (vitest)
│   └── dist/              # Compilés par esbuild (gitignored)
├── data/                  # Config, journal, cache, playlists, ratings
├── docs/superpowers/      # Specs + plans d'implémentation
├── .github/workflows/     # CI : typecheck + lint + vitest + pytest
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
npm run lint               # Vérification Biome (0 erreurs — vérifié)
npm run lint:write         # Correction auto des problèmes
npm run format             # Formatage Biome
```

> **CI** : un workflow GitHub Actions (`.github/workflows/ci.yml`) vérifie
> typecheck, lint, vitest, pytest et le build sur chaque push/PR.

### Tests

#### Backend (pytest)

```bash
./venv/bin/python -m pytest test_app.py -v
```

#### Frontend (vitest)

```bash
npm test                   # 614 tests, 26 fichiers
npm run coverage           # Clean → test → rapport (~89% lignes)
```

### Couverture

| Suite | Tests | Couverture |
|-------|-------|------------|
| Pytest | 59 | — |
| Vitest | 313 | 90% lignes, 79% branches |
| Pytest | 127 | — |
| Vitest | 614 | 88.8% lignes, 82.6% branches |


## Architecture (v0.2)

Le frontend utilise le **Command Pattern** pour router les entrées clavier.
Un `CommandRegistry` déclaratif remplace l'ancien handler monolithique
de 593 lignes. Les touches sont dispatchées vers 8 modules de commandes
(`navigation`, `audio`, `copy`, `filter`, `rating`, `playlist`, `modals`).

```
script.ts (~120 lignes, orchestrateur)
  └─▶ commands/ (8 modules, CommandRegistry)
state.ts (Proxy + EventEmitter + RAF batcher)
  └─▶ render/ (component factories — fileRow, batchCopy, index)
actions.ts (mutations state pures)
```

**Tags git :**
- `v0.1-functional` — appli fonctionnelle (291 tests à l'époque)
- `v0.2-clean-architecture` — Command Pattern + EventEmitter (313 tests à l'époque)
