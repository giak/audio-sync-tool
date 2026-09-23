# EPIC-055 — Découpage du monolithe app.py (2 350 lignes, 33 routes)

> **Statut** : ⚪ Backlog
> **Créée** : 2026-09-23 · **Dernière mise à jour** : 2026-09-23
> **Priorité** : Moyenne
> **Docs liées** : EPIC-036 (refactoring frontend — le même esprit côté backend) · EPIC-013 (save_json atomique)

## Objectif

`app.py` concentre **2 350 lignes et 33 routes** : scan, copie, écriture de tags
(years/styles/audit), NML Traktor, playlists, beatgrid, analyse DSP — chaque
modification d'une route passe par un fichier monolithique sans frontière claire.
Le frontend a été stranglé en 2026-09-19 (EPIC-036) ; le backend reste à faire,
avec le même verrou : **pas de framework, pas de réécriture** — découpage
mécanique gardé par les tests.

## Contexte & découvertes

Zones naturelles visibles par lecture des séparateurs existants :

| Zone | Contenu (lignes) | Candidat module |
|---|---|---|
| JSON utilitaires | `load_json`/`save_json`/extra/hidden dirs (40-145) | `store.py` |
| Scan & index | progress, `get_audio_meta`, `_scan_file`, `index_files` (147-540) | `scan.py` |
| Copie + style à la copie | `_style_of_*`, `_write_style_at_copy`, `/copy`, `/move`, `/delete`, `/mkdir` (659-830) | `copying.py` |
| Écriture tags (years/styles/audit) | `/years/*`, `/styles/*` (1380-1920) | `tagging.py` |
| NML Traktor | index cache, `/api/nml/*`, `/api/track/*` (407-540, 2101+) | déjà `nml.py`, routes → `tracks.py` |
| Playlists | `/playlists/*` (1921-2100) | `playlists.py` |
| Beatgrid/analyse | `/api/beatgrid`, `/api/track/analyze` (2243+) | `analysis.py` existe, routes → `beatgrid.py` |

Contraintes héritées : `CACHE_PATH` et les chemins `data/` sont des constantes
de module (les tests monkeypatchent `app.X` — le découpage doit garder les
points de patch stables ou mettre à jour les tests dans le même commit).

## Tâches

- [ ] Strangler fig par zones : extraire UNE zone par commit, tests verts entre
      chaque (371 pytest + 1 230 vitest comme filet — les tests backend
      monkeypatchent `app.CACHE_PATH`, à faire suivre)
- [ ] `app.py` final = factory + enregistrement des blueprints + constantes
      partagées (cible < 300 lignes)
- [ ] `static/dist` et `templates/` inchangés (aucune route renommée — le
      frontend ne doit pas voir la différence)
- [ ] Audit des imports croisés (`audit_applied_years.py` importe depuis
      `apply_years`/`collect_years` — hors périmètre mais à ne pas casser)

## Validation

- [ ] Typecheck, vitest, pytest, lint, build inchangés à chaque commit
- [ ] `wc -l app.py` < 300, chaque module < 500 lignes
- [ ] Aucun changement d'API (smoke test navigateur : scan → F5 → `g` → playlist)

## Notes / Risques

- Ne DÉMARRER qu'après clôture de EPIC-054 (la collecte et l'application des
  clés-tags touchent `apply_years`/`app.py` : ne pas mélanger).
- Les tests monkeypatchent les constantes de module : c'est le principal coût
  du déménagement (mécanique mais volumineux).
