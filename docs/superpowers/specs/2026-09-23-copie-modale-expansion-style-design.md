# Copie : modale claire, dossier qui reste plié, style des deux côtés (EPIC-051)

> **Statut** : conception validée, à implémenter
> **Créée** : 2026-09-23
> **Docs liées** : [EPIC-051](../epics/EPIC-051-copie-modale-expansion-style.md) ·
> EPIC-043 (style à la copie) · EPIC-046 (cellules Style) · EPIC-050 (écriture visible) ·
> EPIC-034 (auto-expansion à retirer) · EPIC-035 (aperçu e, palette g)

## Le signalement, mot pour mot

> « quand je fais copie un fichier "éparpillé" vers "source data", dans la modal qui
> me demande de valider, il faut être plus clair sur ce qui va se passer, meilleur UI.
> fichier à copier > dossier de destination. et en dessous, des indications plus
> discrètes. quand je fais copie, le dossier "source data" se déplie, et je ne veux
> pas. seulement sur click ou "enter" sur le dossier. et quand je copie, le style ne
> se met toujours pas à jour du coté "éparpillé". j'insiste, quand j'utilise "g", la
> raccourcie, cela doit mettre à jour des 2 cotés de la colonne. et quand je copie,
> le style du dossier "source" met à jour l'ID3 le fichier dans les 2 colonnes. »

Trois blocs distincts, traités séparément.

## Ce qui a été établi par lecture du code (2026-09-23)

### A. La modale de validation est une boîte générique

`#modal-dialog` (`templates/index.html`) = un `<p id="dialog-msg">` (`pre-line`,
`components.css:307`) + boutons. `executeCopy` (`static/src/actions.ts`) y écrit
`Copier "X" vers "Y" ?` **puis** la phrase de consentement (EPIC-043,
`styleConsentLine`) au **même niveau typographique** : une seule voix, aucune
hiérarchie. La même modale sert au F5 simple, au F5 batch **et** à l'aperçu `e`
(`stylePreview.ts::openStylePreview` via `confirmDialog`).

### B. L'expansion du dossier destination n'est pas un accident

C'est `revealSourceDir(destDir)` (EPIC-034), appelé en **deux** endroits :
`copyFilesTo` (flux batch + aperçu `e`, actions.ts:341) et le handler du F5
simple (actions.ts:457). Elle passe par `toggleSourceDir` → persiste dans
`sourceExpanded`, donc **survit** aux re-renders — c'est exactement ce que
l'utilisateur ne veut pas. Le clic et Enter sur un dossier déplient déjà
par eux-mêmes (`commands/navigation.ts:330`) : retirer l'auto-expansion ne
supprime aucun moyen existant d'ouvrir un dossier.

### C. « Le style ne se met pas à jour côté éparpillé » — l'écriture est là, l'affichage ne suit pas

Le tag **est** écrit sur l'épars et la copie à chaque `/copy` (EPIC-043,
relecture mutagen, journal `copy-f5` ×2). Ce qui manque est l'**affichage** :

1. **La cellule Style d'un épars est aveugle sans choix de session.**
   `styleCell.resolve()` rend `null` sans `state.styleChoices.get(fullpath)` →
   aucune cellule rendue. Or l'usage réel copie **sans passer par `g`** : F5
   direct → pas de chip ; et l'aperçu `e` **supprime** les choix des fichiers
   copiés (`stylePreview.applyRangementPlan` : `next.delete(fp)`) → le chip
   disparaît au moment même où le tag vient d'être écrit. Le genre relu par
   `/copy` est pourtant patché dans l'index (`applyCopyStyle`) et présent dans
   `entry.genre` — jamais affiché sans choix.

2. **`g` n'écrit que sa cible, jamais la paire.** `writeStyleTagFor` poste les
   cibles telles quelles ; `setGenreLocally` ne rafraîchit que le côté écrit.
   Sur une paire épars ↔ jumeau rangé (copie récente ou doublon EPIC-028,
   `state.dupMatches`), l'autre colonne garde l'ancien genre : « g ne met pas à
   jour des 2 côtés de la colonne ». La palette reçoit déjà les fullpaths des
   deux côtés — elle n'a simplement jamais eu l'ordre d'étendre aux jumeaux.

**Zéro backend nouveau** : l'écriture à la copie existe (`/copy`), l'écriture
immédiate existe (`/styles/apply`, EPIC-041) ; la symétrie de `g` est un
**enrichissement de cibles côté client** (les cibles additionnelles restent dans
les racines connues, donc confinées et journalisées comme aujourd'hui).

## Décisions

### D1 — Modale « fichier → destination » (structure dédiée)

La modale de copie montre **l'action en évidence**, le reste en discret :

```
fichier.mp3  →  techno_hard_2005   ➕ (sera créé)          ← évidence
        le style « techno_hard » sera écrit dans le tag,   ← discret
        sur l'épars et sur la copie (année non touchée)
        ⤷ déjà rangé dans le dossier cible — non copié     ← si applicable
        3 fichiers sans année — ignorés (g puis chiffre)   ← si applicable
```

- Bloc **évidence** : nom de fichier → nom de dossier destination (badge `➕`
  si le dossier sera créé), taille raisonnable, `white-space: pre-line` pour le
  multi-lignes.
- Blocs **discrets** (plus petits, grisés) : consentement style (EPIC-043),
  exclusions de l'aperçu `e` (déjà rangé, sans année, style inconnu), compteur
  en multi (« 12 fichiers → 2 dossiers » avec une ligne évidence par dossier).
- Multi-dossiers (aperçu `e`) : une ligne évidence par dossier (`n fichiers →
  dossier`), la liste complète des noms reste dans le tooltip.
- **Réutilisée par les trois flux** : F5 simple, F5 batch (drag/clic droit),
  aperçu `e` — un seul code de rendu (`render/copyDialog.ts`), pas trois.

### D2 — L'expansion post-copie est retirée, pas déplacée

- `revealSourceDir(destDir)` **supprimé des deux appels** de `actions.ts`
  (copie simple + batch). Aucun remplacement : le clic et Enter sur un dossier
  déplient déjà (`navigation.ts:330`), le F7 ou le filtre permet de retrouver
  un dossier. Le dossier **reste plié** après une copie.
- La pastille et le chip « écrit ✓ » suffisent à localiser le résultat côté
  droit ; l'utilisateur décide de déplier.
- Le double-RAF `revalidateFocus` est conservé (restauration du focus, sans
  rapport avec l'expansion).

### D3 — `g` écrit la paire complète (décision utilisateur, 2026-09-23)

Quand `g` (ou un clic style dans la palette) tague un épars qui a un jumeau
rangé (`state.dupMatches`, EPIC-028 — le même moteur que la pastille ⤷), le
style est écrit **aussi sur le jumeau rangé**, même si son dossier de rangement
contredit — le dossier reste vérité pour l'**alignement de stock** (`a`,
EPIC-044), mais l'utilisateur vient de **décider** du style du morceau : la
paire suit. La divergence créée éventuellement reste visible (chip `≠`, ambre)
et reste corrigeable (`a`, ou `g` sur le rangé = réalignement sur son dossier).

- Extension de cibles **côté client uniquement** : dans la palette
  (`writeStyleTagFor`), les cibles épars sont étendues avec les
  `sourceFullPath` de leurs jumeaux avant le POST `/styles/apply` ; les cibles
  déjà rangées ne s'étendent pas (un rangé n'a pas de jumeau dans la même
  colonne).
- Les deux fichiers restent **dans les racines connues** : confinement et
  journal `source: "palette"` inchangés (EPIC-041), `--undo` restaure la paire
  entière.
- L'année écrite par la palette suit la **même extension de paire** : un
  morceau a une année, pas deux. (Le style du dossier d'un rangé ne déclare
  pas d'année — aucune contre-décision possible.)

### D4 — L'affichage suit la paire, des deux côtés

- **Cellule Style d'un épars sans choix de session** : si `entry.genre` est non
  nul, un chip **neutre** l'affiche (`genre`), avec en tooltip la destination
  éventuelle. États possibles d'une cellule épars :
  `choix de session` > `genre écrit (chip neutre)` > `suggestion` > vide.
- **Après une copie** (F5/`e`) : les deux cellules (épars + copie) montrent le
  genre relu par `/copy` — l'épars via le chip neutre (D4), la copie via sa
  cellule déjà branchée (EPIC-046).
- **Après un `g` sur une paire** : les deux cellules se rafraîchissent
  (épars + source). `refreshStyleCells` et `refreshSourceStyleCells` reçoivent
  les **deux** fullpaths.

### D5 — Rien d'autre ne change

- `/copy` backend : inchangé (l'écriture de style existe, EPIC-043).
- La pastille ⤷, la sélection multiple, le drag-drop : inchangés.
- La palette garde ses deux actions (style + année) et son clavier ; seule la
  liste des cibles s'enrichit.

## Phasage

- **P1 — Modale fichier → destination (D1)** : `render/copyDialog.ts` + les
  trois appelants (`executeCopy` ×2 branches, `openStylePreview`), CSS
  `components.css`. Tests vitest du rendu (structure, badge ➕, discret, multi).
- **P2 — Fin de l'auto-expansion (D2)** : suppression des 2 appels +
  inversion des tests qui l'attendaient (actions.test.ts ×2 blocs,
  sourceTree.test.ts § revealSourceDir conservé pour l'API mais plus appelé
  par la copie).
- **P3 — Paire complète et affichage symétrique (D3+D4)** : extension de
  cibles dans la palette (style **et** année), chip neutre sans choix
  (`styleCell.resolve`), refresh des deux côtés. Tests vitest : extension de
  cibles (jumeau rangé ajouté, rangé seul non étendu), chip neutre, refresh
  croisé après `g`.

Ordre indépendant : chaque phase est livrable seule. P2 est la plus petite ;
P3 est le cœur du signalement « j'insiste ».

## Ce qui n'est pas fait (assumé)

- Pas de changement de `/styles/apply` : l'extension de paire est une question
  de **cibles**, pas de contrat serveur.
- Le rangé dont le dossier contredit après un `g` sur l'épars n'est pas
  **réaligné automatiquement** sur son dossier : l'utilisateur a parlé en
  dernier (D3), la divergence reste visible et corrigeable.
- Pas de statut de dossier « contient des fichiers récemment copiés » : le
  re-pliage forcé n'existe plus, c'est tout.
- L'aperçu `e` ne pré-remplit pas le chip des fichiers copiés : le chip neutre
  (D4) le fait par lecture du genre, sans état de plus.
