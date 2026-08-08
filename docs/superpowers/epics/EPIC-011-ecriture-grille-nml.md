# EPIC-011 — Beatgrid P4 : écrire la grille calculée dans le NML (le graal)

> **Statut** : ⚪ Backlog
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

## Tâches (proposées)

- [ ] `nml.py` : `upsert_beatgrid(entry, bpm, phase, quality)` — crée ou met à jour TEMPO + CUE_V2 TYPE=4
      (+ GRID enfant), en préservant un TYPE=4 existant.
- [ ] Route : réutiliser un POST (soit `/api/track/cues`, soit une nouvelle `/api/track/grid`) avec
      backup `.bak` + écriture atomique (pattern existant).
- [ ] **Validation sur copie** : tester sur une copie de la collection réelle avant tout usage réel
      (règle data-safety du projet) ; vérifier que Traktor accepte la grille (scan test).
- [ ] `BPM_QUALITY` cohérent (ex. 100 si analyse réussie) ; borne 20–400 (cf. EPIC-008).
- [ ] UI : option « Enregistrer la grille dans la collection » (badge `NML` après écriture) ou
      automatique à la sauvegarde des cues.
- [ ] Tests : upsert crée/met à jour sans dupliquer ; backup créé ; round-trip ; grille préservée par
      `write_cues` après upsert.

## Fichiers impactés (prévision)

`nml.py` · `app.py` · `static/src/render/cueEditor.ts` · `test_nml.py` · `test_app.py` · tests vitest

## Dépendances

- Analyse serveur (EPIC-010) fournit BPM/phase à écrire ; phase manuelle (EPIC-009) aussi.

## Notes / Risques

- ⚠️ Traktor peut **régénérer/écraser** son analyse au prochain scan complet — à valider sur copie.
- Ne jamais écrire dans le NML pendant que Traktor tourne (règle EPIC-001).
- Le gain est réel même si partiel : les pistes analysées une fois sont calées pour toujours.
