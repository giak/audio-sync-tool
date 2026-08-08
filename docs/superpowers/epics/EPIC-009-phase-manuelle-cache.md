# EPIC-009 — Beatgrid P2 : contrôle de phase manuel + cache par piste

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P2 (§5.4, §6a)

## Objectif

Donner à l'utilisateur le contrôle fin du **calage** (phase) de la grille — pas seulement du BPM — et
persister le résultat entre sessions.

## Tâches

- [x] **Nudge de phase** : boutons « ← 1/4 » / « → 1/4 » (décalage d'un quart de beat) à côté du champ
      BPM, la grille se redessine instantanément (réutilise `buildBeats(bpm, dur, phase)` + `_phase`).
- [x] **« Poser le beat 1 ici »** : bouton « ◎ Beat 1 » → mode dédié, le clic suivant sur la waveform
      (événement `click` wavesurfer, `relativeX` 0..1) fixe `_phase = relativeX × durée`.
- [x] **Marquage source** : toute correction manuelle (nudge, beat 1, saisie BPM) passe `_gridSource =
      'manual'` (badge jaune « manuel » déjà en place).
- [x] **Cache par piste** (`data/beatgrids.json`, clé = chemin réel du fichier) : `{bpm, phase, source,
      filesize}` — persisté à chaque nudge/beat-1/saisie/détection ; cascade NML → cache → détection.
- [x] API : `GET`/`PUT /api/beatgrid` (fichier JSON séparé du cache de scan `cache.json` — tranché :
      séparé, plus propre). Invalidation par FILESIZE (fichier remplacé → cache ignoré).
- [x] Tests : nudge décale la grille et le snap (10.26 → 10.125 après ←1/4) ; « poser beat 1 » ;
      persistance cache (round-trip + staleness) ; badge manuel ; garde 403/400 côté serveur.

## Fichiers impactés

`static/src/render/cueEditor.ts` · `templates/index.html` · `static/style.css`
· `app.py` (BEATGRID_PATH + routes) · `static/src/render/cueEditor.test.ts` (+8) · `test_app.py` (+6)

## Dépendances

- S'appuie sur l'état `_phase`/`_gridSource` et le badge créés par [EPIC-008](EPIC-008-grille-native-nml.md).
- Option 6a du plan (§6) : cache app, indépendant de Traktor.

## Décisions

- Clé de cache = **chemin réel du fichier** (pas FILE+FILESIZE) : l'éditeur travaille sur le chemin local,
  et la FILESIZE est stockée **dans** l'entrée pour l'invalidation — pas besoin de connaître le FILESIZE
  côté client (visible seulement pour les pistes matchées).
- `source` persistée telle quelle (`nml`/`detected`/`manual`) ; le badge la restitue à la réouverture.
- Sauvegarde best-effort : `Promise.resolve(api(...)).catch(() => {})` — un échec de cache ne bloque
  jamais l'édition ni la sauvegarde des cues.

## Validation

- **627 vitest** (+11 EPIC-009) / **134 pytest** (+6 beatgrid) / typecheck 0 / lint 0 / build OK.
- Vérifié en `--sequence.shuffle`.
- Cascade vérifiée par tests : grille native correcte jamais écrasée par un cache
  « detected » ; correction « manual » PRIME sur la native ; grille native aberrante
  (BPM 1.0/17178) ne bloque pas le cache/détection.

## Traçabilité

- Working tree (non commité) : `app.py`, `static/src/render/cueEditor.ts`, `templates/index.html`,
  `static/style.css`, `static/src/render/cueEditor.test.ts`, `test_app.py` + registre EPICs.

## Notes / Risques

- Cache séparé de `cache.json` (scan) — aucun risque d'écrasement mutuel.
- Le cache est invalidé si le fichier audio change (FILESIZE suffit en pratique).
- Le beat posé par « ◎ Beat 1 » est un beat quelconque, pas forcément le downbeat de la mesure
  (suffisant pour le snap des cues/loops — cf. plan §4.2).
- Priorités de la cascade (décision review) : **correction manuelle (cache) > grille native NML > cache
  détecté > détection client**. Un cache « detected » n'écrase jamais une grille native correcte ;
  une grille native aberrante laisse passer cache puis détection.
