# EPIC-015 — FILESIZE Ko vs octets : match NML impossible sur la collection réelle

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [rapport smoke test](2026-08-08-smoke-test-navigateur.md) · [rapport NML](2026-08-08-nml-audit-real-collection.md)

## Objectif

Rétablir le match piste locale ↔ ENTRY Traktor sur la collection réelle : le NML stocke
`FILESIZE` en **Ko arrondis** (convention Traktor), le serveur comparait `os.path.getsize()`
en **octets** → 0 match / 300 fichiers réels. Cue editor « visualisation seule » sur toutes
les pistes, sauvegarde de cues et écriture de grille inopérantes.

## Contexte & découvertes (vérité forensique)

- Smoke test navigateur (8/8 OK, zéro erreur console) mais sondage API : `/api/track/match`
  renvoie **toujours `entries: []`** sur la collection réelle.
- Sur 600 fichiers réels : match octets **0/600**, match **Ko arrondi** `round(size/1024)`
  **581/600**, match `size//1024` 274/600 → **Traktor arrondit** (`5243` dans le NML pour un
  fichier de 5 368 832 octets ; 12 709 pour 13 013 827 octets).
- `nml.py:build_index` indexe `(FILE, FILESIZE)` tel quel (Ko, correct) ; `app.py` compare
  `str(os.path.getsize(local))` (octets) → incohérence d'unité.
- `nml.py:build_entry_element` (EPIC-007) écrivait `FILESIZE=str(os.path.getsize())` →
  des octets, incohérent avec Traktor (pistes ajoutées introuvables au re-match ET taille
  fausse côté Traktor).
- `nml.py:build_export_nml` (B8) matche aussi par `os.path.getsize()` → même bug à l'export.
- Pourquoi les tests passaient : les fixtures utilisent de petites valeurs (5243, 5004…)
  que les tests recréent en octets (`b'x' * 5243`) — coïncidence numérique octets=Ko sur
  petites tailles. Un fichier réel ≥ 3 Mo rend la différence d'unité décisive.

## Tâches

- [x] `nml.py` : helper `filesize_kb(size_bytes)` → Ko **arrondi** half-up `(size+512)//1024`
- [x] `app.py track_match` : `filesize = filesize_kb(os.path.getsize(local))`
- [x] `app.py track_add` : match + `build_entry_element` en Ko
- [x] `nml.py build_export_nml` : match en Ko (+ docstring)
- [x] `nml.py build_entry_element` : docstring FILESIZE en Ko
- [x] Tests : cas réel (fichier ≥ 3 Mo, Ko ≠ octets), match, add, export ; tests existants
      adaptés (`b'x' * N` → `b'x' * N * 1024` pour matcher les fixtures en Ko)
- [x] Vérif match sur la collection réelle : **97,5 %** (78/80 via HTTP, 194/200 en client) —
      les non-matchés sont des fichiers ABSENTS de la collection Traktor

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `nml.py` | `filesize_kb()`, `build_entry_element` (doc), `build_export_nml` |
| `app.py` | `track_match`, `track_add` |
| `test_nml.py` | tests `filesize_kb` + export |
| `test_app.py` | tests match/add réels (Ko), fixtures ×1024 |
| `docs/superpowers/epics/EPIC-015-filesize-ko-octets.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — 672 ✓
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — 173 ✓ (+5)
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Match réel : **97,5 %** (78/80) via HTTP sur le serveur relancé ; les non-matchés
      sont des fichiers jamais importés dans Traktor (clés NML absentes)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `fix(nml): EPIC-015 — FILESIZE en Ko (convention Traktor) : match/add/export + tests réels` |

## Décisions (compléments)

- `track_cues`/`track_grid` : le filesize vient du FRONTEND (valeur NML en Ko via
  `get_entry_meta`) → cohérent avec l'index Ko, aucune conversion (vérifié en review).
- Cache beatgrid (GET/PUT `/api/beatgrid`) : stocke les octets pour invalidation
  INTERNE (comparaison avec son propre `getsize`) → cohérent, inchangé (vérifié en review).
- Review : docstring `build_export_nml` corrigé (Ko) + assertion vacante du test remplacée
  par `entries[0].filesize == '5243'` (valeur NML exposée).

## Décisions

- **Ko arrondi half-up** `(size+512)//1024` (prouvé 581/600 vs 274/600 pour `//1024`), pas de
  flottant (pas d'arrondi bancaire Python sur .5).
- L'index NML reste tel quel (Ko) : la conversion se fait à la lecture du disque (une seule
  convention, le NML est la vérité).
- Le cache beatgrid (invalidation interne par FILESIZE) reste en octets : comparaison
  interne cohérente, aucune conversion à faire.

## Notes / Risques

- Collection réelle : les non-matchés sont des fichiers ABSENTS de la collection Traktor
  (jamais importés — ex. `01. Fragile (Remastered).flac` n'a aucune clé NML) — comportement
  normal, le match est ~100 % sur les pistes présentes.
- Le sélecteur d'homonymes (multi-match 409) discrimine toujours par (FILE, FILESIZE-Ko).
- Serveur local relancé avec le nouveau code (`nohup ./venv/bin/python app.py`), build à jour.
