# Review critique des EPICs (001–014) — audit forensique — 2026-08-08

> **Objet** : revue critique de l'ensemble des EPICs du registre (`docs/superpowers/epics/`) — livrées
> (001–008) et backlog (009–014) — contre la **réalité du code et de la collection** (`data/traktor4/collection.nml`,
> 56 645 entrées), avec vérification empirique de chaque claim.
>
> **Méthode** : lecture de toutes les EPICs + des sources (nml.py, app.py, beatgrid.ts, cueEditor.ts,
> playlistUI.ts, tests) ; mesures Python sur la collection réelle ; exécution répétée des suites
> (`vitest --sequence.shuffle`, pytest, typecheck, lint) ; recherches web sur la sémantique NML.
>
> **Principe** : vérité forensique — aucun chiffre repris sans mesure, aucune conclusion sans preuve.
> KISS / DRY / YAGNI appliqués à la critique du backlog.

---

## 1. Verdict global

Le registre des EPICs est **structurellement solide** : convention claire, traçabilité par commit,
statuts honnêtes, backlog priorisé. La plupart des claims techniques des EPICs livrées (001–008) ont été
**confirmés empiriquement** sur la collection réelle (chiffres TEMPO/TYPE=4, phase=START, HOTCUE 0..7,
boucle TYPE=5, DISPL_ORDER divergent, absence de BEATGRID legacy).

Mais la review a mis au jour **trois problèmes réels** qui contredisent partiellement ce que les EPICs
revendiquent :

| # | Gravité | Problème | Preuve |
|---|---------|----------|--------|
| R1 | 🔴 **Haute** | **Les suites de tests étaient flaky en shuffle** (dépendance d'ordre via état global) alors que les EPICs 002–008 revendiquent « suite complète verte » | `vitest --sequence.shuffle` : échecs reproductibles (2–14 tests selon l'ordre, seeds capturés) ; 3 causes racines identifiées et corrigées |
| R2 | 🟠 **Moyenne** | **Trou de sécurité `/api/track/match`** : lisait `getsize()` de n'importe quel chemin existant (pas de `is_path_allowed`), alors qu'EPIC-013 le plaçait encore au backlog | contraste avec `/audio`, `/delete`, `/api/track/add` déjà protégés ; corrigé + test 403 |
| R3 | 🟠 **Moyenne** | **Chiffres imprécis dans les EPICs** : « multi-match ≈ 12 % » (définition ambiguë), « 22 % des 56 752 ENTRY » (total réel 56 645), « BPM_QUALITY < 50 rejetée » (jamais < 100 sur la collection), « 49 tests dédiés » (9 dans beatgrid.test.ts), « 127 pytest » (128 réels) | mesures ci-dessous |

Deux problèmes **de fond** supplémentaires relevés par la review du code (pas seulement des EPICs) :

| # | Gravité | Problème |
|---|---------|----------|
| R4 | 🟠 Moyenne | Le fix flakiness initial était **test-only** : la production avait un bug latent équivalent (double `focused` dans `#playlist-tracks` → reorder sur le mauvais track). Corrigé aussi en production (nettoyage du focus + suivi du focus après reorder). |
| R5 | 🟢 Basse | EPIC-006 : « 49 tests dédiés » non vérifiable (beatgrid.test.ts = 9 ; l'EPIC agrège des tests cueEditor) — reformulé en nombres réels. |

---

## 2. Vérifications forensiques (collection réelle)

Toutes les mesures suivantes ont été refaites sur `data/traktor4/collection.nml` (56 645 ENTRY) pendant
cette review.

### 2.1 Claims confirmés ✅

| Claim (EPIC) | Mesure | Verdict |
|---|---|---|
| HOTCUE 0..7, jamais 1..8 (EPIC-001) | 8 108 CUE_V2 avec HOTCUE 0..7 | ✅ |
| Loop = TYPE=5, LEN>0 (EPIC-001) | 97 TYPE=5 ; TYPE=0 → LEN toujours 0.000000 | ✅ |
| TYPE=4 = beatgrid, LEN=0, START=phase (EPIC-008) | 12 323 TYPE=4 ; START toujours ≤ PLAYTIME (0 dépassement) ; **97,8 %** des entrées avec grille+hotcues ont un hotcue exactement sur START | ✅ phase validée |
| TEMPO = BPM (13 410) ; GRID autoritaire (EPIC-008) | TEMPO présent sur 23,7 % ; GRID enfant de TYPE=4 | ✅ |
| Valeurs aberrantes BPM 1.0 / 17178 (EPIC-008) | confirmé → borne 20–400 justifiée | ✅ |
| BEATGRID legacy absent (EPIC-008) | 0 élément `<BEATGRID>` sur 56 645 | ✅ |
| DISPL_ORDER ≠ HOTCUE (EPIC-003, décision) | 326 / 8 435 divergent (96,1 % égaux) | ✅ |
| Multi-match fréquent (EPIC-001/002) | 12,2 % des clés `(FILE, FILESIZE)` ambiguës ; **27,8 % des entrées** dans une clé ambiguë (15 722/56 645) | ✅ mais voir R3 |

### 2.2 Chiffres à corriger ⚠️

| Claim | Réalité mesurée | Correction |
|---|---|---|
| « multi-match ≈ 12 % » (EPIC-001, 002, rapport NML) | 12,2 % **des clés** ambiguës, mais **27,8 % des entrées** concernées — « 1 piste sur ~8 » a un homonyme | Formuler les deux métriques ; « ≈ 12 % des clés » est exact mais sous-estime l'impact réel |
| « ≈ 22 % des 56 752 ENTRY » (EPIC-008) | 12 323/56 645 = **21,8 %** (total 56 645, pas 56 752) | Corriger le total et le % |
| « 76,4 % des pistes n'ont rien » (EPIC-008) | 43 235/56 645 = **76,3 %** (ni TEMPO ni TYPE=4) | 76,3 % |
| « BPM_QUALITY < 50 rejetée » (EPIC-008) | **BPM_QUALITY est toujours 100** sur toute la collection → le seuil < 50 ne se déclenche jamais | Documenter comme garde théorique (justifiée, jamais déclenchée) |
| « 49 tests dédiés » (EPIC-006) | beatgrid.test.ts = 9 tests ; 62 sur beatgrid+cueEditor ensemble | « 9 tests beatgrid + tests snap/BPM/lecture dans cueEditor » |
| « 127 pytest » (EPIC-002/004/005/007/008, README) | **128** (le test B13 `track_match` 403 ajouté) | 128 |

---

## 3. R1 — Flakiness des tests (cause racine, corrigée)

**Symptôme** : `npx vitest run --sequence.shuffle` échouait de façon intermittente (2 à 14 tests selon
l'ordre, seeds reproductibles `1786212656332` etc.) alors que les EPICs 002–008 revendiquent « suite
complète verte » (ce qui n'était vrai que pour l'ordre par défaut).

**Causes racines identifiées** (3 fichiers, 3 mécanismes distincts) :

| Fichier | Mécanisme de fuite | Test symptôme |
|---|---|---|
| `integration.test.ts` | `setupTestState()` ne resettait **pas** tous les champs d'état : `playlistTrackFocusIndex` restait non-null → `renderPlaylistTracks` posait un « focused » automatique qui **doublonnait** celui du test → le handler reorder (`querySelector('#playlist-tracks .focused')`) prenait le mauvais track → `reorderTrack(idx, idx-1)` avec idx=0 → early return silencieux | `Ctrl+ArrowUp reorders track upward in playlist sidebar` : `expected 'cool.mp3' to be 'a.mp3'` |
| `actions.test.ts` | Les éléments config (créés en `vi.hoisted` pour l'import) étaient **détachés** par `document.body.innerHTML=''` du describe `actions` ; les constantes module-level d'actions.ts (`cfgSelect`…) pointent vers ces éléments → `renderConfigSelect` remplissait un élément détaché, `getElementById` renvoyait null | `renderConfigSelect populates the select element`, `delete config fails when only 1 profile remains` |
| `render.test.ts` | `vi.clearAllMocks()` **garde les implémentations** posées par `mockReturnValue` (`countAllEparsFiles=42`, `dirHasMatchingDescendant=true`) → pollution des describes suivants | tests `renderEpars` / `renderSource` selon l'ordre |

**Correctifs appliqués** (côté tests **et** production) :
1. `setupTestState()` : reset complet (audioSeekStep, playlistTrackFocusIndex, sourceManuallyExpanded,
   selectedEparsFiles, lastSelectedEparsIndex, navHistory, navIndex, ratings, focusListId).
2. `beforeEach` integration : `api.mockReset()` + `mockResolvedValue({})` (au lieu de `clearAllMocks`),
   nettoyage des classes `panel-active`.
3. `actions.test.ts` : les références `cfgElements` sont capturées au hoisted et **ré-attachées** après
   chaque `innerHTML=''` (describe actions) et avant chaque test config.
4. `render.test.ts` : restauration explicite des implémentations (`countAllEparsFiles→0`,
   `dirHasMatchingDescendant→false`).
5. **Production** (cause racine, pas seulement le symptôme) : `renderPlaylistTracks` nettoie les
   `focused` avant l'auto-focus ; les handlers reorder (Ctrl+↑/↓, drag-drop) mettent à jour
   `playlistTrackFocusIndex` pour que le focus suive le track déplacé.

**Validation** : 25+ runs `--sequence.shuffle` consécutifs verts (616/616), seed fautif d'origine
ré-exécuté → vert, typecheck 0, lint 0, pytest 128. Les 2 tests ajoutés (focus qui suit le track
après reorder ; no-op en tête de liste) portent le total vitest de 614 à 616.

---

## 4. R2 — Sécurité `/api/track/match` (corrigée)

**Constat** : `track_match()` lisait `os.path.getsize(local)` sur n'importe quel chemin existant passé en
query string, sans `is_path_allowed` — contrairement à `/audio`, `/delete` et `/api/track/add`. Fuite
d'information (existence/taille d'un fichier arbitraire), CWE-22 faible. Le rapport d'audit technique
le notait en ⚠️ et EPIC-013 le rangeait au backlog.

**Correctif appliqué** (cette review) : garde `is_path_allowed(local)` → 403 si hors des dossiers
autorisés, alignée sur les autres routes. Les 5 tests `track_match` existants ont été alignés
(`source_data` dans la config mockée) + nouveau test `test_track_match_blocks_path_outside_allowed_dirs`
(403 hors dossiers, 200 dedans).

**Conséquence** : la tâche « Aligner `/api/track/match` sur `is_path_allowed` » d'EPIC-013 est **faite** —
l'EPIC backlog est mise à jour en conséquence.

---

## 5. Review des EPICs livrées (001–008)

### EPIC-001 — Éditeur waveform cue/loop
- **Confirmé** : HOTCUE 0..7, loop TYPE=5, index (FILE, FILESIZE), round-trip réaliste.
- **À corriger** : « multi-match ≈ 12 % » → préciser « 12,2 % des clés / 27,8 % des entrées ».
- **Bien** : décisions explicites (jamais TYPE=3/4, backup atomique, local-only).

### EPIC-002 — Correctifs bloquants B1–B7
- **Confirmé** : les 7 correctifs sont dans le code + tests dédiés.
- **À corriger** : « ≈ 12 % » (B3) ; « 127 pytest » → 128 ; la section traçabilité dit « à commiter » →
  **commité** `a21f1ae`.

### EPIC-003 — Export NML + DISPL_ORDER
- **Confirmé** : DISPL_ORDER jamais reconstruit (326/8 435), export_root vide → message explicite.
- **À corriger** : traçabilité → **commité** `df58788`.

### EPIC-004 — Lint 0 + CI + docs
- **Confirmé** : lint 0, CI 3 étapes, docs alignées (616 vitest / **128** pytest).
- **À corriger** : « 127 pytest » → 128 ; traçabilité → **commité** `7fe615b`.

### EPIC-005 — UX cue editor
- **Confirmé** : bouton « Cues », plein écran, Échap hiérarchisé, homonymes discriminés.
- **À corriger** : « 127 pytest » → 128 ; traçabilité → **commité** `5aad88e`.

### EPIC-006 — Snap beatgrid + lecture de boucle
- **Confirmé** : beatgrid.ts (snap binaire, détection tempo, comb 4 harmoniques), transport, grille.
- **À corriger** : « 49 tests dédiés » → « 9 tests beatgrid + tests snap/BPM/lecture (62 sur les 2
  fichiers) » ; traçabilité → **commité** `e9391b2`.

### EPIC-007 — Ajout piste à la collection
- **Confirmé** : build_entry_element + POST /api/track/add (garde 403, volume, DIR relatif, backup).
- **À corriger** : « 127 pytest » → 128 ; traçabilité → **commité** `f198942`.

### EPIC-008 — Grille native NML
- **Confirmé** : TEMPO (13 410) + TYPE=4/GRID (12 323), START=phase (97,8 % de corrélation hotcues),
  GRID autoritaire, borne 20–400, cascade NML→détection.
- **À corriger** : « ≈ 22 % des 56 752 ENTRY » → « 21,8 % des 56 645 » ; « 76,4 % » → « 76,3 % » ;
  BPM_QUALITY<50 → documenter qu'elle est toujours 100 sur la collection (garde théorique) ;
  « 127 pytest (+8) » → 128 ; traçabilité → **commité** `24d67de`.

---

## 6. Review du backlog (009–014) — KISS / YAGNI

Verdict global : backlog **bien priorisé et réaliste**. Les EPICs 009–011 forment une progression
cohérente (phase manuelle → analyse serveur → écriture NML) avec des dépendances claires. Trois
recommandations de simplification :

1. **EPIC-009 (cache beatgrid)** — ✅ KISS. Point à trancher rapidement : un seul fichier
   `data/beatgrids.json` (clé `FILE+FILESIZE`), réutiliser `save_json` atomique d'EPIC-013. YAGNI :
   pas de DB, pas de cache séparé par piste.
2. **EPIC-010 (analyse serveur kick)** — ⚠️ Scope à borner. YAGNI : commencer par le **pipeline DSP
   maison** (filtre 40–150 Hz + ODF + autocorrélation + scan de phase) déjà décrit — réutilise le code
   client `detectTempoFromOnsets` côté serveur. **Ne pas installer librosa/madmom tant que le pipeline
   maison ne s'est pas prouvé insuffisant** (dépendances lourdes, madmom RNN = sur-dimensionné pour le
   snap). KISS : une route `POST /api/track/analyze`, 60–90 s, résultat en cache.
3. **EPIC-011 (écriture grille NML)** — ✅ Bien cadré (upsert TYPE=4 préservant l'existant, validation
   sur copie, backup). Risque documenté (Traktor peut régénérer) — assumption honnête.
4. **EPIC-012 (bande basse + barres)** — ✅ Basse priorité correcte ; la bande est un outil de
   validation visuelle, pointer-events:none. YAGNI : la numérotation des barres ne dépend pas du
   downbeat (numérotation relative acceptable) — retirer la dépendance madmom.
5. **EPIC-013 (robustesse backend)** — ✅ Priorité Moyenne correcte. **Tâche `is_path_allowed` sur
   `/api/track/match` : FAITE** (R2) — la retirer du backlog. Ordre suggéré : `save_json` atomique +
   `load_json` robuste (rapides, faible risque) → verrou `/scan` → rotation journal → debug
   conditionnel. Cache parse NML : optionnel, à laisser pour la fin (1,5 s/POST mesuré = acceptable).
6. **EPIC-014 (UX générale)** — ✅ Priorisation bonne (police locale + focus trap + aria d'abord ;
   responsive en plus). YAGNI : le cache-buster CSS et la validation rating 0–100 sont des micro-fix à
   faire en direct, pas une EPIC. Canal de messages unique : réel problème, à garder.

---

## 7. Corrections appliquées aux EPICs

| Fichier | Correction |
|---|---|
| `EPIC-001` | multi-match : deux métriques (12,2 % clés / 27,8 % entrées) |
| `EPIC-002` | multi-match précisé ; 127→128 pytest ; traçabilité commit `a21f1ae` |
| `EPIC-003` | traçabilité commit `df58788` |
| `EPIC-004` | 127→128 pytest ; traçabilité commit `7fe615b` |
| `EPIC-005` | 127→128 pytest ; traçabilité commit `5aad88e` |
| `EPIC-006` | « 49 tests dédiés » → chiffres réels ; traçabilité commit `e9391b2` |
| `EPIC-007` | 127→128 pytest ; traçabilité commit `f198942` |
| `EPIC-008` | 56 752→56 645 ; 22 %→21,8 % ; 76,4 %→76,3 % ; BPM_QUALITY documenté ; 127→128 ; traçabilité commit `24d67de` |
| `EPIC-013` | tâche `is_path_allowed` marquée FAITE (R2) |
| `README` (registre) | 127→128 pytest ; note « working tree » → commits référencés |
| `2026-08-08-nml-audit-real-collection.md` | métrique multi-match précisée |
| `2026-08-08-audit-technique-ux.md` | `/api/track/match` ⚠️ → ✅ protégé (R2) |

---

## 8. Leçons pour le process

1. **« Suite verte » n'est pas « suite robuste »** : les EPICs 002–008 ont été validées sur l'ordre par
   défaut. Ajouter un run `--sequence.shuffle` à la validation standard (ou au CI).
2. **Les chiffres de docs doivent être re-mesurés, pas recopiés** : trois EPICs propageaient des
   chiffres du rapport NML sans vérification (total ENTRY, % multi-match, BPM_QUALITY).
3. **Un fix de test qui masque un bug de prod est un anti-pattern** : la flakiness venait d'un bug réel
   (double focus + reorder sur mauvais track). Toujours chercher la cause racine en production.
4. **Le backlog doit être re-passé au tamis de la réalité** : la tâche sécurité d'EPIC-013 était déjà
   résolue ailleurs — un registre à jour vaut mieux qu'un registre exhaustif.
