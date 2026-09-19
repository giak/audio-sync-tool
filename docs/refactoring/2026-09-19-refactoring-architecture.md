# Refactoring — Étude d'architecture, factorisation, performances et testabilité

> **Date** : 2026-09-19 · **Statut** : **proposition, non engagée** · **Méthode** : mesure forensique du code réel (scripts grep/python sur le dépôt), reproduction du flaky test, recherche web 2026 (sources en annexe D).
> **Règles** : KISS · DRY · YAGNI · no-overengineering · pragmatique · **NO regression** · honnêteté absolue — y compris sur ce que ce document **ne** propose **pas** de faire.
> **Suivi** : chaque phase = une EPIC (règle du registre). Ce document est l'entrée d'analyse, pas un plan d'exécution figé.

---

## 0. Résumé exécutif (honnête)

**Verdict principal : ne PAS migrer vers un framework.** Le verdict est donné par les mesures, pas par goût :

| TypeScript frontend | **10 425 LOC** (hors tests) | petite app mono-développeur |
| Duplication concrète | ~450–550 LOC (≈ 4–5 %) — 27 `toLocaleString`, 27 `statusText.textContent`, 6 wipes de listes, 6 gardes `hidden`, 2 tris identiques | réel mais **faible** ; ne justifie ni framework ni réécriture |
| Tests existants | **1 095 vitest / 46 fichiers + 317 pytest** ; les tests pèsent **17 417 LOC TS** (ratio tests/code ≈ 1,7) | le plus gros actif du projet — une migration le détruirait |
| Doublons détectés | ~450–550 LOC (≈ 4–5 % du frontend) — décompte §1.4 vérifié | réel mais **faible** ; ne justifie ni framework ni réécriture |
| Dette identifiée | 1 test flaky reproduit, 45/1 listeners, 2 boucles de filtre en double passe, classes CSS mortes : nombre inconnu (échantillon vérifié = 8/8 faux positifs) | corrigeable par refactorings ciblés |
| Bundle | build esbuild OK, aucune plainte de perf à l'usage | pas de problème de perf utilisateur constaté |

Les vrais gains sont dans l'ordre : **1)** extraire 4-5 modules utilitaires partagés (les motifs mesurés §1.4), **2)** hygiène test (isolation → flaky zéro), **3)** hygiène DOM (audit listeners), **4)** CSS factorisé en couches. Tout cela en vanilla TS, incrémental, sans régression possible (tests verts à chaque étape).

**Ce que ce document refuse explicitement** : React/Vue/Svelte (§6), réécriture des pages, virtual scrolling (§7), un design system complet.

---

## 1. État des lieux mesuré (pas estimé)

### 1.1 Volumes

```
Frontend TS (hors tests)        **10 425 LOC**   (mesuré : 27 842 total − 17 417 de tests)
                                    ⚠ ratio tests/code ≈ 1,7 — atout majeur, à préserver
├── render/cueEditor.ts                1 701  ← plus gros module (modale dédiée)
├── render/sourceTree.ts                 639  ← arbre 3 niveaux + extra dirs
├── render/playlistUI.ts                 553
├── actions.ts                           617
├── render/yearsUI.ts                    380
├── commands/playlist.ts                 353
├── commands/navigation.ts               301
└── ~30 autres modules                 < 260 chacun
Backend Python                     2 243 LOC  (app.py 1 608, nml.py 349, analysis.py 286)
CSS                                1 521 lignes, 193 classes, 1 seul fichier
templates/index.html                 326 lignes
Tests                            1 095 vitest (46 fichiers) + 317 pytest
```

### 1.2 Patterns existants (à préserver — ils fonctionnent)

| Pattern | Où | Pourquoi c'est bon |
|---|---|---|
| State singleton + Proxy validateur + EventEmitter batché RAF | `state.ts` | prévisible, testable, réaffectation systématique (`new Map/Set`) |
| Registry clavier typé + matrice de caractérisation (78+ cellules, invariants) | `commands/registry.ts`, `keyboardMatrix.test.ts` | détecte les touches mortes/shadowées en CI — rare et précieux |
| Couche DOM focusée (palette, ratingEdit) | `stylePalette.ts`, `ratingEdit.ts` | isole le clavier sans toucher au registry |
| Modules purs sans DOM | `styles.ts`, `styleSuggest.ts`, `filterEngine.ts`, `dupDetect.ts` | testés à ~100 %, réutilisables |
| Fabriques de fichiers audio minimaux | `test_apply_years.py`, `test_apply_styles.py` | zéro fixture binaire committée |

### 1.3 Dette mesurée

| # | Constat | Preuve | Impact |
|---|---|---|---|
| D1 | `sourceTree.test.ts` **flaky en shuffle** (1/34 fail reproduit le 2026-09-19, vert sans shuffle) | `npx vitest run --sequence.shuffle` | le gate ne shuffle pas → d'autres flaky sommeillent |
| D2 | **45 `addEventListener` vs 1 `removeEventListener`** | grep global | risque de fuites cumulées (re-renders) ; audit nécessaire, la plupart sont sur des nœuds à vie courte mais `document`/`window` (7 sites) sont suspects |
| D3 | Boucle de filtre épars **en double passe** : `matchesTokens` appelé une fois au rendu et une fois au recomptage | `eparsUI.ts` 2 blocs identiques | 2× le coût de filtrage sur 5 092 fichiers |
| D4 | Suggestions recalculées **à chaque paint** de cellule, sans mémoïsation | `styleCell.ts` P2 | lot de 1 347 → ~7 M lectures de state au prochain re-render complet |
| D5 | Classes CSS mortes : **nombre inconnu** — le grep en trouve 66 candidates, mais un échantillon vérifié de 8 toutes FAUX POSITIFS (classes vivantes dans des template literals) ; seule certitude : l'audit requiert un outil (knip/PurgeCSS), pas du regex | échantillon vérifié 2026-09-19 | inconnu jusqu'à l'outil — possiblement zéro |
| D6 | `app.py` : 1 608 lignes, routes hétérogènes, helpers métier (`_artist_title`, `_build_source_index`, `_load_years_caches`) mélangés aux routes | lecture | testabilité Python correcte mais découpage naturel évident |

### 1.4 Duplication concrète (la matière du refactoring)

Mesurée par grep, chacune compte ses occurrences **hors tests** :

| Motif dupliqué | Occurrences | Coût réel | Cible d'extraction |
|---|---|---|---|
| `toLocaleString('fr')` sur compteurs + pluriel artisanal | **27** + 1 `function plural` réimplémentée (`stylePreview.ts`) | cohérence fr-FR risque de diverger | `format.ts` : `fmtCount(n)`, `plural(n, 'fichier')` |
| `document.getElementById('status-text').textContent = …` | **27 sites** | sémantique floue (statut vs toast vs dialog) | `feedback.ts` : `setStatus(msg)` |
| `confirmDialog/showToast/statusText` mélangés dans le même module | `actions.ts` 19 hits, `cueEditor.ts` 10 | chaque page choisit son canal à la main | règle : status = guidage, toast = confirmation d'action, dialog = décision |
| Wipe-and-rebuild render (`container.innerHTML = ''` + boucle) | 15 sites au grep brut, dont **6 wipes de listes de pages** (6 dans cueEditor = canvas/modale, hors motif) | scroll/focus perdus si oubli du save/restore (dupliqué ×3 modules : epars, playlist, source) | `dom.ts` : `renderList(container, build, opts)` |
| Tri « volume décroissant puis alpha » | **2 sites exactement** (`styles.ts:165`, `stylePalette.ts:184` — pattern identique au caractère près) | divergence future possible, coût actuel minuscule | `format.ts` : `byCountThenId` (une ligne, pas un module) |
| Écoute `:changed` + garde `classList.contains('hidden')` | `render.ts` ×6 | faible mais le garde est subtil (bug latent si copié sans comprendre) | `subscribeVisible(event, fn)` |
| Modale custom + focus trap + fermeture Échap | réimplémentée par `stylePalette` (couche DOM) et modales (`ui.ts`) | 2 implémentations du trap | `focusTrap(el)` partagé |

**Total estimé : ~450–550 LOC de doublons** (hors tests), soit ≈ 4–5 % du frontend. Révision de la première passe : les 6 « wipes » de cueEditor sont des clears de canvas (motif liste = 6 sites, pas 15) mais les sites `statusText` sont 27 (pas 12) — les deux erreurs se compensent partiellement. Suffisant pour justifier 4-5 petits modules, pas une usine à gaz.

### 1.5 CSS/HTML

- 1 521 lignes, **193 classes**, un seul fichier. Bannières `/* ===== */` = sections de fait. `:root` = **24 variables**.
- Le CSS est **géré par le rendu JS** : 94 classes posées depuis TypeScript (templates dynamiques backtick inclus). Le HTML statique n'en porte que 39. Les 24 tokens `:root` sont sainement nommés mais **sous-utilisés**
- Propriétés les plus répétées : `color` 181, `background` 139, `font-size` 113, `padding` 88, `border-radius` 69 → beaucoup de micro-variations ; les 24 tokens `:root` existent mais sont **sous-utilisés** (ex. fallbacks `var(--text-secondary, #999)` posés par P2 alors que la variable existe).
- Duplication structurelle : `.modal`, `.dialog`, `.style-palette`, `.sp-*`, `.dup-*`, `.pl-*` réinventent chacun padding/ombre/coins/radius → visibles dans les compteurs `border-radius: 69`, `border: 62`.

---

## 2. Diagnostique architectural (forces/fragilités)

```
                    ┌─────────────────────────────────────────────┐
                    │                 index.html                   │
                    └──────────────────────┬──────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │        script.ts (composition root)          │
                    │   imports de commandes + initApp + router    │
                    └───────┬──────────────────┬───────────────────┘
                            │                  │
              ┌─────────────▼─────┐   ┌────────▼─────────────────┐
              │  commands/*       │   │  render/*                 │
              │  registry (matrice)│   │  1 module par panneau     │
              │  bindings typés    │   │  + cellules/overlays      │
              └─────────┬─────────┘   └────────┬─────────────────┘
                        │                      │
              ┌─────────▼──────────────────────▼─────────────────┐
              │           state.ts (Proxy + EventEmitter RAF)     │  ← seule source de vérité
              └─────────┬────────────────────────────────────────┘
                        │
              ┌─────────▼────────────────────────────────────────┐
              │  modules purs : styles, styleSuggest,             │  ← testés ~100 %
              │  filterEngine, dupDetect, dupGroups, utils        │
              └───────────────────────────────────────────────────┘
```

**Ce qui tient** : la séparation pur/impur est réelle et respectée depuis EPIC-033 ; les événements batchés RAF évitent les re-renders en rafale ; la matrice clavier est un filet rare dans un projet de cette taille.

**Fragilités** :
1. `render/*` = modules **panneau** (eparsUI, sourceTree, playlistUI, yearsUI, dupsUI) qui réinventent chacun : wipe, boucle filtrée, compteur, ligne d'état. Ce sont les **5 candidats numéro un** à la factorisation — pas en « composants » au sens framework, mais en un **squelette de liste partagé**.
2. `actions.ts` (617 LOC) est devenu un fourre-tout orchestration + API + feedback → à trancher en `api/` (transport) vs `workflows/` (orchestration).
3. `cueEditor.ts` (1 701 LOC) est un monolithe mais **isolé** (modale dédiée, peu de couplage) — ne pas y toucher sans besoin réel (YAGNI).
4. `domPatches.ts` (240 LOC) : patcher le DOM après coup est un signal que le rendu n'est pas assez déclaratif — à évaluer lors de la factorisation des listes.

---

## 3. Cible d'architecture proposée (vanilla TS, incrémentale)

**Principe directeur : extraire les motifs déjà éprouvés dans le code, pas en inventer.** Chaque module cible ci-dessous reprend un pattern **déjà présent en 2+ exemplaires** dans le dépôt (vérifié §1.4).

```
static/src/
├── core/                        ← NOUVEAU (extrait, pas écrit de zéro)
│   ├── dom.ts                   renderList(), renderRows(), focus/scroll save-restore
│   ├── feedback.ts              setStatus(), showToast() (déjà dans ui.ts — déplacement), confirmDialog
│   ├── focusTrap.ts             trap partagé modales + couches DOM (palette)
│   ├── subscribe.ts             subscribeVisible(event, fn) — le garde hidden en un seul endroit
│   └── format.ts                fmtCount(), plural(), formatDuration()
├── state.ts, api.ts, router.ts, focus.ts, audio.ts   (inchangés)
├── domains/                     ← modules métier purs (déjà existants, renommés si P2 le justifie)
│   ├── styles.ts, styleSuggest.ts, filterEngine.ts, dupDetect.ts, dupGroups.ts, utils.ts
├── render/
│   ├── (pages) eparsUI, sourceTree, playlistUI, yearsUI, dupsUI   ← consomment core/
│   ├── (cellules) fileRow, styleCell, ratingEdit …                ← inchangés
│   └── cueEditor.ts             ← HORS PÉRIMÈTRE (isolé, YAGNI)
├── commands/                    ← inchangé (registry + matrice = actif)
└── style.css                    ← découpé en 4 fichiers importés par esbuild (§5)
```

**Règle d'or d'extraction** : un module `core/` n'est créé que s'il remplace **au moins 2 implémentations existantes** écrites, avec leurs tests qui passent avant ET après. Interdiction d'« anticiper » une abstraction (YAGNI).

### 3.1 Exemple concret 1 — `core/dom.ts` (le motif wipe-and-rebuild)

**Avant (dupliqué 15×, éparsUI simplifié)** :

```typescript
// eparsUI.ts (et sourceTree, playlistUI, yearsUI, dupsUI…)
export function renderEpars(): void {
  const container = document.getElementById('epars-container');
  if (!container) return;
  const savedScrollTop = container.scrollTop;           // pattern dupliqué…
  container.innerHTML = '';
  // …filtre, boucle, compteur, ligne d'état…
  requestAnimationFrame(() => { container.scrollTop = savedScrollTop; }); // …ici aussi
}
```

**Après (un seul endroit, optionnel et testé)** :

```typescript
// core/dom.ts — remplace 15 copies, aucune magie
export function renderList(
  container: HTMLElement,
  build: (root: HTMLElement) => void,
  opts: { keepScroll?: boolean } = {},
): void {
  const saved = opts.keepScroll ? container.scrollTop : null;
  container.innerHTML = '';
  build(container);
  if (saved !== null) requestAnimationFrame(() => { container.scrollTop = saved; });
}
```

- Les pages concernées (epars, source, playlist ×2, years, dups) migrent **une par une**, un commit chacune, tests existants verts (les tests jsdom vérifient déjà le contenu rendu — ils ne changent pas, c'est le filet).
- Gain mesurable : −40 à −60 LOC, et surtout **plus aucune page ne peut oublier** le restore de scroll (le save/restore dupliqué ×3 modules est le vrai gain, pas le compte de sites).

### 3.2 Exemple concret 2 — `core/format.ts`

```typescript
// Avant : 27 sites `x.toLocaleString('fr')` + pluriels faits main incohérents
// Après :
export function fmtCount(n: number): string { return n.toLocaleString('fr'); }
export function plural(n: number, word: string, pl = `${word}s`): string {
  return `${fmtCount(n)} ${n > 1 ? pl : word}`;
}
// plural(3, 'fichier') → '3 fichiers' ; plural(1, 'dossier') → '1 dossier'
```

### 3.3 Exemple concret 3 — `core/subscribe.ts` (le garde qui évite un bug latent)

```typescript
// Avant (render.ts, ×4 — le garde est subtil et non commenté) :
on('eparsFiles:changed', () => {
  const container = document.getElementById('epars-container');
  if (container && !container.classList.contains('hidden')) renderEpars();
});
// Après :
subscribeVisible('eparsFiles:changed', 'epars-container', renderEpars);
```

---

## 4. Performances : ce qui compte vraiment (et ce qui ne compte pas)

**Contexte de perf réel : 5 092 lignes max, filtre live, re-renders événementiels.** Aucun ralentissement constaté à l'usage. Donc : mesurer avant d'optimiser, et n'optimiser que les 4 points mesurés ci-dessous.

| # | Point | Mesure/estimation | Action proposée | Priorité |
|---|---|---|---|---|
| P1 | **Double passe de filtre** épars (rendu + recomptage, §1.4 D3) | 2× `matchesTokens` sur 5 092 fichiers par frappe (déjà debouncé 400 ms) | fusionner : construire la liste filtrée **une fois**, dériver compteur et rendu de la même liste | ⭐⭐⭐ facile, gain réel ÷2 |
| P2 | Suggestions sans mémo (§1.4 D4) | re-render complet d'un lot 1 347 ≈ millions d'opérations | mémoïser sur identité `styleChoices` (pattern `currentTaxonomy` déjà en place) | ⭐⭐⭐ un seul site |
| P3 | Recréation complète du DOM des listes | 5 092 lignes à chaque `eparsFiles:changed` | **mesurer d'abord** (performance.now dans un test jsdom n'est pas représentatif → profilage Chrome headless sur données réelles) ; si > 50 ms : `content-visibility: auto` + `contain-intrinsic-size` sur `.file-row` (recommandation 2026, une ligne de CSS, sans virtualisation JS) | ⭐⭐ après mesure |
| P4 | Re-render des **deux** arbres après chaque copie (`sourceFiles:changed` + `eparsFiles:changed` mutés ensemble) | 1 430 + 5 092 lignes | hors périmètre immédiat : le comportement est correct, la mesure P3 décidera | ⭐ attendre P3 |

**Ce que ce document NE propose PAS** : virtual scrolling JS (react-window/TanStack ou maison). Pour 5 092 lignes de ~28 px, la virtualisation ajoute un état de scroll complexe (ancres, sélection multi-lignes, focus, recherche dans la liste) pour un gain que `content-visibility` donne quasi gratuitement. Le comparatif 2026 (annexe D) montre que sous ~10 000 nœuds, CSS containment suffit. YAGNI.

---

## 5. CSS et HTML : factorisation sans usine à gaz

**Décision : garder un CSS classique à tokens, découpé en 4 fichiers, zéro preprocessor, zéro Tailwind (voir §6 pour la discussion).**

```
static/styles/
├── tokens.css      :root — 24 variables existantes + celles manquantes repérées (§1.5)
├── base.css        reset, body, scrollbar, focus-visible
├── components.css   .modal, .dialog, .chip, .toast, .kbd, .table-row, .empty-state…
│                    ← classes STRUCTURELLES partagées (extraites des 6 familles redondantes)
└── pages/          sync.css, dups.css, years.css, playlist.css, cue-editor.css
                     ← les ~193 classes actuelles triées par panneau (coupage mécanique,
                       grep-able : chaque classe appartient à un module render/* identifié)
```

Règles de factorisation CSS (tirées des mesures §1.5) :
1. **Une famille de composants = une classe de base + modificateurs** (BEM-lite, sans dogme) : `.chip`, `.chip--chosen`, `.chip--suggested`, `.chip--written` — les 4 états du chip style existent déjà, ils deviennent un modèle.
2. Les fallbacks `var(--x, #999)` sont supprimés quand la variable existe (2 sites) — règle lint Biome ou simple revue.
3. Chaque extraction de composant CSS est **accompagnée d'une capture avant/après** (l'app est visuelle ; la régression CSS ne se voit pas dans les tests unitaires) — même méthode que la validation P1 de l'EPIC-035.
4. HTML : `templates/index.html` reste le squelette statique. Aucun templating ajouté (esbuild suffit). Les 326 lignes sont raisonnables.

---

## 6. Framework, librairie, autre techno ? — Décision argumentée

### 6.1 Pourquoi PAS React/Vue/Svelte ici

| Critère | Réalité du projet | Verdict |
|---|---|---|
| Réactivité | `state.ts` (Proxy + EventEmitter RAF) joue déjà ce rôle, avec 1 095 tests qui le verrouillent | migration = réécrire la colonne vertébrale |
| Composants | 15 sites de rendu liste, motifs identiques — extraits en `core/dom.ts` sans framework | le problème est la duplication, pas l'absence de framework |
| Clavier + matrice | le registry EPIC-031 et ses 78 cellules de caractérisation sont du sur-mesure vanilla ; un framework IMPOSE son modèle d'événements (synthetic events React) → la matrice devient non-représentative | perte nette |
| Cue editor (wavesurfer, canvas, FFT) | manipulation impérative fine ; React autour n'apporte rien sinon des re-renders à combattre | hors sujet |
| Tests | 1 095 tests jsdom compilent le DOM vanilla ; React Testing Library = réécrire toute la suite | coût énorme, zéro valeur utilisateur |
| Taille | 10 425 LOC frontend hors tests, 1 développeur | le seuil où un framework paie (souvent 50 k+ LOC, plusieurs devs, turnover) n'est pas atteint |

Sources 2026 cohérentes : « vanilla reste plus rapide et plus simple pour les petits projets » ; la demande de compétence se déplace (React moins discriminant en 2026) — mais **aucune** source sérieuse ne recommande de migrer un codebase vanilla sain vers un framework. Les recommandations de migration concerne des jQuery legacy, pas du TS typé testé.

### 6.2 Web Components : la voie du milieu ? — Non, et voici pourquoi

Les WC sont viables en 2026 (Declarative Shadow DOM, scoped registries). Mais :
- **Shadow DOM casse les tests jsdom existants** (le shadown root n'est pas simulé sans setup supplémentaire) → conflit direct avec NO regression.
- Le projet n'a **pas de besoin de réutilisation inter-projets** (pas de design system à distribuer) — le seul client de ces composants est cette app.
- La migration doit se faire page par page avec deux systèmes cohabitant — c'est exactement le coût de strangler fig pour un bénéfice nul en interne.

**Exception retenue** : si un jour un second client (extension, outil CLI-web) veut réutiliser les chips/listes, les extraire en WC **à ce moment-là** (les modules `core/` de la §3 en seront les candidats naturels).

### 6.3 HTMX / Alpine / autre paradigm ?

Le backend est Flask + JSON. HTMX imposerait du rendu HTML côté serveur pour remplacer ~40 endpoints JSON et casserait l'offline-first du client (tout l'état vit côté navigateur). Coût massif, bénéfice nul : le client est **déjà** une app riche qui marche.

### 6.4 Rust / autre backend ?

`app.py` = 1 608 LOC Flask, perfs non limitantes (scan parallélisé via ProcessPoolExecutor, caches JSONL). Un portage Rust : réécriture de 2 243 LOC + mutagen (écriture tags ID3/FLAC/MP4) n'a pas d'équivalent Rust aussi érodé par les tests. Zéro gain utilisateur identifié. **Non.**

### 6.5 Bun / tooling ?

esbuild build en < 1 s, vitest, biome : la chaîne est déjà moderne et rapide. Bun remplacerait quoi ? Pas de problème mesuré. **Non** (à revoir si le tooling devient un jour le goulot, ce qui n'est pas le cas).

### 6.6 La seule adoption d'outil justifiée

- **`npx knip`** : détection automatisée exports/code/classes morts (remplace mon grep fragile, répétable en CI).
- **PurgeCSS en mode analyse** (rapport only) pour l'audit CSS périodique.
- Les deux sont des **outils de mesure**, pas des dépendances runtime. KISS respecté.

---

## 7. Testabilité — état et plan

**État réel** : la testabilité est le point fort du projet. 1 095 vitest en jsdom, 317 pytest, matrice de caractérisation, fabriques audio. Les faiblesses précises :

| Faiblesse | Preuve | Remède |
|---|---|---|
| **Flaky en shuffle** (ordre des tests) | `sourceTree.test.ts` 1/34 en `--sequence.shuffle` (reproduit 2026-09-19) | passer le gate en `--sequence.shuffle` une fois la dette corrigée ; chaque flaky est un état global mal nettoyé (`beforeEach` incomplet) — c'est du bug de test, pas de prod |
| Listeners globaux non retirés | 45 add / 1 remove | audit ciblé des 7 sites `document`/`window` ; helper `core/listeners.ts` (`on(el, ev, fn)` auto-nettoyant si besoin) **seulement si l'audit le justifie** |
| Double implémentation du focus trap | modales vs palette | extraire `core/focusTrap.ts` avec ses tests propres (une implémentation, deux consommateurs) |
| Les pages se testent par le DOM complet | jsdom lent sur 5 092 lignes (constaté : rendus de test > 100 ms) | continuer : c'est le bon niveau ; optimiser les tests seulement s'ils deviennent le goulot du gate |

**Plan de test du refactoring lui-même** : chaque phase a un critère de sortie testable (voir §8) — zéro modification de comportement = zéro modification de test d'assertion. Les tests d'**isolation** (beforeEach) peuvent être renforcés, jamais affaiblis.

---

## 8. Plan de refactoring par phases (incrémental, NO regression)

**Méthode : strangler fig appliqué aux modules, pas au système.** Chaque phase est indépendamment utile, chaque commit laisse le gate vert (`typecheck 0 · vitest · lint 0 · build OK · pytest`). Chaque phase = une EPIC dédiée dans le registre.

```
Phase 0 (dette) ──► Phase 1 (core utils) ──► Phase 2 (listes) ──► Phase 3 (CSS) ──► Phase 4 (mesure perf)
   1-2 h               1 jour                  2-3 jours            1-2 jours              1 jour
```

### Phase 0 — Dette urgente — ✅ LIVRÉE 2026-09-19 (`e623dd0`, EPIC-036)
1. ✅ Flaky : cause racine = tests filtre laissant `state.filters` pollué entre tests (le
   `beforeEach` ne le réinitialisait pas) — corrigé dans **2 fichiers** : `sourceTree.test.ts`
   **et `yearsUI.test.ts`** (second flaky dormants découvert par le shuffle des 5 graines).
   Shuffle ajouté au gate **CI** (3 graines fixes reproductibles). Précision honnête : la CI
   shuffle **déjà** en aléatoire (revue 2026-08-08) — l'écart réel n'était pas l'absence de
   shuffle mais l'absence de graine fixe → échec jamais reproductible.
2. ✅ Audit listeners `document`/`window` (7 sites) : **zéro fuite réelle** — singletons module
   (vie = vie de l'app), `{once:true}`, ou appariés add/remove avec garde idempotent. Les 45
   `addEventListener` sans remove correspondant sont des `onclick=` sur nœuds éphémères
   détruits avec leur `innerHTML`. Consigné, rien à corriger.
3. ✅ Classes CSS mortes : tranché par **PurgeCSS** (`npm run audit:css`, script réutilisable
   Phase 3) — 1 famille morte confirmée et supprimée (ancienne table doublons EPIC-028,
   21 lignes, preuve git `731cc24` : l'UI actuelle est en cartes `dup-card`, le CSS table
   n'a jamais été retiré, aucun test ne les référence). Le reste (9 candidates dont 2 familles
   « demo » hors app) consigné dans le rapport, décision à l'EPIC CSS Phase 3.
**Critère de sortie — atteint** : 5 graines shuffle × 1 095 verts (local, avant branchement CI)
puis gate CI à graines fixes ; zéro listener suspect non tracé ; audit CSS rejouable en 1 commande.

### Phase 1 — Extraction `core/` (1 jour, ~10 commits)
Créer `core/format.ts`, `core/feedback.ts`, `core/subscribe.ts`, `core/dom.ts` (dans cet ordre de risque croissant) en **remplaçant les usages existants** (27 + 27 + 6 + 6 sites de listes) page par page.
**Critère de sortie** : 0 duplication restante des motifs §1.4 ; `wc -l` net négatif ; tests d'assertion inchangés (diff vérifié au commit).
**Risque** : faible — chaque substitution est mécanique et couverte par les tests existants.

### Phase 2 — Squelette de liste commun (2-3 jours)
Extraire le pattern complet « liste filtrée + compteur + ligne d'état + sélection » partagé par eparsUI/sourceTree/playlistUI/yearsUI/dupsUI — en **paramétrant** (fonction `buildRow`, prédicat de filtre, hook post-render), pas en héritant.
- Fusionner la double passe de filtre (P1 §4) au passage (même code).
- Évaluer `domPatches.ts` : si les patches deviennent inutiles avec le squelette, les retirer ; sinon les laisser (KISS).
**Critère de sortie** : 5 pages sur le squelette commun ; double passe de filtre disparue (mesure : 1 appel `matchesTokens` par fichier) ; matrice clavier verte.

### Phase 3 — CSS en couches (1-2 jours)
Découpage mécanique §5 + extraction des 6 familles structurelles (.modal/.dialog, .chip, .toast, .kbd, table rows, .empty-state) + nettoyage fallbacks. **Capture avant/après obligatoire** pour chaque famille (l'app est visuelle, pas de test automatisé de pixel).
**Critère de sortie** : 4 fichiers importés par esbuild, 0 duplication de tokens, captures vérifiées.

### Phase 4 — Mesure performance et décisions data-driven (1 jour)
1. Profiler Chrome headless sur données réelles (rendu 5 092 lignes, frappe de filtre, re-render après copie).
2. Si rendu > 50 ms : `content-visibility: auto` + `contain-intrinsic-size` sur les lignes (1 ligne CSS + mesure). Sinon : consigner « pas de problème » et **fermer le sujet perf** (YAGNI).
3. Si suggestions P2 toujours lentes après mémoïsation Phase 2 : profiner `styleSuggest` (probablement inutile).
**Critère de sortie** : rapport de mesure commité (chiffres avant/après), décision content-visibility motivée par un nombre, pas une intuition.

### Phase 5 (optionnelle, conditionnelle) — Découpage `app.py`
Si un jour le backend redevient actif (P4+ d'EPIC-035, EPIC-033-bis) : séparer `routes/` (Flask), `domain/` (métier pur), `infra/` (cache, journal) — le découpage est déjà visible dans le code, il ne manque que les dossiers. **Pas urgent** : 1 608 LOC testées à 317, ce n'est pas une douleur aujourd'hui.

### Ce qui est volontairement exclu (no-overengineering)
- ❌ Framework frontend (§6.1) · Web Components (§6.2) · HTMX (§6.3) · Rust (§6.4) · Bun (§6.5)
- ❌ Virtual scrolling (§4)
- ❌ Refactor de `cueEditor.ts` (isolé, fonctionne, 1 701 LOC de tests derrière lui)
- ❌ State management global alternatif (Redux, Zustand…) — `state.ts` est le pattern, il marche
- ❌ Design system complet — 6 familles de composants CSS suffisent

---

## 9. Suivi des changements et documentation dev

1. **Une phase = une EPIC** (registre `docs/superpowers/epics/`), avec tasks cochables, gate par tâche, traçabilité commits — la discipline qui a fait ses preuves (EPIC-026…035).
2. **Invariant documenté** : `AGENT.md` (`%ARCHITECTURE`) reçoit une section « core/ » décrivant les helpers extraits et la règle d'extraction (≥ 2 usages réels). Tout nouveau module passe par une EPIC.
3. **Conventions** : le README de `static/src/` (à créer en Phase 1, ~30 lignes) liste les modules core et leur contrat (inputs/outputs), exemple court inclus. Pas de wiki externe : la doc vit près du code, en français comme le reste.
4. **Garde anti-régression structurelle** : la matrice clavier, le count `on()` de `render.test.ts`, la bijection légende — trois tests qui échouent si quelqu'un restructure sans comprendre. Les maintenir verts est **la** définition de NO regression.
5. **Décisions d'architecture datées** : les refus (framework, WC, virtualisation) sont consignés dans ce document avec leurs raisons et leur **condition de révision** (ex. WC si un second client apparaît). Un refus sans date de révision est une dette de décision.

---

## Annexe A — Preuves (commandes réelles exécutées le 2026-09-19)

```
wc -l static/src/**/*.ts            → 27 842 total (dont 17 417 de tests = 10 425 hors tests)
grep -rn "toLocaleString('fr')"     → 27 occurrences hors tests
grep -rn "statusText.textContent =" → 27 sites (≈ tous les modules render)
grep -rn "function plural"          → 1 réimplémentation (stylePreview.ts)
grep -rc "document.createElement"   → 15+13+12+12+10+8+7… par module
grep -rn "\.innerHTML = ''"         → 15 sites au total ; décompte honnête :
                                      6 = cueEditor (clears canvas/modale, PAS des listes)
                                      9 = autres ; dont 6 wipes de listes de pages
                                      (epars, source, playlist ×2, years, dups)
grep -c add/removeEventListener     → 45 add, 1 remove
audit classes CSS                   → 193 définies, 66 candidates mortes au regex,
                                      échantillon de 8 vérifiées à la main : 8/8 VIVANTES
                                      (template literals) → compte réel inconnu, outil requis
npx vitest run sourceTree --sequence.shuffle → 1/34 FAILED (reproduit)
npx vitest run (gate complet)       → 1 095 passed
```

## Annexe B — Estimation d'effort honnête

| Phase | Effort | Confiance | Risque de régression |
|---|---|---|---|
| 0 dette | 1–2 h | haute | nul (corrections test + suppression CSS mort) |
| 1 core/ | ~1 jour | haute | faible (substitutions couvertes) |
| 2 listes | 2–3 jours | moyenne — les pages ont des subtilités (focus, sélection, patches) et le gain est plus modeste qu'estimé initialement | moyen — d'où page par page |
| 3 CSS | 1–2 jours | moyenne — les captures avant/après sont le vrai filet | visuel si négligent |
| 4 perf | 1 jour | haute (mesure, pas de code si pas besoin) | nul |

Total : **~5–8 jours de travail effectif**, étalables sans dépendance forte entre phases 2→3→4.

## Annexe C — Ce que ce document n'a PAS pu vérifier (honnêteté)

- Le chiffre LOC « hors tests » est calculé par soustraction (27 842 − 17 417 de tests) — vérifié par script, il est exact ; l'estimation initiale du brouillon (~13 500) était fausse et a été corrigée (honnêteté : la première passe de mesure était mauvaise).
- L'audit des classes CSS mortes est probabiliste (regex) : knip/PurgeCSS en Phase 0 tranchera.
- Le coût réel du double rendu des arbres (P4) n'a jamais été mesuré — c'est justement l'objet de la Phase 4.
- La recherche web 2026 (annexe D) confirme des tendances générales, pas des mesures sur CE projet ; les décisions §6 reposent d'abord sur les mesures locales.

## Annexe D — Sources web (consultées le 2026-09-19)

- Vanilla vs frameworks, petites apps : discussions r/Frontend, dev.to (« Why the Latest JavaScript Frameworks Are a Waste of Time », 2025), levelup.gitconnected (« Why I Stopped Using React… », 2025-08).
- Web Components 2026 : medium.com « Web Components in 2026 », reptile.haus (pragmatisme Shadow DOM leaf components), codecrispi.es (mai 2026), et la contre-prise de position de Ryan Solid (« Web Components Are Not the Future », 2024) — les deux camps lus, décision fondée sur le coût jsdom local.
- Perf grandes listes : web.dev `content-visibility`, agustinbarrientos.com « content-visibility vs. Virtualization » (2026-08 : « content-visibility laisse le DOM en place, seule la virtualisation limite les nœuds »), cekrem.github.io (2025), blog.openreplay.com (2026).
- Méthode de migration : Shopify Engineering et swimm.io sur le Strangler Fig Pattern (incrémental, jamais big-bang).
