# EPIC-003 — Export NML configurable + round-trip DISPL_ORDER (B8–B9)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute (P1)
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §2 (B8–B9)

## Objectif

Rendre l'export NML configurable depuis l'interface (fin de l'échec silencieux) et préserver
`DISPL_ORDER` au round-trip (décision verrouillée par l'audit NML).

## Correctifs

### B8 — 🔴 Export NML non configurable + échec silencieux + LOCATION erronée
- **Correctif** :
  1. Champs `traktor_export_root` et `traktor_export_volume` ajoutés à la **config UI** (`index.html`) et
     au type `ConfigEntry` du frontend.
  2. `export_root` vide → **message explicite** côté client (`nml_error`), plus de `os.makedirs('')`
     silencieux.
  3. `DIR` calculé depuis l'**emplacement réel** des fichiers exportés (`pl_dir` sous `export_root`),
     plus depuis le chemin source Linux d'origine.
  4. Cas racine du dossier source (slash final dans `source_data`) → `normpath` + `rel=''` (DIR = volume).
- **Tests** : round-trip des champs config, `nml_error` sans root, DIR réécrit via la route, racine source.

### B9 — 🟠 `regionToCue` reconstruisait `DISPL_ORDER` depuis HOTCUE
- **Correctif** : `displ_order` d'origine transporté dans un Map `{hotcue → displ_order}` peuplé au
  chargement ; les nouveaux cues reçoivent un **ordre chronologique** (tri par start), pas l'index de slot.
- **Tests** : round-trip DISPL_ORDER des cues existants ; ordre chronologique pour les nouveaux.

## Fichiers impactés

`templates/index.html` · `static/src/actions.ts` (ConfigEntry) · `app.py` · `nml.py` ·
`static/src/render/cueEditor.ts` · `test_app.py` · `test_nml.py` · `static/src/render/cueEditor.test.ts`

## Traçabilité (commits)

> Livré en working tree dans la session du 2026-08-08. À commiter en référençant cette EPIC.

## Décisions

- `DISPL_ORDER` n'est **jamais reconstruit depuis HOTCUE** (326/8 435 divergences mesurées en vrai).
- Un export sans racine configurée échoue **visiblement**, jamais en silence (leçon B8).
