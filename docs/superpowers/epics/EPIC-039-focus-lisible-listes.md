# EPIC-039 — Focus lisible : savoir d'un coup d'œil où l'on est dans les listes

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-21 · **Dernière mise à jour** : 2026-09-21
> **Priorité** : Haute
> **Docs liées** : aucune spec (changement CSS pur, mesuré headless — harnais `scripts/measure_focus_visibility.py`)

## Objectif

Le curseur — morceau **ou** dossier — doit être identifiable **au premier regard** dans
toutes les listes, y compris sur un écran en périphérie (DJ booth), sans confondre le
focus avec le survol ni avec la sélection.

## Contexte & découvertes

Retour d'usage : « on est sur un cadre bleu entouré d'un liseret, il faut que ce soit plus
marqué ». C'était exact, et **mesurable** : la grammaire de focus d'origine empilait deux
traits faibles sur le même élément.

| Élément | Règle d'origine | Contraste rendu |
|---|---|---|
| Dossier (`.directory.focused`) | `outline: 1px solid var(--border-focus)` = `rgba(0,136,255,0.35)` | **1,17:1** |
| Ligne fichier (`.file-row.focused > td`) | `outline: 1px` sur la seule cellule du nom + barre 3 px | 1,17:1 |
| Piste playlist (`.pl-track.focused`) | `outline: 1px` même couleur | 1,17:1 |
| Panneau actif (`.panel-active`) | `border: 1px solid var(--border-active)` = 50 % d'alpha | **3,38:1** |

Le « cadre entouré d'un liseret » est donc la superposition de deux traits translucides :
le `--border-focus` à 35 % d'alpha ne se distingue quasiment pas de la ligne voisine
(sous le seuil de 3:1 du WCAG pour les éléments non textuels). Sur les lignes de tableau,
`border-collapse` rend le contour de `<tr>` non fiable : seul le nom portait un `outline`.

Contrainte : le focus est un état **transitoire** qui se déplace au clavier. Il doit rester
distinct de `--bg-focus` (#1a1f45), déjà utilisé pour le survol et la sélection (mode
playlist) — sinon le curseur est indiscernable d'un clic.

## Tâches

- [x] Une **grammaire unique** pour le focus : boîte d'accent 2 px + barre 4 px à gauche + fond teinté 14 %.
- [x] Lignes de tableau : boîte peinte en `box-shadow: inset` **sur les cellules** (haut/bas sur toutes, gauche/droite sur les cellules extrêmes) — aucun décalage de layout, aucune fente, `border-collapse` contourné.
- [x] Dossiers de l'arbre source : `outline: 2px solid var(--accent)` + `outline-offset: -2px` + barre 4 px + teinte 14 % (déclaré **après** `:hover`/`:active` pour que le curseur gagne sur le survol).
- [x] Pistes de playlist (`.pl-track.focused`) alignées sur la même grammaire.
- [x] Cartes **Années** (`.years-card.years-review.focused`) et **Doublons** (`.dup-card.focused`) : boîte 2 px + barre 4 px + teinte portée de 8 % à 12 % — l'ambre reste la couleur de la revue, la grammaire devient la même.
- [x] Panneau actif : bordure d'accent pleine + anneau `inset` 1 px (= 2 px visuels sans reflow du flex) — on sait aussi **quelle colonne** a le clavier.
- [x] Harnais de mesure `scripts/measure_focus_visibility.py` (monde isolé, Chrome CDP) : contraste WCAG calculé **comme le navigateur le rend** (canvas 1×1, composition alpha réelle), comparaison **avant/après dans le même rendu** (règles d'origine réinjectées) + clic réel pour vérifier que l'app pose bien la classe.

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/styles/pages/sync.css` | Focus ligne/dossier + panneau actif + chip collé (EPIC-037) |
| `static/styles/pages/playlist.css` | Focus piste playlist |
| `static/styles/pages/years.css` | Focus carte Années |
| `static/styles/pages/dups.css` | Focus carte Doublons |
| `scripts/measure_focus_visibility.py` | Harnais de mesure + captures avant/après |

Aucun fichier TypeScript modifié : les classes (`.focused`, `.panel-active`) sont déjà
posées par `focus.ts`, `fileRow.ts`, `sourceTree.ts`, `playlistUI.ts`, `yearsUI.ts`,
`dupsUI.ts` — seule la **peinture** change.

## Validation

Mesure headless (`python3 scripts/measure_focus_visibility.py /tmp/epic039_focus`) — **8/8** :

| Mesure | Avant | Après |
|---|---|---|
| A. Anneau dossier (épaisseur · contraste) | 1 px · **1,17:1** | 2 px · **9,79:1** |
| B. Barre de la ligne focusée | 3 px | **4 px** |
| B. Boîte de la ligne (haut/bas, gauche/droite) | absente | **2 px · 9,79:1** |
| C. Fond teinté de la ligne (distance sRGB avec une ligne non focusée) | 80 (`#1a1f45`, confondu avec la sélection) | **47** (`#001e24`, teinte cyan propre) |
| D. Bordure du panneau actif | 3,38:1 | **11,45:1** |
| E. Clic réel dans la liste | — | 1 seule ligne focusée, **la ligne cliquée** (index 2) |
| Contrôle de sensibilité | Les règles d'origine réinjectées font **retomber toutes** les mesures aux valeurs « avant » — la sonde mesure bien le CSS, elle ne passe pas par accident. | |

Captures : `10-focus-apres.png`, `11-focus-avant.png`, `12-focus-clic-reel.png`.

- [x] Typecheck (`npm run typecheck`) — 0 erreur
- [x] Tests frontend (`npm test`) — 1 137 vitest, 50 fichiers
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — 317
- [x] Lint (`npm run lint`) — 0 erreur
- [x] Build (`npm run build`) — ✅ validation passée (le CSS est bundlé dans `static/dist/script.css` : **rebuild obligatoire** avant toute mesure navigateur)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _(working tree 2026-09-21)_ | Focus lisible : grammaire unique (boîte 2 px + barre 4 px + teinte), panneau actif net, cartes Années/Doublons alignées, harnais de mesure |

## Décisions

- **Une seule grammaire pour tous les focus** : boîte 2 px + barre d'accent 4 px + fond teinté. Une exception par écran est ce qui a produit l'empilement de traits faibles que l'on corrige.
- **Pas d'`outline` sur les `<tr>`** : avec `border-collapse`, le contour de ligne se duplique ou disparaît (EPIC-026 a mis la liste en vrai tableau `table-layout: fixed`). La boîte est peinte en `box-shadow: inset` sur les cellules — zéro reflow, zéro pixel de décalage.
- **Teinte cyan à 14 % au lieu de `--bg-focus`** : `--bg-focus` sert déjà au survol et à la sélection ; le focus doit rester un état distinct. La distance sRGB est plus faible (47 vs 80) mais la boîte d'accent, elle, passe de 0 à 2 px à 9,79:1 — c'est la boîte qui porte la lisibilité, la teinte ne fait que remplir.
- **Barre 3 px → 4 px** : la barre est le repère vertical que l'œil accroche en balayant une liste ; elle doit rester au-dessus du seuil de perception en périphérie.
- **Ambre conservé pour Années/Doublons** : la couleur y est sémantique (file de revue), on aligne la grammaire sans toucher au sens.
- **Panneau actif en accent plein + anneau `inset`** : `--border-active` (50 % d'alpha) donnait 3,38:1, sous le seuil 4,5:1 pour un indicateur non textuel. L'anneau interne évite d'augmenter la bordure (donc le reflow) tout en doublant l'épaisseur perçue.

## Notes / Risques

- Le contraste est mesuré **par rapport au fond de la ligne** (le pire cas : la boîte doit se détacher de son propre remplissage), pas par rapport au fond du panneau — les deux valeurs sont proches ici.
- Aucun test unitaire ne couvre la peinture CSS ; la garantie est le harnais headless + le contrôle de sensibilité. Un changement de tokens (`--accent`, `--amber`) fera échouer les seuils si la lisibilité se dégrade.
- Le harnais gèle animations et transitions avant de mesurer (sinon la mesure dépend du frame courant) et réutilise le monde synthétique isolé de `scripts/proof_filter_chip.py` — `data/` réel jamais touché.
