# EPIC-014 — UX générale : focus trap, aria, police locale, prompt→modales, responsive

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §4 (points faibles UI/UX)

## Objectif

Hisser l'UX générale au niveau du socle (clavier-first, thème SCADA) : accessibilité, promesse
« 100 % hors-ligne », cohérence des modales, responsive minimal.

## Tâches

- [x] **Police auto-hébergée** : `@import` Google Fonts retiré → stack monospace système assumée
      (`JetBrains Mono` si installée, sinon `ui-monospace`/Menlo/Consolas…) — hors-ligne vrai,
      zéro fuite de vie privée, zéro CDN (vérifié : plus aucune référence `fonts.googleapis`).
- [x] **Focus trap + aria** : `openModal` pose dynamiquement `role="dialog"`/`aria-modal`/`aria-label`
      (titre de la modal) + `aria-label="Fermer"` sur les ✕ ; Tab/Shift+Tab **confinés** dans la
      modale (wrap premier/dernier, ne sortent jamais dans le DOM derrière). Les éléments `hidden`
      (ex. `#dialog-input` en confirm) sont exclus des focusables — le focus va toujours sur un
      élément visible (bug d'accessibilité réel attrapé en review et testé).
- [ ] **Contrôles clavier-first** : slots A–H `tabindex` + touches A–H ; menu contextuel Shift+F10 —
      **dépriorisé** (le cue editor est déjà clavier-first : Espace, ←/→, Suppr, mode Beat 1 ; le
      menu contextuel n'a pas de zone clavier évidente sans risque de conflit). À re-évaluer si besoin.
- [x] **Remplacer `prompt()`/`confirm()`** : helpers `confirmDialog`/`promptDialog` dans `ui.ts`
      (réutilisent `#modal-dialog`, champ + Entrée) — appliqués au gestionnaire de playlists
      (créer, fermer, renommer, supprimer) et au vidage du journal. Testables en vitest.
- [x] **Responsive minimal** : `@media (max-width: 1024px)` — panneaux empilés, `column-count: 1`,
      sidebar playlist en dessous (min-height 40vh), jamais d'interface inutilisable.
- [x] **États vides** : bandeau `.panel-empty` « Aucun dossier configuré → ⚙️ Config puis 🔄 Scan »
      dans les panneaux épars/source (guidance premier lancement).
- [x] **Cache-buster CSS** : `style.css?v={{ cache_buster }}` — **déjà en place** (vérifié, rien à faire).
- [x] **Canal de messages unique** : `showToast` → `#toast-container` flottant (auto-expirant, aria-live,
      n'écrase plus la barre d'état) ; `showError` reste dans `#status-text` (persistant 5 s).
- [x] **Rating** : validation visuelle 0–100 à la frappe (classe `.invalid` + `title` hors plage, au lieu
      d'un échec silencieux au commit).
- [x] Tests : focus trap (Tab boucle dans la modale, ne sort pas), aria présent sur openModal,
      `confirmDialog`/`promptDialog` (focus sur élément visible, Entrée, valeur vide), canal toast
      séparé, états vides, rating invalide.

## Validation

- **672 vitest** (shuffle) / **168 pytest** — typecheck 0 · lint 0 · build OK.
- Vérification forensique : plus aucune occurrence `fonts.googleapis` dans `style.css`/bundle.
- 3 tests integration adaptés au dialog custom (le prompt natif était mocké par `window.prompt`).

## Fichiers impactés (prévision)

`static/style.css` · `templates/index.html` · `static/src/ui.ts` (modales) ·
`static/src/render/playlistUI.ts` (prompt/confirm) · `static/src/render/cueEditor.ts` (slots) ·
`static/src/commands/*` (menu clavier) · `app.py` (cache-buster) · tests vitest

## Notes / Risques

- Le focus trap ne piège que le clavier (Tab) : la souris reste libre.
- La tâche « contrôle clavier des slots A–H / menu Shift+F10 » reste ouverte (dépriorisée, cf. ci-dessus).
- `aria-label` de la modal dialog retombe sur le nom interne (`dialog`) faute de `<h3>` — acceptable.
