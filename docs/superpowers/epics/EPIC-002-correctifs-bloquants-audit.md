# EPIC-002 — Correctifs bloquants de l'audit (B1–B7)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Critique (P0)
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §2 (B1–B7) · [EPIC-001](EPIC-001-cue-editor-waveform.md)

## Objectif

Débloquer l'éditeur cues : la chaîne « ouvrir → écouter → poser un cue → sauvegarder » était cassée à
chaque maillon. Chaque correctif a son test (leçon de l'audit : les tests verts ne prouvaient rien car ils
ne testaient pas la forme réelle des données ni le chemin d'exécution réel).

## Correctifs

### B1 — 🔴 `POST /api/track/cues` 404 en production
- **Cause** : route déclarée **après** `app.run()` → jamais enregistrée en exécution réelle.
- **Correctif** : bloc `if __name__ == '__main__'` déplacé à la fin du fichier.
- **Test** : `test_main_execution_registers_track_cues_route` (exécute le module en sous-process).

### B2 — 🔴 `start`/`len` strings → régions cassées
- **Cause** : `get_cues` renvoie des chaînes, `cuesToRegions` fait de l'arithmétique → concaténation.
- **Correctif** : `CueDTO.start/len` élargis `number | string` + `Number()` à la frontière.
- **Test** : forme réelle de l'API (strings) dans cueModel.test / cueEditor.test.

### B3 — 🔴 Sauvegarde impossible sur homonymes (multi-match : 12,2 % des clés / 27,8 % des entrées)
- **Cause** : `saveCues` omettait le champ `entry` → 409 systématique.
- **Correctif** : `_entryRef.entry` transporté dans le payload ; sélecteur affiche DIR/VOLUME.
- **Test** : simulation multi-match → `api` appelé avec `entry: <index>`.

### B4 — 🔴 Aucun contrôle de lecture dans la modal
- **Cause** : pas de transport (play/pause), pas de binding clavier.
- **Correctif** : bouton ▶/⏸, temps courant, `Space`/`←→`, `timeupdate`.
- **Test** : playPause sur clic + événements play/pause reflétés dans le bouton.

### B5 — 🔴 `write_cues` détruisait les cues `TYPE∈{0,5}`/`HOTCUE=-1`
- **Correctif** : `kept` conserve aussi les TYPE∈{0,5} à HOTCUE=-1.
- **Test** : survie des HOTCUE=-1 au round-trip.

### B6 — 🔴 Aucune validation serveur des cues
- **Correctif** : validation type∈{0,5}, hotcue entier 0..7, start/len numériques ≥ 0 (rejet nan/inf).
- **Tests** : bad type, bad hotcue, start négatif, nan/inf, float hotcue, valid still ok.

### B7 — 🔴 Fuite d'instance wavesurfer au changement d'entrée
- **Correctif** : `ws?.destroy()` en tête de `renderWaveform`.
- **Test** : destruction de l'instance précédente au re-render homonymes.

## Fichiers impactés

`app.py` · `nml.py` · `static/src/cueModel.ts` · `static/src/render/cueEditor.ts` · `test_app.py` ·
`test_nml.py` · `static/src/cueModel.test.ts` · `static/src/render/cueEditor.test.ts`

## Traçabilité (commits)

> Commit : `a21f1ae` (`fix(cue-editor): correctifs bloquants audit — route /api/track/cues après
> app.run, start/len cohercés, entry multi-match, transport play-pause [EPIC-002]`).
> L'état validé : 614 vitest / **128** pytest / typecheck 0 / lint 0 / build OK — suite stabilisée en
> `--sequence.shuffle` (voir rapport `2026-08-08-audit-epics-review.md` §3).

## Décisions

- Le **serveur reste la ligne de défense** (B6) : le client peut être défaillant (ancien bundle).
- Les tests doivent reproduire la **forme réelle des données** (strings), pas des nombres idéaux.
