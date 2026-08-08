# EPIC-001 — Éditeur waveform cue/loop

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : — (fondation)
> **Docs liées** : [plan](plans/2026-08-08-waveform-cue-editor.md) · [spec](specs/2026-08-07-waveform-cue-editor-design.md) · [rapport audit NML](reports/2026-08-08-nml-audit-real-collection.md)

## Objectif

Éditer les cues/loops hotcue (slots A–H) d'une piste de playlist en patchant une copie locale du
`collection.nml` de Traktor 4, avec export `.nml` patché pour HD/USB.

## Contexte & découvertes

- Module `nml.py` : parse ElementTree + index `(FILE, FILESIZE)` + écriture ciblée + export.
- 3 routes Flask : `/api/nml/status`, `/api/track/match`, `/api/track/cues`.
- Composant frontend `cueEditor` (wavesurfer.js 7.12.11 + plugin Regions) branché sur `.pl-track`.
- Découvertes de l'audit NML (collection réelle 56 645 entrées) : HOTCUE **0..7**, loop = `TYPE=5`,
  éditable = `TYPE∈{0,5}` ET `HOTCUE 0..7` (masquer TYPE=3/4 et HOTCUE=-1), multi-match fréquent
  (**12,2 % des clés `(FILE, FILESIZE)` ambiguës → 27,8 % des entrées concernées**, soit ~1 piste sur 8
  avec un homonyme — sélecteur d'homonymes obligatoire), ne jamais reconstruire `DISPL_ORDER`.

## Tâches (résumé — détail dans le plan)

- [x] Task 1 — fixture réelle + `nml.py` (load_nml, build_index, get_cues, get_entry_meta)
- [x] Task 2 — `write_cues` + `save_nml` (atomique .tmp + os.replace, backup .bak.nml, header standalone)
- [x] Task 3 — routes `/api/nml/status` + `/api/track/match`
- [x] Task 4 — `POST /api/track/cues` (écriture ciblée + backup + gestion multi-match 409)
- [x] Task 5 — export `.nml` patché (build_export_nml, traktor_dir, LOCATION réécrites)
- [x] Task 6 — modal + état (`activeModal='cueEditor'`, Escape)
- [x] Task 7 — composant wavesurfer + régions (cueModel.ts, slots A–H, loop)
- [x] Task 8 — sélecteur homonymes + mémorisation localStorage
- [x] Task 9 — interactions finales (destroy, save disabled, CSS)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `nml.py` | parse/index/écriture/export NML |
| `app.py` | routes /api/nml/status, /api/track/match, /api/track/cues, export étendu |
| `tests/fixtures/nml-sample.xml` | fixture NML réelle tronquée (5 ENTRIES) |
| `static/src/cueModel.ts` | mapping pur cues JSON ↔ NML (hors DOM) |
| `static/src/render/cueEditor.ts` | composant modal (wavesurfer + régions) |
| `static/src/state.ts` | ActiveModal += cueEditor |
| `static/src/commands/modals.ts` | Escape → close cueEditor |
| `templates/index.html` | modal #modal-cue-editor + bouton ⌖ playlist |
| `static/src/playlist.ts` | bouton d'ouverture |

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `07f1131` | feat(nml): parse + index (FILE,FILESIZE) + get_cues/entry_meta |
| `0b33acc` | feat(nml): write_cues filter + save_nml atomique (backup+header) |
| `0120863` | feat(api): nml status + track match (FILE,FILESIZE) |
| `18376ec` | feat(api): POST /api/track/cues (écriture ciblée+backup) |
| `15ab611` | feat(export): collection.nml patché avec LOCATION réécrites |
| `4aa0874` | feat(ui): modal cue editor (scaffold) |
| `dacb2df` | feat(ui): cue editor wavesurfer + regions (de l'API match/cues) |
| `aa1bcfd` | feat(ui): sel. homonymes + bouton ⌖ playlist |
| `7b6edea` | feat(ui): interactions finales cue editor — destroy + save disabled + CSS |
| `dfc3f4e` | docs(plan): cocher Task 9 + Self-Review |

## Décisions

- HOTCUE 0..7 = slots A–H (A=0), jamais « 1..8 ».
- Éditable = `TYPE∈{0,5}` ET `HOTCUE≥0` ; TYPE=3 (FLIP) et TYPE=4 (grille) toujours exclus.
- Index par `(FILE, FILESIZE)` ; multi-match → sélecteur + mémorisation `localStorage cue/sel:`.
- Le NML n'est jamais modifié pendant que Traktor tourne (copie locale) ; backup `.bak` unique + atomique.
- Round-trip : attributs + valeurs + ordre identiques ; formatage byte-identical non visé (−0,4 % accepté).

## Notes

- **Bugs bloquants découverts à l'usage** → tracés dans [EPIC-002](EPIC-002-correctifs-bloquants-audit.md).
- wavesurfer.js pin `7.12.11` (v8 en beta), bundle local via esbuild (zéro CDN).
