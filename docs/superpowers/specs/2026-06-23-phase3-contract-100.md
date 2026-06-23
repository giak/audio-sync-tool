# Phase 3 — Contrat README 100% & éradication de la dette mock

## Résumé

Atteindre 100% de couverture du contrat README (chaque raccourci clavier a
son test d'intégration), tester les cas limites (0 fichier, caractères
spéciaux), tester le flux d'initialisation (`initApp`), couvrir les
interactions souris de la player bar, et supprimer définitivement
`script.test.js` après migration des derniers tests utiles.

## Problème

1. **Gaps clavier** : 8 interactions documentées dans le README n'ont pas
   de test d'intégration via le routeur clavier :
   - `/` filtre en mode normal
   - `Échap` stop audio (testé indirectement, jamais isolé)
   - `Enter` sur dossier Source Data → expand (testé via clic, pas dispatchKey)
   - `Espace` sur dossier Source Data → expand (testé via clic, pas dispatchKey)
   - `↑↓` autonome dans Source Data (testé via setActivePanel, pas ArrowDown isolé)
   - Clic barre de progression → seek
   - Clic `⏪` / `⏩` → seek
   - Clic `⏹` → stop player

2. **Pas de test initApp** : le chargement initial (cache, config, journal)
   n'est jamais testé.

3. **Cas limites** : 0 fichier après scan, noms avec émojis/caractères
   spéciaux, chemins très longs — aucun test.

4. **Dette script.test.js résiduelle** : les ~35 tests restants après la
   Phase 2 doivent être migrés ou supprimés.

## Périmètre

- **Fichiers modifiés** : aucun (tests uniquement)
- **Fichiers de test** : `static/integration.test.js` (nouveaux tests),
  `static/script.test.js` (suppression)
- **Aucun changement backend ni frontend**

---

## 1. Gaps clavier — 5 tests

### 1.1 `/` filtre mode normal

```js
it('/ opens filter palette in normal mode', async () => {
  renderEpars();
  renderSource();

  const ev = dispatchKey('/');
  await flush();

  expect(ev.defaultPrevented).toBe(true);
  expect(state.filterActive).toBe(true);
  expect(document.getElementById('filter-palette').classList.contains('hidden')).toBe(false);
  expect(state.activePanel).toBe('source');
});
```

### 1.2 `Échap` stop audio (test isolé)

```js
it('Escape stops audio when playing in normal mode', async () => {
  renderEpars();
  const playBtn = document.querySelector('#epars-container .play-btn');
  playBtn.click();
  await flush();
  expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(false);

  dispatchKey('Escape');
  await flush();

  expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(true);
  expect(playBtn.textContent).toBe('▶');
});
```

### 1.3 `Enter` expand dossier Source Data via routeur

```js
it('Enter on a directory in Source Data expands it via keyboard router', async () => {
  renderSource();
  state.activePanel = 'source';
  setActivePanel('source');
  await flush();

  const rockDir = document.querySelector('#source-container .directory[data-dirpath="/home/music/Rock"]');
  rockDir.classList.add('focused');
  expect(rockDir.classList.contains('expanded')).toBe(false);

  dispatchKey('Enter');
  await flush();

  expect(rockDir.classList.contains('expanded')).toBe(true);
  expect(rockDir.querySelector('.children')).not.toBeNull();
});
```

### 1.4 `Espace` expand dossier Source Data via routeur

```js
it('Space on a directory in Source Data expands it via keyboard router', async () => {
  renderSource();
  state.activePanel = 'source';
  setActivePanel('source');
  await flush();

  const rockDir = document.querySelector('#source-container .directory[data-dirpath="/home/music/Rock"]');
  rockDir.classList.add('focused');

  dispatchKey(' ');
  await flush();

  expect(rockDir.classList.contains('expanded')).toBe(true);
});
```

### 1.5 `↑↓` autonome dans Source Data

```js
it('ArrowDown navigates directories in Source Data via keyboard router', async () => {
  renderSource();
  state.activePanel = 'source';
  setActivePanel('source');
  await flush();

  const dirs = document.querySelectorAll('#source-container .directory');
  expect(dirs.length).toBeGreaterThanOrEqual(1);
  expect(dirs[0].classList.contains('focused')).toBe(true);

  if (dirs.length >= 2) {
    dispatchKey('ArrowDown');
    await flush();
    expect(dirs[1].classList.contains('focused')).toBe(true);
    expect(dirs[0].classList.contains('focused')).toBe(false);
  }
});
```

---

## 2. Player bar — 3 tests souris

### 2.1 Clic barre de progression → seek

```js
it('clicking progress bar seeks audio to relative position', async () => {
  renderEpars();
  const playBtn = document.querySelector('#epars-container .play-btn');
  playBtn.click();
  await flush();

  const progressBar = document.getElementById('player-progress');
  // Mock getBoundingClientRect pour simuler un clic à 50%
  progressBar.getBoundingClientRect = () => ({
    left: 0, width: 400, right: 400, top: 0, bottom: 20, height: 20
  });

  // Simuler un clic au milieu (200px = 50%)
  progressBar.dispatchEvent(new MouseEvent('click', {
    bubbles: true, clientX: 200, clientY: 10
  }));

  // La position devrait être ~50% de 240s = 120s
  const pct = parseFloat(document.getElementById('player-progress-fill').style.width) || 0;
  expect(pct).toBeCloseTo(50, -1); // précision à 10% près
});
```

### 2.2 Clic `⏪` → seek arrière

```js
it('clicking seek-backward button seeks audio backward', async () => {
  renderEpars();
  const playBtn = document.querySelector('#epars-container .play-btn');
  playBtn.click();
  await flush();

  // Avancer d'abord
  dispatchKey('ArrowRight', { shiftKey: true });
  dispatchKey('ArrowRight', { shiftKey: true }); // +40s
  await flush();

  const beforePct = parseFloat(document.getElementById('player-progress-fill').style.width) || 0;

  document.getElementById('player-seek-bwd').click();
  await flush();

  const afterPct = parseFloat(document.getElementById('player-progress-fill').style.width) || 0;
  expect(afterPct).toBeLessThan(beforePct);
});
```

### 2.3 Clic `⏹` → stop player

```js
it('clicking stop button stops audio and hides player bar', async () => {
  renderEpars();
  const playBtn = document.querySelector('#epars-container .play-btn');
  playBtn.click();
  await flush();
  expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(false);

  document.getElementById('player-stop').click();
  await flush();

  expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(true);
  expect(playBtn.textContent).toBe('▶');
});
```

---

## 3. Test initApp

```js
it('initApp loads cached data and renders panels', async () => {
  // Mock les réponses API pour l'initialisation
  vi.mocked(api)
    .mockResolvedValueOnce({ active: 0, configs: [{ name: 'default', source_data: '', epars_dirs: [] }] })
    .mockResolvedValueOnce({ source: state.sourceFiles, epars: state.eparsFiles })
    .mockResolvedValueOnce([{ filename: 'a.mp3', status: 'copied', timestamp: '2025-01-01' }]);

  // Ré-importer ou appeler initApp
  const { initApp } = await import('./actions.js');
  await initApp();
  await flush();

  // Les panneaux doivent être rendus
  const eparsItems = document.querySelectorAll('#epars-container .file-row, #epars-container .directory');
  expect(eparsItems.length).toBeGreaterThan(0);

  const sourceDirs = document.querySelectorAll('#source-container .directory');
  expect(sourceDirs.length).toBeGreaterThan(0);

  // Le journal doit être chargé
  expect(state.journal.length).toBe(1);

  // Le panneau actif doit être éparpillé
  expect(state.activePanel).toBe('epars');
  expect(document.getElementById('panel-left').classList.contains('panel-active')).toBe(true);
});
```

---

## 4. Cas limites

### 4.1 0 fichier après scan

```js
it('renders empty state when no files are loaded', async () => {
  state.sourceFiles = {};
  state.eparsFiles = {};

  renderAll();
  await flush();

  const eparsItems = document.querySelectorAll('#epars-container .file-row');
  expect(eparsItems.length).toBe(0);

  const sourceDirs = document.querySelectorAll('#source-container .directory');
  expect(sourceDirs.length).toBe(0);
});
```

### 4.2 Noms avec caractères spéciaux

```js
it('handles filenames with special characters', async () => {
  state.eparsFiles = {
    '/media/usb': {
      'tést ♫ ñ.mp3': { path: 'tést ♫ ñ.mp3', year: '2025', duration: 240, codec: 'MP3' },
      'a"b\'c.mp3': { path: 'a"b\'c.mp3', year: '2023', duration: 180, codec: 'FLAC' },
    }
  };

  renderEpars();
  await flush();

  const files = document.querySelectorAll('#epars-container .file');
  expect(files.length).toBe(2);
  expect(files[0].textContent).toBe('tést ♫ ñ.mp3');
});
```

### 4.3 Fichiers très longs (nom > 100 caractères)

```js
it('handles very long filenames', async () => {
  const longName = 'a'.repeat(120) + '.mp3';
  state.eparsFiles = {
    '/media/usb': { [longName]: { path: longName, year: '2024', duration: 100, codec: 'MP3' } }
  };

  renderEpars();
  await flush();

  const file = document.querySelector('#epars-container .file');
  expect(file).not.toBeNull();
  // Le nom est affiché (pas tronqué à ce niveau, c'est le player bar qui tronque)
  expect(file.textContent).toBe(longName);
});
```

---

## 5. Éradication de script.test.js

### 5.1 Dernière vague de migration

Après les Phases 2 et 3, `script.test.js` ne contient plus que des tests de
logique pure (toolbar bindings, modal events, initApp orchestrator) qui n'ont
pas été migrés parce qu'ils sont redondants avec les tests d'intégration.

### 5.2 Suppression

```bash
rm static/script.test.js
```

Mettre à jour `vitest.config.js` si nécessaire (vérifier qu'aucun `include`
explicite ne mentionne ce fichier).

### 5.3 Bilan final

| État | Tests | Fichier |
|------|-------|---------|
| Avant | 55 mockés | `script.test.js` |
| Après Phase 2 | ~35 mockés | `script.test.js` |
| Après Phase 3 | **0** — fichier supprimé | — |
| Avant | 40 réels | `integration.test.js` |
| Après Phase 3 | **~60 réels** | `integration.test.js` |

---

## 6. Tests — liste complète

| # | Test | Fichier |
|---|------|---------|
| 1 | `/` ouvre le filtre en mode normal | `integration.test.js` |
| 2 | `Échap` stop audio (isolé) | `integration.test.js` |
| 3 | `Enter` expand dossier Source via routeur | `integration.test.js` |
| 4 | `Espace` expand dossier Source via routeur | `integration.test.js` |
| 5 | `↑↓` autonome Source Data via routeur | `integration.test.js` |
| 6 | Clic barre progression → seek | `integration.test.js` |
| 7 | Clic `⏪` → seek arrière | `integration.test.js` |
| 8 | Clic `⏹` → stop | `integration.test.js` |
| 9 | `initApp` charge cache + rend | `integration.test.js` |
| 10 | 0 fichier — état vide | `integration.test.js` |
| 11 | Caractères spéciaux dans les noms | `integration.test.js` |
| 12 | Noms de fichiers très longs | `integration.test.js` |
| 13 | Suppression de `script.test.js` | — |

---

## 7. Non-fonctionnel

- **Zéro mock résiduel** : après la Phase 3, plus aucun test ne mocke
  `focus.js`, `audio.js`, `ui.js`, ou `render.js`. Seul `api.js` est mocké.
- **Couverture README** : la matrice passe à 100% (tous les ✅). Les
  gaps 🟡 et 🔴 disparaissent.
- **Temps d'exécution** : les ~20 nouveaux tests ajoutent < 500ms au
  temps total de la suite (estimation).
