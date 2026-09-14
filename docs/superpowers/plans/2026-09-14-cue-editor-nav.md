# Nav « 🎛️ Cue Editor » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un point d'entrée « 🎛️ Cue Editor » dans le header nav qui rouvre la dernière piste éditée (mémorisée en session), grisé tant qu'aucune piste n'a été ouverte.

**Architecture:** Nouveau champ `lastCueTrack` dans `state.ts` (non validé Proxy, champ opaque), alimenté au début de `openCueEditor()` dans `cueEditor.ts`. Bouton `#page-cue` dans `#page-nav` avec style `:disabled`. Handler dans `script.ts`.

**Tech Stack:** TypeScript (DOM), CSS custom properties, vitest, esbuild, Flask/Jinja (templates)

## Global Constraints

- `import type` uniquement pour le lien `state.ts → cueEditor.ts` (évitement de cycle runtime)
- `lastCueTrack` n'est pas validé par le Proxy (champ opaque, non critique)
- `#page-cue` ne reçoit jamais `.active` (ce n'est pas une page)
- Pas de modification du comportement `playlistMode` / Escape / bouton 📦 Sync
- Convention EPIC-023 : pas de test DOM sur le template Jinja (vérifié en smoke)

---

### Task 1: State — ajout de `lastCueTrack`

**Files:**
- Modify: `static/src/state.ts:94-163`
- Test: `static/src/state.test.ts`

**Interfaces:**
- Produces: `state.lastCueTrack: PlaylistTrackLite | null` (défaut `null`)

- [ ] **Step 1: Ajouter le champ à l'interface `_state`**

Dans `static/src/state.ts`, ajouter dans `AppState` (après `focusListId`) :
```typescript
  lastCueTrack: PlaylistTrackLite | null;
```

Ajouter l'import type en haut du fichier (après la ligne existante `import { emit, on }`) :
```typescript
import type { PlaylistTrackLite } from './render/cueEditor.js';
```

Dans `_state` (objet, après `focusListId: 'epars'`) :
```typescript
  lastCueTrack: null,
```

- [ ] **Step 2: Vérifier que le build ne casse rien**

Run: `npm run typecheck`
Expected: 0 erreur

- [ ] **Step 3: Écrire le test d'état par défaut**

Dans `static/src/state.test.ts`, ajouter à la fin de `describe('state EventEmitter')` :
```typescript

  it('lastCueTrack is initialized to null', () => {
    state.lastCueTrack = null;
    expect(state.lastCueTrack).toBeNull();
  });
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test -- --run static/src/state.test.ts`
Expected: tous les tests passent (y compris le nouveau)

- [ ] **Step 5: Commit**

```bash
git add static/src/state.ts static/src/state.test.ts
git commit -m "feat(state): lastCueTrack — champ lastCueTrack (défaut null) pour mémoriser la dernière piste cue editor"
```

---

### Task 2: HTML nav button + CSS `.page-btn:disabled`

**Files:**
- Modify: `templates/index.html:14-15`
- Modify: `static/style.css:69-87`

**Interfaces:**
- Produces: bouton `#page-cue` (id utilisé par Task 3 et Task 4)

- [ ] **Step 1: Ajouter le bouton dans le HTML**

Dans `templates/index.html`, après la ligne :
```html
      <button id="page-playlist" class="page-btn">🎵 Playlist</button>
```
Ajouter :
```html
      <button id="page-cue" class="page-btn" disabled title="Ouvre un cue (ligne playlist ou [Cues])">🎛️ Cue Editor</button>
```

- [ ] **Step 2: Ajouter la règle CSS**

Dans `static/style.css`, juste après le bloc `.page-btn:hover` (après la ligne 87) :
```css
.page-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.page-btn:disabled:hover {
  background: var(--bg-hover);
}
```

- [ ] **Step 3: Vérifier la structure (pas de test DOM sur le template)**

Run: `npm run typecheck && npm run build`
Expected: typecheck 0 erreur, build OK

- [ ] **Step 4: Commit**

```bash
git add templates/index.html static/style.css
git commit -m "feat(ui): nav — bouton 🎛️ Cue Editor (#page-cue) grisé tant qu'aucune piste n'a été ouverte"
```

---

### Task 3: Mémorisation + enable dans `openCueEditor`

**Files:**
- Modify: `static/src/render/cueEditor.ts:994-998`
- Test: `static/src/render/cueEditor.test.ts` (mockState + MODAL_HTML + test)

**Interfaces:**
- Consumes: `state.lastCueTrack` (Task 1), bouton `#page-cue` (Task 2)
- Produces: `state.lastCueTrack` rempli + `#page-cue.disabled = false` à chaque ouverture

- [ ] **Step 1: Mémoriser + enable au début de `openCueEditor`**

Dans `static/src/render/cueEditor.ts`, ajouter au **tout début** de `openCueEditor` (après la signature ligne 994, avant le premier `const status`) :
```typescript
  state.lastCueTrack = track;
  document.getElementById('page-cue')?.removeAttribute('disabled');
```

- [ ] **Step 2: Ajouter `lastCueTrack` au mockState dans le test**

Dans `static/src/render/cueEditor.test.ts`, dans le bloc `vi.hoisted()` initial (objet retourné par `mockState`, après `setModal`), ajouter la propriété :
```typescript
    lastCueTrack: null as { filename: string; fullPath: string } | null,
```

Dans `resetMocks()`, ajouter après `mockState.activeModal = null` :
```typescript
  mockState.lastCueTrack = null;
```

- [ ] **Step 3: Ajouter le bouton `#page-cue` au DOM de test**

Dans `MODAL_HTML`, ajouter juste **avant** le dernier `</div>` fermant `modal-cue-editor` (après `#cue-editor-metaeditor`) :
```html
<button id="page-cue" disabled></button>
```

- [ ] **Step 4: Écrire le test TDD (échec attendu)**

Dans `static/src/render/cueEditor.test.ts`, dans `describe('render/cueEditor scaffold')`, ajouter :
```typescript

  it('mémorise lastCueTrack et active #page-cue lors de l\'ouverture', async () => {
    mockApi
      .mockResolvedValueOnce({ configured: true })   // /api/nml/status
      .mockResolvedValueOnce({ ok: true, entries: [], multiple: false }); // /api/track/match
    const btn = document.getElementById('page-cue') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await openCueEditor({ filename: 'z.mp3', fullPath: '/x/z.mp3' });
    expect(mockState.lastCueTrack).toEqual({ filename: 'z.mp3', fullPath: '/x/z.mp3' });
    expect(btn.disabled).toBe(false);
  });
```

- [ ] **Step 5: Vérifier l'échec**

Run: `npm test -- --run static/src/render/cueEditor.test.ts`
Expected: FAIL — `expect(btn.disabled).toBe(true)` passe mais `mockState.lastCueTrack` est undefined (pas encore défini dans mockState) OU `toEqual` échoue (valeur non mise à jour)

- [ ] **Step 6: Lancer les tests pour vérifier le passage**

Run: `npm test -- --run static/src/render/cueEditor.test.ts`
Expected: tous les tests passent (le nouveau inclus)

- [ ] **Step 7: Lancer la suite complète**

Run: `npm test`
Expected: 730+ tests passent

- [ ] **Step 8: Commit**

```bash
git add static/src/render/cueEditor.ts static/src/render/cueEditor.test.ts
git commit -m "feat(cueEditor): openCueEditor mémorise lastCueTrack + active #page-cue (TDD)"
```

---

### Task 4: Câblage nav `script.ts` + smoke test + EPIC-024

**Files:**
- Modify: `static/src/script.ts:85-107`
- Create: `docs/superpowers/epics/EPIC-024-cue-editor-nav.md`
- Modify: `docs/superpowers/epics/README.md` (ligne registre)

**Interfaces:**
- Consumes: `state.lastCueTrack` (Task 1), `openCueEditor` (déjà exporté de cueEditor.ts), `#page-cue` (Task 2)
- Produits: handler clic + no-op guard, EPIC-024, final commit + push

- [ ] **Step 1: Ajouter l'import de `openCueEditor` dans `script.ts`**

Dans `static/src/script.ts`, dans le bloc d'imports (après l'import de `openModal` ligne 26) :
```typescript
import { openCueEditor } from './render/cueEditor.js';
```

- [ ] **Step 2: Ajouter le handler clic**

Dans `static/src/script.ts`, dans le bloc « Toolbar bindings » (après le handler `page-playlist` ligne 107) :
```typescript
(document.getElementById('page-cue') as HTMLElement | null)!.onclick = () => {
  if (state.activeModal === 'cueEditor' || !state.lastCueTrack) return;
  void openCueEditor(state.lastCueTrack);
};
```

- [ ] **Step 3: Vérifier typecheck + build + lint**

Run: `npm run typecheck && npm run build && npm run lint`
Expected: typecheck 0, build OK, lint — 12 erreurs **pré-existantes** uniquement (hors `script.ts`)

- [ ] **Step 4: Lancer la suite complète**

Run: `npm test && ./venv/bin/python -m pytest -q`
Expected: vitest 730+, pytest 174+, tous passent

- [ ] **Step 5: Smoke test intégration (test client Python)**

Run :
```bash
./venv/bin/python -c "
from app import app
app.config['TESTING'] = True
html = app.test_client().get('/').get_data(as_text=True)
assert 'id=\"page-cue\"' in html, 'bouton #page-cue absent'
assert 'disabled' in html.split('page-cue')[1][:80], 'bouton non grassé'
print('SMOKE OK : bouton présent + grassé')
"
```
Expected: `SMOKE OK : bouton présent + grassé`

- [ ] **Step 6: Créer EPIC-024**

Créer `docs/superpowers/epics/EPIC-024-cue-editor-nav.md` (format identique au template `_template.md` et EPIC-023) :
```markdown
# EPIC-024 — Point d'entrée nav « 🎛️ Cue Editor »

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-14 · **Dernière mise à jour** : 2026-09-14
> **Priorité** : Basse (accessibilité nav, UI cosmétique)
> **Docs liées** : [spec](../specs/2026-09-14-cue-editor-nav-design.md)

## Objectif

Donner au header un point d'entrée « 🎛️ Cue Editor » qui rouvre la dernière piste éditée en un clic, grisé tant qu'aucune piste n'a été ouverte.

## Tâches

- [x] Task 1 — state.ts : lastCueTrack (défaut null)
- [x] Task 2 — HTML nav button + CSS `.page-btn:disabled`
- [x] Task 3 — cueEditor.ts : mémorisation + enable (TDD)
- [x] Task 4 — script.ts : handler nav + no-op guard + EPIC

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/state.ts` | Champ `lastCueTrack: PlaylistTrackLite \| null` |
| `static/src/state.test.ts` | Test défaut null |
| `templates/index.html` | Bouton `#page-cue` dans `#page-nav` |
| `static/style.css` | `.page-btn:disabled` |
| `static/src/render/cueEditor.ts` | Mémorisation + enable au début de `openCueEditor` |
| `static/src/render/cueEditor.test.ts` | Test lastCueTrack + DOM enable |
| `static/src/script.ts` | Handler clic `#page-cue` |

## Validation

- [x] Typecheck 0 erreur
- [x] Tests vitest 730+
- [x] Tests pytest 174+
- [x] Build OK
- [x] Smoke test : bouton présent + grassé dans le HTML servi

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `412fc47` | docs(spec): point d'entrée nav Cue Editor — lastCueTrack + bouton #page-cue grisé |
| `…` | feat(state): lastCueTrack |
| `…` | feat(ui): nav — bouton #page-cue |
| `…` | feat(cueEditor): openCueEditor mémorise lastCueTrack + active #page-cue |
| `…` | feat(nav): handler script.ts — clic #page-cue ouvre lastCueTrack |

## Décisions

- **`import type`** : lien `state.ts → cueEditor.ts` pour `PlaylistTrackLite` (zéro cycle runtime).
- **Aucune validation Proxy** : `lastCueTrack` est un champ opaque, non critique.
- **Enable dans `openCueEditor`** (et pas dans un listener) : KISS — l'ouverture est le seul point où une piste est validée et accessible.
- **No-op si déjà ouvert** : `activeModal === 'cueEditor'` sur la même piste → re-focus sans recharger.

## Notes

- Les 12 erreurs biome pré-existantes (imports, `useIterableCallbackReturn`) persistent — à traiter dans une EPIC « dette » dédiée.
```

- [ ] **Step 7: Ajouter la ligne au registre**

Dans `docs/superpowers/epics/README.md`, après la ligne EPIC-023 :
```markdown
| [EPIC-024](EPIC-024-cue-editor-nav.md) | Point d'entrée nav « 🎛️ Cue Editor » — lastCueTrack + bouton grisé | 🟢 Livré | Basse | spec `2026-09-14-cue-editor-nav-design.md` |
```

- [ ] **Step 8: Commit final + push**

```bash
git add static/src/script.ts docs/superpowers/epics/EPIC-024-cue-editor-nav.md docs/superpowers/epics/README.md
git commit -m "feat(nav): handler #page-cue (rouvre lastCueTrack) + EPIC-024 livré"
git push origin main
```
