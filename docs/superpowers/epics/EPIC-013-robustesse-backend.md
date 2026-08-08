# EPIC-013 — Robustesse backend : JSON atomique, verrou scan, cache parse, debug off

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §2 (B11–B12), §6

## Objectif

Réduire les risques de corruption et de comportement instable côté serveur local (single-user mais le
fichier de collection est précieux).

## Tâches

- [x] **`save_json` atomique** : `.tmp` + `os.replace` appliqué à tous les JSON (config, playlists,
      ratings, journal, cache, beatgrids) — plus jamais de fichier à moitié écrit.
- [x] **`load_json` robuste** : try/except → retour du défaut (plus de 500 non formaté sur JSON corrompu)
      + entrée journal `error` ; `log_corrupt=False` dans `log_journal` (évite la récursion
      load_json→log_journal→load_json si le journal lui-même est corrompu).
- [x] **Verrou sur `/scan`** : 409 si `_scan_progress['running']` (ligne de défense serveur, le bouton est
      déjà désactivé côté UI) ; verrou relâché dans un `finally` (un scan en erreur ne bloque plus rien).
- [x] **Journal borné** : rotation à `JOURNAL_MAX_ENTRIES=500` (troncature de tête, append-only) +
      bouton « 🗑 Vider » dans la modal Journal (`DELETE /journal`, avec confirmation).
- [x] **`app.run(debug=True)` conditionnel** : debugger Werkzeug uniquement avec `python app.py --debug` ;
      défaut = sans debugger (usage quotidien).
- [x] **Cache parse NML** : invalidation par (realpath, mtime+taille) — l'index (≈0,5 s de parse sur la
      collection réelle) n'est reconstruit que si le fichier change ; clé = chemin réel (aucune fuite
      entre collections/fixtures) ; l'arbre muté en mémoire (cues/grille/ajout) reste cohérent car
      `save_nml` change le mtime → re-parse.
- [x] ~~Aligner `/api/track/match` sur `is_path_allowed`~~ — **FAIT** (review EPICs 2026-08-08, R2).
- [x] Tests : JSON corrompu → défaut + entrée journal ; double scan → 409 ; verrou relâché sur erreur ;
      rotation 500 ; DELETE /journal ; cache mtime (re-parse seulement si fichier changé) ; vitest
      `clearJournal` (DELETE, re-render, erreur, ré-armement).

## Validation

- **658 vitest** (shuffle) / **168 pytest** — typecheck 0 · lint 0 · build OK.
- 24 tests routes (grid/cues/match) verts avec le cache NML actif ; smoke `app.py` sans `--debug` OK.

## Fichiers impactés (prévision)

`app.py` · `static/src/render/journalUI.ts` (bouton vider) · `templates/index.html` · `package.json`
(scripts dev/prod) · `test_app.py` · tests vitest

## Notes / Risques

- Le verrou `/scan` est relâché dans un `finally` (un scan en erreur ne bloque pas les suivants).
- La rotation du journal tronque la tête (append-only, pas de réécriture partielle).
- Le cache NML est en mémoire : un redémarrage le vide (comportement voulu — le mtime re-parse).
- `debug=True` reste disponible via `--debug` pour le développement (reloader Werkzeug).
