# Lecture panneau Playlist (bouton ▶ par piste) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre la lecture d'une piste depuis le panneau Playlist avec un bouton ▶ par ligne (comme l'arbre source), état ⏹ + glow du nom piloté par l'infra audio existante.

**Architecture:** Chaque ligne `.pl-track` reçoit un `<span class="play-btn" title="Écouter">▶</span>` (pattern exact de `fileRow.ts`). La lecture réutilise `togglePlay` tel quel (il gère déjà `.playing`/⏹ globalement). Le glow `.led-playing` sur `.pl-track-name` est piloté dans le handler `audio:changed` existant de `render.ts`, extrait en `updatePlaylistLedIndicator()` testable — il re-pose le glow sur la ligne dont le bouton est `.playing` et nettoie sinon. Aucune modif d'`audio.ts`, de `templates/index.html` ni de CSS.

**Tech Stack:** TypeScript (DOM), vitest (jsdom), esbuild, Flask/Jinja

## Global Constraints

- NE PAS toucher à `audio.ts`, `templates/index.html`, `static/style.css` (hors périmètre)
- La souscription `audio:changed` reste unique ; le count `on()` total dans `render.test.ts:1483` reste **7** (pas de nouvelle souscription)
- Pattern bouton : `<span class="play-btn" title="Écouter">▶</span>` + `stopPropagation()` + guard du row focus — identique à `fileRow.ts:26-34,99`
- Dérivation `filename`/`fullPath` depuis la ligne (`.pl-track-name` / `.pl-track-remove` dataset) — même pattern que le double-clic `playlistUI.ts:211-213`
- Double-clic et menu « ▶ Jouer » (contextuel) : INCHANGÉS (leur `querySelector('.play-btn') || trackEl` résout désormais le vrai bouton)
- TDD strict (test RED → implé min → test GREEN → commit par tâche)
- Import type uniquement si un type est partagé entre tâches (aucun prévu ici)
- Suite de validation fin de branche : `npm test`, `npm run typecheck`, `npm run build`, `./venv/bin/python -m pytest -q`
- Lint biome : 12 erreurs pré-existantes hors périmètre — ne pas en ajouter de nouvelles; le gate est typecheck + tests + build

---

### Task 1: `render.ts` — extraction de `updatePlaylistLedIndicator` (glow nom playlist)

**Files:**
- Modify: `static/src/render.ts:74-85`
- Test: `static/src/render.test.ts` (import + nouveau `describe` à la fin du fichier)

**Interfaces:**
- Produces: `export function updatePlaylistLedIndicator(): void` — nettoie `.led-playing` dans `#playlist-panel`, puis repose le glow sur `.pl-track-name` de la ligne dont le `.play-btn` a la classe `playing` ; no-op si `#playlist-sidebar` masquée ou absente, ou si `#playlist-panel` absent.

- [ ] **Step 1: Écrire le test RED**

Dans `static/src/render.test.ts`, ligne 54-63, ajouter `updatePlaylistLedIndicator` à l'import :

```typescript
import {
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  renderEpars,
  renderJournal,
  renderSource,
  setupRenderSubscriptions,
  togglePlaylistSourceDir,
  toggleSourceDir,
  updatePlaylistLedIndicator,
} from './render.js';
```

À la fin du fichier (après le `describe('setupRenderSubscriptions', ...)` fermé ligne 1487), ajouter :

```typescript
describe('updatePlaylistLedIndicator', () => {
  it('applique led-playing au nom de la piste en lecture', () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar">
        <div id="playlist-panel">
          <div class="pl-track">
            <span class="play-btn playing">⏹</span>
            <span class="pl-track-name">song.mp3</span>
          </div>
        </div>
      </div>
    `;
    updatePlaylistLedIndicator();
    expect(document.querySelector('.pl-track-name')?.classList.contains('led-playing')).toBe(true);
  });

  it('retire led-playing quand aucune piste n\'est en lecture', () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar">
        <div id="playlist-panel">
          <div class="pl-track">
            <span class="play-btn">▶</span>
            <span class="pl-track-name led-playing">song.mp3</span>
          </div>
        </div>
      </div>
    `;
    updatePlaylistLedIndicator();
    expect(document.querySelector('.pl-track-name')?.classList.contains('led-playing')).toBe(false);
  });

  it('no-op quand la sidebar est masquée', () => {
    document.body.innerHTML = `
      <div id="playlist-sidebar" class="hidden">
        <div id="playlist-panel">
          <div class="pl-track">
            <span class="play-btn playing">⏹</span>
            <span class="pl-track-name">song.mp3</span>
          </div>
        </div>
      </div>
    `;
    updatePlaylistLedIndicator();
    expect(document.querySelector('.pl-track-name')?.classList.contains('led-playing')).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run static/src/render.test.ts`
Expected: FAIL — « updatePlaylistLedIndicator is not a function » / « has no exported member »

- [ ] **Step 3: Implémentation minimale**

Dans `static/src/render.ts`, remplacer le corps du handler `audio:changed` (l.74-85) par un appel à la fonction exportée, et ajouter la fonction juste après le bloc `export { ... }` (l.20-39), avant le commentaire l.41 :

```typescript
export function updatePlaylistLedIndicator(): void {
  const sidebarEl = document.getElementById('playlist-sidebar');
  if (!sidebarEl || sidebarEl.classList.contains('hidden')) return;
  const container = document.getElementById('playlist-panel');
  if (!container) return;
  container.querySelectorAll('.led-playing').forEach(el => {
    el.classList.remove('led-playing');
  });
  const playingRow = container.querySelector('.play-btn.playing')?.closest('.pl-track');
  const name = playingRow?.querySelector('.pl-track-name');
  if (name) name.classList.add('led-playing');
}
```

Dans `setupRenderSubscriptions`, à la place du bloc l.74-85 :

```typescript
  // When audio starts/stops, keep the playlist track indicator in sync
  on('audio:changed', updatePlaylistLedIndicator);
```

Le commentaire du bloc peut rester sur une ligne (voir ci-dessus) ; ne pas en ajouter d'autres.

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run static/src/render.test.ts`
Expected: PASS (le count de souscriptions de `render.test.ts:1483` reste 7 → pas plus de nouveaux tests cassés)

- [ ] **Step 5: Commit**

```bash
git add static/src/render.ts static/src/render.test.ts
git commit -m "feat(render): updatePlaylistLedIndicator — glow nom piste playlist piloté par .play-btn.playing"
```

---

### Task 2: `playlistUI.ts` — bouton ▶ par ligne de playlist

**Files:**
- Modify: `static/src/render/playlistUI.ts:140-141` (template ligne), `:185-191` (après le bloc cue-btn), `:196` (guard focus)
- Test: `static/src/render/playlistUI.test.ts` (import + 3 tests dans le `describe` existant)

**Interfaces:**
- Consumes: `togglePlay(filename: string, fullpath: string, btn: HTMLElement)` de `../audio.js` (import ligne 3, déjà présent)
- Produces: `.play-btn` par `.pl-track` (span `▶`, `title="Écouter"`), clic → `togglePlay` avec `stopPropagation`, guard du row focus incluant `.play-btn`

- [ ] **Step 1: Écrire le test RED**

Dans `static/src/render/playlistUI.test.ts` :
- après la ligne `import { renderPlaylistPanel } from './playlistUI.js';`, ajouter :

```typescript
import { togglePlay } from '../audio.js';
```

- dans le `beforeEach` (l.48-56), après `mockOpenCueEditor.mockReset();`, ajouter :

```typescript
    vi.mocked(togglePlay).mockClear();
```

- à la fin de `describe('playlistUI bouton Cues', ...)`, ajouter :

```typescript
  it('affiche un bouton play ▶ (title Écouter) sur chaque piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const playBtn = document.querySelector('.play-btn') as HTMLElement | null;
    expect(playBtn).not.toBeNull();
    expect(playBtn!.textContent).toBe('▶');
    expect(playBtn!.title).toBe('Écouter');
  });

  it('le clic sur play lance togglePlay avec la piste', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const playBtn = document.querySelector('.play-btn') as HTMLElement;
    playBtn.click();
    expect(togglePlay).toHaveBeenCalledWith('a.mp3', '/x/a.mp3', playBtn);
  });

  it('le clic sur play ne déplace pas le focus de la ligne', () => {
    pendingTracks.tracks = [{ filename: 'a.mp3', fullPath: '/x/a.mp3', duration: 60 }];
    renderPlaylistPanel();
    const playBtn = document.querySelector('.play-btn') as HTMLElement;
    const track = document.querySelector('.pl-track') as HTMLElement;
    playBtn.click();
    expect(track.classList.contains('focused')).toBe(false);
  });
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run static/src/render/playlistUI.test.ts`
Expected: FAIL — « Cannot read properties of null » sur `document.querySelector('.play-btn')` (pas de bouton encore)

- [ ] **Step 3: Implémentation minimale**

1) Dans la boucle de rendu (l.140-141), après le drag handle et avant le nom :

```typescript
      html += `<div class="pl-track" draggable="true" data-index="${i}">`;
      html += `<span class="pl-drag-handle">⬍</span>`;
      html += `<span class="play-btn" title="Écouter">▶</span>`;
      html += `<span class="pl-track-name">${escapeHtml(track.filename)}</span>`;
```

2) Après le bloc de bind `.cue-btn` (fini ligne 191), ajouter un bloc de bind `.play-btn` :

```typescript
  container.querySelectorAll('.play-btn').forEach(btn => {
    (btn as HTMLElement).onclick = (e: MouseEvent) => {
      e.stopPropagation();
      const row = (btn as HTMLElement).closest('.pl-track') as HTMLElement | null;
      const fullPath = (row?.querySelector('.pl-track-remove') as HTMLElement | null)?.dataset.fullpath || '';
      const filename = (row?.querySelector('.pl-track-name') as HTMLElement | null)?.textContent || '';
      if (fullPath) togglePlay(filename, fullPath, btn as HTMLElement);
    };
  });
```

3) Dans le guard du `trackEl.onclick` (l.196), ajouter `.play-btn` à la liste `closest` :

```typescript
      if ((e.target as HTMLElement).closest('.pl-track-remove, .pl-track-rating, .pl-drag-handle, .play-btn')) return;
```

- [ ] **Step 4: Vérifier que le test passe**

Run: `npx vitest run static/src/render/playlistUI.test.ts`
Expected: PASS (les 3 nouveaux tests + les existants)

- [ ] **Step 5: Commit**

```bash
git add static/src/render/playlistUI.ts static/src/render/playlistUI.test.ts
git commit -m "feat(playlist): bouton ▶ par piste — lecture via togglePlay (pattern fileRow)"
```

---

### Task 3: Validation complète + smoke + EPIC-025 + push

**Files:**
- Create: `docs/superpowers/epics/EPIC-025-playlist-playback.md`
- Modify: `docs/superpowers/epics/README.md` (ligne index)

**Interfaces:**
- Consumes: fonctionnalité des Tasks 1-2 (bouton + glow)
- Produces: EPIC-025 documentée, registre mis à jour, suite verte, push `main`

- [ ] **Step 1: Suite complète vitest**

Run: `npm test`
Expected: PASS — 732 tests existants + 3 nouveaux (render.test) + 3 nouveaux (playlistUI.test) = **738**

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 erreur

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: OK (bundle + `scripts/validate-build.js` vert)

- [ ] **Step 4: Tests backend**

Run: `./venv/bin/python -m pytest -q`
Expected: 174 passed (aucun impact backend)

- [ ] **Step 5: Smoke serveur**

```bash
npm start &
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/   # attendu : 200
curl -s http://127.0.0.1:8765/ | grep -oE 'static/dist/(script|style)-[a-z0-9]+'  # 2 assets cache-buster
fuser -k 8765/tcp 2>/dev/null
```
Expected: 200 + 2 assets servis. (Smoke navigateur visuel — clic ▶ → lecture + glow — laissé à la confirmation utilisateur.)

- [ ] **Step 6: Créer EPIC-025**

Créer `docs/superpowers/epics/EPIC-025-playlist-playback.md` (format identique à EPIC-024) :

```markdown
# EPIC-025 — Lecture dans le panneau Playlist (bouton ▶ par piste)

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-14 · **Dernière mise à jour** : 2026-09-14
> **Priorité** : Moyenne (UX : écouter sa playlist sans passer par l'arbre source)
> **Docs liées** : [spec](../specs/2026-09-14-playlist-playback-design.md)

## Objectif

Lancer la lecture de n'importe quelle piste de la playlist en un clic (bouton ▶ par ligne, comme l'arbre source), avec état ⏹ + glow du nom pendant la lecture — réutilisation totale de l'infra audio existante (`togglePlay`, barre de lecteur, `.led-playing`).

## Tâches

- [x] Task 1 — render.ts : extraction `updatePlaylistLedIndicator()` (glow piloté par `.play-btn.playing`)
- [x] Task 2 — playlistUI.ts : bouton ▶ par ligne + bind `togglePlay` + guard focus
- [x] Task 3 — validation complète + smoke

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/playlistUI.ts` | Bouton play par ligne + bind + guard focus |
| `static/src/render.ts` | Extraction `updatePlaylistLedIndicator` + re-glow du nom |
| `static/src/render/playlistUI.test.ts` | Tests bouton ▶ (existence, clic → togglePlay, pas de focus) |
| `static/src/render.test.ts` | Tests glow (applique / retire / no-op side) |

## Validation

- [x] Tests vitest 738
- [x] Test pytest 174
- [x] Typecheck 0 erreur
- [x] Build OK
- [x] Smoke serveur : page 200 + assets cache-buster

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `<hash spec>` | docs(spec): lecture panneau Playlist — bouton ▶ par piste (EPIC-025) |
| `<hash task1>` | feat(render): updatePlaylistLedIndicator — glow nom piste playlist piloté par .play-btn.playing |
| `<hash task2>` | feat(playlist): bouton ▶ par piste — lecture via togglePlay (pattern fileRow) |

## Décisions

- **Zéro modif noyau** : `audio.ts`, `templates/index.html`, `style.css` intacts — `.play-btn`, `.led-playing::before`, `togglePlay` et l'événement `audio:changed` suffisent.
- **Glow piloté par l'état du bouton** (dans le handler `audio:changed` existant) plutôt qu'une branche `.pl-track` dans `togglePlay` : pas de changement de comportement du glow `.file-row`, pas de nettoyage `onended/onerror` à réinventer, souscription unique (count `on()` = 7 inchangé).
- **Double-clic / menu « ▶ Jouer » inchangés** : leur `querySelector('.play-btn') || trackEl` résout désormais le vrai bouton (le fallback ligne entière ne se déclenche plus).

## Notes

- Le glow ne concerne que `#playlist-panel` ; le glow `.file-row` de l'arbre source reste géré par `togglePlay`.
- Les 12 erreurs biome pré-existantes persistent — hors périmètre (EPIC « dette » dédiée).
```

Remplacer `<hash spec>` / `<hash task1>` / `<hash task2>` par les vrais hashes (`git log --oneline -3`).

- [ ] **Step 7: Ajouter la ligne au registre**

Dans `docs/superpowers/epics/README.md`, après la ligne EPIC-024 (l.46), ajouter :

```markdown
| [EPIC-025](EPIC-025-playlist-playback.md) | Lecture dans le panneau Playlist — bouton ▶ par piste + glow du nom | 🟢 Livré | Moyenne | spec `2026-09-14-playlist-playback-design.md` |
```

- [ ] **Step 8: Mettre à jour le ledger SDD**

Dans `.git/sdd/progress.md`, ajouter une entrée résumant : EPIC-025, 3 tasks via subagent-driven, review passes, notes (count `on()` 7 conservé, fallback double-clic résolu).

- [ ] **Step 9: Commit + push**

```bash
git add docs/superpowers/epics/EPIC-025-playlist-playback.md docs/superpowers/epics/README.md .git/sdd/progress.md
git commit -m "docs(epics): EPIC-025 traçabilité — lecture panneau Playlist"
git push origin main
```

Expected: push OK (remontée des Tasks 1-2 + commit docs).