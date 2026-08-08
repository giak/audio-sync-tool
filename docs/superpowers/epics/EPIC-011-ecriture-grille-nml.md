# EPIC-011 — Beatgrid P4 : écrire la grille calculée dans le NML (le graal)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P4, §6b

## Objectif

Réécrire `TEMPO` + `CUE_V2 TYPE="4"` + `<GRID BPM=…>` dans le collection.nml pour les pistes analysées —
**Traktor lui-même afficherait alors la grille** (le DJ voit ses pistes calées), et l'app n'analyse plus
jamais ces pistes.

## Contexte

- Format cible (déjà mesuré sur la collection réelle, voir EPIC-008) :
  ```xml
  <TEMPO BPM="133.000000" BPM_QUALITY="…"></TEMPO>
  <CUE_V2 NAME="n.n." DISPL_ORDER="0" TYPE="4" START="55.387418" LEN="0.000000" REPEATS="-1" HOTCUE="-1">
    <GRID BPM="133.000000"></GRID>
  </CUE_V2>
  ```
- `write_cues()` préserve déjà les TYPE∉{0,5} (dont TYPE=4) — mais il n'y a pas d'écriture/upsert de grille.

## Tâches

- [x] `nml.py` : `upsert_beatgrid(entry, bpm, phase, quality)` — crée ou met à jour TEMPO + CUE_V2 TYPE=4
      (+ GRID enfant), en préservant un TYPE=4 existant (upsert idempotent, jamais de doublon).
- [x] Route `POST /api/track/grid` : résolution d'ENTRY (pattern `track_cues`, 404/409/400),
      backup `.bak` + écriture atomique (pattern existant), journal.
- [x] **Validation sur copie** : upsert + re-parse XML + relecture sur une copie de la collection réelle
      (56 645 ENTRY, +3 grilles exactement, round-trip sans perte, XML valide) — jamais sur l'original.
- [x] `BPM_QUALITY=100` par défaut ; borne 20–400 (cf. EPIC-008) + phase ≥ 0 + quality 0–100 validées.
- [x] UI : bouton « 💾 Grille » dans le transport (disabled sans BPM ou sans ENTRY, état ⏳ pendant
      l'écriture, ré-armé en finally) ; badge `NML` après écriture (source centralisée `updateBpmBadge`).
- [x] Tests : upsert crée/met à jour sans dupliquer ; round-trip `write_cues` ; POST écrit+relu,
      400/404/409, backup ; vitest (disabled, POST, badge NML, erreur).

## Validation

- **640 vitest** (shuffle) / **160 pytest** — typecheck 0 · lint 0 · build OK.
- Validation forensique sur copie de la collection réelle : format exact (TEMPO après INFO,
  6 décimales, `CUE_V2 TYPE=4 NAME=AutoGrid` + enfant `GRID BPM`) confirmé sur 12 323 grilles natives.
- Le TEMPO existant est mis à jour (pas dupliqué) ; un TYPE=4 existant est mis à jour (START + GRID),
  jamais doublé ; les autres CUE_V2 sont intacts.

## Livraison

- Commit : à référencer après `git commit` (état actuel non commité).

## Fichiers impactés (prévision)

`nml.py` · `app.py` · `static/src/render/cueEditor.ts` · `test_nml.py` · `test_app.py` · tests vitest

## Dépendances

- Analyse serveur (EPIC-010) fournit BPM/phase à écrire ; phase manuelle (EPIC-009) aussi.

## Notes / Risques

- ⚠️ Traktor peut **régénérer/écraser** son analyse au prochain scan complet — à valider sur copie.
- Ne jamais écrire dans le NML pendant que Traktor tourne (règle EPIC-001).
- Le gain est réel même si partiel : les pistes analysées une fois sont calées pour toujours.
- Après écriture, la cascade NML → cache donne la priorité à la grille native à la réouverture :
  l'analyse/correction manuelle qui l'a produite ne s'applique plus qu'en secours.
