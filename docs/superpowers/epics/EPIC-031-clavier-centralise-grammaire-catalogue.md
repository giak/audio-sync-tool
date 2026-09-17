# EPIC-031 — Clavier : matrice de caractérisation, légende générée, grammaire des touches, ergonomie sync

> **Statut** : 🟡 P1 livré (2026-09-17) — P0 matrice + P1 findings/pile Échap/légende générée/menu clavier ; P2 ergonomie sync à venir
> **Créée** : 2026-09-16 · **Priorité** : Haute (dette architecturale prouvée + ergonomie = cœur du produit)
> **Docs liées** : EPIC-030 (filtre — les bugs focus/←→ qui ont motivé celle-ci), EPIC-028 (règle `_trash`), AGENT.md `%ARCHITECTURE.keyboard`

## Problème

52 bindings `registry.bind` répartis dans 10 fichiers, avec 3 fragilités **prouvées en production** (session du 2026-09-16) :

1. **L'ordre d'import décide des priorités** — les bindings F7/`/` de `playlist.ts` étaient morts silencieusement (filter.ts, importé avant, gagnait toujours). Aucun signal, aucun test ne le détectait.
2. **Gardes manuelles et répétées** — `isInput: false` posé à la main sur 34 bindings ; oublié 2 fois (←/→ et Espace captés dans l'input filtre = caret bloqué, espace impossible). Et un binding Échap de `modals.ts` (fallback menu contextuel) en est toujours dépourvu.
3. **Légende désynchronisée** — document HTML à part, déjà divergé du code une fois (mélange doublons/cue, 2026-09-16).
4. **Sémantique incohérente** — Échap ferme modale/filtre/page Doublons mais ne replie pas un dossier déplié ; le menu contextuel est souris-only ; aucune touche `?` pour l'aide.

Objectif utilisateur : sur la page sync, **sélectionner, écouter, déplacer le plus vite possible, sans souris** — avec un système simple, robuste, fiable et **sans régression**.

## Décisions de conception (brainstorm 2026-09-16, révisé KISS/YAGNI)

### Évoluer le registry existant, PAS de rewrite, PAS de nouvelle architecture

Le registry déclaratif (`bind({key, conditions})` + `buildContext`) est la bonne base. Révision du 2026-09-16 après auto-critique : le premier jet (contextes nommés + tri par priorité + fichier catalogue) sur-architecturait. Les 2 vrais bugs de session ont été corrigés par des fixes minimaux **déjà livrés** (suppression des bindings morts, gardes `isInput` manquantes). Ce qui manque n'est pas de l'architecture, c'est de la **visibilité** :

### 1. Matrice de caractérisation — LE livrable P0 (test pur, zéro prod)

Un test qui simule `registry.dispatch` sur le produit croisé des états réels :
`page` × `activeModal` × `filter-input focusé` × `input focusé` × `audio playing` × `panel` — et pour chaque cellule :
- **quels bindings matchent** (assertion : le gagnant est celui attendu — le comportement ACTUEL est figé avant tout refacto)
- **aucun binding mort** (tout binding déclaré matche dans ≥ 1 état testé)

C'est le filet anti-régression ET le détecteur de shadowing : le bug « bindings F7 morts de playlist.ts » et le bug « ←/→ captés » auraient été des rouge CI. La matrice documente aussi la pile Échap réelle (déjà encodée dans les conditions — pas besoin d'un système de priorité pour la créer).

**Leçon forensique (2026-09-16)** : le même cas Échap a été dérivé **trois fois avec trois conclusions** (audio gagne → filtre gagne → dérivation complète). La dérivation rigoureuse (ordre réel : navigation.ts entier → audio.ts → modals.ts) établit : filtre focusé + audio playing → l'Échap-filtre (navigation.ts, enregistré 1ᵉʳ) gagne, l'audio continue ✓. Mais elle révèle **2 cas limites non tranchés** que le raisonnement manuel n'avait jamais vus : (a) input filtre focusé + modale ouverte → l'Échap-filtre matche AVANT les ferme-modales (cache le filtre au lieu de fermer la modale ?) ; (b) le fallback « fermer menu contextuel » (modals.ts) n'a pas de garde `isInput`. Moralité : la dérivation manuelle n'est pas fiable, même en étant rigoureux — seuls les tests de matrice tranchent. Ces 2 cas sont les premières cellules à écrire.

### 2. Labels sur les bindings + légende générée (DRY ciblé, pas de nouveau fichier)

La légende a divergé du code une fois — ce risque est réel, pas spéculatif. Fix minimal :
- 2 champs optionnels sur `CommandBinding` : `label` (texte lisible) + `group` (section légende : sync / playlist / dups / global)
- `registry.list()` (snapshot public des bindings)
- la légende HTML est **générée** depuis les bindings labellisés au démarrage
- test bijection : tout binding a un label ; toute ligne de légende vient d'un binding

Ajouter un raccourci = `bind({..., label, group})` — un seul endroit, comme promis, mais sans fichier `shortcuts.ts` ni migration big-bang des 52 bindings existants (migration progressive : label exigé par le test, ajoutés fichier par fichier).

### 3. La grammaire des touches (contrat documenté, pas du code nouveau)

| Touche | Signification | Notes |
|---|---|---|
| **Échap** | Fermer/reculer, dans l'ordre de la pile : modale → menu contextuel → filtre → **dossier déplié (NOUVEAU, P1)** → stop audio en dernier recours | Cas « fermer » de l'utilisateur. L'ordre actuel est conforme mais porté par l'ordre d'import (fragile) ; P1 rend la pile explicite dans la matrice et ajoute l'étape manquante |
| **Flèches** | Déplacer focus/caret, jamais une action | |
| **Tab** | Changer de zone | |
| **Enter** | Lire / ouvrir | |
| **Espace** | Sélectionner / toggle | |
| **Lettres** | Action sur l'élément focusé (R, N…), confirmées ou révocables | |
| **F-touches** | Outils transverses (F5 copier, F7 filtre) | |

## Ergonomie sync — gains de vitesse (priorisés)

| # | Candidat | Gain | Note |
|---|---|---|---|
| 1 | **Space multi-sélection → `M` = déplacer vers le dossier focusé à droite** | Le flux ultime : Space ×3 → flèches vers le bon dossier → M. Terminé. | `/move` existe ; source déplacée → `_trash/` (règle EPIC-028 : jamais effacer) |
| 2 | **Écoute en chaîne** — fin d'un morceau → joue le suivant sélectionné/voisin | Aperçu d'un dossier sans clic | `onended` existe, juste à chaîner |
| 3 | **`?` ouvre la légende** | Découvrabilité | Trivial |
| 4 | **Menu contextuel au clavier** — Shift+F10 ouvre, ↑↓+Enter navigue, Échap ferme | Zéro souris de bout en bout | `showContextMenu` à enrichir |
| 5 | Notes rapides 1-5 (→ 20/40/60/80/100) | Alternative à N | Redondant avec N — à débattre |
| 6 | Auto-play au déplacement du focus | Aperçu instantané | Bruyant — optionnel (toggle config), dernier |

## Découpage anti-régression

- **P0 — Visibilité, pas refacto** :
  1. Matrice de caractérisation (test pur) — comportement actuel figé, bindings morts et shadowing = rouge CI
  2. `label`/`group` sur `CommandBinding` + `registry.list()` ; légende générée depuis les bindings
  3. Tests bijection légende ↔ bindings ; migration des labels fichier par fichier (le test les exige progressivement)
- **P1 — Sémantique Échap** : rendre la pile explicite (Échap replie le dossier déplié ; stop audio en dernier recours, vérifié par la matrice) ; `?` ouvre la légende ; menu contextuel clavier (Shift+F10, ↑↓+Enter)
- **P2 — Ergonomie sync** : `M` déplacer vers dossier focusé (Space ×n → M, `/move` + `_trash/`) ; écoute en chaîne (`onended`) ; notes rapides 1-5 si validées ; auto-play optionnel en dernier

**Règle YAGNI explicite** : pas de système de priorité déclarative, pas de fichier catalogue, pas de gardes structurelles — SAUF si la matrice P0 prouve qu'un binding est inexprimable dans le modèle actuel. Décision prise sur preuve, pas sur speculation.

## Critères d'acceptation

- [x] Matrice verte sur le comportement ACTUEL avant toute modification prod — **livré P0** : `static/src/commands/keyboardMatrix.test.ts`, 64 cellules + 3 invariants — **durci P1** : 78 cellules + 5 invariants, indices IDX **dérivés du contenu du registry** (shuffle-proof : `test:shuffle` ne peut plus casser les espérances)
- [x] Binding mort ou shadowé = rouge CI (invariants 1 & 2 — P1 : invariant 2 durci, **zéro** binding toujours-shadowé attendu)
- [x] Légende affichée = dérivation exacte des bindings labellisés (test bijection) — **livré P1** : `render/legend.ts` + `render/legend.test.ts` (bijection par section de groupe)
- [x] Échap : ordre de la pile vérifié cellule par cellule dans la matrice (le comportement « par chance d'import » devient un comportement testé) — cellules Échap : filtre, audio, modale ×6, fallback, dups — **P1 : pile complète en invariant 4** (menu > modale > filtre > dossier > audio)
- [x] Aucune régression : vitest 916/916 (38 fichiers), pytest 190/190, typecheck/lint/build ✓
- [ ] Sur sync : Space ×n → flèches → M déplace les sélectionnés sans souris (P2)

### Findings figés par la matrice (exécution du 2026-09-16, candidats fix P1)

1. **FINDING 1** — modale ouverte + filtre focusé : Échap ferme le **filtre**, pas la modale (binding #14 sans garde `activeModal`, enregistré avant les ferme-modales #40-45)
2. **FINDING 2** — Échap dans un input ordinaire → `closeContextMenu` (fallback #46 sans garde `isInput`)
3. **FINDING 3** — **Alt+←/→ (historique, #12-13) sont MORTS en page sync** : shadowés par ←/→ épars (#6-7) sans garde `altKey` — confirmé à l'exécution (l'inverse de la dérivation manuelle initiale : la matrice a tranché)
4. **SUSPECT confirmé** — les 4 bindings dups (#48-51) ne gagnent **jamais** (shadowés par les bindings sync sans garde `page`) : clavier page Doublons inopérant via le registry

> Méthode harnais (leçons) : contexte capturé **au vol** dans le dispatch (le handler gagnant mute le DOM — blur — avant toute ré-identification a posteriori) ; events dispatchés sur l'élément focusé (e.target véridique → `isInput`) ; sweep des invariants **non bouillonnant** (sinon le routeur exécute les handlers et corrompt le monde).

### P1 livré (2026-09-17)

1. **FINDING 1 corrigé** — garde `activeModal: null` sur l'Échap-filtre (navigation.ts) : sous une modale, Échap ferme la modale.
2. **FINDING 2 corrigé** — le fallback « closeContextMenu à l'aveugle » est **remplacé** par un état : champ de contexte `isContextMenuOpen` (registry) + module `commands/menu.ts` dont l'Échap-menu est le **premier pilier** de la pile (menu.ts importé EN PREMIER dans script.ts — l'ordre d'import reste la priorité).
3. **FINDING 3 corrigé** — `altKey: false` sur les ←/→ sync/épars : Alt+←/→ historique vivants (cellules inversées en vérités exécutables).
4. **SUSPECT corrigé** — gardes `page: 'sync'` sur audio (×5), copy (F5), rating-source, replace (R) **et navigation ↓↑** : le fix a révélé un shadowing supplémentaire (les ↓↑ sync sans garde `page` shadowaient aussi dups ↓↑ via `playlistMode: false`) — l'invariant 2 durci (zéro shadowé) l'eût attrapé seul.
5. **Pile Échap complète** — menu → modale → filtre → **dossier déplié** (nouveau, champ `isExpandedDirFocused` dérivé du `.focused` du conteneur actif — le focus de l'app est une classe, pas `activeElement`) → stop audio en dernier (scopé sync). Figée par l'**invariant 4**.
6. **Légende générée** — `label`/`group` sur `CommandBinding`, `renderKeyboardLegend()` (`render/legend.ts`) projette les bindings labellisés dans `#modal-legend` (sections États/Cue editor statiques préservées) ; test bijection par section (`render/legend.test.ts`) ; **invariant 5** : tout binding doit porter label+group.
7. **`?` ouvre la légende** (modals.ts, garde isInput/activeModal/menu) ; **menu contextuel clavier** : Shift+F10 ouvre (dispatch `contextmenu` sur l'élément focusé, ne montre rien si non annulé), ↑↓ surbrillance (`.ctx-highlight`, boucle), Enter active (défaut : premier item) — tests d'interaction réels (`commands/menu.test.ts`, vrai `ui.js`).

> Leçon shuffle : les espérances par INDEX d'enregistrement cassent sous `test:shuffle` (ordre des fichiers mélangé ⇒ ordre des bindings mélangé). Les IDX sont désormais **dérivés** de chaque binding (touche + conditions discriminantes vérifiées uniques) — la matrice reste exacte quel que soit l'ordre. Flakiness shuffle pré-existante hors périmètre (sourceTree/cueEditor, présente sur HEAD).

## Fichiers impactés (prévision)

`static/src/commands/registry.ts` (`list()` + 2 champs optionnels), tests de matrice (NOUVEAU, test-only), `static/src/ui.ts` ou nouveau module léger de rendu légende, `templates/index.html` (légende générée), puis labellisation progressive des 10 fichiers `commands/*.ts`. P1 : `navigation.ts` (Échap dossier), `ui.ts` (menu clavier). P2 : `playlist.ts`/nouveau `move.ts` (M), `audio.ts` (`onended`).

**P1 réalisé** : `commands/registry.ts` (2 champs contexte + label/group), `commands/menu.ts` (NOUVEAU), `commands/navigation.ts` (F1/F3 + Échap-dossier + labels), `commands/audio.ts`/`copy.ts`/`replace.ts`/`rating.ts` (page:'sync' + labels), `commands/modals.ts` (fallback retiré, `?`), `commands/filter.ts`/`playlist.ts`/`dups.ts` (labels), `render/legend.ts` (NOUVEAU), `ui.ts` (surbrillance menu), `script.ts` (import menu + légende au boot), `templates/index.html` (colonnes raccourcis remplacées par la génération, footer pile Échap), `static/style.css` (`.ctx-highlight`) + tests (matrice durcie, `menu.test.ts`, `legend.test.ts`, `modals.test.ts`).

## Traçabilité

- Commits : à compléter à chaque phase (convention dépôt : hash réel dans l'EPIC)
- **P0 matrice** : commit `b66d091` (keyboardMatrix.test.ts 64/64 + registry.bindingMatches extraction)
- **P1** : commit `f1476de` (findings corrigés + pile Échap + légende générée + menu clavier)
