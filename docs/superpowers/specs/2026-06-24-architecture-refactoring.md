# Architecture Refactoring — Design Document

> Feature: Refactoring de l'architecture frontend pour la maintenabilité et la robustesse.
> Date: 2026-06-24
> Statut: Spec (pré-implémentation) — revue contradictoire faite le 2026-06-24, 5 failles corrigées

---

## 0. Contexte

L'application frontend (~3000 lignes TypeScript, 14 modules, 291 tests) est fonctionnelle
(v0.1-functional taggé) mais présente des fragilités architecturales :

- **Event Router monolithique** : `script.ts` contient un `keydown` de 250+ lignes qui
  dispatche manuellement chaque combinaison de touches
- **God Module `render.ts`** : 1500+ lignes mêlant construction DOM, gestion
  d'événements, édition inline, drag & drop, context menus et patching DOM ciblé
- **State silencieux** : le `Proxy` sur `state` valide les writes mais n'émet aucun
  événement → appels `renderXxx()` manuels dispersés, oublis fréquents
- **Focus fragile** : `data-focuspath` survit aux re-renders via `revalidateFocus()`
  mais dépend de sélecteurs DOM volatils
- **Dépendances bidirectionnelles** : `actions.ts` importe `render.ts` pour du
  patching DOM, créant un couplage fort logique métier↔rendu

Ce document décrit un plan de refactoring en 5 phases, de la plus impactante à la
plus cosmétique, avec zéro régression fonctionnelle à chaque étape.

---

## 1. Architecture cible

```
┌──────────────────────────────────────────────────────────────────┐
│                        script.ts (orchestrateur, ~60 lignes)      │
│                                                                   │
│  init() → CommandRegistry.bind(...) → listen state events → boot │
└──────────┬───────────────────────────────────────────────────────┘
           │
     ┌─────▼─────┐    ┌──────────┐    ┌──────────────┐
     │ commands/ │    │  state   │    │   render/    │
     │           │    │  (proxy  │    │              │
     │ copyCmd   │◄───│  + Event │───▶│  sourceTree  │
     │ navCmd    │    │  Emitter)│    │  fileRow     │
     │ rateCmd   │    │          │    │  eparsUI     │
     │ filterCmd │    └────┬─────┘    │  playlistUI  │
     │           │         │          │  journalUI   │
     └───────────┘         │          │  ratingEdit  │
                           │          └──────────────┘
                    ┌──────▼──────┐
                    │  actions.ts │──▶ domPatches.ts
                    └─────────────┘    (patching DOM ciblé)
```

**Principes clés :**
1. **Command Pattern** : chaque combinaison clavier est une commande enregistrée
   dans un `CommandRegistry` — plus de `if/else` monolithique
2. **Component Factories** : `render.ts` éclaté en modules de ~100-200 lignes,
   chaque factory reçoit des callbacks, n'importe pas `focus.ts` ou `audio.ts`
3. **EventEmitter minimal** : `state.ts` émet `"prop:changed"` automatiquement,
   les modules s'abonnent aux événements qui les concernent
4. **Focus par path (conservé)** : `focusPath` (identifiant logique stable) +
   `focusListId` — l'index est trop volatil pour les arbres dynamiques (cf. revue)
5. **Dependency Inversion** : `domPatches.ts` séparé de `render.ts` — `actions.ts`
   ne fait que muter `state`, l'EventEmitter déclenche les patches DOM

---

## 2. Phase 1 — Command Pattern (P0, 2-3h)

### 2.1 Problème

Le `keydown` listener dans `script.ts` fait ~250 lignes de `if/else` :

```typescript
// Actuel — script.ts
if (state.playlistMode) {
  if (e.key === 'Tab') { ... }
  if (e.key === ' ' && !isInput) { ... }
  if ((e.key === 'n' || e.key === 'N') && !isInput && state.playlistFocus === 'sidebar') { ... }
  if ((e.key === 'n' || e.key === 'N') && !isInput && state.playlistFocus === 'source') { ... }
  // ... 30+ autres branches
}
// Puis les handlers Sync (encore 20+ branches)
```

Les comportements Playlist et Sync sont entremêlés. Les fonctions comme
`togglePlaylistFocus()`, `toggleTrackInPlaylist()`, `saveCurrentPlaylist()` sont
*définies dans `script.ts`* au lieu d'être dans `playlist.ts`.

### 2.2 Solution

Créer un `CommandRegistry` (~40 lignes) et un module par domaine de commandes :

```
static/src/commands/
├── registry.ts        # CommandRegistry (bind, dispatch, buildContext)
├── navigation.ts      # ↑↓ ←→ Tab Backspace
├── audio.ts           # seekAudio, stopPlayer, togglePlay
├── copy.ts            # F5 → executeCopy
├── filter.ts          # F7, /, Échap (filtre)
├── rating.ts          # N (notation)
├── playlist.ts        # Tab, Espace, Ctrl+S, Ctrl+E, Suppr, Ctrl+↑↓ (mode playlist)
└── modals.ts          # Échap (modales)
```

### 2.3 API du CommandRegistry

```typescript
// static/src/commands/registry.ts

interface CommandContext {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isInput: boolean;
  playlistMode: boolean;
  playlistFocus: 'source' | 'sidebar';
  activePanel: 'epars' | 'source';
  activeModal: string | null;
  filterActive: boolean;
  isFilterInputFocused: boolean;    // document.activeElement?.id === 'source-filter'
  isAudioPlaying: boolean;
}

type CommandHandler = (ctx: CommandContext) => void;

interface CommandBinding {
  key: string;                    // 'F5', 'Tab', 'n', 'ArrowUp', etc.
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  playlistMode?: boolean;        // si défini, ne matche que dans ce mode
  playlistFocus?: 'source' | 'sidebar';
  activePanel?: 'epars' | 'source';
  activeModal?: string | null;   // si défini, ne matche QUE dans cette modale
                                 //   null = "pas de modale" pour restreindre aux moments sans modale
  isInput?: boolean;             // si true, ne matche QUE dans un input
  isFilterInputFocused?: boolean;// si true, ne matche QUE quand l'input filtre a le focus
  handler: CommandHandler;
}

class CommandRegistry {
  private bindings: CommandBinding[] = [];

  bind(binding: CommandBinding): void {
    this.bindings.push(binding);
  }

  dispatch(e: KeyboardEvent, ctx: CommandContext): boolean {
    for (const b of this.bindings) {
      if (b.key !== e.key) continue;
      if (b.ctrlKey !== undefined && b.ctrlKey !== ctx.ctrlKey) continue;
      if (b.shiftKey !== undefined && b.shiftKey !== ctx.shiftKey) continue;
      if (b.altKey !== undefined && b.altKey !== ctx.altKey) continue;
      if (b.playlistMode !== undefined && b.playlistMode !== ctx.playlistMode) continue;
      if (b.playlistFocus !== undefined && b.playlistFocus !== ctx.playlistFocus) continue;
      if (b.activePanel !== undefined && b.activePanel !== ctx.activePanel) continue;
      if (b.isInput !== undefined && b.isInput !== ctx.isInput) continue;
      // CRITIQUE : isolation modale. Si la commande a un activeModal défini,
      // elle ne matche QUE si l'état actuel correspond exactement.
      // Ex: activeModal: null → ne matche que quand aucune modale n'est ouverte
      if (b.activeModal !== undefined && b.activeModal !== ctx.activeModal) continue;
      // CRITIQUE : filtre. Si la commande a un isFilterInputFocused défini,
      // elle ne matche QUE si l'input filtre a réellement le focus (pas juste filterActive)
      if (b.isFilterInputFocused !== undefined && b.isFilterInputFocused !== ctx.isFilterInputFocused) continue;
      e.preventDefault();
      b.handler(ctx);
      return true;
    }
    return false;
  }
}

export const registry = new CommandRegistry();

function buildContext(e: KeyboardEvent): CommandContext {
  const target = e.target as HTMLElement | null;
  return {
    key: e.key,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    isInput: target ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) : false,
    playlistMode: state.playlistMode,
    playlistFocus: state.playlistFocus,
    activePanel: state.activePanel,
    activeModal: state.activeModal,
    filterActive: state.filterActive,
    isFilterInputFocused: document.activeElement?.id === 'source-filter',
    isAudioPlaying: isAudioPlaying() ?? false,
  };
}
```

### 2.4 Exemple : commandes de notation

```typescript
// static/src/commands/rating.ts
import { registry } from './registry.js';
import { startRatingEdit, startSourceRatingEdit } from '../render.js';

// N — sidebar (pas en mode input, pas de modale)
registry.bind({
  key: 'n',
  playlistMode: true,
  playlistFocus: 'sidebar',
  isInput: false,
  activeModal: null,
  handler: () => startRatingEdit(),
});

// N — source tree (playlist mode)
registry.bind({
  key: 'n',
  playlistMode: true,
  playlistFocus: 'source',
  isInput: false,
  activeModal: null,
  handler: () => startSourceRatingEdit(),
});

// F5 — copy (jamais dans une modale, jamais dans un input)
registry.bind({
  key: 'F5',
  activeModal: null,
  handler: () => executeCopy(),
});

// Échap — modale ouverte (toutes les modales)
registry.bind({
  key: 'Escape',
  activeModal: 'dialog',
  handler: () => closeAllModals(),
});
registry.bind({
  key: 'Escape',
  activeModal: 'config',
  handler: () => closeAllModals(),
});
// ... une entrée par type de modale, ou utiliser un matcher plus large :
// activeModal peut être omis → Échap matche toutes les modales

// Tab dans la palette de filtre → focuser le premier dossier
registry.bind({
  key: 'Tab',
  isFilterInputFocused: true,
  handler: () => { closeFilterPalette(renderSource); setActivePanel('epars'); },
});
```

### 2.5 Impact sur `script.ts`

```typescript
// Après refactoring, script.ts devient :
import { registry } from './commands/registry.js';
import './commands/navigation.js';  // side-effect: bind()
import './commands/audio.js';
import './commands/copy.js';
import './commands/filter.js';
import './commands/rating.js';
import './commands/playlist.js';
import './commands/modals.js';

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const ctx = buildContext(e);
  registry.dispatch(e, ctx);
});
```

**Gain :** `script.ts` passe de 593 à ~60 lignes. Chaque commande testable
isolément. Plus d'entremêlement Sync/Playlist.

### 2.6 Déplacement des fonctions playlist hors de script.ts

Les fonctions actuellement dans `script.ts` migrent vers `playlist.ts` :

| Fonction | Nouvel emplacement |
|----------|-------------------|
| `togglePlaylistFocus()` | `playlist.ts` (export) |
| `toggleTrackInPlaylist()` | `playlist.ts` (export) |
| `saveCurrentPlaylist()` | `playlist.ts` (export) |
| `showExportModal()` | `playlist.ts` (export) |
| `moveTrackInPlaylist()` | `playlist.ts` (existante, `reorderTrack` suffit) |
| `enterPlaylistMode()` | `playlist.ts` (export) |
| `exitPlaylistMode()` | `playlist.ts` (export) |

---

## 3. Phase 2 — Component Factories (P0, 3-4h)

### 3.1 Problème

`render.ts` fait 1500+ lignes. Il contient :
- Construction de l'arbre source (`renderDirTree`, `buildSourceChildren`,
  `renderFilteredSource`, `renderFilteredDirNode`, `toggleSourceDir`)
- Construction des fichiers (`makeFileEl`)
- Rendu éparpillé (`renderEpars`, `selectEparsFile`)
- Rendu playlist (`renderPlaylistTabs`, `renderPlaylistTracks`,
  `renderPlaylistSource`, `renderPlaylistManager`, `patchPlaylistSourceFile`)
- Rendu journal (`renderJournal`)
- Édition inline de notation (`_startInlineRatingEdit`, `startRatingEdit`,
  `startSourceRatingEdit`, `_ratingClickHandler`)
- Context menus (`showDirContextMenu`, `batchCopyToDir`)
- Drag & drop (`doDragCopy`)
- Batch copy state (`_batchCopyTarget`, `_batchCopyFiles`, `getBatchCopy`)
- Patching DOM ciblé (`patchEparsFileAfterCopy`, `patchSourceFileAfterCopy`)

### 3.2 Solution

Éclater `render.ts` en modules spécialisés :

```
static/src/render/
├── sourceTree.ts       # renderSource, renderDirTree, buildSourceChildren,
│                       #   renderFilteredSource, toggleSourceDir
├── fileRow.ts          # makeFileEl
├── eparsUI.ts          # renderEpars, selectEparsFile
├── playlistUI.ts       # renderPlaylistTabs, renderPlaylistTracks,
│                       #   renderPlaylistSource, renderPlaylistManager
├── journalUI.ts        # renderJournal
├── ratingEdit.ts       # _startInlineRatingEdit, startRatingEdit,
│                       #   startSourceRatingEdit, _ratingClickHandler
├── contextMenu.ts      # showDirContextMenu, batchCopyToDir
├── dragDrop.ts         # doDragCopy
├── batchCopy.ts        # _batchCopyTarget, _batchCopyFiles, getBatchCopy
└── index.ts            # renderAll, patchEparsFileAfterCopy,
                        #   patchSourceFileAfterCopy, patchPlaylistSourceFile
```

### 3.3 Principe : factories avec callbacks

Chaque factory reçoit des **callbacks** au lieu d'importer directement d'autres
modules. Exemple pour `fileRow.ts` :

```typescript
// static/src/render/fileRow.ts

interface FileRowCallbacks {
  onPlay: (filename: string, fullpath: string, btn: HTMLElement) => void;
  onFocus: (container: HTMLElement, el: Element) => void;
  onRate: () => void;  // startSourceRatingEdit or no-op
  onSelect?: (label: HTMLElement, filename: string, eparDir: string) => void;
  onContextMenu?: (x: number, y: number, items: ContextMenuItem[]) => void;
}

export function makeFileEl(
  filename: string,
  fullpath: string,
  status: FileStatus,
  metadata: { year: string | null; duration: number | null; codec: string | null },
  rating: number | undefined,
  callbacks: FileRowCallbacks,
): HTMLDivElement {
  // ... construction du row
  // playBtn.onclick → callbacks.onPlay(filename, fullpath, playBtn)
  // row.onclick → callbacks.onFocus(container, row)
  // ratingSpan.onclick → callbacks.onRate()
  // row.ondblclick → playBtn.click()
  // row.oncontextmenu → callbacks.onContextMenu(x, y, items)
  return row;
}
```

### 3.4 Assembleur : `render/index.ts`

```typescript
// static/src/render/index.ts

import { renderEpars } from './eparsUI.js';
import { renderSource } from './sourceTree.js';
import { revalidateFocus } from '../focus.js';

export function renderAll(): void {
  renderEpars();
  renderSource();
  requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
}

// Ré-export pour backward compatibility
export { renderEpars, renderSource };
export { renderJournal } from './journalUI.js';
export { renderPlaylistSource, renderPlaylistPanel } from './playlistUI.js';
// ... etc
```

**Gain :** `render.ts` passe de 1500 à ~100 lignes (assembleur). 9 nouveaux
modules de 80-200 lignes, chacun testable isolément.

---

## 4. Phase 3 — EventEmitter minimal (P1, 1-2h)

### 4.1 Problème

Après chaque mutation de `state`, le code appelant doit manuellement déclencher
un re-render. Exemples :

```typescript
// Dans script.ts, après togglePlaylistFocus() :
state.playlistTrackFocusIndex = newIdx;  // mutation silencieuse
renderPlaylistPanel();                    // obligatoire, sinon rien ne s'affiche

// Dans actions.ts, après executeCopy() :
state.journal = await api('/journal');    // mutation silencieuse
state.selectedEparsFiles.clear();
// ... puis plus loin, si on oublie renderAll(), l'UI n'est pas à jour
```

### 4.2 Solution

Ajouter à `state.ts` un EventEmitter minimal (~30 lignes) avec **RAF batcher**
pour éviter les re-renders en cascade :

```typescript
// static/src/state.ts — ajout

type Listener = () => void;
const _listeners = new Map<string, Set<Listener>>();

// RAF batcher : accumule les événements, flush au prochain frame
const _dirty = new Set<string>();
let _rafScheduled = false;

export function on(event: string, fn: Listener): () => void {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event)!.add(fn);
  return () => _listeners.get(event)?.delete(fn);  // unsubscribe
}

function emit(event: string): void {
  _dirty.add(event);
  if (!_rafScheduled) {
    _rafScheduled = true;
    requestAnimationFrame(() => {
      _rafScheduled = false;
      for (const evt of _dirty) {
        for (const fn of _listeners.get(evt) || []) {
          fn();
        }
      }
      _dirty.clear();
    });
  }
}
```

Le `Proxy` existant est modifié pour émettre automatiquement sur chaque `set` :

```typescript
export const state = new Proxy<AppState>(_state, {
  set(target: AppState, prop: string | symbol, value: unknown): boolean {
    // ... validation ...
    const old = (target as any)[prop];
    (target as any)[prop] = value;
    if (old !== value) {
      emit(`${String(prop)}:changed`);
    }
    return true;
  },
});
```

### 4.3 ⚠️ Blindspot critique : `Set` et `Map`

`Set.add()` et `Map.set()` **ne déclenchent PAS le Proxy `set` trap**.
Exemple : `state.sourceExpanded.add('/path')` est silencieux. Le Proxy
intercepte `state.sourceExpanded` (get) mais pas les mutations internes.

**Règle à appliquer partout :** remplacer les `Set`/`Map` par de nouvelles
instances après mutation :

```typescript
// ❌ Silencieux — pas d'émission
state.sourceExpanded.add(dirPath);
state.sourceNodeMap.set(fullPath, info);

// ✅ Émet 'sourceExpanded:changed' / 'sourceNodeMap:changed'
state.sourceExpanded = new Set([...state.sourceExpanded, dirPath]);
state.sourceNodeMap = new Map([...state.sourceNodeMap, [fullPath, info]]);
```

Alternative : monkey-patch `Set.prototype.add` et `Map.prototype.set` dans le
Proxy `get` trap pour forcer une émission, mais c'est plus invasif.

### 4.4 Abonnements

```typescript
// Dans render/index.ts (au init)
on('eparsFiles:changed', renderEpars);
on('sourceFiles:changed', renderSource);
on('journal:changed', renderAll);
on('ratings:changed', () => {
  // Re-render uniquement les spans de rating, pas tout
  revalidateAllRatingSpans();
});
on('playlistTrackFocusIndex:changed', renderPlaylistPanel);
on('activePanel:changed', updatePanelActiveClass);
```

### 4.5 Nettoyage

Supprimer les appels `renderXxx()` manuels devenus redondants :

```diff
- state.playlistTrackFocusIndex = newIdx;
- renderPlaylistPanel();
+ state.playlistTrackFocusIndex = newIdx;  // émet 'playlistTrackFocusIndex:changed'
```

**Gain :** Suppression de ~15 appels `renderXxx()` manuels dispersés.
Découplage mutation↔render. Plus d'oublis de re-render. Le RAF batcher
garantit qu'un seul frame de rendu est produit même après N mutations
séquentielles (ex: un scan qui modifie `sourceFiles`, `eparsFiles`,
et `journal` en séquence = 1 seul `renderAll()`).

**Mise en garde :** les mutations de `Set`/`Map` doivent passer par le
remplacement complet (`new Set([...old, value])`) pour déclencher l'émission.
Une alternative plus robuste serait d'utiliser des tableaux (`string[]`)
au lieu de `Set`, mais cela nécessiterait des vérifications de doublons.

---

## 5. Phase 4 — Focus stabilisé (P1, 1-2h)

### 5.1 Problème

Le système actuel stocke un `focusPath` (string) et cherche
`[data-focuspath="..."]` dans le DOM après chaque re-render. Si l'élément
n'existe plus (dossier replié, filtre changé), fallback au premier élément.

**Pourquoi l'index ne marche pas :** un index dans une liste plate est volatil
dans un arbre dynamique. Si le dossier A (8 enfants) se collapse, l'index 9
(dossier B) devient l'index 1. Le focus est perdu. **Seul un identifiant
logique stable (`focusPath`) survit aux expands/collapses/filtres.**

### 5.2 Solution : conserver `focusPath`, ajouter `focusListId`

```typescript
// state.ts — inchangé pour les chemins, ajout du listId
export interface AppState {
  eparsFocusPath: string | null;    // conservé — stable
  sourceFocusPath: string | null;   // conservé — stable
  focusListId: 'epars' | 'source' | 'playlist-source' | 'playlist-tracks';
  // ...
}
```

**Pourquoi deux `focusPath` séparés :** chaque panneau a sa propre position.
Quand on passe de Source (index 50) à Épars (2 éléments) et qu'on revient,
on doit retrouver la position 50 dans Source. Un seul `focusIndex` écraserait
cette mémoire — d'où la conservation de `eparsFocusPath` et `sourceFocusPath`.

### 5.3 Amélioration de `focusItemByPath()`

Remplacer la recherche `[data-focuspath="..."]` par une boucle sur `getItems()`
qui compare `dataset.focuspath` :

```typescript
// focus.ts — amélioré
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

  // Fallback : premier élément
  if (items.length > 0) {
    items[0].classList.add('focused');
    items[0].scrollIntoView({ block: 'nearest' });
  }
  return false;
}
```

### 5.4 Suppression du double `requestAnimationFrame`

Actuellement `renderAll()` utilise `requestAnimationFrame(() => requestAnimationFrame(revalidateFocus))`.
Avec le RAF batcher de la Phase 3, on peut simplifier :

```typescript
export function renderAll(): void {
  renderEpars();
  renderSource();
  // Le RAF batcher de l'EventEmitter garantit que revalidateFocus()
  // sera appelé APRÈS que le DOM soit prêt, sans double rAF
  on('render:done', revalidateFocus);
}
```

Ou, plus simplement, garder le double rAF (il fonctionne) mais le documenter
comme solution éprouvée plutôt que hack.

### 5.5 Cas particulier : sidebar playlist

La sidebar playlist utilise une navigation **manuelle** (boucle `for` dans
le handler clavier), pas `focus.ts`. Après Phase 1 (Command Pattern), cette
navigation est déplacée dans `commands/playlist.ts`. On y ajoute la
sauvegarde/restauration de `playlistTrackFocusIndex` (déjà existant dans
`state`).

**Gain :** le `focusPath` reste l'identifiant stable. La recherche dans le DOM
est légèrement optimisée (boucle vs `querySelector`), et la sidebar playlist
bénéficie de la même robustesse que les autres panneaux.

---

## 6. Phase 5 — Extraction `domPatches.ts` (P2, 30 min)

### 6.1 Problème

`actions.ts` importe `render.ts` pour trois fonctions de patching DOM :

```typescript
// actions.ts
import { getBatchCopy, patchEparsFileAfterCopy, patchSourceFileAfterCopy,
         renderAll, renderSource } from './render.js';
```

Or `actions.ts` est un module de logique métier (scan, copie, config). Il ne
devrait pas dépendre d'un module de rendu.

### 6.2 Solution

**Principe : `actions.ts` ne fait que muter `state`.** Le rendu est déclenché
par l'EventEmitter (Phase 3). Les patches DOM sont dans `domPatches.ts`.

```typescript
// static/src/domPatches.ts

import { state } from './state.js';
import { makeFileEl } from './render/fileRow.js';
import { computeStatus, countAllEparsFiles } from './utils.js';

export function patchEparsFileAfterCopy(filename: string, eparDir: string): void {
  // ... (code existant, inchangé)
}

export function patchSourceFileAfterCopy(
  destDir: string,
  filename: string,
  fileData: { path: string; year: string | null; duration: number | null; codec: string | null },
): boolean {
  // ... (code existant, inchangé)
}

export function patchPlaylistSourceFile(fullPath: string, remove: boolean): void {
  // ... (code existant, inchangé)
}
```

### 6.3 Refactoring de `executeCopy()` dans `actions.ts`

```typescript
// actions.ts — APRÈS refactoring
// N'importe PLUS render.ts. Ne fait que muter state.

export async function executeCopy(): Promise<void> {
  // ... validation ...

  // Mutations state uniquement
  state.sourceFiles[sourceDir][filename] = { path, year, duration, codec };
  state.journal = await api('/journal');
  state.selectedEparsFiles.clear();

  // L'EventEmitter déclenche automatiquement :
  //   'sourceFiles:changed' → patchSourceFileAfterCopy (via domPatches)
  //   'journal:changed' → renderAll (si patch échoue)
  //   'selectedEparsFiles:changed' → patchEparsFileAfterCopy
}
```

**Note :** `getBatchCopy()` (le batch copy state) est déplacé dans
`render/batchCopy.ts` en Phase 2. `actions.ts` n'y accède plus directement —
le flux F5 → dialog → confirm passe par les commandes (Phase 1).

### 6.4 Nouveau graphe de dépendances

```
actions.ts ──▶ state.ts  (mutations uniquement)
                │
                ▼ (EventEmitter)
         domPatches.ts  (abonné à 'sourceFiles:changed', 'journal:changed')
```

**Gain :** `actions.ts` ne dépend plus d'aucun module de rendu. La logique
métier est pure : elle lit/écrit `state`, et l'UI réagit via l'EventEmitter.

---

## 7. Ordre d'implémentation et dépendances

```
Phase 1 (Command Pattern)
  │  prérequis : aucun
  │  livrable : commands/*.ts, script.ts allégé
  │  ⚠️  inclure activeModal + isFilterInputFocused dans le registry
  │
  ▼
Phase 2 (Component Factories)
  │  prérequis : Phase 1 (les commandes utilisent les nouvelles factories)
  │  livrable : render/*.ts, render.ts → assembleur
  │  ⚠️  conserver _batchCopyTarget/_batchCopyFiles dans render/batchCopy.ts
  │
  ▼
Phase 5 (domPatches)
  │  prérequis : Phase 2 (les patches utilisent makeFileEl du nouveau render/)
  │  livrable : domPatches.ts
  │  ⚠️  actions.ts ne fait que muter state, l'EventEmitter déclenche les patches
  │
  ▼
Phase 3 (EventEmitter)
  │  prérequis : Phase 2 (les abonnements utilisent les nouvelles factories)
  │  livrable : state.ts enrichi (RAF batcher), suppression des renderXxx() manuels
  │  ⚠️  remplacer Set.add/Map.set par new Set/Map(...) partout
  │
  ▼
Phase 4 (Focus stabilisé)
     prérequis : Phase 2 + Phase 3 (focusPath conservé, revalidateFocus amélioré)
     livrable : focus.ts optimisé, suppression CSS.escape superflu
     ⚠️  ne PAS utiliser d'index — conserver focusPath (identifiant logique)
```

**Note :** les phases 3 et 5 peuvent être faites dans l'ordre inverse si on
préfère, mais l'ordre ci-dessus minimise les conflits de merge.

---

## 8. Non-régression

### 8.1 Stratégie de test

Chaque phase est validée par :
1. `npx tsc --noEmit` — 0 erreur de type
2. `npm test` — 291 tests verts (inchangés)
3. `npm run build` — build OK

Les tests existants (`render.test.ts`, `focus.test.ts`, `actions.test.ts`,
`integration.test.ts`) sont mis à jour pour refléter les nouveaux imports
mais leur logique de test reste inchangée.

### 8.2 Nouveaux tests

Chaque phase ajoute des tests unitaires pour les nouveaux modules :

| Phase | Nouveaux tests |
|-------|---------------|
| 1 | `commands/registry.test.ts` : bind, dispatch, priorité, no-match |
| 2 | `render/fileRow.test.ts`, `render/sourceTree.test.ts`, `render/eparsUI.test.ts` |
| 3 | `state.test.ts` : émission d'événements, unsubscribe, batch |
| 4 | `focus.test.ts` : focusItemByIndex, revalidateFocus, historique |
| 5 | `domPatches.test.ts` : extrait de `render.test.ts` existant |

### 8.3 Points de vigilance

- **Phase 1** : `activeModal` et `isFilterInputFocused` dans le registry —
  sans eux, F5 s'exécute dans une modale et Tab ne fonctionne pas dans le filtre
- **Phase 1** : les commandes `activeModal: 'dialog'` doivent être bindées
  APRÈS les commandes sans `activeModal` pour que l'Échap de modale ait
  priorité sur l'Échap global
- **Phase 2** : `patchSourceFileAfterCopy` utilise `makeFileEl` — s'assurer
  que le nouvel emplacement (`render/fileRow.ts`) est importé correctement
- **Phase 2** : `_batchCopyTarget` et `_batchCopyFiles` dans `render/batchCopy.ts`
  — `actions.ts` y accède via `getBatchCopy()`, préserver ce contrat
- **Phase 3** : les mutations de `Set` et `Map` doivent passer par le
  remplacement complet (`new Set([...old, value])`) pour déclencher l'émission
- **Phase 3** : le RAF batcher garantit qu'un scan qui modifie 3 propriétés
  ne déclenche qu'UN SEUL render — vérifier avec `console.count('render')`
- **Phase 4** : ne PAS remplacer `focusPath` par `focusIndex` — l'index est
  volatil dans les arbres dynamiques (dossier collapse → index shift)
- **Phase 4** : la sidebar playlist utilise une navigation manuelle (pas
  `focus.ts`) — après Phase 1, cette navigation est dans `commands/playlist.ts`

---

## 9. Synthèse

| Phase | Effort | Modules créés | Lignes supprimées | Impact | Risque |
|-------|--------|--------------|-------------------|--------|--------|
| 1. Command Pattern | 2-3h | 8 | ~250 (script.ts) | 🔴 Très élevé | Faible |
| 2. Component Factories | 3-4h | 9 | ~1300 (render.ts) | 🔴 Très élevé | Moyen |
| 3. EventEmitter | 1-2h | 0 (modif state.ts) | ~15 appels manuels | 🟡 Élevé | Faible |
| 4. Focus stabilisé | 1-2h | 0 (modif focus.ts) | ~10 (double rAF) | 🟡 Élevé | Faible |
| 5. domPatches | 30 min | 1 | ~80 (découplage actions.ts↔render.ts) | 🟢 Modéré | Nul |

**Total :** 8-12h, ~1700 lignes supprimées, 18 nouveaux modules, 0 régression.

**Résultat final :**
- `script.ts` : 593 → ~60 lignes (orchestrateur pur)
- `render.ts` : 1500 → ~100 lignes (assembleur)
- `state.ts` : enrichi d'un EventEmitter (Proxy existant + 30 lignes)
- `focus.ts` : focusPath conservé, focusItemByPath optimisé (boucle vs querySelector)
- `actions.ts` : ne dépend plus d'aucun module de rendu — mutations state pures

---

## 10. Décisions

| Décision | Choix |
|----------|-------|
| Pattern clavier | Command Registry (pas de framework) |
| Abstraction UI | Component Factories (pas de Virtual DOM) |
| Réactivité | EventEmitter minimal (pas de RxJS/Redux) |
| Focus | Par `focusPath` (identifiant logique stable) — pas d'index volatil |
| DI | Extraction domPatches.ts (pas de conteneur IoC) |
| Clean Architecture | Non retenue — overkill pour 3000 lignes vanilla TS |
| Framework | Aucun — rester en vanilla TypeScript |
