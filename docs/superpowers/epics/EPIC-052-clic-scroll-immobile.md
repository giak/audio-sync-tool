# EPIC-052 — Un clic ne fait jamais bouger le scroll

> **Statut** : 🟢 Code livré (2026-09-23)
> **Priorité** : Haute
> **Docs liées** : EPIC-028 (twin-hint, dont le scroll est impliqué) · EPIC-036 (beginRender/restore, core/dom.ts)

## Le signalement, mot pour mot

> « quand je clique sur un fichier dans la page "sync", colonne "éparpillé", le
> scroll ne doit pas bouger. desfois, ça scroll vers le bas... »

## Cause racine (lecture du code)

Un clic sur une ligne épars déclenchait jusqu'à **trois** scrolls successifs :

1. `focusItemByElement` → `scrollIntoView({ block: 'nearest' })` sur la ligne
   cliquée. `block:'nearest'` est sans effet quand la ligne est visible —
   mais le DOM re-rendu (sélections, patchs) ou un conteneur de hauteur
   variable le fait parfois « nearest » vers le bas.
2. **Le twin-hint (EPIC-028)** : si le fichier cliqué a un jumeau rangé,
   `updateTwinHint` fait `scrollIntoView` sur la colonne SOURCE — c'est le
   « desfois » : seuls les fichiers matchés par `dupMatches` déclenchaient le
   saut, et il s'opère sur l'AUTRE colonne, invisible pour l'utilisateur qui
   regarde la gauche.
3. `setActivePanel` → `focusItemByPath` → un second `scrollIntoView` sur la
   ligne restaurée du panneau activé.

## Décision

**Un clic ne déplace jamais le scroll.** Le geste est opt-in : seul le
CLAVIER (↑↓, ←→, Tab, historique) amène la vue — c'est un déplacement
volontaire vers ce qui n'est pas à l'écran. Au clic, l'utilisateur voit déjà
ce qu'il vise.

- `focusItemByElement` : `preventScroll: true` **par défaut**, opt-in via
  `opts.preventScroll` pour `navigateFocus` / `navigateColumn`.
- Twin-hint : `syncTwinHint(..., { silent })` — silencieux au clic et aux
  restaurations ; le halo reste posé (visible si la ligne l'est déjà), seul
  le scroll est inhibé. Au clavier il amène la vue comme avant (comportement
  de 5 ans conservé).
- `focusItemByPath` : silencieux par défaut ; `navigateHistory` passe
  `preventScroll: false` (restaure la vue d'où on venait).
- `setActivePanel(panel, { silentScroll: true })` depuis les handlers de
  clic (fileRow, sourceTree ×4) ; Tab (clavier) garde le scroll.
- `revalidateFocus` : silencieux (les restaurations post-re-render ne sautent plus).
- Helper typé `scrollNearest(el, preventScroll)` : `preventScroll` manque au
  lib DOM (`ScrollIntoViewOptions`) — cast centralisé en tête de focus.ts.

## Fichiers

| Fichier | Changement |
|---|---|
| `static/src/focus.ts` | `scrollNearest`, options `preventScroll`/`silent` partout |
| `static/src/render/fileRow.ts` | clic → `setActivePanel(..., { silentScroll: true })` |
| `static/src/render/sourceTree.ts` | idem ×4 handlers de clic dossier |
| `static/src/focus.test.ts` | describe « EPIC-052 : clic = scroll immobile » (6 tests) |
| `static/src/render/fileRow.test.ts` · `sourceTree.test.ts` | assertions adaptées à la nouvelle signature |

## Validation

- [x] Typecheck, lint, build
- [x] 1228 tests vitest verts (dont 6 nouveaux EPIC-052)
- [x] Le clavier amène toujours la vue (tests dédiés ↑↓ / ←→ / Tab)
- [ ] Navigateur : clic sur épars avec jumeau → aucune colonne ne bouge ;
      ↑↓ et Tab se comportent comme avant

## Notes

- `block: 'nearest'` est conservé partout : au clavier il évite les sauts
  inutiles quand la ligne suivante est déjà visible.
- La restauration `scrollTop` de `beginRender/restore` (core/dom.ts) est
  inchangée et complémentaire : elle couvre le wipe/rebuild des conteneurs.

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `6edf56c` | `feat: EPIC-051+052 — la copie se lit d'un coup d'œil, g écrit la paire, un clic ne scrolle plus` |
