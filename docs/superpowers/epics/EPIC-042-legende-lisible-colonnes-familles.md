# EPIC-042 — Légende « ❓ Raccourcis & Légende » : 4 colonnes jamais étirées, une abscisse par section, familles de touches

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Moyenne
> **Docs liées** : harnais `scripts/measure_legend.py` · EPIC-031 (légende **générée** + bijection) · EPIC-023 (refonte de la modale) · EPIC-039 (grammaire de focus — même méthode : mesurer avant)

## Objectif

La feuille de raccourcis doit se lire **d'un coup d'œil** : tous les libellés d'une section
alignés à la même abscisse, aucun libellé coupé, la modale entière qui tient à l'écran, et
**une ligne = une chose** (une touche décrite une fois, pas huit fois).

## Contexte & découvertes

Retour d'usage : la modale « ❓ Raccourcis & Légende » était **illisible**. Le défaut a été
**mesuré avant** toute correction, sur l'état exact du dépôt d'alors (`25ce79c`), dans un
worktree détaché (le working tree en cours n'a jamais été muté) :

```bash
git worktree add --detach /tmp/epic042_before 25ce79c   # état AVANT
cp scripts/measure_legend.py /tmp/epic042_before/scripts/
cd /tmp/epic042_before && node build.js && python3 scripts/measure_legend.py /tmp/epic042_before_out
```

| Défaut | Cause (lue dans le CSS/DOM) | Mesure AVANT | APRÈS |
|---|---|---|---|
| **Libellés coupés** | `#legend-grid` en grille `repeat(4, minmax(0,1fr))` sur les **sections** → 4 pistes de **262 px** à 1600 px de fenêtre | **56 libellés sur 2 lignes** (0/7 sections nettes) | **0** sur 71 (7/7 nettes) |
| **Sections étirées** | cellules de grille à hauteur de ligne : chaque section prenait la hauteur de la plus haute de sa rangée | **2 385 px** de vide interne, hauteur de ligne 19 → **141 px** | **7 px** au total (1 px/section), lignes **22/22/22 px** |
| **Abscisses désalignées** | chaque `.legend-row` était une grille `max-content 1fr` **par ligne** : l'abscisse dépendait de la largeur des touches de la ligne | jusqu'à **7 abscisses** dans une section, 7 sections désalignées | **1 abscisse par section**, 0 désalignée |
| **La modale ne tenait pas** | `max-height: 80vh` mais contenu de 1 866 px | **scrollHeight 1 866** vs clientHeight 684 | **668 / 668** (aucun défilement) |
| **8 lignes pour une touche** | un binding = une ligne, donc `Échap` décrit 8 fois (« fermer le menu », « fermer la modale », …) | 89 lignes dont 8 « Échap … » | **71 lignes**, `Échap` décrit **une fois** |
| **Une ligne sans marqueur** | « Double-clic Renommer / recolorer le cue » n'avait ni touche, ni pastille, ni badge (la seule du DOM) | **1 ligne sans marqueur** | **0** |
| **Colonnes déséquilibrées** | sections de tailles très inégales dans 4 cellules | ratio max/min **1,65** `[1713, 1713, 1713, 1036]` | **1,32** `[425, 500, 425, 563]` |

Score du harnais : **3/10 → 11/11** (10 vérifications de forme + 1 de contenu, cf. « Régression »). Les captures avant/après sont dans
`/tmp/epic042_before_out/1-legende.png` et `/tmp/epic042_final/1-legende.png` (rapports texte
complets à côté).

Ce qui n'était **pas** un défaut, vérifié et laissé tel quel : le contraste (libellé **12,02:1**,
touche **16,22:1**, identiques avant/après) et le nombre total sections (7).

### Régression : la feuille mutilée par un template d'une autre version

Signalée **en usage réel**, juste après le premier commit de cette EPIC : « il y a régression,
**où sont les légendes des états** (pastilles, sélection…) ? ». Vérifié dans l'application qui
tournait (pas dans le monde de mesure) :

```js
// onglet réel, modale ouverte par la touche `?`
[...document.querySelectorAll('#legend-grid .legend-section')]
  .map(s => s.querySelector('h4').textContent + ' → ' + s.querySelectorAll('.legend-row').length + ' lignes')
// → ["États & pastilles → 0 lignes", …, "Cue editor → 0 lignes"]
```

Cause : **le process Flask servait le template d'avant le commit** (Jinja compile le template au
chargement et `debug` est éteint → pas d'auto-reload) tandis que le navigateur prenait le
**nouveau bundle** (cache-buster par mtime). Or `renderKeyboardLegend()` détachait les sections
statiques **par `data-legend-section`** — attribut absent de l'ancien HTML — puis faisait
`grid.replaceChildren(...)` : les deux sections statiques (`États`, `Cue editor`) étaient donc
**effacées**, remplacées par des sections générées vides (aucun binding ne porte les groupes
`etats`/`cue`). La feuille perdait sa légende des états **en silence**.

Le harnais ne pouvait pas le voir : il **copie le template du workspace** dans son monde de
mesure, donc bundle et template y sont toujours de la même version — et ses 10 vérifications
testaient la **forme** (alignement, contraste, tenue) plus un **total** de lignes (G), jamais
« quelle section a du contenu ». Corrigé sur trois fronts :

1. **Contrat non destructif** (`renderKeyboardLegend`) : une statique est reconnue par
   `data-legend-section`, **à défaut adoptée par son titre** (`STATIC_TITLES` : `/^états/i`,
   `/cue editor/i` — les titres des versions antérieures), **sinon conservée** en queue de
   dernière colonne avec un `console.warn`. Rien du HTML n'est jamais effacé.
2. **Vérification H** dans le harnais : « aucune section vide (une légende muette = une légende
   fausse) » — elle nomme la section silencieuse, là où G ne dit qu'un total de lignes.
3. **Test de contrat** : une grille à l'**ancienne** (sections non annotées, exactement l'ancien
   HTML) doit survivre au rendu — test écrit d'abord, **rouge** sur le code fautif
   (`section « États » perdue: expected … to contain 'Sélectionné (multi-copie, Espace)'`), vert
   après le correctif.

Reproduction **mesurée** du skew de versions (old template + bundle), avec le harnais :

| Monde (template × bundle) | États / Cue editor | Harnais |
|---|---|---|
| ancien template × bundle **d'avant correctif** (= l'app de l'utilisateur) | **0 ligne / 0 ligne** | **3/11** — H ❌ *« section(s) VIDE(S) : États & pastilles, Cue editor »*, G ❌ (45 lignes) |
| ancien template × bundle **corrigé** | **12 lignes / 13 lignes** (adoptées) | 6/11 — H ✅ ; A/B/D/E/F restent rouges (les statiques d'une autre version gardent leur ancienne mise en forme, non alignée) |
| template courant × bundle courant | 12 / 14 | **11/11** |

Et dans l'application : rafraîchissement de l'onglet → « États — page Sync → **12 lignes** »,
« Raccourcis — Cue editor → 13 lignes » : la légende des états est **revenue sans redémarrer le
serveur**. La mise en forme « nouvelle grammaire » des deux sections statiques, elle, exige le
**redémarrage de l'app** (le template est compilé au chargement) — ce n'est pas un défaut du
code, mais une contrainte d'exploitation.

## Tâches

- [x] **4 colonnes explicites** (`LEGEND_COLUMNS`, `render/legend.ts`) au lieu du flux automatique : l'affectation des sections est écrite en dur et **choisie sur les comptes de lignes**, parce que c'est elle qui équilibre (une grille auto étirait les cellules).
- [x] **Une abscisse par section** : la section est une grille 2 pistes `max-content minmax(0,1fr)`, chaque ligne s'y aligne en `grid-template-columns: subgrid` → l'abscisse du libellé ne dépend plus de la largeur des touches de la ligne.
- [x] **Familles de touches** (`legendFamily` / `legendFamilyTitle` sur `CommandBinding`) : les bindings d'une même section partageant une famille sont rendus sur **une seule ligne**, leurs touches **côte à côte et dédoublonnées** (8× `Échap` → `Échap`), le texte étant celui du binding marqué titre. **12 familles** (`fermer` 8, `colonne` 3, + 10 familles de 2) → **31 bindings → 12 lignes** (−19 lignes).
- [x] **Libellés raccourcis** dans `commands/*.ts` (`'Naviguer vers le bas (liste focusée)'` → `'Naviguer dans la liste'`, `'Seek audio −20 s (avec Shift)'` → `'Seek ±20 s (⇧ maintenu)'`, …) : le libellé tient sur la largeur d'une colonne, et le *pourquoi* vit dans l'EPIC, pas dans la légende.
- [x] **Un marqueur par ligne** : `.legend-mark` (touches, pastille, badge) + `.legend-text` (le sens) — plus de libellé nu sans repère visuel ; un seul gabarit `<kbd>` pour toute la feuille (12 px, `--font-mono`, min-width 18 px).
- [x] **Sections statiques déplacées, jamais recréées** : le HTML reste leur source de vérité (`data-legend-section="etats|cue"`), `renderKeyboardLegend()` les **déplace** dans leur colonne et préserve leur contenu ; rendu **idempotent** (double appel = identique).
- [x] **Pied de modale** ramené à **1 note** (la pile de fermeture) : les deux autres notes décrivaient des bindings désormais présents dans les sections générées (`⇧+F10` dans Transverse, `Seek ±20 s (⇧ maintenu)` aussi) — zéro information perdue.
- [x] **Responsive honest** : ≤ 1 400 px les 4 colonnes tomberaient sous 300 px (libellés recoupés, mesuré) → les colonnes **s'enroulent** (`flex-wrap`), quitte à faire défiler la feuille : mieux vaut défiler que lire des libellés coupés.
- [x] **Harnais de mesure** `scripts/measure_legend.py` : ouverture par la touche **réelle** `?` (pas par le DOM), puis 10 vérifications sur la géométrie et le contraste **rendus** (canvas 1×1, composition alpha) — voir « Validation ». `proof_filter_chip.bootstrap(window)` accepte désormais une taille de fenêtre (les modales se mesurent dans une fenêtre réaliste).
- [x] **Test de contrat** `render/legend.test.ts` porté à **7 tests** : bijection touche ↔ binding (par **séquence de chips**, robuste aux familles), aucun texte orphelin/dupliqué dans une section, familles fusionnées (exactement un `legendFamilyTitle`, aucune touche dupliquée, jamais une famille d'un seul binding), **nombre de lignes = bindings labellisés − bindings fusionnés**, 7 sections + statiques présentes, idempotence, modificateurs visibles.

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/legend.ts` | Colonnes explicites (`LEGEND_COLUMNS`), `legendRows()` (familles), `renderRows()`, **contrat non destructif** (adoption par titre, conservation des sections inconnues) |
| `static/src/commands/registry.ts` | `legendFamily` / `legendFamilyTitle` (affichage seul — le binding reste actif au clavier) |
| `static/src/commands/*.ts` (11 modules) | Libellés raccourcis + familles déclarées (`audio`, `dups`, `menu`, `modals`, `navigation`, `playlist`, `rating`, `years`, `copy`, `filter`, `replace`, `style`) |
| `static/styles/components.css` | `#modal-legend .modal-content` (1 460 px / 92 vh), `#legend-grid` en 4 colonnes flex **jamais étirées**, sections 2 pistes + `subgrid`, gabarit unique de `<kbd>`, pied de modale, replis responsive |
| `templates/index.html` | Sections statiques annotées `data-legend-section`, lignes normalisées en `.legend-mark` + `.legend-text`, pied ramené à 1 note |
| `static/src/render/legend.test.ts` | Bijection + familles + comptage de lignes + **survie d'un HTML d'une autre version** |
| `scripts/measure_legend.py` | Harnais de mesure (11 vérifications, captures) — dont **H « aucune section vide »** |
| `scripts/proof_filter_chip.py` | `bootstrap(window)` — fenêtre paramétrable pour les harnais qui mesurent une mise en page |

## Validation

### Harnais headless — `python3 scripts/measure_legend.py /tmp/epic042_final`

Fenêtre **1600×1000** (viewport 857 px), monde synthétique isolé, modale ouverte par la touche
**réelle** `?`, **11/11** :

| Vérification | Mesure APRÈS |
|---|---|
| A · 1 seule abscisse de libellé par section | 7 sections, 0 désalignée (avant : 7 désalignées, jusqu'à 7 abscisses) |
| B · aucun libellé renvoyé à la ligne | **0 / 71** (avant : **56 / 89**) |
| C · contraste libellé ≥ 4,5:1 | **12,02:1** (`--text-secondary`) — inchangé |
| C · contraste touche ≥ 4,5:1 | **16,22:1** — inchangé |
| D · colonnes équilibrées (max/min ≤ 1,6) | **1,32** `[425, 500, 425, 563]` (avant : 1,65) |
| D · aucune section étirée | **7 px** au total, 1 px/section (avant : **2 385 px**) |
| D · lignes de hauteur uniforme | **22/22/22 px**, écart **0** (avant : 19/39/141 px, écart 122) |
| E · chaque ligne porte un marqueur | **0** ligne sans marqueur (avant : 1) |
| F · la modale tient sans défilement | **scrollHeight 668 = clientHeight 668** (avant : 1 866 vs 684) |
| G · contenu complet | **7 sections · 71 lignes** (avant : 89 lignes) |
| H · aucune section vide | **7 sections, toutes remplies** (le monde à l'ancien bundle donnait *« section(s) VIDE(S) : États & pastilles, Cue editor »*) |

**Correction honnête du harnais** : la vérification C lisait la couleur de la **ligne**, pas du
libellé. Après la refonte, la couleur vit sur `.legend-text`, donc la première version du harnais
annonçait **17,88:1** — un chiffre **optimiste** (la couleur réellement peinte est
`--text-secondary`, 12,02:1). Le harnais a été corrigé (`textRow.querySelector('.legend-text') ||
textRow`) et **les deux états ont été re-mesurés avec le même sonde** : le contraste du libellé est
donc **12,02:1 avant comme après**, et le tableau ci-dessus ne revendique aucune amélioration de
contraste.

### Preuve par mutation (les gardes neuves)

Chaque mutation a été **exécutée** (build inclus), mesurée, puis le fichier restauré (contrôle
`md5sum`) et le gate rejoué vert. Ces trois mutations ont été mesurées avec le harnais **d'alors**
(10 vérifications, avant l'ajout de H) : les scores sont donc des *n*/10.

| Mutation | Résultat mesuré |
|---|---|
| `.legend-section .legend-row { grid-template-columns: subgrid }` → `max-content minmax(0,1fr)` (l'ancienne grille **par ligne**) | **A en échec seul** — *9/10* : 7 sections désalignées, jusqu'à **8 abscisses** dans « Sync ». B/C/D/E/F/G restent verts : la garde d'alignement est bien celle-là, et elle seule. |
| Colonnes étirées (`#legend-grid { align-items: stretch }` + `.legend-section { flex: 1 1 auto }`) | **« D lignes de hauteur uniforme » en échec** — *9/10* : lignes 22 → **39 px** (écart 17). ⚠ La mutation a réparti l'excédent dans les **rangées** (hauteur sur 22/26/39, vide interne 19 px) au lieu de recreuser le trou d'origine (2 385 px) : le défaut d'origine n'est reproduit fidèlement que par l'état `25ce79c` lui-même (voir la commande du worktree). Leçon : une mutation qui « a l'air » d'un défaut n'en est pas toujours la cause. |
| `legendFamily: 'nav-paires'` retiré du seul `ArrowUp` de Doublons (famille réduite à 1 membre) | **`legend.test.ts` 2 échecs / 7** : `famille dups\|nav-paires réduite à un seul binding (fusion inutile): expected 1 to be greater than 1` **et** `textes dupliqués dans dups: expected 3 to be 4` (deux lignes retrouvent le même libellé). |
| Section statique **non reconnue** remise dans la grille (l'ancien HTML, sans `data-legend-section`) | Rouge → vert : sans le contrat non destructif, `legend.test.ts` échoue « section « États » perdue » ; H échoue aussi dans le monde à l'ancien template (voir la table de la Régression). |

### Gate projet

- [x] Typecheck (`npx tsc --noEmit`) — 0 erreur
- [x] Tests frontend (`npm test`) — **1 145 vitest**, 50 fichiers (dont `legend.test.ts` : **8**)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **335** (aucun fichier backend touché)
- [x] Lint (`npm run lint`) — 0 erreur (108 fichiers)
- [x] Build (`npm run build`) — ✅ validation passée
- [x] Harnais headless — **11/11** (avant : 3/10)

⚠ Le CSS **et** le JS sont bundlés : `npm run build` est **obligatoire** avant toute mesure
navigateur (un harnais lancé sans rebuild mesure la version précédente).

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `411433d` | Légende lisible : 4 colonnes jamais étirées, une abscisse par section (`subgrid`), familles de touches (8× `Échap` → 1 ligne), libellés raccourcis, harnais de mesure 10/10 (3/10 avant) |
| `c96b90e` | Traçabilité de l'EPIC (commit ci-dessus) |
| _(ce commit)_ | **Régression corrigée** : la légende des états ne peut plus être effacée par un template d'une autre version (adoption par titre + conservation `console.warn`), vérification H du harnais, test de contrat (1 145 vitest) |

## Décisions

- **Le défaut se corrige dans la géométrie, pas dans la typographie.** Première piste naturelle :
  réduire la police pour faire tenir le texte. Mesure à l'appui, le vrai coupable était la
  **largeur des pistes** (262 px) et l'**étirement des cellules** : garder 13 px de texte et
  élargir les colonnes donne 0 libellé coupé **et** une lecture inchangée. La taille du texte
  reste celle de l'ancienne version (13 px), seuls les `<kbd>` sont normalisés (12 px, monospace).
- **Quatre colonnes écrites en dur plutôt que déduites.** L'affectation
  `[États+Doublons | Sync | Playlist+Années | Transverse+Cue editor]` est un choix **d'équilibre
  mesuré** (1,32) ; la laisser au flux automatique reproduisait le défaut. Une section qui
  grossit demande donc de revoir les rangs — assumé, et signalé en commentaire dans le code.
- **`subgrid` plutôt que des largeurs calculées.** L'abscisse commune vient de la section, pas
  d'un `min-width` en dur qui se périmerait au premier libellé long. Repli acceptable :
  `subgrid` non supporté → chaque ligne retrouve sa grille 2 pistes locale (lisible, juste
  désalignée) ; aucun navigateur cible n'est concerné (Chrome/WebKit/Firefox ≥ 2023).
- **Les familles ne changent QUE l'affichage.** `legendFamily` / `legendFamilyTitle` sont des
  métadonnées de légende : aucun binding n'a été fusionné au clavier, aucun handler n'a bougé,
  la matrice clavier (78 cellules) reste inchangée. La bijection est **dédupliquée par chips**,
  donc un binding qui partage sa touche reste vérifié.
- **Le pied de modale ne répète plus les sections.** Il ne garde que ce qui est **transverse et
  non généré** : la pile de fermeture d'`Échap` (qui décrit un *ordre*, pas une touche).
- **Une section du HTML ne peut plus être effacée.** Le rendu détache ce qu'il reconnaît et le
  replace ; ce qu'il ne reconnaît pas (template d'une autre version, section ajoutée à la main)
  est **adopté par son titre** ou **conservé** — jamais jeté. Le `replaceChildren` sec d'origine
  reposait sur un contrat implicite (« le HTML est toujours de la même version que le bundle »)
  que rien ne garantissait : c'est ce contrat-là, pas le CSS, qui a produit la régression.
- **Le HTML reste la source de vérité des sections statiques** (`États & pastilles`, `Cue
  editor`) : elles sont **déplacées**, jamais régénérées — c'est ce qui rend la refonte
  réversible et garde une seule origine par contenu (bindings pour les raccourcis, HTML pour
  les couleurs du DOM).

## Notes / Risques

- **Mesuré en headless, pas « à l'œil ».** Les preuves sont des rects et des contrastes rendus
  par le navigateur (`Range` sur le nœud texte + canvas 1×1), sur un monde synthétique isolé
  (`data/` réel jamais touché). La **fenêtre de mesure est un paramètre** (`PROOF_WINDOW`) : à
  1 280 px de large, la feuille passe en colonnes qui s'enroulent et **défile** — c'est le
  comportement voulu, mais il n'a pas été mesuré finement (seul 1600×1000 l'a été).
- **Le contraste du libellé est celui d'avant** : 12,02:1 est confortable, mais l'EPIC ne
  prétend pas l'avoir amélioré — la première version du harnais le surestimait (voir
  « Validation »). Leçon : un harnais qui lit la couleur d'un **conteneur** au lieu de l'élément
  peint produit un chiffre flatteur faux ; c'est exactement le genre de défaut que cette EPIC
  traque.
- **La légende n'est jamais éditée à la main** : tout raccourci se déclare dans
  `commands/*.ts` (`label`, `group`, `legendFamily`). `index.html` ne contient que les deux
  sections décrites plus haut — l'y écrire un raccourci le ferait disparaître au prochain rendu.
- **Le template est compilé par le process Flask, pas par le bundle** : changer `templates/index.html`
  n'a d'effet qu'après un **redémarrage de l'app** (Jinja compile au chargement, `debug` éteint →
  pas d'auto-reload), alors que le JS/CSS repartent au simple rafraîchissement (cache-buster par
  mtime). C'est cette asymétrie qui a produit la régression livrée : **après toute modification du
  HTML, redémarrer** (`npm start` fait le `fuser -k 8765/tcp` nécessaire). Le code tolère
  désormais l'écart, mais un template périmé garde l'ancienne **mise en forme** de ses sections
  statiques (titres et libellés compris) — mesuré à 6/11.
- **Suite naturelle** : EPIC-031 P2 (ergonomie des touches) reste ouverte ; la légende n'est
  plus le point faible de la lecture des raccourcis.
