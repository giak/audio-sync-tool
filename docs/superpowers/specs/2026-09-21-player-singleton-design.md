# Design : Player audio singleton strict (une seule lecture à la fois)

> **Date** : 2026-09-21 · **Statut** : étude (course identifiée dans le code) → prêt pour validation
> **EPIC** : [EPIC-038](../epics/EPIC-038-player-audio-singleton.md)
> **Objets concernés** : `static/src/audio.ts` (+ `static/src/audio.test.ts`),
> vérification des appelants (`render/fileRow.ts`, `render/yearsUI.ts`,
> `render/dupsUI.ts`, `render/playlistUI.ts`, `domPatches.ts`).
> **Hors scope** : cue editor (wavesurfer — moteur séparé, modal), backend
> `GET /audio`, barre de lecteur (UI inchangée), lecture en chaîne (EPIC-031 P2).

## Problème

Deux morceaux peuvent jouer **simultanément** — constaté en usage réel (clic
dans une colonne, puis autre page/colonne, ou clics rapides). L'intention
« singleton » existe (un seul `currentAudio` au niveau module, un seul
`new Audio(` dans tout `static/src`), mais l'implémentation est **racée**.

## Diagnostic — la course, ligne par ligne

```ts
// static/src/audio.ts (actuel)
if (currentAudio && !currentAudio.paused) {     // ① ne voit RIEN tant que le play() précédent n'a pas résolu
  if (fullpath === playerFullpath) { stopPlayer(); return; }
  currentAudio.pause(); currentAudio = null;    // ② ne coupe que l'audio DÉJÀ résolu
  …clear .play-btn.playing / .led-playing…
}
const audio = new Audio(`/audio?path=…`);
audio.play().then(() => {
  currentAudio = audio;                          // ③ assignation TARDIVE
  …clear marks, marque le bouton, showPlayer…
});
```

Le callback de succès **③ ne met en pause aucun élément** : il ne fait que
retirer des classes CSS. Deux éléments `<audio>` peuvent donc jouer en même
temps que leurs promesses se résolvent dans le désordre :

| t | action | `currentAudio` | audio A | audio B | barre |
|---|---|---|---|---|---|
| 0 | clic ▶ A | `null` | `play()` en vol | — | masquée |
| 1 | clic ▶ B | `null` → ① saute la coupe | **en vol, joue** | `play()` en vol | masquée |
| 2 | `.play()` de A résout | `= A` ③ | joue | joue | affiche A |
| 3 | `.play()` de B résout | `= B` ③ | **joue toujours** | joue | affiche B |

Résultat : **2 pistes audibles**, bouton A ré-affiché en ⏹ alors que B est
affiché dans la barre, `Échap`/`⏹` ne coupe que B. Le cas se déclenche d'autant
plus vite que le serveur streame (`GET /audio`) : le délai entre le clic et la
résolution est humainement atteignable, et les pages à cartes (Années,
Doublons) re-rendent leurs boutons pendant ce délai.

## Objectif

**Une seule lecture à la fois**, quel que soit le point d'entrée (épars, arbre
source, playlist, cartes Années/Doublons, menus contextuels), le rythme des
clics (double-clic, clic croisé pendant le chargement) et la page.

## Choix retenus

| # | Décision | Alternative rejetée |
|---|---|---|
| P1 | `currentAudio` = **source de vérité assignée synchroniquement** à la création de l'élément (avant `play()`) | Garder l'assignation tardive (bug) · flag `isLoading` (ne couvre pas les clics croisés de générations différentes) |
| P2 | **Génération de lecture** (`playSeq`) : tout callback (`.then`, `onended`, `onerror`, `ontimeupdate`) ne s'applique que si sa génération est courante | `AbortController` (pas de support sur `HTMLMediaElement.play()`) · refactor de chaque appelant (inutile : tous passent déjà par `togglePlay`) |
| P3 | `releaseAudio(el)` : `pause()` + `src=''` + **détachement des handlers** — libère le flux HTTP streaming | `pause()` seul (le flux `/audio` reste ouvert, les vues Années/Doublons sont re-rendues en boucle) |
| P4 | `clearPlayingMarks()` en **un point** pour toutes les marques (`.play-btn.playing`, `.led-playing`) — les boutons Années/Doublons portent déjà `.play-btn` (vérifié) | Sélecteurs par page (dérive, 3 sélecteurs aujourd'hui) |
| P5 | `stopPlayer()` : `playSeq++` + `releaseAudio` + `playerFullpath = ''` + barre masquée + **un seul** `emit('audio:changed')` | Conserver `playerFullpath` (chemin périmé après `onended`) |

## Design (`static/src/audio.ts`)

```ts
let currentAudio: HTMLAudioElement | null = null;
let playerFullpath = '';
let playSeq = 0;                       // P2 : génération de lecture

function clearPlayingMarks(): void {   // P4
  for (const b of document.querySelectorAll('.play-btn.playing')) {
    b.classList.remove('playing'); b.textContent = '▶';
  }
  for (const el of document.querySelectorAll('.led-playing')) el.classList.remove('led-playing');
}

function releaseAudio(el: HTMLAudioElement | null): void {   // P3
  if (!el) return;
  el.ontimeupdate = el.onloadedmetadata = el.onended = el.onerror = null;
  el.pause();
  el.src = '';
}

export function stopPlayer(): void {
  playSeq++;
  releaseAudio(currentAudio);
  currentAudio = null;
  playerFullpath = '';                 // P5
  playerBar?.classList.add('hidden');
  clearPlayingMarks();
  emit('audio:changed');
}

export function togglePlay(filename: string, fullpath: string, btn: HTMLElement): void {
  // Même fichier (en lecture OU en cours de chargement) → stop.
  if (currentAudio && fullpath === playerFullpath) { stopPlayer(); return; }

  playSeq++;
  const seq = playSeq;
  releaseAudio(currentAudio);          // P1 : l'ancien meurt AVANT le nouveau
  currentAudio = null;
  clearPlayingMarks();

  const audio = new Audio(`/audio?path=${encodeURIComponent(fullpath)}`);
  audio.volume = 1.0;
  currentAudio = audio;                // P1 : assignation SYNCHRONE
  playerFullpath = fullpath;

  const isCurrent = (): boolean => seq === playSeq && currentAudio === audio;

  audio.ontimeupdate   = () => { if (isCurrent()) updatePlayerUI(); };
  audio.onloadedmetadata = () => { if (isCurrent()) updatePlayerUI(); };
  audio.onended = () => {              // P2
    if (!isCurrent()) return;
    currentAudio = null; playerFullpath = '';
    playerBar?.classList.add('hidden');
    clearPlayingMarks();
    emit('audio:changed');
  };
  audio.onerror = () => { if (isCurrent()) { currentAudio = null; playerFullpath = ''; /* idem */ } };

  audio.play().then(() => {
    if (!isCurrent()) return;          // P2 : promesse périmée → silence total
    clearPlayingMarks();
    btn.classList.add('playing'); btn.textContent = '⏹';
    showPlayer(filename, fullpath);
    btn.closest('.file-row')?.querySelector('.file')?.classList.add('led-playing');
    emit('audio:changed');
  }).catch(err => {
    if (!isCurrent()) return;
    currentAudio = null; playerFullpath = '';
    btn.classList.remove('playing'); btn.textContent = '▶';
    playerBar?.classList.add('hidden');
    setStatus(…);                      // message NotAllowedError inchangé
  });
}
```

- `isAudioPlaying()` et `playingPath()` gardent **exactement** leur sémantique
  actuelle (`null` si rien / pas courant) — aucune régression registry
  (`isAudioPlaying ?? false`) ni `playingPath()` (re-marquage des cartes
  Années/Doublons, EPIC-034).
- Aucun appelant n'est modifié : `fileRow.ts`, `yearsUI.ts`, `dupsUI.ts`,
  `playlistUI.ts`, `domPatches.ts` passent tous par `togglePlay` (vérifié).

## Erreurs & cas limites

| Cas | Comportement attendu |
|---|---|
| Clic ▶ A puis ▶ B pendant le chargement de A | A est libéré (`pause` + `src=''`), B seul joue ; la promesse de A ne ré-affiche rien (génération) |
| Clic ▶ A ×2 (A en chargement) | 2ᵉ clic = même `fullpath` → `stopPlayer()` (avant : relançait un 2ᵉ élément) |
| Clic ▶ B puis ▶ A puis ▶ B (spam) | une seule piste audible à tout instant ; dernière génération gagnante |
| `⏹` de la barre pendant un chargement | stoppe et libère l'élément en vol ; la promesse qui résout ensuite est ignorée |
| Erreur réseau / 404 `/audio` sur B alors que A jouait | A est déjà libéré ; plus de bouton `.playing` ; message d'erreur inchangé |
| `NotAllowedError` (autoplay bloqué) | message `setStatus` inchangé ; aucun élément non pausé résiduel |
| Fin naturelle de la piste | barre masquée, marques nettoyées, `emit` unique |
| Re-render des cartes Années/Doublons en cours de lecture | `playingPath()` restaure le ⏹ (inchangé, EPIC-034) — la génération ne bouge pas, aucun impact |
| Changement de page pendant la lecture | la lecture continue (comportement attendu, player global) — un seul élément |
| Cue editor (wavesurfer) | hors périmètre : moteur séparé dans une modale (documenté) |

## Tests

Le mock `MockAudio` (`audio.test.ts`) doit exposer **toutes** les instances
(`(globalThis).__audios: MockAudio[]`) ; aujourd'hui seul `__lastMockAudio`
existe — indispensable pour prouver « un seul élément non pausé ».

- `togglePlay A ; togglePlay B ; __audioResolve()` (résolution différée de A) →
  `__audios.filter(a => !a.paused).length === 1` et c'est B ; A `paused === true`
  (**test anti-régression du bug**).
- Clic ▶ A ×2 avant résolution → barre masquée, aucun élément non pausé,
  `playingPath() === null`.
- `stopPlayer()` pendant un chargement puis résolution → barre reste masquée,
  aucun bouton `.playing`, `emit` appelé une fois par action utilisateur.
- Lecture A établie → clic ▶ B → A `paused === true` (test déjà vert aujourd'hui :
  filet anti-régression).
- `onended` de A après le passage à B (instances conservées par le mock) →
  ne nettoie pas les marques de B.
- Butt S1 (aucun test modifié) : `stopPlayer`, `isAudioPlaying`, `seekAudio`,
  `playingPath`, `initAudioUI` — suite existante (`audio.test.ts`, 25 tests) à
  garder verte, éventuellement enrichie du helper `__audios`.
- Gate : `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`,
  `./venv/bin/python -m pytest -q`.
- Preuve live : enchaîner deux ▶ en < 300 ms depuis deux colonnes différentes,
  vérifier un seul flux audible (et l'onglet réseau : un seul `GET /audio`
  actif).

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/audio.ts` | Singleton strict : assignation synchrone, génération, `releaseAudio`, `clearPlayingMarks` |
| `static/src/audio.test.ts` | Mock `__audios` + scénarios de course (A→B pendant chargement, spam, stop en vol) |
| `static/src/{fileRow,yearsUI,dupsUI,playlistUI}.ts`, `domPatches.ts` | **Aucun changement** — vérification que tous les ▶ passent par `togglePlay` (1 seul `new Audio(` dans `static/src`) |
