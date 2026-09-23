# EPIC-051 — La copie se lit, le dossier reste plié, le style vit des deux côtés

> **Statut** : 🟢 Code livré (P1+P2+P3 — reste la revue navigateur)
> **Créée** : 2026-09-23 · **Dernière mise à jour** : 2026-09-23 (P3)
> **Priorité** : Haute
> **Docs liées** : [spec](../specs/2026-09-23-copie-modale-expansion-style-design.md) ·
> EPIC-043 (style à la copie) · EPIC-046 (cellules Style) · EPIC-050 (écriture visible) ·
> EPIC-034 (auto-expansion à retirer) · EPIC-035 (aperçu e, palette g)

## Objectif

Trois frictions du geste le plus fréquent de l'app (copier un épars vers Source
Data) : **comprendre** ce que la validation va faire (modale), **rester maître**
de l'arbre (pas d'expansion imposée), et **voir** le style se mettre à jour des
deux côtés (éparpillé et Source Data) — à la copie comme à `g`.

## Contexte & découvertes

Signalement complet (mot pour mot dans la spec). Établi par lecture du code
(2026-09-23) :

1. **Modale générique sans hiérarchie** : `#modal-dialog` = un `#dialog-msg`
   (`pre-line`) où `Copier "X" vers "Y" ?` et la phrase de consentement style
   (EPIC-043) se valent typographiquement. Sert au F5 simple, au batch **et**
   à l'aperçu `e` — aucun bloc « fichier → destination ».
2. **L'expansion post-copie est une feature d'EPIC-034**, appelée en deux
   endroits (`copyFilesTo` actions.ts:341, F5 simple actions.ts:457) ; elle
   persiste dans `sourceExpanded` (survit aux re-renders). Le clic et Enter
   déplient déjà par eux-mêmes (`navigation.ts:330`) : la retirer ne retire
   aucun moyen d'ouvrir un dossier.
3. **Le style s'écrit mais ne s'affiche pas / ne se propage pas** :
   - la cellule Style d'un épars est **aveugle sans choix de session**
     (`styleCell.resolve` → `null`) : F5 direct sans `g` → aucun chip ; l'aperçu
     `e` **retire** les choix copiés → le chip disparaît au moment où le tag
     vient d'être écrit. `entry.genre` est pourtant patché (`applyCopyStyle`) ;
   - `g` n'écrit que sa cible (`writeStyleTagFor`), jamais le jumeau rangé
     (`state.dupMatches`) : l'autre colonne garde l'ancien genre.

**Zéro backend nouveau** : `/copy` écrit déjà les deux tags (EPIC-043),
`/styles/apply` écrit immédiatement (EPIC-041). Tout est client : structure de
modale, suppression d'appels, extension de cibles + affichage.

## Tâches

### P1 — Modale « fichier → destination » ✅

- [x] `static/src/render/copyDialog.ts` : rendu unique des trois flux — bloc
      évidence (`fichier.mp3 → techno_hard_2005`, badge `➕` si créé) + blocs
      discrets (consentement style, exclusions, compteurs multi ; tooltip =
      liste complète des noms)
- [x] Brancher `executeCopy` (branche batch **et** simple) et
      `openStylePreview` (multi-dossiers : une ligne évidence par dossier)
- [x] CSS `components.css` : niveaux évidence / discret (taille + gris), tokens
      existants suffits (aucune variable nouvelle)
- [x] Tests vitest : `copyDialog.test.ts` (evidenceLine, buildCopyDialogSpec,
      rendu DOM, fallback) + adaptation actions/stylePreview/integration

### P2 — Fin de l'auto-expansion ✅

- [x] Supprimer `revealSourceDir(destDir)` des **deux** appels d'`actions.ts`
      (copie simple + `copyFilesTo`) — l'API `revealSourceDir` reste exportée
      (tests sourceTree) mais n'est plus appelée par la copie
- [x] Inverser les tests qui l'attendaient (actions.test.ts : le dossier reste
      **plié** après copie ; le focus est restauré, l'index est patché)
- [x] Clavier vérifié : clic et Enter déplient toujours
      (`navigation.ts:330`) — matrice 78 cellules verte (1212 tests ok)

### P3 — Paire complète et affichage symétrique (le cœur du « j'insiste ») ✅

- [x] Palette (`stylePalette.ts`) : `extendToPairs` étend les cibles épars avec
      les `sourceFullPath` de leurs jumeaux (`state.dupMatches`) **avant** le
      POST — style **et** année (D3 : un morceau a une année, pas deux) ; un
      rangé seul n'est jamais étendu
- [x] `styleCell.paint` : sans choix de session mais avec `entry.genre` non nul
      → **chip neutre** (`written-neutral`, vert atténué), tooltip « écrit dans
      le tag » ; ordre : choix > genre écrit > suggestion > vide (D4)
- [x] Refresh des deux côtés après `g` : `setGenreLocally` appelle désormais
      `refreshStyleCells` **et** `refreshSourceStyleCells` (les deux chips
      suivent le tag, sans re-render)
- [x] Tests vitest : extension de cibles (paire dans UNE requête, rangé seul
      non étendu, année sur la paire, échec partiel signalé sans annuler le
      reste), chip neutre sans choix + après retrait du choix (aperçu `e`),
      divergence du jumeau visible (chip `≠`)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/render/copyDialog.ts` | **nouveau** — rendu modale copie (P1) |
| `static/src/actions.ts` | appels modale (P1) ; suppression des 2 `revealSourceDir` (P2) |
| `static/src/render/stylePreview.ts` | modale de l'aperçu `e` via copyDialog (P1) |
| `static/src/render/stylePalette.ts` | extension de cibles paire (style + année) (P3) |
| `static/src/render/styleCell.ts` | chip neutre sans choix ; refresh croisé (P3) |
| `static/styles/components.css` | niveaux évidence/discret de la modale (P1) |
| `static/src/actions.test.ts` | tests modale + inversion auto-expansion (P1/P2) |
| `static/src/render/stylePalette.test.ts` · `styleCell.test.ts` | tests paire complète (P3) |

## Validation

- [x] Typecheck (`npm run typecheck`)
- [x] Tests frontend (`npm test`) — 1212 verts
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — 367 verts (zéro backend)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)
- [ ] Navigateur (bac à sable) : F5 → modale lisible + dossier **replié** ;
      P3 : `g` sur épars avec jumeau → les deux tags écrits (journal
      `palette` ×2), les deux chips à jour ; `apply_styles.py --undo` restaure la paire

## Livré (P3, 2026-09-23)

- **Extension de paire** (`extendToPairs`, stylePalette.ts) : cibles épars +
  jumeaux `dupMatches` dans la MÊME requête `/styles/apply` et `/years/apply`
  (confinement et journal inchangés, EPIC-041). Un rangé ciblé directement ne
  s'étend pas (alignement dossier ≠ décision de style). Échec partiel : signalé,
  le tag de l'épars reste écrit et le rangement suit (D3).
- **Chip neutre** (`written-neutral`, sync.css) : un épars taggé sans choix de
  session affiche son genre réel — F5 direct, et l'aperçu `e` ne fait plus
  « disparaître » le chip au moment où le tag vient d'être écrit.
- **Refresh croisé** : `setGenreLocally` rafraîchit les cellules des deux
  colonnes ; `applyCopyStyle` rafraîchit la cellule épars (`entry.genre` relu).

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `6edf56c` | `feat: EPIC-051+052 — la copie se lit d'un coup d'œil, g écrit la paire, un clic ne scrolle plus` (P1+P2+P3) |

## Livré (P1+P2, 2026-09-23)

- **P1** : `render/copyDialog.ts` (spec pure + rendu `#dialog-msg`, fallback
  texte), `confirmCopyDialog` dans `ui.ts` (même contrat que `confirmDialog`,
  template incomplet = warning), branché sur les trois flux (`executeCopy`
  batch + simple via `destExists` pour le badge ➕, `openStylePreview` via
  `buildPreviewCopySpec` — les exclusions `formatPlan` passent en notes
  discrètes). CSS : `.copy-evidence-line` (15 px, évidence), `.copy-note`
  (12 px, gris), `.copy-summary`.
- **P2** : les deux `revealSourceDir` supprimés d'`actions.ts` (l'API reste
  exportée dans sourceTree) ; tests inversés — le dossier destination reste
  **plié** après copie (DOM + `sourceExpanded`).
- Fix au passage : le summary de la modale doublait le compteur
  (`« 2 2 fichiers »`) — corrigé avant même le premier usage.
- **Revue du 2026-09-23** (« ça passe, mais une UI plus propre, élégante et
  marquée ») : la hiérarchie typographique est renforcée — ligne évidence
  STRUCTURÉE en spans (`.copy-file` bold blanc 17px, `.copy-arrow` accent,
  `.copy-dest` cyan bold, badge « ➕ sera créé » discret), alignement gauche
  (le sens de lecture porte le transfert), consentement CONDENSÉ une ligne
  (`styleConsentShort` — le texte intégral reste au tooltip et dans
  `styleConsentLine`), notes une ligne avec tooltip. Boutons centrés
  (choix utilisateur, cohérence avec les autres dialogues).
- **Régression corrigée dans la foulée** (« on ne voit plus le titre du morceau
  en entier », puis « ça doit s'afficher sur une ligne ») : la ligne 17px
  débordait de `modal-sm` (480px) et était ellipsée. Correctif final : gabarit
  `.modal-copy` propre à la copie — **`width: fit-content` jusqu'à 96vw** : la
  modale ÉPOUSE la largeur du texte — et ligne évidence en **nowrap SANS
  ellipsis** (`overflow-x: auto` : un nom plus large que l'écran défile, il ne
  se coupe jamais). Posé par `confirmCopyDialog`, retiré par `closeAllModals`
  (testé). Vérifié au rendu réel (Chrome headless, CSS de production servi) :
  « 01 - high school drop-outs - acid over (and over) [in the mix, djs-
  liberator].mp3 → beat_disco » tient sur UNE ligne, modale ouverte à 1229px,
  entièrement visible, aucune ellipse. NB : le bundle `static/dist/script.css`
  doit être reconstruit (`npm run build`) et la page rechargée — un navigateur
  sur un vieux bundle montre l'ancien CSS.

## Décisions

1. **Modale fichier → destination** (choix utilisateur 2026-09-23) : l'action en
   évidence, les conséquences en discret — une seule implémentation pour les
   trois flux (F5 simple, batch, aperçu `e`).
2. **L'auto-expansion est retirée, pas déplacée** : clic et Enter déplient déjà ;
   aucune nouvelle UI « replier après copie ».
3. **Paire complète** (choix utilisateur 2026-09-23) : `g` sur un épars écrit
   aussi le jumeau rangé, même si son dossier contredit — l'utilisateur vient de
   décider du style du morceau ; la divergence reste **visible** (chip `≠`) et
   corrigeable (`a`, ou `g` sur le rangé). Le dossier reste la vérité pour
   l'alignement de stock EPIC-044, plus pour le geste qui vient d'être posé.
4. **L'année suit la paire** : un morceau a une année, pas deux — extension
   identique pour l'écriture d'année de la palette.
5. **Chip neutre** pour un épars sans choix de session mais taggé : la cellule
   lit l'index (genre relu par `/copy`), ne dépend plus d'un état de session.
6. **Zéro backend** : les cibles additionnelles restent dans les racines connues
   → confinement et journal EPIC-041 inchangés (`--undo` restaure la paire).

## Notes / Risques

- Le « déjà rangé » de l'aperçu `e` (exclusion jumeau-dans-la-destination) et la
  paire complète de `g` sont deux moteurs différents (`buildRangementPlan` vs
  `dupMatches`) : ne pas les fusionner (YAGNI) — l'un décide d'une **copie**,
  l'autre d'une **écriture de tag**.
- P2 peut faire paraître la copie « silencieuse » à un utilisateur habitué à
  voir le dossier s'ouvrir : le toast de confirmation + le chip côté droit
  restent ; mesure d'usage avant d'aller plus loin.
- Le chip neutre d'un épars peut coexister avec la pastille ⤷ (jumeau rangé) :
  deux informations différentes (genre écrit vs doublon), pas de conflit visuel
  attendu — à vérifier à la revue visuelle.
