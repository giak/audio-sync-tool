# Interaction Map — Audio Sync Tool

> **Document de référence canonique.** Toute modification future du code doit
> être cohérente avec cette cartographie. Si un besoin modifie ces tables,
> ce document doit être mis à jour AVANT le code.

---

## 1. State Machine (Statechart)

### 1.1 États de page

```
                        ┌─────────────────────────────┐
                        │         INIT                 │
                        │   (après initApp)            │
                        └─────────────┬───────────────┘
                                      │
                        ┌─────────────▼───────────────┐
                        │       PAGE SYNC             │
                        │  state.playlistMode=false   │
                        │                             │
                        │  ┌───────────────────────┐  │
                        │  │ FOCUS ÉPARPILLÉ       │◄─┤─── Tab / clic panneau gauche
                        │  │ state.activePanel=     │  │
                        │  │        'epars'         │──┼───►
                        │  └───────────┬───────────┘  │
                        │              │ Tab / clic    │
                        │              │ panneau droit │
                        │  ┌───────────▼───────────┐  │
                        │  │ FOCUS SOURCE DATA     │  │
                        │  │ state.activePanel=     │  │
                        │  │        'source'        │  │
                        │  └───────────┬───────────┘  │
                        │              │ F7 ou /       │
                        │  ┌───────────▼───────────┐  │
                        │  │ FILTRAGE ACTIF        │  │
                        │  │ state.filterActive=    │  │
                        │  │        true            │──┼───► Échap → retour focus Source
                        │  └───────────────────────┘  │
                        │                             │
                        │  clic 🎵 Playlist           │  clic 📦 Sync
                        │  ou clic Charger playlist   │  (exitPlaylistMode)
                        │  dans le gestionnaire       │
                        └─────────┬───────────────────┘
                                  │
                        ┌─────────▼───────────────────┐
                        │      PAGE PLAYLIST          │
                        │  state.playlistMode=true    │
                        │                             │
                        │  ┌───────────────────────┐  │
                        │  │ FOCUS SOURCE          │  │
                        │  │ state.playlistFocus=   │◄─┤─── Tab
                        │  │        'source'        │  │
                        │  └───────────┬───────────┘  │
                        │              │ Tab           │
                        │  ┌───────────▼───────────┐  │
                        │  │ FOCUS SIDEBAR         │  │
                        │  │ state.playlistFocus=   │  │
                        │  │        'sidebar'       │  │
                        │  └───────────────────────┘  │
                        │                             │
                        │  F7 ou / → FILTRAGE ACTIF   │
                        └─────────────────────────────┘
```

### 1.2 États modaux (superposés, prioritaires)

```
┌──────────────────────────────────────────────────┐
│                PAS DE MODALE                      │
│         state.activeModal = null                  │
│                                                  │
│   clic Config ─────────► MODALE CONFIG           │
│   clic Raccourcis ─────► MODALE LÉGENDE          │
│   clic Journal ────────► MODALE JOURNAL          │
│   clic Gérer ──────────► MODALE PLAYLISTS        │
│   F5 (copie) ──────────► MODALE DIALOG           │
│                                                  │
│   ◄── Échap / clic backdrop / clic ✕ ──── pour toutes │
└──────────────────────────────────────────────────┘

RÈGLE : quand state.activeModal ≠ null, SEULES les touches
       Échap et Entrée (dialog) sont interceptées.
       Tout le reste est ignoré.
```

### 1.3 États audio (orthogonal, superposé)

```
┌──────────────────────┐     Enter sur fichier /     ┌──────────────────────┐
│    PAS D'AUDIO       │     clic ▶ / Espace         │    AUDIO EN COURS    │
│ currentAudio = null  │────────────────────────────►│ currentAudio ≠ null  │
│ player-bar .hidden   │                             │ player-bar visible   │
│                      │◄────────────────────────────│ .led-playing actif   │
│                      │     Échap / clic ⏹ / fin    │                      │
│                      │     naturelle / erreur      │                      │
└──────────────────────┘                             └──────────────────────┘

EFFET SUR LA NAVIGATION :
- Audio en cours  → ←→ = seek (±20s), pas de navigation colonne
- Audio en cours  → Shift+←→ = seek aussi (doublon fonctionnel)
- Audio en cours  → clic .file-row avec .led-playing = stop (cible)
```

### 1.4 États d'édition inline (rating)

```
┌──────────────────────┐    N / clic .file-rating    ┌──────────────────────┐
│   PAS D'ÉDITION      │────────────────────────────►│   ÉDITION RATING     │
│ _ratingEditActive=   │                             │ _ratingEditActive=   │
│        false          │                             │        true           │
│                      │◄────────────────────────────│                      │
│                      │    Entrée / Échap / blur    │ input remplace span  │
└──────────────────────┘                             └──────────────────────┘

EFFET : quand _ratingEditActive = true, toute autre action
        d'édition rating est bloquée (gardien en tête de fonction).
```

---

## 2. Table Événement → Réponse (exhaustive)

### Légende

| Symbole | Signification |
|---------|---------------|
| `K↓` | KeyDown (appui touche) |
| `C` | Clic souris (bouton gauche) |
| `DC` | Double-clic souris |
| `→` | La réponse du système |
| `∅` | Aucun effet (no-op silencieux) |
| `🔇` | Toast d'information (guidance) |
| `❌` | Erreur / comportement non implémenté |

---

### 2.1 PAGE SYNC — Focus Éparpillé (`state.activePanel='epars'`)

| # | Événement | Cible/sélecteur | Condition | Réponse |
|---|-----------|-----------------|-----------|---------|
| E1 | `K↓ ↑` | — | items.length > 0 | → `navigateFocus(container, -1)` |
| E2 | `K↓ ↓` | — | items.length > 0 | → `navigateFocus(container, 1)` |
| E3 | `K↓ ←` | — | audio en cours | → `seekAudio(-1)` |
| E4 | `K↓ ←` | — | pas d'audio | → ∅ (pas de navigation colonne en éparpillé) |
| E5 | `K↓ →` | — | audio en cours | → `seekAudio(1)` |
| E6 | `K↓ →` | — | pas d'audio | → ∅ |
| E7 | `K↓ Shift+←` | — | audio en cours | → `seekAudio(-1)` |
| E8 | `K↓ Shift+→` | — | audio en cours | → `seekAudio(1)` |
| E9 | `K↓ Tab` | — | — | → `setActivePanel('source')` |
| E10 | `K↓ Entrée` | `.file-row.focused` | — | → `playBtn.click()` (play/pause) |
| E11 | `K↓ Entrée` | `.directory.focused` | — | → ∅ (dossiers éparpillés pas cliquables) |
| E12 | `K↓ Entrée` | rien de focusé | — | → ∅ |
| E13 | `K↓ Espace` | `.file-row.focused` `.file.nouveau` | — | → `selectEparsFile()` (sélection) |
| E14 | `K↓ Espace` | `.file-row.focused` `.file.doublon` | — | → ∅ |
| E15 | `K↓ Espace` | `.file-row.focused` `.file.traite` | — | → ∅ |
| E16 | `K↓ Espace` | `.directory.focused` | — | → ∅ |
| E17 | `K↓ Espace` | rien de focusé | — | → ∅ |
| E18 | `K↓ F5` | — | fichier sélectionné + dossier cible | → `executeCopy()` → dialog |
| E19 | `K↓ F5` | — | pas de sélection | → status "Met d'abord en surbrillance..." |
| E20 | `K↓ F7` | — | — | → `openFilterPalette()` → FILTRAGE ACTIF |
| E21 | `K↓ /` | — | pas dans un input | → idem F7 → FILTRAGE ACTIF |
| E22 | `K↓ N` | `.file-row.focused` | `.file-rating` existe | → `startFileRatingEdit()` → ÉDITION RATING |
| E23 | `K↓ N` | rien de focusé | — | → 🔇 "↑↓ sur un fichier puis N pour noter" |
| E24 | `K↓ Échap` | — | pas de modale, pas de filtre | → si audio en cours: `stopPlayer()`, sinon ∅ |
| E25 | `K↓ Échap` | — | modale ouverte | → `closeAllModals()` |
| E26 | `K↓ Backspace` | `.focused` dans `.children` | — | → `focusItemByElement()` sur dossier parent ✅ |
| E27 | `K↓ Ctrl+L` | — | audio en cours | → focus le fichier `.led-playing` ✅ |
| E28 | `C .file-row` | fond du row | — | → `focusItemByElement()` + `stopPropagation()` ✅ |
| E29 | `C .file.nouveau` | label | — | → `selectEparsFile()` ✅ |
| E30 | `C .file.doublon` | label | — | → `focusItemByElement()` ✅ |
| E31 | `C .file.traite` | label | — | → `focusItemByElement()` ✅ |
| E32 | `C .file-rating` | span note | — | → focus row + `startSourceRatingEdit()` (si playlist source) ✅ |
| E33 | `C .play-btn` | bouton ▶ | — | → `togglePlay()` ✅ |
| E34 | `C .directory` | dossier éparpillé | — | → `focusItemByElement()` + `setActivePanel('epars')` ✅ |
| E35 | `DC .file-row` | row | — | → `playBtn.click()` ✅ |
| E36 | `C #panel-left` | fond du panneau | — | → `setActivePanel('epars')` ✅ |
| E37 | `C .file-row.led-playing` | fichier en lecture | audio en cours | → `stopPlayer()` ✅ |

### 2.2 PAGE SYNC — Focus Source Data (`state.activePanel='source'`)

| # | Événement | Cible/sélecteur | Condition | Réponse |
|---|-----------|-----------------|-----------|---------|
| S1 | `K↓ ↑` | — | items.length > 0 | → `navigateFocus(container, -1)` |
| S2 | `K↓ ↓` | — | items.length > 0 | → `navigateFocus(container, 1)` |
| S3 | `K↓ ←` | — | audio en cours | → `seekAudio(-1)` |
| S4 | `K↓ ←` | — | pas d'audio, items > 0 | → `navigateColumn(container, -1)` |
| S5 | `K↓ →` | — | audio en cours | → `seekAudio(1)` |
| S6 | `K↓ →` | — | pas d'audio, items > 0 | → `navigateColumn(container, 1)` |
| S7 | `K↓ Shift+←` | — | audio en cours | → `seekAudio(-1)` |
| S8 | `K↓ Shift+→` | — | audio en cours | → `seekAudio(1)` |
| S9 | `K↓ Tab` | — | — | → `setActivePanel('epars')` |
| S10 | `K↓ Entrée` | `.directory.focused` | — | → `toggleSourceDir()` (expand/collapse) |
| S11 | `K↓ Entrée` | `.file-row.focused` | — | → `playBtn.click()` (play/pause) |
| S12 | `K↓ Entrée` | rien de focusé | — | → ∅ |
| S13 | `K↓ Espace` | `.directory.focused` | — | → `toggleSourceDir()` (même comportement qu'Entrée) |
| S14 | `K↓ Espace` | `.file-row.focused` | — | → ∅ (pas de sélection en source data) |
| S15 | `K↓ Espace` | rien de focusé | — | → ∅ |
| S16 | `K↓ F5` | — | — | → `executeCopy()` |
| S17 | `K↓ F7` | — | — | → `openFilterPalette()` → FILTRAGE ACTIF |
| S18 | `K↓ /` | — | pas dans un input | → idem F7 |
| S19 | `K↓ N` | `.file-row.focused` | `.file-rating` existe | → `startFileRatingEdit()` → ÉDITION RATING |
| S20 | `K↓ N` | `.directory.focused` | — | → 🔇 "↑↓ sur un fichier puis N pour noter" |
| S21 | `K↓ N` | rien de focusé | — | → 🔇 "↑↓ sur un fichier puis N pour noter" |
| S22 | `K↓ Échap` | — | filtre actif | → `closeFilterPalette()` |
| S23 | `K↓ Échap` | — | audio en cours | → `stopPlayer()` |
| S24 | `K↓ Échap` | — | ni filtre ni audio | → ∅ |
| S25 | `K↓ Backspace` | `.focused` dans `.children` | — | → `focusItemByElement()` sur dossier parent ✅ |
| S26 | `K↓ Ctrl+L` | — | audio en cours | → focus le fichier `.led-playing` ✅ |
| S27 | `C .directory` | dossier | — | → `focusItemByElement()` + `toggleSourceDir()` ✅ |
| S28 | `C .file-row` | fond du row dans dossier déplié | — | → `focusItemByElement()` + `stopPropagation()` ✅ |
| S29 | `C .file-rating` | span note | — | → focus row (read-only en sync) ✅ |
| S30 | `C .play-btn` | bouton ▶ | — | → `togglePlay()` ✅ |
| S31 | `DC .file-row` | row | — | → `playBtn.click()` ✅ |
| S32 | `C #panel-right` | fond du panneau | — | → `setActivePanel('source')` ✅ |
| S33 | `C .file-row.led-playing` | fichier en lecture | audio en cours | → `stopPlayer()` ✅ |
| S34 | `K↓ Entrée` / `K↓ Espace` | `.directory` après expand | — | → `focusItemByElement()` sur premier enfant ✅ |

**Note C3 résolue** : `getItems()` pour `#source-container` retourne maintenant
`.directory` ET `.file-row`. Les fichiers dans les dossiers dépliés sont navigables
au clavier (↑↓ ←→).

### 2.3 FILTRAGE ACTIF (superposé à Page Sync ou Page Playlist)

| # | Événement | Cible/sélecteur | Condition | Réponse |
|---|-----------|-----------------|-----------|---------|
| F1 | `K↓ Échap` | — | — | → `closeFilterPalette(renderSource)` → retour focus Source |
| F2 | `K↓ ↓` | — | focus sur input filtre | → `closeFilterPalette()` + `setActivePanel('source')` |
| F3 | `K↓ Tab` | — | focus sur input filtre | → `closeFilterPalette()` + `setActivePanel('epars')` |
| F4 | `input` | `#source-filter` | — | → debounce 150ms → `state.sourceFilter` mis à jour → `renderSource()` |
| F5 | `C .directory` | dossier filtré | — | → `toggleSourceDir()` (BUG C2: pas de focus) |
| F6 | `K↓ Enter` | — | focus sur input filtre | → `closeFilterPalette()` + `setActivePanel('source')` |

### 2.4 PAGE PLAYLIST — Focus Source (`state.playlistMode=true`, `state.playlistFocus='source'`)

| # | Événement | Cible/sélecteur | Condition | Réponse |
|---|-----------|-----------------|-----------|---------|
| P1 | `K↓ ↑` | — | items > 0 | → `navigateFocus(container, -1)` |
| P2 | `K↓ ↓` | — | items > 0 | → `navigateFocus(container, 1)` |
| P3 | `K↓ Tab` | — | — | → `togglePlaylistFocus()` → FOCUS SIDEBAR |
| P4 | `K↓ Entrée` | `.file-row.focused` | — | → `playBtn.click()` (play) |
| P5 | `K↓ Entrée` | `.directory.focused` | — | → `focused.click()` → `togglePlaylistSourceDir()` |
| P6 | `K↓ Espace` | `.file-row.focused` | — | → `toggleTrackInPlaylist()` (ajoute/retire) |
| P7 | `K↓ Espace` | `.directory.focused` | — | → ∅ |
| P8 | `K↓ Espace` | rien de focusé | — | → 🔇 toast: "↑↓ pour focuser..." (cible BUG C5) |
| P9 | `K↓ ←` | — | audio en cours | → `seekAudio(-1)` |
| P10 | `K↓ →` | — | audio en cours | → `seekAudio(1)` |
| P11 | `K↓ ←` | — | pas d'audio | → `navigateColumn(container, -1)` ✅ |
| P12 | `K↓ →` | — | pas d'audio | → `navigateColumn(container, 1)` ✅ |
| P13 | `K↓ F7` | — | — | → `openFilterPalette()` → FILTRAGE ACTIF |
| P14 | `K↓ /` | — | pas dans un input | → idem F7 |
| P15 | `K↓ N` | `.file-row.focused` | — | → `startFileRatingEdit()` → ÉDITION RATING |
| P16 | `K↓ N` | `.directory.focused` | — | → 🔇 "↑↓ sur un fichier puis N pour noter" |
| P17 | `K↓ N` | rien de focusé | — | → 🔇 "↑↓ sur un fichier puis N pour noter" |
| P18 | `K↓ Échap` | — | filtre actif | → `closeFilterPalette()` |
| P19 | `K↓ Échap` | — | audio en cours | → `stopPlayer()` |
| P20 | `K↓ Ctrl+S` | — | — | → `saveCurrentPlaylist()` (sauvegarde playlist active) |
| P21 | `K↓ Ctrl+E` | — | — | → `showExportModal()` (export playlist) |
| P22 | `C .file-row` | fond du row | — | → `focusItemByElement()` + `stopPropagation()` ✅ |
| P23 | `C .directory` | dossier | — | → `focusItemByElement()` + `togglePlaylistSourceDir()` ✅ |
| P24 | `C .file-rating` | span note | — | → focus row + `startSourceRatingEdit()` ✅ |
| P25 | `C .play-btn` | bouton ▶ | — | → `togglePlay()` ✅ |
| P26 | `DC .file-row` | row | — | → `playBtn.click()` ✅ |

### 2.5 PAGE PLAYLIST — Focus Sidebar (`state.playlistFocus='sidebar'`)

| # | Événement | Cible/sélecteur | Condition | Réponse |
|---|-----------|-----------------|-----------|---------|
| PS1 | `K↓ ↑` | — | tracks > 0 | → focus piste précédente (manuel, boucle for) |
| PS2 | `K↓ ↓` | — | tracks > 0 | → focus piste suivante |
| PS3 | `K↓ Tab` | — | — | → `togglePlaylistFocus()` → FOCUS SOURCE |
| PS4 | `K↓ Entrée` | `.pl-track.focused` | — | → ∅ (pas de play depuis sidebar actuellement) |
| PS5 | `K↓ Espace` | — | — | → ∅ |
| PS6 | `K↓ Suppr` | `.pl-track.focused` | — | → `removeTrack()` + `patchPlaylistSourceFile()` |
| PS7 | `K↓ Backspace` | `.pl-track.focused` | — | → idem Suppr (retirer piste) |
| PS8 | `K↓ N` | `.pl-track.focused` | — | → `startRatingEdit()` → ÉDITION RATING |
| PS9 | `K↓ N` | rien de focusé | — | → 🔇 "↑↓ sur une piste puis N pour noter" |
| PS10 | `K↓ Ctrl+↑` | `.pl-track.focused` | — | → `moveTrackInPlaylist(-1)` |
| PS11 | `K↓ Ctrl+↓` | `.pl-track.focused` | — | → `moveTrackInPlaylist(1)` |
| PS12 | `K↓ Ctrl+S` | — | — | → `saveCurrentPlaylist()` |
| PS13 | `K↓ Ctrl+E` | — | — | → `showExportModal()` |
| PS14 | `K↓ ←` | — | audio en cours | → `seekAudio(-1)` |
| PS15 | `K↓ →` | — | audio en cours | → `seekAudio(1)` |
| PS16 | `K↓ F7` | — | — | → `openFilterPalette()` |
| PS17 | `K↓ /` | — | pas dans un input | → idem F7 |
| PS18 | `K↓ Échap` | — | audio en cours | → `stopPlayer()` |
| PS19 | `K↓ Échap` | — | filtre actif | → `closeFilterPalette()` |
| PS20 | `C .pl-track` | fond de la piste | — | → `.focused` + `state.playlistTrackFocusIndex` ✅ |
| PS21 | `C .pl-track-rating` | span note | — | → focus `.pl-track` parent + `startRatingEdit()` ✅ |
| PS22 | `C .pl-track-remove` | bouton ✕ | — | → `removeTrack()` + `renderPlaylistPanel()` ✅ |
| PS23 | `C .pl-track-name` | nom de la piste | — | → `.focused` sur `.pl-track` ✅ |
| PS24 | `DC .pl-track` | piste | — | → `togglePlay()` ✅ |
| PS25 | Drag `.pl-track` | drag handle | — | → `ondragstart` → réorganisation par drag&drop ✅ |
| PS26 | Drop `.pl-track` | cible | — | → `reorderTrack()` + `renderPlaylistPanel()` ✅ |

### 2.6 MODALE OUVERTE (quel que soit le type)

| # | Événement | Cible | Condition | Réponse |
|---|-----------|-------|-----------|---------|
| M1 | `K↓ Échap` | — | — | → `closeAllModals()` |
| M2 | `C .modal-backdrop` | backdrop | — | → `closeAllModals()` |
| M3 | `C .modal-close` | bouton ✕ | — | → `closeAllModals()` |
| M4 | `K↓ Entrée` | — | modal = dialog | → exécute l'action du bouton confirm |
| M5 | Toute autre touche | — | — | → ∅ (bloqué) |

### 2.7 ÉDITION RATING (superposé, `_ratingEditActive=true`)

| # | Événement | Cible | Condition | Réponse |
|---|-----------|-------|-----------|---------|
| R1 | `K↓ Entrée` | input rating | — | → `commit()` → sauvegarde note → `finish()` |
| R2 | `K↓ Échap` | input rating | — | → `cancel()` → annule → `finish()` |
| R3 | `blur` | input rating | — | → `commit()` → sauvegarde → `finish()` |
| R4 | `K↓ N` | — | — | → ∅ (bloqué par `_ratingEditActive`) |
| R5 | Tout autre `K↓` | — | — | → ∅ (input capture tout) |

---

## 3. Analyse KLM — Workflows fréquents

### Constantes

| Opérateur | Temps | Description |
|-----------|-------|-------------|
| **K** | 0.28s | Appui touche (keystroke) |
| **P** | 1.10s | Pointage souris + clic |
| **H** | 0.40s | Homing (main clavier→souris ou souris→clavier) |
| **M** | 1.20s | Opération mentale (décider, chercher visuellement) |

### Workflow 1 : Copier un fichier (F5) — méthode full clavier

```
But : copier un fichier .nouveau de l'éparpillé vers un dossier source data

Méthode :
  M   Chercher visuellement le fichier dans éparpillé           1.20s
  2K  ↑↓ pour focuser le fichier                                 0.56s
  K   Espace pour sélectionner                                   0.28s
  K   Tab → panneau droit                                        0.28s
  M   Chercher visuellement le dossier destination               1.20s
  4K  ↑↓ pour focuser le dossier                                 1.12s
  K   F5 → dialog                                                0.28s
  K   Entrée → confirmer                                         0.28s
  ─────────────────────────────────────────────────────────
  TOTAL                                                          5.20s
```

### Workflow 2 : Noter un fichier — méthode clavier

```
But : attribuer une note 85 à un fichier

Méthode :
  M   Chercher visuellement le fichier                           1.20s
  3K  ↑↓ pour focuser le fichier                                 0.84s
  K   N → ouvrir l'input                                         0.28s
  2K  "8" "5"                                                    0.56s
  K   Entrée → valider                                           0.28s
  ─────────────────────────────────────────────────────────
  TOTAL                                                          3.16s
```

### Workflow 3 : Ajouter un morceau à la playlist

```
But : ajouter un fichier depuis l'arbre source à la playlist active

Méthode :
  M   Décider d'ajouter ce fichier                               1.20s
  K   Espace (si déjà focusé)                                    0.28s
  ─────────────────────────────────────────────────────────
  TOTAL (fichier déjà focusé)                                    1.48s

  Si pas focusé :
  M   Chercher le fichier                                        1.20s
  4K  ↑↓                                                         1.12s
  K   Espace                                                     0.28s
  ─────────────────────────────────────────────────────────
  TOTAL (navigation + ajout)                                     2.60s
```

### Workflow 4 : Filtrer et naviguer l'arbre source

```
But : trouver un dossier spécifique dans une grande arborescence

Méthode (F7) :
  K   F7 → ouvrir palette filtre                                  0.28s
  3K  taper "roc"                                                 0.84s
  M   Chercher visuellement dans les résultats                    1.20s
  2K  ↓ pour focuser le dossier                                   0.56s
  K   Entrée → expand                                             0.28s
  ─────────────────────────────────────────────────────────
  TOTAL                                                           3.16s

Comparaison méthode souris (scroll manuel) :
  H   Main souris                                                 0.40s
  M   Chercher visuellement                                       1.20s
  P   Scroll + pointer + clic expand                              1.10s
  H   Retour clavier                                              0.40s
  ─────────────────────────────────────────────────────────
  TOTAL                                                           3.10s

→ Équivalent. Le filtre clavier est plus rapide sur de grandes arborescences
  (>50 dossiers), la souris sur de petites (<20 dossiers visibles).
```

### Workflow 5 : Passage Sync → Playlist → Sync

```
Méthode actuelle (clic toolbar) :
  H   Main souris                                                 0.40s
  P   Pointer + clic 🎵 Playlist                                  1.10s
  [action dans Playlist...]
  P   Pointer + clic 📦 Sync                                      1.10s
  H   Retour clavier                                              0.40s
  ─────────────────────────────────────────────────────────
  TOTAL transition pure                                           3.00s

Méthode optimisée (raccourci clavier) :
  K   Ctrl+Shift+P (ou autre) → Playlist                          0.28s
  [action...]
  K   Ctrl+Shift+S → Sync                                         0.28s
  ─────────────────────────────────────────────────────────
  TOTAL transition pure                                           0.56s

Gain : 2.44s par aller-retour (81% d'amélioration)
Recommandation : ajouter un raccourci clavier pour basculer entre pages.
```

---

## 4. Table des bugs et frictions — mapping vers le rapport de stabilisation

| ID | Description | Section(s) concernée(s) | Priorité |
|----|-------------|------------------------|----------|
| C1 | Clic `.file-row` ne focus pas | E28, S28, P22 | P0 | ✅ Résolu |
| C2 | Clic `.directory` ne focus pas | E34, S27, P23 | P0 | ✅ Résolu |
| C3 | `getItems()` ignore `.file-row` dans source | S1-S2, S4-S6 | P0 | ✅ Résolu |
| C4 | Clic `.pl-track` ne focus pas | PS20, PS23 | P0 | ✅ Résolu |
| C5 | Espace sans focus = silencieux | P8 | P1 | ✅ Résolu |
| C6 | N dans source data ne trouve rien | S19-S21 | P0 | ✅ Résolu (C3 + startSourceRatingEdit) |
| I1 | renderAll après notation → flicker | R3 (afterSave) | P1 | ✅ Résolu (patch DOM ciblé) |
| I2 | Focus sidebar perdu après render | PS1-PS2 | P1 | ✅ Résolu (playlistTrackFocusIndex) |
| I3 | Clic `.file.doublon/.traite` = rien | E30-E31 | P1 | ✅ Résolu |
| I4 | closeFilterPalette efface sourceExpanded | F1 (section 2.3) | P1 | ✅ Résolu (sourceManuallyExpanded) |
| I5 | Double-clic = rien | E35, S31, P26, PS24 | P1 | ✅ Résolu (ondblclick → play) |
| I6 | Clic fichier en lecture ne stoppe pas | E37, S33 | P1 | ✅ Résolu |
| I7 | Pas de Ctrl+L | E27, S26 | P1 | ✅ Résolu |
| A2 | Pas d'auto-focus après expand | S34 | P2 | ✅ Résolu |
| A5 | Pas de Backspace = parent | E26, S25 | P2 | ✅ Résolu |
| A6 | CSS `:active` absent | — | P2 | ✅ Résolu |
| A7 | Pas de menu contextuel | — | P3 | ✅ Résolu |
| A8 | Pas de sélection multiple | — | P3 | ✅ Résolu |
| A9 | Pas de drag & drop | — | P3 | ✅ Résolu |
| A10 | Scroll position perdue | — | P2 | ✅ Résolu |
| A11 | Pas de navigateColumn en playlist | P11-P12 | P2 | ✅ Résolu |
| A12 | Pas d'historique navigation | — | P3 | ✅ Résolu |

---

## 5. Règles de conception (invariants)

Ces règles doivent rester vraies après toute modification du code :

1. **Bidirectionnalité souris↔clavier** : tout clic sur un élément focusable doit
   appeler `focusItemByElement()`. Toute navigation clavier doit rendre l'élément
   cliquable avec le même effet.

2. **Un seul `.focused` par conteneur** : `focusItemByElement()` et
   `focusItemByPath()` nettoient toujours les `.focused` existants avant
   d'en ajouter un nouveau.

3. **FocusPath persistant** : `state.eparsFocusPath` et `state.sourceFocusPath`
   survivent aux re-renders. `revalidateFocus()` les restaure après `renderAll()`.

4. **Modale = isolation** : quand `state.activeModal ≠ null`, seules les touches
   Échap et Entrée (dialog) sont traitées. Tout le reste est bloqué.

5. **Audio = priorité ←→** : quand `isAudioPlaying()`, les touches ←→ font du
   seek, pas de la navigation colonne.

6. **Rating = exclusif** : une seule édition de note à la fois (`_ratingEditActive`).

7. **Pas de perte d'état au changement de page** : `exitPlaylistMode()` sauvegarde
   les playlists modifiées. `enterPlaylistMode()` restaure l'état.

8. **Pas de re-render inutile** : préférer les patches DOM ciblés
   (`patchEparsFileAfterCopy`, `patchSourceFileAfterCopy`, `patchPlaylistSourceFile`)
   plutôt que `renderAll()`.
