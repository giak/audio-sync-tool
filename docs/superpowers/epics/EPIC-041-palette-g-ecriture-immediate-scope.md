# EPIC-041 — Palette « g » : tags écrits tout de suite, sur le morceau surligné (Éparpillé **ou** Source Data)

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-21 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : spec `2026-09-22-palette-g-scope-design.md` · EPIC-035 (socle palette/taxonomie) · harnais `scripts/proof_style_palette.py`

## Objectif

Choisir un style (ou une année) pour un morceau doit **écrire son tag immédiatement**, sur
le morceau réellement surligné — que la liste soit celle des épars ou celle de Source Data —
et la palette doit montrer **tout** ce qu'on peut choisir, d'un seul coup d'œil.

## Contexte & découvertes

Retour d'usage : « la touche `g` sur un morceau ne fonctionne pas correctement. Quand je
sélectionne le style, il doit mettre à jour de suite le style ID3 du morceau, et pareillement
pour l'année. Pour l'affichage dans la modale, il faut tout voir, la liste des styles et des
années. »

Trois défauts distincts, tous **mesurés** avant correction (monde synthétique isolé, Chrome
headless piloté par CDP, touches et clics réels — `scripts/proof_style_palette.py`) :

| # | Défaut | Mesure |
|---|---|---|
| 1 | **Rien n'était écrit dans le tag.** La palette ne posait qu'un choix de session ; le TCON n'atteignait le fichier qu'après un aperçu `e` (copie) puis `apply_styles.py --review`, **hors navigateur**. L'année, elle, n'était **jamais** écrite — la tranche ne servait qu'à choisir le dossier cible. | Avant : `TCON=None TDRC=None` après un clic sur un style, et `0` requête réseau. |
| 2 | **`g` muet selon le panneau actif.** Le binding portait `activePanel: 'epars'` : un seul clic dans la colonne droite (ce qu'on fait en permanence pour vérifier un doublon) rendait `g` inerte — **aucune palette, aucun message**, même avec une ligne épars surlignée. Et un morceau surligné **dans** Source Data ne pouvait pas être tagué du tout. | Avant : `g` sur un fichier de la colonne droite → palette absente, statut inchangé ; `g` sur une ligne épars, panneau droit actif → idem (4 vérifications en échec sur le harnais, cf. Validation). |
| 3 | **La modale était partielle.** La liste des styles était filtrée par la taxonomie courante **et** la grille d'années n'existait pas : seuls 9 paliers (1985…2025) étaient atteignables, sans les 57 années réelles. | Avant : 9 paliers. Après : **57 années (1970→2026)** + **tous** les styles, `1970` et `2026` compris. |

Point de sécurité : l'écriture de tag est **immédiate et définitive** pour le fichier — elle
passe donc par le **même journal que les scripts** (`data/style_apply_journal.jsonl`,
`data/year_apply_journal.jsonl`, `source: "palette"`), ce qui la rend annulable par
`apply_years.py --undo` / `apply_styles.py --undo`, et elle est bornée aux racines
configurées (épars + source) et aux extensions audio gérées.

## Tâches

- [x] **Écriture immédiate côté serveur** : `POST /styles/apply` (TCON/GENRE/©gen) et `POST /years/apply` (TDRC/TYER/DATE/©day) — validation → confinement aux racines → journal `old` → écriture → **relecture** (`read_back == value`), réponse par cible.
- [x] **Palette** : choisir un style écrit le tag **puis** pose le choix de session (rangement) ; choisir une année écrit le tag **puis** résout la tranche. L'UI locale (cellule Année, index, chip « ✓ écrit ») est mise à jour sans re-render.
- [x] **`g` scope-aware** (`commands/style.ts`) : plus de garde `activePanel` ; la cible est le **morceau surligné** de la liste qui porte le focus (`#epars-container` ou `#source-container`), un fichier primant sur un dossier, panneau actif en arbitre.
- [x] **Cibles Source Data** (morceau déjà rangé) : `findSourceEntry` (index source) + `entryOf` épars-ou-source ; l'écriture ne crée **aucun** choix de rangement (`commit` réservé aux cibles épars) et le titre de la palette annonce `Source Data · …`.
- [x] **Message honnête** quand seul un dossier est surligné (« `g` s'applique à un morceau : déplie le dossier (→) puis surligne une ligne ») — plus jamais de silence.
- [x] **Modale complète** : les 57 années (1970→2026) sont toujours rendues et **jamais rognées** ; la grille des styles est plafonnée à 45 vh et défile au-delà (une taxonomie de 42 styles n'écrase plus la grille d'années) ; la palette est bornée à la fenêtre (`max-height: calc(100vh - 24px)`).
- [x] **Harnais de preuve** `scripts/proof_style_palette.py` étendu : 9 vérifications (monde normal) / 10 (taxonomie chargée), sur les **tags relus sur disque** par mutagen, pas sur la réponse HTTP, + contrôle d'état initial + `PROOF_EXTRA_STYLES=40`.
- [x] Tests unitaires : `commands/style.test.ts` (scope, dossier, sélection vs source) · `render/stylePalette.test.ts` (cible Source Data, aucun choix de session, index + cellule) · matrice clavier (`sync source: g intercepté`).

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `POST /styles/apply` + `POST /years/apply` (écriture tag immédiate, journal partagé avec les scripts, confinement aux racines) |
| `static/src/commands/style.ts` | Binding `g` scope-aware (fin de la garde `activePanel`), résolution des cibles, messages honnêtes |
| `static/src/render/stylePalette.ts` | Cibles épars **ou** source, mise à jour locale (index + cellule Année), choix de session épars-only, titre scope-aware |
| `static/styles/pages/sync.css` | Palette en colonne flex bornée à la fenêtre, grille des styles défilante, années toujours entières |
| `static/src/commands/style.test.ts` · `static/src/render/stylePalette.test.ts` · `static/src/commands/keyboardMatrix.test.ts` | Contrats et cellules de matrice |
| `scripts/proof_style_palette.py` | Harnais de preuve headless (9/10 vérifications) |
| `test_app.py` | Couverture des deux routes d'écriture (validation, confinement, journal) |

## Validation

Harnais headless (`python3 scripts/proof_style_palette.py /tmp/epic041_final`) — **9/9** ;
avec `PROOF_EXTRA_STYLES=40` — **10/10** ; avec `PROOF_EXTRA_STYLES=80` (82 styles,
grille **défilante** : 500 px de contenu / 296 px visibles) — **10/10** :

| Vérification | Mesure |
|---|---|
| Contrôle · état initial | `TCON=None TDRC=None` — rien à lire avant le clic |
| 1 · `g` ouvre la palette | ligne épars focusée, palette ouverte, ancrée sous la ligne |
| 2 · la modale montre tout | **42 styles** (dont 40 ajoutés) · **57 années** (`1970`→`2026`) · **0 année coupée** |
| 3 · style → TCON | `None → 'techno'` **sur disque**, barre d'état « ✓ écrit dans le tag » |
| 3b · styles atteignables | dernier style atteignable dans la boîte après défilement (82 styles → grille défilante) |
| 4 · année → TDRC | `None → '1991'`, TCON conservé, cellule Année mise à jour, palette refermée |
| 5 · `g` sur un morceau rangé | palette ouverte, titre « Source Data · … » |
| 6 · tags du morceau rangé | `TCON 'techno'` + `TDRC '1991'` écrits, récap épars **identique** (aucun choix de session) |
| 7 · dossier seul | message explicite, **aucune** palette |
| 8 · régression `g` muet | dossier focusé à droite (`activePanel=source`) + ligne épars → palette **ouverte sur la ligne épars** |

**Preuve par mutation** (les deux gardes neuves) :

- garde `activePanel: 'epars'` réintroduite → harnais **4/9 en échec** (§5, §6, §7, §8 : `g`
  silencieux, aucune palette ouverte) + matrice clavier en échec ; le test de forme du
  binding échoue aussi. Vérifié **sur le script final** (rebuild inclus).
- `findSourceEntry` neutralisé → les 2 tests « morceau déjà rangé » de `stylePalette.test.ts`
  échouent (`expected undefined to be '2024'`, `expected '2024' to be '1991'`).

- [x] Typecheck (`npx tsc --noEmit`) — 0 erreur
- [x] Tests frontend (`npm test`) — **1 142 vitest**, 50 fichiers
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **335**
- [x] Lint (`npm run lint`) — 0 erreur
- [x] Build (`npm run build`) — ✅ validation passée
- [x] `npm run audit:css` — aucune classe morte

⚠ Le CSS **et** le JS sont bundlés : `npm run build` est **obligatoire** avant toute mesure
navigateur. Constaté une nouvelle fois pendant cette EPIC : un harnais lancé sans rebuild
mesure la version précédente (une mutation de `style.ts` n'a été détectée qu'après rebuild).

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _(working tree 2026-09-22)_ | Palette `g` : écriture immédiate des tags (TCON + année), cibles Source Data, `g` scope-aware, modale complète (57 années + tous les styles), harnais headless 9/10 |

## Décisions

- **Le tag s'écrit depuis le navigateur, maintenant.** Le détour « choix de session → aperçu →
  script hors navigateur » faisait perdre le geste utilisateur ; la route serveur écrit le
  frame natif du format et relit la valeur. Le choix de session **reste** (il pilote l'aperçu
  `e` et les copies), mais il n'est plus le chemin d'écriture.
- **Journal partagé avec les scripts** : `data/style_apply_journal.jsonl` /
  `data/year_apply_journal.jsonl`, entrée `{path, old, new, source: "palette", frame, ok}` →
  `--undo` annule indifféremment ce qui a été écrit par le script ou par la palette.
- **Priorité des cibles, dans cet ordre** : (1) un **fichier** surligné prime sur un **dossier** ;
  (2) à égalité, le **panneau actif** gagne ; (3) la sélection multiple (Espace) est épars-only
  et ne s'applique que si la cible n'est pas un morceau de Source Data. Motif : `g` doit agir
  sur un **morceau** pointé par l'utilisateur, jamais rester muet ; le titre de la palette
  nomme le fichier (et son scope) pour que toute surprise soit visible avant le choix.
- **Un morceau déjà rangé n'entre pas dans la file de rangement** : `commit()` est réservé aux
  cibles épars — taguer une piste de Source Data est une correction de métadonnée, pas une
  planification de copie.
- **Tout visible, sans étape cachée** : les 9 paliers de tranche disparaissent au profit des
  57 années réelles (la tranche se déduit de l'année) ; la grille des styles défile plutôt que
  de pousser les années hors de l'écran (l'année est la décision principale).
- **Aucun appelant existant modifié** : `styleCell` (clic sur la cellule) passe toujours par
  `openStylePalette([fullpath], row)` — le scope est résolu **au binding**, pas dans la palette.

## Notes / Risques

- **Le harnais refuse un clic qui n'atteindrait pas sa cible** : il remet la cible dans la
  fenêtre (`scrollIntoView` = précondition, le clic reste un événement réel) et échoue en
  nommant l'élément qui recouvre le point visé — deux pièges réellement rencontrés pendant
  cette EPIC (colonne droite déjà défilée de 657 px ; dossier déplié dont le rect englobe ses
  enfants, le centre tombant alors dans une ligne fichier).

- **Non vérifié sur la collection réelle** : les preuves sont headless, sur un monde
  synthétique isolé (`data/` réel jamais touché). Le premier usage réel doit confirmer
  1) l'écriture sur `.flac` et `.mp3` de production (frames `DATE`/`GENRE` vs `TDRC`/`TCON`)
  et 2) le ressenti du scope quand les deux colonnes ont chacune une ligne surlignée.
- **Écriture immédiate = geste fort** : un style choisi par erreur est écrit tout de suite. La
  sortie est le journal (`--undo`) — pas d'annulation dans la palette, par choix (Échap annule
  **avant** écriture, c'était le contrat de la palette).
- Le **cue editor** (wavesurfer) reste un moteur audio séparé ; sans lien avec cette EPIC.
- La limite « la colonne Source Data filtre par nom de dossier » est une décision d'EPIC-037
  (P1 bis écarté) — le tag, lui, se corrige maintenant depuis cette colonne.
