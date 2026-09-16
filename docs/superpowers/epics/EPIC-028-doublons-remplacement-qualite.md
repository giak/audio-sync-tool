# EPIC-028 — Doublons épars ↔ source : détection + remplacement qualité

> **Statut** : 🟢 Presque livrée — P0 + P1bis + P1 action + P2 livrés, reste validation visuelle P2
> **Créée** : 2026-09-15 · **Dernière mise à jour** : 2026-09-16 (as-built P0/P1bis + P2)
> **Priorité** : Haute (doublons = espace disque + incohérence de bibliothèque)
> **Docs liées** : spec `2026-09-15-doublons-detection-design.md` (section « Carnet de mise en œuvre » pour l'as-built)

## Objectif

Détecter les fichiers « éparpillés » (gauche) déjà rangés à droite (Source
Data) malgré des noms qui varient (`(Radio Edit)`, `[HQ]`, remasters,
`Artiste - Titre` vs `Titre - Artiste`), et permettre de **remplacer** une
version rangée de moindre qualité par la copie épars supérieure (FLAC vs MP3)
— en **déplaçant** l'ancienne version vers un trash, **jamais en effaçant**.

## Contexte & découvertes

- Le scan indexe déjà `duration` (±1 s) et `codec`+bitrate sur les **deux**
  colonnes (`_scan_file`/`get_audio_meta`) → la détection peut être 100 %
  côté client, zéro backend pour la partie matching.
- `computeStatus` marque déjà « doublon » les épars dont le **nom exact**
  existe à droite — trop strict pour les homonymes réels.
- Décisions utilisateur (brainstorm 2026-09-15) :
  1. **Matching strict** : sim nom ≥ 0,88 ET |Δdurée| ≤ 2 s (une passe).
  2. **Trash dans la colonne de droite** : `<source>/_trash/YYYY-MM-DD/`
     (visible dans l'arbre, dans le périmètre `is_path_allowed`, à élaguer
     du `os.walk` du scan).
  3. **Remplacement un par un** après revue (R ou clic + confirmDialog) —
     pas de batch, pas d'auto.

## Tâches

### P0 — Détection (lecture seule) — ✅ Livré (`c3959ed`)
- [x] `static/src/dupDetect.ts` (~250 lignes, pur, zéro DOM) : normalisation
      de noms (accents, bruit, séparateurs), Levenshtein ratio + token-set
- [x] Bucketing par durée (±2 s) — index O(n). **Bug corrigé en testant** :
      offsets de lookup ±2 (pas ±1) pour couvrir Δ=2,0 s exact
- [x] Score qualité par paliers (lossless 100 / ≥256k 80 / 128-255 60 /
      <128 40) + tie-breakers (durée, bitrate) ; taille de fichier non ajoutée
      au scan (pas nécessaire avec bitrate+durée — décision d'implémentation)
- [x] Verdict par paire : `left-better` / `equal` / `right-better` ;
      1 épars matche au plus 1 jumeau (meilleur sim, puis Δ min)
- [x] `dupDetect.test.ts` : 27 tests — radio edit, token-set, accents,
      reprise homonyme (`Hurt - Johnny Cash` vs `NIN` rejeté : 1 token/6).
      Branchement : `state.dupMatches` + `refreshDupMatches()` après scan et
      après copy (+ initApp, corrigé en `26e73ab`)

### P1 — Action Remplacer (un par un) — ✅ Livré (`d70a0d9`)
- [x] Endpoint `POST /move` : `shutil.move`, `is_path_allowed()` src+dst,
      collision → suffixe `-2/-3` du **nouveau** fichier (`_collision_dst`,
      calculé avant copy/move), journal `moved-to-trash`/`moved`
- [x] Élaguer `_trash/` du `os.walk` du scan (`TRASH_DIRNAME` ; pas de
      `renderExtraDirs` à modifier — les extra dirs n'indexent pas de fichiers)
- [x] Badge sur les lignes épars matchées : tooltip
      `↔ <jumeau> — <verdict> · sim NN % · ΔN.N s` (+ hint R/double-clic)
- [x] Touche `R` / double-clic : confirmDialog (les deux noms affichés) →
      `POST /copy` puis `POST /move` (copie KO ⇒ pas de move — testé),
      patch state + re-render, verrou `replaceBusy`
- [x] pytest `/move` : déplacement OK, 403 hors zone, collision préservée,
      journal, cache. **Découverte** : `/copy` écrasait silencieusement un
      fichier existant → corrigé avec le même helper de collision

### P1bis — UX visuelle « voir le doublon et où il est » — ✅ Livré (`f383485` + `26e73ab`)
- [x] 4ᵉ état ambre « homonyme » (LED + barre gauche sur `td:first-child`,
      `:not(.focused)` pour laisser la barre cyan du focus gagner — les barres
      parasites de colonne ont été corrigées en smoke test)
- [x] Compteur header gauche : `📂 Éparpillé (N · X ↔)` + ligne d'état
      `↔ X homonymes`
- [x] Auto-highlight `.twin-hint` : 3 chemins de focus (clic, ↑↓, Tab/restauration)
      + events `eparsFocusPath:changed`/`dupMatches:changed` ;
      `scrollIntoView({block:'nearest'})` sans vol de focus ; nettoyage au quit
- [x] Jumeau non rendu → **fallback sur le dossier conteneur le plus profond
      rendu** (le smoke test a montré que l'arbre source démarre replié :
      sans ça, le « où » était muet dans l'état par défaut)
- [x] Tooltip : les deux noms + verdict + score (`sim 0,93 · Δ0 s`)
- [x] Tests : marqueur/barre/tooltip (5), twin-hint appliqué/retiré/fallback (5)
- [x] Intensités validées dans Chrome réel via CDP (`getComputedStyle`) :
      marqueur discret (barre 2px 75 %, contour 30 %, LED sans glow),
      hint marqué (contour 2px, fond 12 %, glow, pulsé 2,4 s 85↔45 %)
- [x] Smoke test données réelles (5 092 épars / 1 430 source) : 550 lignes
      ambre, tooltip OK, twin-hint visible, cleanup au ↑

### P2 — Vue « Doublons » — 🔶 Livré (`731cc24`, validation navigateur à faire)
- [x] Vue dédiée « ↔ Doublons » (nav) : modal-page pattern cueEditor/Playlist
      (`dupsUI.ts` + `commands/dups.ts`), liste des paires épars ↔ rangé,
      verdicts qualité (`✅ épars gagne` / `≈ équivalente` / `⚠️ rangé meilleur`
      avec codecs), score sim/Δ, tooltips chemins complets, échappement HTML
- [x] Navigation clavier ↑↓ (clamp 0..n-1), `R` remplace la paire focusée
      (réutilise `executeReplace` tel quel), Échap ferme + restaure le focus sync,
      clic ligne = focus + remplacement, re-render auto après remplacement
      (event `sourceFiles:changed`)
- [x] 10 tests vitest (render/échappement/navigation/remplacement/open-close)
- [ ] Validation visuelle utilisateur (intensité ambre, lisibilité de la table)
- [ ] Option non faite : enrichir le badge « doublon » de `computeStatus` avec
      le matching fuzzy (le marqueur ambre P1bis couvre déjà ce besoin en sync)

## Fichiers impactés (anticipés)

| Fichier | Rôle |
|---|---|
| `static/src/dupDetect.ts` (nouveau) | Détection pure : normalisation, matching, verdict |
| `static/src/dupDetect.test.ts` (nouveau) | Tests détection |
| `app.py` | `POST /move` + exclusion `_trash/` du scan |
| `test_app.py` | Tests `/move` (fichier présent après move !) |
| `static/src/actions.ts` | `executeReplace` (séquence copy+move) + `refreshDupMatches` |
| `static/src/commands/replace.ts` (nouveau) | Touche `R` (registry) |
| `static/src/render/eparsUI.ts` | Compteurs header + ligne d'état |
| `static/src/render/fileRow.ts` | Classe `dup-fuzzy`, tooltip, double-clic |
| `static/src/focus.ts` | Hook twin-hint (3 chemins de focus + events) |
| `static/src/utils.ts` | Éventuel enrichissement `computeStatus` |
| `static/style.css` | 4ᵉ état ambre (LED + barre gauche) + `.twin-hint` |
| `static/src/focus.ts` (ou subscription) | Hook auto-highlight du jumeau au changement de focus |

## Validation

- [x] Typecheck (`npm run typecheck`) — ✓
- [x] Tests frontend — **808/808 vitest** ✓ (dont 27 dupDetect, 4
      executeReplace, 4 binding R, 10 marqueur/twin-hint, 10 vue P2)
- [x] Tests backend — **190/190 pytest** ✓ (8 nouveaux : /move ×5, trash-scan,
      collision-copy ×2)
- [x] Lint (`npm run lint`) — ✓ · Build — ✓
- [x] **Règle d'or** : le test `does NOT move to trash when copy fails`
      garantit copy-KO ⇒ pas de move ; `test_move_never_overwrites_existing`
      et `test_copy_collision_suffix_preserves_existing` garantissent zéro
      écrasement (l'ancien contenu est relu dans le test)
- [x] **Vérification navigateur de l'action Remplacer** : validée par
      l'utilisateur sur sa collection réelle (2026-09-16 — « ça fonctionne
      plutôt pas mal ») : `R` sur une vraie paire, ancien fichier vérifié
      dans `_trash/<date>/`

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `c3959ed` | feat(dup): P0 — module dupDetect (matching durée±2s + nom fuzzy, verdict qualité) branché dans le state |
| `f383485` | feat(dup): P1bis — marqueur ambre (4e état LED) + twin-hint sur le jumeau rangé |
| `26e73ab` | fix(dup): correctifs smoke test — initApp peuple dupMatches au reload, twin-hint fallback dossier replié, intensités distinctes |
| `d70a0d9` | feat(dup): P1bis action — POST /move vers _trash + executeReplace (copy-puis-move, touche R/double-clic, collisions jamais écrasées) |
| `731cc24` | feat(dup): P2 — vue dédiée « ↔ Doublons » (table des paires, verdicts qualité, ↑↓/R/Échap) |

## Décisions

- **La durée d'abord, le nom ensuite** : la durée est quasi unique par
  morceau et déjà indexée — le bucketing ±2 s réduit la comparaison de
  noms à quelques candidats (réflexe EPIC-015 : métadonnée discriminante
  d'abord, fuzzy ensuite).
- **Détection client-side** : les métadonnées nécessaires sont déjà dans
  le cache des deux colonnes ; ajouter un endpoint serait du sur-plombage
  (règle KISS W6).
- **Trash = sous-dossier de la source** (décision utilisateur) : reste
  dans le périmètre de sécurité existant, visible dans l'arbre —
  contrepartie : l'exclure du scan.
- **Un par un** (décision utilisateur) : les faux positifs (reprises
  réelles, même durée) exigent une revue humaine des deux noms affichés ;
  le batch attendra que le taux de confiance soit prouvé en usage.

## Notes / Risques

- Radio edit vs album : durées différentes → non matchés (comportement
  voulu : ce sont des fichiers distincts).
- Versions live/remaster (Δ > 2 s) : hors périmètre strict — si besoin
  plus tard, une passe « suggestions » séparée pourra être ajoutée sans
  toucher au verdict strict.
- Le déplacement cross-device (source et trash sur le même volume par
  construction) évite le piège EXDEV — `shutil.move` gère le cas natif
  de toute façon.
- Collision de noms : **tranché à l'implémentation** — suffixe incrémental
  `-2/-3…` porté par le NOUVEAU fichier (jamais d'écrasement), et non
  `from_<dossier>`.
- **As-built 2026-09-16** :
  - Après un remplacement, la paire reste référencée dans `dupMatches`
    (le nouveau fichier rangé matche l'épars original, noms normalisés
    identiques) — inoffensif : verdict `equal`, la revue reste manuelle,
    le scan consolide l'état réel.
  - jsdom n'a pas `CSS.escape` → `domPatches` est mocké dans les tests
    `executeReplace` (limitation d'environnement de test, pas un bug produit).
  - Le statut `moved-to-trash` du journal est calculé sur
    `os.path.realpath(destination)` — robuste même si le frontend passe
    directement le dossier trash comme `dest_dir`.
