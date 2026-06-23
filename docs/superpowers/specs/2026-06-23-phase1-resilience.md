# Phase 1 — Résilience réseau & intégrité du state

## Résumé

Sécuriser les fondations de l'application : le réseau ne doit jamais échouer
silencieusement, l'état ne doit jamais être corrompu par un module malveillant,
et l'utilisateur doit être informé de tout problème.

## Problème

1. **Réseau muet** : `api.js` fait un `fetch` sans `try/catch`. Si le serveur
   est down ou retourne une 500, l'appelant reçoit une exception non gérée.
   L'utilisateur ne voit rien — l'état devient incohérent sans avertissement.

2. **State mutable global** : `state.js` exporte un objet nu. N'importe quel
   module peut écraser `state.playlistMode`, `state.activePanel`, etc. sans
   validation. Une erreur dans un module se propage silencieusement.

3. **Aucun test d'erreur** : les tests mockent `api` pour qu'il réussisse
   toujours. Le comportement en cas d'échec n'est jamais vérifié.

4. **Toggle fragile** : `togglePlaylistFocus()` utilise `classList.toggle()`
   sans vérifier l'état actuel. Si l'état est déjà incohérent, le toggle
   l'aggrave.

## Périmètre

- **Fichiers modifiés** : `static/api.js`, `static/state.js`, `static/script.js`
- **Fichiers de test** : `static/integration.test.js` (nouveaux tests)
- **Aucun changement backend** (app.py)

---

## 1. Wrapper réseau avec retry et toast

### 1.1 api.js — wrapper try/catch

```js
export async function api(url, opts = {}) {
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opts
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.error || `HTTP ${res.status}`, body);
      }
      return res.json();
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError) throw err; // pas de retry sur 4xx/5xx
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('Network unreachable');
}

class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
```

### 1.2 Toast d'erreur visible

Dans `script.js`, ajouter une fonction `showError(msg)` :

```js
function showError(msg) {
  const el = document.getElementById('status-text');
  el.textContent = `⚠️ ${msg}`;
  el.style.color = 'var(--led-red)';
  clearTimeout(el._errorTimer);
  el._errorTimer = setTimeout(() => {
    el.style.color = '';
    el.textContent = state.playlistMode
      ? '🎵 Mode Playlist — Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.'
      : 'Prêt.';
  }, 5000);
}
```

### 1.3 Points d'intégration

Modifier `executeCopy()` dans `actions.js` pour wrapper l'appel API :

```js
try {
  const res = await api('/copy', { ... });
} catch (err) {
  showError(`Échec de la copie : ${err.message}`);
  return;
}
```

Modifier `saveCurrentPlaylist()` dans `script.js` :

```js
try {
  await savePlaylist(name, tracks);
} catch (err) {
  showError(`Échec de la sauvegarde : ${err.message}`);
  return;
}
```

Modifier `runScan()` dans `actions.js` :

```js
try {
  const data = await api('/scan');
} catch (err) {
  statusText.textContent = `✗ Scan échoué : ${err.message}`;
  return; // finally{} s'exécute quand même
}
```

---

## 2. State protégé

### 2.1 state.js — Proxy de validation

```js
const VALID_PANELS = new Set(['epars', 'source']);
const VALID_MODALS = new Set([null, 'config', 'legend', 'journal', 'dialog', 'playlists']);
const VALID_PLAYLIST_FOCUS = new Set(['source', 'sidebar']);

const _state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  activeModal: null,
  activePanel: 'epars',
  eparsFocusPath: null,
  sourceFocusPath: null,
  sourceExpanded: new Set(),
  sourceNodeMap: new Map(),
  sourceFilter: '',
  filterActive: false,
  audioSeekStep: 20,
  playlistMode: false,
  playlists: [],
  activePlaylistIndex: null,
  pendingPlaylists: {},
  playlistFocus: 'source',
};

export const state = new Proxy(_state, {
  set(target, prop, value) {
    if (prop === 'activePanel' && !VALID_PANELS.has(value)) {
      console.warn(`state.activePanel invalide: ${value}`);
      return false;
    }
    if (prop === 'activeModal' && !VALID_MODALS.has(value)) {
      console.warn(`state.activeModal invalide: ${value}`);
      return false;
    }
    if (prop === 'playlistFocus' && !VALID_PLAYLIST_FOCUS.has(value)) {
      console.warn(`state.playlistFocus invalide: ${value}`);
      return false;
    }
    target[prop] = value;
    return true;
  }
});
```

### 2.2 Contrainte : pas de suppression de propriété

Le proxy n'intercepte pas `delete` volontairement — seules les mutations
invalides sont bloquées. Les `Set` et `Map` restent mutables (`.add()`,
`.set()`, `.clear()`) mais leurs clés sont contrôlées par le code appelant.

---

## 3. Fix togglePlaylistFocus

### 3.1 Code actuel (fragile)

```js
function togglePlaylistFocus() {
  state.playlistFocus = state.playlistFocus === 'source' ? 'sidebar' : 'source';
  document.getElementById('playlist-source').classList.toggle('panel-active');
  document.getElementById('playlist-sidebar').classList.toggle('panel-active');
}
```

### 3.2 Code corrigé (explicite)

```js
function togglePlaylistFocus() {
  const newFocus = state.playlistFocus === 'source' ? 'sidebar' : 'source';
  state.playlistFocus = newFocus;

  const sourceEl = document.getElementById('playlist-source');
  const sidebarEl = document.getElementById('playlist-sidebar');

  if (newFocus === 'sidebar') {
    sourceEl.classList.remove('panel-active');
    sidebarEl.classList.add('panel-active');
  } else {
    sidebarEl.classList.remove('panel-active');
    sourceEl.classList.add('panel-active');
  }
}
```

---

## 4. Tests

### 4.1 Erreur API — copie échoue (500)

```js
it('F5 shows error toast when /copy returns 500', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('HTTP 500'));

  renderEpars();
  renderSource();
  // Setup focused file + directory...

  dispatchKey('F5');
  await flush();
  document.getElementById('dialog-confirm').click();
  await flush();

  expect(document.getElementById('status-text').textContent).toContain('⚠️');
  expect(document.getElementById('status-text').textContent).toContain('Échec');
});
```

### 4.2 Erreur API — timeout réseau

```js
it('Ctrl+S shows error toast when network is unreachable', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Network unreachable'));

  await enterPlaylist();
  focusFirstPlaylistFile();
  dispatchKey(' ');
  await flush();

  dispatchKey('s', { ctrlKey: true });
  await flush();
  await flush();

  expect(document.getElementById('status-text').textContent).toContain('Échec');
});
```

### 4.3 Erreur scan

```js
it('scan button shows error when /scan fails', async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error('Server error'));

  document.getElementById('btn-scan').click();
  await flush();
  await flush();

  expect(document.getElementById('status-text').textContent).toContain('✗');
  expect(document.getElementById('status-text').textContent).toContain('Scan échoué');
});
```

### 4.4 State proxy bloque les valeurs invalides

```js
it('state proxy rejects invalid activePanel', () => {
  state.activePanel = 'invalid';
  expect(state.activePanel).toBe('epars'); // unchanged
});

it('state proxy rejects invalid activeModal', () => {
  state.activeModal = 'nonexistent';
  expect(state.activeModal).toBeNull();
});
```

### 4.5 togglePlaylistFocus — add/remove explicite

```js
it('togglePlaylistFocus uses explicit add/remove, not toggle', async () => {
  // Cas 1 : source → sidebar
  state.playlistFocus = 'source';
  document.getElementById('playlist-source').classList.add('panel-active');

  dispatchKey('Tab'); // togglePlaylistFocus via routeur si state.playlistMode=true
  // Vérifier : source n'a PAS panel-active, sidebar l'a
});
```

---

## 5. Non-fonctionnel

- **Aucune régression** : les 303 tests existants continuent de passer
- **Performance** : le proxy d'état n'ajoute qu'une vérification `Set.has()` par mutation — coût négligeable
- **Expérience utilisateur** : le toast d'erreur est rouge (LED amber/red) et s'efface après 5 secondes
- **Backward compatible** : toutes les lectures de `state.xxx` restent inchangées — seul l'accès en écriture invalide est bloqué
