# UX Stabilization Audit — Audio Sync Tool

> **Double-check approfondi** : simulation manuelle de chaque parcours utilisateur,
> traçage ligne à ligne dans `script.ts`, `focus.ts`, `render.ts`, `audio.ts`.
> Ce document remplace la v1 du 2026-06-23.

## 0. Résumé exécutif

**Problème principal** : le clic souris sur un fichier/dossier ne met pas le focus
clavier. La navigation est entièrement clavier (↑↓ Tab ←→), mais aucun `.file-row`
n'a de `row.onclick`. Seul le label `.file.nouveau` dans l'éparpillé a un `onclick`
(→ `selectEparsFile()` qui, lui, appelle bien `focusItemByElement`). Les fichiers
`.doublon`, `.traite`, et **tous** les fichiers dans l'arbre Source Data (normal ET
playlist) n'ont **aucun handler clic**.

**Impact** : l'utilisateur clique sur un morceau, visuellement rien ne change, puis
↑↓ redémarre à l'élément 0. **Pire :** dans le panneau source data, cliquer sur un
fichier ne sert littéralement à rien — pas de focus, pas de play, pas de sélection.
Silence total.

**Solution** : ajouter `onclick` sur chaque `.file-row` et `.directory` pour appeler
`focusItemByElement()`, rendant le focus souris ↔ clavier bidirectionnel.

---

## 1. Architecture actuelle des interactions

### 1.1 Système de focus (focus.ts)

```
État : state.eparsFocusPath / state.sourceFocusPath (string | null)
Focus DOM : classe .focused sur l'élément
Navigation clavier : ↑↓ (navigateFocus) / ←→ (navigateColumn, source uniquement)
Révalidation : focusItemByPath() après renderAll() via double rAF
```

**Note importante** : `getItems()` pour `#source-container` ne retourne que les
`.directory` — pas les `.file-row`. Les fichiers dans les dossiers dépliés sont
invisibles pour la navigation ←→. Seuls les dossiers sont navigables en colonnes.

### 1.2 Conteneurs et leurs éléments focusables

| Page | Panneau | Conteneur | Éléments focusables | Navigation |
|------|---------|-----------|---------------------|------------|
| Sync | Éparpillé | `#epars-container` | `.file-row`, `.directory` | ↑↓ Tab |
| Sync | Source Data | `#source-container` | `.directory` uniquement | ↑↓ ←→ Tab |
| Playlist | Source | `#playlist-source-container` | `.file-row`, `.directory` | ↑↓ Tab |
| Playlist | Sidebar | `#playlist-tracks` | `.pl-track` (manuel, pas via focus.ts) | ↑↓ Tab |

**Friction F0** : la navigation sidebar playlist est **manuelle** (boucle `for` dans
le handler clavier de `script.ts`), elle n'utilise pas `focus.ts`. Elle ne sauvegarde
aucun `focusPath`. Après `renderPlaylistPanel()`, le focus est perdu.

### 1.3 Interactions souris existantes — table de vérité

| Élément | Clic | Fonctionne ? | Détail |
|---------|------|-------------|--------|
| `.play-btn` | Lecture/pause | ✅ | `togglePlay()` |
| `.file.nouveau` (éparpillé) | Sélection pour copie | ✅ | `selectEparsFile()` → `.selected` + `focusItemByElement()` |
| `.file.doublon` / `.file.traite` (éparpillé) | Rien | ❌ | Aucun `onclick` |
| `.file-row` fond (éparpillé) | Rien | ❌ | Aucun `onclick` sur le row |
| `.directory` (source) | Expand/collapse | ⚠️ | `toggleSourceDir()` mais pas de `focusItemByElement()` |
| `.file-row` dans source data (normal) | Rien | ❌ | Aucun handler, même pas play |
| `.file-row` dans source data (playlist) | Rien | ❌ | Idem |
| `.file-rating` | Édition inline note | ✅ | `startFileRatingEdit()` |
| `.pl-track` fond (sidebar) | Rien | ❌ | Seuls les sous-éléments réagissent |
| `.pl-track-rating` | Édition inline note | ✅ | Focus le parent `.pl-track` + `startRatingEdit()` |
| `.pl-track-remove` | Retirer morceau | ✅ | |
| `.pl-track-name` | Rien | ❌ | |
| `.pl-tab` | Changer playlist | ✅ | |
| `.page-btn` | Navigation Sync/Playlist | ✅ | |
| Panneau (fond) | Change panel actif | ✅ | `setActivePanel()` |

---

## 2. Simulations — Parcours utilisateur complets

### 2.1 WORKFLOW A : Nouvel utilisateur, Sync simple

```
1. Ouvre l'app → page Sync, panneaux vides (pas encore de scan)
2. Clic ⚙️ Config → modal ✅
3. Remplit dossiers, Sauvegarde ✅
4. Clic 🔄 Scan → barre de progression, fichiers apparaissent ✅
5. Regarde le panneau gauche (Éparpillé)
6. CLIC sur un fichier ● bleu → le label est "sélectionné" (contour bleu)
   ✅ selectEparsFile() → .selected + focusItemByElement() + setActivePanel()
   MAIS : seul le texte change, pas le fond du row → feedback subtil ⚠️
7. Appuie sur ↓ → va au fichier suivant ✅ (car focusItemByElement a été appelé)
8. Tab → passe au panneau droit ✅
9. ↑↓ sur les dossiers → focus visuel (fond highlight) ✅
10. Entrée sur un dossier → expand ✅
11. CLIC sur un fichier dans le dossier déplié → RIEN ❌
    L'utilisateur s'attend à ce que le clic focus le fichier, ou le joue.
    Rien ne se passe. Frustration.
12. Appuie sur ↓ → le focus va au dossier suivant (pas au fichier)
    car getItems() pour source-container ignore les .file-row ❌
13. L'utilisateur ne comprend pas pourquoi ↑↓ ignore les fichiers
14. Retour au panneau gauche (Tab), trouve un fichier ●, Espace → sélection ✅
15. Tab → panneau droit, ↑↓ sur dossier destination, F5 → dialog ✅
16. Entrée → copie ✅. Status: "✓ fichier copié vers ..."
```

**Frictions du workflow A** :
- **F1** : Clic sur fichier dans source data → rien (le plus gros problème)
- **F2** : ↑↓ dans source data ignore les fichiers dans les dossiers dépliés
- **F3** : Le feedback de sélection (`.selected` sur le label) est trop subtil
- **F4** : Après expand d'un dossier, aucun enfant n'est auto-focusé

### 2.2 WORKFLOW B : Power user, copy rapide

```
1. Page Sync, déjà scannée
2. ↑↓ dans éparpillé pour trouver un fichier ● → .focused ✅
3. Clic sur un AUTRE fichier ● (sans utiliser ↑↓) → .selected mais
   le système de focus clavier n'est pas mis à jour pour le row ⚠️
   (Correction : selectEparsFile appelle focusItemByElement, donc si
   on clique sur le label .file.nouveau, le focus est mis. Mais si on
   clique sur le row sans atteindre le label, rien.)
4. Tab → panneau droit ✅
5. ↑↓ rapide pour trouver le dossier → .focused ✅
6. F5 → dialog ✅
7. Entrée → copie ✅
8. Le fichier copié passe de ● à ○ (patchEparsFileAfterCopy) ✅
9. MAIS l'utilisateur voit maintenant le fichier ○ (doublon) et veut
   quand même le focuser pour voir ses métadonnées → clic → rien ❌
```

**Frictions du workflow B** :
- **F5** : Après copie, le fichier devenu ○ n'est plus cliquable
- **F6** : Pas de feedback sonore ou animé à la copie

### 2.3 WORKFLOW C : Découverte Playlist

```
1. Clic 🎵 Playlist dans la toolbar ✅
2. Layout change : source data à gauche, sidebar à droite ✅
3. CLIC sur un fichier dans l'arbre source → RIEN ❌
   L'utilisateur pensait que le clic ajouterait à la playlist, ou au
   moins focuserait. Rien ne se passe. Aucun feedback.
4. Essaie ↑↓ → focus fonctionne ✅
5. Espace sur un fichier focusé → ajouté à la playlist ✅
   Toast "➕ fichier ajouté" apparaît 3 secondes
6. Le fichier dans l'arbre reçoit ✅ vert (in-playlist) ✅
7. Regarde le sidebar → le morceau est bien là ✅
8. Tab → focus sidebar ✅
9. ↑↓ pour naviguer les pistes → OK ✅
10. CLIC sur une piste (le nom) → RIEN ❌
    L'utilisateur s'attend à ce que le clic focus la piste ou la joue.
11. CLIC sur la note (— ou nombre) → input inline ✅
    MAIS ce focus est manuel (pas via focus.ts), pas de focusPath sauvegardé
12. Tape 85, Entrée → note sauvegardée, renderPlaylistPanel() est appelé ✅
    MAIS le sidebar est re-rendu (innerHTML), le focus est perdu ⚠️
13. Retour à Sync (📦) → renderAll(), le focusPath est restauré ✅
```

**Frictions du workflow C** :
- **F7** : Clic sur fichier dans source playlist → rien (ajout/retrait seulement au clavier)
- **F8** : Clic sur `.pl-track` → rien (ni focus, ni play)
- **F9** : Après notation, le sidebar re-render → perte de focus
- **F10** : Après notation dans l'arbre source, `renderAll()` → flicker visible
- **F11** : Le toast "ajouté" masque le hint normal pendant 3s

### 2.4 WORKFLOW D : Notation intensive

```
1. Page Sync, l'utilisateur veut noter plein de fichiers
2. ↑↓ sur un fichier → focus ✅
3. N → rien (si fichier dans source data, car getItems ignore .file-row
   pour la navigation ↑↓, mais N cherche `.file-row.focused` dans le
   container actif. Le fichier doit d'abord être focusé via ↑↓.)
   En pratique : ↑↓ dans éparpillé → focus OK → N → input ⚠️
   Mais dans source data, ↑↓ ne focus que les dossiers, donc N sur un
   fichier dans source data ne fonctionne PAS (pas de .file-row.focused)
4. Clic sur — (note) → input ✅
5. Tape 75, Entrée → renderAll() → TOUT re-render ⚠️
   → flicker visuel, scroll position perdue, focus réappliqué
6. L'utilisateur veut noter le fichier suivant → doit refaire ↑↓
   car le focus a été restauré mais le fichier noté n'est plus focusé
```

**Frictions du workflow D** :
- **F12** : N dans source data ne fonctionne pas (fichiers pas navigables)
- **F13** : `renderAll()` après notation → flicker + perte de contexte
- **F14** : Impossible de noter plusieurs fichiers rapidement à la suite

### 2.5 WORKFLOW E : Audio + navigation simultanée

```
1. Clic ▶ sur un fichier → lecture ✅, barre audio apparaît ✅
2. LED cyan (.led-playing) sur le fichier en cours ✅
3. ↑↓ pour naviguer ailleurs pendant la lecture → focus bouge ✅
4. ←→ → seek audio ±20s ✅ (quand audio joue)
5. Le fichier en lecture est hors de vue (scrollé) → la LED cyan est
   toujours active mais invisible
6. L'utilisateur veut retrouver le fichier en cours de lecture →
   pas de raccourci pour y aller ❌
7. CLIC sur le fichier en lecture (s'il le retrouve) → rien ❌
   L'utilisateur s'attend à ce que le clic stoppe la lecture
8. Clic ⏹ dans la barre audio → stop ✅
```

**Frictions du workflow E** :
- **F15** : Pas de raccourci pour focuser le fichier en cours de lecture
- **F16** : Clic sur fichier en lecture ne stoppe pas
- **F17** : LED cyan peut être hors écran sans indication

### 2.6 WORKFLOW F : Filtrage (F7)

```
1. Page Sync, panneau source data
2. F7 → palette de filtre flottante ✅
3. Tape "rock" → dossiers filtrés, les dossiers correspondants sont
   auto-expandés (dirHasMatchingDescendant) ✅
4. ↑↓ navigue les dossiers filtrés ✅
5. Échap → ferme le filtre, sourceExpanded.clear() ⚠️
   → TOUS les dossiers sont collapse, même ceux manuellement expand
6. L'utilisateur avait expand "Rock/" manuellement avant le filtre →
   maintenant tout est refermé. Perte de contexte.
```

**Frictions du workflow F** :
- **F18** : `closeFilterPalette()` efface `sourceExpanded` → perte des expands manuels
- **F19** : Après filtrage, les fichiers dans les dossiers filtrés ne sont pas focusables (↑↓ ignore .file-row)

---

## 3. Classification complète des frictions

### 3.1 CRITIQUES 🔴 (cassent l'expérience, bloquent l'utilisateur)

| ID | Friction | Cause racine | Scénario |
|----|----------|-------------|----------|
| **C1** | Clic sur `.file-row` ne focus pas | Pas de `row.onclick` dans `makeFileEl()` | A, B, C, D |
| **C2** | Clic sur `.directory` ne focus pas | `dirEl.onclick` fait juste `toggle()`, pas de `focusItemByElement()` | A, C |
| **C3** | ↑↓ dans source data ignore les fichiers dans les dossiers dépliés | `getItems('#source-container')` ne retourne que `.directory` | A, D |
| **C4** | Clic sur `.pl-track` ne focus pas | Pas de handler sur .pl-track (sauf enfants) | C |
| **C5** | Espace dans playlist source sans fichier focusé = silencieux | `toggleTrackInPlaylist()` check `.focused` → rien si aucun | C |
| **C6** | N dans source data ne trouve pas de `.file-row.focused` | Car ↑↓ ne focus pas les .file-row dans source-container | D |

### 3.2 IMPORTANTS 🟠 (dégradent fortement l'expérience)

| ID | Friction | Cause racine | Scénario |
|----|----------|-------------|----------|
| **I1** | `renderAll()` après notation → flicker + perte scroll | `innerHTML = ''` reconstruit tout | D |
| **I2** | Focus sidebar perdu après `renderPlaylistPanel()` | innerHTML remplacé, pas de sauvegarde focusPath | C |
| **I3** | Clic sur `.file.doublon` / `.file.traite` → rien | `onclick` seulement sur `.file.nouveau` dans `renderEpars()` | B |
| **I4** | `closeFilterPalette()` efface `sourceExpanded` | `state.sourceExpanded.clear()` | F |
| **I5** | Double-clic ne fait rien nulle part | Aucun `ondblclick` | A, C |
| **I6** | Clic sur fichier en lecture ne stoppe pas | Pas de check `.led-playing` dans le handler clic | E |
| **I7** | Pas de retour au fichier en cours de lecture | Pas de Ctrl+L / F3 | E |

### 3.3 AMÉLIORATIONS 🟡 (confort, fluidité)

| ID | Friction | Cause racine | Scénario |
|----|----------|-------------|----------|
| **A1** | Feedback `.selected` trop subtil | Fond du row pas highlighté, seul le label | A |
| **A2** | Pas d'auto-focus premier enfant après expand | `toggleSourceDir()` ne focus rien après expand | A |
| **A3** | Toast masque le hint normal 3 secondes | `showToast()` bloque le status-text | C |
| **A4** | Impossible de collapser tout | Pas de touche "Collapse all" | F |
| **A5** | Pas de Backspace = dossier parent | Pas de handler | A |
| **A6** | Pas de `:active` CSS sur les rows | Pas de feedback visuel au clic | A, B, C |
| **A7** | Pas de menu contextuel (clic droit) | Aucun handler | - |
| **A8** | Pas de sélection multiple | Un seul `.selected` à la fois | B |
| **A9** | Pas de drag & drop fichier→dossier | F5 + dialog uniquement | B |
| **A10** | Scroll position non restaurée après renderAll | Pas de sauvegarde scrollTop | D |
| **A11** | Navigation ←→ absente en mode Playlist source | Handler clavier playlist n'a pas navigateColumn | C |
| **A12** | Pas d'historique de navigation (back/forward) | Pas de stack de focusPath | F |

---

## 4. Solutions — Plan de stabilisation

### 4.1 PHASE 1 :Critique (P0) — Click-to-focus universel

#### Fix C1 : `makeFileEl()` → `row.onclick`

```typescript
// Dans makeFileEl(), après avoir créé le row :
row.onclick = (e: MouseEvent) => {
  // Ne pas intercepter les clics sur les sous-boutons
  if ((e.target as HTMLElement).closest('.play-btn, .file-rating')) return;

  // Trouver le conteneur parent
  const container = row.closest(
    '#epars-container, #source-container, #playlist-source-container'
  ) as HTMLElement | null;
  if (!container) return;

  // Focus
  focusItemByElement(container, row);

  // Synchroniser le panneau actif
  if (container.id === 'epars-container') setActivePanel('epars');
  else setActivePanel('source');

  // Si .nouveau dans éparpillé → sélectionner
  const fileLabel = row.querySelector('.file.nouveau') as HTMLElement | null;
  if (fileLabel && container.id === 'epars-container') {
    const filename = fileLabel.dataset.filename || '';
    const eparDir = fileLabel.dataset.epardir || '';
    // selectEparsFile appelle déjà focusItemByElement + setActivePanel,
    // donc ci-dessus est redondant mais inoffensif
    selectEparsFile(fileLabel, filename, eparDir);
  }

  // Si en cours de lecture → stop
  if (row.querySelector('.led-playing')) {
    // Importé depuis audio.ts
    stopPlayer();
  }
};
```

#### Fix C2 : `dirEl.onclick` → focus avant toggle

Dans `renderDirTree()`, `buildSourceChildren()`, `renderFilteredDirNode()` :

```typescript
// Remplacer dirEl.onclick = () => toggle(fullPath);
// par :
dirEl.onclick = () => {
  const container = dirEl.closest(
    '#source-container, #playlist-source-container, #epars-container'
  ) as HTMLElement | null;
  if (container) {
    focusItemByElement(container, dirEl);
    if (container.id === 'epars-container') setActivePanel('epars');
    else setActivePanel('source');
  }
  toggle(fullPath);
};
```

#### Fix C3 : `getItems()` pour source-container → inclure les `.file-row`

```typescript
// Dans focus.ts, getItems() :
export function getItems(container: HTMLElement): NodeListOf<Element> {
  // Inclure les fichiers dans les dossiers dépliés
  return container.querySelectorAll('.directory, .file-row');
}
```

**Attention** : ce changement impacte `navigateFocus()` et `navigateColumn()`.
Les fichiers dans les dossiers dépliés deviendront navigables au clavier.
C'est le comportement attendu. Les fichiers hors dossiers dépliés (enfants
non rendus dans le DOM) restent inaccessibles — c'est OK.

#### Fix C4 : `.pl-track` onclick → focus

```typescript
// Dans renderPlaylistTracks(), après innerHTML :
container.querySelectorAll('.pl-track').forEach(el => {
  (el as HTMLElement).onclick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(
      '.pl-track-remove, .pl-track-rating, .pl-drag-handle'
    )) return;
    const tracksContainer = document.getElementById('playlist-tracks');
    if (tracksContainer) {
      tracksContainer.querySelectorAll('.pl-track.focused')
        .forEach(f => f.classList.remove('focused'));
    }
    el.classList.add('focused');
  };
});
```

#### Fix C5 : Toast guidance quand Espace sans fichier focusé

```typescript
// Dans toggleTrackInPlaylist(), après le check .focused :
if (!focused?.classList.contains('file-row')) {
  showToast('ℹ️ ↑↓ pour focuser un fichier, puis Espace pour ajouter/retirer.');
  return;
}
```

#### Fix C6 : N dans source data → corrigé par C3

Une fois que C3 permet à ↑↓ de focuser les `.file-row` dans source data,
le handler N existant fonctionnera. Le code est déjà correct :
```typescript
const focused = document.querySelector(`${container} .file-row.focused`);
```

### 4.2 PHASE 2 : Important (P1) — Confort immédiat

#### Fix I1 : Remplacer `renderAll()` par un patch DOM ciblé après notation

```typescript
// Dans _doRatingEdit(), afterSave :
// Au lieu de renderAll(), faire un patch local :
function finish(): void {
  _ratingEditActive = false;
  // Mettre à jour juste le span au lieu de re-render
  const newRating = getRating(fullPath);
  const span = document.createElement('span');
  span.className = ratingSpan.className; // 'file-rating' ou 'pl-track-rating'
  span.dataset.fullpath = fullPath;
  span.textContent = newRating !== undefined ? String(newRating) : '—';
  span.title = 'Cliquer pour noter (0-100)';
  span.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    startFileRatingEdit(fullPath, span);
  };
  input.replaceWith(span);
  // Pas de renderAll() → pas de flicker, pas de perte de focus
}
```

#### Fix I2 : Sauvegarder/restaurer le focus sidebar

```typescript
// Ajouter dans state.ts :
playlistTrackFocusIndex: number | null;

// Dans le handler ↑↓ playlist sidebar, après avoir focusé une piste :
state.playlistTrackFocusIndex = newIdx;

// Dans renderPlaylistTracks(), après innerHTML, restaurer :
if (state.playlistTrackFocusIndex !== null && tracks.length > 0) {
  const idx = Math.min(state.playlistTrackFocusIndex, tracks.length - 1);
  const trackEls = container.querySelectorAll('.pl-track');
  if (trackEls[idx]) trackEls[idx].classList.add('focused');
}
```

#### Fix I3 : `onclick` sur tous les `.file` dans `renderEpars()`

```typescript
// Dans renderEpars(), au lieu de :
// if (status === 'nouveau') { label2.onclick = ... }
// Faire pour tous :
label2.onclick = () => {
  const row = label2.closest('.file-row') as HTMLElement | null;
  const cont = document.getElementById('epars-container');
  if (row && cont) focusItemByElement(cont, row);
  if (status === 'nouveau') {
    selectEparsFile(label2, filename, dirPath);
  }
};
```

#### Fix I4 : Préserver `sourceExpanded` manuels après filtrage

```typescript
// Ajouter dans state.ts :
sourceManuallyExpanded: Set<string>; // survit au filtre

// Dans toggleSourceDir(), quand on expand :
if (!existingChildren) {
  state.sourceManuallyExpanded.add(dirPath);
  // ...
}

// Dans closeFilterPalette(), au lieu de :
// state.sourceExpanded.clear();
// Faire :
state.sourceExpanded = new Set(state.sourceManuallyExpanded);
```

#### Fix I5 : Double-clic = play

```typescript
// Dans makeFileEl() :
row.ondblclick = () => {
  const playBtn = row.querySelector('.play-btn') as HTMLElement | null;
  playBtn?.click();
};

// Dans renderPlaylistTracks() :
trackEl.ondblclick = () => {
  // Jouer la piste
  const fullPath = trackEl.querySelector('.pl-track-name')?.dataset?.fullpath
    || trackEl.querySelector('.pl-track-remove')?.dataset?.fullpath;
  if (fullPath) {
    togglePlay(
      trackEl.querySelector('.pl-track-name')?.textContent || '',
      fullPath,
      trackEl.querySelector('.play-btn') || trackEl as any
    );
  }
};
```

#### Fix I6 : Clic sur fichier en lecture = stop (intégré dans Fix C1)

#### Fix I7 : Ctrl+L = focus playing file

```typescript
// Dans le handler clavier :
if ((e.key === 'l' || e.key === 'L') && e.ctrlKey) {
  e.preventDefault();
  const playingRow = document.querySelector('.led-playing')
    ?.closest('.file-row') as HTMLElement | null;
  if (playingRow) {
    const container = playingRow.closest(
      '#epars-container, #source-container, #playlist-source-container'
    ) as HTMLElement | null;
    if (container) {
      focusItemByElement(container, playingRow);
      playingRow.scrollIntoView({ block: 'center' });
    }
  }
}
```

### 4.3 PHASE 3 : Améliorations (P2) — Fluidité

| ID | Solution | Effort |
|----|----------|--------|
| **A2** | Après expand, `focusItemByElement()` sur le premier enfant | 10 min |
| **A4** | Backspace = collapse parent (ou touche dédiée) | 15 min |
| **A5** | Backspace = dossier parent | 20 min |
| **A6** | CSS `:active` sur `.file-row`, `.directory`, `.pl-track` | 5 min |
| **A11** | `navigateColumn()` dans le handler playlist source | 15 min |
| **A10** | Sauvegarder `scrollTop` des conteneurs avant `renderAll()` | 30 min |

---

## 5. Diagramme de navigation cible

```
┌──────────────────────────────────────────────────────────────┐
│                      CLIC SOURIS                             │
│                                                              │
│  .file-row ──→ onclick ──→ focusItemByElement()             │
│    │                         ├─ setActivePanel()             │
│    │                         ├─ .nouveau → selectEparsFile() │
│    │                         └─ .led-playing → stopPlayer()  │
│    ├─ ondblclick ──→ playBtn.click()                        │
│    └─ .file-rating onclick ──→ startFileRatingEdit()        │
│                                                              │
│  .directory ──→ onclick ──→ focusItemByElement()            │
│    │                         └─ toggleSourceDir()            │
│    └─ ondblclick ──→ toggleSourceDir()                      │
│                                                              │
│  .pl-track ──→ onclick ──→ focus (.focused)                 │
│    └─ ondblclick ──→ togglePlay()                           │
│                                                              │
│  Panneau (fond) ──→ onclick ──→ setActivePanel()            │
├──────────────────────────────────────────────────────────────┤
│                      CLAVIER                                 │
│                                                              │
│  ↑↓ ──→ navigateFocus() (inclut .file-row dans source!)     │
│  ←→ ──→ navigateColumn() (source uniquement)                │
│  Tab ──→ setActivePanel() / togglePlaylistFocus()           │
│  Entrée ──→ play (file) / expand (dir)                      │
│  Espace ──→ select (éparpillé) / toggle playlist            │
│  F5 ────→ executeCopy()                                     │
│  F7 / / ─→ openFilterPalette()                              │
│  N ──────→ startFileRatingEdit() (marche dans source aussi) │
│  Échap ──→ close modal / stop audio / cancel filter         │
│  Backspace → go to parent directory                         │
│  Ctrl+L ──→ focus currently playing file                    │
│  Ctrl+S ──→ save playlist (playlist mode)                   │
│  Ctrl+E ──→ export playlist (playlist mode)                 │
│  Ctrl+↑↓ ─→ reorder tracks (playlist sidebar)               │
│  Suppr ───→ remove track (playlist sidebar)                 │
├──────────────────────────────────────────────────────────────┤
│                      ÉTAT PARTAGÉ                            │
│                                                              │
│  state.{epars|source}FocusPath ←→ data-focuspath             │
│  state.playlistTrackFocusIndex ←→ sidebar position           │
│  state.sourceManuallyExpanded ←→ survit au filtre            │
│  .focused (CSS) ←→ focusItemByElement/Path()                │
│  .selected (CSS) ←→ selectEparsFile() (éparpillé only)      │
│  .led-playing (CSS) ←→ togglePlay()                         │
│  scrollTop (DOM) ←→ à sauvegarder/restaurer                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Priorités d'implémentation

| Priorité | ID | Tâche | Effort | Impact |
|----------|----|-------|--------|--------|
| **P0** | C1 | `row.onclick` → focus dans `makeFileEl()` | 20 min | 🔴 Énorme |
| **P0** | C2 | `dirEl.onclick` → focus avant toggle | 15 min | 🔴 Énorme |
| **P0** | C3 | `getItems()` inclut `.file-row` dans source | 5 min | 🔴 Énorme |
| **P0** | C4 | `.pl-track` onclick → focus | 10 min | 🔴 Critique |
| **P1** | C5 | Toast si Espace sans focus | 5 min | 🟠 Important |
| **P1** | I1 | Patch DOM après notation (pas de renderAll) | 30 min | 🟠 Important |
| **P1** | I2 | Sauvegarder/restaurer focus sidebar | 20 min | 🟠 Important |
| **P1** | I3 | `onclick` sur tous les `.file` (pas que .nouveau) | 10 min | 🟠 Important |
| **P1** | I4 | Préserver `sourceManuallyExpanded` | 15 min | 🟠 Important |
| **P1** | I5 | Double-clic = play | 15 min | 🟠 Important |
| **P1** | I6 | Clic fichier en lecture = stop | Inclus dans C1 | 🟠 Important |
| **P1** | I7 | Ctrl+L = focus playing file | 15 min | 🟠 Important |
| **P2** | A2 | Auto-focus premier enfant après expand | 10 min | 🟡 Confort |
| **P2** | A5 | Backspace = dossier parent | 20 min | 🟡 Confort |
| **P2** | A6 | CSS `:active` | 5 min | 🟡 Confort |
| **P2** | A11 | `navigateColumn()` en playlist source | 15 min | 🟡 Confort |
| **P2** | A10 | Sauvegarde/restauration scrollTop | 30 min | 🟡 Confort |
| **P3** | A7 | Menu contextuel (clic droit) | 2 h | 🟢 Nice-to-have |
| **P3** | A8 | Sélection multiple (Shift/Ctrl+clic) | 3 h | 🟢 Nice-to-have |
| **P3** | A9 | Drag & drop fichier→dossier | 2 h | 🟢 Nice-to-have |
| **P3** | A12 | Historique navigation (back/forward) | 2 h | 🟢 Nice-to-have |

---

## 7. Fichiers impactés — Résumé

| Fichier | Changements Phase 1 | Changements Phase 2 |
|---------|--------------------|--------------------|
| `static/src/render.ts` | `makeFileEl()` + onclick/ondblclick, `dirEl.onclick` refactor, `.pl-track` onclick | Patch DOM notation, `.file` onclick universel, auto-focus expand |
| `static/src/focus.ts` | `getItems()` → inclure `.file-row` | — |
| `static/src/script.ts` | Toast Espace | Ctrl+L, Backspace, sauvegarde scrollTop |
| `static/src/state.ts` | — | `playlistTrackFocusIndex`, `sourceManuallyExpanded` |
| `static/style.css` | — | `:active` sur rows/dirs/tracks |
