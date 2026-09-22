# Spec — Alignement des genres : le tag suit le rangement déclaré

> **Créée** : 2026-09-22 · **Statut** : validée (implémentée en EPIC-044)
> **Docs liées** : EPIC-044 · EPIC-035 (grammaire `<style>_<tranche>`, palette `g`) ·
> EPIC-041 (écriture immédiate) · EPIC-043 (le style s'écrit **à la copie**) ·
> EPIC-033/040 (même forme pour les années : aperçu → confirmation → journal → `--undo`)

## Le problème, mesuré

L'arborescence de Source Data **est** la seule déclaration humaine du style dans
cette app (`<style>_<tranche>` : `techno_acid_1990`). Le tag genre, lui, vient
d'ailleurs : il a été écrit par iTunes, Deezer, Beatport, un convertisseur…
Sur la collection réelle (`data/cache.json`, mesuré le 2026-09-22) :

| 1 604 fichiers rangés | Nb | Ce que ça veut dire |
|---|---|---|
| genre **cohérent** avec le dossier (casse ignorée) | **323** | le tag dit ce que le rangement dit |
| genre **qui contredit** le dossier | **1 023** | `techno_acid_2020/…` taggé `Techno`, `Electronic`, `Dance`… |
| **sans** genre | **258** | rien à lire |

Genres fautifs les plus fréquents : `Techno` (138), `Electronic` (105), `Dance`
(79), `Trance` (62), `Electro` (50), `Techno (Peak Time / Driving)` (46),
`House` (28), `Acid Techno` (20). Ce ne sont pas des erreurs de saisie : ce sont
des **genres externes grossiers** qui ne connaissent pas la taxonomie de l'app.

Conséquences réelles, déjà identifiées dans EPIC-043 :

- la cellule *Style* affiche un chip « écrit ✓ » en comparant `entry.genre` au
  style choisi → elle **ne peut pas** confirmer un rangement déjà fait ;
- le **filtre** de la colonne gauche et le **signal « genre ID3 aliasé »** de
  `styleSuggest` (poids 0,15) travaillent sur une valeur qui contredit le
  rangement dans **2 fichiers rangés sur 3** ;
- toute future fonction qui lira le genre (playlists par règles, exports
  Traktor/Rekordbox) héritera du même mensonge.

EPIC-043 a fermé la fuite pour le **futur** (chaque copie écrit le style du
dossier cible). Le **stock**, lui, est resté tel quel — **1 281 fichiers**.

## Décisions

1. **La référence est le nom du dossier**

   L'égalité exigée est **exacte** (casse ignorée) : `New Beat` dans un dossier
   `new_beat` compte comme **à corriger** (c'est le seul cas de ce genre sur la
   collection). La raison est mécanique, pas esthétique : la cellule *Style* et
   la palette comparent `entry.genre === choix.style` — un tag `New Beat` ne peut
   pas confirmer un rangement `new_beat`. La forme canonique est donc celle de la
   taxonomie, et la réécriture est une normalisation., premier segment du chemin relatif à la
   racine Source Data, avec la **grammaire stricte** déjà en place
   (`app.py::_style_of_folder`, miroir testé de `styles.ts::parseFolderName`) :
   `techno_acid_1990` → `techno_acid`, `italo_disco` → `italo_disco`. Un dossier
   hors grammaire (`2008_08`, `_trash`, `Techno`, `techno acid`) **ne déclare
   rien** → aucun tag écrit, le fichier est compté `hors_grammaire`.
2. **Périmètre = les fichiers rangés** (racines Source Data). Les épars sont
   **exclus**, et c'est une décision, pas un oubli : sous une racine épars, les
   mêmes noms ne sont pas des styles mais des **dates, des humeurs ou des états**
   (`2007_04`, `_techno`, `to_listen`, `calme`, `hard`, `nicotine-downloads`,
   `-to-process/2011_10_03`). Deux d'entre eux (`acid`, `calme`) matchent même la
   grammaire : les appliquer écrirait des tags faux. Et leur genre est une
   **entrée** du moteur de suggestion (signal 0,15) — l'écraser appauvrirait la
   suggestion au lieu de l'enrichir.
3. **Aucune validation contre la taxonomie connue**, comme à la copie
   (EPIC-043, décision 3) : le dossier existe physiquement, c'est une déclaration
   plus forte que la liste dérivée du scan. `_known_styles()` n'est **pas**
   utilisée ici (elle accepte des dossiers hors grammaire : `_techno`,
   `2008_08`).
4. **Le disque est autoritaire à l'écriture.** L'aperçu est calculé sur le cache
   du dernier scan (rapide, honnête : le dialogue dit « d'après le dernier
   scan »), mais l'écriture **relit le genre sur le disque** fichier par fichier.
   Conséquence assumée : en mode « vides seulement », un fichier dont le cache dit
   « pas de genre » mais dont le disque porte `Techno` est **sauté** et compté
   `non_vide` — jamais écrasé sur la foi d'un cache périmé.
5. **Deux modes explicites**, choisis dans le dialogue de confirmation :
   - **« Corriger + remplir »** (`tous`) : tout fichier rangé dont le genre du
     disque diffère du style du dossier ;
   - **« Remplir seulement les vides »** (`vides`) : uniquement les fichiers
     **sans** genre — l'action purement additive, qui ne remplace aucune valeur
     existante.
6. **Année jamais touchée** : seuls `TCON`/`GENRE`/`©gen` sont écrits. La tranche
   du dossier (`_1990`) reste une information de rangement.
7. **Idempotence** : genre du disque == style cible → ni écriture, ni ligne de
   journal, compté `deja` . Le journal d'annulation doit rester lisible.
8. **Jamais bloquant** : fichier absent du disque, extension non gérée
   (`.wma`, `.ogg`), permission, format corrompu → compté et **rapporté**, jamais
   une exception qui interrompt les 1 280 fichiers. Un lot de 1 000+ écritures ne
   s'arrête pas sur un fichier.
9. **Journal partagé** (`data/style_apply_journal.jsonl`, `source: "align"`,
   `old`/`new`/`role: "range"`) → `apply_styles.py --undo` restaure le stock
   **sans modification du script** (il lit `path` / `ok` / `old`, comme pour les
   écritures `copy-f5` d'EPIC-043). C'est la seule sortie de secours : un
   alignement de 1 280 fichiers est une mutation en masse, l'undo doit être
   prouvé (test dédié).
10. **Le cache suit** : le genre écrit est répercuté dans `data/cache.json`
    (mêmes entrées que celles utilisées par l'aperçu) pour que le prochain
    affichage ne contredise pas ce qui vient d'être écrit — sinon la cellule
    *Style* et le filtre travailleraient une fois de plus sur l'ancien monde.
11. **Consentement explicite** : rien ne part sans confirmation, le dialogue
    annonce les deux nombres **et** le libellé du bouton décrit le mode. Pas de
    case à cocher, pas de réglage caché.

## Contrat d'API

### `GET /styles/audit` — l'aperçu (lecture seule, aucun tag touché)

Valeurs réelles de la collection au 2026-09-22 (racine
`~/Music/select/style/`, 25 dossiers de style) :

```json
{
  "ok": true,
  "total": 1604,            // fichiers rangés dans le cache
  "avec_style": 1604,       // rangés sous un dossier qui déclare un style
  "alignes": 323,           // genre du cache == style du dossier (casse ignorée)
  "a_corriger": 1023,       // genre du cache ≠ style du dossier
  "sans_genre": 258,
  "hors_grammaire": 0,      // ici AUCUN rangé hors grammaire — le cas existe (racine, _trash, dossier daté), il est compté et testé
  "par_style": [{"style": "techno", "a_corriger": 293, "sans_genre": 92},
                {"style": "techno_acid", "a_corriger": 267},
                {"style": "trance", "a_corriger": 112},
                {"style": "hardcore", "a_corriger": 85}],
  "exemples": [{"path": "…/techno_acid_2020/x.mp3", "genre": "Techno", "style": "techno_acid"}]
}
```

`par_style` et `exemples` sont **bornés** (tri par volume décroissant, 12 styles
et 20 exemples) : le dialogue montre le dessus de la pile, pas 1 280 lignes.

### `POST /styles/align` — l'écriture

Body : `{"mode": "tous" | "vides"}` (`dry_run: true` accepté — même plan, aucune
écriture).

```json
{
  "ok": true, "mode": "tous", "dry_run": false,
  "plan": 1280,
  "written": [{"path": "…", "style": "techno_acid", "old": "Techno", "frame": "TCON"}],
  "skipped": {"deja": 12, "non_vide": 0, "absent": 3, "extension": 7},
  "failed": [{"path": "…", "error": "relu 'Techno'"}],
  "by_style": {"techno_acid": 271},
  "journal": "style_apply_journal.jsonl"
}
```

- `written` est **la liste exacte** de ce qui a changé (le client patche l'état
  avec, sans re-dériver la règle → aucune divergence possible entre ce qui est
  affiché et ce qui est sur le disque).
- `skipped.non_vide` (mode `vides`) = « le cache disait vide, le disque non » :
  la trace du cache périmé (décision 4).
- Aucun style n'est fourni par le client : **le serveur recalcule tout**.

## Tests

**Backend** (`test_app.py`) : verdicts du cache (aligné / à corriger / sans genre /
hors grammaire, racine et `2008_08` inclus) ; mode `vides` qui n'écrase **pas** un
genre non vide (y compris quand le cache ment) ; mode `tous` ; idempotence
(`deja`, zéro ligne de journal) ; extension non gérée et fichier absent comptés
sans interrompre le lot ; journal `source: "align"` relu et **restauré par
`apply_styles.py --undo`** ; cache mis à jour ; `dry_run` n'écrit rien.

**Frontend** (`static/src/render/styleAudit.test.ts` + `ui.test.ts`) : le dialogue
affiche les deux nombres et les deux libellés de mode ; le mode choisi part bien
dans le POST ; l'état et la cellule *Style* sont patchés depuis `written` ; les
échecs sont rapportés ; un template sans `#dialog-alt` **dégrade bruyamment**
(avertissement + statut) au lieu de perdre silencieusement l'option « vides ».

## Risques connus

- **Un dossier dont le nom ment** (`techno` rangé dans `hardcore_1990`) écrit un
  tag faux — cohérent avec la déclaration du dossier, et `--undo` existe.
- **Le cache peut être périmé** : l'aperçu compte alors des fichiers déplacés
  (comptés `absent` à l'écriture). Le dialogue le dit, et le disque tranche.
- **1 280 écritures = 1 280 sauvegardes manquantes** : le journal est la seule
  mémoire des anciennes valeurs. Écriture **avant** chaque tag, jamais par lots
  différés.
- **Genres externes détruits** : c'est le but assumé (le tag suit le rangement),
  mais un genre externe pouvait être une information (un sous-genre absent de la
  taxonomie). Le mode « vides seulement » est la variante conservatrice, et
  `--undo` restaure `old` valeur par valeur.
