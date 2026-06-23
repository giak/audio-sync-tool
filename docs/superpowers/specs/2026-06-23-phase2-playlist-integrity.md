# Phase 2 — Intégrité Playlist & migration test-first

## Résumé

Corriger le bug de synchronisation `in-playlist` entre la sidebar et le panneau
source, couvrir les interactions onglets et drag-and-drop par des tests
d'intégration réels, et migrer les tests playlist mockés de `script.test.js`
vers `integration.test.js`.

## Problème

1. **in-playlist stale** (bug A1) : quand on supprime une piste depuis la
   sidebar (Delete, Backspace, ✕), `removeTrack()` est appelé puis
   `renderPlaylistPanel()` reconstruit la sidebar. Mais le panneau source
   (`#playlist-source-container`) n'est **pas** mis à jour. Les fichiers
   gardent la classe `in-playlist`. Pire : si l'utilisateur ré-appuie sur
   Espace, `addTrack()` retourne `true` (le fichier n'est plus dans le state),
   donc le fichier est **ajouté** au lieu d'être retiré.

2. **Onglets non testés** (gap B1) : clic sur un onglet pour changer de
   playlist, clic ✕ pour fermer, clic + pour créer — aucun test d'intégration.

3. **Drag & drop non testé** (gap B2) : la réorganisation par glisser-déposer
   n'a aucun test.

4. **Dette script.test.js** : ~20 tests playlist mockés dans `script.test.js`
   qui ne vérifient rien de réel.

## Périmètre

- **Fichiers modifiés** : `static/script.js` (fix A1), `static/render.js`
  (patch ou re-render)
- **Fichiers de test** : `static/integration.test.js` (nouveaux tests),
  `static/script.test.js` (suppression partielle)
- **Aucun changement backend**

---

## 1. Fix : synchronisation `in-playlist` après suppression sidebar

### 1.1 Stratégie

Deux options :
- **Option A (patch DOM)** : dans le handler Delete/Backspace, après
  `removeTrack()`, retrouver l'élément dans `#playlist-source-container` via
  `data-fullpath` et lui retirer `in-playlist`.
- **Option B (re-render)** : après chaque suppression, appeler
  `renderPlaylistSource()` pour tout reconstruire.

**Option A retenue** — plus performante, pas de flicker, cohérent avec le
pattern `patchEparsFileAfterCopy` déjà existant.

### 1.2 Nouvelle fonction : `patchPlaylistSourceFile(fullPath, remove)`

Dans `render.js` :

```js
export function patchPlaylistSourceFile(fullPath, remove) {
  const label = document.querySelector(
    `#playlist-source-container .file[data-fullpath="${CSS.escape(fullPath)}"]`
  );
  if (!label) return;
  if (remove) {
    label.classList.remove('in-playlist');
  } else {
    label.classList.add('in-playlist');
  }
}
```

### 1.3 Intégration dans les points d'appel

Dans `script.js`, modifier le handler Delete/Backspace :

```js
if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && state.playlistFocus === 'sidebar') {
  e.preventDefault();
  const focused = document.querySelector('#playlist-tracks .focused');
  if (focused) {
    const removeBtn = focused.querySelector('.pl-track-remove');
    if (removeBtn) {
      const fullPath = removeBtn.dataset.fullpath;
      removeBtn.click(); // appelle removeTrack() + renderPlaylistPanel()
      patchPlaylistSourceFile(fullPath, true); // retire la classe CSS dans le panneau source
    }
  }
  return;
}
```

Dans `render.js`, modifier le handler `✕` de `.pl-track-remove` :

```js
container.querySelectorAll('.pl-track-remove').forEach(btn => {
  btn.onclick = () => {
    const fullPath = btn.dataset.fullpath;
    removeTrack(getActivePlaylistName(), fullPath);
    renderPlaylistPanel();
    patchPlaylistSourceFile(fullPath, true);
  };
});
```

### 1.4 Cohérence avec `toggleTrackInPlaylist`

`toggleTrackInPlaylist()` utilise déjà `label.classList.add/remove('in-playlist')`
directement — pas de changement nécessaire.

---

## 2. Tests onglets playlist

### 2.1 Clic onglet → changer playlist active

```js
it('clicking a playlist tab switches active playlist', async () => {
  await enterPlaylist();

  // Créer une deuxième playlist
  state.pendingPlaylists['playlist-2'] = [];
  renderPlaylistPanel();
  await flush();

  const tabs = document.querySelectorAll('#playlist-tabs .pl-tab');
  expect(tabs.length).toBeGreaterThanOrEqual(2);

  // Cliquer sur le deuxième onglet
  tabs[1].click();
  await flush();

  expect(state.activePlaylistIndex).toBe(1);
  expect(tabs[1].classList.contains('active')).toBe(true);
  expect(tabs[0].classList.contains('active')).toBe(false);
});
```

### 2.2 Clic ✕ → fermer onglet

```js
it('clicking tab close button removes the playlist tab', async () => {
  await enterPlaylist();

  // Ajouter une deuxième playlist
  state.pendingPlaylists['playlist-2'] = [];
  renderPlaylistPanel();
  await flush();

  const tabs = document.querySelectorAll('#playlist-tabs .pl-tab');
  expect(tabs.length).toBe(2);

  // Mock confirm() pour éviter l'interaction utilisateur
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

  const closeBtn = tabs[1].querySelector('.pl-tab-close');
  closeBtn.click();
  await flush();

  expect(document.querySelectorAll('#playlist-tabs .pl-tab').length).toBe(1);
  expect(Object.keys(state.pendingPlaylists)).not.toContain('playlist-2');

  confirmSpy.mockRestore();
});
```

### 2.3 Clic + → nouvelle playlist

```js
it('clicking + button creates a new playlist tab', async () => {
  await enterPlaylist();
  expect(document.querySelectorAll('#playlist-tabs .pl-tab').length).toBe(1);

  // Mock prompt()
  vi.spyOn(window, 'prompt').mockReturnValue('ma-playlist');

  const addBtn = document.querySelector('#playlist-tabs .pl-tab-add');
  addBtn.click();
  await flush();

  const tabs = document.querySelectorAll('#playlist-tabs .pl-tab');
  expect(tabs.length).toBe(2);
});
```

---

## 3. Test drag & drop

### 3.1 Simulation de drag & drop dans jsdom

```js
function simulateDragDrop(fromEl, toEl) {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', fromEl.dataset.index);

  fromEl.dispatchEvent(new DragEvent('dragstart', {
    bubbles: true, dataTransfer
  }));

  toEl.dispatchEvent(new DragEvent('dragover', {
    bubbles: true, cancelable: true, dataTransfer
  }));

  toEl.dispatchEvent(new DragEvent('drop', {
    bubbles: true, cancelable: true, dataTransfer
  }));

  fromEl.dispatchEvent(new DragEvent('dragend', {
    bubbles: true, dataTransfer
  }));
}
```

### 3.2 Test de réorganisation par drag

```js
it('drag-and-drop reorders tracks in playlist sidebar', async () => {
  await enterPlaylist();
  state.playlistFocus = 'source';

  // Ajouter 2 pistes
  const rows = document.querySelectorAll('#playlist-source-container .file-row');
  rows[0].classList.add('focused');
  dispatchKey(' ');
  await flush();
  rows[0].classList.remove('focused');
  rows[1].classList.add('focused');
  dispatchKey(' ');
  await flush();

  let tracks = document.querySelectorAll('#playlist-tracks .pl-track');
  expect(tracks.length).toBe(2);
  const firstName = tracks[0].querySelector('.pl-track-name').textContent;

  // Drag & drop : première piste → après la deuxième
  simulateDragDrop(tracks[0], tracks[1]);
  await flush();

  tracks = document.querySelectorAll('#playlist-tracks .pl-track');
  // La première piste (draguée) doit être maintenant en position 1
  expect(tracks[1].querySelector('.pl-track-name').textContent).toBe(firstName);
});
```

---

## 4. Migration script.test.js → integration.test.js

### 4.1 Tests à migrer (playlist uniquement)

Identifier dans `script.test.js` les tests qui concernent le mode playlist
(entrer, quitter, Espace, Delete, Ctrl+S/E, Ctrl+↑↓). Ces tests mockent
tout et ne vérifient que des appels de fonctions.

**Règle** : chaque test de `script.test.js` doit être remplacé par un test
équivalent dans `integration.test.js` avec du vrai DOM. La plupart existent
déjà (cf. matrice de couverture). On garde ceux qui n'ont pas d'équivalent.

### 4.2 Après migration

- Supprimer du fichier `script.test.js` les `describe` blocks playlist
- `script.test.js` passe de 55 à ~35 tests (ne garder que la logique pure :
  toolbar bindings, initApp, modal events — en attendant la Phase 3)

---

## 5. Tests — liste complète

| # | Test | Fichier |
|---|------|---------|
| 1 | Delete supprime la classe `in-playlist` du panneau source | `integration.test.js` |
| 2 | ✕ (sidebar) supprime la classe `in-playlist` du panneau source | `integration.test.js` |
| 3 | Clic onglet → change playlist active | `integration.test.js` |
| 4 | Clic ✕ onglet → ferme la playlist | `integration.test.js` |
| 5 | Clic + onglet → nouvelle playlist | `integration.test.js` |
| 6 | Drag & drop → réorganise les pistes | `integration.test.js` |
| 7 | Suppression des tests playlist mockés dans `script.test.js` | `script.test.js` |

---

## 6. Non-fonctionnel

- **Performance** : `patchPlaylistSourceFile` est O(1) (un seul
  `querySelector` ciblé). Pas de rebuild complet.
- **Aucune régression** : la classe `in-playlist` est purement cosmétique
  (CSS), son absence ne casse pas la logique métier (`addTrack` vérifie
  le state, pas le DOM).
- **Drag & drop natif** : le test utilise `DataTransfer` natif, pas de
  bibliothèque externe.
