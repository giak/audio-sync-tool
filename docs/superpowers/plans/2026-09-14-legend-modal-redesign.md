# Popup « Raccourcis & Légende » — refonte modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrandir la popup ❓ Raccourcis & Légende (modal-xl 860–1200px), la réorganiser en grille 4 colonnes (Légende / Sync / Playlist / Cue editor) et compléter le contenu manquant (badges NML, raccourcis cue editor, note Échap).

**Architecture:** Changement purement statique `templates/index.html` + `static/style.css`. Une nouvelle classe `.modal-content.modal-xl` côtoie `.modal-lg` (ligne 767) ; `#legend-grid` passe de `flex` à une grille 4 colonnes avec replis responsive (1100px → 2 cols, 640px → 1 col). Led-badges conservés, badges NML ajoutés en chips `.badge-demo`. Aucun JS touché — le binding de fermeture (Échap/✕, testé dans `modals.test.ts`) reste intact.

**Tech Stack:** HTML statique (Jinja, `templates/index.html`), CSS (`static/style.css`), vitest pour la suite existante.

## Global Constraints

- Copie exacte du texte des rows actuels (seule harmonisation autorisée : « Filtrer les fichiers » en colonne Playlist).
- Textes des chips NML identiques à l'UI playlist : `✓ NML`, `≈ homonymes`, `✕ non importé`.
- Pas de modification de JS (`static/src/`) — aucun test vitest ne doit changer.
- Styles LED existants (`.led-demo-*`) conservés ; `kbd` passe à `12.5px`.
- Supprimer la section « Navigation pages ».
- Validation finale : `npm run build` + `npm run typecheck` + `npm run lint` + `npm test` (730 verts) + smoke test navigateur.

---

### Task 1: HTML — colonne Légende (badges) + modal-xl

**Files:**
- Modify: `templates/index.html:143-192` (modal-legend)

**Interfaces:**
- Consumes: rien (HTML statique).
- Produces: la structure `#legend-grid > .legend-section` (h4 + `.legend-row`) et la classe `modal-xl` attendues par la CSS (Task 2). Rows Légende : 4 `.led-demo-*` + `✅` + 3 chips `.badge-demo`.

- [ ] **Step 1: Passer la modal en `modal-xl`**

Dans `templates/index.html:145`, remplacer :
```html
    <div class="modal-content">
```
par :
```html
    <div class="modal-content modal-xl">
```

- [ ] **Step 2: Remplacer le contenu de `#legend-grid` par la colonne Légende**

Remplacer le bloc entier `#legend-grid` (lignes 150-190) par la première colonne (les 3 autres colonnes et le footer arrivent aux tasks suivantes — le plan sera exécuté de façon synchrone, la grille peut être incomplète entre les tasks) :

```html
    <div id="legend-grid">
      <div class="legend-section">
        <h4>Légende</h4>
        <div class="legend-row"><span class="led-demo led-demo-nouveau"></span> Nouveau — pas dans la source</div>
        <div class="legend-row"><span class="led-demo led-demo-doublon"></span> Doublon — déjà présent</div>
        <div class="legend-row"><span class="led-demo led-demo-traite"></span> Traité — copié</div>
        <div class="legend-row"><span class="led-demo led-demo-playing"></span> En lecture</div>
        <div class="legend-row"><span class="badge-demo">✅</span> Dans la playlist active</div>
        <div class="legend-row"><span class="badge-demo">✓ NML</span> Matché dans la collection Traktor</div>
        <div class="legend-row"><span class="badge-demo">≈ homonymes</span> Plusieurs entrées NML</div>
        <div class="legend-row"><span class="badge-demo">✕ non importé</span> Absent du NML</div>
      </div>
```

- [ ] **Step 3: Vérifier le HTML**

Run: `npx prettier --check templates/index.html` — si prettier n'est pas configuré pour le HTML, exécuter `npm run lint` puis un contrôle manuel du fichier (structure des 8 `.legend-row`).
Expected: pas d'erreur de parse, 8 rows dans la colonne Légende.

- [ ] **Step 4: Smoke test min** (pas de +)

Run: `npm run build && npm run typecheck`
Expected: build OK (bundle servi), typecheck 0 erreur (aucun JS modifié).

- [ ] **Step 5: Commit**

```bash
git add templates/index.html
git commit -m "feat(ui): legend modal en modal-xl + colonne Légende (LED + badges NML)"
```

---

### Task 2: CSS — `modal-xl`, grille 4 colonnes, `.badge-demo`

**Files:**
- Modify: `static/style.css:492-516` (bloc legend) et `static/style.css:766-769` (après `.modal-lg`)

**Interfaces:**
- Consumes: `.modal-content.modal-xl` et `.legend-section` / `.legend-row` / `.badge-demo` posés dans le HTML (Task 1, 3, 4).
- Produces: les styles attendus par le HTML — grille 4 cols, replis responsive, `#legend-footer`, `kbd` 12.5px.

- [ ] **Step 1: Ajouter `.modal-content.modal-xl`**

Après la règle `.modal-content.modal-lg` (ligne 768-769), ajouter :
```css
.modal-content.modal-xl {
  min-width: 860px; max-width: 1200px;
}
```

- [ ] **Step 2: Réécrire le bloc legend**

Remplacer le bloc `/* ===== Legend (inside modal) ===== */` (lignes 492-516) par :

```css
/* ===== Legend (inside modal) ========================================= */
#legend-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 24px 32px;
}
.legend-section h4 {
  font-size: 13px; font-weight: 600; color: var(--accent);
  margin: 0 0 8px; padding-bottom: 4px;
  border-bottom: 1px solid var(--border-panel);
}
.legend-row {
  font-size: 13px; color: var(--text-secondary);
  padding: 2px 0;
  display: grid; grid-template-columns: max-content 1fr;
  gap: 8px; align-items: baseline;
}
/* LED demos in legend share base size, override per status */
.led-demo {
  display: inline-block;
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0; align-self: center;
}
.led-demo-nouveau { background: var(--led-blue); box-shadow: 0 0 6px var(--led-blue); }
.led-demo-doublon { background: var(--led-grey); }
.led-demo-traite  { background: var(--led-green); box-shadow: 0 0 6px var(--led-green); }
.led-demo-playing { background: var(--led-cyan);  box-shadow: 0 0 8px var(--led-cyan); }
/* Chips badges NML (✓ / ≈ / ✕) et ✅ — cohérents avec matchStatus.ts */
.badge-demo {
  font-family: var(--font-mono, monospace);
  font-size: 12px; white-space: nowrap;
  color: var(--text-primary);
  border: 1px solid var(--border-panel);
  border-radius: 3px; padding: 1px 5px;
  align-self: center;
}
.legend-row kbd {
  font-size: 12.5px;
  background: var(--bg-hover); color: var(--text-primary);
  border: 1px solid var(--border-panel);
  padding: 2px 5px; margin: 0 2px; border-radius: 2px;
}
/* Pied de modal : notes transverses */
#legend-footer {
  margin-top: 16px; padding-top: 10px;
  border-top: 1px solid var(--border-panel);
  font-size: 12px; color: var(--text-muted);
  display: flex; gap: 24px; flex-wrap: wrap;
}
```

- [ ] **Step 3: Ajouter les replis responsive**

À la suite du bloc legend, ajouter :

```css
@media (max-width: 1180px) { .modal-content.modal-xl { width: 92vw; } }
@media (max-width: 1100px) { #legend-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px)  { #legend-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 erreur Biome (fichier non TS — `biome check static/src/` ne scanne que `static/src/`, la CSS n'est donc pas contrôlée ; vérifier qu'il n'y a pas d'autre lint sur CSS).

- [ ] **Step 5: Commit**

```bash
git add static/style.css
git commit -m "feat(ui): legend — modal-xl, grille 4 colonnes responsive, badge-demo, footer"
```

---

### Task 3: HTML — colonne Raccourcis (Sync) et (Playlist)

**Files:**
- Modify: `templates/index.html:150-190` (dans `#legend-grid`, après la colonne Légende)

**Interfaces:**
- Consumes: la structure colonne de Task 1.
- Produces: 2 `.legend-section` dont les rows sont repris textuellement de l'existant (rows 165-174 et 176-189 de l'ancien HTML).

- [ ] **Step 1: Ajouter la colonne Sync**

Après la colonne Légende, insérer :

```html
      <div class="legend-section">
        <h4>Raccourcis (Sync)</h4>
        <div class="legend-row"><kbd>↑↓</kbd> Naviguer fichiers/dossiers</div>
        <div class="legend-row"><kbd>←→</kbd> Navigation colonnes (Source Data)</div>
        <div class="legend-row"><kbd>Shift</kbd> + <kbd>←→</kbd> Seek audio ±20s</div>
        <div class="legend-row"><kbd>Tab</kbd> Basculer panneau</div>
        <div class="legend-row"><kbd>Entrée</kbd> Jouer / Déplier dossier</div>
        <div class="legend-row"><kbd>Espace</kbd> Sélectionner fichier</div>
        <div class="legend-row"><kbd>F5</kbd> Copier → dossier</div>
        <div class="legend-row"><kbd>F7</kbd> / <kbd>/</kbd> Filtrer dossiers</div>
        <div class="legend-row"><kbd>N</kbd> Noter le fichier (0-100)</div>
        <div class="legend-row"><kbd>Échap</kbd> Fermer modale / Annuler filtre / Stopper audio</div>
      </div>
```

- [ ] **Step 2: Ajouter la colonne Playlist**

Après la colonne Sync, insérer :

```html
      <div class="legend-section">
        <h4>Raccourcis (Playlist)</h4>
        <div class="legend-row"><kbd>↑↓</kbd> Naviguer source / pistes</div>
        <div class="legend-row"><kbd>Tab</kbd> Basculer source ↔ sidebar</div>
        <div class="legend-row"><kbd>Entrée</kbd> Jouer le fichier</div>
        <div class="legend-row"><kbd>Espace</kbd> Ajouter/retirer morceau</div>
        <div class="legend-row"><kbd>N</kbd> Noter le morceau (0-100)</div>
        <div class="legend-row"><kbd>F7</kbd> / <kbd>/</kbd> Filtrer les fichiers</div>
        <div class="legend-row"><kbd>Suppr</kbd> / <kbd>←</kbd> Retirer du sidebar</div>
        <div class="legend-row"><kbd>Ctrl</kbd> + <kbd>S</kbd> Sauvegarder la playlist</div>
        <div class="legend-row"><kbd>Ctrl</kbd> + <kbd>E</kbd> Exporter la playlist</div>
        <div class="legend-row"><kbd>Ctrl</kbd> + <kbd>↑↓</kbd> Réorganiser les pistes</div>
        <div class="legend-row"><kbd>Échap</kbd> Fermer modale / Annuler filtre / Stopper audio</div>
      </div>
```

- [ ] **Step 3: Vérifier les libellés**

Relire les rows : seuls les changements autorisés sont « Filtrer les fichiers » (Playlist) et la séparation `Shift`/`Ctrl` en deux `kbd` (alignement en mini-grille). Les 10 rows Sync et 11 rows Playlist sont tous présents.

- [ ] **Step 4: Commit**

```bash
git add templates/index.html
git commit -m "feat(ui): legend — colonnes Raccourcis Sync + Playlist"
```

---

### Task 4: HTML — colonne Raccourcis (Cue editor) + `#legend-footer`

**Files:**
- Modify: `templates/index.html:150-190` (dans `#legend-grid`, après la colonne Playlist) et fermeture de `#legend-grid`

**Interfaces:**
- Consumes: colonnes des tasks 1 et 3.
- Produces: la 4e colonne + le pied de modal. Le HTML final a exactement 4 colonnes et 1 footer.

- [ ] **Step 1: Ajouter la colonne Cue editor**

Après la colonne Playlist, insérer (puis fermer `#legend-grid` par `</div>` immédiatement après) :

```html
      <div class="legend-section">
        <h4>Raccourcis (Cue editor)</h4>
        <div class="legend-row"><kbd>←→</kbd> Seek ±5s</div>
        <div class="legend-row"><kbd>+</kbd> / <kbd>−</kbd> Zoom (molette aussi)</div>
        <div class="legend-row"><kbd>1–8</kbd> Poser un cue (slots A–H)</div>
        <div class="legend-row"><kbd>C</kbd> Poser un cue au curseur</div>
        <div class="legend-row"><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> Annuler / rétablir</div>
        <div class="legend-row"><kbd>⟳</kbd> <kbd>Loop</kbd> / <kbd>🔁</kbd> <kbd>Play</kbd> Dessiner / lire une boucle</div>
        <div class="legend-row"><kbd>← 1/4</kbd> / <kbd>→ 1/4</kbd> Calage grille (phase)</div>
        <div class="legend-row"><kbd>◎ Beat 1</kbd> Poser le premier beat</div>
        <div class="legend-row"><kbd>🔍 Analyser</kbd> Analyse serveur (BPM + phase)</div>
        <div class="legend-row"><kbd>💾 Grille</kbd> Écrire dans le collection.nml</div>
        <div class="legend-row"><kbd>Suppr</kbd> / clic droit Retirer / supprimer un cue</div>
        <div class="legend-row">Double-clic Renommer / recolorer le cue</div>
      </div>
    </div>
```

- [ ] **Step 2: Ajouter `#legend-footer`**

Juste avant la fermeture de `.modal-content` (après `</div>` de `#legend-grid`), insérer :

```html
    <div id="legend-footer">
      <span><kbd>Échap</kbd> ne quitte plus la page Playlist — cliquer <kbd>📦 Sync</kbd> pour revenir</span>
      <span>Seek : <kbd>Shift + ←→</kbd> ±20s (Sync) · <kbd>←→</kbd> ±5s (cue editor)</span>
    </div>
```

- [ ] **Step 3: Compter les colonnes**

Lire `templates/index.html` : `#legend-grid` doit contenir exactement 4 `.legend-section` (Légende, Sync, Playlist, Cue editor) et plus AUCUNE section « Navigation pages ».

- [ ] **Step 4: Suite de tests complète**

Run: `npm test`
Expected: `Test Files 29 passed (29)` / `Tests 730 passed (730)`.

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 0 erreur partout, bundle servi.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html
git commit -m "feat(ui): legend — colonne Cue editor + pied de modal (notes Échap/seek)"
```

---

### Task 5: Validation finale & traçabilité

**Files:**
- Modify: `docs/superpowers/specs/2026-09-14-legend-modal-redesign-design.md` (table Traçabilité)
- Modify: `docs/superpowers/epics/README.md` + nouveau `docs/superpowers/epics/EPIC-023-<slug>.md` — à créer via le gabarit `_template.md` (convention du registre : toute évolution = une EPIC).

**Interfaces:**
- Consumes: tout le travail des tasks 1-4.
- Produces: traçabilité complète (EPIC + hash de commit).

- [ ] **Step 1: Smoke test navigateur**

Lancer l'app (`./venv/bin/python app.py` sur 8765), ouvrir ❓ Raccourcis, vérifier :
1. 4 colonnes côte à côte, touches alignées ;
2. chips `✓ NML` / `≈ homonymes` / `✕ non importé` lisibles ;
3. pied de modal avec les 2 notes ;
4. resize <1100px → 2 colonnes ; <640px → 1 colonne ;
5. fermeture ✕ et Échap.
Expected: tout conforme au spec.

- [ ] **Step 2: Créer l'EPIC-023**

Copier `docs/superpowers/epics/_template.md` → `docs/superpowers/epics/EPIC-023-legend-modal-redesign.md`, remplir statut 🟢 Livré, fichier spec de référence, et la table Traçabilité avec les commits réels (`git log --oneline -5`).

- [ ] **Step 3: Mettre à jour le registre**

Ajouter la ligne EPIC-023 à l'index de `docs/superpowers/epics/README.md` (statut 🟢 Livré, priorité Basse — UI cosmétique).

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/epics/EPIC-023*.md docs/superpowers/epics/README.md docs/superpowers/specs/2026-09-14-legend-modal-redesign-design.md
git commit -m "docs(epics): traçabilité EPIC-023 — refonte popup Raccourcis & Légende (modal-xl)"
```

- [ ] **Step 5: Push**

Run: `git push`
Expected: `main -> main` à jour.