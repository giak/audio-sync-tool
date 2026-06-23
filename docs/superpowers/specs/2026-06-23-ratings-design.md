# Track Ratings — Design Document

> Feature: Notation des morceaux sur 100, intégrée au panneau Playlist.
> Date: 2026-06-23
> Statut: Spec (pré-implantation)

---

## 1. Objectif

Permettre à l'utilisateur d'attribuer une **note de 0 à 100** à chaque morceau dans une playlist, avec édition inline et persistance globale par fichier. Les notes servent de métadonnée de qualité/classement pour un futur système de recherche/filtre.

### Problème résolu

- Actuellement, l'utilisateur n'a aucun moyen de qualifier/classer ses morceaux
- Les ID3 tags ne sont pas une option fiable (écriture risquée, formats incompatibles MP3/FLAC)
- Besoin futur : filtrer les morceaux par note + type (genre extrait du nom de dossier)

### Principe retenu

Rating = **fichier JSON global** (`data/ratings.json`) indexé par `fullPath`.
La note est attachée au fichier (pas à la playlist), ce qui permet :
- La même note dans toutes les playlists contenant ce fichier
- Le filtrage inter-playlists (futur)
- La persistance indépendante des playlists

---

## 2. Architecture

### 2.1 Stockage — `data/ratings.json`

```json
{
  "/home/giak/Music/select/style/House/2024/07 - Paradise City.mp3": 85,
  "/home/giak/Music/select/style/Techno/2025/Unknown - Track.flac": 72
}
```

- **Clé** : `fullPath` complet du fichier (identique à celui utilisé dans les playlists)
- **Valeur** : entier `0`–`100`
- **Absence du fichier** = pas de note (= non noté)
- **`0`** = note valide (peut signifier "pire" ou "à jeter")
- **Fichier créé automatiquement** au premier `PUT /ratings`

### 2.2 Nouveaux composants backend

| Fichier | Rôle |
|---------|------|
| `data/ratings.json` | Stockage persistant des notes |
| `app.py` — nouvelles routes | `GET /ratings`, `PUT /ratings` |

### 2.3 Nouveaux composants frontend

| Module | Rôle |
|--------|------|
| `static/ratings.ts` | Module CRUD des notes (loadRatings, saveRating, getRating) |
| `render.js` — `renderPlaylistTracks` | Afficher la note inline + champ edit |
| `script.js` — routage clavier | Touche **N** sur morceau focus → edit mode |
| `audio.js` ou `focus.js` | Gestion du focus sidebar en mode Playlist |
| `style.css` | Styles champ note inline |

### 2.4 Dépendances

- **Aucune nouvelle dépendance externe** — Flask + mutagen uniquement (inchangé)
- Le rating JSON < 10 KB même pour des milliers de fichiers

---

## 3. Spécifications fonctionnelles

### 3.1 Routes Flask

| Méthode | Route | Body | Retour | Description |
|---------|-------|------|--------|-------------|
| `GET` | `/ratings` | — | `{"/path/to/file.mp3": 85, ...}` | Retourne toutes les notes |
| `PUT` | `/ratings` | `{"/path/to/file.mp3": 85}` | `{"ok": true}` | Sauvegarde une note (écrasement si existant) |

#### Détail `PUT /ratings`

```python
@app.route('/ratings', methods=['PUT'])
def save_rating():
    data = request.json
    if not data or not isinstance(data, dict):
        return jsonify({'ok': False, 'error': 'Body must be a JSON object'}), 400

    ratings = load_json(RATINGS_PATH, {})

    for path, value in data.items():
        if not isinstance(value, int) or value < 0 or value > 100:
            return jsonify({'ok': False, 'error': f'Invalid rating value for {path}: {value}'}), 400
        ratings[path] = value

    save_json(RATINGS_PATH, ratings)
    return jsonify({'ok': True})
```

> **Note** : On accepte un objet complet pour permettre un batch update futur,
> mais le frontend enverra un seul `{fullPath: note}` à la fois.

### 3.2 Frontend — État (`state.ts`)

```typescript
// Ajouter à state :
ratings: Record<string, number>  // fullPath → note (0-100), chargé depuis GET /ratings
```

### 3.3 Frontend — Module `ratings.ts`

```typescript
// static/src/ratings.ts

import { api } from './api.js';
import { state } from './state.js';

/**
 * Load all ratings from server into state.ratings.
 * Called on app init (dans la fonction initApp).
 */
export async function loadRatings(): Promise<void> {
  state.ratings = await api('/ratings');
}

/**
 * Get the rating for a specific file. Returns number or undefined.
 */
export function getRating(fullPath: string): number | undefined {
  return state.ratings[fullPath];
}

/**
 * Save a single rating. Updates state.ratings optimistically.
 * Sends PUT /ratings with {fullPath: value}.
 */
export async function saveRating(fullPath: string, value: number): Promise<boolean> {
  // Validation côté client
  if (!Number.isInteger(value) || value < 0 || value > 100) return false;

  // Optimistic update
  state.ratings[fullPath] = value;

  const res = await api('/ratings', {
    method: 'PUT',
    body: JSON.stringify({ [fullPath]: value })
  });

  if (!res.ok) {
    // Rollback si échec
    delete state.ratings[fullPath];
    return false;
  }
  return true;
}

/**
 * Remove a rating (set to undefined / delete key).
 */
export async function deleteRating(fullPath: string): Promise<boolean> {
  delete state.ratings[fullPath];

  // Envoyer la clé avec valeur null pour suppression côté serveur
  // (le backend ignore les valeurs null)
  const res = await api('/ratings', {
    method: 'PUT',
    body: JSON.stringify({ [fullPath]: null })
  });
  return res.ok;
}
```

### 3.4 UI — Affichage inline dans la playlist

Chaque morceau dans le panneau Playlist affiche, en plus des métadonnées existantes :

```
┌──────────────────────────────────────────────┐
│ ⬍ Paradise City.mp3    2024  MP3 320kbps  85 │ ← note affichée en fin de ligne
│ ⬍ Another Track.flac   2025  FLAC         —  │ ← « — » si pas noté
│ ⬍ Track 3.mp3          2023  MP3 256kbps  72 │
└──────────────────────────────────────────────┘
```

#### 3.4.1 État normal

- Si `getRating(track.fullPath)` retourne une valeur : afficher `nn` en gris clair, aligné à droite
- Si pas de note : afficher `—` en gris très foncé (dim)

#### 3.4.2 Mode édition (déclenché par touche N)

Quand un morceau a le focus dans le panneau Playlist (sidebar focus) et que l'utilisateur appuie sur **N** :

1. La note affichée se transforme en `<input type="text" maxlength="3">` (ou `<input type="number" min="0" max="100">`)
2. Le champ est pré-rempli avec la valeur existante (ou vide si pas de note)
3. Le champ reçoit le focus immédiatement
4. Comportement :
   - **Entrée** → valide la note (0-100, vide = supprime) → sauvegarde via `saveRating()` → retour à l'affichage normal
   - **Échap** → annule l'édition → retour à l'affichage normal (valeur inchangée)
   - **Perte de focus** (blur) → valide automatiquement comme Entrée
   - Si la valeur entrée n'est pas un nombre valide → ignore silencieusement (annule comme Échap)
5. Pendant l'enregistrement : le champ devient readonly avec un indicateur discret (ex: texte en italique)

### 3.5 Raccourcis clavier

| Touche | Contexte | Action |
|--------|----------|--------|
| **N** | Sidebar Playlist focus, morceau focus | Active le mode édition de la note |
| **↑↓** | Sidebar Playlist focus | Navigation entre morceaux (inchangé) |
| **Tab** | Mode Playlist | Bascule Source Data ↔ Sidebar (inchangé) |
| **Ctrl+S** | Mode Playlist | Sauvegarde la playlist (inchangé) |
| **Entrée** | Dans le champ note | Valide et sauvegarde |
| **Échap** | Dans le champ note | Annule l'édition |
| **Échap** | Mode Playlist normal | Quitte le mode Playlist (inchangé) |

### 3.6 Comportement détaillé

#### Cas nominaux

1. **Noter un morceau pour la première fois**
   - Navigation ↑↓ dans le sidebar
   - N → input apparaît, taper `85` → Entrée → `saveRating()` → `85` s'affiche
   - Toast discret : « ⭐ Paradise City.mp3 noté 85/100 » (disparaît après 2s)

2. **Modifier une note existante**
   - Navigation sur un morceau déjà noté (ex: `85`)
   - N → input pré-rempli avec `85` → taper `90` → Entrée → sauvegardé

3. **Supprimer une note**
   - N → input pré-rempli → effacer le contenu → Entrée → `deleteRating()` → « — » affiché

4. **Navigation après édition**
   - Après avoir validé, le focus reste sur le même morceau
   - L'utilisateur peut continuer à naviguer avec ↑↓

#### Edge cases

| Cas | Comportement |
|-----|-------------|
| Note = 0 | Valide. Affiche `0` (zéro, pas « — ») |
| Note > 100 | Bloqué à 100 (maxlength 3 + validation) |
| Note < 0 | Bloqué à 0 (validation côté client) |
| Lettres saisies | Valeur invalide → annulation silencieuse (comme Échap) |
| Champ vide + Entrée | Supprime la note |
| Perte de focus | Valide automatiquement (même comportement que Entrée) |
| Échec réseau | Rollback optimiste, toast d'erreur « ⚠️ Note non sauvegardée » |
| Connexion perdue | La note reste dans `state.ratings` (optimistic). Au prochain `saveRating()`, retentative |
| Morceau supprimé de la playlist | La note reste dans `ratings.json` (ne pas perdre les données — le fichier peut être ré-ajouté plus tard) |

### 3.7 Affichage dans l'arborescence Source Data (mode normal)

En mode normal (pas Playlist), les fichiers dans Source Data peuvent aussi afficher leur note si elle existe :

```
📂 2024
  ├─ Paradise City.mp3       2024  MP3  3:45  [85]
  └─ Another Track.flac      2025  FLAC  5:12  [—]
```

- La note apparaît entre crochets `[nn]` ou `[—]` après les métadonnées existantes
- Pas d'édition possible dans ce mode (lecture seule)
- **Décision** : implémenter ça dans une V2, pas dans la V1 (pour garder le focus sur le mode Playlist)

### 3.8 Future — Filtre par note + type

Cette spec ne l'implémente pas, mais l'architecture est conçue pour :

```typescript
// Hypothétique future fonction de recherche :
function searchTracks(query: {
  minRating?: number,     // ex: 70
  maxRating?: number,     // ex: 100
  type?: string,          // ex: "House", "Techno" (extrait du nom de dossier)
  term?: string,          // recherche textuelle
}): Track[]
```

Le type (genre) est extrait du premier segment du `relPath` :
- `relPath: "House/2024/Paradise City.mp3"` → type = `"House"`
- L'utilisateur pourra donc filtrer : « tous les morceaux House notés ≥ 80 »

---

## 4. Flux utilisateur complet

```
1. Ouvrir l'app → http://localhost:8765
2. Cliquer « 🎵 Playlist » → mode Playlist
3. Naviguer dans Source Data, ajouter des morceaux à la playlist (Espace)
4. Tab → focus sidebar playlist
5. ↑↓ → navigation dans les morceaux de la playlist
6. N → mode édition de la note sur le morceau focus
   → Input inline apparaît, <input type="text" maxlength="3">
7. Taper "85" → Entrée → validation
   → Toast : « ⭐ Paradise City.mp3 noté 85/100 »
   → La note s'affiche en gris clair : 85
8. ↑↓ sur un autre morceau → N → "92" → Entrée
9. ↑↓ sur un morceau déjà noté → N → modifier → Entrée
10. Ctrl+S → sauvegarde de la playlist (inchangé)
11. Échap → quitte le mode Playlist (inchangé)
12. Les notes sont persistées dans data/ratings.json
13. Au prochain chargement, loadRatings() restaure toutes les notes
```

---

## 5. Structure des modifications

### 5.1 Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `app.py` | + `RATINGS_PATH`, + `GET /ratings`, + `PUT /ratings` |
| `test_app.py` | + tests pour les routes ratings |
| `static/state.ts` | + `ratings: Record<string, number>` |
| `static/ratings.ts` | **NOUVEAU** — module CRUD |
| `static/render.ts` | `renderPlaylistTracks()` — ajout affichage note + input inline |
| `static/script.ts` | + routage touche N, + gestion mode édition |
| `static/style.css` | + styles note inline + input edit |
| `static/audio.ts` | Peut-être pas de changement (le focus sidebar est déjà géré) |

### 5.2 Fichiers ajoutés

| Fichier | Rôle |
|---------|------|
| `data/ratings.json` | Persistance (créé automatiquement) |
| `static/ratings.ts` | Module CRUD frontend |
| `static/ratings.test.ts` | Tests unitaires |

---

## 6. Contraintes & Edge Cases (synthèse)

| Contrainte | Règle |
|------------|-------|
| Validation note | 0–100, entier, sinon annulation |
| Persistance | Optimistic update → rollback si échec |
| Note nulle | `—` affiché, pas `0` |
| Note 0 | `0` affiché (distinction claire avec « pas noté ») |
| Suppression note | Champ vide + Entrée, ou valeur hors limites |
| Perte réseau | Rollback, toast d'erreur |
| Morceau supprimé playlist | Note conservée dans ratings.json |
| Performance | < 10 KB pour 10 000 fichiers notés |
| Dépendances | Aucune nouvelle |

---

## 7. Non-fonctionnel

- **Poids** : < 1 KB additionnel dans le JS, < 1 KB dans le CSS
- **Dépendances** : zéro (Flask uniquement)
- **Performance** : PUT /ratings = écriture d'un fichier JSON de taille < 10 KB
- **UX** : feedback immédiat (optimistic update), pas de chargement perceptible

---

## 8. Résumé des décisions

| Décision | Choix |
|----------|-------|
| Stockage | `data/ratings.json` global (par `fullPath`) |
| Échelle | 0–100 (entier) |
| Édition | Input inline dans le panneau Playlist |
| Déclencheur | Touche **N** sur morceau focus (sidebar) |
| Validation | Entrée = valide, Échap = annule |
| Affichage par défaut | `—` si pas noté, `nn` si noté |
| Sauvegarde | Optimistic update + PUT /ratings |
| Rollback | Sur échec réseau, restaure l'état précédent |
| Note dans Source Data | V2 (hors scope V1) |
| Filtre par note + type | V2 (hors scope V1, mais l'archi le supporte) |
| Suppression note | Champ vide + Entrée |
| Nettoyage données orphelines | Aucun (les notes des fichiers supprimés restent — volontaire) |
