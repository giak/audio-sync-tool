# Rangement par style (EPIC-035) — Plan d'implémentation P1 (+ esquisse P2/P3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (P1) :** poser un style sur un ou plusieurs fichiers épars **au clavier en une touche** (`g` → lettre → éventuellement chiffre de tranche), voir la destination `style_tranche` calculée, et **appliquer par lot** après un aperçu groupé par dossier cible — en réutilisant le flux de copie F5 existant. **Aucune écriture ID3, aucun changement backend en P1.**

**Architecture :** un module pur `styles.ts` dérive la taxonomie (25 styles) des noms de dossiers de `state.sourceFiles` et calcule `dest(style, année)`. Les choix vivent dans `state.styleChoices` (session). La colonne `Style` est une cellule insérée dans les lignes épars **sans modifier `makeFileEl`**. La palette `g` est une **couche DOM focusée** avec son propre `keydown` + `stopPropagation` — **même pattern que `ratingEdit.ts`**, donc zéro champ de contexte registry, zéro binding existant modifié, matrice EPIC-031 : seulement les 2 nouvelles touches `g`/`e`. L'aperçu `e` groupe les choix par dossier cible et enchaîne les copies via `copyFilesTo()`, extrait (sans changement de comportement) du handler batch d'`executeCopy`. `/copy` crée déjà le dossier cible (`os.makedirs`).

**Tech Stack :** TypeScript (DOM, sans framework), vitest (jsdom), esbuild, Flask (inchangé en P1)

**Baseline vérifiée (2026-09-19, HEAD `70129db`) :** 979 vitest / 40 fichiers, 237 pytest, typecheck + lint + build OK.

## Global Constraints

- **P1 = zéro modification de `app.py`, `nml.py`, `scripts/`** ; pytest doit rester à 237 sans y toucher.
- **`fileRow.ts` : `makeFileEl` non modifié** (10 paramètres déjà — la cellule Style est insérée par l'appelant devant `.codec`). Seule `makeFileTable` gagne un paramètre optionnel.
- **`registry.ts` non modifié.** `commands/style.ts` est importé **en dernier** dans `script.ts` (après `years.js`) : les index d'enregistrement des bindings existants ne bougent pas → aucune cellule existante de `keyboardMatrix.test.ts` à renuméroter. Seules des cellules **nouvelles** sont ajoutées (`g`, `e`).
- **Palette = couche DOM** (`tabindex=-1`, `focus()`, `keydown` + `stopPropagation()`), pattern `ratingEdit.ts:153`. Jamais ouverte si `activeModal !== null` ou menu contextuel ouvert (garde dans le binding `g`).
- **Sémantique du filtre inchangée côté source** : `FilterSubject.path` est **optionnel** et n'est fourni que par `eparsUI`. `dirHasMatchingFile`, `twinUnderFilteredDir`, chips source/playlist : intacts, leurs tests ne sont pas modifiés.
- **Extraction `copyFilesTo` = refactor iso-comportement** : les 6 tests `executeCopy` d'`actions.test.ts` passent **sans modification**.
- **Rien n'est copié sans l'aperçu** ; les fichiers sans année (style daté) et les fichiers dont le jumeau (`dupMatches`) est déjà dans le dossier cible sont **exclus** et listés.
- TDD strict par tâche (RED → implé minimale → GREEN → commit). Pas de commit groupé multi-tâches.
- Gate de fin de branche : `npm run typecheck` · `npm test` · `npm run lint` (0 nouvelle erreur) · `npm run build` · `./venv/bin/python -m pytest -q` (237).
- Tout chiffre de la spec (86 dossiers, 25 styles, 1 848 stylés…) sert de **fixture de test**, pas de commentaire.

---

### Task 1 : `styles.ts` — taxonomie pure (parse, tranche, destination, hotkeys)

**Files:**
- Create: `static/src/styles.ts`
- Test: `static/src/styles.test.ts`

**Interfaces:**
```typescript
export interface StyleDef {
  id: string;            // 'techno_acid'
  root: string;          // 'techno'
  timeless: boolean;     // aucun dossier daté n'existe pour ce style
  folders: Set<string>;  // noms de dossiers existants ('techno_acid_1990', …)
  hotkey: string | null; // lettre a-z dérivée, null si épuisé
}
export interface Taxonomy { root: string; styles: Map<string, StyleDef> }
export interface StyleChoice { style: string; tranche: number | null }
export interface Destination { dir: string; name: string; exists: boolean; needsYear: boolean }

export const TRANCHES: readonly number[]; // [1985, 1990, …, 2025] — dérivées des dossiers, complétées à pas 5
export function parseFolderName(name: string): { style: string; tranche: number | null } | null;
export function trancheOf(year: number): number;                     // year - (year % 5)
export function buildTaxonomy(sourceFiles: Record<string, FileIndex>, extraDirs: Iterable<string>): Taxonomy | null;
export function destFor(tax: Taxonomy, styleId: string, year: number | null, forcedTranche?: number | null): Destination | null;
export function yearOf(entry: { year: string | null } | undefined): number | null; // '1994' → 1994, '1994-05' → 1994, sinon null
export function deriveHotkeys(ids: string[]): Map<string, string | null>;  // déterministe : ordre = ids triés par volume décroissant puis alpha
```

Règles :
- Regex : `^(?<style>[a-z]+(?:_[a-z]+)*?)(?:_(?<tranche>\d{4}))?$` ; nom hors grammaire → `null` (ignoré, jamais d'erreur).
- `buildTaxonomy` : racine = unique clé de `sourceFiles` (si 0 clé → `null` ; si > 1, prendre la première — cas non configuré aujourd'hui, à documenter dans le test). Dossiers = 1ᵉʳ segment de `path` de chaque fichier + `basename(extraDir)` pour les extra dirs sous la racine. `timeless = aucune tranche` pour ce style.
- `destFor` : `needsYear = !timeless && year === null && forcedTranche == null` → `dir` = `${root}/${style}_?` n'est **pas** retourné : renvoyer `{ name: style, dir: '', exists: false, needsYear: true }` ; sinon `name = timeless ? style : `${style}_${forcedTranche ?? trancheOf(year)}``, `dir = join(root, name)`, `exists = folders.has(name)`.
- `deriveHotkeys` : 1ʳᵉ lettre libre de l'id dans l'ordre des caractères a-z de l'id (`techno`→t, `techno_acid`→e ? **non** : préférer la 1ʳᵉ lettre de chaque *segment* d'abord : `techno_acid` → a, `techno_hard` → h, `techno_acid_hard` → première libre parmi t,a,h puis lettres restantes) ; épuisé → `null`. Le test fige l'attribution sur les 25 ids réels (ordre par volume du cache : techno, techno_acid, hardcore, trance, …) — l'attribution obtenue est **la** vérité, on la lit dans la palette.

- [ ] **Step 1 : test RED** — `styles.test.ts` avec la fixture des **86 noms réels** (liste littérale) : 86/86 parsés, 25 styles, 7 timeless (`beat_disco, electro_clash, intro, italo_disco, new_beat, techno_disco, trance_old`), tranches = 9 valeurs multiples de 5 ; `trancheOf(1994) === 1990`, `trancheOf(2008) === 2005`, `trancheOf(2025) === 2025` ; `destFor` : daté avec année → `techno_acid_1990` exists ; daté sans année → `needsYear` ; timeless sans année → `italo_disco` exists ; année 1987 → `techno_1985` exists ; forcedTranche prime sur l'année ; style inconnu → `null` ; `yearOf` : `'1994'`, `'1994-05-01'`, `null`, `'abc'`, `''`. `buildTaxonomy` : `sourceFiles` vide → `null` ; extra dir sous la racine ajouté ; extra dir hors racine ignoré ; fichier à la racine (path sans `/`) ignoré. `deriveHotkeys` : 25 ids → toutes les valeurs non nulles distinctes, snapshot littéral de l'attribution.
- [ ] **Step 2 : RUN** `npx vitest run static/src/styles.test.ts` → FAIL (module absent)
- [ ] **Step 3 : implémentation minimale** de `styles.ts` (aucune dépendance DOM, import type `FileIndex` depuis `state.ts`)
- [ ] **Step 4 : RUN** → PASS
- [ ] **Step 5 : commit** `feat(styles): taxonomie pure dérivée des dossiers style_tranche (parse, tranche, destination, hotkeys)`

---

### Task 2 : `filterEngine.ts` — `FilterSubject.path` (filtre par sous-dossier épars)

**Files:**
- Modify: `static/src/filterEngine.ts:14-40`
- Modify: `static/src/render/eparsUI.ts` (les 2 appels `matchesTokens` : ajouter `path: data.path`)
- Test: `static/src/filterEngine.test.ts`, `static/src/render/eparsUI.test.ts`

**Interfaces:**
- `FilterSubject` gagne `path?: string` (chemin **relatif** du fichier dans son dossier épars, ex. `_techno/techno clashy/a.mp3`) ; `matchesTokens` l'ajoute au haystack (plié) quand présent.

- [ ] **Step 1 : tests RED** — `filterEngine.test.ts` : `matchesTokens('schranz', {name:'a.mp3', year:null, codec:null, path:'_schranz/a.mp3'})` → true ; sans `path` → false (comportement historique) ; token AND mixte `schranz 1995` avec year → true. `eparsUI.test.ts` : avec `state.filters['sync-epars']='_schranz'`, un fichier dont `path` = `_schranz/x.mp3` est rendu, un autre `2008_08/y.mp3` ne l'est pas ; compteur `1/2`.
- [ ] **Step 2 : RUN** les 2 fichiers → FAIL
- [ ] **Step 3 : implémentation** (`foldedPath` concaténé au haystack ; `eparsUI` passe `path: data.path` aux deux endroits — boucle de rendu et recomptage)
- [ ] **Step 4 : RUN** `npx vitest run static/src/filterEngine.test.ts static/src/render/eparsUI.test.ts static/src/render/sourceTree.test.ts static/src/utils.test.ts` → PASS (les deux derniers **inchangés** = preuve de non-régression côté source)
- [ ] **Step 5 : commit** `feat(filter): le chip épars matche aussi le sous-dossier (FilterSubject.path optionnel)`

---

### Task 3 : `state.ts` — `styleChoices` + `styleTaxonomy` (session)

**Files:**
- Modify: `static/src/state.ts` (interface `AppState`, `_state`)
- Test: `static/src/state.test.ts`

**Interfaces:**
- `styleChoices: Map<string /*fullpath épars*/, StyleChoice>` (import type depuis `styles.ts`).
- Pas de taxonomie en state : elle se **recalcule** depuis `sourceFiles` + `sourceExtraDirs` à l'ouverture de la palette / de l'aperçu (86 dossiers, 1 430 entrées : négligeable ; évite un état dérivé à invalider).

- [ ] **Step 1 : test RED** — `state.test.ts` : valeur initiale `Map` vide ; l'affectation d'une nouvelle Map émet `styleChoices:changed` (pattern des tests existants sur `emit`).
- [ ] **Step 2 : RUN** → FAIL
- [ ] **Step 3 : implémentation** (2 lignes + import type)
- [ ] **Step 4 : RUN** → PASS
- [ ] **Step 5 : commit** `feat(state): styleChoices — choix de style de session par fichier épars`

---

### Task 4 : colonne `Style` dans le tableau épars (cellule insérée, `makeFileEl` intact)

**Files:**
- Create: `static/src/render/styleCell.ts`
- Modify: `static/src/render/fileRow.ts:22-32` (`makeFileTable(withCuesCol, withStyleCol = false)` → 7 colonnes + classe `has-style`)
- Modify: `static/src/render/eparsUI.ts` (table `makeFileTable(false, true)` ; après `makeFileEl(...)` : `insertStyleCell(row, fullpath, data)`)
- Modify: `static/style.css:193-199` (widths pour `.file-table.has-style`), `+ .style-cell` / `.style-chip` (états `chosen`, `pending-year`)
- Test: `static/src/render/styleCell.test.ts`, `static/src/render/eparsUI.test.ts`, `static/src/render/fileRow.test.ts` (1 test `makeFileTable(false, true)` → 7 `col` + classe)

**Interfaces:**
```typescript
export function insertStyleCell(row: HTMLTableRowElement, fullpath: string, entry: { year: string | null }): HTMLTableCellElement;
// td.style-cell inséré AVANT row.querySelector('.codec') ; contenu :
//   choix présent → <span class="style-chip chosen">techno_acid</span>, title = "→ techno_acid_1990" | "→ techno_acid_? (année manquante — g puis chiffre)" | "→ ➕ techno_percu_2010 (sera créé)"
//   sinon → '' (cellule vide, colonne préservée)
export function refreshStyleCell(fullpath: string): void; // re-rend la cellule de la ligne [data-focuspath] si présente dans #epars-container
```
- Clic sur la cellule → `openStylePalette([fullpath], row)` (import dynamique pour éviter le cycle render ↔ palette, pattern `executeReplace` dans `fileRow.ts`).
- Widths `.file-table.has-style` : 22 / 100% / 26 / 44 / **96** (style) / 110 / 60. Les autres tables gardent les widths existantes (sélecteur `.file-table:not(.has-style)` inutile : la classe ajoute des règles plus spécifiques pour les nth-child 5-7).

- [ ] **Step 1 : tests RED** — `styleCell.test.ts` : cellule insérée avant `.codec` ; vide sans choix ; chip + title destination avec choix (daté/année ; daté/sans année ; timeless ; dossier inexistant) ; `refreshStyleCell` met à jour en place. `eparsUI.test.ts` : chaque ligne épars a une `.style-cell`, la table a 7 `col` et `.has-style`. `fileRow.test.ts` : `makeFileTable(false)` reste 6 col sans classe (non-régression), `makeFileTable(false, true)` 7 col + classe.
- [ ] **Step 2 : RUN** → FAIL
- [ ] **Step 3 : implémentation** (styleCell + 3 lignes dans eparsUI + paramètre optionnel dans makeFileTable + CSS)
- [ ] **Step 4 : RUN** `npx vitest run static/src/render/` → PASS
- [ ] **Step 5 : vérification visuelle rapide** (serveur + données réelles) : la colonne fichier ne passe pas sous ~40 % de la largeur du panneau à 1280 px ; sinon réduire style à 84 px. Noter la mesure dans le commit.
- [ ] **Step 6 : commit** `feat(ui): colonne Style dans le tableau épars (cellule insérée, colgroup 7, makeFileEl intact)`

---

### Task 5 : palette `g` — couche DOM focusée (chord lettre → chiffre → Enter)

**Files:**
- Create: `static/src/render/stylePalette.ts`
- Modify: `static/style.css` (`.style-palette`, `.sp-key`, `.sp-tranche`, `.sp-dest`)
- Test: `static/src/render/stylePalette.test.ts`

**Interfaces:**
```typescript
export function openStylePalette(targets: string[], anchor: HTMLElement): void;
export function closeStylePalette(): void;
export function isStylePaletteOpen(): boolean;
```
Comportement (tout dans le `keydown` du popover, `e.stopPropagation()` + `preventDefault()` sur les touches consommées) :
- Ouverture : taxonomie recalculée ; titre = nom du fichier (1 cible) ou `N fichiers` ; grille des styles (`<kbd>hotkey</kbd> id`, cliquables) ; ligne destination vide ; `popover.focus()`.
- Lettre = hotkey d'un style → sélection ; si **tous** les targets ont une année (ou style timeless) → **commit immédiat** ; sinon → étape tranche : 9 boutons `1 1985 … 9 2025`, chiffre → tranche forcée pour les fichiers **sans** année seulement (ceux qui en ont gardent la leur) → commit. `Enter` à l'étape tranche = commit **sans** tranche (le style est posé, la ligne reste « année manquante »).
- Lettre inconnue : ignorée (pas de fermeture). `Backspace` : retire le choix des targets, ferme. `Escape` : ferme sans rien changer.
- Commit : `state.styleChoices = new Map([...state.styleChoices, ...])` (nouvelle Map → événement), `refreshStyleCell` pour chaque target, fermeture, **focus rendu à la ligne ancre** puis `navigateFocus(1)` si 1 seule cible (chaîne de tri) — pour un lot, focus rendu à l'ancre seulement.
- Fermeture : `popover.remove()`, `focus` → ancre (`focusItemByElement(container, anchor)`).
- Souris : clic sur un style = même chemin que la hotkey ; clic hors palette → `Escape`.

- [ ] **Step 1 : tests RED** (jsdom, `state.sourceFiles` fixture avec 5-6 dossiers réels, `state.eparsFiles` 2 fichiers dont 1 sans année) : ouverture → popover focusé, contient `techno_acid` avec sa hotkey ; lettre sur fichier avec année → choix `{style, tranche:null}` + fermeture + `navigateFocus(1)` appelé (mock `focus.js`) ; lettre sur fichier sans année → étape tranche visible, `3` → `{style, tranche:1995}` ; `Enter` à l'étape tranche → `{style, tranche:null}` ; `Escape` → aucune écriture ; `Backspace` → choix supprimé ; lettre inconnue → palette toujours ouverte ; **le keydown ne remonte pas** (`document` listener espion non appelé) ; lot 2 fichiers → 2 entrées ; style timeless sur fichier sans année → commit immédiat.
- [ ] **Step 2 : RUN** → FAIL
- [ ] **Step 3 : implémentation**
- [ ] **Step 4 : RUN** → PASS
- [ ] **Step 5 : commit** `feat(ui): palette g — choix de style au clavier (chord lettre → tranche), couche DOM pattern ratingEdit`

---

### Task 6 : `commands/style.ts` — bindings `g` et `e` + matrice + légende

**Files:**
- Create: `static/src/commands/style.ts`
- Modify: `static/src/script.ts:16` (ajouter `import './commands/style.js';` **après** `years.js`)
- Test: `static/src/commands/style.test.ts`, `static/src/commands/keyboardMatrix.test.ts` (cellules **ajoutées**), `static/src/render/legend.test.ts` (bijection : rien à écrire si les labels sont présents — vérifier qu'il passe)

**Interfaces:**
```typescript
// g — page sync, panneau épars, hors input/modale/menu
registry.bind({ key: 'g', page: 'sync', activePanel: 'epars', isInput: false, activeModal: null, isContextMenuOpen: false,
  label: 'Poser un style (palette : lettre, puis chiffre de tranche)', group: 'sync', handler: openPaletteOnFocus });
// e — page sync, hors input/modale
registry.bind({ key: 'e', page: 'sync', isInput: false, activeModal: null, isContextMenuOpen: false,
  label: 'Aperçu du rangement par style (copie par dossier cible)', group: 'sync', handler: () => void openStylePreview() });
```
- `openPaletteOnFocus` : cibles = `state.selectedEparsFiles` (fullpaths) si non vide, sinon la ligne `#epars-container .focused.file-row` (`dataset.focuspath`) ; aucune → message barre d'état « Met d'abord en surbrillance un fichier épars (↑↓) ». Ancre = ligne focusée (ou 1ʳᵉ ligne sélectionnée visible).
- Matrice : cellules nouvelles — `g` sync/épars → index du binding `g` ; `g` sync/source → aucun gagnant ; `g` dans un input → aucun ; `g` page dups → aucun ; `g` modale ouverte → aucun ; `e` sync → index `e` ; `e` page years → binding years (index existant, inchangé) ; `Ctrl+e` playlist → binding playlist existant. Les index des nouveaux bindings = `registry.list().length - 2/-1` (dérivés, shuffle-proof comme les autres).

- [ ] **Step 1 : tests RED** — `style.test.ts` : dispatch `g` avec focus épars → `openStylePalette([fullpath], row)` (mock `stylePalette.js`) ; avec 2 sélectionnés → 2 cibles ; sans focus → message ; `e` → `openStylePreview` (mock). Matrice : cellules ci-dessus.
- [ ] **Step 2 : RUN** `npx vitest run static/src/commands/` → FAIL
- [ ] **Step 3 : implémentation** + import dans `script.ts`
- [ ] **Step 4 : RUN** `npx vitest run static/src/commands/ static/src/render/legend.test.ts` → PASS (bijection verte grâce aux `label`)
- [ ] **Step 5 : commit** `feat(keys): g palette de style + e aperçu du rangement (page sync) — matrice + légende`

---

### Task 7 : `actions.ts` — extraction `copyFilesTo` (refactor iso-comportement)

**Files:**
- Modify: `static/src/actions.ts:196-271`
- Test: `static/src/actions.test.ts` (les 6 tests `executeCopy` **inchangés** ; +1 test direct)

**Interfaces:**
```typescript
export async function copyFilesTo(destDir: string, files: Array<{ filename: string; eparDir: string; fullpath: string }>): Promise<number>;
// = corps actuel du confirmBtn.onclick batch, de `let copied = 0` à `revealSourceDir(destDir)` inclus + revalidateFocus ; retourne copied.
// executeCopy (batch) devient : closeAllModals(); const copied = await copyFilesTo(destDir, files); statusText = …
```
- Détail à préserver : `state.journal = await api('/journal')`, `state.selectedEparsFiles = new Map()`, `state.sourceFiles = {...}` (déclencheur), `revealSourceDir`, double `requestAnimationFrame(revalidateFocus)`.

- [ ] **Step 1 : test RED** — `copyFilesTo('/src/techno_1995', [f])` avec fetch mocké `/copy` ok → résout `1`, `state.sourceFiles[root]['f.mp3'].path === 'techno_1995/f.mp3'`, `revealSourceDir` appelé ; `/copy` KO → `0`, state intact.
- [ ] **Step 2 : RUN** → FAIL (export absent)
- [ ] **Step 3 : refactor** (déplacement de code, aucune ligne de logique modifiée)
- [ ] **Step 4 : RUN** `npx vitest run static/src/actions.test.ts static/src/render.test.ts` → PASS, **0 test existant modifié**
- [ ] **Step 5 : commit** `refactor(actions): copyFilesTo extrait du batch F5 (iso-comportement, réutilisable par l'aperçu style)`

---

### Task 8 : aperçu `e` — plan groupé par dossier cible → copies enchaînées

**Files:**
- Create: `static/src/render/stylePreview.ts`
- Modify: `static/style.css:882` (`#dialog-msg { white-space: pre-line; }` — les messages existants sont mono-ligne, sans impact)
- Test: `static/src/render/stylePreview.test.ts`

**Interfaces:**
```typescript
export interface PlanGroup { dest: Destination; files: Array<{ filename: string; eparDir: string; fullpath: string }> }
export interface RangementPlan { groups: PlanGroup[]; noYear: string[]; twinInDest: string[]; unknownStyle: string[] }
export function buildRangementPlan(): RangementPlan;   // pur sur state : styleChoices × eparsFiles × taxonomie × dupMatches
export function formatPlan(plan: RangementPlan): string; // texte multi-ligne pour confirmDialog
export async function openStylePreview(): Promise<void>; // plan vide → barre d'état ; sinon confirmDialog(formatPlan, apply, 'Appliquer N copies')
```
- `buildRangementPlan` : pour chaque choix → entrée épars (`eparDir` = clé de `state.eparsFiles` préfixe du fullpath, `filename` = basename) ; `destFor(tax, style, yearOf(entry), tranche)` ; `needsYear` → `noYear` ; `dupMatches.get(fullpath)?.sourceFullPath` commence par `dest.dir + '/'` → `twinInDest` ; style absent de la taxonomie (dossiers renommés) → `unknownStyle` ; sinon groupé par `dest.dir`, groupes triés par nom.
- `formatPlan` :
  ```
  → techno_acid_2020      38 fichiers
  → hardcore_1995          7 fichiers
  → ➕ techno_percu_2010    2 fichiers (sera créé)
  ⚠ 12 sans année — ignorés (g puis chiffre pour trancher)
  ⤷ 3 déjà rangés dans le dossier cible — ignorés
  ```
- Apply : `for (const g of plan.groups) copied += await copyFilesTo(g.dest.dir, g.files)` (séquentiel : `copyFilesTo` mute `state.sourceFiles` et recharge le journal) ; puis retirer des `styleChoices` **uniquement** les fullpaths copiés (échecs et ignorés restent choisis) ; `showToast('✓ N/M copiés · K dossiers')` ; `renderEpars()` n'est pas appelé explicitement (le re-render event-driven suit `sourceFiles:changed`).
- Barre récap : dans `#epars-status-line` (`eparsUI.ts`), ajouter `<span class="s-style">🏷 N assignés · e = aperçu</span>` quand `styleChoices.size > 0` (N = choix appartenant à des fichiers épars présents). `renderEpars` est déjà re-déclenché par les événements ; ajouter la souscription `styleChoices:changed → renderEpars` dans `render.ts` **seulement si** le compteur ne se met pas à jour autrement (vérifier le count `on()` figé dans `render.test.ts` — s'il faut l'incrémenter, le faire consciemment dans le même commit).

- [ ] **Step 1 : tests RED** — `buildRangementPlan` : 2 styles × 3 fichiers → 2 groupes triés ; sans année → `noYear` ; timeless sans année → groupe ; jumeau sous dest → `twinInDest` ; jumeau ailleurs → groupe ; style inconnu → `unknownStyle` ; `formatPlan` snapshot littéral ; `openStylePreview` : plan vide → message, sinon `confirmDialog` appelé (mock `ui.js`) et confirmation → `copyFilesTo` appelé par groupe (mock `actions.js`), choix copiés retirés, choix KO conservés.
- [ ] **Step 2 : RUN** → FAIL
- [ ] **Step 3 : implémentation** (+ span récap + CSS)
- [ ] **Step 4 : RUN** `npx vitest run static/src/render/` → PASS
- [ ] **Step 5 : commit** `feat(ui): aperçu e — plan de rangement groupé par dossier cible, copies enchaînées via copyFilesTo`

---

### Task 9 : validation complète, live sur données réelles, docs

**Files:**
- Modify: `docs/superpowers/epics/EPIC-035-rangement-par-style.md` (cases P1, statut 🔵 puis 🟢 P1, traçabilité)
- Modify: `docs/superpowers/epics/README.md` (statut + « État actuel »)
- Modify: `README.md` (section courte « Rangement par style : g / e »), `AGENT.md` (architecture : styles.ts, palette = couche DOM)

- [ ] **Step 1 :** `npm run typecheck` → 0 erreur
- [ ] **Step 2 :** `npm test` → 979 + nouveaux, **0 test existant modifié hors** `keyboardMatrix.test.ts` (cellules ajoutées) et `render.test.ts` (count `on()` si Task 8 l'exige — à justifier dans le commit)
- [ ] **Step 3 :** `npm run lint` → 0 nouvelle erreur · `npm run build` → OK
- [ ] **Step 4 :** `./venv/bin/python -m pytest -q` → 237 (P1 ne touche pas le backend — c'est une assertion, pas une formalité)
- [ ] **Step 5 : live, profil « travail », fetch `/copy` mocké** (aucune écriture disque) — 3 scénarios à prouver :
  1. F7 `_schranz` → filtre montre les 77 fichiers (preuve Task 2 sur données réelles) → Espace sur 3 lignes → `g` → hotkey `techno_hard` → tranche pour les sans-année → 3 chips « choisi ».
  2. `e` → aperçu groupé (au moins un dossier « sera créé ») → Appliquer → toast, chips retirées, dossier révélé à droite (EPIC-034), pastille « déjà rangé » sur les jumeaux.
  3. Palette ouverte : ↑↓ / Espace / F5 / Échap **n'atteignent pas** le registry (aucune navigation, aucun dialog F5) ; Échap ferme la palette et rien d'autre (pas de stop audio).
  Consigner les captures/mesures dans l'EPIC.
- [ ] **Step 6 :** docs (EPIC-035 : cocher P1, commits ; README index ; README.md ; AGENT.md)
- [ ] **Step 7 : commit** `docs(epic): EPIC-035 P1 livré — rangement par style au clavier (palette g, aperçu e)`

---

## P2 — Suggestions locales — ✅ livré 2026-09-19 (commit `09705b3`)

Ordre proposé et décisions déjà prises (spec) — as-built ci-dessous :
1. ✅ `app.py` `get_audio_meta` → **4-tuple** `(year, duration, codec, genre)`
   (TCON / GENRE+STYLE / ©gen, additif ; 3 appelants mis à jour : `_resp` de `/copy`,
   maj cache `/copy`, `_move_cache_update`) + `FileIndex.genre` (**optionnel** —
   zéro fixture de test modifiée) + `_build_source_index` (artiste→styles au scan,
   servi par `/scan` et `/load` via `source_index`) — 5 pytest nouveaux/fixés
   (2 genre, 2 source_index, 1 `/load` vide).
2. ✅ `static/src/styleSuggest.ts` (pur, 19 tests) : alias par défaut embarqués
   (21 genres, 17 segments — `schranz→techno_hard`, `goa→trance`,
   `acid/acid techno→techno_acid`…) ; **tous les segments** du chemin (`pathSegments`,
   du plus profond au plus superficiel, `_` leading retiré, le plus profond aliasable
   gagne) ; genre ID3 aliasé ; choix de session du même sous-dossier épars ; voisinage
   artiste via `sourceIndex` + `parseArtistTitle` (portage TS **simplifié** de
   `artist_title()`). Cumul pondéré **chemin 0,50 · artiste 0,40 · session 0,20 ·
   genre 0,15** (confiance = score/1,25, seuil 0,25), ex æquo → `null`.
   ⚠ **Non fait** : borne d'acquisition (`YYYY_MM` → tranche ≤ `trancheOf(YYYY)`) et
   `_oldies` → 1990 — le moteur ne suggère pas de tranche, l'étape tranche de la
   palette reste le chemin normand ; `data/styles.json` non servi (P4).
3. ✅ Chip « suggéré » (`style-chip.suggested` pointillé + % en tooltip) dans
   `styleCell` quand aucun choix ; `Enter` = accepter dans la palette (hint
   « → style (N %) — Enter = accepter » sur cible unique ; hotkey prime ; lot →
   hint standard). Tooltip évidences détaillées **réduit au seul %** (KISS).
4. ⏳ **Calibration** : mesurer sur les 1 848 fichiers stylés au 1ᵉʳ segment le taux
   d'accord suggestion/segment (doit être ~100 % par construction) puis, sur un
   échantillon de 50 fichiers sans signal de chemin, le taux d'acceptation réel de
   l'utilisateur — c'est cette mesure qui fixe les poids, pas la spec.
5. ⏳ `data/styles.json` optionnel (hotkeys figées, alias supplémentaires) servi via
   `/load` — seulement si les hotkeys dérivées gênent à l'usage.

Gate P2 : typecheck 0 · 1 091 vitest / 46 fichiers (+25) · lint 0 · build OK ·
pytest 302 (+4).

## P3 — Écriture TCON (export → script, pattern EPIC-033 P2) — ✅ livré 2026-09-19 (commit `e6dfa82`)

1. ✅ `POST /styles/review` → `data/style_review.json` (fusion, 400 hors taxonomie —
   dérivée du cache disque via `_known_styles()`) + export automatique depuis l'aperçu
   (`applyRangementPlan` POST les choix copiés ; échec non bloquant).
2. ✅ `scripts/apply_styles.py` : dry-run défaut, `--apply`, `--undo`, `--report` ;
   MP3 `TCON` (v2.3/v2.4), FLAC `GENRE`, WAV chunk ID3, M4A `©gen` ; journal
   `data/style_apply_journal.jsonl` avec `old_genre` ; `--undo` restaure (ou retire le
   tag si absent avant) ; idempotent ; tag l'épars **et** la copie rangée (retrouvée
   par nom de fichier dans le cache). 14 tests sur fichiers minimaux réels (fabriques
   de `test_apply_years.py` + `make_m4a`).
3. ✅ État « écrit ✓ » = `genre` du scan == style → chip vert `✓` (`style-chip.written`).

Gate P3 : typecheck 0 · 1 095 vitest (+4) · lint 0 · build OK · pytest 317 (+15).

## Risques suivis pendant P1

| Risque | Garde |
|---|---|
| Colgroup fixe : colonne fichier trop étroite | mesure live Task 4 step 5, seuil ~40 % |
| Cycle d'import render ↔ palette ↔ actions | imports dynamiques (`void import(...)`) comme `fileRow.ts` → `executeReplace` |
| `document` keydown de `ui.ts` (`trapFocus`) | palette exige `activeModal === null` ; test « keydown ne remonte pas » |
| Re-render `renderEpars` sur 5 092 lignes à chaque choix | `refreshStyleCell` en place ; re-render complet seulement sur `sourceFiles:changed` (déjà le cas après copie) |
| Matrice : import `style.js` ailleurs qu'en dernier | test de cellule `g` dérivé de `registry.list().length` ; revue du diff `script.ts` |
| `white-space: pre-line` sur `#dialog-msg` | grep des `dialog-msg` existants : tous mono-ligne (vérifié : `actions.ts`, `ui.ts`) |
