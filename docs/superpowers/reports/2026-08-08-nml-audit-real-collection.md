# Audit — collection.nml réelle (38,5 Mo, 56 645 entrées) — 2026-08-08

**Objet** : double-check du design `2026-08-07-waveform-cue-editor-design.md` sur la vraie donnée
(`data/traktor4/collection.nml`, copie de la collection Traktor Pro 4 du portable).

**Méthode** : mesures empiriques sur le fichier réel (ElementTree, Python, `./venv/bin/python`),
comparaison point par point avec la spec.

---

## 1. Chiffres réels de la collection

| Mesure | Valeur |
|---|---|
| Taille fichier | 40 363 826 o (~38,5 Mo) |
| `ENTRIES` | 56 645 |
| Parse ElementTree | **0,47–0,54 s** (hors cache) |
| Build index dict | 0,09 s |
| Copie backup (38,5 Mo) | 0,02 s |
| Sérialisation (indent 2 espaces) | 0,98 s |
| Écriture disque | 0,02 s |
| **POST complet (backup+parse+edit+serialize+write)** | **≈ 1,5 s** |

Conclusion perf : aucun risque. Même sans cache, 1,5 s/POST est acceptable (sauvegarde boutonnée).
Un cache en mémoire (invalidation mtime) peut retirer le 0,5 s du parse sur les GET suivants — option, pas obligation.

## 2. Structure réelle (échantillon lignes)

```
<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<NML VERSION="20"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor Pro 4"></HEAD>
<COLLECTION ENTRIES="56645"><ENTRY MODIFIED_DATE="…" …>
<ALBUM TITLE="…"></ALBUM>
<MODIFICATION_INFO AUTHOR_TYPE="user"></MODIFICATION_INFO>
<INFO …></INFO>
<TEMPO BPM="133.000000" …></TEMPO>
<CUE_V2 …><GRID …</GRID></CUE_V2>
…
</ENTRY>
```

- **Aucune indentation** : chaque élément sur sa ligne (parfois fusionné avec l'ouverture du parent).
- Éléments vides écrits `<x></x>` **(pas de `/>`)**.
- Flottants : 6 décimales (`BPM="133.000000"`, `START="55.387418"`). Confirmé.
- `standalone="no"` dans le header. Confirmé.
- Attributs d'un élément : **ordre tel que stocké** (non trié alphabétiquement).

→ **Round-trip exact byte-identique impossible avec `ET.write` seul** (header `standalone` non gérable, `/>`
au lieu de `></x>`, indent). Reproduction à **−0,4 % du volumique** avec `ET.indent(tree, space='  ')`.
Traktor re-parsera tout XML valide : la fidélité brute n'est pas un ceint de sécurité, la **conservation des
attributs (ordre+ valeurs) et des valeurs à 6 décimales** oui.

## 3. CUE_V2 — faits

| Mesure | Valeur |
|---|---|
| Total CUE_V2 | 20 858 |
| TYPE=4 (beatgrid, LEN toujours `0.000000`) | 12 323 |
| TYPE=0 (cue simple) | 8 332 |
| TYPE=5 (loop ; par ex. LEN=3517,10… >0) | 97 |
| TYPE=3 — FLIP (REPEATS=-1, HOTCUE=0/1/2…) | 6 |
| HOTCUE `0..7` (slots A–H) | 8 108 |
| HOTCUE `-1` (dont 12 323 beatgrid) | 12 324 |
| Avec `COLOR` | 7 990 |
| `DISPL_ORDER != HOTCUE` (parmi hotcutes) | 326 / 8 435 |
| TYPE=0 avec HOTCUE=-1 | 1 |

### Écarts spec à corriger (avantages bloquants)

| # | Spec (2026-08-07) | Réalité mesurée | Action |
|---|---|---|---|
| 1 | « cue `TYPE=0, HOTCUE 1..8` » / « slots A–H » | HOTCUE **0..7** | Corriger les schémas/commentaires (slots affichés déjà A–H dans l'UI : OK là, voir HOTCUE de code) |
| 2 | « loop : LEN > 0.5 » | Le type canonique d'un loop est **TYPE=5** (LEN>0) ; `TYPE=0` LEN est `0.000000` | Détecter loop **sur TYPE=5** (`LEN>0`) ; pas sur LEN>0,5 seul (un cue fortuit ? aucun : les TYPE=0 ont LEN=0) |
| 3 | « masquer TYPE=4 (beatgrid) + HOTCUE=-1 » | Il existe des **TYPE=3 (FLIP) avec HOTCUE≥0** (6) | **Masquer aussi TYPE=3** : éditable = TYPE∈{0,5}. FLIP = loop conditionnel, jamais en tant que cue |
| 4 | `DISPL_ORDER` | = HOTCUE ne tient **que 96 %** (326/8435 divergent) | **Ne pas reconstructrer** DISPL_ORDER depuis HOTCUE ; ni les inverser — conserver l'attribut tel quel (pour les nouveaux cues : DISPL_ORDER = ordre d'affichage séparé) |
| 5 | Match par « nom de fichier seul » (spec §2.2 index, et §4 homonymes rarity) | 57 08 noms en double (15 722 entrées) ; **FILE+FILESIZE+PLAYTIME → encore 2 949 clés ambiguës** (7 038 entrées) | L'unité de search reste `FILE` (+desc affichage ARTIST/TITLE) mais **le sélecteur d'homonyme n'est PAS un edge case : il est fréquent (≈12 %)** — UI doit obligation de proposer une liste + mémorisation. Aussi afficher des infos disoclassantes (DIR, VOLUME). Ne jamais écrire un POST « aveugle » multi-match |
| 6 | Round-trip « identique au float près » | Impossible en `/>` (header `<` vs `/>`) | Objectif de test : reparse → mêmes valeurs d'attributs + mêmes ORDER ; accepté −0,4 % de format |

## 4. Impact sur la spec — décisions prises

1. **Appliquer** la ré-trafiction byte-identical à 0 : l'export NML n'a qu'un lecteur : Traktor, qui parse
   du XML valide. La stricte grammaire ne compte qu'à l'attention : valeurs 6 décimales + headers.
2. Loop : TYPE=5 & LEN>0 ; filtre d'affichage : `TYPE∈{0,5}`, dans ce cas HOTCUE `.0..7` tolérés ;
   masquer TYPE∈{3,4} et HOTCUE=-1.
3. HOTCUE 0..7 indices (les lettres A=0 … H=7, comme l'UI).
4. Sélecteur homonyme obligatoire ; avec **glob mémorable** (aucune prise en compte d'infinordinateur choisi
aut).
5. L'écriture : backup `.bak` unique écrasé à chaque POST (pas d'historique) ; écriture atomique `.tmp`+`os.replace`
   (déjà fossant).

---

## 5. Résumé des corrections à porter

| Fichier | Point |
|---|---|
| spec/2026-08-07 §2.2 (nml.py) | Index : sur nom+FILESIZE ; déclarer « hash détection » (FILEFIX), sélecteur multi. `save_nml` : header feu + indent 2 espaces (ou sortie à plat, au choix implémentation), toujours atomique |
| spec §3.1 | hotspot de code 0..7, filtre TYPE∈{0,5}, TYPE=3/4 exclus |
| spec §4 robustesse : CASE homonyme | reste mais mis-a-jour : la liste complète (multiple) est le comportement commun, pas l'exception |
| spec §5 tests | round-trip = mêmes attributs + mêmes valeurs ; pas de comparaison de formatage ; ajouter : cas FLIP présent → non affiché ; cas HOTCUE=0 (sloth A) |

Testé 2026-08-08, dans : docs/superpowers/reports/2026-08-08-nml-audit-real-collection.md