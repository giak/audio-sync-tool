# EPIC-030 — Filtre rapide universel par liste (chips intégralement intégrés)

> **Statut** : ⏸️ En pause sur décision utilisateur (2026-09-16) — **P0 livré** (`850584a`), **partie de P1 livrée** (`playlist-source` est fonctionnel, livré avec la correction chip persistant `56431a9`), **P1 Playlist-tracks/Doublons et P2 en attente** — EPIC-031 (clavier) prioritaire
> **Priorité** : Haute (recherche transversale, friction quotidienne)
> **Découle de** : usage quotidien des pages Sync/Playlist/Doublons (sessions 2026-09)

## Objectif

Un **composant commun de recherche/filtrage** disponible sur **chaque colonne /
liste** de toutes les pages : taper une lettre commence à filtrer, deux lettres
affinent, etc. Le filtre est toujours actif **là où est le focus** — il y a
mémorisation de l'état des filtres par page/colonne/liste. Pour effacer :
**Backspace** (lettre à lettre) ou un bouton **« clear filter » (✕)**.
Le filtre actif doit être **visible** : texte du filtre dans un petit encadré
au-dessus de la liste. Un filtre par **année** sur Sync → Éparpillé (couvert
par le matcher : les chiffres matchent aussi l'année).

## Décisions validées (2026-09-16)

1. **Chip intégré** (option A) : barre de filtre intégrée au-dessus de chaque
   liste — palette flottante supprimée.
2. **F7 ou `/` = porte d'entrée** (option A) : focus l'input du chip de la
   liste focusée. Pas de type-through (conflits R/N/1-8/Espace/F5).
3. **Mémorisation session** (option A) : `state.filters` (Record par scope) ;
   survit aux changements de page et aux scans, perdu au reload.

## Design

### Scopes de filtre (mémorisation par liste)

| Scope | Page | Liste | Champs matchés |
|---|---|---|---|
| `sync-epars` | Sync | épars (liste plate) | nom + année + codec |
| `sync-source` | Sync | arbre Source Data | nom (auto-dépliage existant) |
| `playlist-source` | Playlist | arbre Source Data | nom |
| `playlist-tracks` | Playlist | pistes du sidebar | nom + année |
| `dups` | Doublons | groupes de versions | titre du groupe + noms des membres |

### Composant `FilterChip` (HTML commun)

```html
<div class="filter-chip" data-scope="sync-epars">
  <span class="filter-icon">🔍</span>
  <input class="filter-input" placeholder="Filtrer…" spellcheck="false" autocomplete="off">
  <span class="filter-count">12/1430</span>
  <button class="filter-clear" title="Effacer le filtre (Backspace)">✕</button>
</div>
```

- **Visible en permanence** dans chaque colonne (état compact : juste 🔍 + ✕ si
  filtre vide ; complet si filtre actif) — la visibilité du chip EST l'état
- `filter-count` : `matchés/total` recalculé au render
- **Backspace** dans l'input : efface la dernière lettre ; champ vide +
  Backspace → sort du mode filtre (blur → focus revient à la liste)
- **Échap** dans l'input : idem sortie + filtre conservé
- **✕** : vide le filtre du scope + blur
- **Tab** depuis l'input : bascule vers la liste suivante (comportement normal)

### Moteur partagé (`filterEngine.ts`)

- `matchesFile(term, entry)`: tokens insensibles casse/accents, match
  `filename + year + codec` ; tous les tokens doivent matcher (AND)
- `matchesName(term, name)` pour dossiers/groupes
- Réutilise `normalizeName`-like logic (accents strips) — module pur + tests
- Auto-dépliage de l'arbre source pendant filtre actif (comportement F7
  existant conservé tel quel)

### Routing clavier

- `F7`/`/` → focus l'input du chip du scope **de la liste focusée** (registry :
  un binding par page, `page` + `activeModal: null` + `isFilterInputFocused`)
- Input focusé → le routeur court-circuite les bindings de page (existant :
  `isInput`)
- `isFilterInputFocused` (contexte) reste pour les comportements spéciaux
  (navigation dans les résultats sans sortir du filtre : ↑↓ repartent dans la
  liste filtrée — à conserver)

### Migration

- `state.sourceFilter`/`state.filterActive` → `state.filters['sync-source']`
  (les usages de `sourceTree.ts` lisent le nouveau scope) ; `filterActive`
  devient dérivé (`!!term`)
- **Palette flottante supprimée** (`#filter-palette`, `initFilterPalette`,
  bindings `F7`/`/` actuels remplacés)
- `computeStatus`/compteurs : affichage des compteurs `N/total` par chip

## Tâches

### P0 — Moteur + chip Sync (les deux colonnes) — ✅ 2026-09-16
- [x] `filterEngine.ts` : matcher tokens (nom+année+codec), casse/accents, AND
- [x] `state.filters` : Record<scope, string> + nettoyage `sourceFilter`/`filterActive`
      (les deux champs legacy **supprimés** du state, pas seulement dérivés)
- [x] Composant chip (factory TS `createFilterChip`) + CSS (compact/actif, count, clear)
- [x] `sync-epars` : filtrage de la liste plate + compteur + bandeau « aucun résultat »
- [x] `sync-source` : migration du filtre existant (auto-dépliage conservé) +
      bandeau « Aucun dossier trouvé pour ce filtre »
- [x] F7// routent vers le chip de la colonne focusée (`commands/filter.ts`) ;
      Backspace/Échap/✕ ; Échap-Tab-↓ dans l'input (navigation.ts)
- [x] Tests : matcher (14), chips + scopes (16), intégration adaptée — 803/803 vitest,
      190/190 pytest, typecheck/lint/build ✓
- [x] Palette flottante supprimée (DOM, CSS, `initFilterPalette`, bindings) ;
      `isFilterInputFocused` détecte désormais la classe `.filter-input`
      (l'id `source-filter` n'existe plus)

### P1 — Playlist + Doublons ⏸️ EN PAUSE (EPIC-031 prioritaire)
- [x] `playlist-source` (livré avec `56431a9` — chip persistant)
- [ ] `playlist-tracks` (mêmes chips)
- [ ] `dups` : filtre sur titre du groupe + noms des membres
- [ ] F7// fonctionnels sur les 3 pages
- [ ] Tests

### P2 — Confort (optionnel)
- [ ] Token spécial `y:2023` si le match numérique s'avère ambigu
- [ ] Navigation ↑↓ dans les résultats depuis l'input (sans quitter le filtre)
- [ ] sessionStorage si la demande évolue (décision session pour l'instant)

## Fichiers impactés (anticipés)

| Fichier | Rôle |
|---|---|
| `static/src/filterEngine.ts` (nouveau) | Matcher partagé (pur, testé) |
| `static/src/render/filterChip.ts` (nouveau) | Factory du composant chip |
| `static/src/state.ts` | `filters: Record<string, string>` |
| `static/src/ui.ts` | Suppression palette flottante |
| `static/src/render/eparsUI.ts`, `sourceTree.ts`, `playlistUI.ts`, `dupsUI.ts` | Consumption des scopes |
| `static/src/commands/filter.ts` | F7// → focus chip du scope courant |
| `static/src/script.ts` | init chips |
| `templates/index.html` | Retrait `#filter-palette` |
| `static/style.css` | `.filter-chip` compact/actif |

## Risques / pièges

- **Conflit clavier** : F7// seulement — le type-through est écarté (décision)
- Le chip ne doit **pas voler le focus** au render (input focusé seulement via
  F7// ou clic)
- Compteurs fiables : matchés/total calculés côté render (pas de double source)
- Perf : 5 092 épars × AND tokens — matcher O(n) trivial, mais re-render
  complet à chaque frappe à debouncer (150 ms, pattern existant)
- L'élagage `_trash/` du scan (EPIC-028) ne concerne pas le filtrage — les
  fichiers trash ne sont pas indexés, donc jamais filtrés
- Shuffle-proof : `state.filters` réinitialisé dans le `setupTestState` des
  tests d'intégration

## Traçabilité

| Étape | Commit | Contenu |
|---|---|---|
| P0 | `850584a` | filterEngine + filterChip + scopes sync-epars/sync-source + F7// + retrait palette (29 fichiers, +455/−399) |
| Filtre 2 niveaux | `4f4eff2` | toggle 📄 fichiers dans le chip des arbres (sync-source + playlist-source) : dossiers seuls par défaut (expansion rend TOUS les fichiers), fichiers opt-in (dirHasMatchingFile + table filtrée à la source dans buildSourceChildren) — 9 fichiers, +298/−15 |

Découvertes P0 documentées : `domPatches.ts` lit désormais `state.filters['sync-source']`
(compteur header après copy) ; le registry ne porte plus `filterActive` (les bindings
Échap audio/menu-contextuel n'étaient déclenchés que si ce champ mort était `false`).

## Validation navigateur

- [ ] **Utilisateur** : chip visible au-dessus des 2 colonnes Sync, frappe filtre en
      direct, mémorisation en changeant de colonne/page, ✕ et Backspace, F7//

- Tests matcher : accents, casse, année, codec, AND multi-tokens
- Tests chips : render compact/actif, count, mémorisation inter-pages
- Tests clavier : F7// ciblent le bon scope, Backspace/Échap/✕
- Règle : le filtre ne mute jamais les données (lecture seule, toujours
  réversible via ✕)
