# Architecture Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task.
> **Référence:** `docs/superpowers/specs/2026-06-24-architecture-refactoring.md` — spec complète
> **Tag de référence:** `v0.1-functional` — état actuel avant refactoring
> **Tag cible:** `v0.2-clean-architecture` — après les 5 phases

**Goal:** Refactorer l'architecture frontend (~3000 lignes TypeScript, 14 modules, 291 tests) sans régression fonctionnelle, en 5 phases : Command Pattern, Component Factories, EventEmitter, Focus stabilisé, domPatches.

**Architecture cible:**

```
script.ts (~60 lignes, orchestrateur)
  └─▶ commands/ (8 modules, CommandRegistry)
state.ts (Proxy + EventEmitter + RAF batcher)
  └─▶ render/ (9 modules, Component Factories)
actions.ts (mutations state pures, 0 import render)
  └─▶ domPatches.ts (patching DOM ciblé, réactif via EventEmitter)
```

**Tech Stack:** TypeScript vanilla, esbuild, vitest, aucun framework.

## Global Constraints

- **Zéro régression fonctionnelle** : les 291 tests passent à chaque phase
- **TypeScript strict** : `npx tsc --noEmit` = 0 erreur à chaque phase
- **Build intact** : `npm run build` OK à chaque phase
- **Aucune nouvelle dépendance** : ni RxJS, ni Redux, ni React, ni Angular
- **Commit atomique** : un commit par phase, taggable individuellement
- **Ordre imposé** : Phase 1 → 2 → 5 → 3 → 4 (dépendances documentées)

---

## Pre-flight Checklist (lecture obligatoire avant d'implémenter)

- [x] Lire `docs/superpowers/specs/2026-06-24-architecture-refactoring.md` — spec complète
- [x] Lire `static/src/script.ts` — le keydown handler monolithique à découper
- [x] Lire `static/src/render.ts` — le god module à éclater
- [x] Lire `static/src/state.ts` — le Proxy à enrichir d'un EventEmitter
- [x] Lire `static/src/focus.ts` — le système de focus à stabiliser
- [x] Lire `static/src/actions.ts` — la logique métier à découpler du rendu
- [x] Lire `static/src/ui.ts` — les modales et le filtre
- [x] Lire `static/src/audio.ts` — le player audio
- [x] Lire `static/src/playlist.ts` — la logique playlist à enrichir
- [x] Lire `static/src/ratings.ts` — le CRUD notation
- [x] Lire `static/src/utils.ts` — les utilitaires purs
- [x] Lire `static/src/api.ts` — le wrapper fetch
- [x] Lire `static/src/focus.test.ts` — tests focus existants
- [x] Lire `static/src/render.test.ts` — tests render existants
- [x] Lire `static/src/actions.test.ts` — tests actions existants
- [x] Lire `static/src/integration.test.ts` — tests d'intégration

---

### Task 1: Phase 1 — Command Pattern (P0, 2-3h)

**Objectif :** Remplacer le keydown handler monolithique de `script.ts` (250+ lignes) par un `CommandRegistry` et 8 modules de commandes.

**Fichiers créés :**
- `static/src/commands/registry.ts` — CommandRegistry + buildContext
- `static/src/commands/navigation.ts` — ↑↓ ←→ Tab Backspace
- `static/src/commands/audio.ts` — seekAudio, stopPlayer
- `static/src/commands/copy.ts` — F5 → executeCopy
- `static/src/commands/filter.ts` — F7, /, Échap (filtre)
- `static/src/commands/rating.ts` — N (notation)
- `static/src/commands/playlist.ts` — Tab, Espace, Ctrl+S, Ctrl+E, Suppr, Ctrl+↑↓
- `static/src/commands/modals.ts` — Échap (modales)

**Fichiers modifiés :**
- `static/src/script.ts` — réduit à ~60 lignes (orchestrateur)
- `static/src/playlist.ts` — enrichi de `togglePlaylistFocus`, `toggleTrackInPlaylist`, `saveCurrentPlaylist`, `showExportModal`, `enterPlaylistMode`, `exitPlaylistMode`

**Fichiers de test créés :**
- `static/src/commands/registry.test.ts` — tests unitaires registry

- [x] **Step 1: Créer le dossier `commands/`**

```bash
mkdir -p static/src/commands
```

- [x] **Step 2: Écrire `registry.ts` — CommandRegistry + buildContext**

Inclure :
- `CommandContext` avec 12 champs (key, shiftKey, ctrlKey, altKey, isInput, playlistMode, playlistFocus, activePanel, activeModal, filterActive, isFilterInputFocused, isAudioPlaying)
- `CommandBinding` avec 10 conditions optionnelles + handler
- `dispatch()` qui itère sur les bindings et match toutes les conditions
- ⚠️ Inclure `activeModal` et `isFilterInputFocused` — critiques pour l'isolation modale
- `buildContext(e)` qui lit `state` et `document.activeElement`

- [x] **Step 3: Écrire `registry.test.ts`**

Tester :
- `dispatch` matche une commande simple (key match)
- `dispatch` ne matche pas si `activeModal: null` et une modale est ouverte
- `dispatch` matche si `activeModal: 'dialog'` et la modale dialog est ouverte
- `dispatch` ne matche pas si `isFilterInputFocused: true` et le focus n'est pas sur l'input filtre
- `dispatch` respecte l'ordre des bindings (premier match gagne)
- `dispatch` ne matche pas si `playlistMode: true` et on est en Sync
- `buildContext` retourne les bonnes valeurs depuis state

- [x] **Step 4: Écrire les 8 modules de commandes**

Chaque module :
1. Importe `registry` depuis `./registry.js`
2. Appelle `registry.bind({...})` pour chaque combinaison de touches
3. N'exporte rien (side-effect : bind())

**`commands/modals.ts` — point critique :**
```typescript
// Échap dans une modale → fermer
registry.bind({ key: 'Escape', activeModal: 'dialog', handler: closeAllModals });
registry.bind({ key: 'Escape', activeModal: 'config', handler: closeAllModals });
registry.bind({ key: 'Escape', activeModal: 'legend', handler: closeAllModals });
registry.bind({ key: 'Escape', activeModal: 'journal', handler: closeAllModals });
registry.bind({ key: 'Escape', activeModal: 'playlists', handler: closeAllModals });
```

**`commands/filter.ts` — point critique :**
```typescript
// Tab dans l'input filtre → focuser premier dossier
registry.bind({ key: 'Tab', isFilterInputFocused: true, handler: () => {
  closeFilterPalette(renderSource);
  setActivePanel('epars');
}});
// Échap avec filtre actif → fermer filtre
registry.bind({ key: 'Escape', filterActive: true, isFilterInputFocused: true, handler: () => {
  closeFilterPalette(renderSource);
}});
```

**`commands/copy.ts` — point critique :**
```typescript
// F5 jamais dans une modale
registry.bind({ key: 'F5', activeModal: null, handler: executeCopy });
```

- [x] **Step 5: Déplacer les fonctions playlist de `script.ts` → `playlist.ts`**

| Fonction | Statut |
|----------|--------|
| `togglePlaylistFocus()` | → `playlist.ts` export |
| `toggleTrackInPlaylist()` | → `playlist.ts` export |
| `saveCurrentPlaylist()` | → `playlist.ts` export |
| `showExportModal()` | → `playlist.ts` export |
| `moveTrackInPlaylist()` | → supprimée (utiliser `reorderTrack`) |
| `enterPlaylistMode()` | → `playlist.ts` export |
| `exitPlaylistMode()` | → `playlist.ts` export |
| `escapeHtml()` | → `playlist.ts` (déjà dans `render.ts`, à déplacer ou partager) |

- [x] **Step 6: Réduire `script.ts` à l'orchestrateur**

```typescript
// Après refactoring, script.ts :
import { registry, buildContext } from './commands/registry.js';
import './commands/navigation.js';
import './commands/audio.js';
import './commands/copy.js';
import './commands/filter.js';
import './commands/rating.js';
import './commands/playlist.js';
import './commands/modals.js';
import { initAudioUI, isAudioPlaying, stopPlayer } from './audio.js';
import { initConfigUI, initApp } from './actions.js';
import { initFilterPalette, closeAllModals } from './ui.js';
import { renderJournal, renderPlaylistManager } from './render.js';
import { state } from './state.js';

// Toolbar bindings (inchangés)
document.getElementById('btn-config')!.onclick = () => openModal('config');
// ...

// Keyboard router (remplacé par le registry)
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const ctx = buildContext(e);
  registry.dispatch(e, ctx);
});

// Modal backdrop/close (inchangé)
document.addEventListener('click', (e: MouseEvent) => { /* ... */ });

// Boot (inchangé)
updateServerIndicator();
setInterval(updateServerIndicator, 10000);
initAudioUI();
initConfigUI();
initApp();
```

- [x] **Step 7: Valider — build + typecheck + tests** ✅ 313/313 pass

- [x] **Step 8: Commit** (295b38c)

```bash
git add static/src/commands/ static/src/script.ts static/src/playlist.ts
git commit -m "refactor(phase1): Command Pattern — replace monolithic keydown handler with CommandRegistry (8 command modules, script.ts 593→60 lines)"
```

---

### Task 2: Phase 2 — Component Factories (P0, 3-4h)

**Objectif :** Éclater `render.ts` (1500+ lignes) en 9 modules sous `static/src/render/`.

**Fichiers créés :**
- `static/src/render/sourceTree.ts` — renderSource, renderDirTree, buildSourceChildren, toggleSourceDir, renderFilteredSource
- `static/src/render/fileRow.ts` — makeFileEl
- `static/src/render/eparsUI.ts` — renderEpars, selectEparsFile
- `static/src/render/playlistUI.ts` — renderPlaylistTabs, renderPlaylistTracks, renderPlaylistSource, renderPlaylistManager
- `static/src/render/journalUI.ts` — renderJournal
- `static/src/render/ratingEdit.ts` — _startInlineRatingEdit, startRatingEdit, startSourceRatingEdit, _ratingClickHandler
- `static/src/render/contextMenu.ts` — showDirContextMenu, batchCopyToDir
- `static/src/render/dragDrop.ts` — doDragCopy
- `static/src/render/batchCopy.ts` — _batchCopyTarget, _batchCopyFiles, getBatchCopy
- `static/src/render/index.ts` — renderAll, ré-exports backward compat

**Fichier supprimé :**
- `static/src/render.ts` — remplacé par `render/index.ts`

**Fichiers de test créés :**
- `static/src/render/fileRow.test.ts`
- `static/src/render/sourceTree.test.ts`
- `static/src/render/eparsUI.test.ts`

- [x] **Step 1: Créer le dossier `render/`**

```bash
mkdir -p static/src/render
```

- [x] **Step 2: Extraire `fileRow.ts` — `makeFileEl()`** (avec callbacks optionnels `selectEparsFileFn`, `startSourceRatingEditFn`)

**Principe :** `makeFileEl` reçoit des callbacks au lieu d'importer `focus.ts`, `audio.ts`, etc.

```typescript
// fileRow.ts
interface FileRowCallbacks {
  onPlay: (filename: string, fullpath: string, btn: HTMLElement) => void;
  onFocus: (container: HTMLElement, el: Element, opts?: { noHistory?: boolean }) => void;
  onRate: () => void;  // startSourceRatingEdit or no-op (dépend du conteneur)
  onSelect?: (label: HTMLElement, filename: string, eparDir: string, opts?: { ctrl?: boolean; shift?: boolean }) => void;
  onContextMenu?: (x: number, y: number, items: Array<{ label: string; action: () => void; danger?: boolean }>) => void;
  onDragStart?: (e: DragEvent, filename: string, eparDir: string) => void;
}

export function makeFileEl(
  filename: string,
  fullpath: string,
  status: FileStatus,
  metadata: { year: string | null; duration: number | null; codec: string | null },
  rating: number | undefined,
  callbacks: FileRowCallbacks,
): HTMLDivElement {
  // Code existant, mais :
  // - playBtn.onclick → callbacks.onPlay(...)
  // - row.onclick → callbacks.onFocus(...)
  // - ratingSpan.onclick → callbacks.onRate()
  // - row.ondblclick → playBtn.click()
  // - row.oncontextmenu → callbacks.onContextMenu(...)
  // - row.ondragstart → callbacks.onDragStart(...)
  // NE PAS importer togglePlay, focusItemByElement, etc.
}
```

- [ ] **Step 3: Extraire `sourceTree.ts`** ⚠️ NON FAIT — renderSource() encore dans render.ts

Fonctions à déplacer :
- `renderSource()`
- `renderDirTree()`
- `buildSourceChildren()`
- `renderFilteredSource()`
- `renderFilteredDirNode()`
- `toggleSourceDir()`
- `togglePlaylistSourceDir()`
- `updateSourceHeaderCount()`

Ces fonctions importent `makeFileEl` depuis `./fileRow.js` et passent les callbacks
appropriés selon le conteneur (source-container vs playlist-source-container).

- [ ] **Step 4: Extraire `eparsUI.ts`, `playlistUI.ts`, `journalUI.ts`** ⚠️ NON FAIT

Chaque module suit le même pattern : importer `makeFileEl` depuis `./fileRow.js`,
passer les callbacks spécifiques au contexte.

⚠️ `eparsUI.ts` doit exposer `selectEparsFile()` qui gère la sélection simple/multiple
(Ctrl+clic, Shift+clic). Cette fonction utilise `focusItemByElement` → callback.

- [ ] **Step 5: Extraire `ratingEdit.ts`** ⚠️ NON FAIT — `_startInlineRatingEdit()` encore dans render.ts

Fonctions à déplacer :
- `_startInlineRatingEdit()` (la fonction partagée)
- `startRatingEdit()` (sidebar)
- `startSourceRatingEdit()` (source tree)
- `_ratingClickHandler()`
- `_ratingEditActive` (module-level)

- [x] **Step 6: Extraire `contextMenu.ts`, `dragDrop.ts`, `batchCopy.ts`** — batchCopy.ts ✅ extrait, contextMenu.ts et dragDrop.ts ⚠️ NON FAIT

- `contextMenu.ts` : `showDirContextMenu`, `batchCopyToDir`
- `dragDrop.ts` : `doDragCopy`
- `batchCopy.ts` : `_batchCopyTarget`, `_batchCopyFiles`, `getBatchCopy`

⚠️ `getBatchCopy()` doit rester accessible par `actions.ts` — soit via
`render/index.ts` (ré-export), soit via un import direct de `batchCopy.ts`.

- [x] **Step 7: Écrire `render/index.ts` — assembleur** (ré-exporte depuis render.ts pour backward compat)

```typescript
// render/index.ts
import { renderEpars } from './eparsUI.js';
import { renderSource } from './sourceTree.js';
import { revalidateFocus } from '../focus.js';

export function renderAll(): void {
  renderEpars();
  renderSource();
  requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
}

// Ré-exports backward compat
export { renderEpars, selectEparsFile } from './eparsUI.js';
export { renderSource, toggleSourceDir } from './sourceTree.js';
export { renderJournal } from './journalUI.js';
export { renderPlaylistSource, renderPlaylistPanel, patchPlaylistSourceFile } from './playlistUI.js';
export { startRatingEdit, startSourceRatingEdit } from './ratingEdit.js';
export { getBatchCopy } from './batchCopy.js';
export { patchEparsFileAfterCopy, patchSourceFileAfterCopy } from '../domPatches.js'; // Phase 5
```

- [ ] **Step 8: Supprimer `render.ts`, mettre à jour tous les imports** ⚠️ NON FAIT — render.ts conservé

```bash
rm static/src/render.ts
```

Mettre à jour les imports dans :
- `script.ts` → `'./render/index.js'` (ou `'./render.js'` si on garde le nom)
- `actions.ts` → `'./render/index.js'` pour `getBatchCopy`, `renderAll`, `renderSource`
- `commands/*.ts` → `'../render/index.js'`
- `static/src/render/index.test.ts` (anciennement `render.test.ts`) — adapter les imports

Alternative plus propre : garder `static/src/render.ts` comme point d'entrée qui
ré-exporte tout depuis `render/index.ts` :

```typescript
// static/src/render.ts (nouveau, 5 lignes)
export * from './render/index.js';
```

Comme ça, aucun import existant ne casse.

- [ ] **Step 9: Adapter les tests existants** ⚠️ NON FAIT

- `render.test.ts` → renommé `render/sourceTree.test.ts` (les tests de `patchSourceFileAfterCopy` seront déplacés dans `domPatches.test.ts` en Phase 5)
- `render/eparsUI.test.ts` : extraire les tests de `renderEpars`
- `render/fileRow.test.ts` : nouveau, tester `makeFileEl` avec des callbacks mockés

- [x] **Step 10: Valider** ✅ 0 erreurs, build OK
- [x] **Step 11: Commit** (295b38c, inclus dans le commit Phase 1)

```bash
git add static/src/render/ static/src/render.ts
git rm static/src/render.ts  # si remplacé par render/index.ts
git commit -m "refactor(phase2): Component Factories — split render.ts (1500 lines) into 9 modules under render/"
```

---

### Task 3: Phase 5 — Extraction `domPatches.ts` (P2, 30 min)

**Objectif :** Extraire les fonctions de patching DOM de `render.ts` dans `domPatches.ts`, et faire en sorte que `actions.ts` ne dépende plus du module de rendu complet.

**Fichiers créés :**
- `static/src/domPatches.ts`

**Fichiers modifiés :**
- `static/src/actions.ts` — supprimer les imports de `render.ts`, ne garder que `state.ts` et `api.ts`
- `static/src/render/index.ts` — ré-exporter depuis `domPatches.ts`

**Fichiers de test créés :**
- `static/src/domPatches.test.ts` — extrait de `render.test.ts`

- [x] **Step 1: Créer `domPatches.ts`** — puis supprimé (bdb1e8b) car non importé = dead code

```typescript
// static/src/domPatches.ts
import { state } from './state.js';
import { makeFileEl } from './render/fileRow.js';
import { computeStatus, countAllEparsFiles } from './utils.js';

export function patchEparsFileAfterCopy(filename: string, eparDir: string): void {
  // Code existant de render.ts, inchangé
}

export function patchSourceFileAfterCopy(
  destDir: string,
  filename: string,
  fileData: { path: string; year: string | null; duration: number | null; codec: string | null },
): boolean {
  // Code existant de render.ts, inchangé
}

export function patchPlaylistSourceFile(fullPath: string, remove: boolean): void {
  // Code existant de render.ts, inchangé
}
```

- [x] **Step 2: Mettre à jour `render/index.ts`**

```typescript
// Ré-exporter depuis domPatches.ts pour backward compat
export { patchEparsFileAfterCopy, patchSourceFileAfterCopy, patchPlaylistSourceFile } from '../domPatches.js';
```

- [ ] **Step 3: Nettoyer `actions.ts`** ⚠️ NON FAIT — actions.ts importe encore renderAll/renderSource

Supprimer les imports de `render.ts` :
```diff
- import { getBatchCopy, patchEparsFileAfterCopy, patchSourceFileAfterCopy, renderAll, renderSource } from './render.js';
+ // Phase 5: actions.ts ne fait que muter state.
+ // Les patches DOM et re-renders sont déclenchés par l'EventEmitter (Phase 3).
+ // TODO Phase 3: remplacer renderAll()/renderSource() par state mutations
```

⚠️ Note : `initApp()` et `runScan()` appellent encore `renderAll()` et `renderSource()`.
Ces appels seront supprimés en Phase 3 (EventEmitter). Pour l'instant, garder
l'import de `renderAll` et `renderSource` depuis `render/index.ts` — le
découplage complet viendra avec l'EventEmitter.

- [ ] **Step 4: Déplacer les tests de patching dans `domPatches.test.ts`** ⚠️ NON FAIT — fichier supprimé

Extraire de `render.test.ts` (maintenant `render/sourceTree.test.ts`) :
- `describe('patchSourceFileAfterCopy')`
- `describe('patchEparsFileAfterCopy')`

- [x] **Step 5: Valider** ✅
- [x] **Step 6: Commit** (inclus dans 295b38c, puis supprimé dans bdb1e8b)

```bash
git add static/src/domPatches.ts static/src/actions.ts static/src/render/index.ts
git commit -m "refactor(phase5): extract domPatches.ts — decouple actions.ts from render module"
```

---

### Task 4: Phase 3 — EventEmitter minimal (P1, 1-2h)

**Objectif :** Ajouter un EventEmitter avec RAF batcher à `state.ts`. Le Proxy émet automatiquement sur chaque `set`. Les modules s'abonnent aux événements. Supprimer les appels `renderXxx()` manuels.

**Fichiers modifiés :**
- `static/src/state.ts` — ajout `on()`, `emit()`, RAF batcher, modification du Proxy `set` trap
- `static/src/render/index.ts` — abonnements aux événements
- `static/src/actions.ts` — suppression des appels `renderAll()`/`renderSource()` manuels (enfin !)
- `static/src/commands/playlist.ts` — suppression des `renderPlaylistPanel()` manuels
- `static/src/render/ratingEdit.ts` — suppression des `renderPlaylistPanel()` dans `finish()`

**Fichiers de test créés :**
- `static/src/state.test.ts` — tests event emitter

- [x] **Step 1: Écrire `state.test.ts` — tests EventEmitter** (7 tests : emit, unchanged, unsubscribe, RAF batcher, validation, focusListId)

```typescript
// state.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { state, on } from './state.js';

describe('EventEmitter', () => {
  beforeEach(() => {
    // Reset state to initial
    state.activePanel = 'epars';
  });

  it('emits on property change', async () => {
    const fn = vi.fn();
    on('activePanel:changed', fn);
    state.activePanel = 'source';
    // Attendre le RAF batcher
    await new Promise(r => requestAnimationFrame(r));
    expect(fn).toHaveBeenCalled();
  });

  it('does not emit if value unchanged', async () => {
    const fn = vi.fn();
    on('activePanel:changed', fn);
    state.activePanel = 'epars'; // déjà 'epars'
    await new Promise(r => requestAnimationFrame(r));
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribe works', async () => {
    const fn = vi.fn();
    const unsub = on('activePanel:changed', fn);
    unsub();
    state.activePanel = 'source';
    await new Promise(r => requestAnimationFrame(r));
    expect(fn).not.toHaveBeenCalled();
  });

  it('batches multiple emissions in one RAF frame', async () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    on('sourceFiles:changed', fn1);
    on('eparsFiles:changed', fn2);

    state.sourceFiles = { '/a': {} };
    state.eparsFiles = { '/b': {} };

    await new Promise(r => requestAnimationFrame(r));
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: Ajouter l'EventEmitter + RAF batcher à `state.ts`**

```typescript
// state.ts — ajouts

type Listener = () => void;
const _listeners = new Map<string, Set<Listener>>();

// RAF batcher
const _dirty = new Set<string>();
let _rafScheduled = false;

export function on(event: string, fn: Listener): () => void {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event)!.add(fn);
  return () => _listeners.get(event)?.delete(fn);
}

function emit(event: string): void {
  _dirty.add(event);
  if (!_rafScheduled) {
    _rafScheduled = true;
    requestAnimationFrame(() => {
      _rafScheduled = false;
      for (const evt of _dirty) {
        for (const fn of _listeners.get(evt) || []) fn();
      }
      _dirty.clear();
    });
  }
}

// Modifier le Proxy set trap existant :
export const state = new Proxy<AppState>(_state, {
  set(target: AppState, prop: string | symbol, value: unknown): boolean {
    // ... validation inchangée ...
    const old = (target as any)[prop];
    (target as any)[prop] = value;
    if (old !== value) emit(`${String(prop)}:changed`);
    return true;
  },
});
```

- [ ] **Step 3: Abonner les renders aux événements dans `render/index.ts`** ⚠️ NON FAIT — render/index.ts n'a pas d'abonnements on()

```typescript
// render/index.ts — ajouter au boot
import { on } from '../state.js';

// Abonnements
on('eparsFiles:changed', renderEpars);
on('sourceFiles:changed', renderSource);
on('journal:changed', renderAll);
on('ratings:changed', revalidateAllRatingSpans);
on('playlistTrackFocusIndex:changed', renderPlaylistPanel);
on('activePanel:changed', updatePanelActiveClass);

function revalidateAllRatingSpans(): void {
  // Re-query toutes les .file-rating et .pl-track-rating, mettre à jour le contenu
  // sans re-render complet
}

function updatePanelActiveClass(): void {
  // Mettre à jour .panel-active sur les panneaux
}
```

- [ ] **Step 4: Remplacer les `Set.add()` / `Map.set()` par des remplacements complets** ⚠️ NON FAIT

⚠️ Critique : `Set.add()` et `Map.set()` ne déclenchent pas le Proxy `set` trap.

Faire un search-and-replace dans tout le codebase :

```bash
# Trouver tous les state.sourceExpanded.add(
rg "state\.sourceExpanded\.add\(" static/src/
rg "state\.sourceNodeMap\.set\(" static/src/
rg "state\.sourceManuallyExpanded\.add\(" static/src/
rg "state\.selectedEparsFiles\.set\(" static/src/
```

Remplacer chaque occurrence par :
```typescript
// Avant
state.sourceExpanded.add(dirPath);
// Après
state.sourceExpanded = new Set([...state.sourceExpanded, dirPath]);

// Avant
state.sourceNodeMap.set(fullPath, info);
// Après
state.sourceNodeMap = new Map([...state.sourceNodeMap, [fullPath, info]]);
```

- [ ] **Step 5: Supprimer les appels `renderXxx()` manuels** ⚠️ NON FAIT — renderAll/renderSource encore appelés directement

Faire un search pour trouver tous les appels manuels :
```bash
rg "renderAll\(\)" static/src/
rg "renderSource\(\)" static/src/
rg "renderEpars\(\)" static/src/
rg "renderPlaylistPanel\(\)" static/src/
rg "renderPlaylistSource\(\)" static/src/
```

Supprimer ceux qui sont redondants avec l'EventEmitter.
⚠️ **Ne pas supprimer** les appels dans `initApp()` et `runScan()` —
ces derniers font des mutations batch (config, scan) qui doivent être
déclenchées manuellement ou via un événement `'init:done'`.

- [x] **Step 6: Valider** ✅
- [x] **Step 7: Commit** (inclus dans 295b38c)

```bash
git add static/src/state.ts static/src/render/index.ts static/src/actions.ts static/src/commands/playlist.ts static/src/render/ratingEdit.ts
git commit -m "refactor(phase3): EventEmitter with RAF batcher — state emits on change, render subscribes, ~15 manual renderXxx() calls removed"
```

---

### Task 5: Phase 4 — Focus stabilisé (P1, 1-2h)

**Objectif :** Conserver `focusPath` (identifiant logique stable), optimiser `focusItemByPath()`, documenter la sidebar playlist.

**Fichiers modifiés :**
- `static/src/focus.ts` — focusItemByPath optimisé (boucle au lieu de querySelector)
- `static/src/state.ts` — ajout `focusListId`, conservation de `eparsFocusPath` et `sourceFocusPath`

**Fichiers de test modifiés :**
- `static/src/focus.test.ts` — mise à jour des tests

- [x] **Step 1: Ajouter `focusListId` à `state.ts`**

```typescript
// state.ts
export interface AppState {
  // ... existant ...
  eparsFocusPath: string | null;    // conservé — identifiant logique stable
  sourceFocusPath: string | null;   // conservé — identifiant logique stable
  focusListId: 'epars' | 'source' | 'playlist-source' | 'playlist-tracks';
  // ...
}
```

Valeur par défaut : `focusListId: 'epars'` (premier panneau affiché).

- [x] **Step 2: Mettre à jour `setActivePanel()` pour synchroniser `focusListId`**

```typescript
// focus.ts
export function setActivePanel(panel: 'epars' | 'source'): void {
  state.activePanel = panel;
  state.focusListId = panel; // synchroniser
  // ... reste inchangé ...
}
```

- [ ] **Step 3: Mettre à jour `focusItemByPath()`** ⚠️ NON FAIT — utilise encore querySelector `[data-focuspath="..."]`

Remplacer la recherche CSS `[data-focuspath="..."]` par une boucle sur
`getItems()` — plus robuste, pas besoin de `CSS.escape()` :

```typescript
export function focusItemByPath(container: HTMLElement, path: string | null): boolean {
  const items = getItems(container);
  for (const el of container.querySelectorAll('.focused')) el.classList.remove('focused');

  if (!path) {
    if (items.length > 0) {
      items[0].classList.add('focused');
      items[0].scrollIntoView({ block: 'nearest' });
      return true;
    }
    return false;
  }

  for (const el of items) {
    if ((el as HTMLElement).dataset.focuspath === path) {
      el.classList.add('focused');
      el.scrollIntoView({ block: 'nearest' });
      return true;
    }
  }

  // Fallback
  if (items.length > 0) {
    items[0].classList.add('focused');
    items[0].scrollIntoView({ block: 'nearest' });
  }
  return false;
}
```

- [ ] **Step 4: Documenter le double `requestAnimationFrame`** ⚠️ NON FAIT

Le double rAF dans `renderAll()` est conservé — il garantit que le DOM est
prêt avant `revalidateFocus()`. Ajouter un commentaire :

```typescript
// renderAll() dans render/index.ts
export function renderAll(): void {
  renderEpars();
  renderSource();
  // Double rAF : le premier flush le DOM (innerHTML), le second
  // garantit que le layout est calculé avant revalidateFocus().
  // Conservé car éprouvé — ne pas remplacer par un seul rAF.
  requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
}
```

- [x] **Step 5: Valider** ✅
- [x] **Step 6: Commit** (inclus dans 295b38c, puis supprimé dans bdb1e8b)

```bash
git add static/src/focus.ts static/src/state.ts static/src/render/index.ts
git commit -m "refactor(phase4): focus stabilized — focusPath conserved, focusItemByPath optimized (loop vs querySelector), focusListId added"
```

---

## Spec Coverage Check

| Spec Requirement | Task | Step |
|-----------------|------|------|
| CommandRegistry avec activeModal + isFilterInputFocused | Task 1 | Step 2 |
| 8 modules de commandes (navigation, audio, copy, filter, rating, playlist, modals) | Task 1 | Step 4 |
| Déplacement fonctions playlist → playlist.ts | Task 1 | Step 5 |
| script.ts réduit à ~60 lignes | Task 1 | Step 6 |
| Tests registry (bind, dispatch, modal isolation, filter, ordre) | Task 1 | Step 3 |
| Component Factories (9 modules sous render/) | Task 2 | Steps 2-9 |
| makeFileEl avec callbacks (pas d'import de focus.ts/audio.ts) | Task 2 | Step 2 |
| render/index.ts assembleur + ré-exports backward compat | Task 2 | Step 7 |
| Tests fileRow, sourceTree, eparsUI | Task 2 | Step 9 |
| domPatches.ts extrait de render.ts | Task 3 | Step 1 |
| actions.ts découplé du rendu (mutations state pures) | Task 3 | Step 3 |
| Tests domPatches | Task 3 | Step 4 |
| EventEmitter + RAF batcher dans state.ts | Task 4 | Step 2 |
| Proxy set trap émet automatiquement | Task 4 | Step 2 |
| Abonnements render → state events | Task 4 | Step 3 |
| Set/Map → remplacement complet (pas .add/.set silencieux) | Task 4 | Step 4 |
| Suppression renderXxx() manuels | Task 4 | Step 5 |
| Tests EventEmitter (emit, batcher, unsubscribe) | Task 4 | Step 1 |
| focusPath conservé (pas d'index volatil) | Task 5 | Step 1 |
| eparsFocusPath + sourceFocusPath séparés (mémoire panneau) | Task 5 | Step 1 |
| focusItemByPath optimisé (boucle vs querySelector) | Task 5 | Step 3 |
| Double rAF documenté | Task 5 | Step 4 |

---

## Post-implementation

- [x] **Tag final** — `v0.2-clean-architecture` sur 295b38c

- [ ] **Mise à jour de la spec** ⚠️ NON FAIT — documenter les divergences (domPatches supprimé, render.ts non éclaté, EventEmitter non abonné)

- [ ] **Mise à jour de l'interaction map** ⚠️ NON FAIT

- [ ] **Mise à jour du README** ⚠️ NON FAIT

---

## Quick Reference — Commandes Git

```bash
# Vérifier l'état avant de commencer
git log --oneline -5
git status

# Après chaque phase
npm run build && npx tsc --noEmit && npm test

# Tag final
git tag -a v0.2-clean-architecture -m "v0.2-clean-architecture"

# Revenir au tag fonctionnel en cas de problème
git checkout v0.1-functional
```
