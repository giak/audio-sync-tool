# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants et les copie en un clic vers le bon sous-dossier.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install flask mutagen
```

## Utilisation

```bash
./venv/bin/python app.py
# → http://localhost:8765
```

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
   Les configurations sont sauvegardées dans des presets nommés.
2. **Scan** — analyse tous les dossiers et extrait les métadonnées
   (année, durée, encodage).
3. **Navigation** — au clavier uniquement : Tab, ↑↓, F5, F7.

### Raccourcis clavier

| Touche | Panel gauche (Éparpillé) | Panel droit (Source Data) |
|--------|--------------------------|---------------------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer dossiers |
| **← →** | — | Colonne suivante/précédente (layout 2 colonnes) |
| **← →** | Seek audio −20s / +20s (quand un morceau joue) | |
| **Tab** | ↔ basculer de panneau | ↔ basculer de panneau |
| **Entrée** | Jouer le fichier | Déplier/replier un dossier |
| **Espace** | Sélectionner le fichier ● | Déplier/replier un dossier |
| **F5** | Copie le fichier survolé vers le dossier survolé (avec confirmation) | |
| **F7** | — | Focus le champ de filtrage des dossiers |
| **Échap** | Fermer modale / panneau / annuler le filtre | |

### Badges (LED)

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ● vert | Traité — déjà copié (journal) |
| ● cyan | En cours de lecture |

### Métadonnées affichées

Chaque fichier affiche :
- **Année** (tag ID3/FLAC) — à droite du nom
- **Codec** (ex: `MP3 320kbps`, `FLAC`) — après l'année
- **Durée** (format `m:ss`) — en fin de ligne

### Workflow F5

1. **↑↓** sur un fichier ● dans le panneau gauche
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → modale de confirmation
5. **Entrée** pour valider, **Échap** pour annuler

Après copie, le panneau droit (Source Data) est mis à jour immédiatement
et le fichier apparaît en ○ gris (doublon) dans le dossier de destination.
Le compteur de la ligne de statut à gauche se met à jour aussi.

## Structure

```
audio-sync-tool/
├── app.py              # Serveur Flask (port 8765)
├── templates/index.html # Interface deux panneaux
├── static/
│   ├── style.css       # Thème sombre terminal (JetBrains Mono)
│   └── script.js       # Logique client + navigation clavier
├── data/
│   ├── config.json     # Presets de configuration
│   ├── journal.json    # Historique persistant des copies
│   └── cache.json      # Cache du dernier scan
├── test_app.py         # Tests pytest
└── README.md
```

## Tests

```bash
./venv/bin/pip install pytest mutagen
./venv/bin/python -m pytest test_app.py -v
```
