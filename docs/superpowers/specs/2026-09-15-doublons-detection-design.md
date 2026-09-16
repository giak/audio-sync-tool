# Design — Doublons épars ↔ source : détection + remplacement qualité

> **Date** : 2026-09-15 · **Statut** : implémenté (P0 + P1bis + action Remplacer, 2026-09-16) — P2 en backlog
> **EPIC liée** : EPIC-028 (🟡 en cours)
> **As-built** : voir « Carnet de mise en œuvre » en fin de document

## Problème

La colonne gauche (Éparpillé) contient des fichiers déjà rangés à droite
(Source Data, arborescence par dossiers) — mais sous des noms qui varient :
`(Radio Edit)`, `[HQ]`, `(Remastered 2011)`, `feat./ft.`, ordre
`Artiste - Titre` vs `Titre - Artiste`, séparateurs `_`/`.`/`-` mélangés.
L'utilisateur veut **détecter ces doublons**, et quand la copie épars est de
**meilleure qualité** que la copie rangée (FLAC vs MP3), **remplacer** la
version rangée. Remplacer = copier le FLAC à droite + déplacer l'ancien MP3
vers un dossier trash **dans la colonne de droite**. **Il est interdit
d'effacer physiquement un fichier** — on déplace, toujours (règle
DATA-SAFETY d'AGENT.md, non négociable).

## Décisions validées (2026-09-15)

1. **Matching strict ±2 s** : une seule passe, `similarité nom ≥ 0,88` ET
   `|Δdurée| ≤ 2 s`. Pas de passe « probables » relâchée.
2. **Trash dans la colonne de droite** : sous-dossier de la racine Source
   Data (ex. `<source>/_trash/2026-09-15/`) → il est visible dans l'arbre,
   reste dans `is_path_allowed()`, aucune extension de périmètre nécessaire.
   Il faut **élaguer `_trash` du `os.walk`** du scan (sinon il se re-scanne).
3. **Remplacement un par un** : chaque paire est remplacée individuellement
   après revue (touche `R` ou clic), avec confirmDialog. Pas d'action batch,
   pas d'automatisme au scan.

## Architecture proposée

### Détection — module TS pur `static/src/dupDetect.ts`

Tout côté client, zéro changement backend pour la détection : le scan
(`_scan_file`/`get_audio_meta`) indexe **déjà** `duration` (±1 s, mutagen)
et `codec` (avec bitrate : `MP3 320kbps`, `FLAC`, `WAV`…) sur les **deux**
colonnes.

```
for file gauche:
  candidats = index_droite[round(duration)] ± 2 clés  ← bucketing O(n)
              (±2 car round() côté droit : Δ=2,0 s exact peut tomber sur 2 clés)
  pour chaque candidat:
    sim = similarité(normalize(basename_g), normalize(basename_d))
    si sim ≥ 0,88 → paire confirmée
verdict = compareQuality(gauche, droite)  → 'left-better' | 'equal' | 'right-better'
```

**Normalisation du nom** : minuscules, accents strips, extension retirée,
suppression du bruit (`(radio edit)`, `[hq]`, `(remastered 2011)`, `feat./ft. …`,
préfixe piste `^\d{1,3}[-. ]`), séparateurs → espaces, collapse.
**Similarité** : Levenshtein ratio + variante token-set (gère `Artiste - Titre`
vs `Titre - Artiste`).
**Score qualité** : lossless (FLAC/WAV/AIFF/ALAC) = 100 ; ≥ 256 kbps = 80 ;
128–255 = 60 ; < 128 = 40. Tie-breakers : durée plus longue, puis taille
fichier (ajouter `size` au scan, convention Ko EPIC-015 — optionnel).

### Action « Remplacer » — endpoint `POST /move`

- Symétrique de `/copy` : `shutil.move(src, dst)`, `is_path_allowed()` source
  **et** destination, collision → suffixe incrémental `-2/-3…` (as-built,
  cf. carnet), journal `status: 'moved-to-trash'` (source → destination).
- Destination : `<source_root>/_trash/YYYY-MM-DD/` (créée à la volée).
- Séquence d'un remplacement : `POST /copy` (gauche → droite) **puis**
  `POST /move` (ancien droit → trash). Si la copie échoue → pas de move,
  erreur affichée. Rien n'est jamais perdu.
- Après action : patch du state local (pattern `domPatches.ts`), re-render,
  journal rechargé.

### UX — mode « Doublons » dédié (P2, façon mode Playlist)

- **P0** : module `dupDetect.ts` + tests — détection pure, réutilisable,
  peut d'abord enrichir le badge « doublon » existant de `computeStatus`
  (qui compare les noms exactement).
- **P1** : badge + action dans la page Sync — les lignes épars matchées
  portent `↔ rangé (MP3 320) — FLAC gagne` ; filtre « doublons » style F7 ;
  touche `R` sur une paire gauche-mieux → confirmDialog → séquence copy+move.
- **P2** : vue dédiée « Doublons » (liste de paires, badges qualité,
  navigation clavier, tri par verdict).

### UX visuelle — « voir le doublon et où il se trouve » (validée 2026-09-15, session 2)

Deux couches retenues (l'utilisateur a écarté le saut au jumeau et la lecture
barre d'état — revisitable en P2 si le besoin émerge) :

1. **Marqueur ambre à gauche** (le « quand »)
   - 4ᵉ état visuel dans le langage LED existant : bleu (nouveau), gris
     (doublon exact), vert (traité), **ambre (homonyme probable)** — le gris
     `td.file.doublon` reste réservé au nom exact, l'ambre signale le fuzzy
   - barre gauche ambre sur la ligne (même mécanique box-shadow inset que la
     barre de focus — pas de décalage de layout)
   - glyphe `↔` dans la ligne ; tooltip = les deux chemins + score
     (`sim 0,93 · Δ0 s`) pour juger un faux positif d'un coup d'œil
   - compteur dans le header gauche : `📂 Éparpillé (1 234) · 12 ↔`
2. **Auto-highlight du jumeau à droite** (le « où »)
   - quand le focus ↑↓ arrive sur une ligne gauche matchée, la ligne droite
     correspondante reçoit `.twin-hint` (contour ambre pulsé doux) +
     `scrollIntoView({ block: 'nearest' })` **sans voler le focus**
   - lookup du jumeau par `data-fullpath` via la Map dupDetect (calculée une
     fois après scan, pas au render) — pas de scan DOM par navigation
   - désactivé si le jumeau n'est pas rendu (filtre F7 actif, modal ouverte)
   - nettoyage de la classe quand le focus quitte la ligne matchée

Les deux couches consomment la sortie P0 de `dupDetect.ts` (Map
`eparsFullPath → {twinPath, verdict, sim, delta}` dans le state) — cette UX
est la couche présentation du P1.

## Pièges & garde-fous

- **Jamais d'effacement physique** : `/move` déplace dans le trash, visible
  dans l'arbre à droite. Test pytest dédié : le fichier existe toujours
  après remplacement (pattern du test DELETE /mkdir index-only, EPIC-027).
- Radio edit vs album version : Δ > 2 s → non matchés (correct : fichiers
  distincts).
- **Le score qualité est une heuristique conteneur/bitrate** : il classe FLAC
  au-dessus de MP3 320 par nature de conteneur, sans décoder l'audio — un MP3
  320 encodé depuis du 128, ou un FLAC de mauvaise provenance, ne sont pas
  détectés. Le tooltip (score + Δdurée) et la revue un par un sont les
  compensations ; un vrai check lossless (décodage) serait un P3 optionnel.
- Reprises réelles (2 interprètes, même titre, même durée) : sim haute +
  durée identique → faux positifs **possibles** → d'où revue un par un avec
  le nom des deux fichiers affiché, jamais d'action auto.
- Collision de noms dans le trash : 2 `song.mp3` de dossiers différents →
  suffixe d'origine (`song (from_Rock).mp3`) ou suffixe incrémental.
- Le trash `_trash/` doit être exclu du `os.walk` du scan ET de
  `renderExtraDirs` (EPIC-027) pour ne pas polluer l'index.

## Validation (cible)

- Tests unitaires `dupDetect.test.ts` : normalisation, bucketing, seuils,
  verdicts qualité, cas limites (radio edit, token-set, accents). → **27/27**
- Tests pytest `/move` : déplacement OK, fichier présent dans le trash,
  403 hors zone, collision, journal. → **190/190** (8 nouveaux)
- Règle d'or : **aucun test ne doit pouvoir passer avec un fichier effacé**.
  → garanti par copy-KO ⇒ pas de move + tests de collision relisant l'ancien
  contenu
- Frontend : **798/798 vitest**, typecheck/lint/build ✓
- UX validée sur données réelles (smoke CDP, 550 lignes ambre) ; l'action
  Remplacer sur une vraie paire reste à valider par l'utilisateur

## Carnet de mise en œuvre (as-built 2026-09-16)

**Commits** : `c3959ed` (P0 détection) · `f383485` (P1bis UX) · `26e73ab`
(correctifs smoke) · `d70a0d9` (action Remplacer : `/move` + `_trash` +
`executeReplace`, 2026-09-16).

**Écarts design → implémentation (et pourquoi)** :

1. **Suffixe de collision** : le design disait « suffixe `-1` » sans préciser
   quel fichier le porte. Implémentation : `-2/-3…` porté par le **NOUVEAU**
   fichier, suffixe calculé **avant** `copy2`/`move` (une suffixation
   post-hoc ne peut pas restaurer un contenu écrasé — première tentative
   rejétée en relisant mon propre code). Même helper `_collision_dst` pour
   `/copy` et `/move` — `/copy` écrasait silencieusement avant (bug
   préexistant découvert à cette occasion).
2. **Taille de fichier (tie-breaker « optionnel »)** : non ajoutée au scan —
   bitrate + durée suffisent à arbitrer ; éviter un re-scan complet pour un
   gain marginal.
3. **`renderExtraDirs` (élagage trash)** : non modifié — les extra dirs de
   l'EPIC-027 n'indexent pas de fichiers, l'élagage du `os.walk` suffit.
4. **Filtre « doublons » style F7** et enrichissement fuzzy de
   `computeStatus` : non faits — restés au P2.

**Bugs réels trouvés en testant** (tous corrigés) : arithmétique du bucketing
(offsets ±1 → ±2), un test au verdict inversé (le module avait raison),
`initApp` ne peuplait pas `dupMatches` au reload (cache `/load`), barres
ambres parasites aux frontières de colonnes (`> td` → `td:first-child`),
arbre source replié rendant le twin-hint muet (→ fallback dossier conteneur),
race de `await executeReplace()` sur le confirmDialog (promesse capturée).

**Comportement à connaître** : après un remplacement, la paire reste dans
`dupMatches` (le nouveau rangé matche l'épars original, noms normalisés
identiques, verdict `equal`) — inoffensif, le scan consolide.
