# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Permet de repérer
les fichiers manquants et de les copier en un clic vers le bon sous-dossier.

## Installation

```bash
pip install flask
```

## Utilisation

```bash
python app.py
# → http://localhost:8765
```

1. **Config** — renseigne le dossier source (`/home/giak/Music/select/style/`)
   et les dossiers éparpillés (un par ligne)
2. **Scan** — analyse tous les dossiers
3. **Rangement** — clique un fichier ● (nouveau) puis un dossier dans le
   panneau Source Data pour le copier

### Badges

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — fichier pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ▲ vert | Traité — déjà copié lors d'une session précédente |

## Structure

```
audio-sync-tool/
├── app.py              # Serveur Flask
├── templates/index.html # Interface deux panneaux
├── static/
│   ├── style.css       # Styles (thème sombre)
│   └── script.js       # Logique client
├── data/
│   ├── config.json     # Configuration persistante
│   └── journal.json    # Historique des copies
└── README.md
```

## Tests

```bash
pip install pytest
python -m pytest test_app.py -v
```
