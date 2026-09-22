# EPIC-049 — Recherche web locale ; Brave dehors, Beatport sorti

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Moyenne
> **Docs liées** : [spec](../specs/2026-09-22-recherche-web-locale-design.md) · EPIC-040 (recherche web « candidats seulement ») · EPIC-033 (Beatport en pause)

## Objectif

Le dernier recours du moteur d'années doit être **gratuit et local**
(DuckDuckGo), dire quand il est indisponible — et Beatport doit sortir du
pipeline au lieu d'y occuper une place fantôme.

## Contexte & découvertes

- `BRAVE_API_KEY` est **absente** (et payante) : la passe web n'a jamais produit
  un candidat. DuckDuckGo est disponible localement (MCP `search`,
  `http://localhost:8010/mcp` dans `~/.agents/mcp.json`) — port fermé à la
  mesure, d'où le repli HTML.
- `data/beatport_cache.jsonl` **n'existe pas** : la passe n'a jamais tourné
  (token recopié à la main refusé deux fois). Le pipeline, la priorité du
  consolidé, le README et les tests la portent encore.

## Tâches

- [x] `scripts/web_search.py` : MCP local (JSON-RPC `tools/call`) → repli
      DuckDuckGo HTML → `[]` + `error` (jamais un silence)
- [x] `collect_years.py` : `BRAVE_URL` / `BRAVE_API_KEY` / `search_token()`
      retirés, `web_vote` passe par `web_search`
- [x] Rôle inchangé : candidats + `evidence` uniquement, **jamais un vote**
- [x] Beatport retiré : script + tests + `BP_CACHE` (report/apply/app) +
      priorité du consolidé + docs
- [x] `GET /years/web-status` (sonde 1 s) exposé, et affiché par la vue Années
- [x] Tests : transport injecté (MCP OK, MCP KO → HTML, tout KO → error) ;
      `collect_years` sans aucune référence à Brave ; un
      `beatport_cache.jsonl` résiduel est ignoré sans erreur

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `scripts/web_search.py` | fournisseur de recherche local (neuf) |
| `scripts/collect_years.py` | `web_vote` via `web_search`, Brave retiré |
| `scripts/report_years.py`, `scripts/apply_years.py` | `BP_CACHE` retiré |
| `app.py` | `/years/web-status`, `BEATPORT_CACHE_PATH` retiré |
| `static/src/render/yearsUI.ts` | ligne d'état du fournisseur |
| `test_web_search.py` | tests (transport injecté) |

## Validation

- [x] Typecheck (`npx tsc --noEmit`)
- [x] Tests frontend (`npx vitest run`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat: EPIC-049 — recherche web DuckDuckGo locale ; Beatport sorti du pipeline` |

## Décisions

- _Zéro dépendance nouvelle : urllib + le MCP déjà installé. Un fournisseur
  payant pour un « dernier recours » qui ne vote même pas n'était pas
  justifiable._
- _Un fournisseur muet se déclare : `/years/web-status`, affiché dans la vue
  Années. « Pas de candidats » et « pas de moteur » ne sont pas la même chose._
- _Beatport est **retiré**, pas remis en pause : une pause qui dure depuis
  EPIC-033 occupe une place dans l'ordre de priorité et fausse la lecture du
  pipeline pour zéro donnée produite._

## Notes / Risques

- Le repli HTML de DuckDuckGo peut être rate-limité ou changer de balisage :
  c'est un repli, et son échec est **rapporté** (`web_error`), pas silencieux.
- `collect_beatport.py` disparaît du dépôt (il reste dans l'historique git) —
  décision produit assumée : la friction du token a été refusée deux fois.
