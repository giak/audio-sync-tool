# EPIC-034 — UX rangement Sync : player des cartes, pastille « déjà rangé », auto-expansion mémoire

> **Statut** : 🟢 Livré (2026-09-19) — les trois chantiers de la session, testés en live sur données réelles
> **Créée** : 2026-09-19 · **Dernière mise à jour** : 2026-09-19
> **Priorité** : Haute (friction quotidienne du workflow de rangement)
> **Docs liées** : EPIC-030 (filtre 2 niveaux des arbres — socle) · EPIC-028/032 (dupMatches — socle pastille) · EPIC-033 (vue Années — socle player)

## Objectif

Fluidifier le workflow de rangement quotidien (épars → dossiers style-année) :
**écouter avant de trancher** sur les pages à cartes, **savoir avant de copier**
qu'un doublon existe déjà dans le dossier visé, et **voir la copie apparaître**
sans manipulation après F5.

## Contexte & découvertes

Trois frictions relevées en usage réel, résolues indépendamment :

1. **Player** — les vues Années (revue) et Doublons (arbitrage) exigent de
   trancher entre versions sans pouvoir les écouter : le ▶ n'existait que dans
   le tableau Sync.
2. **Pastille** — après le filtre 2 niveaux (EPIC-030), l'utilisateur filtre les
   dossiers à droite pour ranger ; rien n'indique à gauche qu'un épars a déjà
   son jumeau dans le dossier visé (le copier créerait un doublon).
3. **F5** — après copie vers une destination **repliée**, rien ne montre le
   résultat : le patch DOM ciblé no-op (pas de `.children`), il faut re-déplier.

**Découvertes en route** (cf. AGENT.md) :
- le placeholder historique « dossiers / fichiers » du chip était mensonger —
  `dirHasMatchingDescendant` ne fouille que les noms de dossiers ;
- l'expansion d'un dossier **déjà déplié** survit au re-render post-copie
  (l'état `sourceExpanded` n'est jamais effacé) — le manque ne concernait que
  la destination repliée ;
- le serveur sert le bundle depuis le disque : vérification live possible sans
  restart.

## Tâches

### Player audio des pages à cartes (Années + Doublons) ✅
- [x] `playBtn()` partagé dans `yearsUI.ts` / `memberPlayBtn()` dans `dupsUI.ts` :
      boutons ▶/⏹ réutilisant `togglePlay` (player bar globale + `GET /audio`) —
      **aucun player dupliqué**
- [x] Clic isolé (`stopPropagation`) : écouter un membre ne désigne **jamais**
      le gagnant dups, ne focus **jamais** une carte Années
- [x] Re-render safe : `playingPath()` (nouvel export `audio.ts`) re-marque la
      classe `playing` après **chaque** re-render (les cartes sont re-rendues à
      chaque choix de revue)
- [x] CSS `.years-play` / `.dup-play` (indépendant des `td.play-btn` du tableau sync)
- [x] +7 tests (yearsUI/dupsUI) — vérifié live

### Pastille « déjà rangé » (épars jumeau sous le filtre source) ✅
- [x] Helper **pur** `twinUnderFilteredDir()` (`utils.ts`) : segment du jumeau ou
      null — **sémantique identique à l'arbre** (sous-chaîne insensible à la
      casse sur les noms de dossiers, ou nom de fichier en mode 📄) ; sans
      filtre → null (hors contexte de rangement)
- [x] Rendu dans `makeFileEl` (discriminateur existant `selectEparsFileFn` —
      zéro signature modifiée, jamais sur une ligne rangée) : classe `dup-ranged`
      + tooltip `⤷ déjà rangé : <chemin>` (nom de fichier en mode 📄,
      raffinement anti-redondance si le chemin le contient déjà)
- [x] Fraîcheur : `renderSource` rafraîchit `renderEpars` (si panneau visible) et
      **restaure la sélection épars** via `focusItemByPath` (`eparsFocusPath`) —
      les pastilles ne sont jamais périmées après un changement de filtre
- [x] +13 tests (5 contrats UI `fileRow.test.ts`, 8 cas du helper
      `utils.test.ts`), test historique `.file-row` rescopé au conteneur source —
      vérifié live (452 pastilles sous `techno`, 20 sous `techno_1995`, 0 après
      effacement, focus conservé)

### Auto-expansion mémoire post-copie (F5) ✅
- [x] `revealSourceDir(dirPath)` (`sourceTree.ts`) : ouvre le dossier destination
      après copie réussie — **idempotent** (déjà déplié → no-op, jamais de
      repli accidentel), l'expansion passe par le toggle standard donc persiste
      dans `sourceExpanded` comme un clic utilisateur
- [x] `toggleSourceDir` gagne `focusFirstChild = true` (défaut — comportement du
      clic inchangé) : le reveal passe `false`, **zéro vol de focus** (la
      sélection épars reste en place pour enchaîner)
- [x] Branché sur les **deux** handlers d'`executeCopy` (single-file F5 et
      batch), appelé **après** la mutation `state.sourceFiles` (le re-render
      event-driven ne peut pas écraser le patch ciblé)
- [x] +5 tests (4 unitaires `revealSourceDir`, 1 intégration F5 → confirmation →
      dossier ouvert) — vérifié live (destination repliée → ouverte, 132
      fichiers visibles, focus épars conservé)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/audio.ts` | `playingPath()` (état de lecture exposé aux re-renders) |
| `static/src/render/yearsUI.ts` | `playBtn()` — ▶ des cartes Années |
| `static/src/render/dupsUI.ts` | `memberPlayBtn()` — ▶ des membres de groupe |
| `static/src/utils.ts` | `twinUnderFilteredDir()` (pur, testé) |
| `static/src/render/fileRow.ts` | Rendu de la pastille + tooltip dans `makeFileEl` |
| `static/src/render/sourceTree.ts` | `revealSourceDir`, `focusFirstChild`, refresh croisé `renderEpars` + focus |
| `static/src/actions.ts` | Branchement reveal sur les deux handlers d'`executeCopy` |
| `static/style.css` | `.years-play`/`.dup-play` + `.file-row.dup-ranged::after` |
| `static/src/render/yearsUI.test.ts`, `dupsUI.test.ts`, `fileRow.test.ts`, `utils.test.ts`, `sourceTree.test.ts`, `actions.test.ts`, `render.test.ts` | Tests (+25 au total) |

## Validation

- [x] Typecheck (`npm run typecheck`) ✓
- [x] Tests frontend : **979 vitest** (40 fichiers) ✓
- [x] Tests backend : 237 pytest (intacts) ✓
- [x] Lint (`npm run lint`) 0 erreur ✓
- [x] Build (`npm run build`) ✓
- [x] **Live sur données réelles** : 3 scénarios prouvés dans l'aperçu (fetch
      mocké pour F5 — zéro écriture disque)

## Traçabilité (commits)

| Commit | Message | Contenu |
|---|---|---|
| `c6546a0` | feat(ui): player audio sur les pages Années et Doublons | 7 fichiers, +144/−2 |
| `ca21e21` | feat(ui): pastille « déjà rangé » sur les épars jumeaux sous le filtre source | 8 fichiers, +199/−13 |
| `6e02f87` | feat(ui): auto-expansion mémoire du dossier destination après copie (F5) | 5 fichiers, +127/−4 |

*(Staging chirurgical : AGENT.md, style.css et sourceTree.ts portaient des hunks
de lots différents — découpe par patches hunk-par-hunk, contrôles de pureté à
chaque commit.)*

## Décisions

- **Player = réutilisation stricte** : boutons dans les cartes, player bar
  globale inchangée — jamais de second player (règle AGENT.md).
- **Pastille honnête** : elle n'apparaît que si le jumeau est **réellement
  consultable** à droite sous le filtre actif (même sémantique de match que
  l'arbre) — ce qu'elle annonce est toujours vérifiable d'un clic.
- **Reveal ≠ expansion forcée du layout** : passer par le toggle standard (et
  non un patch DOM ad hoc) fait persister l'expansion dans l'état, donc à
  travers **tous** les re-renders suivants.
- **Jamais de vol de focus** : ni le reveal post-copie, ni le refresh croisé
  des pastilles (restauration par `focusItemByPath`).
- **Chips plats hors périmètre** : la pastille ne concerne que le scénario
  sync (épars → dossier filtré) ; Années garde son chip plat inchangé.

## Notes / Risques

- Le mode 📄 fichiers et le filtre 2 niveaux (EPIC-030, `4f4eff2`) sont le
  socle de la pastille : leur sémantique doit rester alignée si le matching
  évolue (helper pur partagé = point de vérité unique).
- Sticky bottom des Doublons (`.dup-card-actions`) inchangé — le ▶ vit dans la
  ligne du membre, pas dans la barre d'actions.
- `focusItemByPath` restaure aussi le twin-hint (EPIC-028) : tout rebuild du
  panneau épars doit passer par le même chemin (cf. `renderSource`).
