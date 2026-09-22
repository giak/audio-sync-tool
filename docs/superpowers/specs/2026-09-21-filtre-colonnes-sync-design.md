# Design : Chip de filtre des colonnes — sticky, focus fiable, clavier, années

> **Date** : 2026-09-21 · **Statut** : étude (faits mesurés) → prêt pour validation
> **EPIC** : [EPIC-037](../epics/EPIC-037-filtre-colonnes-sticky-clavier-annees.md)
> **Objets concernés** : `static/src/filterEngine.ts`, `static/src/render/filterChip.ts`,
> `static/src/render/eparsUI.ts`, `static/src/render/sourceTree.ts`, `static/src/utils.ts`,
> `static/src/commands/filter.ts`, `static/src/commands/navigation.ts`,
> `static/styles/pages/sync.css` (+ tests associés).
> **Hors scope** : chips encore absents côté Dupliqués (EPIC-030 P1) et sidebar
> playlist (`playlist-tracks`) ; moteur de doublons (EPIC-028/032) ; rangement par style
> (EPIC-035) ; backend. Aucune écriture sur `data/`.

## Problème — 4 frictions relevées en usage réel (2026-09-21)

1. **Le filtre par année ment.** L'épars filtré sur `2020` continue d'afficher des
   fichiers de 1997, 1993…
2. **Le chip n'est pas collé** : il disparaît dès qu'on scrolle la liste.
3. **Cliquer dans le chip scrolle la liste** (on perd la position de lecture).
4. **↓ dans le chip ne descend pas dans la liste** de la colonne : ça saute dans
   l'autre colonne.

## Diagnostic (mesuré sur la collection réelle)

Source : `data/cache.json` (lecture seule) — épars = **5 092 fichiers**, dont
**3 631 avec année** et 1 461 sans ; source = 1 604 fichiers (1 racine,
dossiers datés `techno_1990`, `techno_acid_2020`, `techno_2020`, `trance_1995`…).

### D1 — Le terme matche en sous-chaîne **tous** les champs, sous-dossier compris

`filterEngine.matchesTokens` construit un seul haystack
`nom + année + codec + sous-dossier (path) + genre` et teste chaque token en
**sous-chaîne** sur l'ensemble. L'épars passe `path` depuis EPIC-035 (filtre par
sous-dossier `_schranz`) — les sous-dossiers de montage sont **datés**.

Mesure du terme `2020` sur l'épars :

| | lignes gardées |
|---|---|
| aujourd'hui | **493** (dont **333** avec une année ≠ 2020) |
| dont `1993` | 14 (les années citées par l'utilisateur) |
| dont `1997` | 9 |
| autres | 2019 ×49 · sans année ×29 · 2018 ×25 · 1994 ×16 · 1996 ×15 · 1995 ×14 · 2015 ×13 · 2017 ×13 · 2000/1999/2001/1988 ×10 · 2006 ×9… |

Cause : ces fichiers vivent dans un sous-dossier daté (ex.
`-to-process/2020_02_25/mix/…`) — le token `2020` matche le **chemin**, jamais
l'année. Avec la règle proposée : **189** lignes (160 année == 2020 + 29 sans
année en sous-dossier `2020_*`), `1993` → **127 → 127** (inchangé).

### D2 — Le chip n'est pas collé (CSS absent)

`.panel { flex: 1; overflow-y: auto; padding: 10px }` est le conteneur
scrollable ; le chip vit dans `#filter-slot-sync-epars` / `#filter-slot-sync-source`
(enfants directs du panneau). Aucune règle `position: sticky` ne les vise —
alors que le pattern existe déjà pour `#filter-slot-playlist-source`
(`pages/playlist.css`), `#filter-slot-years` (`pages/years.css`) et
`#dups-head` (`pages/dups.css`).

### D3 — Le clic dans le chip scrolle : `onclick` du panneau → `scrollIntoView`

```ts
// static/src/script.ts
document.getElementById('panel-left')!.onclick  = () => setActivePanel('epars');
document.getElementById('panel-right')!.onclick = () => setActivePanel('source');
```

`setActivePanel()` appelle `focusItemByPath()` qui fait `scrollIntoView()` sur
l'item focusé. Un clic **dans l'input du chip** (slot dans le panneau) bubble
jusqu'au panneau → scroll. Même effet via `F7` (`focusCurrentChip` appelle
`setActivePanel(st.activePanel)`).

### D4 — `↓` est codé en dur vers la colonne droite

```ts
// static/src/commands/navigation.ts
registry.bind({ key: 'ArrowDown', isFilterInputFocused: true,
  handler: () => { document.activeElement?.blur(); setActivePanel('source'); } });
registry.bind({ key: 'Tab', isFilterInputFocused: true,
  handler: () => { document.activeElement?.blur(); setActivePanel('epars'); } });
```

Aucune de ces deux bindings ne dépend du **scope du chip** : depuis le chip
épars, `↓` va dans Source Data ; depuis le chip Source Data, `Tab` va dans
l'épars. Sur les pages Années / Playlist, le chip actif (`years`,
`playlist-source`) envoie le focus sur `#source-container`/`#epars-container`
— des panneaux **masqués**.

### Cause annexe — `.focused` et `state.activePanel` peuvent diverger

`state.activePanel` (qui choisit le chip sur `F7`) n'est pas mis à jour par
tous les chemins de focus : la cellule rating (`fileRow.ts`, `ratingTd.onclick`)
pose `.focused` **sans** `setActivePanel`. F7 peut donc filtrer l'autre colonne
que celle que l'utilisateur regarde (même famille de bug que D1 côté perception).

## Objectifs

1. La recherche reste **libre** (texte **ou** chiffres), sur **les deux
   colonnes** — décision produit du 2026-09-21 : pas de syntaxe à apprendre.
2. Taper une année donne **les fichiers de cette année** (pas ceux d'un dossier
   nommé avec cette année), et les autres tokens gardent le comportement actuel.
   (Colonne Éparpillé ; la colonne Source Data reste un filtre par nom de dossier
   — décision du 2026-09-21, cf. §3.)
3. Le chip reste **visible en permanence** au scroll de sa colonne.
4. Cliquer dans le champ ne déplace **jamais** la liste en dessous.
5. `↓` entre dans la liste **de la colonne du chip** (jamais l'autre), sauf si
   cette liste est vide.

## Choix retenus

| # | Décision | Alternative rejetée |
|---|---|---|
| C1 | **Heuristique « année honnête »** : un token de 4 chiffres `19xx`/`20xx` est traité à part (année exacte d'abord). Zéro syntaxe, conforme à « la recherche est libre ». | Jetons qualifiés `year:2020` (syntaxe à apprendre) · 4ᵉ champ « année » séparé dans le chip (duplique l'input, EPIC-030 KISS). |
| C2 | **Slot collé** : `position: sticky` sur les deux slots sync, même pattern que playlist/years (fond opaque, marges négatives, z-index 3). | `position: fixed` (casse le layout flex, gère mal deux colonnes) · rendre le `<h2>` collé aussi (SPOF visuel, hors demande). |
| C3 | **Clic neutre** : le handler de panneau ignore les clics issus du chip **et** ne re-scrolle plus si le panneau est déjà actif (ceinture + bretelles). | Retirer le handler de panneau (casserait l'activation au clic dans une zone vide). |
| C4 | **`↓` = liste du scope** via une table `scope → conteneur` partagée avec `currentFilterScope()`. | Garder `setActivePanel('source')` (le bug) · binding par page dupliqué ×4 (dérive). |

## Design

### 1. `filterEngine.ts` — matcher v2 (« année honnête »)

Ajout pur, sans DOM, testable isolément. **La signature publique de
`matchesTokens(foldedTerm, subject)` ne change pas** (S1) : la règle année ne
dépend que du token et du sujet.

```ts
/** Token « année plausible » : 4 chiffres 19xx/20xx. */
export function isYearLike(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token);
}

export function matchesTokens(foldedTerm: string, subject: FilterSubject): boolean {
  const name  = foldText(subject.name);
  const year  = subject.year  ? foldText(subject.year)  : '';
  const codec = subject.codec ? foldText(subject.codec) : '';
  const path  = subject.path  ? foldText(subject.path)  : '';
  const genre = subject.genre ? foldText(subject.genre) : '';
  const haystack = [name, year, codec, path, genre].filter(Boolean).join(' ');
  if (!haystack) return false;                                  // ordre historique conservé
  const tokens = foldedTerm.split(/\s+/).filter(t => t.length > 0);
  return tokens.every(token => {
    if (!isYearLike(token)) return haystack.includes(token);   // historique intact
    if (year === token) return true;                            // 1. année exacte
    if (name.includes(token)) return true;                      // 2. texte explicite du nom
    if (!year && path.includes(token)) return true;              // 3. non taggé : dossier daté
    return false;                                                // 4. sinon NON (fini les faux positifs)
  });
}
```

Propriétés (à figer en tests) :

| Terme | Sujet | Avant | Après |
|---|---|---|---|
| `2020` | année 1993, path `2020_02_25/mix/x.mp3` | ✅ (bug) | ❌ |
| `2020` | année 2020 | ✅ | ✅ |
| `2020` | année vide, path `2020_02_25/…` | ✅ | ✅ |
| `2020` | année 2019, nom `Live 2020.mp3` | ✅ | ✅ (le nom reste souverain) |
| `2020_02` | année 1993, path `2020_02_25/…` | ✅ | ✅ (token non year-like → texte) |
| `_schranz` | path `_schranz/x.mp3` (EPIC-035) | ✅ | ✅ |
| `202` | année 2023 | ✅ | ✅ (non year-like → sous-chaîne) |
| `flac 1993` | codec FLAC, année 1993 | ✅ | ✅ (AND mixte) |

Échapatoire documentée : pour retrouver un **dossier daté** dont les fichiers
sont taggés d'une autre année, taper un préfixe non-year-like (`2020_02`,
`2020_0`). C'est la seule perte assumée (304 lignes sur la collection, cf. D1).

### 2. Colonne gauche (épars) — branchement direct

`renderEpars()` appelle déjà `matchesTokens` avec le sujet complet
(`name, year, codec, path, genre`) : **aucun changement d'appel**, seul le
moteur change. Contrôle attendu en live : `2020` → 189 lignes (compteur du chip
`189/5092`), `1993` → 127 (inchangé).

### 3. Colonne droite (Source Data) — **écarté (décision 2026-09-21)**

> **P1 bis non retenue** : la colonne Source Data reste inchangée (filtre par
> nom de dossier, fichier en mode 📄). Le design ci-dessous est conservé pour
> mémoire, au cas où le besoin d'une **année réelle** à droite reviendrait.
> Limite mesurée et assumée : `1993` → **0 dossier** à droite alors que 59
> fichiers y sont taggés 1993 ; `2020` → 48 visibles / 18 invisibles.

Aujourd'hui `renderFilteredSource()` ne compare que **les noms de dossiers**
(`name.toLowerCase().includes(term)`) et les noms de fichiers en mode 📄
(`dirHasMatchingFile`). Une année **de fichier** ne peut donc pas filtrer, et
`getFilterTerm(scope).toLowerCase()` n'est même pas plié (accents).

- Nouvel helper **pur** `subjectMatchesTree(term, node)` dans `utils.ts` :
  un dossier matche si `matchesTokens(term, { name: dossier, year: année du
  dossier, … })` **ou** `dirHasMatchingDescendant(node, term)` **ou**
  `dirHasMatchingFile(node, term)`.
- **Année du dossier** : segment `_YYYY` final du nom (`techno_2020` → `2020`),
  sinon `null` — couvre déjà le cas réel des dossiers 1ᵉʳ niveau datés
  (`techno_1990`, `techno_acid_2020`, `techno_2020`, `trance_1995`, `hardcore_2020`…).
- **Année de fichier** (`dirHasMatchingFile` étendu) : en mode 📄 seulement,
  un dossier est gardé/auto-déplié si un de ses fichiers matche le sujet complet
  (nom, année, codec, genre) — « 2020 » retrouve `techno_acid_2020/xyz` taggé
  2020 même si le dossier ne portait pas l'année.
- **Invariant EPIC-030 conservé** : l'expansion d'un dossier gardé montre
  **tous** ses fichiers (le filtre ne masque jamais un jumeau à vérifier).
- Le terme est plié (`foldTerm`) comme côté épars — fin de l'incohérence
  accents.

**Décision (2026-09-21, utilisateur) — NON** : la colonne droite n'est pas
modifiée. Motifs : elle remplit déjà la fonction pour l'usage réel (les dossiers
portent la tranche dans leur nom : `techno_1990`, `techno_acid_2020`…), et
étendre le moteur aux années de **fichiers** changerait la sémantique de l'arbre
(EPIC-030 : consulter un dossier sous filtre ne doit jamais masquer un fichier)
pour un gain non demandé. La limite est **documentée, pas cachée** (voir le
tableau ci-dessus et les Notes/Risques de l'EPIC-037).

### 4. Chip collé (CSS `pages/sync.css`)

Même pattern que `#playlist-source` (juste la couche page, aucune variable
nouvelle — règle tokens.css) :

```css
/* Le chip reste visible pendant le scroll de SA colonne (même pattern que
   playlist/years : l'espacement vit DANS le fond peint, padding-top du
   conteneur inchangé). */
#panel-left  > #filter-slot-sync-epars,
#panel-right > #filter-slot-sync-source {
  position: sticky; top: -10px; z-index: 3;   /* -10 = padding du panneau */
  background: var(--bg-panel);
  margin: -10px -10px 8px;   /* couvre le padding latéral : aucune fente */
  padding: 10px 10px 6px;
}
```

Points de vigilance : `#epars-status-line` (compteurs) passe **sous** le chip
une fois scrollé (z-index 3 + fond opaque) ; les `.file-row` n'ont pas de
z-index, elles ne repeignent pas au-dessus ; `.panel-active` garde sa bordure.
Preuve attendue : capture headless (harnais `scripts/capture_ui.py` existant)
chip visible à `scrollTop = max`.

### 5. Clic dans le chip → zéro scroll

Deux verrous (chacun suffit, les deux rendent le comportement robuste) :

```ts
// script.ts — 1) le clic dans le chip n'active pas le panneau
document.getElementById('panel-left')!.onclick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.filter-chip')) return;
  activatePanel('epars');
};

/** 2) idempotent : ne re-focus/re-scroll que si le panneau change. */
function activatePanel(panel: 'epars' | 'source'): void {
  if (state.activePanel !== panel) setActivePanel(panel);
}
```

Variante équivalente si l'on préfère tout centraliser : `setActivePanel(panel,
{ scroll?: boolean })` (paramètre optionnel → zéro appelant impacté, S1).

Test : clic sur `.filter-input` → `scrollTop` de `#epars-container` inchangé
(et `.focused` inchangé) ; clic dans une zone vide d'un panneau **non** actif →
il devient actif (comportement actuel conservé).

### 6. Clavier — `↓` entre dans la liste du scope

Table unique, exportée de `commands/filter.ts` (déjà propriétaire de
`currentFilterScope()`) et consommée par `navigation.ts` :

| scope du chip | conteneur cible | binding |
|---|---|---|
| `sync-epars` | `#epars-container` | `↓` → 1ᵉʳ item rendu |
| `sync-source` | `#source-container` | `↓` → 1ᵉʳ item rendu |
| `playlist-source` | `#playlist-source-container` | `↓` → 1ᵉʳ item rendu |
| `years` | `#years-list` | `↓` → 1ᵉʳ carte |
| `dups` / `playlist-tracks` | — (chip inexistant, EPIC-030 P1) | `↓` → no-op |

- `↓` : `blur()` du chip puis `focusItemByPath(conteneur, state.<focusPath>)`
  — si le chemin mémorisé n'est plus rendu (filtré), `focusItemByPath` retombe
  déjà sur le **premier** item : comportement voulu, focus prévisible.
  `e.preventDefault()` (via le registry) empêche le scroll natif du champ.
- `↑` : **aucun binding** (le caret reste propriétaire) — décision explicite,
  documentée dans la légende.
- `Tab` : conserve la bascule épars ↔ source **en page sync** (convention
  EPIC-031) mais devient **scope-aware** ; sur les autres pages, il rend le
  focus à la liste du scope (plus de focus fantôme sur un panneau masqué).
- `Échap` : inchangé (blur + `hideFilterChip` + `revalidateFocus`).
- La **matrice clavier** (`commands/keyboardMatrix.test.ts`, 78 cellules) et la
  légende générée doivent être re-générées/ajustées (labels `↓`/`Tab`).

## Erreurs & cas limites

| Cas | Comportement attendu |
|---|---|
| Liste filtrée **vide** | `↓` : no-op (le panneau garde affiché « Aucun fichier ne matche ce filtre ») ; pas de saut vers l'autre colonne |
| Terme effacé (✕) | liste restaurée, scroll restauré (`beginRender`/`restore`), focus inchangé |
| Terme composé `flac 1993` | AND conservé : token year-like = année exacte **et** token texte = sous-chaîne |
| Token `0000`, `2999`, `123` | non year-like → comportement texte historique |
| Année taggée `2020` mais nom contenant `1997` | `2020` matche (année) ; `1997` matche (nom) — les deux sont vrais |
| Fichier sans année en sous-dossier `2020_*` | gardé par `2020` (repêchage), mais pas par `2019` |
| Clic dans le chip pendant une lecture audio | aucun effet sur `audio` (hors scope) ; pas de scroll |
| Chip masqué (`F7` ×2) puis `↓` | l'input n'a plus le focus → binding `isFilterInputFocused` inactif, `↓` navigue la liste (comportement actuel) |
| Page Années / Playlist | `↓` cible `#years-list` / `#playlist-source-container` — jamais les panneaux sync masqués |

## Tests

- `static/src/filterEngine.test.ts` — table de vérité C1 (10 cas ci-dessus,
  dont la non-régression `202`/`_schranz`/AND mixte et les 2 cas de
  repêchage « sans année »).
- `static/src/render/eparsUI.test.ts` — sujet complet : `2020` ne garde pas une
  ligne année 1993 en sous-dossier `2020_02_25/` ; compteur du chip (`1/2`).
- `static/src/render/sourceTree.test.ts` — dossier daté `techno_2020` gardé par
  `2020`, `techno_1997` exclu ; mode 📄 : fichier taggé 2020 dans un dossier
  non daté gardé ; invariant « dossier gardé → tous ses fichiers visibles ».
- `static/src/utils.test.ts` — `subjectMatchesTree` (dossier, descendant,
  année de dossier, année de fichier).
- `static/src/filterChip.test.ts` / `integration.test.ts` — `↓` depuis le chip
  épars focus un item de `#epars-container` uniquement ; clic dans l'input →
  `scrollTop` inchangé ; `↓` depuis le chip years → `#years-list`.
- `static/src/commands/keyboardMatrix.test.ts` + `render/legend.test.ts` —
  matrice/légende à jour après changement des bindings `↓`/`Tab`.
- Gate complet : `npm run typecheck`, `npm test`, `npm run lint`,
  `npm run build`, `./venv/bin/python -m pytest -q` (aucun impact backend).
- Preuve live : capture headless chip collé + les chiffres mesurés (`2020` →
  189, `1993` → 127) sur la collection réelle.

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/filterEngine.ts` | Matcher v2 : `isYearLike`, règle « année honnête » |
| `static/src/utils.ts` | `subjectMatchesTree` (arbre : dossier/descendant/année) |
| `static/src/render/sourceTree.ts` | `renderFilteredSource` + `dirHasMatchingFile` → moteur partagé, terme plié |
| `static/src/render/eparsUI.ts` | Aucun changement d'appel (contrôle des chiffres) |
| `static/src/commands/filter.ts` | Export table `scope → conteneur` + `currentFilterScope()` |
| `static/src/commands/navigation.ts` | `↓`/`Tab` du chip : suppression du `setActivePanel` codé en dur |
| `static/src/script.ts` | Click panneau : ignore le chip + idempotent |
| `static/styles/pages/sync.css` | Slots `sync-epars`/`sync-source` collés (z3, fond opaque) |
