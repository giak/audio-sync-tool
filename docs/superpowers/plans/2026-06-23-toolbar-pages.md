# Toolbar Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task.

**Goal:** Repenser la toolbar pour séparer la navigation entre deux pages (Sync et Playlist) des outils globaux (Config, Scan, Journal, Aide). Remplacer le bouton Playlist actuel par deux boutons de navigation, supprimer le comportement Échap = quitter Playlist.

**Architecture:** Modification du `<header>` HTML, ajout de styles CSS pour `.page-btn`, mise à jour de `script.ts` pour binder les nouveaux boutons et supprimer l'ancien flux Échap → exitPlaylistMode.

**Tech Stack:** TypeScript + HTML + CSS (frontend), pas de changement backend.

## Global Constraints

- Aucune régression : toutes les fonctionnalités existantes (Sync, Playlist, outils, modales, filtres, audio) doivent rester fonctionnelles
- Changements limités à 3 fichiers : `templates/index.html`, `static/style.css`, `static/src/script.ts`
- Build, tsc, tests doivent passer

---

## Pre-flight Checklist (lecture obligatoire avant d'implémenter)

- [ ] Lire `docs/superpowers/specs/2026-06-23-toolbar-pages-design.md` — spec complète
- [ ] Lire `templates/index.html` — header actuel, structure du toolbar
- [ ] Lire `static/src/script.ts` — handlers existants (btn-playlist, enter/exitPlaylistMode, keydown Échap)
- [ ] Lire `static/style.css` — styles `header` et `#toolbar` existants

---

### Task 1: HTML — Nouveaux boutons de navigation

**Files:**
- Modify: `templates/index.html`

**Interfaces:**
- Remplace `<button id="btn-playlist">🎵 Playlist</button>` par `<div id="page-nav">` avec deux boutons
- Le title `<h1>Audio Sync Tool</h1>` peut être conservé ou remplacé — dans le design final ce sont les boutons pages qui dominent

- [ ] **Step 1: Remplacer le bouton Playlist par les boutons de navigation**

Dans le `<header>`, remplacer :

```html
    <div id="toolbar">
      <button id="btn-config">⚙️ Config</button>
      <button id="btn-scan">🔄 Scan</button>
      <button id="btn-journal">📋 Journal</button>
      <button id="btn-legend">❓ Raccourcis</button>
      <button id="btn-playlist">🎵 Playlist</button>
    </div>
```

Par :

```html
    <div id="page-nav">
      <button id="page-sync" class="page-btn active">📦 Sync</button>
      <button id="page-playlist" class="page-btn">🎵 Playlist</button>
    </div>
    <div id="toolbar">
      <button id="btn-config">⚙️ Config</button>
      <button id="btn-scan">🔄 Scan</button>
      <button id="btn-journal">📋 Journal</button>
      <button id="btn-legend">❓ Raccourcis</button>
    </div>
```

Le `#page-nav` est placé AVANT `#toolbar` pour que les pages soient à gauche et les outils à droite.

Le `title` dans le `<head>` reste `Audio Sync Tool` et le `<h1>` peut rester ou être retiré (les boutons Sync/Playlist sont suffisants comme identité visuelle).

- [ ] **Step 2: Vérifier que le DOM est cohérent**

Les IDs suivants doivent exister pour que `script.ts` continue de fonctionner :
- `#btn-config`, `#btn-scan`, `#btn-journal`, `#btn-legend` → inchangés
- `#page-sync`, `#page-playlist` → nouveaux, vont être bindés dans Task 3
- `#btn-playlist` → supprimé, son handler sera retiré dans Task 1

- [ ] **Step 3: Commit**

```bash
git add templates/index.html
git commit -m "feat(html): navigation pages Sync et Playlist dans le header"
```

---

### Task 2: CSS — Styles de navigation des pages

**Files:**
- Modify: `static/style.css`

**Interfaces:**
- Nouveaux styles : `#page-nav`, `.page-btn`, `.page-btn.active`
- Le toolbar (`#toolbar`) doit se positionner à droite via `margin-left: auto`
- Le header a déjà `display: flex; align-items: center; gap: 20px` — conserver

- [ ] **Step 1: Ajouter les styles page-nav**

Ajouter dans `style.css`, après la section `header h1` :

```css
/* ===== Page Navigation =============================================== */
#page-nav {
  display: flex;
  gap: 4px;
}
.page-btn {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-panel);
  padding: 5px 14px;
  cursor: pointer;
  font-size: 13px;
  border-radius: 3px;
  transition: background 0.15s, border-color 0.15s;
}
.page-btn.active {
  background: var(--bg-focus);
  border-color: var(--border-active);
  color: var(--accent);
}
.page-btn:hover {
  background: var(--bg-focus);
}
```

- [ ] **Step 2: Pousser les outils à droite**

Dans les styles existants, le `#toolbar` est dans un `header` avec `display: flex`. Ajouter `margin-left: auto` au `#toolbar` pour qu'il se cale à droite :

```css
#toolbar {
  display: flex; gap: 6px;
  margin-left: auto;
}
```

- [ ] **Step 3: Ajuster le header h1 (optionnel)**

Le `<h1>Audio Sync Tool</h1>` peut être conservé ou réduit. Si on le garde, il est à gauche avant `#page-nav`. Si on le retire, les boutons Sync/Playlist sont directement à gauche. Conserver le `<h1>` est plus propre (identité de l'app).

- [ ] **Step 4: Commit**

```bash
git add static/style.css
git commit -m "feat(css): styles page-nav + toolbar aligné à droite"
```

---

### Task 3: TypeScript — Handlers Sync/Playlist + suppression Échap

**Files:**
- Modify: `static/src/script.ts`

**Interfaces:**
- Supprimer ou commenter le handler `#btn-playlist`
- Ajouter les handlers `#page-sync` et `#page-playlist`
- Mettre à jour `.page-btn.active` dans `enterPlaylistMode()` et `exitPlaylistMode()`
- Supprimer le comportement Échap = exitPlaylistMode dans le keydown handler
- Tout le reste du routage clavier Playlist reste inchangé (Tab, Espace, Ctrl+S, etc.)

- [ ] **Step 1: Remplacer le handler btn-playlist par page-sync et page-playlist**

Dans la section `// ── Toolbar bindings`, remplacer :

```ts
(document.getElementById('btn-playlist') as HTMLElement | null)!.onclick = async () => {
  if (state.playlistMode) {
    exitPlaylistMode();
  } else {
    await enterPlaylistMode();
  }
};
```

Par :

```ts
// Navigation Sync / Playlist
(document.getElementById('page-sync') as HTMLElement | null)!.onclick = () => {
  if (state.playlistMode) exitPlaylistMode();
};
(document.getElementById('page-playlist') as HTMLElement | null)!.onclick = async () => {
  if (!state.playlistMode) await enterPlaylistMode();
};
```

- [ ] **Step 2: Mettre à jour enterPlaylistMode() et exitPlaylistMode()**

Dans `enterPlaylistMode()`, ajouter après le bloc qui initialise l'index de playlist :

```ts
  // Update page nav active state
  document.getElementById('page-sync')?.classList.remove('active');
  document.getElementById('page-playlist')?.classList.add('active');
```

Dans `exitPlaylistMode()`, ajouter après avoir masqué le layout :

```ts
  // Update page nav active state
  document.getElementById('page-playlist')?.classList.remove('active');
  document.getElementById('page-sync')?.classList.add('active');
```

- [ ] **Step 3: Supprimer Échap = exitPlaylistMode**

Dans le `keydown` handler, à l'intérieur du bloc `if (state.playlistMode)`, supprimer la première ligne :

```ts
// AVANT (à supprimer) :
if (e.key === 'Escape') {
  e.preventDefault();
  exitPlaylistMode();
  return;
}

// APRÈS : cette ligne est supprimée. Échap dans le bloc playlistMode
// ne fait plus rien de spécial — il tombe dans le handler Échap global
// (fermer modale, stopper audio, etc.)
```

Plus précisément, retirer ces 5 lignes du bloc `if (state.playlistMode)` :

```ts
if (e.key === 'Escape') {
  e.preventDefault();
  exitPlaylistMode();
  return;
}
```

Maintenant, Échap en mode Playlist continue à tomber dans le handler global existant (lignes suivantes après le bloc playlistMode) qui gère :
- `if (state.filterActive)` → fermer le filtre
- `if (isAudioPlaying())` → stopper l'audio
- `return;` (sinon rien)

- [ ] **Step 4: Commit**

```bash
git add static/src/script.ts
git commit -m "feat(ts): handlers page-sync/page-playlist, suppression Échap=exit"
```

---

### Task 4: Build + typecheck + tests + smoke test

**Files:**
- Aucune modification — validation uniquement

- [ ] **Step 1: Build**

```bash
cd /home/giak/projects/audio-sync-tool
npm run build
```

Expected: Build OK, `static/dist/` contient tous les `.js`.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 erreurs.

- [ ] **Step 3: Tests**

```bash
npm test
```

Expected: 290/290 pass (ou le nombre actuel). Aucun test ne devrait casser car on ne change que des bindings DOM et un comportement clavier (Échap).

- [ ] **Step 4: Smoke test manuel dans le navigateur**

Lancer le serveur : `./venv/bin/python app.py`

1. ✅ La toolbar montre `[📦 Sync] [🎵 Playlist]` à gauche, `⚙️ 🔄 📋 ❓` à droite
2. ✅ Sync est actif (style `.active`) par défaut
3. ✅ Cliquer sur **Playlist** → bascule en mode Playlist, Playlist devient actif
4. ✅ Cliquer sur **Sync** → retourne à la vue normale, Sync redevient actif
5. ✅ **Échap** en mode Playlist → ne quitte PAS le mode Playlist
6. ✅ **Tab** en mode Playlist → bascule source/sidebar (inchangé)
7. ✅ Tous les outils (Config, Scan, Journal, Aide) fonctionnent dans les deux pages
8. ✅ Les modales s'ouvrent/ferment correctement dans les deux pages
9. ✅ F5, F7, raccourcis clavier normaux inchangés
10. ✅ Recharger la page → Sync est actif (état initial)

- [ ] **Step 5: Commit**

```bash
# Pas de commit si tout est déjà commité dans les tasks précédentes.
# Ce task est purement validation.
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Boutons Sync et Playlist dans le header | Task 1, Step 1 |
| Outils alignés à droite | Task 2, Step 2 |
| Style visuel page active (`.page-btn.active`) | Task 2, Step 1 |
| Clic page active → rien | Task 3, Step 1 (guard `if (state.playlistMode)` / `if (!state.playlistMode)`) |
| Clic autre page → bascule | Task 3, Step 1 |
| Échap ne navigue plus | Task 3, Step 3 |
| Outils inchangés (dispo dans les deux pages) | Aucun changement — validation Task 4 |
| Modales fonctionnent dans les deux pages | Aucun changement — validation Task 4 |
| `state.playlistMode` et `state.playlistFocus` inchangés | Aucun changement |
| Layouts `#main-panels` / `#playlist-layout` | Aucun changement HTML (déjà existants) |
