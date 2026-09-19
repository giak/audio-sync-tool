# EPIC-036 — Refactoring architecture : dette Phase 0, noyau `core/`, squelette de liste, CSS en couches

> **Statut** : 🟡 **Phase 0 livrée (2026-09-19, `e623dd0`)** — Phases 1-4 en backlog
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

### ⬜ Phase 1 — Noyau `core/` (~1 jour)

Extraire : `core/format.ts` (27 sites `toLocaleString('fr')`), `core/feedback.ts`
(27 sites `statusText`, pattern 3 arguments), `core/subscribe.ts` (4 instanciations
EventEmitter), `core/dom.ts` (helpers). Fraîcheur : simple déplacement + ré-import,
tests d'assertion diff = zéro. Voir étude §Phase 1 pour les signatures.

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
