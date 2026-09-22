# EPIC-038 — Player audio : singleton strict (une seule lecture à la fois)

> **Statut** : 🟢 Livré (2026-09-21) — test de course validé par mutation, gate complet vert
> **Créée** : 2026-09-21 · **Dernière mise à jour** : 2026-09-21
> **Priorité** : Haute (deux pistes audibles simultanément — perte de confiance sur l'écoute avant tri)
> **Docs liées** : [spec `2026-09-21-player-singleton-design.md`](../specs/2026-09-21-player-singleton-design.md) ·
> socles : EPIC-025 (lecture playlist), EPIC-034 (player des cartes Années/Doublons), EPIC-031 (Échap/seek audio)

## Objectif

Garantir **une seule lecture à la fois**, quel que soit le point d'entrée (épars,
arbre source, playlist, cartes Années/Doublons, menus contextuels), le rythme des
clics et la page — le player est un **singleton**.

## Contexte & découvertes

Constaté en usage réel (2026-09-21) : « on peut lancer plusieurs lecteurs à
travers les pages et colonne de gauche/droite ». L'intention singleton existe
déjà (un `currentAudio` au niveau module, **un seul `new Audio(` dans tout
`static/src`** — vérifié), mais l'implémentation est **racée** :

- `currentAudio` n'est assigné qu'à la **résolution** de `play()` (`.then`) ;
- le callback de succès retire des classes CSS mais **ne met en pause aucun
  élément**.

Conséquence : deux clics rapprochés (ou deux clics croisés pendant que le
serveur streame `GET /audio`) créent deux `<audio>` qui jouent **en même temps** ;
la barre de lecteur, le `⏹` et `Échap` ne pilotent que le dernier, et le bouton de
la piste réellement audible se re-marque « en lecture » sans qu'on puisse l'arrêter.

## Tâches

### P1 — Singleton strict (`audio.ts`) ✅
- [x] `currentAudio` assigné **synchroniquement** à la création (avant `play()`) —
      source de vérité, plus d'assignation tardive
- [x] **Génération de lecture** (`playSeq`) : `.then` / `onended` / `onerror` /
      `ontimeupdate` ne s'appliquent que si leur génération est courante
- [x] `releaseAudio(el)` : `pause()` + `src=''` + **détachement des handlers**
      (libère le flux `/audio` streaming)
- [x] Clic sur le même fichier **en cours de chargement** → `stopPlayer()`
      (avant : lançait un 2ᵉ élément)
- [x] `clearPlayingMarks()` en un point unique pour `.play-btn.playing` et
      `.led-playing` (les boutons Années/Doublons portent déjà `.play-btn`)
- [x] `stopPlayer()` : `playSeq++`, `releaseAudio`, `playerFullpath = ''`, barre
      masquée, **un seul** `emit('audio:changed')`
- [x] `isAudioPlaying()` / `playingPath()` : sémantique **inchangée** (registry +
      re-marquage des cartes EPIC-034)

### P2 — Preuve et non-régression ✅
- [x] Mock `MockAudio` : `(globalThis).__audios: MockAudio[]` + résolveurs par
      instance (`resolve`/`reject`) — les promesses périmées sont résolvables
- [x] Tests de course (+4) : A→B avant résolution → **un seul** élément non
      pausé (B), A `pause()` + `src=''` + handlers détachés ; même fichier en
      chargement → stop sans 2ᵉ `Audio` ; `stopPlayer` en vol → résolution
      tardive sans effet ; lecture A établie puis B → A coupé, marques migrées
- [x] Tests existants d'`audio.test.ts` verts **sans** modification de contrat
- [x] Gate : typecheck 0 · **1 133 vitest** (50 fichiers) · lint 0 · build OK ·
      **317 pytest** (inchangé)
- [ ] Preuve live : deux ▶ à < 300 ms depuis deux colonnes → un seul flux
      audible, un seul `GET /audio` actif (à confirmer en usage réel)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/audio.ts` | `playSeq`, assignation synchrone, `releaseAudio`, `clearPlayingMarks`, `stopPlayer` |
| `static/src/audio.test.ts` | Mock multi-instances `__audios` + scénarios de course |
| `static/src/render/fileRow.ts`, `render/yearsUI.ts`, `render/dupsUI.ts`, `render/playlistUI.ts`, `domPatches.ts` | **Aucun changement** — vérification que tous les ▶ passent par `togglePlay` (un seul `new Audio(`) |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0 erreur
- [x] Tests frontend (`npm test`) — **1 133 verts** (50 fichiers)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **317 verts** (inchangé)
- [x] Lint (`npm run lint`) — 0 erreur (108 fichiers)
- [x] Build (`npm run build`) — OK (`validate-build` vert)
- [ ] Preuve live (clic croisé à < 300 ms sur deux colonnes)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _à venir_ | _EPIC-038 livrée (2026-09-21 : `audio.ts` + `audio.test.ts` — 2 fichiers, budget S4)_ |

## As-built (2026-09-21)

- `playSeq` + `releaseAudio()` + `clearPlayingMarks()` + assignation synchrone,
  exactement comme spécifié — **aucun appelant modifié** (`fileRow`, `yearsUI`,
  `dupsUI`, `playlistUI`, `domPatches` passent tous par `togglePlay`).
- `onerror`/`onended` libèrent aussi l'élément (`releaseAudio`) : le serveur
  streame `/audio`, un élément terminé n'a plus de raison de garder sa source.
- `playerFullpath` est remis à `''` à l'arrêt — `playingPath()` reste exactement
  `currentAudio ? playerFullpath : null` (contrat des cartes Années/Doublons).
- **Preuve par mutation** : en neutralisant la libération du précédent
  (`releaseAudio(currentAudio)`), le test « deux ▶ enchaînés » échoue avec DEUX
  éléments non pausés — le scénario du bug d'origine est donc bien capturé.

```
✓ static/src/audio.test.ts  (26 tests)
     Tests  1133 passed (1133)   [50 fichiers]
```

## Décisions

- **Pas de refactor des appelants** : tous les ▶ de l'app (Sync, Playlist, Années,
  Doublons, menus, `domPatches`) passent déjà par `togglePlay` — le bug est
  purement interne à `audio.ts` (KISS, S1/S3).
- **Génération plutôt que verrou** : un `playSeq` couvre les clics croisés sans
  bloquer l'UI pendant le chargement (pas de bouton désactivé, pas de file
  d'attente).
- **`src = ''` à la libération** : le serveur streame `/audio` ; se contenter de
  `pause()` laissait des connexions vivantes à chaque re-render des cartes.
- **Cue editor hors périmètre** : wavesurfer est un moteur séparé, dans une
  modale — documenté pour éviter toute attente implicite.

## Notes / Risques

- **R1** — `playingPath()` est utilisé par les re-renders des cartes (EPIC-034) :
  conserver exactement la sémantique `currentAudio ? playerFullpath : null`,
  sinon les ⏹ des cartes se perdent au re-render.
- **R2** — Le mock vitest actuel ne retient que la **dernière** instance : sans
  `__audios`, le test anti-régression ne peut pas prouver « un seul élément
  joue » (le mock fait partie du livrable).
- **R3** — Cas autoplay bloqué (`NotAllowedError`) : le message `setStatus` ne doit
  pas changer (EPIC-014/031 les citent dans les tests).
