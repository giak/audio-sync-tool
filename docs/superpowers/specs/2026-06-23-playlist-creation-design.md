# Playlist Creation — Design Document

> Feature: Création de playlists par hard links, intégrée à l'outil Audio Sync Tool.
> Date: 2026-06-23
> Statut: Spec (pré-implantation)

---

## 1. Objectif

Permettre à l'utilisateur de créer des **playlists DJ** à partir du dossier Source Data
(`/home/giak/Music/select/style/`) sans dupliquer les fichiers sur le disque.

### Problème résolu

- Actuellement, l'utilisateur copie des fichiers manuellement d'un dossier Source Data
  organisé (genre/année) vers des dossiers playlist → doublons partout
- Les **liens symboliques** sont mal supportés par Traktor 4 (corruption de BDD)
- Les **hard links** (`os.link`) créent de vrais fichiers sans occuper d'espace disque
  supplémentaire — Traktor les voit comme des fichiers normaux

### Principe retenu

Playlist = **manifest JSON** (côté serveur) contenant les références aux fichiers.
L'utilisateur peut charger/switcher/supprimer des playlists dans l'interface.
L'**export** (matérialisation) crée un dossier avec des hard links physiques,
prêt à être importé dans Traktor.

---

## 2. Architecture

### 2.1 Nouveaux composants backend

| Fichier | Rôle |
|---------|------|
| `data/playlists.json` | Manifest de toutes les playlists (tableau d'objets) |
| `app.py` — nouvelles routes | `GET/POST /playlists`, `POST /playlists/export`, `DELETE /playlists/<name>` |

### 2.2 Nouveaux composants frontend

| Module | Rôle |
|--------|------|
| `static/playlist.js` | Logique métier des playlists (CRUD, export, drag-drop ordre) |
| Extensions de `render.js` | Rendu du panneau playlist + onglets |
| Extensions de `script.js` | Routage clavier pour le mode Playlist |
| Extensions de `style.css` | Styles panneau playlist, onglets, drag-drop |

### 2.3 Structure des dossiers sur le disque

```
/home/giak/Music/select/style/
├── _playlists/                  ← créé automatiquement
│   ├── ma-playlist/             ← dossier matérialisé après export
│   │   ├── track01.mp3          ← hard link (0 octet supplémentaire)
│   │   ├── track02.flac         ← hard link
│   │   └── ...
│   └── ...
├── House/
│   └── 2024/
│       ├── track01.mp3          ← fichier original
│       └── ...
├── Techno/
└── ...

data/
└── playlists.json               ← manifest JSON (côté serveur)
```

### 2.4 Format du manifest (`data/playlists.json`)

```json
[
  {
    "name": "set-summer-2024",
    "created": "2026-06-23T14:30:00",
    "updated": "2026-06-23T15:00:00",
    "exported": "2026-06-23T15:30:00",
    "exportedDir": "/home/giak/Music/select/style/_playlists/set-summer-2024",
    "tracks": [
      {
        "filename": "07 - Paradise City.mp3",
        "fullPath": "/home/giak/Music/select/style/House/2024/07 - Paradise City.mp3",
        "relPath": "House/2024/07 - Paradise City.mp3",
        "year": "2024",
        "duration": 367,
        "codec": "MP3 320kbps"
      }
    ],
    "trackCount": 24,
    "totalDuration": 5400
  }
]
```

---

## 3. Parcours utilisateur détaillé

### 3.1 Mode Playlist — nouveau bouton + vue dédiée

1. L'utilisateur clique **« 🎵 Playlist »** dans la toolbar (à droite des boutons existants)
   - Si des playlists étaient en cours, elles sont restaurées depuis le manifest
2. L'interface bascule en **mode Playlist** :
   - Les deux panneaux (Éparpillé / Source Data) sont masqués
   - S'affiche : **Source Data** (navigation par arborescence genre/année, préexistante)
   - À droite : **Panneau playlist en cours** (nouveau, dédié)
3. **Échap** ou reclic sur **« 🎵 Playlist »** = sauvegarde automatique + retour à la vue normale

### 3.2 Construction d'une playlist

1. L'utilisateur navigue dans Source Data (arborescence, T9)
2. **Espace** sur un fichier = l'ajoute à la playlist en cours (toggle)
   - Le fichier reçoit un indicateur visuel dans l'arborescence (ex: surlignage, coche ✅)
   - Le morceau apparaît dans le panneau playlist à droite, à la suite
   - Une notification brève (toast) en bas : « ➕ track.mp3 ajouté » / « ➖ track.mp3 retiré »
3. L'utilisateur peut continuer à naviguer et ajouter d'autres morceaux
4. **Entrée** = jouer le morceau (lecteur audio en bas, inchangé)

### 3.3 Gestion multi-playlists (onglets)

1. En haut du panneau playlist : barre d'onglets
   - Chaque onglet = une playlist en cours de construction
   - Onglet actif = surligné
   - Bouton **« + »** pour créer une nouvelle playlist
   - Bouton **« ✕ »** pour fermer un onglet
2. L'utilisateur peut :
   - Créer plusieurs playlists (A, B, C…) et basculer entre elles
   - Ajouter des morceaux à l'onglet actif uniquement
   - Chaque playlist conserve son propre ordre et sa sélection
3. **Changement d'onglet = sauvegarde automatique** du manifest (pas de perte possible)
4. **Fermeture d'onglet** : si playlist non exportée, une modale demande confirmation
   avec rappel du nombre de morceaux et de l'état d'export

### 3.4 Actions dans le panneau playlist

Chaque morceau dans le panneau playlist affiche :
- **◀ ⬍ ▶** (poignée de drag & drop) — réordonner par glisser-déposer
- **Nom du fichier** + année / codec / durée
- **Bouton « ✕ »** pour retirer de la playlist

Raccourcis clavier dans le panneau playlist :
- **Ctrl+↑** / **Ctrl+↓** = déplacer le morceau sélectionné
- **Suppr** / **Backspace** = retirer le morceau sélectionné

### 3.5 Finalisation — sauvegarde du manifest

1. L'utilisateur clique **« Sauvegarder »** (ou Ctrl+S)
2. Le manifest JSON est mis à jour côté serveur
3. La playlist est persistée — peut être rechargée plus tard
4. L'utilisateur peut fermer l'onglet et y revenir

### 3.6 Export — matérialisation sur le disque

1. L'utilisateur clique **« Exporter »** (ou Ctrl+E) dans le panneau playlist
2. Modale de confirmation avec :
   - **Nom de la playlist** (pré-rempli depuis le manifest)
   - **Dossier de destination** (par défaut : `_playlists/<nom>` dans Source Data)
3. L'export vérifie que tous les fichiers existent encore dans Source Data
   - Si un fichier est manquant → alerte : « Fichier introuvable : track.mp3 »
   - L'export est bloqué jusqu'à résolution
4. Création du dossier + hard links via `os.link()`
5. Le manifest est mis à jour avec `exported` et `exportedDir`
6. Message de confirmation : « ✓ Playlist "set-summer-2024" exportée — 24 morceaux dans _playlists/set-summer-2024 »

### 3.7 Gestionnaire de playlists

Bouton **« Gérer »** qui ouvre une modale listant toutes les playlists :

| Playlist | Morceaux | Durée | Exportée | Actions |
|----------|----------|-------|----------|---------|
| set-summer-2024 | 24 | 1h30 | ✅ 2026-06-23 | Charger | Renommer | Supprimer |
| techno-minimal | 12 | 45min | ❌ | Charger | Renommer | Supprimer |

Actions :
- **Charger** = bascule le mode Playlist et charge cette playlist dans un nouvel onglet
- **Renommer** = champ inline, met à jour le manifest
- **Supprimer** = confirmation, supprime le manifest (pas les hard links s'ils existent)

---

## 4. Spécifications fonctionnelles détaillées

### 4.1 Nouvelles routes Flask

| Méthode | Route | Body | Retour | Description |
|---------|-------|------|--------|-------------|
| `GET` | `/playlists` | — | `[{name, tracks, …}]` | Liste toutes les playlists |
| `POST` | `/playlists` | `{name: string, tracks: array}` | `{ok, playlist}` | Crée ou remplace une playlist (le frontend demande confirmation si le nom existe déjà) |
| `POST` | `/playlists/export` | `{name: string}` | `{ok, dir, count, totalDuration}` | Matérialise les hard links |
| `DELETE` | `/playlists/<name>` | — | `{ok}` | Supprime le manifest (pas les fichiers exportés) |

### 4.2 Endpoint POST /playlists/export — détails

Algorithme côté serveur :

```python
@app.route('/playlists/export', methods=['POST'])
def export_playlist():
    data = request.json
    name = data['name']
    playlists = load_json(PLAYLISTS_PATH, [])
    pl = next((p for p in playlists if p['name'] == name), None)
    if not pl:
        return jsonify({'ok': False, 'error': 'Playlist introuvable'}), 404

    # Vérifier que tous les fichiers existent
    missing = []
    for track in pl['tracks']:
        if not os.path.exists(track['fullPath']):
            missing.append(track['filename'])

    if missing:
        return jsonify({'ok': False, 'missing': missing}), 409  # Conflict

    # Créer le dossier
    source_base = get_active_config()['source_data']
    pl_dir = os.path.join(source_base, '_playlists', name)
    os.makedirs(pl_dir, exist_ok=True)

    # Créer les hard links
    for track in pl['tracks']:
        src = track['fullPath']
        dst = os.path.join(pl_dir, track['filename'])
        if not os.path.exists(dst):       # éviter les doublons dans l'export
            os.link(src, dst)

    # Mettre à jour le manifest
    pl['exported'] = datetime.now().isoformat()
    pl['exportedDir'] = pl_dir
    save_json(PLAYLISTS_PATH, playlists)

    return jsonify({
        'ok': True,
        'dir': pl_dir,
        'count': len(pl['tracks']),
        'totalDuration': sum(t.get('duration', 0) for t in pl['tracks']),
    })
```

### 4.3 Frontend — structure de l'état

```javascript
// Dans state.js — ajouter :
playlistMode: false,            // true quand on est en mode Playlist
playlists: [],                  // cache de GET /playlists
activePlaylistIndex: null,      // index dans playlists[] de l'onglet actif
pendingPlaylists: {},           // {name: tracks[]} — versions non sauvegardées
```

### 4.4 Frontend — routage clavier (mode Playlist)

Quand `state.playlistMode === true`, le gestionnaire de touches se comporte différemment :

| Touche | Comportement en mode Playlist |
|--------|-------------------------------|
| **Espace** | Ajoute/retire le fichier survolé de la playlist active (toggle) |
| **Entrée** | Joue le morceau (inchangé) |
| **↑↓** | Navigation dans l'arborescence Source Data (inchangé) |
| **Tab** | Bascule entre l'arborescence Source Data et le panneau playlist |
| **Ctrl+S** | Sauvegarde le manifest |
| **Ctrl+E** | Exporte (matérialise) la playlist active |
| **F7** / **/** | Filtrer les dossiers Source Data (inchangé) |
| **Échap** | Quitte le mode Playlist → retour à la vue normale |
| **Ctrl+↑↓** | Réordonne dans le panneau playlist |

### 4.5 Layout — mode Playlist (substitution des panneaux)

```
┌─────────────────────────────────────────────────┐
│  Audio Sync Tool     ⚙️ 🔄 📋 ❓ 🎵 Playlist ←│
│                                              │
├──────────────────────────┬──────────────────────┤
│                          │  Onglets playlist:    │
│    Source Data           │ [set-summer ✅] [+]  │
│    (arborescence)        │──────────────────────│
│                          │  set-summer (24)      │
│  📂 House                │  ⬍ Paradise City.mp3 │
│  📂 2024                 │  ⬍ Another Track.mp3 │
│    ├─ track01.mp3 ●      │  ⬍ …                 │
│    ├─ Paradise City.mp3 ●│                      │
│    └─ ...                │                      │
│  📂 Techno               │──────────────────────│
│  📂 ...                  │  [💾 Sauvegarder]    │
│                          │  [📦 Exporter]       │
│                          │                      │
├──────────────────────────┴──────────────────────┤
│  ⏹ track_name.mp3    ⏪█████████████████⏩  20s │
│  Prêt. Mode Playlist — Espace pour ajouter.     │
└─────────────────────────────────────────────────┘
```

---

## 5. Flux utilisateur complet (cas nominal)

```
1. Ouvrir l'app → http://localhost:8765
2. Cliquer « 🎵 Playlist » →
   → L'interface passe en mode Playlist
   → Source Data est visible à gauche, panneau playlist vide à droite
3. Naviguer dans l'arborescence Source Data (genre/année)
4. Espace sur un morceau → il apparaît dans le panneau playlist
5. Espace sur un autre morceau → il s'ajoute à la suite
6. Cliquer sur l'onglet [+] → créer une 2e playlist « minimal-set »
7. Espace sur d'autres morceaux → ils s'ajoutent à la playlist B
8. Cliquer sur l'onglet A → revenir à la première playlist
9. Drag & drop dans le panneau = réordonner
10. Ctrl+S → sauvegarder le manifest
11. Ctrl+E → exporter (vérification, création des hard links)
12. Message : « ✓ 24 morceaux exportés vers _playlists/set-summer-2024 »
13. Dans Traktor : File > Import > Import Music Folders → sélectionner le dossier
```

---

## 6. Contraintes & Edge Cases

### 6.1 Fichiers manquants

Si un fichier a été déplacé/supprimé entre la création du manifest et l'export :
- L'export échoue avec la liste des fichiers manquants
- L'utilisateur peut :
  - **Supprimer** le fichier de la playlist
  - **Rechercher** manuellement le fichier dans Source Data

### 6.2 Doublons dans une même playlist

- Si l'utilisateur essaie d'ajouter deux fois le même fichier → refus silencieux
- Le panneau playlist ne montre jamais deux fois le même `fullPath`

### 6.3 Nom de playlist existant

- Si une playlist avec le même `name` existe déjà lors de la sauvegarde :
  - Le POST /playlists écrase silencieusement (idempotent côté serveur)
  - **C'est le frontend qui est responsable de la confirmation** : avant d'appeler POST /playlists, il vérifie si le nom existe dans `state.playlists` et affiche une modale : « Une playlist "set-summer-2024" existe déjà. Remplacer ? »
  - Si l'utilisateur refuse, le frontend lui propose de renommer

### 6.4 Export déjà existant

- Si `_playlists/<name>` existe déjà → alerte :
  « Ce dossier existe déjà. Écraser les hard links ? »
  → Oui : supprimer les fichiers puis recréer les hard links
  → Non : annuler

### 6.5 Cross-device hard links

- `os.link()` échoue si la source et la destination sont sur des **filesystems différents**
- La spec suppose que Source Data et `_playlists/` sont sur le même disque (même partition)
- Si ce n'est pas le cas, l'export doit tomber en douceur :
  - Détecter l'erreur `OSError` (errno EXDEV)
  - Proposer de faire une copie physique à la place
  - Afficher un warning : « ⚠️ Hard link impossible (disques différents). Copie physique effectuée. »

### 6.6 Métadonnées BPM

- Actuellement, le scan n'extrait pas le BPM (battements par minute) des fichiers audio
- Pour une V1, le panneau playlist affiche les métadonnées déjà disponibles (année, codec, durée)
- Le BPM pourra être ajouté dans une version ultérieure via l'analyse mutagen ou un outil externe (ex: `bpm-tools`)

### 6.7 Performance

- L'export crée N hard links (N = nombre de morceaux dans la playlist)
- Pour 200 morceaux, l'opération prend < 1 seconde
- Pas de limite de taille de playlist autre que la mémoire du navigateur pour l'affichage

---

## 7. Non-fonctionnel

- **Poids** : < 2 KB additionnel dans le manifest
- **Dépendances** : zéro (Flask uniquement, comme le reste de l'app)
- **Compatibilité** : Linux uniquement (hard links spécifiques à Unix)
- **Port** : inchangé (8765)
- **Sécurité** : pas de changement — l'app est locale

---

## 8. Résumé des décisions

| Décision | Choix |
|----------|-------|
| Intégration | Nouveau bouton + vue dédiée (remplace les 2 panneaux) |
| Source des morceaux | Source Data uniquement (dossier organisé) |
| Méthode fichier | Hard links (`os.link`) |
| Panneau playlist en cours | 3e panneau latéral à droite |
| Ordre des morceaux | Ordre de sélection, réordonnable (drag + Ctrl+↑↓) |
| Nommage playlist | Champ texte à la création |
| Stockage | Manifest JSON d'abord, export physique ensuite |
| Dossier de sortie | `_playlists/` dans Source Data |
| Raccourci ajout | Espace = toggle dans la playlist |
| Gestion des playlists | Intégrée (gestionnaire avec charger/renommer/supprimer) |
| Vérification fichiers | À l'export (signale les manquants) |
| Format export | Dossier de hard links uniquement |
| Multi-playlists simultanées | ✅ Onglets (plusieurs en construction) |
