# EPIC-036 — Refactoring architecture : dette Phase 0, noyau `core/`, squelette de liste, CSS en couches

> **Statut** : 🟡 **Phases 0+1 livrées (2026-09-19, `e623dd0` + `a5e2e08`)** — Phases 2-4 en backlog
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

### ⬜ Phase 2 — Squelette de liste commun (~2-3 jours)

Paramétrer le pattern « liste filtrée + compteur + ligne d'état + sélection »
partagé par eparsUI/sourceTree/playlistUI/yearsUI/dupsUI (6 sites de wipe) :
fonction `buildRow`, prédicat de filtre, hook post-render — **composition, pas
d'héritage**. Fusionner la double passe de filtre `matchesTokens` au passage
(2× → 1× le coût sur 5 092 fichiers).

### ⬜ Phase 3 — CSS en 4 couches (~1-2 jours)

tokens / components / pages / legacy. Réintégrer la décision sur les blocs démo
(consignés en Phase 0) et les 5 vrais positifs PurgeCSS. `npm run audit:css`
comme garde.

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
