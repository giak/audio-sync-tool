# EPIC-009 — Beatgrid P2 : contrôle de phase manuel + cache par piste

> **Statut** : ⚪ Backlog
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P2 (§5.4, §6a)

## Objectif

Donner à l'utilisateur le contrôle fin du **calage** (phase) de la grille — pas seulement du BPM — et
persister le résultat entre sessions.

## Tâches (proposées)

- [ ] **Nudge de phase** : boutons « ← 1/4 » / « → 1/4 » (décalage d'un quart de beat) à côté du champ
      BPM, la grille se redessine instantanément (réutilise `buildBeats(bpm, dur, phase)` + `_phase`).
- [ ] **« Poser le beat 1 ici »** : clic sur la waveform (mode dédié) → `_phase = position cliquée`
      (alternative plus rapide que le nudge répété).
- [ ] **Marquage source** : toute correction manuelle passe `_gridSource = 'manual'` (badge déjà en place).
- [ ] **Cache par piste** (`data/cache.json`, clé `FILE+FILESIZE` ou path) : `{bpm, phase, source}` —
      le BPM/phase détectés ou corrigés survivent à la fermeture ; cascade NML → cache → détection.
- [ ] API : endpoint de lecture/écriture du cache beatgrid (ou réutilisation de `/load`+`/scan` ? —
      à trancher : un fichier JSON séparé `data/beatgrids.json` est plus propre que le cache de scan).
- [ ] Tests : nudge décale la grille et le snap ; « poser beat 1 » ; persistance cache ; badge manuel.

## Fichiers impactés (prévision)

`static/src/render/cueEditor.ts` · `static/src/beatgrid.ts` · `templates/index.html` · `static/style.css`
· `app.py` (endpoint cache beatgrid) · tests associés

## Dépendances

- S'appuie sur l'état `_phase`/`_gridSource` et le badge créés par [EPIC-008](EPIC-008-grille-native-nml.md).
- Option 6a du plan (§6) : cache app, indépendant de Traktor.

## Notes / Risques

- Ne pas confondre le cache de scan (`cache.json`) avec le cache beatgrid — risque d'écrasement.
- Le cache doit être invalidé si le fichier audio change (FILESIZE suffit en pratique).
