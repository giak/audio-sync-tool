# Spec — Un remix ne bronze pas : il date de lui-même (EPIC-048)

Date : 2026-09-22 · Statut : validée · EPIC : EPIC-048

## 1. Le cas, nommé

> « nous avons par exemple `age of love - the age of love (cosmic gate mix)
> (tasnoise).mp3` qui est un remix, ne date pas de 1990 mais 200[0] »

Vérifié sur la collection réelle :

```
/media/giak/music/--[ montage audio/2005_10_31/
    age of love - the age of love (cosmic gate mix)(tasnoise).mp3
    → genre Trance · aucune année dans le tag (date: None)
```

Le fichier n'a pas d'année : le 1990 vient donc du **moteur** (moteur +
revue), pas d'une écriture passée — mais le même cas, déjà écrit, existe
(EPIC-045 en compte 408, dont des rééditions).

### Cause exacte

`scripts/collect_years.py::artist_title` **supprime les segments
parenthésés** : `re.sub(r'\([^)]*\)', ' ', n)` → la clé de recherche devient
`age of love / the age of love`, alors que la ligne complète est
`(cosmic gate mix)(tasnoise)`. `NOISE` écarte en plus `mix`, `remix`, `edit`,
`version`, `radio`, `club`, `extended`, `original`… La garde tokens étant
appliquée à cette clé épurée, le moteur ne peut structurellement **pas**
distinguer la version de remix de l'original : MusicBrainz et Deezer
répondent tous deux 1990 (le morceau), et la règle « 2 providers concordants »
écrit 1990 — pour un remix de 2000.

Un remix n'est pas un cas rare : la colonne `NOISE` a été écrite pour ça,
mais elle rend l'information **invisible** au lieu de la rendre **vérifiée**.

## 2. Décision

**Le crédit de remix est extrait, puis exigé.** Nouveau module pur
`scripts/remix_credit.py` :

```python
remix_credit(name_or_title) -> {'tokens': ['cosmic','gate'], 'kind': 'remix'}
# ou {'tokens': [], 'kind': 'original'}
```

- Sources du crédit : segments parenthésés/brackets, et forme collée
  `… X Remix/Mix/Edit/Rework/VIP/Bootleg` en fin de titre.
- Un segment **entièrement** composé de mots de version (`extended`,
  `original`, `radio`, `club`, `edit`, `version`, `instrumental`, `dub`,
  `vocal`, `remaster…`, `mix`, `remix`) ne nomme personne → `kind: 'original'`
  (un « Extended Mix » n'est pas un remix d'artiste).
- Tout autre segment nomme un remixeur → `kind: 'remix'`, `tokens` = ses mots
  significatifs (accents pliés, minuscules, tokens ≤ 2 lettres écartés).

**Règle d'écriture** (collect_years.lookup, engine v3) : quand
`kind == 'remix'`, un provider ne **compte** que si le titre du
dossier/enregistrement qu'il a matché contient **tous** les tokens du remixeur.
Sinon son vote est écarté — et s'il ne reste plus deux providers, le statut
n'est plus `found` : **rien n'est écrit**, l'item part en revue avec ses
candidats (le `proposed` reste vide pour un remix : c'est une décision humaine).
La règle est asymétrique et assumée : **un remix se prouve, l'original se
suppose.**

Le record porte `remix: true` et `remixer: 'cosmic gate'` — l'audit et la revue
(EPIC-045) peuvent alors dire *pourquoi* un cas est en attente.

**Audit des années déjà écrites** (`audit_applied_years.py`) : un item dont le
titre porte un crédit de remix et dont les sources concordent sur l'**original**
n'est plus `confirme` mais `a_revoir` avec la phrase
`remix : l'année de l'original ne vaut pas (cosmic gate)`.

## 3. Contrat de tests

- `remix_credit` : tableau de cas nommés — `(cosmic gate mix)` → remix,
  `(extended mix)` → original, `(marco v remix)` → remix,
  `(jam & spoon's watch out for stella mix)` → remix, `(original mix)` →
  original, `(1998 remaster)` → original, titre sans parenthèse → original.
- `lookup` : un remix dont les deux sources disent 1990 **sans** nommer le
  remixeur → statut ≠ `found`, `year = None`, `remix = True`.
- `lookup` : le même remix avec une source qui nomme le remixeur → `found` avec
  **son** année.
- Non-régression : un original (« the age of love » sans parenthèse) reste
  `found` 1990.
- Audit : un item remix concordant sur l'original sort en `a_revoir`, pas en
  `confirme`.

## 4. Non-objectifs

- Pas de résolution automatique du remix : le moteur ne devine pas, il
  **refuse d'écrire**. La revue (EPIC-045) et la recherche web (EPIC-049,
  candidates seulement) restent les deux surfaces de décision.
- Le crédit n'est pas déduit du nom de fichier seul quand les tags portent un
  titre complet : les deux sont essayés, le premier non vide gagne.
