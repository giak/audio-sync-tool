# Bundle Build System — Design Document

> Feature: Build système unifié — bundle unique esbuild + validation post-build.
> Date: 2026-06-24
> Statut: Implementé (commit `1a32442`) — 313 tests, 0 type errors, browser OK

---

## 0. Contexte

Le build system précédent souffrait de **3 fragilités chroniques** qui causaient
des régressions à chaque ajout de fichier TypeScript :

1. **Liste manuelle d'entry points** : chaque nouveau `.ts` devait être ajouté
   dans `package.json` (25+ fichiers listés). Un oubli = 404 au chargement.
2. **Cache-buster instable** : `scripts/bust-cache.py` ne traitait que
   `static/dist/*.js`, pas les sous-dossiers `render/` et `commands/`.
   Résultat : `eparsUI.js` importait `state.js` sans `?v=`, pendant que
   `actions.js` l'importait avec `?v=`. Le navigateur chargeait `state.js`
   **deux fois** en deux modules ES distincts → deux instances de `_state` →
   données visibles dans `actions.js`, vides dans `eparsUI.js`.
3. **Aucune validation du build** : pas de test pour vérifier que le bundle
   était valide, complet, ou même non-vide.

Ce document décrit le remplacement de ce système par un **bundle unique** avec
**validation post-build automatisée**.

---

## 1. Architecture

```
Avant (fragile) :
  static/src/             esbuild (25 entry points)      static/dist/
  ├── script.ts  ───────────────────────────────────▶  script.js
  ├── state.ts   ───────────────────────────────────▶  state.js
  ├── actions.ts ───────────────────────────────────▶  actions.js
  ├── render.ts  ───────────────────────────────────▶  render.js
  ├── render/eparsUI.ts ────────────────────────────▶  render/eparsUI.js
  ├── render/sourceTree.ts ─────────────────────────▶  render/sourceTree.js
  ├── ... (25 fichiers)                                   ... (25+ fichiers)
  │                                                       │
  │  ❌ Liste manuelle dans package.json                  │ bust-cache.py
  │  ❌ Oubli → 404                                       │  ❌ glisse les ?v=
  │                                                       │  ❌ rate les sous-dossiers
  │                                                       │  ❌ double load module
  │                                                       ▼
  │                                                  Chargement navigateur
  │                                                  state.js?v=123  (instance A)
  │                                                  state.js        (instance B)
  │                                                  → 2 _state → données fantômes


Après (robuste) :
  static/src/
  ├── script.ts  ──┐
  ├── state.ts   ──┤
  ├── actions.ts ──┤   esbuild --bundle              static/dist/
  ├── render.ts  ──┤   (1 seul entry point,          └── script.js  (101 KB)
  ├── render/    ──┤    suit tous les imports)
  ├── commands/  ──┤
  └── ... (auto) ──┘
                     │
                     │  ✅ Auto-découverte (imports = entry implicite)
                     │  ✅ 1 fichier → pas de 404 possibles
                     │  ✅ Pas de cache-buster interne (1 seul ?v= dans HTML)
                     │  ✅ Impossible de double-loader un module
                     ▼
              scripts/validate-build.js
              ✅ bundle existe et >5KB
              ✅ parse JavaScript valide
              ✅ contient les 6 fonctions clés
```

---

## 2. Problèmes résolus

| # | Problème | Cause racine | Solution |
|---|---------|-------------|---------|
| 1 | Nouveau `.ts` → ajout manuel `package.json` | esbuild CLI exige une liste explicite d'entry points | `build.js` : API esbuild, 1 entry point, suit tous les imports |
| 2 | `bust-cache.py` rate les sous-dossiers | `glob('static/dist/*.js')` ne descend pas dans `render/` | Script supprimé — plus besoin avec un bundle unique |
| 3 | Module chargé 2× (state.js avec/sans `?v=`) | URL différentes = modules ES distincts dans le navigateur | 1 seul fichier, 1 seul `?v=` dans le `<script>` HTML |
| 4 | Pas de validation du build | Aucun test post-build | `scripts/validate-build.js` : 4 vérifications automatiques |

---

## 3. Implémentation

### 3.1 `build.js` — Bundle unique

```javascript
// build.js — bundler utilisant l'API esbuild
import * as esbuild from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';

const isWatch = process.argv.includes('--watch');

await rm('static/dist', { recursive: true, force: true });
await mkdir('static/dist', { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ['static/src/script.ts'],  // SEUL entry point
  bundle: true,                             // suit tous les imports
  outfile: 'static/dist/script.js',         // UN SEUL fichier de sortie
  format: 'esm',
  sourcemap: isWatch ? 'inline' : 'linked',
  target: 'es2022',
  logLevel: 'info',
});

if (isWatch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
```

**Principes :**
- `entryPoints: ['static/src/script.ts']` — un seul point d'entrée
- `bundle: true` — esbuild résout récursivement tous les imports (`./state.js`,
  `./render/eparsUI.js`, `./commands/navigation.js`, etc.) et les inline
- `outfile` (singulier) — un seul fichier `.js` en sortie
- `format: 'esm'` — conserve la sémantique des modules ES
- `--watch` — mode développement avec recompilation automatique

**Pourquoi pas `--splitting` ?** Le `--splitting` d'esbuild (code splitting)
nécessite `--format=esm` ET `outdir` (plusieurs fichiers). On perd le bénéfice
du bundle unique : plus de risque de double-load, cache-buster inutile.

### 3.2 `scripts/validate-build.js` — Validation post-build

```javascript
// 4 vérifications automatiques, exécutées après chaque build :

// 1. Le bundle existe et fait >5 KB
const st = await stat(bundlePath);  // → ❌ si absent, ⚠️ si <5KB

// 2. Le bundle n'est pas vide
const src = await readFile(bundlePath, 'utf-8');
if (src.trim().length === 0) fail('empty');  // → ❌ build cassé

// 3. Le bundle parse comme JavaScript valide
new Function(src);  // → ❌ si syntaxe invalide (erreur de compilation)

// 4. Les 6 fonctions critiques sont présentes
['function renderEpars', 'function renderSource',
 'function renderAll', 'function initApp',
 'function executeCopy', 'function runScan']
  .every(sym => src.includes(sym));  // → ❌ si module manquant
```

**Pourquoi 6 symboles ?** Ces 6 fonctions sont les points d'entrée de l'app :
si l'une manque, l'app ne fonctionne pas. La recherche par string est volontairement
simple (pas d'AST) — elle attrape le cas où un module n'a pas été inclus dans
le bundle (ex: `eparsUI.ts` non imported par `script.ts`).

### 3.3 `package.json` — Scripts simplifiés

```diff
- "build": "rm -rf static/dist && mkdir -p static/dist/commands static/dist/render
-           && esbuild static/src/state.ts static/src/utils.ts static/src/api.ts
-           static/src/render.ts static/src/focus.ts static/src/audio.ts
-           static/src/ui.ts static/src/actions.ts static/src/playlist.ts
-           static/src/ratings.ts static/src/script.ts
-           static/src/commands/registry.ts static/src/commands/navigation.ts
-           ... (25+ fichiers, 800 caractères)
-           --outdir=static/dist --format=esm --sourcemap=inline 2>&1
-           && python3 scripts/bust-cache.py 2>&1"
+ "build": "node build.js && node scripts/validate-build.js"

- "dev": "mkdir -p ... esbuild ... --watch 2>&1"
+ "dev": "node build.js --watch"
```

**Ce qui disparaît :**
- `scripts/bust-cache.py` — supprimé (plus de cache-buster par fichier)
- `mkdir -p static/dist/commands static/dist/render` — plus de sous-dossiers
- Les 25+ entry points — un seul suffit
- Le pipe `2>&1` — plus besoin de rediriger stderr pour le script Python

### 3.4 Intégration Flask — inchangée

```python
# app.py — aucun changement
script_path = os.path.join(STATIC_DIR, 'dist', 'script.js')
cache_buster = str(int(os.path.getmtime(script_path)))  # mtime du bundle
return render_template('index.html', cache_buster=cache_buster)
```

Le `?v={{ cache_buster }}` dans le `<script>` HTML utilise toujours le mtime
de `script.js`. Comme il n'y a qu'un seul fichier, un seul `?v=` suffit.
Le navigateur ne recharge le bundle que si le mtime change (nouveau build).

---

## 4. Quand ajouter un nouveau fichier `.ts`

**Avant :**
1. Créer le fichier `static/src/nouveau.ts`
2. L'ajouter dans `package.json` → `build:` et `dev:` (2 endroits, 800 caractères)
3. Rebuild
4. Prier que `bust-cache.py` ne rate pas un sous-dossier
5. Vérifier dans le navigateur qu'il n'y a pas de 404

**Après :**
1. Créer le fichier `static/src/nouveau.ts`
2. L'importer dans un fichier existant (ex: `import './nouveau.js'` dans `script.ts`)
3. `npm run build` → le bundle l'inclut automatiquement
4. `validate-build.js` vérifie que tout est OK

**Garantie :** si un module est importé (directement ou transitivement) depuis
`script.ts`, il est dans le bundle. Pas de liste manuelle, pas de 404, pas de
double-load.

---

## 5. Validation

### 5.1 Tests automatisés

```bash
npm run build   # → build.js + validate-build.js (vérifie bundle)
npx tsc --noEmit  # → 0 erreur de type
npm test         # → 313 tests (jsdom), inchangés
```

Les tests d'intégration (`integration.test.ts`) importent les sources `.ts`
directement (via `import './script.js'`) — ils ne passent pas par le bundle.
C'est correct : ils testent la logique, pas le build.

### 5.2 Test manuel

```bash
npm start        # → build + Flask sur :8765
# Ouvrir http://localhost:8765
# Vérifier : console sans erreurs, panneaux remplis, status "Online"
```

---

## 6. Décisions

| Décision | Choix | Raison |
|----------|-------|--------|
| Bundler | esbuild API (`--bundle`) | Rapide (9ms), zéro config, déjà dans les devDeps |
| Entry point | `script.ts` uniquement | Point d'entrée unique de l'app, tous les modules en dépendent |
| Format | `esm` (pas `iife`) | Compatible `<script type="module">`, sourcemaps natifs |
| Sourcemap | `linked` en prod, `inline` en dev | Plus léger en prod, debug instantané en dev |
| Code splitting | Non (`--splitting` non utilisé) | Bundle unique = zéro risque de chargement partiel |
| Cache buster | `?v=` dans HTML seulement (mtime) | Simple, robuste, déjà intégré à Flask |
| Validation | `validate-build.js` (4 checks) | Attrape les builds cassés avant déploiement |
| bust-cache.py | Supprimé | Plus nécessaire avec un bundle unique |
| Minification | Non (pour l'instant) | 101 KB acceptable, debug facilité |

---

## 7. FAQ

**Q: Pourquoi ne pas utiliser Vite ?**
R: Vite apporterait un dev server, du HMR, etc. Mais l'app est servie par Flask,
et la complexité supplémentaire (proxy Vite→Flask, config) n'est pas justifiée
pour 20-30 modules sans dépendances npm. `esbuild --watch` + Flask = 2 terminaux,
zéro configuration supplémentaire.

**Q: 101 KB, c'est pas lourd ?**
R: Pour 20+ modules TypeScript avec des fonctions de rendu DOM, c'est raisonnable.
Avec `--minify` on descendrait à ~60 KB. À activer plus tard si besoin.

**Q: Le build est-il plus lent qu'avant ?**
R: Non. Avant : esbuild compilait 25 fichiers séparément (~20ms) + bust-cache.py
(~100ms). Maintenant : esbuild bundle 1 fichier (~9ms) + validate-build.js (~5ms).
Total : ~15ms vs ~120ms.

**Q: Que faire si un module n'est pas inclus dans le bundle ?**
R: `validate-build.js` détecte l'absence des 6 fonctions critiques. Pour les
autres, le navigateur affichera une `ReferenceError` dans la console — ajouter
l'import manquant dans `script.ts` suffit.
