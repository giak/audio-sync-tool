# EPIC-014 — UX générale : focus trap, aria, police locale, prompt→modales, responsive

> **Statut** : ⚪ Backlog
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §4 (points faibles UI/UX)

## Objectif

Hisser l'UX générale au niveau du socle (clavier-first, thème SCADA) : accessibilité, promesse
« 100 % hors-ligne », cohérence des modales, responsive minimal.

## Tâches (proposées)

- [ ] **Police auto-hébergée** : retirer l'`@import` Google Fonts de `style.css` (fuite de vie privée +
      la revendication hors-ligne est fausse) → bundle/local ou fallback système assumé.
- [ ] **Focus trap + aria** : `role="dialog"`/`aria-modal` sur les modales, `aria-label` sur ✕, Tab
      confiné dans la modale.
- [ ] **Contrôles clavier-first** : slots A–H avec `tabindex` + touches A–H ; menu contextuel accessible
      au clavier (ex. Shift+F10).
- [ ] **Remplacer `prompt()`/`confirm()`** par les modales custom existantes (gestionnaire de playlists).
- [ ] **Responsive minimal** : `@media` de repli (< 1024 px) — sidebar playlist empilable, `column-count`
      réduit, éviter l'`overflow: hidden` total.
- [ ] **États vides** : bandeau « aucun dossier configuré » visuel dans les panneaux + guidance premier
      lancement.
- [ ] **Cache-buster CSS** : inclure `style.css` dans le cache-buster (aujourd'hui `script.js` seul).
- [ ] **Canal de messages unique** : séparer toast et erreur persistante (le toast écrase l'erreur).
- [ ] **Rating** : validation visuelle 0–100 à la frappe.
- [ ] Tests : focus trap (Tab ne sort pas), aria présent, modale custom remplace prompt/confirm.

## Fichiers impactés (prévision)

`static/style.css` · `templates/index.html` · `static/src/ui.ts` (modales) ·
`static/src/render/playlistUI.ts` (prompt/confirm) · `static/src/render/cueEditor.ts` (slots) ·
`static/src/commands/*` (menu clavier) · `app.py` (cache-buster) · tests vitest

## Notes / Risques

- Prioriser **police locale + focus trap + aria** (gros gains accessibilité/perf) ; le responsive est
  un plus (outil local, usage desktop).
- Le focus trap doit être transparent en mode clavier ET souris (ne pas piéger le pointeur).
