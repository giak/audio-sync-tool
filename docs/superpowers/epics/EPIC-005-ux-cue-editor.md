# EPIC-005 — UX du cue editor : accès playlist, plein écran, homonymes

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne
> **Docs liées** : [rapport audit](reports/2026-08-08-audit-technique-ux.md) §3 (UI/UX éditeur)

## Objectif

Rendre l'éditeur cues découvrable et confortable : un accès visible depuis la playlist, un mode plein
écran, et des homonymes discriminables.

## Tâches

- [x] **Accès depuis la playlist** : le bouton ⌖ (U+2316, non couvert par JetBrains Mono → tofu) remplacé
      par un bouton **« Cues »** libellé (`title` conservé) + entrée de **menu contextuel**
      « Cues / loops (waveform) » sur les pistes.
- [x] **Plein écran** : bouton 🗖/🗗 dans le header de la modal ; la modal remplit l'écran ; la waveform
      passe en `flex:1` avec `height: 'auto'` (ResizeObserver v7 re-rend automatiquement) ; **Échap**
      sort d'abord du plein écran au lieu de fermer la modal (phase capture, `stopImmediatePropagation`) ;
      fermeture propre → état réinitialisé. Modal par défaut agrandie (780→1100px), waveform 128→200px.
- [x] **Homonymes** : sélecteur enrichi (ARTIST/TITLE + **VOLUME/DIR** discriminants) ; mémorisation
      `cue/sel:` par fichier ; sélecteur périmé retiré à la réouverture.

## Fichiers impactés

`static/src/render/cueEditor.ts` · `static/src/render/cueEditor.test.ts` · `static/src/render/playlistUI.ts`
· `templates/index.html` · `static/style.css`

## Validation

- Tests : toggle plein écran, idempotence, Échap en plein écran (modal reste ouverte), reset au destroy,
  bouton Cues, entrée menu contextuel.
- Suite complète : 614 vitest / 127 pytest / typecheck / lint / build.

## Traçabilité (commits)

> Livré en working tree dans la session du 2026-08-08. À commiter en référençant cette EPIC.

## Décisions

- Échap en plein écran = **sortir du plein écran d'abord** (intention utilisateur), un second Échap ferme.
- Pas de `requestFullscreen()` natif : on remplit le viewport via CSS (cohérent avec le style modal).
