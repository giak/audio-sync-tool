# EPIC-025 — Lecture dans le panneau Playlist (bouton ▶ par piste)

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-14 · **Dernière mise à jour** : 2026-09-15
> **Priorité** : Moyenne (UX : écouter sa playlist sans passer par l'arbre source)
> **Docs liées** : [spec](../specs/2026-09-14-playlist-playback-design.md), [plan](../plans/2026-09-14-playlist-playback.md)

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

- [x] Tests vitest 739
- [x] Test pytest 174
- [x] Typecheck 0 erreur
- [x] Build OK
- [x] Smoke serveur : page 200 + assets style/script servis (cache-buster `?v=`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `4b90857` | docs(spec): lecture panneau Playlist — bouton ▶ par piste (EPIC-025) |
| `922f80e` | feat(render): updatePlaylistLedIndicator — glow nom piste playlist piloté par .play-btn.playing |
| `9726521` | test(render): no-op test panneau playlist absent + fix quote lint (review Task 1) |
| `bfb76c1` | feat(playlist): bouton ▶ par piste — lecture via togglePlay (pattern fileRow) |

## Décisions

- **Zéro modif noyau** : `audio.ts`, `templates/index.html`, `style.css` intacts — `.play-btn`, `.led-playing::before`, `togglePlay` et l'événement `audio:changed` suffisent.
- **Glow piloté par l'état du bouton** (dans le handler `audio:changed` existant) plutôt qu'une branche `.pl-track` dans `togglePlay` : pas de changement de comportement du glow `.file-row`, pas de nettoyage `onended/onerror` à réinventer, souscription unique (count `on()` = 7 inchangé).
- **Double-clic / menu « ▶ Jouer » inchangés** : leur `querySelector('.play-btn') || trackEl` résout désormais le vrai bouton (le fallback ligne entière ne se déclenche plus).

## Notes

- Le glow ne concerne que `#playlist-panel` ; le glow `.file-row` de l'arbre source reste géré par `togglePlay`.
- Les 12 erreurs biome pré-existantes persistent — hors périmètre (EPIC « dette » dédiée).
- **Suivi review finale (hors périmètre, non bloquant, Ready to merge ✅)** :
  1. **Desync re-render** : pendant une lecture active, un re-render du panneau (`eparsPlaylist:changed`, ex. édit de rating) rebâtit les `.play-btn` en `▶` sans ré-asseoir `.playing`/glow — même comportement pré-existant pour `.file-row` → à traiter une fois au niveau `audio.ts` (ré-assertion via le fullpath courant, source de vérité unique).
  2. **Test d'intégration du chemin complet** clic ▶ → `audio:changed` → glow → stop → retrait : non automatisé (chaque maillon l'est unitairement) → à ajouter sur le flux réel `audio.ts`.
