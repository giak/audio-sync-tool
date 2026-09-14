# Design : Lecture dans le panneau Playlist (bouton ▶ par piste)

> **Date** : 2026-09-14 · **Statut** : brainstorming → prêt pour validation
> **Objets concernés** : `static/src/render/playlistUI.ts` (bouton play par ligne
> + câblage), `static/src/render.ts` (extraction + re-glow du nom dans le
> handler `audio:changed`), tests vitest associés.
> **Hors scope** : EPIC-022 backlog (a11y/responsive cue editor), dette des 12
> erreurs biome pré-existantes, lecture au clavier sur piste focusée
> (`commands/playlist.ts`), lecture depuis l'arbre source (déjà fonctionnelle
> via `.file-row`). Aucune modif de `audio.ts`, `templates/index.html` ni CSS.

## Problème

Dans la page Playlist, le panneau « playlist » (partie « ma playlist ») ne
permet pas de lancer la lecture : les lignes `.pl-track` n'ont aucun bouton ▶ à
la différence des lignes de l'arbre source (`.file-row`). Découverte : pour
écouter une piste de la playlist il faut passer par l'arbre source du panneau
voisin, ou par un double-clic / clic droit « ▶ Jouer » qui échoue visuellement
(`togglePlay` reçoit la ligne entière comme bouton → classe `.playing` posée
sur le mauvais élément, pas de retour visuel).

## Objectifs

1. Un **bouton ▶ par ligne** de playlist, identique aux lignes de fichiers
   (Sync).
2. État de lecture visible : bouton ⏹ + **glow du nom** (`.led-playing`), comme
   le panneau source.
3. Réutiliser l'infrastructure existante (`togglePlay`, `.play-btn`,
   `.led-playing`, événement `audio:changed`, barre de lecteur) — zéro
   duplication.

## Choix retenus (validés en session)

- **Approche A** : bouton `<span class="play-btn">` réutilisé, et glow piloté
  par l'état du bouton (`.play-btn.playing`) dans le handler `audio:changed`
  existant.
  Rejetée : branche `.pl-track` dans `togglePlay` (audio.ts) — modifie le noyau
  audio + change le comportement du glow des `.file-row` (nettoyage
  `onended/onerror`) ; mini-lecteur dédié dans le panneau — duplique la barre
  globale.
- **Bouton : `▶` puis `⏹`** (état toggle via `togglePlay`), `title="Écouter"`,
  `stopPropagation` — pattern exact de `fileRow.ts:26-34`.
- **Glow du nom** (`.pl-track-name`) via la classe `.led-playing` existante
  (dot cyan `.led-playing::before`) — le reste de la ligne est inchangé.

## Design

### 1. `static/src/render/playlistUI.ts` — `renderPlaylistTracks()`

- Insérer, après le drag handle `⬍` (l.141) et avant le nom :
  `<span class="play-btn" title="Écouter">▶</span>`.
- Bind après insertion du HTML (bloc `container.querySelectorAll` existant) :
  chaque `.play-btn` → `onclick = (e) => { e.stopPropagation(); togglePlay(...) }`.
  - `filename` = `btn.closest('.pl-track')?.querySelector('.pl-track-name')?.textContent`
  - `fullPath` = `.pl-track-remove` dataset (même pattern que le double-clic
    l.211-213).
- Ajouter `.play-btn` au guard du `row.onclick` (l.196) : cliquer ▶ ne déplace
  pas le focus clavier (pattern `fileRow.ts:99`).
- Double-clic (l.210-217) et menu contextuel « ▶ Jouer » (l.227) : **inchangés**
  — leur `trackEl.querySelector('.play-btn') || trackEl` résout désormais le
  vrai bouton (pointeur plus jamais sur la ligne).
- `togglePlay` devient le seul propriétaire de l'état `.playing`/⏹ de chaque
  bouton (réinitialisation globale déjà gérée par `audio.ts`).

### 2. `static/src/render.ts` — handler `audio:changed`

- Extraire le corps du handler (l.74-85) en fonction exportée :

```ts
export function updatePlaylistLedIndicator(): void {
  const sidebarEl = document.getElementById('playlist-sidebar');
  if (!sidebarEl || sidebarEl.classList.contains('hidden')) return;
  const container = document.getElementById('playlist-panel');
  if (!container) return;
  container.querySelectorAll('.led-playing').forEach(el => el.classList.remove('led-playing'));
  const playingRow = container.querySelector('.play-btn.playing')?.closest('.pl-track');
  const name = playingRow?.querySelector('.pl-track-name');
  if (name) name.classList.add('led-playing');
}
```

- La souscription devient `on('audio:changed', updatePlaylistLedIndicator)`
  (le **count de souscriptions reste 7** → test `render.test.ts:1483` inchangé).
- Comportement : quand `togglePlay` marque un bouton `.playing` puis émet
  `audio:changed`, le glow est posé sur le nom de la piste ; à l'arrêt (stop,
  piste terminée/erreur → plus aucun `.play-btn.playing`), le glow est nettoyé.
  Le glow de ce handler ne concerne que `#playlist-panel` (le glow `.file-row`
  de l'arbre source reste géré par `togglePlay`).

### 3. Aucun changement

- `audio.ts`, `templates/index.html`, `static/style.css` : déjà suffisants
  (`.play-btn`, `.led-playing::before`, logs `togglePlay`, barre de lecteur).

## Erreurs & cas limites

| Cas | Comportement |
|---|---|
| Stop / fin naturelle / erreur lecture | `onended`/`onerror`/`stopPlayer` retirent `.playing` puis émettent → plus de bouton playing → glow retiré |
| Changement de piste (lecture en cours) | `togglePlay` repositionne `.playing` (l.100-106) → glow se déplace sur la nouvelle ligne |
| Piste jouée depuis l'arbre source playlist (`.file-row`) | glow `.file` existant ; le handler ne touche pas `#playlist-panel` (pas de play-btn dans ce panneau) → no-op |
| Sidebar (panneau source) masquée | handler no-op ; au prochain affichage `renderPlaylistPanel` reconstruit les lignes |
| Clic ▶ | `stopPropagation` + guard → pas de déplacement du focus clavier ni de toggle raté |
| Erreur `NotAllowedError` (son bloqué) | toast existant `audio.ts:124` ; bouton revient en ▶ |
| Smash ▶▶ (double-clic) | même comportement que les lignes source (toggle rapide, propre au navigateur) |

## Tests

- `static/src/render/playlistUI.test.ts` (mock `../audio.js` avec
  `togglePlay: vi.fn()` existant ; `vi.mocked(togglePlay).mockReset()` dans le
  beforeEach) :
  - chaque piste affiche un `.play-btn` (`▶`, `title="Écouter"`) ;
  - clic sur `.play-btn` → `togglePlay` appelé avec
    `('a.mp3', '/x/a.mp3', btn)`.
- `static/src/render.test.ts` — tests directs de
  `updatePlaylistLedIndicator()` (mini-DOM `#playlist-sidebar` non masquée +
  `#playlist-panel`) :
  - ligne avec `.play-btn.playing` → `.pl-track-name` reçoit `led-playing` ;
  - aucune ligne en lecture → `.led-playing` existant est retiré ;
  - sidebar masquée (`class="hidden"`) → no-op (aucune mutation).
- Pas de test DOM sur `templates/index.html` (convention EPIC-023 : template
  Jinja non importé en vitest) ; clic réel vérifié en smoke (build +
  navigation Playlist → ▶ → barre de lecteur + glow + ⏹).
- Suite complète : `npm test` (732+), `npm run typecheck`, `npm run build`,
  `./venv/bin/python -m pytest -q` (aucun impact backend attendu).

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/playlistUI.ts` | Bouton play par ligne + bind + guard focus |
| `static/src/render.ts` | Extraction `updatePlaylistLedIndicator` + re-glow du nom |
| `static/src/render/playlistUI.test.ts` | Tests du bouton ▶ (existence + clic → togglePlay) |
| `static/src/render.test.ts` | Tests du glow piloté par l'état du bouton |