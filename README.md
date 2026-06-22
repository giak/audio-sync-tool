# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants et les copie en un clic vers le bon sous-dossier.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install flask
```

## Utilisation

```bash
./venv/bin/python app.py
# → http://localhost:8765
```

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
   Les configurations sont sauvegardées dans des presets nommés.
2. **Scan** — analyse tous les dossiers.
3. **Copie** — navigate avec le clavier, copie avec **F5**.

### Raccourcis clavier

| Touche | Panel gauche (Éparpillé) | Panel droit (Source Data) |
|--------|--------------------------|---------------------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer dossiers |
| **Tab** | ↔ basculer de panneau | ↔ basculer de panneau |
| **Entrée** | Play le fichier | Copie dans le dossier |
| **Espace** | Sélectionne le fichier ● | Copie dans le dossier |
| **F5** | Copie le fichier survolé vers le dossier survolé (pas de sélection préalable) | |
| **← →** | Seek audio (quand un morceau joue) | |

### Badges

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ▲ vert | Traité — déjà copié lors d'une session précédente |

### Workflow F5

1. **↑↓** sur un fichier ● dans le panneau gauche
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → copie immédiate (avec confirmation)

## Structure

```
audio-sync-tool/
├── app.py              # Serveur Flask (port 8765)
├── templates/index.html # Interface deux panneaux
├── static/
│   ├── style.css       # Thème sombre Catppuccin Mocha
│   └── script.js       # Logique client
├── data/
│   ├── config.json     # Presets de configuration
│   └── journal.json    # Historique persistant des copies
├── test_app.py         # Tests pytest
└── README.md
```

## Tests

```bash
./venv/bin/pip install pytest
./venv/bin/python -m pytest test_app.py -v
```
