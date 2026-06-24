# Toolbar Pages — Design Document

## 1. Objectif

Repenser la toolbar pour distinguer **deux pages applicatives** (Sync et Playlist)
des **outils globaux** (Config, Scan, Journal, Aide). Actuellement, le bouton Playlist
est noyé parmi les outils, alors que c'est une page entière avec son propre layout.

## 2. Architecture

```
╔══ Audio Sync Tool ═══════════════════════════════════╗
║                                                     ║
║  [📦 Sync]  [🎵 Playlist]         ⚙️  🔄  📋  ❓   ║
║  ▲ pages (alignées gauche)        ▲ outils (droite) ║
║                                                     ║
╚══════════════════════════════════════════════════════╝
```

La toolbar reste dans le `<header>`, mais avec deux groupes visuels :

- **Pages** (float left / flex start) : boutons de navigation. Un seul actif à la
  fois. Style visuel distinct de la page active (bordure, fond).
- **Outils** (float right / margin-left: auto) : Config, Scan, Journal, Aide.
  Disponibles dans les deux pages. Logique inchangée.

## 3. Pages

| Page | Icône | Titre | Rendu | Layout |
|------|-------|-------|-------|--------|
| **Sync** | 📦 | Sync | `#main-panels` | Deux panneaux : Éparpillé (gauche) / Source Data (droite) |
| **Playlist** | 🎵 | Playlist | `#playlist-layout` | Source browser (gauche) / Sidebar + tracks (droite) |

### Comportement

- **Clic sur la page active** → rien (déjà dessus)
- **Clic sur l'autre page** → bascule vers cette page
- **Échap** → n'est PAS un raccourci de navigation. Annulation uniquement
  (fermer modale, stopper audio, quitter le filtre).
- Les deux pages ne coexistent jamais : une seule est visible à la fois
  (`#main-panels` XOR `#playlist-layout`).

## 4. Modifications

### 4.1 HTML (`templates/index.html`)

- Remplacer `<h1>Audio Sync Tool</h1>` par deux boutons de navigation dans
  le `<header>` :

```html
<div id="page-nav">
  <button id="page-sync" class="page-btn active">📦 Sync</button>
  <button id="page-playlist" class="page-btn">🎵 Playlist</button>
</div>
```

- Supprimer le bouton `#btn-playlist` des outils (redondant avec le nav).
- Les boutons d'outils (Config, Scan, Journal, Raccourcis) restent inchangés.

### 4.2 CSS (`static/style.css`)

Styles pour la navigation de pages :

```css
#page-nav { display: flex; gap: 4px; }
.page-btn {
  background: var(--bg-hover); color: var(--text-secondary);
  border: 1px solid var(--border-panel);
  padding: 5px 14px; cursor: pointer;
  font-size: 13px; border-radius: 3px;
}
.page-btn.active {
  background: var(--bg-focus);
  border-color: var(--border-active);
  color: var(--accent);
}
.page-btn:hover { background: var(--bg-focus); }
```

- Les outils sont poussés à droite via `margin-left: auto` sur le `#toolbar`.
- Le `header` a déjà `display: flex; align-items: center; gap: 20px` → OK.

### 4.3 TypeScript (`static/src/script.ts`)

- Supprimer le handler de `#btn-playlist` (plus nécessaire).
- Ajouter les handlers `#page-sync` et `#page-playlist` :

```ts
document.getElementById('page-sync').onclick = () => {
  if (state.playlistMode) exitPlaylistMode();
};
document.getElementById('page-playlist').onclick = () => {
  if (!state.playlistMode) enterPlaylistMode();
};
```

- Mettre à jour `.page-btn.active` dans `enterPlaylistMode()` et
  `exitPlaylistMode()` :

```ts
// Dans enterPlaylistMode() :
document.getElementById('page-sync')?.classList.remove('active');
document.getElementById('page-playlist')?.classList.add('active');

// Dans exitPlaylistMode() :
document.getElementById('page-playlist')?.classList.remove('active');
document.getElementById('page-sync')?.classList.add('active');
```

- Supprimer le comportement Échap = quitter Playlist → Échap ne sort plus
  du mode Playlist. Échap garde son rôle existant (modales, filtres, audio).

## 5. Ce qui ne change pas

- **Outils** : Config, Scan, Journal, Aide — même logique, même DOM, même
  position dans la toolbar.
- **Modales** : fonctionnement identique, accessibles dans les deux pages.
- **Barre de statut** : même contenu, juste le message par défaut qui
  s'adapte à la page active.
- **Modes** : les concepts `state.playlistMode` et `state.playlistFocus`
  restent inchangés, seul le moyen de basculer change.
- **Échap** : ne quitte plus Playlist. Pour quitter Playlist, on clique
  sur **Sync** dans le nav.

## 6. État de la toolbar selon la page

### Page Sync active

```
[📦 Sync]  [🎵 Playlist]         ⚙️ Config  🔄 Scan  📋 Journal  ❓ Aide
 ──────── (actif)
```

### Page Playlist active

```
[📦 Sync]  [🎵 Playlist]         ⚙️ Config  🔄 Scan  📋 Journal  ❓ Aide
           ──────────── (actif)
```

## 7. Résumé des décisions

| Décision | Choix |
|----------|-------|
| Nom page 1 | **Sync** |
| Nom page 2 | **Playlist** |
| Visuel pages | Boutons groupés à gauche, outils à droite |
| Page active | Style `.page-btn.active` (fond + bordure active) |
| Navigation | Clic sur les boutons page uniquement (pas Échap) |
| Échap | Annulation seulement (modales, filtres, audio) |
| Outils | Inchangés, dispo dans les deux pages |
