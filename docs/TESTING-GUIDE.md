# 🤖 Guide de test UX — Audio Sync Tool (Standard 2026)

> **Index LLM** : ce fichier est la source de vérité pour tout agent opérant sur ce dépôt.
> **Standard** : Spec-Driven Development (SDD) · Constitutional AI · Persona-Based Workflow.
> Chaque section est auto-suffisante — lisible isolément par un pipeline RAG.
>
> **État actuel** : tout le code et les tests sont en **TypeScript** (`static/src/**/*.ts`).
> Les tests vivent dans des fichiers `*.test.ts` co-localisés avec leur module
> (ex. `static/src/integration.test.ts`, `static/src/commands/playlist.test.ts`),
> plus `test_app.py` / `test_nml.py` pour le backend pytest. Il n'existe plus de
> fichier de test `.js` — ne pas en créer.

---

## 1. Écosystème Persona-Based (3 rôles)

Quand tu écris ou modifies un test, endosse ces trois rôles **séquentiellement** :

| # | Rôle | Mission |
|---|------|---------|
| 1 | **Product Manager** | Compare `README.md` (le contrat) avec les tests existants. Identifie les comportements manquants. Produit une spécification SDD. |
| 2 | **Implementer** | Reçoit la spec SDD. Écrit le test d'interaction DOM **avant** de modifier le code métier. Itère en boucle test-first. |
| 3 | **Reviewer** | Vérifie que le test respecte les 5 contraintes constitutionnelles (§3). Cherche les hallucinations (assertions sur des éléments inexistants). |

**Pourquoi ça marche** : la séparation des rôles empêche le LLM de sauter directement à l'implémentation sans avoir réfléchi au comportement attendu.

---

## 2. Spec-Driven Development : le format obligatoire

Avant d'écrire un test, remplir ce bloc SDD. Il répond aux 6 questions qui empêchent les hallucinations.
**Écris ce bloc en commentaire au-dessus du `it(...)`.** Il sert de justification pour le Reviewer.

```markdown
### SDD : [Nom du comportement]

- **Outcome**   : Ce que l'utilisateur obtient (ex: "le fichier est copié et le badge change")
- **Scope**     : Quels modules/fichiers sont concernés (ex: "script.ts, render.ts, actions.ts")
- **Constraints**: Règles à respecter (ex: "seul api.ts est mocké ; le DOM est partagé via vi.hoisted()")
- **Decisions** : Choix d'architecture pour ce test (ex: "on mocke getBoundingClientRect pour simuler 2 colonnes")
- **Task Breakdown** : Étapes concrètes (ex: "1. Setup DOM ; 2. dispatchKey('Tab') ; 3. Vérifier state.activePanel")
- **Verification Criteria** : Assertions précises (ex: "state.activePanel === 'source' ET .panel-active sur #panel-right")
```

**Exemple concret** (Ctrl+ArrowUp dans la sidebar) :

```markdown
### SDD : Réorganisation d'une piste vers le haut (Ctrl+↑)

- **Outcome**   : La piste focusée remonte d'une position dans la sidebar
- **Scope**     : script.ts (routeur clavier), playlist.ts (reorderTrack), render.ts (renderPlaylistPanel)
- **Constraints**: Mode Playlist actif, 2+ pistes dans la playlist, focus = 'sidebar'
- **Decisions** : On ajoute les pistes via dispatchKey(' ') dans playlist-source avant de naviguer
- **Task Breakdown** : 1. enterPlaylist() ; 2. Ajouter 2 pistes via Space ; 3. Focus sidebar + 2e piste ; 4. dispatchKey('ArrowUp', {ctrlKey:true}) ; 5. Vérifier l'ordre
- **Verification Criteria** : querySelectorAll('#playlist-tracks .pl-track')[0] contient l'ancien nom de la 2e piste
```

---

## 3. Contraintes Constitutionnelles (Constitutional AI)

Ces 5 règles sont **vérifiées par le Reviewer** avant et après chaque test.
Aucune exception.

### C1 — Interaction pure

Le test simule l'utilisateur, pas l'implémentation.

```js
// Approuvé : l'utilisateur appuie sur Tab
dispatchKey('Tab');
await flush();
expect(state.activePanel).toBe('source');

// Approuvé : l'utilisateur clique sur un bouton
document.getElementById('btn-playlist').click();
await flush();
expect(state.playlistMode).toBe(true);
```

### C2 — DOM réaliste

Le HTML est créé **avant** les imports via `vi.hoisted()`. Les modules chargent leurs `getElementById()` sur le vrai DOM. Aucun élément n'est mocké.

```js
vi.hoisted(() => {
  document.body.innerHTML = `...tout le HTML de index.html...`;
  Element.prototype.scrollIntoView = () => {};
});
```

### C3 — Mock minimal

**Un seul module est mocké** : `api.ts`. Tous les autres (`focus.ts`, `audio.ts`, `ui.ts`, `render.ts`, `playlist.ts`) tournent avec leur code de production.

> Note : en TypeScript NodeNext, les imports ESM s'écrivent avec l'extension `.js`
> (ex. `vi.mock('./api.js', ...)`) même si le fichier réel est `api.ts`.

### C4 — Assertions visibles

Les assertions portent sur ce que l'utilisateur **voit** : le DOM, les classes CSS, le state partagé.

```js
// Approuvé : on vérifie l'effet visible
expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(false);
expect(playBtn.textContent).toBe('⏹');
expect(state.playlistMode).toBe(true);
```

### C5 — Asynchronisme naturel

`await flush()` après chaque action qui déclenche une promesse ou une microtâche.

| Situation | flush() |
|-----------|---------|
| Handler **avec** `await` (ex: `await enterPlaylistMode()`) | 1 |
| Handler **sans** `await` (ex: `exitPlaylistMode()` dans le routeur) | 2 |
| Action 100% synchrone (ex: `element.click()` vers une fonction sync) | 0 ou 1 |

---

## 4. Templates Approuvés

### Interaction clavier isolée

```js
it('Tab bascule le panneau actif', async () => {
    renderEpars();
    renderSource();
    state.activePanel = 'epars';
    setActivePanel('epars');
    await flush();

    dispatchKey('Tab');
    await flush();

    expect(state.activePanel).toBe('source');
    expect(document.getElementById('panel-right').classList.contains('panel-active')).toBe(true);
});
```

### Combinaison de touches (Ctrl / Shift)

```js
it('Ctrl+S sauvegarde la playlist', async () => {
    await enterPlaylist();
    // Ajouter une piste...
    vi.mocked(api).mockResolvedValueOnce({ ok: true });

    dispatchKey('s', { ctrlKey: true });
    await flush();

    expect(api).toHaveBeenCalledWith('/playlists', expect.objectContaining({ method: 'POST' }));
});
```

### Workflow multi-étapes (format Gherkin → code)

Quand un comportement est complexe, le décomposer d'abord en Gherkin puis le traduire :

```gherkin
Given je suis en mode Playlist avec 2 pistes dans la sidebar
When je focus la première piste et j'appuie sur Delete
Then la sidebar n'a plus qu'une piste et la piste restante est la deuxième
```

```js
it('Delete supprime la piste focusée', async () => {
    // Given
    await enterPlaylist();
    // ... ajouter 2 pistes ...
    state.playlistFocus = 'sidebar';
    document.querySelector('#playlist-tracks .pl-track').classList.add('focused');

    // When
    dispatchKey('Delete');
    await flush();

    // Then
    const tracks = document.querySelectorAll('#playlist-tracks .pl-track');
    expect(tracks.length).toBe(1);
});
```

### Gotcha : `getBoundingClientRect` dans jsdom

jsdom retourne `{left:0, top:0}` pour tout. Pour les tests de navigation spatiale (←→ colonnes), mocker les positions :

```js
element.getBoundingClientRect = () => ({ left: 300, top: 10, right: 500, bottom: 40, width: 200, height: 30 });
```

---

## 5. Matrice d'Intelligence (Semantic Gap Analysis)

Le Product Manager utilise cette matrice pour identifier ce qui manque.
Chaque ligne du `README.md` doit avoir un test ✅.

### Mode normal

| Raccourci | Test existant | Statut |
|-----------|--------------|--------|
| `↑↓` Éparpillé | `ArrowDown moves focus` | ✅ |
| `↑↓` Source Data | *(via setActivePanel)* | 🟡 |
| `←→` colonnes Source | `←→ navigates between columns` | ✅ |
| `Shift+←→` seek | `Shift+ArrowRight/Left seeks` | ✅ |
| `Tab` switch | `Tab switches between panels` | ✅ |
| `Enter` jouer | `Enter on file-row plays audio` | ✅ |
| `Enter` déplier Source | *(via clic, pas via Enter dispatché)* | 🟡 |
| `Espace` sélection | `Space selects nouveau file` | ✅ |
| `Espace` déplier Source | *(non testé)* | 🔴 |
| `F5` copie | `F5 copy flow` (×3) | ✅ |
| `F7` / `/` filtre | `F7 opens filter palette` | ✅ |
| `Échap` modal/stop | `Escape closes modal` | ✅ |

### Mode Playlist

| Raccourci | Test existant | Statut |
|-----------|--------------|--------|
| `🎵` entrer/quitter | `clicking 🎵` / `Escape quits` | ✅ |
| `Espace` add/remove | `Space adds/removes track` | ✅ |
| `Tab` switch | `Tab switches focus source/sidebar` | ✅ |
| `↑↓` source | `ArrowDown/Up navigates files` | ✅ |
| `↑↓` sidebar | `ArrowDown/Up navigates tracks in sidebar` | ✅ |
| `Enter` jouer | `Enter plays audio` | ✅ |
| `F7` / `/` filtre | `F7 opens filter palette in playlist` | ✅ |
| `Delete`/`Backspace` | `Delete/Backspace removes track` | ✅ |
| `Ctrl+S` save | `Ctrl+S saves/empty warning` | ✅ |
| `Ctrl+E` export | `Ctrl+E opens export dialog` | ✅ |
| `Ctrl+↑↓` reorder | `Ctrl+ArrowUp/Down reorders` | ✅ |

### Interactions souris — gaps identifiés 🔴

| Interaction | Priorité |
|-------------|----------|
| Drag & drop réorganiser pistes | Haute |
| Clic onglet → changer playlist | Haute |
| Clic ✕ → fermer onglet | Moyenne |
| Clic + → nouvelle playlist | Moyenne |
| Clic 📋 Gérer → playlist manager | Moyenne |
| Clic barre progression → seek audio | Basse |

> 🟡 = couvert indirectement · 🔴 = à implémenter

---

## 6. Boucle Test-First (comment attaquer un gap)

Quand la matrice révèle un 🔴, suivre cette boucle :

```
1. Product Manager : écrire le bloc SDD (§2) en commentaire au-dessus du futur it(...)
2. Implementer    : écrire le test
2.5                : lancer UNIQUEMENT ce test — il doit FAILER
                     npx vitest run -t "nom du test"
                     (s'il passe sans code, c'est un faux positif)
3. Implementer    : écrire/réparer le code jusqu'à ce que le test PASSE
4. Reviewer       : vérifier les 5 contraintes constitutionnelles (§3)
5. Reviewer       : lancer `npx vitest run` — la suite complète doit passer
```

---

## 7. Références rapides

| Question | Réponse |
|----------|---------|
| Fichier de test UX | `static/src/integration.test.ts` |
| Module mocké | **Uniquement** `api.ts` |
| Simuler une touche | `dispatchKey('Enter')` ou `dispatchKey('s', { ctrlKey: true })` |
| Simuler un clic | `element.click()` |
| Attendre l'async | `await flush()` — 1 si await, 2 si appel nu |
| Vérifier le focus | `element.classList.contains('focused')` |
| Vérifier une modale | `state.activeModal === 'config'` ET `!modal.classList.contains('hidden')` |
| Infra DOM | `vi.hoisted()` crée le HTML avant les imports |
| Gotcha spatial | Mocker `getBoundingClientRect` pour les tests de colonnes |
| Langue des tests | TypeScript uniquement — pas de fichier de test `.js` |
