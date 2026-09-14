# Design : Popup « ❓ Raccourcis & Légende » — remise à niveau

> **Date** : 2026-09-14 · **Statut** : validé (brainstorming) → prêt pour plan
> **Objets concernés** : `templates/index.html` (modal-legend), `static/style.css` (legend)
> **Hors scope** : le `cue-hint` du transport cue editor (EPIC-022 backlog), le
> responsive de `.modal-lg` (EPIC-022 backlog).

## Problème

La popup ❓ Raccourcis & Légende (`#modal-legend`) :

- est **trop petite** (`.modal-content` par défaut : max-width 640px) pour son contenu ;
- est **mal remplie** : 4 sections en `flex` mal dimensionnées, contenu **périmé**
  — manquent les badges NML (`✓`/`≈`/`✕`), le badge `✅ playlist`, tous les
  raccourcis du **cue editor** (1-8, C, +/−, Ctrl+Z, calage grille, Analyser,
  Grille…) et la note « Échap ne quitte plus Playlist ».

## Objectifs

1. Fenêtre **plus grande** et lisible d'un coup d'œil (aucun contenu caché derrière un clic).
2. **Info bien agencée** : une colonne par contexte, alignement des touches.
3. Contenu **complété** pour refléter l'état actuel (EPIC-016, 017, 019, 021).
4. **Responsive** : repli propre sous 1100px et 640px (la modale sert aussi sur petit écran).

## Choix retenus (validés en session)

- **Approche A** : nouvelle classe `.modal-content.modal-xl` (860–1200px) +
  grille CSS 4 colonnes égales. Rejetées : onglets (contenu caché) et accordéon
  (un clic de plus) — on vise « tout visible ».
- **Une colonne par contexte** (duplication des raccourcis courants assumée) :
  la lisibilité prime sur l'économie d'écriture.
- **Navigation pages supprimée** : redondante (toolbar + contextes des colonnes).

## Design

### Layout & dimensions

- `#modal-legend` passe à `.modal-content.modal-xl` :
  `min-width: 860px; max-width: 1200px;` (nouvelle classe à côté de `modal-lg`, ligne 767).
- `#legend-grid` : `display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px 32px;`
  (remplace le `flex` actuel ligne 493).
- Réduction `≤1180px` : modal à `92vw`.
- Responsive :
  - `@media (max-width: 1100px)` → 2 colonnes ;
  - `@media (max-width: 640px)` → 1 colonne.
- `max-height: 80vh; overflow-y: auto` conservé (déjà sur `.modal-content`).
- Fermeture : ✕ et Échap inchangées (binding testé `modals.test.ts` intacts).

### Contenu par colonne

**Colonne 1 — Légende (badges)**

| Élément | Signification |
|---|---|
| ● bleu `.led-demo-nouveau` | Nouveau — pas dans la source |
| ○ gris `.led-demo-doublon` | Doublon — déjà présent |
| ● vert `.led-demo-traite` | Traité — copié |
| ● cyan `.led-demo-playing` | En lecture |
| ✅ | Dans la playlist active |
| chip `✓ NML` | Matché dans le collection Traktor (sauvegardable) |
| chip `≈ homonymes` | Plusieurs entrées NML (sélecteur au clic Cues) |
| chip `✕ non importé` | Absent du NML — visualisation seule |

Chips NML : classes `.badge-demo`, style mono bordé cohérent avec l'UI
playlist (`matchStatus.ts`) ; texte identique à l'UI.

**Colonne 2 — Raccourcis (Sync)** : les 10 rows actuels, inchangés.

**Colonne 3 — Raccourcis (Playlist)** : les 11 rows actuels, libellé harmonisé
« Filtrer les fichiers » (remplace « dossiers »).

**Colonne 4 — Raccourcis (Cue editor)** : nouvelle, 12 rows :
`←→ seek ±5s` · `+/− zoom (molette)` · `1–8 cue A–H` · `C cue au curseur` ·
`Ctrl+Z / Ctrl+Shift+Z` · `⟳ Loop / 🔁 Play` · `←/→ 1/4 calage grille` ·
`◎ Beat 1` · `🔍 Analyser` · `💾 Grille` · `Suppr / clic droit` ·
`Double-clic renommer/recolorer`.

**Pied de modal `#legend-footer`** (barre full-width, `border-top`, texte muted) :
- « Échap ne quitte plus la page Playlist — cliquer 📦 Sync pour revenir »
- « Seek : Shift+←→ ±20s (Sync) · ←→ ±5s (cue editor) »

### Alignement

`.legend-row` : `display: flex` → `display: grid; grid-template-columns: max-content 1fr; gap: 8px;`
pour aligner les `kbd` en colonne sur chaque liste. Styles LED conservés ;
`kbd` légèrement agrandi (`font-size: 12px` → `12.5px`) pour la lisibilité.

## Fichiers impactés

| Fichier | Changement |
|---|---|
| `templates/index.html` | `modal-xl`, 4 colonnes, nouveaux rows Cue editor + badges NML, `#legend-footer`, suppression section Navigation pages |
| `static/style.css` | `.modal-content.modal-xl`, `#legend-grid` grille 4 cols + media queries, `.legend-row` aligné, `.badge-demo`, `#legend-footer` |

## Hors scope (rappel)

- `cue-hint` du transport cue editor → EPIC-022, Story 4.
- Responsive `.modal-lg` (cue editor) → EPIC-022, Story 3.

## Tests & validation

- **Aucun impact test** : `modals.test.ts` ne couvre que l'ouverture/fermeture
  Échap (binding `legend` intact) ; le contenu de la legend n'est référencé
  dans aucun test. Pas de nouveau test DOM (le template n'est pas importé en
  vitest — YAGNI, validation visuelle).
- **Validation** :
  1. `npm run build`
  2. `npm run typecheck`
  3. `npm run lint`
  4. `npm test` (730 verts attendus)
  5. Smoke test navigateur : 4 colonnes visibles, badges chips NML, repli
     propre sous 1100px et 640px, fermeture ✕/Échap OK.

## Traçabilité

| Étape | Commit |
|---|---|
| Spec | `…` (à remplir) |
| Implémentation | `…` (à remplir) |