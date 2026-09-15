# EPIC-028 — Doublons épars ↔ source : détection + remplacement qualité

> **Statut** : ⚪ Backlog
> **Créée** : 2026-09-15 · **Dernière mise à jour** : 2026-09-15
> **Priorité** : Haute (doublons = espace disque + incohérence de bibliothèque)
> **Docs liées** : spec `2026-09-15-doublons-detection-design.md` (brainstorm session)

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

### P0 — Détection (lecture seule)
- [ ] `static/src/dupDetect.ts` : normalisation de noms (accents, bruit,
      séparateurs), Levenshtein ratio + token-set
- [ ] Bucketing par durée (±2 s) — index O(n), pas de comparaison croisée
- [ ] Score qualité par paliers (lossless 100 / ≥256k 80 / 128-255 60 /
      <128 40) + tie-breakers (durée, taille optionnelle)
- [ ] Verdict par paire : `left-better` / `equal` / `right-better`
- [ ] `dupDetect.test.ts` : cas limites (radio edit, token-set, accents,
      reprise homonyme)

### P1 — Action Remplacer (un par un)
- [ ] Endpoint `POST /move` : `shutil.move`, `is_path_allowed()` src+dst,
      collision → suffixe, journal `moved-to-trash`
- [ ] Élaguer `_trash/` du `os.walk` du scan + de `renderExtraDirs`
- [ ] Badge sur les lignes épars matchées (`↔ rangé (MP3 320) — FLAC gagne`)
- [ ] Touche `R` / bouton : confirmDialog → `POST /copy` puis `POST /move`
      (copie KO ⇒ pas de move), patch state + re-render
- [ ] pytest `/move` : déplacement OK, fichier **toujours présent** dans le
      trash, 403 hors zone, collision, journal

### P1bis — UX visuelle « voir le doublon et où il est » (validée 2026-09-15)
- [ ] 4ᵉ état ambre « homonyme » (LED + glyphe `↔`), distinct du gris
      « doublon exact » + barre gauche ambre (box-shadow inset, pattern barre
      de focus)
- [ ] Compteur header gauche : `📂 Éparpillé (N) · X ↔`
- [ ] Auto-highlight `.twin-hint` : la ligne droite jumelle s'illumine
      (pulsé doux) + `scrollIntoView({block:'nearest'})` sans vol de focus,
      quand le focus gauche arrive sur une ligne matchée ; nettoyage au quit
- [ ] Désactivation si jumeau non rendu (filtre F7, modal)
- [ ] Tooltip/barre d'état : deux chemins + score (`sim 0,93 · Δ0 s`)
- [ ] Tests : badge/barre rendus, twin-hint appliqué/retiré, compteur

### P2 — Vue « Doublons »
- [ ] Mode dédié façon playlist : liste de paires, badges qualité, tri par
      verdict, navigation clavier
- [ ] Option : enrichir le badge « doublon » de `computeStatus` avec le
      matching fuzzy (derrière un seuil identique)

## Fichiers impactés (anticipés)

| Fichier | Rôle |
|---|---|
| `static/src/dupDetect.ts` (nouveau) | Détection pure : normalisation, matching, verdict |
| `static/src/dupDetect.test.ts` (nouveau) | Tests détection |
| `app.py` | `POST /move` + exclusion `_trash/` du scan |
| `test_app.py` | Tests `/move` (fichier présent après move !) |
| `static/src/actions.ts` | Action remplacer (séquence copy+move) |
| `static/src/render/eparsUI.ts` | Badge doublon/rangé sur les lignes |
| `static/src/commands/*.ts` | Touche `R` (registry) |
| `static/src/utils.ts` | Éventuel enrichissement `computeStatus` |
| `static/style.css` | 4ᵉ état ambre (LED + barre gauche) + `.twin-hint` |
| `static/src/focus.ts` (ou subscription) | Hook auto-highlight du jumeau au changement de focus |

## Validation

- [ ] Typecheck (`npm run typecheck`)
- [ ] Tests frontend (`npm test`) — verts
- [ ] Tests backend (`./venv/bin/python -m pytest -q`) — verts
- [ ] Lint (`npm run lint`)
- [ ] **Règle d'or** : aucun test ne peut passer avec un fichier effacé —
      le remplacement se vérifie par la présence du fichier dans le trash
- [ ] Vérification navigateur sur la collection réelle

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _(backlog — à compléter)_ | |

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
- Collision de noms dans le trash : suffixe incrémental ou
  `from_<dossier>` (à trancher à l'implémentation).
