# EPIC-044 — Alignement des genres : le tag suit enfin le rangement déclaré

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : spec `2026-09-22-alignement-genres-design.md` · EPIC-043 (le style s'écrit à la copie) · EPIC-035 (grammaire `<style>_<tranche>`, palette `g`) · EPIC-041 (écriture immédiate) · EPIC-033/040 (même forme : aperçu → confirmation → journal → `--undo`)

## Objectif

Rendre le tag genre des fichiers **déjà rangés** conforme à ce que leur dossier
déclare — avec un aperçu avant toute écriture, deux modes explicites (corriger +
remplir, ou remplir seulement les vides), le journal partagé des scripts et
`--undo` en sortie de secours.

## Contexte & découvertes

EPIC-043 a fermé la fuite pour le **futur** : chaque copie écrit le style du
dossier cible sur l'épars et sur la copie. Le **stock** (1 604 rangés), lui, est
resté tel quel.
Mesuré sur la collection (`data/cache.json`, 2026-09-22), sur **1 604 fichiers
rangés** :

| Verdict | Nb |
|---|---|
| genre cohérent avec le dossier (casse ignorée) | **323** |
| genre qui **contredit** le dossier | **1 023** |
| **sans** genre | **258** |

Soit **1 281 fichiers sur 1 604** dont le tag ne dit pas ce que le rangement dit
(le seuil est **exact**, casse ignorée : `New Beat` dans un dossier `new_beat`
compte comme à corriger — la cellule *Style* compare les chaînes exactement).
Les genres fautifs sont des genres **externes grossiers** (`Techno` 138,
`Electronic` 105, `Dance` 79, `Trance` 62, `Electro` 50, `Techno (Peak Time /
Driving)` 46, `House` 28, `Acid Techno` 20) écrits par d'autres outils — pas des
erreurs de saisie.

Conséquences déjà constatées : la cellule *Style* (chip « écrit ✓ », qui compare
`entry.genre` au style choisi) ne peut pas confirmer un rangement déjà fait ; le
filtre et le signal « genre ID3 aliasé » de `styleSuggest` (poids 0,15)
travaillent sur une valeur qui contredit le rangement dans 2 fichiers rangés sur
3 ; toute future lecture du genre (playlists par règles, exports Traktor) hérite
du même mensonge.

## Tâches

- [x] Spec de conception (périmètre rangés-only et pourquoi, disque autoritaire, modes, non-bloquant, journal/undo)
- [x] Backend : `_source_style_of` (style strict du 1ᵉʳ segment d'un rangé), `_genre_audit` (verdicts depuis le cache), `_write_style_at_copy` paramétré par `source`
- [x] Backend : `GET /styles/audit` (aperçu borné : compteurs, `par_style`, `exemples`) et `POST /styles/align` (`mode: tous|vides`, `dry_run`)
- [x] Cache répercuté après écriture (le prochain affichage ne contredit pas le disque)
- [x] Tests pytest du contrat (verdicts, deux modes, idempotence, cache périmé, extension/absent non bloquants, journal `source: "align"` **restauré par `apply_styles.py --undo`**)
- [x] Frontend : `choiceDialog` (deux actions + annuler, réutilisable), commande `a` (page Sync), module `render/styleAudit.ts` (aperçu → confirmation → application, patch d'état depuis `written`)
- [x] Tests vitest du contrat frontend (dont la dégradation bruyante si le template n'a pas `#dialog-alt`)
- [x] README (« Rangement par style » + raccourcis + légende générée) et registre

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `_source_style_of`, `_genre_audit`, `_write_style_at_copy(source=…)`, `GET /styles/audit`, `POST /styles/align` |
| `test_app.py` | contrat backend |
| `static/src/ui.ts` | `choiceDialog` (action principale + seconde action + annuler) |
| `templates/index.html` | bouton `#dialog-alt` du dialogue (masqué quand inutilisé) |
| `static/src/render/styleAudit.ts` (+test) | **Nouveau** — aperçu (GET), choix de mode, POST, patch de l'état et des cellules *Style* |
| `static/src/commands/style.ts` | binding `a` — « Aligner le genre sur le dossier » (page Sync) |
| `static/src/ui.test.ts` | contrat de `choiceDialog` (dont la dégradation bruyante) |
| `static/src/commands/style.test.ts` | contrat du binding `a` |
| `static/src/integration.test.ts` | fixture du dialogue mise à jour (`#dialog-alt`) |
| `README.md` | section « Rangement par style », table des raccourcis |
| `docs/superpowers/specs/2026-09-22-alignement-genres-design.md` | spec |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npm test`) — **1 171 vitest / 51 fichiers** (dont 13 sur `styleAudit`, 3 sur `choiceDialog`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **351 pytest / 12 fichiers** (dont 9 sur l'alignement, dont l'undo réel)
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`)
- [x] **Dry-run sur la collection réelle** : `GET /styles/audit` → 323 alignés / **1 023 à corriger** / **258 sans genre** / 0 hors grammaire ; `POST /styles/align {dry_run}` → **1 281** écritures prévues (mode `tous`), **258** (mode `vides`), 0 absent / 0 format non géré, **en 0,46 s**, aucun tag touché

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `22be2bc` | `feat: EPIC-044 — le tag genre des rangés rejoint l'arborescence` |

## Décisions

1. **Périmètre = les rangés.** Les épars sont exclus parce que, sous une racine
   épars, les mêmes noms ne déclarent pas des styles mais des dates, des humeurs
   ou des états (`2007_04`, `_techno`, `to_listen`, `calme`, `hard`,
   `-to-process/2011_10_03`) — `acid` et `calme` matchent même la grammaire, donc
   les appliquer écrirait des tags faux. Et leur genre est une **entrée** du
   moteur de suggestion (0,15) : l'écraser appauvrirait la suggestion.
2. **Grammaire stricte = celle de la copie** (`_style_of_folder`, miroir testé de
   `parseFolderName`) ; **pas** `_known_styles()`, qui accepte des dossiers hors
   grammaire (`_techno`, `2008_08`).
3. **Le disque est autoritaire à l'écriture** : l'aperçu vient du cache (rapide,
   et le dialogue dit « d'après le dernier scan »), mais chaque écriture relit le
   genre sur le disque. En mode « vides », un cache périmé ne fait donc **jamais**
   écraser un genre existant — le fichier est compté `non_vide`.
4. **Deux modes dans un seul dialogue** (`Corriger + remplir` / `Remplir
   seulement les vides`) plutôt que deux touches : le choix est **visible** au
   moment où il compte, et l'action conservatrice est à un Tab.
5. **`written` renvoyé en entier** (path + style + old) : le client patche l'état
   avec la liste du serveur au lieu de re-dériver la règle — aucune divergence
   possible entre l'affichage et le disque (~1 280 entrées, quelques centaines de
   Ko pour une application locale qui charge déjà 6 696 fichiers au `/load`).
6. **Journal partagé, `source: "align"`**, format compatible avec les écritures
   `palette` et `copy-f5` : `apply_styles.py --undo` restaure les trois sans
   modification du script (test dédié, pas une supposition).
7. **Jamais bloquant** : un fichier absent, une extension non gérée ou un format
   illisible incrémente un compteur et **n'interrompt pas** le lot.
8. **Aucun style — ni chemin — fourni par le client** : le serveur recalcule
   tout depuis le cache de son propre scan (aucun confinement à refaire, les
   chemins ne viennent jamais d'une requête).

## Notes / Risques

- **Un dossier dont le nom ment** écrit un tag faux : c'est cohérent (le tag suit
  le rangement déclaré) et `--undo` existe — risque tracé, pas caché.
- **Destruction de genres externes** : c'est l'objectif assumé. Le mode « vides
  seulement » est la variante conservatrice ; `--undo` restaure `old` valeur par
  valeur (1 280 lignes de journal).
- **Cache périmé** : l'aperçu peut compter des fichiers déplacés/renommés depuis
  le dernier scan (comptés `absent` à l'écriture, jamais écrits).
- **Non couvert** : les épars (décision 1), les dossiers hors grammaire, et le
  cas d'un **renommage de dossier** postérieur (le tag garde l'ancien style
  jusqu'à la prochaine copie, palette ou alignement).
