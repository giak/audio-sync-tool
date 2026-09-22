# Spec — Recherche web locale, Brave dehors, Beatport sorti (EPIC-049)

Date : 2026-09-22 · Statut : validée · EPIC : EPIC-049

## 1. Ce qui est vrai aujourd'hui

| Constat | Mesure |
|---|---|
| `BRAVE_API_KEY` | absente de l'environnement ; `data/search_token` absent → la passe web n'a **jamais** produit un seul candidat |
| DuckDuckGo local | déclaré en MCP (`~/.agents/mcp.json` → `search`, `http://localhost:8010/mcp`) ; conteneurs `ghcr.io/mudler/mcps/duckduckgo` présents, **port 8010 fermé** au moment de la mesure |
| Beatport | `data/beatport_cache.jsonl` **n'existe pas** (`/report` le tolère) ; l'EPIC-033 l'a mis « en pause » ; le pipeline, la priorité du consolidé et les tests le portent encore |

Brave est un service payant : le moteur de recherche doit être **local, sans
clé** — et s'il est absent, il doit le **dire**, pas échouer en silence.

## 2. Décision

### 2.1 Un seul fournisseur web : DuckDuckGo

`scripts/web_search.py` (nouveau, autonome) expose
`search(query, limit=5) -> [(title, url, snippet)]` et choisit son chemin dans
cet ordre :

1. **MCP local** — URL dans `data/search_mcp.json` (`{"url": "http://localhost:8010/mcp"}`)
   ou `SEARCH_MCP_URL` ; appel JSON-RPC `tools/list` → `tools/call`. Aucune
   dépendance Python, aucune clé. C'est le chemin « DuckDuckGo installé
   localement » demandé.
2. **DuckDuckGo HTML** — `https://html.duckduckgo.com/html/?q=…`, urllib, zéro
   clé, zéro paquet. Repli quand le MCP n'est pas lancé.
3. Rien : `search()` retourne `[]` **et** la raison (`error`), qui remonte dans
   `web_error` du record — l'item part en revue sans candidats, au lieu de
   faire croire à une absence de résultats.

`collect_years.py` perd `BRAVE_URL`, `BRAVE_API_KEY` et `search_token()`.
`web_vote()` ne change pas de **rôle** : candidats et `evidence` seulement,
**jamais un vote** (règle EPIC-040 conservée : la règle des 2 sources ne se
contourne pas avec un moteur de recherche).

### 2.2 Beatport sorti du pipeline

Retrait franc, pas « pause » : `scripts/collect_beatport.py`,
`test_collect_beatport.py`, `BP_CACHE` de `report_years.py` / `apply_years.py` /
`app.py`, la priorité `beatport` du consolidé, les mentions du README et de
l'AGENT. Un provider qui n'a jamais tourné et que l'utilisateur a mis de côté
n'a pas à occuper une place dans l'ordre de priorité : il fausse la lecture du
pipeline. **Aucun tag n'est touché** par ce retrait (le cache n'existe pas).

> Coût assumé : `collect_beatport.py` disparaît du dépôt (il reste dans
> l'historique git). Sa réussite reposait sur un token recopié à la main depuis
> le portail Beatport — friction refusée deux fois.

### 2.3 Le témoin pour l'utilisateur

`GET /years/web-status` → `{provider, url, reachable, error}` (sonde 1 s, sans
clé). La vue Années affiche « recherche web : DuckDuckGo (MCP local) —
**indisponible** » au lieu de laisser croire que le dernier recours est en
service. Un fournisseur muet se déclare.

## 3. Contrat de tests

- `web_search.search` : MCP joignable (transport injecté) → résultats mappés ;
  MCP injoignable → repli HTML ; les deux KO → `[]` + `error` non vide.
- Aucun test ne touche le réseau réel : le transport est injecté
  (`fetch=callable`).
- `collect_years` : plus aucune référence à Brave (test « le module ne contient
  pas `BRAVE` »).
- `report_years` / `apply_years` : plus de `BP_CACHE` ; un
  `beatport_cache.jsonl` résiduel est **ignoré** (pas d'erreur).

## 4. Non-objectifs

- Pas de scraping illimité : `limit` par défaut 5, 1 requête par clé, comme
  avant.
- Pas de dépendance pip nouvelle (urllib seul).
- Pas de « vote » web : un extrait de page reste une piste, pas une preuve.
