# EPIC-031 — Clavier : matrice de caractérisation, légende générée, grammaire des touches, ergonomie sync

> **Statut** : 🟡 Backlog (brainstorm validé, implémentation à venir)
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

- [ ] Matrice verte sur le comportement ACTUEL avant toute modification prod
- [ ] Binding mort ou shadowé = rouge CI (testé : le cas playlist-F7 rejoué dans la matrice est rouge sans le fix)
- [ ] Légende affichée = dérivation exacte des bindings labellisés (test bijection)
- [ ] Échap : ordre de la pile vérifié cellule par cellule dans la matrice (le comportement « par chance d'import » devient un comportement testé)
- [ ] Aucune régression : vitest/pytest au vert à chaque commit
- [ ] Sur sync : Space ×n → flèches → M déplace les sélectionnés sans souris (P2)

## Fichiers impactés (prévision)

`static/src/commands/registry.ts` (`list()` + 2 champs optionnels), tests de matrice (NOUVEAU, test-only), `static/src/ui.ts` ou nouveau module léger de rendu légende, `templates/index.html` (légende générée), puis labellisation progressive des 10 fichiers `commands/*.ts`. P1 : `navigation.ts` (Échap dossier), `ui.ts` (menu clavier). P2 : `playlist.ts`/nouveau `move.ts` (M), `audio.ts` (`onended`).

## Traçabilité

- Commits : à compléter à chaque phase (convention dépôt : hash réel dans l'EPIC)
