# EPIC-048 — Un remix ne date pas de l'original

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : [spec](../specs/2026-09-22-remix-annee-originale-design.md) · EPIC-040 (corroboration) · EPIC-045 (revue des années écrites) · EPIC-033

## Objectif

Un fichier qui porte un crédit de remix (`(cosmic gate mix)`, `(marco v remix)`)
ne doit **jamais** recevoir l'année de l'original : le moteur doit le prouver,
sinon le mettre en revue.

## Contexte & découvertes

`age of love - the age of love (cosmic gate mix)(tasnoise).mp3` (aucune année
dans le tag) : le moteur conclut 1990, l'année de l'**original**, pour un remix
de 2000. Cause structurelle — `artist_title()` **supprime les segments
parenthésés** (`re.sub(r'\([^)]*\)', ' ', n)`) et `NOISE` efface `mix`, `remix`,
`edit`, `version`… : la clé de recherche ne peut plus distinguer la version de
remix du morceau. Deux providers concordent alors sur 1990 (le morceau) et la
règle des 2 sources écrit une année fausse.

## Tâches

- [x] `scripts/remix_credit.py` (module pur) : `remix_credit(name) → {kind,
      tokens, label}` ; segments parenthésés + forme collée `… X Remix/Mix/Edit`
      ; un segment 100 % mots de version (`extended`, `original`, `radio`,
      `club`…) ne nomme personne
- [x] Moteur v3 (`ENGINE_VERSION = 3`) : en mode remix, un provider ne compte
      que si le titre matché contient **tous** les tokens du remixeur → plus de
      `found` automatique ; `year: None`, `remix: True`, `remixer: 'cosmic gate'`
- [x] `proposed = None` pour un remix (jamais de pré-remplissage d'une année
      que le moteur n'a pas prouvée)
- [x] Audit (`audit_applied_years.py`) : item remix concordant sur l'original →
      `a_revoir` (+ phrase), visible dans la section ⟲ d'EPIC-045
- [x] Tests : table de cas `remix_credit`, remix non prouvé ≠ `found`,
      remix prouvé = `found` avec l'année du remix, non-régression original 1990

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `scripts/remix_credit.py` | extraction du crédit (pur, sans réseau) |
| `scripts/collect_years.py` | garde par tokens de remixeur dans `lookup` |
| `scripts/audit_applied_years.py` | classe `remix` |
| `test_remix_credit.py` | tests du module |
| `test_collect_years.py` | non-régression + cas remix |

## Validation

- [x] Typecheck (`npx tsc --noEmit`)
- [x] Tests frontend (`npx vitest run`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat: EPIC-048 — un remix ne date pas de l'original` |

## Décisions

- _Le moteur ne devine pas un remix : il **refuse d'écrire**. La revue (EPIC-045)
  et les candidats web (EPIC-049) restent les surfaces de décision._
- _Asymétrie assumée : « un remix se prouve, l'original se suppose » — exiger la
  preuve sur tous les titres bloquerait un moteur qui doit avancer._
- _Un « Extended Mix » n'est pas un remix d'artiste : la liste des mots de
  version est explicite, sinon la garde se déclencherait sur la moitié du
  corpus._

## Notes / Risques

- Un remixeur homonyme d'un mot courant (« Club Mix » par un artiste nommé
  *Club*) passerait pour un crédit : le `title` de la décision reste explicite
  dans la revue.
- La garde s'applique **au moment de la collecte** : les ~1 448 clés déjà
  collectées gardent leur verdict v2 — c'est l'audit qui les reclasse.
