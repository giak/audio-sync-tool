# Phase 4 — Mesure de performance et décisions data-driven

> **Date** : 2026-09-19 · **Méthode** : Chrome headless + CDP (`scripts/perf_ui.py`),
> monde synthétique isolé `/tmp/epic036_perf` (5 092 épars + ~510 rangés — l'échelle
> du corpus de l'étude), instruments : PerformanceObserver `longtask` (seuil de
> décision = 50 ms), enveloppe rAF (le rendu passe par le batch de `state.ts`),
> `Performance.getMetrics` (deltas), CPU Profiler (attribution par comptage
> d'échantillons — l'attribution par `timeDeltas` est unusable en headless : deltas
> incohérents avec le temps mural, 14 s de « tâche » pour 2 s de fenêtre).
> Données brutes : `docs/refactoring/phase4/mesures.json`.

## Interactions mesurées (contractuelles, étude §8 P4)

| Interaction | Avant memo¹ | Après memo² | Longtasks³ | Seuil 50 ms |
|---|---|---|---|---|
| A. Rendu initial 5 092 lignes | 1 589 ms | **1 363 ms** | 1 731 ms (1 tâche) | **Dépassé** |
| B. Frappe de filtre (640 lignes filtrées) | 63-68 ms | 52-64 ms | 52-68 ms | Limite |
| C. Re-render après copie (arbre) | 195,7 ms | **102 ms** | 171-192 ms | **Dépassé** |

¹ runs 5-8, corpus durées dégénérées (voir Réserve 1) · ² runs 9-10 (memo `normalizeName`) · ³ entre les deux.

Résultat du profilage (après réalisme des durées, memo posée) :

- **A. rendu initial** : `beginRender`/innerHTML 44,4 % · `(program)` 26,8 % ·
  `makeFileEl` 6,4 % · `levenshtein` 5,6 % · paint 3,4 % · `appendChild` 2,0 % —
  **le coût dominant est la reconstruction DOM complète**, pas la similarité.
- **C. re-render post-copie** : le CPU est à 81 % idle pendant les 2 s de fenêtre ;
  `levenshtein` 6,0 %, `beginRender` 1,9 % — la tâche utile (171 ms mesurée au rAF)
  est courte, l'attribution longtask la couvre.
- Le backend n'est pas le goulot : copie = 14 ms TaskDuration côté page.

## Décision `content-visibility` — **NON APPLIQUÉE**, motif mesuré ET spécifique

1. **Inapplicable par la spec** : nos listes sont de vraies tables
   (`file-table`, `table-layout: fixed` + colgroup, `tr.file-row`) ; `content-visibility`
   s'applique aux éléments pour lesquels la layout containment s'applique —
   **pas aux internal table boxes** (`<tr>`), et sur `<td>` la size containment
   (le mécanisme du saut de rendu) n'a pas d'effet cross-browser
   ([csswg-drafts#7658](https://github.com/w3c/csswg-drafts/issues/7658), résolu :
   spec inchangée). La remédiation « 1 ligne CSS » de l'étude est donc **nulle
   ici**, pas seulement « pas nécessaire ».
2. **Inutile sur le chiffre** : même si elle avait été applicable, le profil du
   rendu initial est dominé par la construction DOM (beginRender 44 % +
   makeFileEl/appendChild ~8 %) et non par le layout/paint (~10 %) — le saut de
   rendu visé par la propriété n'attaque pas le poste dominant. Un re-render
   complet post-copie reste mesuré à **102 ms** après copie : perceptible au
   scroll de l'arbre mais tolérable en flux d'usage (1 copie = 1 re-render).

**Condition de révision** : si le re-render complet post-copie devient une douleur
réelle (> 200 ms durable), la piste mesurée n'est PAS `content-visibility` mais
l'extension du patch en place (`domPatches.ts`) aux lignes épars — décision chiffrée
à refaire à ce moment-là.

## Correctif appliqué (le seul justifié par les chiffres) — mémoïsation `normalizeName`

- Avant memo : `normalizeName` = **14,3-21,9 % du CPU** (profil runs 6-8) — appelée
  par `detectDuplicates` sur les mêmes noms à chaque rendu (NFD + accents + 12
  patterns × 2 passes), et par `refreshDupMatches` après chaque copie.
- Après memo : **0,3-1,3 %**. Gain bout-en-bout réel : rendu initial
  1 589 → 1 363 ms (−14 %), copie 195,7 → 102 ms (−48 %).
- Iso-comportement : fonction pure, 27/27 tests `dupDetect.test.ts` verts,
  gate complet vert (1 120 vitest ×3 graines shuffle, 317 pytest). Cache sans
  borne assumé (corpus réel ≈ 10⁴ noms, entrée ≈ 100 octets).

## Verdict `styleSuggest` — **fermé, « pas de problème » mesuré**

`suggest`/`scoreFromStyles` = **≤ 0,2 %** des échantillons sur toutes les
interactions (seuil d'action posé a priori : > 5 %). La mémoïsation P2 suffisait.
Sujet clos, condition de révision : UI de suggestion repensée (nouvelle boucle de
mesure, nouveau seuil).

## Réserves honnêtes (représentativité du corpus synthétique)

1. **Durées** : les MP3 minimaux ont des durées ~égales → buckets dup-fuzzy
   dégénérés (runs 1-9) → coût similarité surestimé (jusqu'à ~83-95 % du CPU).
   Corrigé au run 10 : durées réalistes **déterministes par nom** (même morceau =
   même durée des deux côtés, jumeaux toujours matchables), distribution 120-420 s.
   Les chiffres « après » reposent sur ce corpus ; un rejouage sur les vraies
   données (EPIC-033-bis) devra confirmer l'ordre de grandeur.
2. **Headless** : machine de CI-like, GPU désactivé — les temps absolus sont
   plafonnés par le CPU ; les rapports entre interactions restent significatifs.
3. **Un seul profil de nommage** : les titres synthétiques sont plus « similaires »
   entre eux qu'un vrai casier (noms répétés par gabarit) — les % similaires sont
   des bornes hautes, pas des moyennes.

## Verdict global (critère de sortie de l'étude)

> « Décision motivée par un nombre, pas une intuition » — fait :
> `content-visibility` **rejetée** sur double motif (spec + profil), le sujet perf
> est **fermé** avec un seul correctif retenu (`normalizeName` mémoïsé, −14 % au
> rendu initial, −48 % au re-render post-copie, iso-comportement prouvé par tests),
> `styleSuggest` fermé par mesure (≤ 0,2 %). Virtual scrolling : toujours exclu
> (YAGNI, §6/§8 de l'étude) — le profil ne montre pas de coût scroll dominant
> (scrollIntoView 0,6-1,2 %).
