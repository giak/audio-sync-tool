# Source Data : navigation dossier + filtre F7

## Résumé

Le panneau Source Data passe en mode « dossiers uniquement » : les fichiers sont
cachés par défaut, le clavier ne cible que les dossiers, un filtre de recherche
(F7) permet de réduire l'arborescence aux dossiers pertinents. La copie se fait
exclusivement via F5.

## Problème

L'utilisateur écoute des fichiers dans le panneau gauche (Éparpillé) pour
identifier le style, puis doit naviguer dans l'arborescence Source Data pour
trouver le dossier de destination. Actuellement, les fichiers sont entrelacés
avec les dossiers dans la navigation clavier, rendant le parcours long.

## Périmètre

- Changements **purement frontend** (script.js, style.css)
- Uniquement le panneau **Source Data** (droit)
- Le panneau Éparpillé (gauche) reste inchangé — sauf ajout d'un compteur
  total dans l'en-tête

---

## 1. Panneau Source Data : dossiers repliés par défaut

### Comportement

- Au scan/chargement, seuls les **dossiers de premier niveau** sont affichés
- Chaque dossier est **replié** par défaut
- **↑↓** : focus uniquement les éléments `.directory` (les `.file-row` ne sont
  jamais atteints par le clavier)
- **Entrée / Espace / Click** sur un dossier replié → **déplie** (affiche ses
  enfants : sous-dossiers + fichiers)
- **Entrée / Espace / Click** sur un dossier déplié → **replie** (masque ses
  enfants)
- Un dossier déplié montre ses enfants dans l'ordre : dossiers d'abord, fichiers
  ensuite
- Les sous-dossiers sont également repliés par défaut, et suivent le même
  mécanisme

### Focus clavier

- `getItems()` pour le panneau Source Data retourne **uniquement les éléments
  `.directory`**, jamais `.file-row`
- Les fichiers visibles dans un dossier déplié sont **cliquables à la souris**
  pour play, mais ignorés par le clavier
- Quand un dossier est déplié, ses sous-dossiers deviennent accessibles via ↑↓
- Quand un dossier est replié, ses sous-dossiers et fichiers disparaissent du
  DOM et du focus

### États visuels

- Dossier replié : `📁 NomDuDossier`
- Dossier déplié : `📂 NomDuDossier`
- `color: #f5c2e7` (inchangé)
- Au focus clavier : outline rose `#f5c2e7` (inchangé)
- Au hover : background `#313244`

### Implémentation

- `state.sourceExpanded = new Set()` stocke les chemins des dossiers dépliés
- `renderSource()` construit l'arbre (inchangé) mais rend uniquement le premier
  niveau de dossiers, sans leurs fichiers
- `toggleSourceDir(dirPath)` → ajoute/retire de `sourceExpanded` et
  ré-affiche les enfants concernés
- Le rendu des enfants dépliés utilise une variante de `renderTree()` qui
  s'arrête au premier niveau (seuls les sous-dossiers immédiats sont rendus,
  également repliés)
- Quand un sous-dossier est déplié, ses propres enfants sont rendus
  récursivement

---

## 2. Filtre de recherche (F7)

### Déclenchement

- **F7** : focus le champ de recherche (s'il existe déjà) ou crée une barre de
  recherche en haut du panneau Source Data
- Le champ a un placeholder : « Filtrer les dossiers… »
- Si aucun filtre n'est actif et que l'utilisateur tape F7, le champ apparaît
  et reçoit le focus
- Si le filtre est actif et que l'utilisateur tape F7, le focus retourne dans
  le champ
- **Échap** : efface le filtre, cache le champ, restore la vue repliée par
  défaut

### Filtrage

- Le filtrage s'applique à **tous les niveaux** de l'arborescence
- Un dossier est visible si :
  1. Son **nom** (pas le chemin complet) contient la chaîne recherchée
     (insensible à la casse)
  2. OU **au moins un de ses descendants** (à n'importe quel niveau) contient
     la chaîne
- Les dossiers visibles parce qu'un descendant correspond sont **automatiquement
  dépliés** (pour montrer la chaîne jusqu'au descendant qui a matché)
- Les dossiers visibles parce qu'eux-mêmes matchent sont **repliés** par défaut
  (l'utilisateur les déplie manuellement si besoin)
- Les branches qui n'ont aucun match (ni le dossier ni ses descendants) sont
  complètement masquées
- Le filtrage est **instantané** (sur chaque frappe, sans délai)

### Navigation dans les résultats filtrés

- ↑↓ ne parcourt que les dossiers visibles (les masqués sont absents du DOM)
- Le focus peut atteindre les dossiers de n'importe quel niveau (pas seulement
  le premier)

### Comportement souris pendant le filtre

- Click sur un dossier pendant le filtre = le déplie/replie normalement
- Les fichiers visibles sont cliquables pour play

### Implémentation

- `state.sourceFilter = ''` stocke la chaîne de filtrage
- `state.filterActive = false` indique si le filtre est en cours
- À chaque frappe, `renderSource()` est rappelé avec le filtre actif
- La fonction `matchesFilter(node, filter)` parcourt récursivement l'arbre
  pour déterminer si un nœud ou un de ses descendants matche
- Les nœuds visibles par match de descendant sont forcés dans
  `sourceExpanded`
- Quand le filtre est vidé (Échap), `sourceExpanded` est vidé et la vue
  repliée par défaut est restaurée

---

## 3. Copie exclusive via F5

### Changements

- `selectDestination()` (click-to-copy) est **désactivée** pour les clicks sur
  les dossiers du panneau Source Data
- La copie se fait **uniquement** via F5 (workflow existant)
- La fonction `selectDestination()` peut être conservée mais n'est plus
  appelée par les événements click

### Workflow final

1. ↑↓ dans le panneau gauche → sélectionne un fichier ●
2. **Espace** → le marque (optionnel, le F5 peut utiliser le highlight seul)
3. **Tab** → panneau droit Source Data
4. ↑↓ → naviguer entre les dossiers (repliés et dépliés)
5. Entrée/Click sur un dossier → déplier pour explorer
6. **F5** → copie le fichier vers le dossier en surbrillance
7. Confirmation → Oui → copie → retour à la vue normale

---

## 4. Éléments d'interface

### Barre de recherche

- Apparaît au-dessus de `#source-container` dans le panneau droit
- `input[type=text]` avec fond `#313244`, texte `#cdd6f4`, bordure `#45475a`
- Hauteur ~28px, placeholder grisé
- Focus visible (outline 1px `#89b4fa`)
- Si présent mais vide, affiche seulement en mode filtre actif

### Icônes d'expansion

- Dossier replié : `📁` (inchangé, déjà utilisé par les dossiers)
- Dossier déplié : `📂` (dossier ouvert)
- Appliqué uniquement au panneau Source Data (`#source-container`),
  le panneau Éparpillé garde `📁` en permanence

### Badge de résultat

- Quand le filtre est actif, un petit compteur grisé indique le nombre de
  résultats : « 3 dossiers trouvés »
- Quand le filtre ne trouve rien : « Aucun dossier trouvé » en orange

---

## 5. Raccourcis clavier (mise à jour)

| Touche | Panel gauche (Éparpillé) | Panel droit (Source Data) |
|--------|--------------------------|---------------------------|
| **↑ ↓** | Naviguer fichiers + dossiers | Naviguer **dossiers uniquement** |
| **Tab** | ↔ basculer | ↔ basculer |
| **Entrée** | Play le fichier | Déplier/Replier le dossier |
| **Espace** | Sélectionne le fichier ● | Déplier/Replier le dossier |
| **F5** | Copie highlight → dossier highlight (inchangé) |
| **F7** | Focus champ recherche Source Data |
| **Échap** | (panel gauche, rien) | Efface le filtre, restore vue repliée |
| **← →** | Seek audio (inchangé) |

---

## 6. Architecture du rendu (Source Data)

### Avant

```
renderSource()
  → build tree from flat file list
  → renderTree(node, container, basePath)
      → for each sub-dir: render directory → recurse renderTree
      → render files at this level
```

### Après

```
renderSource()
  → build tree from flat file list (inchangé)
  → renderFilterBar() si filtre actif
  → renderSourceDirs(tree, container, basePath, level=0)
      → for each sub-dir:
          → render directory element avec toggle handler
          → si expanded (state.sourceExpanded) OU
             (filtre actif ET auto-expand nécessaire):
              → ouvrir <div class="children">
              → renderSourceDirs(children, childContainer, ..., level+1)
                (sous-dossiers, également repliés par défaut)
              → render files de ce niveau
```

### Filtrage

```
renderFilteredSource()
  → build tree
  → renderFilterBar()
  → calculateVisibleNodes(tree, filterTerm) → Set des chemins visibles
  → renderSourceDirs(tree, container, basePath, visibleSet)
      → skip si dossier pas dans visibleSet + aucun enfant visible
      → auto-expand si un descendant a matché
```

---

## 7. Compteurs

### Compteur par dossier (Source Data)

- Chaque dossier dans le panneau Source Data affiche le nombre de fichiers
  musicaux qu'il contient **directement** (pas récursif dans les
  sous-dossiers)
- Affiché à droite du nom du dossier, en gris monospace : `Rock  (230)`
- Le compteur est visible **que le dossier soit replié ou déplié**
- Mise à jour automatique après un scan

### Compteurs totaux dans les en-têtes

- En-tête **Éparpillé** (panneau gauche) : `📂 Éparpillé  (1 245)`
  — total de tous les fichiers dans tous les dossiers éparpillés
- En-tête **Source Data** (panneau droit) : `📂 Source Data  (8 420)`
  — total de tous les fichiers dans la source data
- Les compteurs sont séparés du titre par un espace et en gris
- Mise à jour automatique après un scan ou un copie

### Pendant le filtre

- Quand un filtre est actif, le compteur de l'en-tête Source Data passe en
  `Source Data  (142 / 8 420)` pour indiquer le nombre de fichiers dans les
  dossiers visibles
- En complément du compteur de résultats
  `3 dossiers trouvés`

### Implémentation

- Le comptage se fait pendant le rendu : chaque appel à `renderSource()`
  calcule les totaux par dossier et les totaux globaux
- Les compteurs sont stockés dans un objet temporaire (pas dans le state)
  et insérés dans le DOM via un `span.dir-count`
- Les totaux des en-têtes sont mis à jour dans `renderAll()` après chaque
  rendu de panneau

---

## 8. Style.css — ajouts

```css
/* Barre de recherche */
#source-filter { width: 100%; margin-bottom: 8px; padding: 4px 8px;
  background: #313244; color: #cdd6f4; border: 1px solid #45475a;
  border-radius: 4px; font-size: 13px; outline: none; }
#source-filter:focus { border-color: #89b4fa; }

/* Compteur de résultat */
#source-filter-count { font-size: 11px; color: #585b70; margin-bottom: 6px; }

/* Dossier replié/déplié (Source Data) */
#source-container .directory::before { content: '📁  '; }
#source-container .directory.expanded::before { content: '📂  '; }

/* Compteur de fichiers dans un dossier */
.dir-count { font-size: 11px; color: #585b70; margin-left: 8px; font-family: monospace; }

/* Compteurs totaux dans les en-têtes de panneaux */
.panel-header-count { font-size: 12px; color: #585b70; font-weight: normal; margin-left: 8px; }
```

---

## 9. Non-fonctionnel

- Aucune dépendance externe additionnelle
- Performance : arbre < 5000 dossiers, filtrage instantané sans debounce
- Accessibilité : tous les raccourcis documentés dans l'interface (tooltip ou
  aide rapide)
- La fonction `selectDestination()` est conservée dans le code mais n'est plus
  reliée à aucun événement. Elle pourra être supprimée dans une révision future.

---

## 10. Tests

- `renderSource()` ne produit que des `.directory` au premier niveau
- Entrée sur un dossier → les enfants apparaissent dans le DOM
- Entrée sur un dossier déplié → les enfants disparaissent du DOM
- F7 → le champ de recherche apparaît et reçoit le focus
- Filtrer par "rock" → dossiers sans match masqués
- Filtrer par chaîne qui match un sous-dossier → dossier parent visible et
  déplié
- Échap → filtre effacé, vue repliée restaurée
- Click sur un dossier → ne déclenche pas de copie
- F5 → copie toujours fonctionnelle
- Chaque dossier Source Data affiche `(n)` avec le nombre de fichiers directs
- En-tête Éparpillé affiche le total des fichiers éparpillés
- En-tête Source Data affiche le total des fichiers source
