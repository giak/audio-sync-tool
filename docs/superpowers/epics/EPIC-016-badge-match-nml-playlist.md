# EPIC-016 — Badge « matché NML » / « non importé » dans la playlist

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [rapport smoke test](2026-08-08-smoke-test-navigateur.md) · [EPIC-015](EPIC-015-filesize-ko-octets.md)

## Objectif

Visualiser d'un coup d'œil, dans la playlist, quelles pistes sont **sauvegardables**
(présentes dans la collection Traktor → cues/loops/grille éditables et écritures possibles)
vs **non importées** (visualisation seule) vs **homonymes** (plusieurs entrées NML, sélecteur
au clic sur Cues). Évite d'ouvrir le cue editor pour découvrir qu'une piste est « visualisation
seule », ou de croire qu'une sauvegarde a fonctionné sur une piste absente.

## Contexte

- Le cue editor affiche déjà un bandeau « ⚠️ Piste absente de la collection Traktor » à
  l'ouverture — mais après le match FILESIZE (EPIC-015), la plupart des pistes de la playlist
  sont matchées, et il faut ouvrir chaque piste pour le savoir.
- L'API `/api/track/match?path=` (sécurisée en review) renvoie `entries[]` : 0 → absent,
  1 → match unique, >1 → homonymes (le frontend gère déjà la sélection d'homonymes dans le
  cue editor).

## Tâches

- [x] `static/src/matchStatus.ts` : type `MatchStatus` (`matched | multiple | missing | error`),
      `getMatchStatus(fullPath)` (fetch lazy + **cache de PROMESSES** par fullPath → dédup des
      appels concurrents, erreurs → `error` neutre, jamais d'alerte), `matchBadgeParts(status)`
      → `{cls, text, title}` (mutation in-place) et `matchBadgeHtml` (span complet, tests)
- [x] `static/src/render/playlistUI.ts` : placeholder `<span class="pl-track-match">` par piste
      (rendu initial non bloqué) + `fillMatchBadges()` lazy en **lots bornés** (8 requêtes en
      vol max, pas de rafale sur grosses playlists), remplissage **in-place** (className/
      textContent/title — `data-fullpath` et le nœud sont conservés), badge détaché entre-temps
      → ignoré
- [x] `static/style.css` : styles des 5 états (couleurs vert / ambre / rouge / neutre, compact 11 px)
- [x] `static/src/render/cueEditor.ts` : `_clearMatchCache()` + `emit('eparsPlaylist:changed')`
      après un `POST /api/track/add` réussi → badges rafraîchis immédiatement (sans cycle
      d'import : cueEditor émet l'événement que render.ts écoute déjà)
- [x] Tests : `matchStatus.test.ts` (4 états + cache + dédup concurrente + erreurs réseau +
      matchBadgeParts) + badge dans `playlistUI.test.ts` (placeholder, remplissage lazy
      matché/missing/error, `data-fullpath` conservé, cache vidé entre tests)
- [x] Validation complète : vitest shuffle, typecheck, lint, build

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/matchStatus.ts` | module statut de match (cache + badge) |
| `static/src/render/playlistUI.ts` | placeholder par ligne + remplissage lazy |
| `static/style.css` | styles `.pl-track-match` (5 états) |
| `static/src/matchStatus.test.ts` | tests unitaires du module |
| `static/src/render/playlistUI.test.ts` | tests d'intégration du badge |
| `docs/superpowers/epics/EPIC-016-badge-match-nml-playlist.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — 685 ✓
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Tests ciblés : `matchStatus.test.ts` + `playlistUI.test.ts` + `cueEditor.test.ts` — 100 ✓
- [x] Review critique appliquée : cache de promesses (pas de double-fetch), lots bornés,
      mutation in-place (data-fullpath conservé), invalidation du cache après ajout piste

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat(ui): EPIC-016 — badge match NML dans la playlist (matché / homonymes / non importé)` |

## Décisions (KISS)

- **Lazy + non bloquant** : le badge est un placeholder « … » rempli en arrière-plan après le
  rendu ; la playlist ne dépend jamais du réseau pour s'afficher.
- **Cache de promesses par fullPath** : un seul fetch par piste et par session, déduplique les
  appels concurrents (re-renders rapides, filtrage en live) — le cache n'est vidé que par
  `_clearMatchCache()` après ajout de piste à la collection (le statut change alors).
- **Remplissage par lots bornés (8 en vol)** : pas de rafale de N fetch simultanés sur une
  grosse playlist ; le cache atténue les re-renders.
- **Mutation in-place du badge** (className/textContent/title) : conserve `data-fullpath` et
  évite tout remplacement de nœud / imbrication de spans.
- **Échec réseau = badge neutre « ? »** (jamais d'alerte, pas de toast) : le badge est
  informatif, pas critique.
- **Pas de nouvelle route API** : réutilise `/api/track/match` existante (aucun coût serveur).
- **Pas de cycle d'import** : cueEditor n'importe pas playlistUI ; il émet l'événement
  `eparsPlaylist:changed` que render.ts écoute déjà (re-render conditionnel si le layout
  playlist est visible).

## Notes / Risques

- Le multi-match « ≈ homonymes » apparaît sur les pistes dont plusieurs ENTRY partagent
  (FILE, FILESIZE-Ko) — le clic sur Cues ouvre le sélecteur d'homonymes existant.
- Pour les très grandes playlists, `Promise.all` lance N fetch en parallèle (un par piste) —
  acceptable en local ; le cache évite la répétition au re-render.
