# Spec — La palette de styles : complète, à l'échelle, sans `<kbd>` (EPIC-047)

Date : 2026-09-22 · Statut : validée · EPIC : EPIC-047

## 1. Trois signalements, trois mesures

### 1.1 « la liste des styles me semble incomplète » — confirmé

Comparaison disque ↔ taxonomie sur la collection réelle :

```
dossiers de 1ᵉʳ niveau sur le disque : 92
dossiers présents dans la taxonomie  : 86
ABSENTS : breakbeat_2000, breakbeat_2005, house_1990, house_1995,
          techno_hard_2005, techno_house_2010
```

`buildTaxonomy` (styles.ts) et `_known_styles` (app.py) dérivent les styles des
**fichiers indexés** : un dossier sans fichier audio est invisible. Ces six
dossiers sont vides (ou ne contiennent que des pochettes) — donc `breakbeat`
n'existe pas pour la palette, alors qu'il existe sur le disque. Conséquence :
impossible de taguer `breakbeat`, et `POST /styles/apply` répondrait même
`400 style inconnu` pour les tranches qui existent.

### 1.2 « la modal est trop petite » — confirmé

Palette mesurée en navigateur, viewport **2560 × 1400** :
`getBoundingClientRect()` → **560 × 219 px**. La largeur est une constante
(`width: 560px`) ; la fenêtre ne compte pas. Sur un écran de 2 560 px la palette
occupe 22 % de la largeur et la grille des styles est figée à 4 colonnes.

### 1.3 « `<kbd>` ne sert à rien, on click » — confirmé

Chaque bouton de style rend `<kbd>h</kbd> hardcore` : un pavé de touche dans un
bouton **cliquable**. Le repère est décoratif (le clic est l'action), et il
occupe la place du nom. Le raccourci, lui, reste un vrai raccourci.

## 2. Décision

**(a) La taxonomie vient du disque, pas du contenu.** `/scan` enregistre les
sous-dossiers de 1ᵉʳ niveau de chaque racine Source Data (`cache['dirs']`,
absolus). `/load` les expose (`dirs`), `buildTaxonomy` les reçoit comme les
`extra_dirs` (mêmes règles : parent = racine, nom parseFolderName). Un dossier
vide est donc un style connu (`count: 0`), avec sa destination et sa touche.
`_known_styles()` lit la même source — palette et route ne peuvent plus
diverger.

Le ➕/🗑 (`/mkdir`) garde son sens : le 🗑 écrit le nom dans une liste
`hidden_dirs` de `extra_dirs.json` (rétro-compatible : l'ancien format *liste*
reste lu), et le serveur retire ces dossiers de `dirs`. Sans ça, un dossier
retiré de l'index réapparaîtrait au scan suivant.

**(b) La palette s'adapte à la fenêtre.** `width: clamp(560px, 44vw, 1180px)`,
grille des styles `repeat(auto-fill, minmax(190px, 1fr))`, années
`repeat(auto-fill, minmax(58px, 1fr))` ; hauteur de la zone styles `50vh`
(pas de défilement pour 26 styles). Aucune constante de largeur d'écran.

**(c) Plus de `<kbd>` dans les boutons de style.** Le bouton porte le **nom**
et le **volume rangé** (`techno_acid · 214`), la touche passe dans le `title`
(« touche t ») ; le pied de la palette documente « Lettre = style · clic =
style » — le clavier reste une accélération, pas une devinette. Les bandeaux
`<kbd>` de la **légende** (❓) sont conservés : ils sont la référence clavier.

## 3. Contrat

- `/load` renvoie en plus `dirs: string[]` (absolus, triés, dédupliqués).
- `/scan` réécrit `cache['dirs']` à chaque passe ; `hidden_dirs` filtrés.
- `buildTaxonomy(sourceFiles, extraDirs)` : aucune signature changée — le client
  passe `dirs` **dans** la liste des dossiers additionnels.
- Palette : aucune bascule sur `window.innerWidth` en JS (le CSS suffit) —
  la géométrie reste testable sans navigateur réel.
- Tests : 6 dossiers vides → 6 styles de plus, dont `breakbeat` (taxonomie) ;
  `/styles/apply` accepte un style venu d'un dossier vide ; `dirs` filtré par
  `hidden_dirs`.

## 4. Non-objectifs

- Pas de styles.json configurable (reste P4 d'EPIC-035).
- Pas de tri/filtre de la palette : 26 styles tiennent à l'écran.
