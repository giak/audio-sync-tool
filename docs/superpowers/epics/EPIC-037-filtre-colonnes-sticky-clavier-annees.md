# EPIC-037 — Chip de filtre des colonnes : sticky, focus fiable, clavier, années

> **Statut** : 🟢 **Livré (2026-09-21)** — P1 (moteur + épars), P2, P3, P4, P5 livrés et prouvés ; P1 bis (arbre Source Data) **écarté par décision**
> **Créée** : 2026-09-21 · **Dernière mise à jour** : 2026-09-21
> **Priorité** : Haute (friction quotidienne du rangement ; le filtre ment)
> **Docs liées** : [spec `2026-09-21-filtre-colonnes-sync-design.md`](../specs/2026-09-21-filtre-colonnes-sync-design.md) ·
> socles : EPIC-030 (chip universel), EPIC-031 (clavier/registry), EPIC-035 (`path` dans le haystack), EPIC-036 (CSS en couches)

## Objectif

Rendre le chip de filtre des colonnes **utilisable en permanence et prévisible** :
il reste visible au scroll, ne vole plus le scroll au clic, `↓` entre dans la liste
de **sa** colonne, et taper une année donne **les fichiers de cette année** (texte
**et** chiffres, recherche libre, sur les deux colonnes).

## Contexte & découvertes

4 frictions relevées en usage réel le 2026-09-21 ; causes localisées dans le code
et **mesurées** sur la collection réelle (`data/cache.json`, lecture seule) :

1. **Filtre année faux (D1)** — `matchesTokens` (`filterEngine.ts`) teste chaque
   token en sous-chaîne sur un haystack unique `nom + année + codec +
   sous-dossier + genre`. L'épars passe `path` depuis EPIC-035 (sous-dossiers de
   montage **datés**) : `2020` garde **493 lignes dont 333 d'une autre année**
   (2019 ×49 · sans année ×29 · 2018 ×25 · 1994 ×16 · 1996 ×15 · **1993 ×14** ·
   **1997 ×9** · 1995 ×14 · 2015/2017 ×13 …). Les années citées par
   l'utilisateur sont exactement là. Avec la règle proposée : **189** gardées
   (160 année == 2020 + 29 sans année en sous-dossier `2020_*`), `1993` → 127
   (inchangé).
   Côté Source Data (`renderFilteredSource`), le filtre ne compare que **les noms
   de dossiers** — une année de fichier ne peut pas filtrer, et le terme n'est
   même pas plié (accents).
2. **Chip non collé (D2)** — le conteneur scrollable est `.panel`
   (`overflow-y:auto; padding:10px`) ; aucune règle CSS ne vise
   `#filter-slot-sync-epars` / `#filter-slot-sync-source`, alors que le pattern
   existe déjà (playlist-source, years, dups).
3. **Clic → scroll (D3)** — `#panel-left`/`#panel-right` portent
   `onclick = setActivePanel(...)` → `focusItemByPath()` → `scrollIntoView()` ;
   le clic dans l'input du chip bubble jusqu'au panneau. Même effet au `F7`.
4. **`↓` → autre colonne (D4)** — `commands/navigation.ts` : `ArrowDown` +
   `isFilterInputFocused` → `setActivePanel('source')` **codé en dur** (et `Tab`
   → `epars`), sans dépendre du scope du chip ; sur les pages Années/Playlist, ça
   envoie le focus sur des panneaux **masqués**.

**Cause annexe** : `state.activePanel` (qui choisit le chip du `F7`) peut
diverger du focus visuel — la cellule rating (`fileRow.ts`) pose `.focused`
**sans** `setActivePanel`.

## Tâches

### P1 — Filtre « année honnête », texte **et** chiffres, deux colonnes (D1)
- [x] `filterEngine.ts` : `isYearLike(token)` (`^(19|20)\d{2}$`) + règle token
      year-like → année exacte › nom de fichier › sous-dossier **si année
      absente** ; jamais codec/genre ; tokens non year-like **inchangés**
- [x] Tests table de vérité (8 cas, `filterEngine.test.ts`) : `2020` vs année
      1993 en `2020_02_25/…` (❌ après), `2020` année 2020 (✅), `2020` sans
      année en dossier daté (✅), `2020` en nom de fichier (✅), `2020_02`
      (texte, ✅), `_schranz`/`mix`/`202`/`320` (✅ non-régression), AND mixte (✅)
- [x] Épars : **chiffres réels vérifiés** (moteur bundlé esbuild → node sur
      `data/cache.json`, 5 092 fichiers) : `2020` → **189** gardées (contre 493,
      dont 333 d'une autre année — 14 × 1993, 9 × 1997), `1993` → **127**
      (inchangé), `2020_02` → 285 (échappatoire), `_schranz` → **79**
      (== la mesure EPIC-035 de l'AGENT.md : non-régression du filtre par
      sous-dossier). Aucun changement d'appel dans `eparsUI.ts`.
- [x] **P1 bis — arbre Source Data : non retenu** (décision 2026-09-21). La
      colonne droite garde la sémantique EPIC-030 (nom de **dossier** ; fichiers
      en mode 📄) — `utils.ts`/`sourceTree.ts` **non modifiés**. Limite mesurée
      et assumée : le filtre par année n'y vaut que pour les **années-tranches**
      présentes dans les noms de dossiers (`techno_2020` ✓) ; une année réelle
      renvoie 0 dossier — p. ex. `1993` : **59 fichiers taggés 1993, aucun
      visible** (tous en `*_1990`/`*_1995`) ; `2020` : 48 visibles / 18
      invisibles (fichiers 2020 hors dossiers `*_2020`).

### P2 — Chip collé (D2) ✅
- [x] `pages/sync.css` : `#panel-left > #filter-slot-sync-epars` et
      `#panel-right > #filter-slot-sync-source` sticky (`top:-10px`, z3, fond
      `var(--bg-panel)`, marges négatives latérales couvrant le padding) — même
      pattern que `#playlist-source` ; **pas** de marge négative en haut (la
      ligne d'état épars reste intacte au repos — écart assumé vs le plan, qui
      prévoyait `margin: -10px -10px 8px`, cf. As-built)
- [x] Empilement vérifié en live : `#epars-status-line` passe sous le chip,
      z-index 3 au-dessus des `.file-row` (aucune règle de positon concurrente)
- [x] Preuve : `scripts/proof_filter_chip.py` (harnais headless dédié, monde
      isolé + corpus gonflé) — slot à 68 px du haut au repos → **collé à 1 px**
      après 1 141 px de scroll, 1ʳᵉ ligne à −1 004 px (le contenu défile
      derrière) ; **contrôle** sticky désactivé → −1 073 px (la mesure est
      sensible au CSS, elle ne passe pas par accident)

### P3 — Clic dans le champ = zéro scroll (D3) ✅
- [x] `script.ts` : le handler de panneau ignore les clics issus de
      `.filter-chip` **ou** d'un slot `[id^="filter-slot-"]` (écart assumé : la
      variante « idempotent » a été écartée — elle aurait supprimé la
      restauration du focus au clic sur le fond d'un panneau déjà actif)
- [x] `commands/filter.ts` : `ensurePanelActiveMarker()` — `F7`/`/` ne
      rappellent plus `setActivePanel` quand le panneau est déjà marqué
      (`panel-active`) : c'était l'autre chemin du scroll parasite (le même
      `scrollIntoView`)
- [x] Test : clic sur `.filter-input` → panneau inchangé + `scrollIntoView`
      jamais appelé (`integration.test.ts`) ; **vérifié par mutation** (garde
      neutralisée → le test échoue : `activePanel` bascule en `epars`) ; clic
      hors chip (ligne d'état) → le scroll du panneau reste vivant (contrôle
      headless : 200 → 113 px)

### P4 — Clavier `↓`/`Tab` scope-aware (D4) ✅
- [x] `render/filterChip.ts` : `currentFilterScope()` **déplacé** ici (couche
      liste — il était dans `commands/filter.ts`) + `filterScopeContainer(scope)`
      (`sync-epars`→`#epars-container`, `sync-source`→`#source-container`,
      `playlist-source`→`#playlist-source-container`,
      `playlist-tracks`→`#playlist-panel`, `years`→`#years-list`,
      `dups`→`#dups-list`). Écart vs le plan : la table vit dans filterChip
      (et non filter.ts) pour éviter que `navigation.ts` importe `filter.ts` —
      ce qui aurait rebattu l'ordre d'enregistrement du registry (conditions
      des cellules de la matrice).
- [x] `commands/navigation.ts` : `↓` = blur + entrée dans la liste **de la
      colonne du chip** (`focusItemByPath` : chemin mémorisé sinon 1ᵉʳ item,
      no-op si non rendue) ; `Tab` = bascule épars ↔ source **symétrique** en
      page sync, sinon rend le focus à la liste du scope ; `setActivePanel(...)`
      codés en dur supprimés ; `↑` toujours volontairement non bindé ;
      **conditions de binding inchangées** (l’index de la matrice ne bouge pas)
- [x] Tests : `navigation.test.ts` ×6 (épars → `#epars-container` ; source →
      `#source-container` ; page Années → blur sans panneau fantôme ;
      Tab épars → `source`, Tab source → `epars`, Tab hors sync → liste) ;
      cellules de matrice réécrites (« ↓ : aucun changement de panneau »,
      « Tab : colonne voisine ») ; légende régénérée (labels)

### P5 — Garde-fous de non-régression ✅
- [x] Matrice clavier (99 tests verts — 2 cellules re-caractérisées, index stables)
      et bijection de la légende générée vertes
- [x] Gate complet front (typecheck/vitest/lint/build) + pytest inchangé

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/filterEngine.ts` | **P1 livré** : `isYearLike` + règle « année honnête » |
| `static/src/filterEngine.test.ts` | **P1 livré** : table de vérité (8 cas, dont non-régression `_schranz`/`202`/`320`) |
| `static/src/utils.ts` | **Non modifié** — P1 bis écarté (décision 2026-09-21) |
| `static/src/render/sourceTree.ts` | **Non modifié** — P1 bis écarté (décision 2026-09-21) |
| `static/src/render/eparsUI.ts` | Contrôle des chiffres (pas de changement d'appel attendu) |
| `static/src/commands/filter.ts` | **P3 livré** : `ensurePanelActiveMarker()` · importe `currentFilterScope` (P4) |
| `static/src/render/filterChip.ts` | **P4 livré** : `currentFilterScope()` + `filterScopeContainer()` |
| `static/src/commands/navigation.ts` | **P4 livré** : `↓`/`Tab` du chip — liste du scope, plus de `setActivePanel` codé en dur |
| `static/src/commands/navigation.test.ts` | **P4 livré** : 6 tests (scopes, pages, Tab symétrique) |
| `static/src/commands/keyboardMatrix.test.ts` | **P4 livré** : 2 cellules re-caractérisées + mock enrichi (`currentFilterScope` réel) |
| `static/src/script.ts` | **P3 livré** : handler de clic des panneaux — ignore le chip et son slot |
| `static/styles/pages/sync.css` | **P2 livré** : slots `sync-epars`/`sync-source` collés |
| `static/src/integration.test.ts` | **P3 livré** : clic dans le chip → panneau/scroll inchangés |
| `scripts/proof_filter_chip.py` | **Preuve headless P2+P3** (monde isolé, sticky + clic réel CDP, contrôles) |
| `render/legend.test.ts` | Bijection légende ↔ bindings (labels P4) |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0 erreur (2026-09-21, P2+P3)
- [x] Tests frontend (`npm test`) — **1 133 verts** (50 fichiers ; +1 test P3, +8 tests P1)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **317 verts** (inchangé)
- [x] Lint (`npm run lint`) — 0 erreur (108 fichiers)
- [x] Build (`npm run build`) — OK (`validate-build` vert)
- [x] Preuve headless P2+P3 : `4/4` (`scripts/proof_filter_chip.py`, captures
      `/tmp/epic037_proof/{8-chip-scrolled,9-chip-clicked}.png`)
- [x] Preuve P1 : `2020` → **189** / `1993` → **127** mesurés sur la collection
      réelle (`data/cache.json`, moteur compilé) — cf. As-built
- [x] Preuve headless P4 : `↓` RÉEL (CDP `Input.dispatchKeyEvent`) dans le champ →
      focus sur `epars-dir:…` dans `#epars-container`, `#source-container` vierge,
      colonne gauche active — **5/5** vérifications du harnais

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _à venir_ | _P1 moteur (2026-09-21 : `filterEngine.ts` + tests) · P2+P3 (`sync.css`, `script.ts`, `commands/filter.ts`, `integration.test.ts`, `scripts/proof_filter_chip.py`)_ |

## As-built (2026-09-21, P1 moteur + P2 + P3 + P4)

### P1 — filtre « année honnête » (moteur + colonne épars)

Vérification sur la collection réelle (moteur `filterEngine.ts` bundlé par
`esbuild` → `node` sur `data/cache.json`, lecture seule ; épars = 5 092) :

| terme | gardées (après) | gardées (avant) | année ≠ terme |
|---|---|---|---|
| `2020` | **189** | 493 | 29 (fichiers **sans** année en sous-dossier `2020_*` — repêchage voulu) |
| `1993` | **127** | 127 | 0 |
| `2020_02` | 285 | 285 | 285 (token non year-like → texte, échappatoire) |
| `_schranz` | **79** | 79 | — (== mesure EPIC-035 de l'AGENT.md) |

Écart assumé vs le plan : le plan visait 189 = 160 (année exacte) + 29 (sans
année en dossier daté) + 0 (nom) — **exactement** la mesure obtenue.

### P2 + P3 — chip collé & clic sans scroll

Preuve headless (`python3 scripts/proof_filter_chip.py`) — monde synthétique isolé
(68 fichiers épars), Chrome headless 1280×600, mesures DOM + clic réel CDP :

```
P2 sticky ON              : scroll max 1141px · slot à repos 68px · collé 1px · 1ʳᵉ ligne -1004px
P2 contrôle (sticky OFF)  : slot -1073px — la mesure détecte bien l'absence de sticky
P3 clic réel dans le chip : champ visible True (y=82) · scrollTop 200 → 200 · focus champ True
P3 contrôle (hors chip)   : scrollTop 200 → 113 — le scroll du panneau reste vivant
P4 ↓ RÉEL dans le champ   : focus 'epars-dir:…' (#epars-container) · source vierge · colonne gauche active
✅ 5/5 vérifications passées
```

Écarts vs le plan, assumés et justifiés :

1. **Pas de marge négative en haut** sur le slot (`-10px` seulement en latéral) :
   la version du plan (`margin: -10px -10px 8px`) chevauchait la ligne d'état
   épars **au repos** (elle a `margin-bottom: 6px`). Le `top: -10px` suffit :
   la mesure donne le slot à 1 px du haut du panneau — à ras, sans chevauchement
   à l'arrêt.
2. **Clic de panneau** : la garde idempotente (`if (state.activePanel === panel)
   return`) a été écartée — elle supprimait la restauration du focus au clic sur
   le fond d'un panneau déjà actif. Une seule garde : « clic issu du chip ou de
   son slot → ne rien faire ».
3. **Le second chemin du scroll parasite** (`F7`/`/` → `focusCurrentChip()` →
   `setActivePanel(st.activePanel)` → `scrollIntoView`) est corrigé par
   `ensurePanelActiveMarker()` : le marqueur `panel-active` est vérifié avant
   tout rappel de `setActivePanel`.

Le test vitest P3 a été **validé par mutation** (neutralisation de la garde →
échec observé : `activePanel` bascule de `source` à `epars`), ce qui prouve
qu'il ne passe pas à vide ; les contrôles headless jouent le même rôle côté P2.

### P4 — clavier `↓` scope-aware

- `currentFilterScope()`/`filterScopeContainer()` vivent dans **filterChip.ts**
  (couche liste) et non dans `commands/filter.ts` : `navigation.ts` les importe
  sans importer `filter.ts`, ce qui garde l'**ordre d'enregistrement du registry
  intact** (les index de la matrice clavier ne bougent pas).
- Effet mesuré en headless (`Input.dispatchKeyEvent` ArrowDown réel dans le
  champ) : le focus quitte le champ et atterrit sur `epars-dir:<épars>` dans
  `#epars-container` ; `#source-container` ne reçoit **aucun** `.focused` — la
  régression d'origine (saut vers la colonne droite) est bien morte.
- `Tab` devient **symétrique** en page sync (épars → source, source → épars) et
  rend le focus à la liste du scope sur les autres pages ; hors page sync, plus
  aucun focus jeté sur un panneau sync masqué (test dédié, page Années).
- `↑` reste volontairement non bindé dans le champ (le caret est propriétaire).

## Décisions

- **P1 bis (arbre Source Data) écarté** (décision utilisateur 2026-09-21) : le
  filtre de la colonne droite fonctionne déjà pour l'usage réel (les dossiers
  portent la tranche : `techno_1990`, `techno_acid_2020`…) ; étendre le moteur
  aux années de **fichiers** changerait la sémantique de l'arbre (EPIC-030) pour
  un gain non demandé. Limite documentée, pas cachée : `1993` → 0 dossier côté
  droit (59 fichiers taggés 1993 invisibles), `2020` → 18 fichiers invisibles.
  Si le besoin revient (vouloir une année réelle à droite), la spec §3 contient
  le design prêt à reprendre.
- **Recherche libre, pas de syntaxe** (décision utilisateur 2026-09-21) :
  « colonne de gauche ou droite, la recherche est libre, cela peut être du texte
  ou des chiffres » → heuristique 4 chiffres = année, **pas** de jetons qualifiés
  `year:`/`path:`.
- **Perte assumée** : un dossier daté dont les fichiers sont taggés d'une autre
  année n'est plus trouvé par l'année seule (304 lignes sur la collection) —
  échappatoire : préfixe non year-like (`2020_02`).
- **Le nom de fichier reste souverain** : `Live 2020.mp3` taggé 2019 matche
  toujours `2020` (le token est du texte explicite).
- **Le pattern sticky existant est réutilisé** (playlist/years/dups), aucune
  variable CSS nouvelle (règle EPIC-036 tokens.css).

## Notes / Risques

- **R1** — *(écarté avec P1 bis)* Le filtre de la colonne Source Data reste un
  filtre par **nom de dossier** : une année réelle absente des noms de dossiers
  ne renvoie rien (mesuré : `1993` → 0 dossiers / 59 fichiers taggés 1993).
  Comportement assumé (décision 2026-09-21), à rouvrir via la spec §3 si besoin.
- **R2** — La divergence `.focused` ↔ `state.activePanel` (cellule rating) n'est
  traitée qu'en surface (P3) ; si elle se reproduit, la rendre structurelle
  (une seule fonction de focus) devra passer par une EPIC dédiée (EPIC-031).
- **R3** — Les chips Dupliqués et `playlist-tracks` restent absents (EPIC-030
  P1) : la table `scope → conteneur` doit tolérer leur absence (no-op).
- **R4** — `twinUnderFilteredDir` (EPIC-034, pastille « déjà rangé ») repose sur
  la sémantique dossiers/fichiers : toute extension du filtre d'arbre doit être
  répercutée pour que la pastille reste honnête (le jumeau doit rester
  **consultable**).
