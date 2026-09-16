# EPIC-031 — Clavier centralisé : grammaire des touches, catalogue unique, ergonomie sync

> **Statut** : 🟡 Backlog (brainstorm validé, implémentation à venir)
> **Créée** : 2026-09-16 · **Priorité** : Haute (dette architecturale prouvée + ergonomie = cœur du produit)
> **Docs liées** : EPIC-030 (filtre — les bugs focus/←→ qui ont motivé celle-ci), EPIC-028 (règle `_trash`), AGENT.md `%ARCHITECTURE.keyboard`

## Problème

52 bindings `registry.bind` répartis dans 10 fichiers, avec 3 fragilités **prouvées en production** (session du 2026-09-16) :

1. **L'ordre d'import décide des priorités** — les bindings F7/`/` de `playlist.ts` étaient morts silencieusement (filter.ts, importé avant, gagnait toujours). Aucun signal, aucun test ne le détectait.
2. **Gardes manuelles et répétées** — `isInput: false` posé à la main sur 20+ bindings ; oublié 2 fois (←/→ et Espace captés dans l'input filtre = caret bloqué, espace impossible).
3. **Légende désynchronisée** — document HTML à part, déjà divergé du code une fois (mélange doublons/cue, 2026-09-16).
4. **Sémantique incohérente** — Échap ferme modale/filtre/page Doublons mais ne replie pas un dossier déplié ; le menu contextuel est souris-only ; aucune touche `?` pour l'aide.

Objectif utilisateur : sur la page sync, **sélectionner, écouter, déplacer le plus vite possible, sans souris** — avec un système simple, robuste, fiable et **sans régression**.

## Décisions de conception (brainstorm 2026-09-16)

### Évoluer le registry existant, PAS de rewrite

Le registry déclaratif (`bind({key, conditions})` + `buildContext`) est la bonne base. Un rewrite = risque de régression maximal pour peu de gain. Quatre évolutions ciblées :

### 1. Contextes nommés + priorité déclarative

```
modal > filter-input > context-menu > list > global
```

- Chaque binding déclare `ctx: 'filter-input'` au lieu de conditions atomiques à combiner
- Le registry trie par priorité **au lieu de l'ordre d'import** — déterministe et testable
- **Test anti-régression** : tout doublon (touche + contexte) est une erreur détectée en CI, plus jamais de binding mort silencieux

### 2. Les gardes deviennent structurelles

`buildContext` classe déjà l'état réel (modale ouverte ? input filtre focusé ? page ?). Le binding déclare son contexte ; le routeur sait où on est. Les 20+ `isInput: false` manuels deviennent implicites — la classe d'erreurs « touche volée dans l'input » disparaît structurellement.

### 3. Catalogue unique `shortcuts.ts` — source de vérité

```ts
{ id: 'filter-toggle', key: 'F7', ctx: 'list', label: 'Afficher/masquer le filtre', action: ... }
```

De là, on **dérive** :
- les bindings registry (plus de `bind` éparpillés dans 10 fichiers)
- la légende HTML (générée → **jamais plus désynchronisée**)
- un test de bijection : toute touche a un label, tout label a une touche

Ajouter un raccourci = une ligne à un seul endroit.

### 4. La grammaire des touches (contrat sémantique)

| Touche | Signification | Notes |
|---|---|---|
| **Échap** | Fermer/reculer, dans l'ordre de la pile : modale → menu contextuel → filtre → **dossier déplié (NOUVEAU)** → stop audio en dernier recours | Cas « fermer » de l'utilisateur |
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

- **P0 — Refactor à comportement identique** :
  1. **Matrice de caractérisation AVANT tout refacto** : chaque touche × chaque contexte (modale ouverte, filtre focusé, page x, audio en lecture) → capture du comportement actuel en tests. C'est le filet.
  2. Contextes nommés + tri par priorité dans le registry
  3. Catalogue `shortcuts.ts` ; bindings dérivés ; légende générée
  4. Test bijection légende ↔ code + test anti-doublon
- **P1 — Sémantique** : Échap replie le dossier déplié (dans l'ordre de la pile) ; `?` ouvre la légende ; menu contextuel clavier
- **P2 — Ergonomie sync** : `M` déplacer vers dossier focusé (Space ×n → M) ; écoute en chaîne ; notes rapides 1-5 si validées ; auto-play optionnel

## Critères d'acceptation

- [ ] Matrice de caractérisation verte AVANT le refacto (P0.1) — comportement actuel figé
- [ ] Plus aucun binding hors du catalogue `shortcuts.ts`
- [ ] Test CI : doublon (touche+contexte) = erreur ; légende = dérivation du catalogue
- [ ] La légende affichée = exactement les raccourcis actifs (test bijection)
- [ ] Échap applique la pile de fermeture dans l'ordre (testé pour chaque niveau)
- [ ] Aucune régression : suites vitest/pytest au vert à chaque commit P0
- [ ] Sur sync : Space ×n → flèches → M déplace les sélectionnés sans souris (P2)

## Fichiers impactés (prévision)

`static/src/commands/registry.ts` (priorité + contextes), `static/src/commands/shortcuts.ts` (NOUVEAU catalogue), `static/src/commands/navigation.ts`, `audio.ts`, `copy.ts`, `filter.ts`, `modals.ts`, `playlist.ts`, `dups.ts`, `rating.ts`, `replace.ts` (migration vers catalogue), `static/src/ui.ts` (menu contextuel clavier), `static/src/render/legendUI.ts` (NOUVEAU, légende dérivée), `templates/index.html` (légende générée), `static/style.css`.

## Traçabilité

- Commits : à compléter à chaque phase (convention dépôt : hash réel dans l'EPIC)
