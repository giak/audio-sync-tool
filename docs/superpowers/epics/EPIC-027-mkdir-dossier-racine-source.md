# EPIC-027 — Créer un dossier racine Source Data via bouton ➕

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-15 · **Dernière mise à jour** : 2026-09-15
> **Priorité** : Moyenne (demande utilisateur directe, page Sync)
> **Docs liées** : session 2026-09-15 (pas de plan/spec préalable — portée courte)

## Objectif

Permettre de **créer un dossier à la racine de Source Data** (colonne droite de
la page **Sync**) via un bouton, au même niveau que les dossiers existants —
sans passer par le système de fichiers à la main ni attendre un scan.

## Contexte & découvertes

- L'arbre Source Data est **dérivé des fichiers scannés** (`state.sourceFiles`,
  `os.walk` côté serveur n'indexe que les fichiers audio `MUSIC_EXTENSIONS`) :
  un dossier vide créé sur disque serait **invisible** au prochain rendu.
- D'où un suivi dédié : `data/extra_dirs.json` (serveur) + `state.sourceExtraDirs`
  (client), injecté dans `/load` et `/scan` (`extra_dirs`).
- Découverte Flask : `request.json` sur POST sans JSON → **415** (pas 400) —
  comportement standard, aligné sur `/copy` et `/delete` (test ajusté).
- Le retrait d'un dossier via le menu contextuel est **index-only** : le disque
  n'est jamais touché (règle DATA-SAFETY `AGENT.md`).

## Tâches

- [x] Backend : `EXTRA_DIRS_PATH` + `load_extra_dirs()`/`save_extra_dirs()` +
      route `POST/DELETE /mkdir` (validation nom, `is_path_allowed()`, journal)
- [x] Backend : injection `extra_dirs` dans `/load` et `/scan`
- [x] Frontend : bouton **➕** dans le header du panneau Source Data
      (`templates/index.html`, `.panel-add-btn` dans `style.css`)
- [x] Frontend : `createSourceFolder()` (promptDialog → POST /mkdir),
      `state.sourceExtraDirs`, abonnement `sourceExtraDirs:changed` → renderSource
- [x] Frontend : rendu des dossiers ➕ vides (badge « (vide) », focusables,
      opaques à la copie) + exclus auto s'ils reçoivent des fichiers au scan
- [x] Menu contextuel « ❌ Retirer de l'index (dossier conservé sur disque) »
      (confirmDialog → DELETE /mkdir, index-only)
- [x] Tests : 8 pytest (`/mkdir` : création, idempotence, noms invalides, 403,
      DELETE index-only, injection /load + /scan) + 8 vitest (rendu extra dirs,
      retrait, focus, `createSourceFolder`, abonnement render) + mise à jour des
      tests impacts (7→8 abonnements render, `extra_dirs` dans `/load`)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `EXTRA_DIRS_PATH`, helpers extra_dirs, route `/mkdir`, injection `/load` + `/scan` |
| `test_app.py` | Fixture `clean_extra_dirs` + 8 tests `/mkdir` + `test_load_empty_cache` mis à jour |
| `templates/index.html` | Bouton ➕ dans le header du panneau droit |
| `static/style.css` | `.panel-add-btn` (style cohérent toolbar) |
| `static/src/state.ts` | `sourceExtraDirs: Set<string>` |
| `static/src/actions.ts` | `createSourceFolder()` + peuplement depuis `/scan` + `/load` |
| `static/src/render.ts` | Abonnement `sourceExtraDirs:changed` → `renderSource()` |
| `static/src/render/sourceTree.ts` | `renderExtraDirs()`, menu « Retirer », exclusion des dossiers scannés |
| `static/src/script.ts` | Câblage clic bouton ➕ |
| `static/src/actions.test.ts` | 3 tests `createSourceFolder` |
| `static/src/render/sourceTree.test.ts` | 4 tests extra dirs |
| `static/src/render.test.ts` | 7→8 abonnements `setupRenderSubscriptions` |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0 erreur
- [x] Tests frontend (`npx vitest run`) — **750 passed**
- [x] Tests backend (`./venv/bin/python -m pytest -q`, 3 fichiers) — **182 passed**
- [x] Lint (`npm run lint`) — 63 fichiers, 0 erreur
- [ ] Vérification navigateur (`npm start` → :8765) — à faire par l'utilisateur

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `b1fa42a` | feat(sync): création d'un dossier racine Source Data via bouton ➕ (/mkdir + extra_dirs) |

## Décisions

- **`extra_dirs.json` séparé du cache de scan** : le cache est régénéré à chaque
  scan (peut être supprimé sans perte, règle DATA-SAFETY #4) alors que les
  dossiers créés par l'utilisateur doivent survivre ; un fichier dédié isole
  les deux cycles de vie. Le cache inclut désormais `extra_dirs` en miroir
  (injection dans `/scan` + `/load`) pour éviter un 4ᵉ appel réseau à l'init.
- **Retrait = index-only** : le menu contextuel ne supprime jamais le disque
  (DATA-SAFETY absolue) ; seule la ligne `extra_dirs.json` disparaît.
- **Dossier ➕ qui reçoit des fichiers au scan redevient un nœud normal** :
  l'exclusion se fait par présence réelle dans l'arbre scanné
  (`dirExistsInTree`), pas par simple préfixe de chemin — un préfixe aurait
  exclu tous les dossiers *sous* la racine source.
- **`sourceExtraDirs` typé `Set<string>`** (chemins absolus), aligné sur
  `sourceExpanded`/`sourceManuallyExpanded` — cohérence du state.
- **F5/drag-drop fonctionnent sans modification** : la copie crée le dossier
  destination via `os.makedirs(..., exist_ok=True)` (déjà en place).

## Notes / Risques

- Correction compteur (2026-09-15, double-check) : la validation initiale
  citait « 138 pytest » — c'est test_app.py seul. Total réel du backend :
  **182** (test_app 138 + test_nml 29 + test_analysis 15). Le 174 du registre
  historique = 130 (test_app avant EPIC-027) + 29 + 15.
- Le bouton ➕ reste visible même si aucun dossier n'est configuré : dans ce
  cas `createSourceFolder()` affiche un message d'aide (config + scan d'abord)
  au lieu d'ouvrir le prompt.
- `/mkdir` crée le dossier disque avec `os.makedirs(exist_ok=True)` →
  idempotent, pas d'écrasement possible.
- Le menu « Retirer » n'apparaît que sur les dossiers `data-extra="1"` —
  jamais sur les dossiers scannés normaux.
- extension possible (backlog) : renommage des dossiers — cité par l'utilisateur
  en 2026-09-15, reporté (portée courte posée en premier).
