# EPIC-035 — Rangement par style : palette `g`, destination `style_tranche` calculée, suggestions locales, écriture TCON

> **Statut** : 🟡 **P1+P2 livrés (2026-09-19)** — socle clavier (palette `g`, colonne Style, aperçu `e`, filtre par sous-dossier) testé en live headless sur données réelles ; suggestions locales P2 (genre ID3, voisinage artiste, segments de chemin, session) ; P3 (TCON) / P4 en backlog
> **Créée** : 2026-09-19 · **Dernière mise à jour** : 2026-09-19
> **Priorité** : Haute (goulot du workflow de rangement : 5 092 épars pour 1 430 rangés)
> **Docs liées** : spec `specs/2026-09-19-rangement-par-style-design.md` · **plan P1** `plans/2026-09-19-rangement-par-style.md` · EPIC-030 (chips) · EPIC-031 (registry/matrice clavier) · EPIC-033 (pattern preview → apply, journal, undo) · EPIC-034 (pastille « déjà rangé », reveal post-copie)

## Objectif

_Ranger les fichiers de la colonne gauche dans les dossiers `<style>_<tranche>` de la
colonne droite **en une touche par fichier** : l'utilisateur pose un **style** (clavier,
suggestions locales), la **tranche de 5 ans** se déduit de l'année déjà taggée, la
destination est calculée, la copie passe par le F5 batch existant après aperçu, et le
style est écrit dans `TCON` (journalisé, annulable) pour devenir une mémoire durable._

## Contexte & découvertes

- **Mesure du cache (2026-09-19, vérifiée par script)** : droite = 86 dossiers à plat,
  grammaire stricte `style_tranche` (regex 86/86 ; 9 tranches, toutes multiples de 5) →
  **25 styles** (18 datés + 7 hors temps), hiérarchiques (`techno` → `techno_acid` →
  `techno_acid_hard`) ; 28 dossiers ≤ 3 fichiers. Gauche = 5 092 fichiers, 1 679 avec
  année (33 %) ; **1 848** portent un style au 1ᵉʳ segment (`_techno` 1 347, `_hardcore`
  163, `_trance` 139, `_schranz` 77, `_electro` 42, `_breakbeat` 29, `breakbeat` 28, `_goa`
  23), 2 150 quelque part dans le chemin (1 296 imbriqués : `techno clashy`, `techno
  groove`…) ; `_oldies` 183 = indice de tranche ; **2 419** sous des dates d'acquisition
  (`2008_08`…) = borne haute d'année gratuite ; 764 sans signal.
- **Genre ID3 inutilisable comme vérité** (398 échantillons lisibles : `Blues` ×65,
  `Other` ×24, URLs) mais indice faible après alias (`Techno` 116, `Trance` 26,
  `Hardcore` 17). `get_audio_meta` ne lit aucun genre aujourd'hui.
- **Reformulation** : le choix n'est pas 1 dossier / 86 mais 1 style / 25 ; le dossier
  est une fonction `dest(style, année)`. D'où : palette clavier, pas de `<select>` par
  ligne (souris-first, 5 000 selects, casse la grammaire EPIC-031).
- **Constats de code** : `FilterSubject` = name/year/codec → le sous-dossier épars n'est
  **pas filtrable** (prérequis du lot) ; pas de Ctrl+A (multi-sélection = Espace +
  Ctrl/Shift-clic) ; `/copy` crée déjà le dossier cible (`os.makedirs`) ; `g` et `e`
  libres en page sync ; `isContextMenuOpen` = modèle du contexte de chord.
- Idées du brainstorm évaluées dans la spec (menu déroulant → palette ; D&D conservé
  tel quel ; filtre/player/undo = infra déjà présente ; ajout du **moteur de suggestion**
  qui manquait).

## Tâches

### P1 — Socle (rangement clavier, sans ID3) ✅ livré 2026-09-19
- [x] `static/src/styles.ts` (pur) : `parseFolderName`, `buildTaxonomy`, `trancheOf`,
      `destFor`, `yearOf`, `findEparsEntry`, `deriveHotkeys` — 24 tests sur la fixture des
      **86 dossiers réels** (25 styles, 7 hors temps dérivés, 9 tranches)
- [x] `FilterSubject.path` (optionnel) sur le sujet épars → filtre par sous-dossier
      (`F7 _schranz`) ; tests EPIC-030/034 existants inchangés et verts
- [x] `state.styleChoices: Map<fullpath, {style, tranche}>` (session, réaffectation)
- [x] Colonne `Style` : `render/styleCell.ts` insère la cellule devant `.codec`
      (**`makeFileEl` intact**), `makeFileTable(false, true)` = 7 col + `.has-style` ;
      états choisi / pending-year / — (« suggéré » = P2, « écrit » = P3) ; mesure live
      1280 px : colonne nom **40,4 %** (seuil du plan atteint, pas dépassé)
- [x] Palette `g` (`render/stylePalette.ts`) : couche DOM focusée, chord lettre →
      chiffre tranche (cibles sans année seulement) → commit, `Enter` = style seul,
      `Échap`, `⌫` retire, lot, focus ligne suivante ; **`registry.ts` non modifié**
- [x] `commands/style.ts` : `g` (sync/épars) + `e` (sync), importé **en dernier** dans
      `script.ts` ; matrice EPIC-031 : **16 cellules nouvelles**, 0 renumérotée ; légende
      générée (bijection verte)
- [x] `actions.ts` : `copyFilesTo(destDir, files) → string[]` extrait du batch F5
      (iso-comportement, 6 tests `executeCopy` inchangés)
- [x] Aperçu `e` (`render/stylePreview.ts`) : plan pur groupé par dossier cible, exclus
      listés (sans année / jumeau déjà dans la cible / style inconnu), `confirmDialog`
      multi-ligne, copies séquentielles, choix copiés retirés exactement ; récap
      `🏷 N assignés · e = aperçu` dans `#epars-status-line` (zéro souscription ajoutée)
- [x] `data/styles.json` : **reporté en P4** (YAGNI — hotkeys dérivées suffisent au socle)

### P2 — Suggestions locales ✅ livré 2026-09-19 (`09705b3`)
- [x] `get_audio_meta` → 4-tuple `(year, duration, codec, genre)` : lecture additive
      `TCON` (MP3), `GENRE` (FLAC/Vorbis, essaie aussi `STYLE`), `©gen` (M4A) →
      `_scan_file` + cache + `/copy` `_resp` + `_move_cache_update` ; **3 pytest**
      (genre MP3 mocké, genre absent, `_build_source_index`)
- [x] `_build_source_index(source_files)` (app.py) : index
      `{artiste_normalisé: [styles triés]}` dérivé des dossiers source au scan via
      `_artist_title()` (le style = nom du dossier sans tranche) ; servi par `/scan`
      et `/load` (`source_index`)
- [x] `state.sourceIndex: Record<string, string[]>` + `genre?: string | null` dans
      `SourceFileEntry` (optionnel — les fixtures de tests existantes ne bougent pas) ;
      chargé dans `initApp` et `runScan`
- [x] `FilterSubject.genre?` (optionnel) → le chip épars matche aussi le tag genre
- [x] `static/src/styleSuggest.ts` (pur, **19 tests**) : **tous les segments** du chemin
      épars aliasés (`pathSegments` — du plus profond au plus superficiel, `_` leading
      retiré ; le plus profond aliasable gagne), voisinage artiste (lookup
      `sourceIndex[artiste]`, fréquence normalisée), choix de session du même
      sous-dossier épars, genre ID3 aliasé ; cumul pondéré par style,
      **ex æquo → null**, seuil de confiance 0,25. `parseArtistTitle` (portage TS
      **simplifié** de `_artist_title` : pattern `[artiste] titre` + split tiret)
- [x] Poids as-built : **chemin 0,50 · artiste 0,40 · session 0,20 · genre 0,15**
      (somme 1,25 ; confiance = score/1,25). Alias embarqués dans le module (21 genres,
      17 segments : `schranz→techno_hard`, `acid/acid techno→techno_acid`,
      `goa→trance`, `drum & bass→drumbass`, `disco/italo disco→italo_disco`…) ;
      un alias vers un style absent de la taxonomie est ignoré (test)
- [x] Chip « suggéré » (`style-chip.suggested`, pointillé, opacité 0,55) quand aucun
      choix utilisateur — tooltip « Suggéré (N %) — g pour valider » ; cellule vide si
      aucun signal (comportement P1 préservé)
- [x] Palette : hint « → techno (50 %) — Enter = accepter · Lettre = style · Échap · ⌫ »
      sur cible unique avec suggestion ; **`Enter` accepte la suggestion** (passe par
      `pick` → étape tranche si nécessaire) ; la hotkey d'un autre style prime toujours
      ; lot → pas de suggestion (hint standard)

### P3 — Écriture TCON (pattern EPIC-033 P2 : export → script)
- [ ] `POST /styles/review` → `data/style_review.json` (pattern `/years/review`, 400 hors
      taxonomie) ; export depuis l'aperçu
- [ ] `scripts/apply_styles.py` : dry-run défaut, `--review`, journal
      `data/style_apply_journal.jsonl` avec `old_genre`, `--undo` (restaure / retire la
      frame), formats MP3 v2.3/v2.4 · FLAC · WAV · M4A, double check, idempotent `skip` ;
      tag l'épars **et** la copie rangée
- [ ] État « écrit ✓ » = genre lu au scan == style
- [ ] Tests pytest sur fichiers audio minimaux réels (pattern `test_apply_years.py`) :
      écriture, undo restaure l'ancienne valeur, idempotence, hors zone refusé

### P4 — Confort (non engagé)
- [ ] Reprise `style_review.json` au chargement ; `Backspace` retire un choix
- [ ] Onglet Config « Styles » (édition hotkeys/alias) ; `PUT /styles`
- [ ] Dossier cible pré-surligné à droite pendant la palette (pattern twin-hint)
- [ ] BPM NML comme signal, seulement si l'usage des 4 signaux locaux le justifie ;
      `POST /styles/apply` live, seulement si l'aller-retour script pèse

## Fichiers impactés (prévus)

| Fichier | Rôle |
|---|---|
| `static/src/styles.ts` (+test) | **Nouveau** — taxonomie pure : parse des dossiers, tranche, destination |
| `static/src/styleSuggest.ts` (+test) | **Nouveau** — moteur de suggestion (P2) |
| `static/src/commands/style.ts` | **Nouveau** — bindings `g` (palette) et `e` (aperçu) page sync |
| `static/src/render/stylePalette.ts` (+test) | **Nouveau** — popover chord, lot, récap, aperçu |
| `static/src/render/fileRow.ts` | Colonne `Style` (colgroup EPIC-026) |
| `static/src/render/eparsUI.ts` | Barre récap dans le slot chip ; filtre étendu |
| `static/src/state.ts` | `styleChoices`, `genre` dans `FileIndex` |
| `static/src/actions.ts` | Apply groupé par dossier via `executeCopy` + `mkdir` |
| `static/src/render/styleCell.ts`, `render/stylePreview.ts` | **Nouveaux** — cellule Style insérée (makeFileEl intact), plan groupé par dossier + aperçu |
| `static/src/commands/keyboardMatrix.test.ts` | Cellules nouvelles `g`/`e` |
| `static/src/filterEngine.ts` | `FilterSubject.path` optionnel |
| `app.py` | `get_audio_meta` + `genre` (P2) ; `GET /styles` ou champ dans `/load` (P1) ; `POST /styles/review` (P3) |
| `scripts/apply_styles.py` (+`test_apply_styles.py`) | **Nouveau** (P3) — seul écrivain TCON, journal `old_genre`, undo |
| `data/styles.json`, `data/style_review.json`, `data/style_apply_journal.jsonl` | **Nouveaux** (git-ignorés, `data/` déjà dans `.gitignore`) |
| `static/style.css` | Chips de style (3 états), palette, barre récap |
| `README.md`, `AGENT.md` | Section « Rangement par style » |

## Validation (P1, 2026-09-19)

- [x] Typecheck (`npm run typecheck`) — 0 erreur
- [x] Tests frontend (`npm test`) — **1 066 vitest / 45 fichiers** (979 → +87)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **298**, backend intact
      (le « 237 » des docs précédentes était périmé)
- [x] Lint (`npm run lint`) — 0 erreur, 0 warning
- [x] Build (`npm run build`) — OK
- [x] **Live headless Chrome (CDP brut, touches réelles `Input.dispatchKeyEvent`),
      profil « travail », `fetch('/copy')` mocké dans la page (zéro écriture disque)** :
  1. 5 092 lignes rendues ; F7 `_schranz` → **79** lignes (77 au 1ᵉʳ segment + 2 dont le
     nom contient « schranz »), compteur `79/5 092` ; sélection ×3 ; `g` → palette focusée,
     « 3 fichiers », 25 styles avec hotkeys ; `c` (techno_hard) → étape tranche (2 sans
     année) → `3` → chips `→ techno_hard_1995` ×2 et `→ ➕ techno_hard_2005 (sera créé)`
     (fichier daté 2009) ; récap `🏷 3 assignés`.
  2. `e` → dialog `→ techno_hard_1995 — 2 fichiers / → ➕ techno_hard_2005 — 1 fichier (sera
     créé)`, bouton `Appliquer 3 copies` ; confirmation → **3 `POST /copy`** avec
     `dest_dir = /home/giak/Music/select/style//techno_hard_…` (convention double slash de
     l'app), chips retirées, récap effacé, toast `✓ 3/3 copiés · 2 dossiers`, dossier
     `techno_hard_1995` révélé (EPIC-034).
  3. Palette ouverte : ArrowDown / Espace / F5 réels → palette toujours ouverte, focus
     applicatif inchangé, aucune modale, aucune sélection ; Échap ferme la palette seule.
     **Bug réel trouvé par ce scénario** : F5 non annulé rechargeait la page (le registry
     `preventDefault` toujours F5, la palette ne le faisait pas) → corrigé `cd12601`, test
     dédié. L'agent navigateur automatique avait échoué (erreurs d'outil) : le live a été
     refait en CDP brut, script `/tmp/ast-live/live.mjs` (session).
- [x] **P2 (2026-09-19, gate complet)** : typecheck 0 · **1 091 vitest / 46 fichiers**
      (1 066 → +25 : 19 styleSuggest, 3 state, 2 palette, 1 styleCell reprise) ·
      lint 0 · build OK · **pytest 302** (298 → +4 : 2 genre, 2 source_index, 1 fix
      `/load` vide). Live P2 non fait (suggestions visibles au prochain usage réel —
      calibration des poids = critère de réussite, pas les tests unitaires)
- [ ] P3 : à venir

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `c6fcfdf` | feat(styles): taxonomie pure dérivée des dossiers style_tranche (parse, tranche, destination, hotkeys) |
| `d79c168` | feat(filter): le chip épars matche aussi le sous-dossier (FilterSubject.path optionnel) |
| `fcee68e` | feat(state): styleChoices — choix de style de session par fichier épars |
| `c2d6bce` | feat(ui): colonne Style dans le tableau épars (cellule insérée, colgroup 7, makeFileEl intact) |
| `f56b96a` | feat(ui): palette g — choix de style au clavier (chord lettre → tranche), couche DOM pattern ratingEdit |
| `e707ae0` | feat(keys): g — palette de style sur la sélection/ligne épars (page sync) — matrice + légende générée |
| `f19f24d` | refactor(actions): copyFilesTo extrait du batch F5 (iso-comportement) |
| `b0df0ea` | feat(ui): aperçu e — plan de rangement groupé par dossier cible, copies enchaînées, récap 🏷 |
| `890cfab` | fix(styles): destination jointe en `racine/nom` (convention sourceTree/dupDetect/copyFilesTo) + refresh en une passe, pending-year depuis la destination, accords |
| `cd12601` | fix(palette): preventDefault systématique palette ouverte — F5 non annulé rechargeait la page |
| `09705b3` | feat(P2): suggestions locales — genre ID3, voisinage artiste, segments de chemin, session history |

## Décisions

- **D1 — Palette clavier `g` + colonne Style, pas de `<select>` par ligne** (choix
  utilisateur 2026-09-19) : 1 binding global libre dans la matrice, chord interne → zéro
  collision ; flux 1 touche/fichier, lot via sélection existante.
- **D2 — `TCON` remplacé, ancienne valeur journalisée, `--undo`** (choix utilisateur) :
  écraser `Blues`/`Other` est le but ; le journal est la compensation ; visible dans
  Traktor. Valeur = id de style (`techno_acid`), clé de correspondance avec les dossiers.
  **Voie d'écriture = export → script** (pattern EPIC-033 P2 éprouvé), pas de route
  d'écriture ID3 depuis le navigateur (KISS, surface backend minimale).
- **D3 — Taxonomie dérivée de la colonne droite** : jamais de liste manuelle ; alias
  (`styles.json`) pour les synonymes épars/ID3 et le déchet (`null`).
- **D4 — Suggestion ≠ décision** : ex æquo → aucune suggestion ; aucune copie ni
  écriture sans aperçu → confirmation (pattern EPIC-028/032/033).
- **D5 — Pas de ML audio** : taxonomie personnelle, signaux locaux suffisants ; « le
  dossier n'est pas une vérité terrain » (EPIC-033).
- **D6 — Tranche calculée depuis l'année du tag**, surcharge explicite possible dans la
  palette (compilations/rééditions) ; jamais depuis le nom du dossier.

## Constats de session (2026-09-19, P1)

- **Revue de code utile** : elle a détecté que ma jointure de chemin (slash simple) ne
  suivait pas la convention de l'app (`${root}/${name}` avec la racine telle que
  configurée → `style//dossier`) ; sur la config réelle, la copie aurait réussi côté
  serveur **sans** patch d'index, sans reveal et sans exclusion des jumeaux. Corrigé et
  figé par test avant le live.
- **Le live a trouvé un bug que jsdom ne pouvait pas voir** (rechargement sur F5) : les
  tests unitaires écoutaient `document` en bubble, pas le défaut navigateur.
- **Flakiness préexistante** : `sourceTree.test.ts` échoue en `--sequence.shuffle`
  (3/5/2 tests selon la graine) **avec et sans** les changements EPIC-035 (vérifié en
  restaurant HEAD~2) — hors périmètre, à ouvrir en dette (le gate `npm test` ne shuffle pas).
- Hotkeys dérivées : lisibles pour les gros volumes (`t a h r`), arbitraires en queue
  (`u drumbass`, `b trance_acid`) — affichées dans la palette ; surcharge = P4.
- Limites P1 assumées : tranche non forçable sur un fichier déjà daté ; `copyFilesTo`
  recharge le journal une fois par dossier cible ; statut « traité » des lignes copiées
  dépend du journal serveur (non visible avec `/copy` mocké).

## Constats de session (2026-09-19, P2)

- **Écarts spec → as-built** (documentés dans la spec, annexe « As-built P2 ») : poids
  recalés (0,40/0,20/0,15 vs 0,45/0,25/0,20 — somme 1,25, confiance normalisée dessus) ;
  **borne d'acquisition** (`YYYY_MM` → tranche ≤ `trancheOf(YYYY)`) et `_oldies` → 1990
  **non implémentés** : `suggestStyle` ne propose pas de tranche, seulement un style —
  l'étape tranche de la palette reste le chemin normand ; évidences détaillées (lignes
  « dossier `_techno` → … », « Adam Beyer 4× techno ») remplacées par le seul pourcentage
  de confiance (KISS, le tooltip reste court) ; voisinage « même racine précise le
  sous-style » émerge du cumul des scores plutôt que d'une règle explicite.
- **Mémoïsation non faite** (prévue « par fullpath » dans la spec) : le calcul tourne au
  paint de chaque cellule et à l'ouverture de palette. Risque mesuré : le scan de session
  itère sur `styleChoices` par cellule — un lot de 1 347 choix sur 5 092 lignes = ~7 M
  lectures au prochain re-render complet. Acceptable si l'usage le confirme ; sinon
  mémoïser sur l'identité `styleChoices` (même pattern que `currentTaxonomy`).
- **`parseArtistTitle` simplifié** vs Python : pas de gestion du noise `remix/vol/...`
  identique, pas des cas `_YEARS_NOISE` complets. Suffisant pour le lookup artiste
  (les noms exotiques ratent le lookup → pas de signal, jamais une mauvaise suggestion).
- Fixtures de tests : `genre` **optionnel** dans `SourceFileEntry` → aucune des ~84
  occurrences de fixtures `path/year/duration/codec` dans les tests n'a dû être touchée
  (choix délibéré contre un champ requis qui aurait généré un diff de 84 lignes sans valeur).

## Notes / Risques

- Le voisinage artiste utilise le portage TS **simplifié** de `artist_title()`
  (`parseArtistTitle` dans `styleSuggest.ts`) ; homonymes → ex æquo → pas de suggestion
  (testé). Calibration des poids sur échantillon réel = suite logique (P2-4 du plan).
- Le BPM n'est pas dans le cache du scan : signal **non engagé** (P4 conditionnel).
- **Régressions à anticiper** : colonne supplémentaire dans un `colgroup` fixe (EPIC-026,
  tests comptant les colonnes) ; extension de `FilterSubject` partagé avec l'arbre source
  et la pastille EPIC-034 (champ optionnel, sémantique inchangée) ; la palette isole le
  clavier par `stopPropagation` (test dédié), le registry n'est pas touché.
- 5 092 lignes : moteur mémoïsé et paresseux (lignes visibles seulement), index artiste
  reconstruit sur `sourceFiles:changed` uniquement.
- `.wma`/`.ogg` hors périmètre d'écriture TCON (comme EPIC-033) : copiés, listés au récap.
- Persistance des choix de session perdue au reload jusqu'à P4 (`style_review.json`) —
  même politique que la revue Années avant sa P2.
