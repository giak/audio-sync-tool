# EPIC-036 — Refactoring architecture : dette Phase 0, noyau `core/`, squelette de liste, CSS en couches

> **Statut** : 🟡 **Phases 0+1+2+3 livrées (2026-09-19, `e623dd0` + `a5e2e08` + `30f9400` + `b60d8dc`)** — Phase 4 en backlog
> **Créée** : 2026-09-19 · **Dernière mise à jour** : 2026-09-19
> **Priorité** : Moyenne (dette mesurée, pas urgente ; chaque phase découle de la mesure, pas de l'intuition)
> **Docs liées** : **étude complète** `docs/refactoring/2026-09-19-refactoring-architecture.md` (mesures, verdicts, plan 5 phases, refus argumentés, annexes honnêteté)

## Objectif

_Réduire la duplication mesurée (~450-550 LOC, 4-5 %) et sécuriser le gate (flaky,
listeners, CSS mort) **sans réécriture** : strangler fig par modules, une phase =
un lot de commits, chaque phase avec critère de sortie mesuré. Verdict de l'étude :
**pas de framework** (10 425 LOC hors tests, ratio tests/code 1,7 — le plus gros
actif du projet est sa suite ; une migration la détruirait)._

## Contexte & découvertes (mesures du 2026-09-19)

- 10 425 LOC TS hors tests · 17 417 LOC de tests (ratio 1,7) · 46 fichiers de test · 1 095 tests.
- Duplication réelle : pattern « wipe de liste de page » **6 sites**, tri volume+alpha **2 sites**, 27 `toLocaleString('fr')`, 27 sites `statusText`… → ~450-550 LOC factorisables.
- Flaky **reproduit** puis **expliqué** : `state.filters` (état module) fuyait entre tests dans `sourceTree.test.ts` et `yearsUI.test.ts`.
- 45 `addEventListener` / 1 `remove` : audit ciblé des 7 sites `document`/`window` → **zéro fuite réelle**.
- Classes CSS : le grep est inutilisable (template literals) ; PurgeCSS donne 5 vrais positifs sur les toggles dynamiques — outil + vérification manuelle obligatoires.

## Phases

### ✅ Phase 0 — Dette urgente (2026-09-19, commit `e623dd0`)

1. ✅ **Flaky corrigés** : `state.filters = {}` dans les `beforeEach` de
   `sourceTree.test.ts` et `yearsUI.test.ts` (le second flaky n'était **pas**
   dans l'étude : révélé par le shuffle global). 5 graines × 1 095 verts.
   Root cause documentée dans les deux fichiers (commentaires).
2. ✅ **Gate shuffle reproductible** : CI ajoutant `test:shuffle:gate` (3 graines
   fixes 1/2/3) en complément de la graine aléatoire existante (2026-08-08).
   Précision honnête : la CI **shufflait déjà** — l'étude disait « le gate ne
   shuffle pas », c'était imprécis ; le vrai manque était la reproductibilité
   (un échec en graine aléatoire n'est pas rejouable → le flaky de sourceTree
   est passé inaperçu 6 semaines).
3. ✅ **Audit listeners** (7 sites `document`/`window`) : **aucune fuite** —
   singletons vie-app (`ui.ts:40`, `cueEditor:972/977`, `script.ts:75/135`),
   `{once:true}` (`ui.ts:257`), apparié add/remove (`stylePalette.ts:232` ↔
   `closeStylePalette`). Les 45/1 restants = `onclick=` sur nœuds éphémères.
   Constat consigné, aucune correction nécessaire.
4. ✅ **Classes CSS mortes tranchées** : `scripts/audit-css.mjs`
   (`npm run audit:css`, PurgeCSS, rapport seul — aucune suppression auto).
   Première passe sans `templates/index.html` → 30 candidates **erronées**
   (leçon : le HTML vit dans `templates/`, pas `static/`). Passe corrigée :
   9 candidates → vérification manuelle ligne à ligne → **1 seul bloc mort
   confirmé** : l'ancienne table doublons (`.dups-table/.dup-row/.dup-verdict/
   .dup-meta`, intro `731cc24`, remplacée par les cartes v2 jamais nettoyées) —
   21 lignes supprimées. Les 5 vrais positifs de l'outil (`classList.toggle`
   dynamiques cueEditor/script) et les blocs démo (annexe D de l'étude) sont
   **consignés, non supprimés** — décision à la phase CSS. Post-nettoyage :
   « Aucune classe morte détectée ».

**Critère de sortie atteint** : gate shuffle-proof (3 graines fixes en CI),
zéro listener suspect non tracé, CSS mort tranché par outil + main.

### ✅ Phase 1 — Noyau `core/` (2026-09-19, commit `a5e2e08`)

1. ✅ **`core/format.ts`** : `fmtCount` (27 sites `toLocaleString('fr')` → 0 restant,
   9 fichiers), `plural` (remplace le doublon local de `stylePreview.ts`, sorties
   identiques), `byCountThenId` (2 sites : `styles.ts` + `stylePalette.ts`).
2. ✅ **`core/feedback.ts`** : `setStatus` — 0 accès direct `#status-text` hors core.
   **Découverte** : `yearsUI.ts` avait sa propre réimplémentation locale de `setStatus`
   (contrat identique, non comptée dans les 27 de l'étude) — supprimée, unifiée via core.
   `cueEditor` **exclu volontairement** : son `setStatus` local est slot-scopé
   (`statusEl()`, 33 appels) — cible différente, pas le même canal.
3. ✅ **`core/subscribe.ts`** : `subscribeVisible(event, containerId, render)` — les 6
   gardes `hidden` de `setupRenderSubscriptions` (render.ts) en un seul point commenté.
4. ✅ **`core/dom.ts`** : `beginRender(container) → restore(el)` (signature différente
   du `renderList(container, build)` de l'étude : moins invasif, le build reste dans
   la page). Migrés : les **3 sites** avec save/restore complet (epars, source,
   playlist-tracks — la variante playlist à assignation directe incluse).
   **Écart assumé** : les 3 wipes SANS restore (playlist-source, years, dups) ne
   migrent pas en P1 — les convertir ajoutait un comportement nouveau (restore d'un
   scroll jamais sauvé) → Phase 2 avec le squelette de liste, iso-comportement respecté.
5. ✅ **22 tests core nouveaux** (format 9, feedback 3, subscribe 5, dom 5) —
   **0 test existant modifié** (critère « diff zéro » tenu).
6. ✅ **Doc dev** : `static/src/README.md` (contrats + règle d'extraction + exemple),
   `AGENT.md` `%ARCHITECTURE.core`.

**Gate P1** : typecheck 0 · lint 0 · **1 117 vitest** (+22) · 3 graines shuffle ·
build OK · **317 pytest**.
**Écart consigné** : `wc -l` net **+22** hors tests (10 425 → 10 447) — la suppression
nette sur fichiers existants est −39 (−161/+122) mais les 4 modules (93 LOC) + doc
la dépassent. Le critère « net négatif » de l'étude est atteignable en Phase 2
(squelette de liste, −40 à −60 LOC annoncés) ; le gain P1 est la déduplication
(0 site restant) et le contrat testé, pas le volume.

### ✅ Phase 2 — Squelette de liste commun (2026-09-19, commit `30f9400`)

1. ✅ **Double passe de filtre fusionnée** (`eparsUI.ts`) : le compteur du chip est
   dérivé de la passe de rendu — **1 appel `matchesTokens` par fichier** (preuve grep
   commitée : 1 site dans `renderEpars`). Coût de filtrage divisé par 2 sur 5 092 fichiers.
2. ✅ **Squelette d'arbre partagé** (`sourceTree.ts`) : `buildSourceTrees` (construction
   arbre + compte total) + `finishSourcePanel` (compteur d'en-tête + bandeau vide) — le
   bloc dupliqué **au caractère près** entre `renderSource` et `renderPlaylistSource`
   vit à un seul endroit ; types locaux morts de `playlistUI.ts` supprimés.
   Forme livrée : 2 fonctions paramétrées par scope/toggle (composition), PAS un
   `buildList` générique à callbacks — le bloc réel partagé était arbre+compteur, pas
   le rendu des lignes (chaque page a ses lignes propres, les généraliser aurait
   été une abstraction anticipée).
3. ✅ **6ᵉ wipe de page sur `beginRender`** : years, dups + playlist-source adoptent
   le wipe centralisé (preuve : ni years ni dups ne lit `scrollTop`, le scroll passe
   par `scrollIntoView` sur focus clavier → iso-comportement) ; playlist-source gagne
   le save/restore scroll (panneau non-scrollable, no-op en pratique).
4. ✅ **`appendPanelEmpty`** (core/dom.ts) : 5 créations `div.panel-empty` unifiées
   (epars ×2, source ×2, playlist-source) + 3 tests.
5. ✅ **Verdict `domPatches.ts` : CONSERVÉ** — patch en place du statut/compteurs +
   insertion ciblée via `sourceNodeMap` reste moins cher qu'un re-render complet
   (5 092 lignes) après chaque copie ; le squelette ne change pas ce modèle.

**Critère de sortie — atteint** : double passe disparue (1 appel/fichier, preuve
commitée) ; `wc -l` net **−34** (10 447 → 10 413, critère « net négatif » de l'étude
atteint ici) ; matrice clavier + suite complète vertes (1 120 vitest, shuffle ×3,
317 pytest). Les 5 pages consomment le squelette là où le code était réellement
dupliqué (arbres ×2, vides ×5, wipes ×6) sans dénaturer leurs différences.

### ✅ Phase 3 — CSS en couches, bundlé par esbuild (2026-09-19, commit `b60d8dc`)

1. ✅ **Découpage mécanique prouvé** : `static/style.css` (1 500 lignes, 411 règles)
   → `static/styles/` : `tokens.css` (37) · `base.css` (31) · `components.css`
   (295 : toast+badge, filter-chip, modal, config form, legend, journal, dialog,
   panel-empty) · `pages/` sync (280), dups (114), years (92), sync-main (153),
   playlist (167), overlays (31), cue-editor (295) + `index.css` agrégateur.
   **Écart de forme assumé vs « 4 couches » de l'étude** : 7 fichiers pages,
   car l'ordre original rend le découpage 5-pages impossible sans inversions
   de cascade (dups/years intercalés **entre les deux moitiés** de sync ;
   Context Menu/D&D **après** playlist) → sync coupé en `sync`+`sync-main`,
   overlays séparé ; l'ordre des `@import` = ordre original exact.
2. ✅ **Équivalence de cascade prouvée** (`scripts/check_css_equiv.py`) :
   multiset + ordre relatif des règles (410=410), aux 3 transformations
   documentées près : `--led-amber` dupliqué résolu (cascade gardait déjà
   `#ffcc00`) · `.years-section` dupliquée à l'identique (l.478/l.496) →
   collapse sans effet · fallback `var(--text-secondary, #999)` retiré
   (la variable existe). **Verdict boîtes** : PAS de classe de base commune
   modal/palette/toast — couleurs/ombres intentionnellement différentes,
   une base exigerait du re-theming par instance (YAGNI) ; l'extraction
   réelle est le regroupement des familles dans `components.css`.
3. ✅ **Câblage build** : `script.ts` importe `pages/index.css` → esbuild émet
   `static/dist/script.css` (minifié 38 Ko) ; cache-buster `app.py` couvre
   `script.js`+`script.css` ; `templates/index.html` → `/static/dist/script.css` ;
   test cache-buster adapté (mtime du bundle) ; `globals.d.ts`
   (`declare module '*.css'`) pour TS2882 ; `style.css` supprimé.
4. ✅ **Décisions reportées de P0 tranchées** : blocs démo (`led-demo`,
   `twin-demo`, `badge-demo`, `modal-xl`) **vivants** (légende `index.html`)
   → conservés ; les 5 positifs PurgeCSS (`classList.toggle` dynamiques)
   confirmés vivants → conservés. `audit-css.mjs` porté sur les couches **et
   corrigé** : PurgeCSS renvoie 1 résultat par fichier — l'ancien
   `const [res]` ne voyait que `tokens.css` (184/186 fausses candidates) ;
   verdict post-correctif : « Aucune classe morte détectée ».
5. ✅ **Preuve rendu** (`scripts/capture_ui.py`, réutilisable) : Chrome headless
   + CDP, monde de capture isolé (chemin FIXE `/tmp/epic036_capture`, scan avant
   navigation, ports éphémères, garde anti-zombie), animations/transitions/caret
   gelées, sonde DOM (`CAPTURE_PROBE=1`). **2 causes de non-déterminisme trouvées
   par diff** et éliminées : `twinPulse` (LED, 2,4 s infini) et le suffixe
   `mkdtemp` affiché dans les inputs `cfg-source`/`cfg-epars`. Résultat :
   **7 captures AVANT/APRÈS → 0 pixel de différence, SHA256 identiques
   byte-à-byte** (`docs/refactoring/phase3/{before,after}/` + `*.sha256`).
6. ℹ️ **Consigné, non changé** : `var(--border)` utilisé 4× **sans définition**
   (computed = `currentColor` par invalidation) — le définir changerait le
   rendu ; à trancher lors d'une retouche visuelle de ces éléments.
   `var(--bg-elevated, #1e2430)` : variable inexistante mais fallback porteur
   (= comportement actuel) → conservé.

**Critère de sortie atteint** : CSS importé par esbuild (1 entry agrégé,
11 imports dans l'ordre de cascade original) · 0 duplication de tokens
(les 2 doublons résolus) · captures avant/après vérifiées (0 px).
**Gate P3** : typecheck 0 · lint 0 · vitest 1 120 (×3 graines shuffle) ·
build + validation OK · pytest 317.

### ⬜ Phase 4 — Performance mesurée (~1 jour)

Profilage Chrome réel (5 092 lignes, re-render arbre) → `content-visibility`
uniquement si > 50 ms mesurés. Décision chiffrée, pas d'optimisation aveugle.

## Critères de réussite globaux

- Gate inchangé + 3 graines fixes : **vert en continu** (atteint Phase 0).
- Zéro changement comportemental (les 1 095 tests jsdom + 317 pytest ne changent pas).
- Duplication : chaque extraction justifiée par un site-count ≥ 3 (sauf tri 2 sites, une ligne).
- Docs : le fichier d'étude est la référence ; chaque phase coche ici + annexe as-built dans l'étude.

## Ce qu'on ne fera PAS (verdicts de l'étude, datés)

- **Framework** (React/Vue/Svelte/HTMX) — condition de révision : UI > 15 kLOC ou besoin de réactivité fine non couverte par l'EventEmitter.
- **Web Components/Shadow DOM** — casse jsdom ; révision si abandon des tests DOM.
- **Virtual scrolling** — si Phase 4 ne mesure pas de problème.
- **Refactor cueEditor** (1 701 LOC) — isolé, YAGNI ; révision si couplage mesuré.
