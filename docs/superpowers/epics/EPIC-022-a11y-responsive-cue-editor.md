# EPIC-022 — Accessibilité + responsive du cue editor (audit UI/UX)

> **Statut** : ⚪ Backlog
> **Créée** : 2026-08-19 · **Dernière mise à jour** : 2026-08-19
> **Priorité** : Haute (bugs CSS concrets + a11y manquante sur la fonctionnalité cœur)
> **Docs liées** : [audit UI/UX 2026-08-19](#) (point fait en session, pas de rapport dédié)

## Objectif

Corriger les défauts d'accessibilité et de responsive du **cue editor** (la
fonctionnalité cœur), plus 2 bugs CSS concrets (`var(--border)` / `var(--text)`
non définis) découverts à l'audit forensique — sans régression fonctionnelle.

## Contexte & découvertes

Audit UI/UX du 2026-08-19 — lecture forensique des 1698 lignes de `cueEditor.ts`,
du HTML, du CSS et des tests. Découvertes vérifiées (pas des rumeurs) :

- **0 `aria-label`** dans tout `templates/index.html` (21 `title` seulement).
  Les `title` ne sont pas relayés de façon fiable par les lecteurs d'écran comme
  nom accessible. 14 boutons emoji-only du cue editor (`▶`, `↺`, `↻`, `−`, `+`,
  `Fit`, `1 beat`, `⟳ Loop`, `🔁 Play`, `← 1/4`, `→ 1/4`, `◎ Beat 1`,
  `🔍 Analyser`, `💾 Grille`, `🧲 Snap`) n'ont pas de nom accessible.
- **`var(--border)` référencé 3 fois** (lignes 533, 547, 945 du CSS) — **non
  défini** dans `:root`. Fallback `currentColor`/`initial` → bordure invisible ou
  couleur héritée inattendue sur `.dialog-input`, `.panel-empty`,
  `#cue-editor-addrow input`.
- **`var(--text)` référencé ligne 944** (`#cue-editor-addrow input`) — **non
  défini**. `color` hérite au lieu d'utiliser `--text-primary`.
- **Responsive cue editor absent** : `@media (max-width: 1024px)` (ligne 575)
  couvre `#main-panels` et `#playlist-main` mais **pas `.modal-lg`** (min-width
  780px). La modal déborde sous 1024px, le transport (18 contrôles, `flex` sans
  `flex-wrap`) se compresse mal.
- **Transport dense** : 18 contrôles sur une ligne `flex` sans séparateur de
  groupes, plus un `cue-hint` de 147 caractères collé au bout. Illisible.

### Hors scope (vérifié, pas un problème)

- `cueEditor.ts` 1698 lignes / 26 globales mutables — dette structurelle, pas
  un bug. Le reset d'état à l'ouverture est systématique (lignes 1150-1181). À
  traiter dans une EPIC de refonte séparée si nécessaire (YAGNI tant que ça
  tient).
- Handler `ws.on('scroll')` non testé — gardé par `if (_zoomPx <= 0) return`,
  `renderGrid` synchrone et léger. Pas de jank réel.
- Icônes loop (`⟳ Loop` vs `🔁 Play`) — les `title` sont explicites et distincts.
- Tests cueEditor — couverture réelle et dense (56 mentions zoom, 28 undo/redo,
  22 minimap, 27 RGB, 20 blocs `describe`). Pas de problème.

## Tâches (stories)

### Story 1 — Correction CSS : `--border` et `--text` non définis (zero-risk)

- [ ] 1.1 Définir `--border` dans `:root` de `static/style.css` (alias :
      `--border: var(--border-panel);` — ou valeur directe `rgba(0, 136, 255, 0.12)`)
- [ ] 1.2 Définir `--text` dans `:root` (alias : `--text: var(--text-primary);`
      ou `#e0e8f0`) — vérifier qu'aucun usage n'attend une autre valeur
- [ ] 1.3 Vérifier le rendu des 3 éléments impactés (`.dialog-input`,
      `.panel-empty`, `#cue-editor-addrow input`) — bordure + couleur attendues
- [ ] 1.4 Lint + build (pas de test fonctionnel — c'est du CSS déclaratif)

### Story 2 — `aria-label` sur les 14 boutons emoji-only du cue editor

- [ ] 2.1 Ajouter `aria-label` sur les 14 boutons `#cue-btn-*` de
      `templates/index.html` (lignes 258-275) — reprendre le texte du `title`
      existant (déjà explicite). Exemple : `<button id="cue-btn-play"
      aria-label="Lecture / pause (Espace)" title="…">▶</button>`
- [ ] 2.2 Ajouter `role="status"` sur `#status-bar` (ligne 92-94 du HTML)
- [ ] 2.3 Ajouter `role="alert"` sur `.toast.toast-error` (rendu JS dans `ui.ts`)
- [ ] 2.4 Test : vérifier que les `aria-label` sont présents (test DOM existant
      ou nouveau test léger dans `ui.test.ts` / `cueEditor.test.ts`)
- [ ] 2.5 Typecheck + lint + build

### Story 3 — Responsive du cue editor sous 1024px

- [ ] 3.1 Ajouter `@media (max-width: 1024px)` pour `.modal-content.modal-lg` :
      `min-width: 0; width: 95vw; max-width: 95vw;`
- [ ] 3.2 Ajouter `flex-wrap: wrap` sur `#cue-editor-transport` dans la même
      media query (les 18 contrôles wrappent au lieu de se compresser)
- [ ] 3.3 Réduire `#cue-editor-waveform` à `height: 160px` sous 1024px (200px
      par défaut) pour laisser de la place au transport wrappé
- [ ] 3.4 Masquer ou réduire `.cue-hint` sous 1024px (147 chars illisibles →
      `display: none` ou tronquer) — KISS : `display: none` sur petit écran
- [ ] 3.5 Vérifier le méta-éditeur `#cue-editor-metaeditor` (absolute top:40%)
      ne déborde pas sous 1024px — garde `max-height: 60vh; overflow-y: auto`
- [ ] 3.6 Test visuel (smoke test navigateur) sous 1024px — pas de test
      automatique (jsdom ne simule pas le layout)

### Story 4 — Groupage visuel du transport (densité)

- [ ] 4.1 Ajouter des séparateurs visuels entre les groupes fonctionnels du
      transport (`#cue-editor-transport`, HTML 257-277) :
      - Groupe lecture : `▶`, `↺`, `↻`, temps
      - Groupe zoom : `−`, `+`, `Fit`, `1 beat`
      - Groupe loop : `⟳ Loop`, `🔁 Play`
      - Groupe beatgrid : `← 1/4`, BPM, `→ 1/4`, badge, `◎ Beat 1`, `🔍 Analyser`,
        `💾 Grille`, `🧲 Snap`
- [ ] 4.2 CSS : `<span class="cue-group-sep" aria-hidden="true"></span>` entre
      les groupes (1px vertical, `var(--border-panel)`, margin 0 4px)
- [ ] 4.3 Déplacer le `cue-hint` (147 chars) hors du transport → en footer de
      la modal ou dans une tooltip `?` dédiée (KISS : footer de modal, fixe)
- [ ] 4.4 Test : vérifier la présence des séparateurs (test DOM léger)

### Story 5 — Traçabilité & validation finale

- [ ] 5.1 Typecheck (`npm run typecheck`)
- [ ] 5.2 Tests frontend (`npx vitest run --sequence.shuffle`)
- [ ] 5.3 Tests backend (`./venv/bin/python -m pytest -q`)
- [ ] 5.4 Lint (`npm run lint`)
- [ ] 5.5 Build (`npm run build`)
- [ ] 5.6 Smoke test navigateur : ouvrir le cue editor, vérifier a11y (lecteur
      d'écran ou inspecteur DOM), tester le resize sous 1024px
- [ ] 5.7 Mettre à jour le registre `docs/superpowers/epics/README.md` (statut 🟢)
- [ ] 5.8 Commit avec traçabilité (hash reporté dans ce fichier)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/style.css` | Story 1 (variables `--border`/`--text`), 3 (responsive), 4 (séparateurs) |
| `templates/index.html` | Story 2 (14 `aria-label` + `role="status"`), 4 (séparateurs + déplacement `cue-hint`) |
| `static/src/ui.ts` | Story 2 (`role="alert"` sur `.toast.toast-error`) |
| `static/src/render/cueEditor.ts` | Story 4 (si le `cue-hint` est géré en JS, sinon HTML seul) |
| `static/src/render/cueEditor.test.ts` | Story 2/4 (tests DOM légers si pertinents) |
| `static/src/ui.test.ts` | Story 2 (test `aria-label` / `role`) |
| `docs/superpowers/epics/EPIC-022-a11y-responsive-cue-editor.md` | cette EPIC |
| `docs/superpowers/epics/README.md` | index (statut) |

## Validation

- [ ] Typecheck (`npm run typecheck`)
- [ ] Tests frontend (`npm test`)
- [ ] Tests backend (`./venv/bin/python -m pytest -q`)
- [ ] Lint (`npm run lint`)
- [ ] Build (`npm run build`)
- [ ] Smoke test navigateur (a11y + resize 1024px)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | … |

## Décisions

- **Alias plutôt que nouvelle valeur** pour `--border`/`--text` : les autres
  variables `--border-*` existent déjà (`--border-panel`, `--border-focus`…).
  `--border: var(--border-panel)` évite une 6e valeur de bordure à maintenir
  (DRY). `--text: var(--text-primary)` pareil. Décision à confirmer en
  implémentation (vérifier qu'aucun usage n'attend une autre valeur).
- **`aria-label` = texte du `title` existant** : les titles sont déjà explicites
  (« Lecture / pause (Espace) », etc.). Pas d'invention, pas de divergence.
- **`flex-wrap` plutôt que refonte du transport** : KISS. Les 18 contrôles
  wrappent proprement, pas de redesign. Le groupage (Story 4) est la vraie
  amélioration de lisibilité, le wrap est juste la sécurité responsive.
- **`cue-hint` déplacé en footer de modal** plutôt que tooltip : le contenu est
  utile (raccourcis complets), une tooltip le cacherait. Footer fixe = toujours
  visible sans encombrer le transport. KISS.
- **Pas de test automatique responsive** : jsdom ne simule pas le layout. Le
  smoke test navigateur est la validation (comme pour EPIC-015).

## Notes / Risques

- **Story 1 zero-risk** : définir des variables CSS inexistantes ne peut pas
  casser un rendu existant (le rendu actuel est déjà cassé — fallback
  `currentColor`). Au pire, la bordure devient visible (amélioration).
- **Story 2** : les `aria-label` ne changent rien au rendu visuel. Risque nul.
- **Story 3** : le `flex-wrap` peut changer la hauteur du transport sous 1024px
  (wrap → 2-3 lignes). Testé visuellement, pas de régression fonctionnelle.
- **Story 4** : déplacer le `cue-hint` change le DOM du transport — vérifier
  qu'aucun test ne cible `.cue-hint` dans le transport (grep avant de modifier).
- **Aucune régression attendue** : 5 stories indépendantes, chacune
  réversible par git. Validation par tests + smoke test.
