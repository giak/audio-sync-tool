# Audio Sync Tool — Design Document

## 1. Objective

Créer un outil graphique pour Linux Mint permettant de cartographier des fichiers musicaux (mp3, flac) entre un dossier source organisé manuellement et des dossiers « éparpillés », avec copie cliquable vers la bonne destination dans l'arborescence source.

## 2. Architecture

**Approche retenue** : Application web locale (Flask + navigateur).

- Backend : Flask (une seule dépendance : `pip install flask`)
- Frontend : HTML + CSS + JavaScript vanilla
- Stockage : fichiers JSON (pas de base de données)

## 3. Composants

### 3.1 Scanner
- Parcourt récursivement les dossiers éparpillés et le dossier source
- Indexe par **nom de fichier** (option A — comparaison par nom uniquement)
- Génère un dictionnaire : `{filename: [list de chemins relatifs]}`
- Exposé via endpoint `GET /scan`

### 3.2 Comparator
- Croise les deux index (éparpillé × source)
- Catégorise chaque fichier :
  - `nouveau` : présent dans éparpillé, absent de source
  - `doublon` : présent dans les deux
  - `traité` : déjà copié dans une session antérieure (journal)
- Exécuté côté client (JavaScript) après réception des index

### 3.3 Interface (deux panneaux)
- **Panneau gauche** : arborescence des dossiers éparpillés avec fichiers listés
- **Panneau droit** : arborescence du dossier source, navigable
- Badges de couleur par statut : bleu (nouveau), gris (doublon), vert (traité)
- Workflow : clic fichier bleu (sélectionné) → clic dossier destination (copie) → confirmation

### 3.4 Copie (endpoint `POST /copy`)
- Reçoit : `{source_path, dest_path}`
- Copie le fichier (pas de déplacement, pas de suppression)
- Enregistre dans `journal.json` : timestamp, source, destination, fichier
- Retourne succès/échec → l'interface rafraîchit le statut

### 3.5 Logger
- Lit/écrit `data/journal.json`
- Structure : `[{timestamp, source_dir, dest_dir, filename, status}]`
- Statuts : `copied`, `already_exists`, `error`
- Charge l'historique au démarrage pour marquer les fichiers déjà traités

### 3.6 Configuration (endpoint `GET/POST /config`)
- `data/config.json` stocke :
  - `source_data`: chemin vers le dossier source (`/home/giak/Music/select/style/`)
  - `epars_dirs`: liste des dossiers éparpillés (éditable via l'UI)
- Persiste entre les sessions

## 4. Structure des fichiers

```
audio-sync-tool/
├── app.py                   # Serveur Flask, routes
├── static/
│   ├── style.css            # Styles, badges, layout deux panneaux
│   └── script.js            # Logique client (scan, comparaison, clic, copie)
├── templates/
│   └── index.html           # Page principale
├── data/
│   ├── config.json           # Configuration des dossiers
│   └── journal.json          # Historique des opérations
└── README.md                 # Instructions de démarrage
```

## 5. Routes Flask

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/` | Page principale |
| GET | `/scan` | Scanne tous les dossiers, retourne index JSON |
| POST | `/copy` | Copie un fichier vers une destination |
| GET | `/config` | Récupère la configuration |
| POST | `/config` | Sauvegarde la configuration |
| GET | `/journal` | Récupère l'historique |

## 6. Flux utilisateur

1. L'utilisateur lance `python app.py` → le navigateur s'ouvre sur `http://localhost:8765`
2. Il configure (ou vérifie) les chemins source et éparpillés dans le panneau de config
3. Il clique **Scan** → les deux index sont chargés et comparés
4. Chaque fichier éparpillé apparaît avec son statut (badge)
5. L'utilisateur clique sur un fichier **nouveau** (bleu) → il est sélectionné
6. Il navigue dans l'arborescence source (panneau droit) et clique sur un dossier de destination
7. Confirmation : le fichier est copié, le log s'affiche en bas, le badge passe en vert

## 7. Contraintes

- **Linux Mint 23** compatible (Python ≥ 3.10, dépendance : Flask)
- Pas de suppression de fichier — jamais
- Journal persistant pour savoir où on en est
- Interface légère, pas de dépendances npm

## 8. Non-fonctionnel

- Démarrage en un clic : `python app.py && xdg-open http://localhost:8765`
- Fichier unique côté backend (app.py)
- Poids total < 50 KB (code source)
