# EPIC-054 — Les clés d'années sont construites depuis les TAGS, plus depuis le nom

> **Statut** : 🟢 Code livré · collecte lancée (2026-09-23)
> **Créée** : 2026-09-23 · **Dernière mise à jour** : 2026-09-23
> **Priorité** : Haute
> **Docs liées** : EPIC-040 (corroboration 2 sources) · EPIC-033 (pipeline années) · EPIC-048 (crédit de remix)

## Objectif

Le gisement d'années restant n'est pas dans les providers, il est dans la **clé de
recherche** : `load_keys()` la construit depuis le **nom de fichier** alors que la
fonction qui lit les tags existe (`tags_artist_title`, utilisée par `--probe` et
l'audit). Sur les 1 555 fichiers sans année (re-scan 2026-09-21), **1 204** portent
artiste **et** titre dans leurs tags et **1 102** ont une clé de tags **jamais
interrogée** — non corrigé à ce jour (README, section Années).

## Contexte & découvertes

**Cas réel** : `Gb - Maddix, Fēlēs - My Gasoline (Extended Mix).mp3` donne
`gb / my gasoline (extended mix)` par le nom contre `maddix / …` par les tags —
la requête cherchait le mauvais artiste. Le nom ne peut pas trancher l'ordre ;
les tags, si (constat fondateur d'EPIC-040 : `inner lightphantasia.mp3`).

**Mesure au lancement (2026-09-23, re-scan courant — 6 717 fichiers)** :
1 204 fichiers sans année avec tags complets → **1 151 clés-tags, dont
1 144 jamais vues** (7 recoupements) couvrant **1 197 fichiers**, **249 avec
crédit de remix**. (Le chiffre « 1 102 » du README datait du 2026-09-22.)

**Décisions de conception** :
- **Fonction séparée** `load_keys_from_tags()`, jamais d'injection dans
  `load_keys()` : celle-ci a 8 consommateurs (collecteurs Discogs/iTunes/reform/
  YouTube, rapport) dont le comportement ne doit pas changer.
- **Le pipeline de DÉCISION reste le même** : `lookup()` (2 providers
  indépendants concordants, gardes, remix EPIC-048), cache `year_cache.jsonl`
  partagé, reprise par clé. Les enregistrements portent `key_source: 'tags'`
  (le champ `source` d'un `found` porte déjà les providers — collision évitée).
- **`apply_years.py --keys-from-tags` obligatoire** côté application :
  `build_worklist` matchait les fichiers par clé-nom — les clés-tags n'auraient
  jamais servi. En mode tags, chaque fichier est matché par sa clé-tags
  D'ABORD, puis par sa clé-nom (fallback). Sans le flag, le mode tags ne peut
  pas faire écrire PLUS que le mode nom (aucune extension de périmètre
  accidentelle) — testé.

## Tâches

- [x] `collect_years.py` : `load_keys_from_tags()` (clé depuis les tags, agrégat
      identique : n, durs, crédit de remix) + `run(keys_from_tags=)` + CLI
      `--keys-from-tags` + docstring d'en-tête
- [x] `apply_years.py` : `build_worklist(keys_from_tags=)` — tags d'abord, nom
      en fallback — + CLI `--keys-from-tags`
- [x] Tests pytest : clé-tags correcte (cas Maddix/Fēlēs, UTF-16), fichiers sans
      tags complets exclus, `key_source: 'tags'` tracé, worklist avec/sans flag
- [x] Comptage réel sans réseau : 1 144 nouvelles clés / 1 197 fichiers
- [x] Collecte lancée en arrière-plan (`setsid nohup`, reprenable, log
      `data/collect_tags.log`) — ETA ~76 min (pacer MusicBrainz)
- [ ] **À la fin de la collecte** : `--report`, puis dry-run
      `apply_years.py --keys-from-tags` pour compter les écritures potentielles
- [ ] Application des certaines + revue des singles (même discipline que le
      reste : jamais d'écriture sans 2 sources concordantes)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `scripts/collect_years.py` | `load_keys_from_tags()`, mode `--keys-from-tags` |
| `scripts/apply_years.py` | `build_worklist(keys_from_tags=)`, flag CLI |
| `test_collect_years.py` | 3 tests (clé correcte, sans tags, traçabilité) |
| `test_apply_years.py` | 1 test (worklist avec/sans flag) |
| `README.md` | section Années : chantier noté comme lancé |

## Validation

- [x] Pytest : 243 verts sur les 4 fichiers concernés (4 nouveaux tests)
- [x] Comptage réel exécuté (lecture seule)
- [x] Collecte démarrée et vérifiée vivante (43 clés à ~4 min)
- [ ] Gate complet à la clôture (avec la revue des résultats)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| (à compléter au commit) | feat: EPIC-054 — clés d'années depuis les tags |

## Décisions

- **Tags d'abord, nom en fallback** (application) : un fichier sans tags
  complets reste servi par sa clé-nom — aucune perte par rapport au pipeline
  existant, et le même fichier peut exister des deux côtés (idempotent par clé).
- **Pas de nouvelle rate-limit ni provider** : on réutilise exactement le
  moteur EPIC-040/048 — seul l'univers de clés change.
- **`key_source: 'tags'`** pour tracer l'origine dans `year_cache.jsonl`
  (auditabilité : on pourra toujours dire quelle écriture vient de quel mode).

## Notes / Risques

- La vitesse (~5–8 s/clé : pacer MB 1,05 s + Deezer + album + Discogs + web)
  donne ~76 min pour 1 144 clés — reprenable sans frais (clés déjà présentes
  sautées).
- Les 249 clés de remix subiront la garde EPIC-048 (le remixeur doit être
  nommé) : une partie finira en « aucune année proposée » — c'est le
  comportement voulu (on ne propose pas l'année de l'original).
- Le comptage « 1 102 » du README est remplacé par la mesure du jour
  (1 144) : la collection a bougé entre les deux scans.
