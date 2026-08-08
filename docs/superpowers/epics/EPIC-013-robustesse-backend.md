# EPIC-013 — Robustesse backend : JSON atomique, verrou scan, cache parse, debug off

> **Statut** : ⚪ Backlog
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §2 (B11–B12), §6

## Objectif

Réduire les risques de corruption et de comportement instable côté serveur local (single-user mais le
fichier de collection est précieux).

## Tâches (proposées)

- [ ] **`save_json` atomique** : écrire `.tmp` + `os.replace` (le module NML le fait déjà — appliquer la
      même rigueur à `playlists.json`/`ratings.json`/`journal.json`).
- [ ] **`load_json` robuste** : try/except → retour du défaut (plus de 500 non formaté sur JSON corrompu) ;
      optionnel : log une entrée journal `error` si corruption détectée.
- [ ] **Verrou sur `/scan`** : refuser (409) ou ignorer un second scan si `_scan_progress['running']` ;
      bouton déjà désactivé côté UI mais la route doit être la ligne de défense.
- [ ] **Journal borné** : rotation (garder les 500 dernières entrées) + bouton « vider » dans la modal
      Journal (avec confirmation).
- [ ] **`app.run(debug=True)` conditionnel** : debugger Werkzeug uniquement avec un flag (ex. `--debug`)
      ; `npm start` en mode dev, `npm run prod` (ou équivalent) sans debugger.
- [ ] **Cache parse NML** : invalidation par mtime pour éviter le re-parse 0,5 s à chaque GET `/match`
      (optionnel — mesure du rapport : 1,5 s/POST acceptable).
- [x] ~~Aligner `/api/track/match` sur `is_path_allowed`~~ — **FAIT** (review EPICs 2026-08-08, R2) :
      garde 403 hors dossiers autorisés + test `test_track_match_blocks_path_outside_allowed_dirs`.
      Voir `docs/superpowers/reports/2026-08-08-audit-epics-review.md` §4.
- [ ] Tests : JSON corrompu → défaut ; double scan → verrou ; rotation journal ; mode debug off.

## Fichiers impactés (prévision)

`app.py` · `static/src/render/journalUI.ts` (bouton vider) · `templates/index.html` · `package.json`
(scripts dev/prod) · `test_app.py` · tests vitest

## Notes / Risques

- Le verrou `/scan` doit être relâché dans un `finally` (sinon un scan en erreur bloque tout).
- La rotation du journal doit préserver l'append-only (on tronque la tête, pas de réécriture partielle).
