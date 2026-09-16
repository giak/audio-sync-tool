# EPIC-029 — Routeur de pages + vue Doublons v2 (groupes de versions) + légende à jour

> **Statut** : 🔵 En cours (code livré, tests verts, commit à venir)
> **Créée** : 2026-09-16 · **Priorité** : Haute (bug de navigation bloquant + évolution métier)
> **Docs liées** : EPIC-028 (détection/action — cette EPIC en est la suite UX), spec `2026-09-15-doublons-detection-design.md`

## Objectif

1. **Réparer la navigation** : la vue Doublons (P2 d'EPIC-028) était une fausse
   modal greffée sur le pattern Playlist → pages qui se télescopent (Sync
   s'affichait par-dessus Doublons, boutons `.active` mensongers, clavier
   doublons mort dès qu'une vraie modal s'ouvrait).
2. **Évoluer la vue Doublons** : au-delà des paires 1↔1, regrouper les
   **versions multiples d'un même morceau** (épars et/ou rangés) et arbitrer
   la meilleure qualité.
3. **Remettre la modale ❓ Raccourcis & Légende d'équerre** (structure cassée,
   états manquants, section Doublons obsolète).

## Décisions utilisateur (2026-09-16)

- **Architecture** : vraie 3ᵉ page (routeur `state.page`), pas de patch modal.
- **Arbitrage** : auto par score qualité **+ override manuel** au clic.
- **Destination du gagnant** : toujours **rangé à droite** — si le gagnant est
  épars, il est copié dans le dossier du meilleur rangé ; les rangés perdants
  vont au `_trash/<date>/` (jamais effacés) ; les épars perdants restent en
  place (la dispersion n'est pas nettoyée automatiquement).

## Tâches

### Routeur de pages — ✅
- [x] `router.ts` (nouveau) : `goPage('sync'|'playlist'|'dups')`, layouts ET
      boutons nav mutuellement exclusifs ; `state.page` = source de vérité ;
      `playlistMode` dérivé (conservé pour éviter un blast radius de 43 refs)
- [x] `state.ts` : champ `page` + type `Page` ; `'dups'` retiré d'`ActiveModal`
- [x] Registry : champ `page` dans `CommandContext`/`CommandBinding`
- [x] `script.ts` : handlers nav triviaux (`page-sync` ferme maintenant
      Doublons — le bug rapporté), enter/exit Playlist via `goPage`
- [x] `commands/dups.ts` : bindings ↑↓/R/Échap scopés `page: 'dups'` +
      `activeModal: null` — le confirmDialog redevient une vraie modal
      au-dessus de la page, sans conflit d'état

### Vue Doublons v2 (groupes) — ✅
- [x] `dupGroups.ts` (nouveau) : clusterisation transitive (union-find) des
      exemplaires des deux côtés — durée ±2 s + nom normalisé ≥ 0,88 ;
      arbitrage = score qualité (paliers dupDetect), tie-breaks durée puis
      chemin (déterministe) ; `winner`/`losers`/`winnerNeedsCopy`/`copyTargetDir`
- [x] `dupsUI.ts` v2 : cartes de groupes « Titre (N versions) », gagnant ✓,
      clic sur un membre = override, bouton `✓ Appliquer`, navigation ↑↓ par
      groupe, re-render auto sur `sourceFiles:changed`
- [x] `actions.ts` : `applyGroupPlan(group, overridePath)` — gagnant épars →
      `/copy` vers le dossier du meilleur rangé, PUIS rangés perdants →
      `/move` `_trash/<date>/` (tout ou rien : copie KO ⇒ aucun move),
      retrait du state + `refreshDupMatches()`
- [x] Tests : `dupGroups.test.ts` (8 : transitive, paires, isolés exclus,
      tri déterministe, normalisation) ; `dupsUI.test.ts` v2 (8)

### Modale ❓ Raccourcis & Légende — ✅
- [x] Cause du mélange : **5 sections dans une grille 4 colonnes** (Cue editor
      orpheline) + un `<div class="legend-section">` orphelin hérité du P2
- [x] Grille 5 colonnes (repli responsive 3/2/1), modale élargie
- [x] Section « États — page Sync » complète : 4 LED + lecture + **sélection
      multi-copie** (ajouté) + **halo ambre pulsé du jumeau** (ajouté, démo
      animée `.twin-demo`) + **note 0-100** (ajoutée) + badges NML
- [x] Sections raccourcis auditées contre le code (21 bindings registry +
      cueEditor) : Sync (R/double-clic ajouté), Playlist (exhaustif), Doublons
      (réécrit v2 groupes), Cue editor (Échap plein écran ajouté)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/router.ts` (nouveau) | Routeur de pages `goPage` |
| `static/src/dupGroups.ts` (nouveau) | Clusterisation + arbitrage qualité |
| `static/src/state.ts` | `page`, type `Page`, `ActiveModal` nettoyé |
| `static/src/commands/registry.ts` | Champ `page` (contexte + binding) |
| `static/src/commands/dups.ts` | Bindings scopés page dups |
| `static/src/render/dupsUI.ts` | Vue v2 cartes de groupes |
| `static/src/actions.ts` | `applyGroupPlan` |
| `static/src/script.ts` | Handlers nav via `goPage` |
| `templates/index.html` | Bouton `↔ Doublons` (déjà P2) + légende refaite |
| `static/style.css` | Cartes groupes, grille légende 5 col, démos LED/halo |

## Validation

- [x] Typecheck ✓ · Lint ✓ · Build ✓
- [x] **vitest 814/814** (33 fichiers) — dont intégration 80/80 adaptée
- [x] pytest 190/190 (non affecté)
- [x] Équilibrage HTML vérifié par parseur (div balance)
- [ ] Validation visuelle utilisateur : nav 3 pages, arbitrage de groupes sur
      données réelles, lisibilité de la légende 5 colonnes

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _(à compléter au commit)_ | |

## Notes / Risques

- `playlistMode` conservé volontairement (43 références) : il signifie
  désormais exactement `page === 'playlist'`. Un nettoyage complet vers
  `page`/`playlistFocus` serait une EPIC dette à part.
- L'override de gagnant est **volatil** (Map en mémoire, reset à l'ouverture
  de la vue) — un override persistant serait un P3.
- La détection client des groupes hérite de la limite documentée EPIC-028 :
  heuristique conteneur/bitrate, revue humaine obligatoire (confirmDialog).
