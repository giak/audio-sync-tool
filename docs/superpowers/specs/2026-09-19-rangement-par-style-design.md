# Design — Rangement par style : palette clavier `g`, destination calculée, suggestions locales, écriture TCON

> **Date** : 2026-09-19 · **Statut** : design validé (brainstorm session 2026-09-19) — **fact-checké contre le cache et le code le 2026-09-19** (8 corrections, voir « Errata du fact-check » en fin de document) · **P1, P2 et P3 implémentés** (`c6fcfdf` → `e6dfa82`) — écarts as-built dans les annexes « As-built P2 » et « As-built P3 »
> **EPIC liée** : EPIC-035 (🟢 P1+P2+P3 livrés) · **Plan P1** : `plans/2026-09-19-rangement-par-style.md`
> **Socles** : EPIC-030 (filtre chips), EPIC-031 (registry clavier + matrice), EPIC-033 (pattern
> preview → apply, journal additif, `--undo`), EPIC-034 (pastille « déjà rangé », reveal post-copie)

## Problème

La colonne gauche (Éparpillé, **5 092 fichiers**, 33 % avec année) doit être rangée dans la
colonne droite (Source Data, **1 430 fichiers, 86 dossiers à plat**). Le nom du dossier
cible est `<style>_<tranche>` — l'année est (presque) objective et déjà largement taggée
(EPIC-033) ; **le style est subjectif, défini par l'utilisateur**, et le genre ID3 des
fichiers est inutilisable comme vérité (échantillon aléatoire de 398 épars lisibles : `Blues`
×65, `Other` ×24, URLs de sites de téléchargement, `genre`, `Unknown`…, 29 sans genre).

L'idée de départ (« un menu déroulant par ligne pour poser un style ID3 ») a été
transformée après mesure des données réelles.

## Mesures qui reformulent le problème (cache du scan, 2026-09-19)

**Colonne droite — grammaire des 86 dossiers** :

```
^(?P<style>[a-z]+(?:_[a-z]+)*?)(?:_(?P<tranche>\d{4}))?$
```

- **Tranche = palier de 5 ans** : 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025
  (9 valeurs). `tranche = floor(année / 5) × 5`.
- **25 styles exactement** (regex appliquée aux 86 noms : 86/86 matchent, 0 dossier
  imbriqué) : **18 datés** — `techno`, `techno_acid`, `techno_acid_hard`, `techno_hard`,
  `techno_trance`, `techno_house`, `techno_clash`, `techno_beat`, `techno_percu`, `trance`,
  `trance_acid`, `trance_hard`, `hardcore`, `creed`, `drumbass`, `electro`, `breakbeat`,
  `house` — et **7 « hors temps »** sans tranche : `italo_disco`, `beat_disco`,
  `electro_clash`, `new_beat`, `intro`, `techno_disco`, `trance_old`. Aucun style n'est à
  la fois daté et non daté.
- Les styles sont **hiérarchiques** : racine (`techno`, `trance`, …) + modificateurs
  (`acid`, `hard`, `trance`, `house`, `clash`, `beat`, `percu`).
- Volumes très inégaux : `techno_1990` 185, `techno_acid_2020` 167, `techno_1995` 132 …
  **28** dossiers ont ≤ 3 fichiers.

**Colonne gauche — signaux gratuits déjà présents** :

| 1ᵉʳ segment du chemin épars (88 sous-dossiers) | Fichiers | Signal |
|---|---|---|
| `_techno` 1 347 · `_hardcore` 163 · `_trance` 139 · `_schranz` 77 · `_electro` 42 · `_breakbeat` 29 · `breakbeat` 28 · `_goa` 23 | **1 848** | style posé par l'utilisateur (alias : `schranz` → `techno_hard`, `goa` → `trance`) |
| `_oldies` | 183 | tranche ancienne (≤ 1995 probable), pas un style |
| `YYYY_MM[_DD]`, `select_YYYY_MM_DD` (`2008_08` 475, `2008_10` 350, `2020_02_25` 285…) | **2 419** | **date d'acquisition = borne haute d'année** |
| `-to-process` 276, `nicotine-downloads` 141, `_arrange` 119, divers | 764 | aucun |

**Attention, chemins imbriqués** : 1 296 fichiers ont ≥ 2 niveaux de sous-dossiers, et les
segments profonds portent souvent le style le plus précis (`techno clashy` 61, `techno
groove` 52, `techno oldies` 37, `techno trancey` 27, `techno disco house` 23, `acid` 21…).
**2 150 / 5 092** fichiers ont un segment « stylé » quelque part dans leur chemin. Le moteur
doit donc **scanner tous les segments** du chemin relatif (le plus profond gagne), pas
seulement le premier.

Genre ID3 (échantillon 400) : `Techno` 116, `Trance` 26, `Hardcore` 17, `House` 14,
`Acid Techno` 2, `Techno (Peak Time / Driving)` 3 — **indices faibles mais non nuls** une
fois passés par une table d'alias ; `Blues`/`Other`/URLs → ignorés.

**Conséquence** : le choix n'est pas « 1 dossier parmi 86 » mais **« 1 style parmi 25 »**,
la tranche se déduisant de l'année. Le dossier cible est une **fonction**
`dest(style, année)`, pas un choix. Cela rend un flux **clavier à 1 touche par fichier**
possible.

## Décisions validées (2026-09-19)

1. **Forme UI** : palette clavier **`g`** (genre) ancrée à la ligne focusée + **colonne
   `Style`** dans le tableau épars — inline dans la page Sync, pas de page dédiée, pas de
   `<select>` par ligne (souris-first, 5 000 selects, casse la grammaire EPIC-031).
2. **Écriture ID3** : **`TCON` remplacé** (l'ancienne valeur est journalisée → `--undo`
   restaure). Contrairement aux années (additif), écraser est ici **le but** ; le journal
   est la compensation. Bonus : Traktor affiche le style dans sa colonne Genre.
   **Voie d'écriture = pattern EPIC-033 P2 tel quel** (choix de session → export →
   `scripts/apply_styles.py --review`) : zéro route d'écriture nouvelle côté Flask en P3
   (KISS ; une route live `POST /styles/apply` n'est envisagée que si l'aller-retour
   script se révèle trop lourd à l'usage).
3. **Taxonomie dérivée des dossiers** : la source de vérité des styles est la colonne
   droite (parsée au scan) ; jamais de liste à maintenir à la main. Une table d'**alias**
   (`data/styles.json`) complète : hotkeys, synonymes épars/ID3, styles hors temps.
4. **Suggestions, jamais d'automatisme** : le moteur propose (chip + confiance +
   évidences), l'humain tranche. Aucune copie, aucune écriture sans preview →
  confirmation (pattern EPIC-028/032/033).
5. **Pas de classification audio automatique (ML)** : taxonomie personnelle (`creed`,
   `techno_clash`) ; les signaux locaux la couvrent mieux qu'un modèle générique ; et « le
   dossier n'est pas une vérité terrain » (EPIC-033 : 21 % d'écarts années/dossier).

## Modèle

### Taxonomie (`static/src/styles.ts`, module pur + tests)

```ts
interface StyleDef {
  id: string;          // 'techno_acid'
  root: string;        // 'techno'
  modifiers: string[]; // ['acid']
  timeless: boolean;   // true pour italo_disco, intro… (aucun dossier daté n'existe)
  hotkey?: string;     // 'a' — depuis data/styles.json, sinon dérivé (1ʳᵉ lettre libre)
  folders: Set<string>; // dossiers existants : {'techno_acid_1990', …}
}
parseFolderName(name) → { style, tranche | null } | null   // regex ci-dessus
buildTaxonomy(sourceTree, aliases) → Map<id, StyleDef>
trancheOf(year: number) → year - (year % 5)
destFor(style: StyleDef, year: number | null) →
  { dir: string; exists: boolean; needsYear: boolean }
```

- `needsYear = !style.timeless && year === null` → la palette enchaîne sur le choix de
  tranche (chiffres 1‑9 = 1985…2025).
- `exists = false` → destination proposée avec badge `➕ à créer`. **Aucun appel
  `/mkdir` nécessaire** : `POST /copy` fait déjà `os.makedirs(dst_dir, exist_ok=True)` et
  met à jour le cache source pour un sous-dossier nouveau (vérifié app.py) ; le badge est
  purement informatif dans l'aperçu.
- Les 86 noms actuels matchent tous la regex ; `_trash` est élagué du `os.walk` du scan
  (`TRASH_DIRNAME`, app.py) donc jamais vu. Un futur dossier hors grammaire est ignoré de
  la taxonomie (pas d'erreur, pas de style implicite).

### `data/styles.json` (git-ignoré, éditable via ⚙️ Config → onglet « Styles »)

```json
{
  "hotkeys": { "techno": "t", "techno_acid": "a", "techno_hard": "h", "hardcore": "c",
               "trance": "r", "drumbass": "d", "house": "o", "electro": "e", … },
  "aliases": {
    "schranz": "techno_hard", "acid techno": "techno_acid", "acid": "techno_acid",
    "techno (peak time / driving)": "techno", "techno (peak time / driving / hard)": "techno_hard",
    "industrial hardcore": "hardcore", "drum & bass": "drumbass", "psychedelic": "trance",
    "blues": null, "other": null, "unknown": null, "electronic": null
  },
  "timeless": ["italo_disco", "beat_disco", "electro_clash", "new_beat", "intro", "techno_disco", "trance_old"]
}
```

- `aliases` : clé normalisée (minuscules, accents strips, `_`/`-` de tête retirés) → id
  de style ou `null` (= déchet, ignoré). Appliquée à **chaque segment** du chemin épars
  (`_schranz` → `schranz`, `techno clashy` → `techno_clash`) et aux **genres ID3**.
- `timeless` est **dérivable des dossiers** (style sans aucun dossier daté) : la clé ne
  sert qu'à forcer le statut si un tel dossier venait à être daté un jour. YAGNI en P1 :
  dérivation seule, clé absente.
- Hotkeys manquantes → dérivées à l'ouverture de la palette (1ʳᵉ lettre du style non
  encore prise, sinon chiffre) et affichées ; l'utilisateur les fige dans le JSON s'il
  veut de la stabilité. **Pas d'UI d'édition en P1** (fichier édité à la main, rechargé
  au `/load`) — un onglet Config est un confort P4.
- Le fichier est optionnel : sans lui, taxonomie = dossiers + hotkeys dérivées + table
  d'alias par défaut embarquée (déchets ID3 connus).

### Genre ID3 au scan (backend, additif)

`get_audio_meta` (app.py) retourne aujourd'hui `(year, duration, codec)`. Ajouter
**`genre`** (`TCON` / Vorbis `GENRE` / M4A `©gen`) en lecture — même pattern que la
lecture additive de `©day` (EPIC-033). Champ `genre: string | null` dans le cache et
dans `FileIndex` (state.ts). Le cache existant reste valide (champ optionnel) ; la valeur
apparaît au prochain scan.

## Moteur de suggestion (`static/src/styleSuggest.ts`, module pur + tests)

Entrée : un fichier épars (chemin complet, nom, année, genre ID3, durée) + contexte
(taxonomie, index droit, journal, choix de session). Sortie :

```ts
interface StyleSuggestion {
  style: string | null;           // id, ou null si aucun signal
  tranche: number | null;         // proposée si année absente
  confidence: number;             // 0-1, somme pondérée bornée
  evidence: string[];             // lignes lisibles du tooltip
}
```

| Signal | Poids spec | Poids as-built | Détail | Évidence affichée |
|---|---|---|---|---|
| Segment de chemin épars aliasé (`_techno`, `_schranz`, `techno clashy`) | 0,50 | **0,50** | **tous** les segments du chemin relatif, le plus profond aliasable gagne | (as-built : % seul) « dossier `_techno/techno clashy` → techno_clash » |
| **Voisinage artiste** : même artiste déjà rangé à droite | 0,45 | **0,40** | index `sourceIndex` construit **au scan** (`_build_source_index`, app.py) + `parseArtistTitle` (portage TS simplifié) ; fréquence normalisée | « Adam Beyer : 4× techno_1995 · 1× techno_hard_2000 » |
| Choix de session sur le **même dossier épars** | 0,25 | **0,20** | les choix de session du même sous-dossier épars | « 12 derniers de `2008_08` → techno_acid » |
| Genre ID3 aliasé | 0,20 | **0,15** | via alias embarqués ; non listé = ignoré | « ID3 `Acid Techno` » |
| BPM Traktor (`nml.py` lit `TEMPO BPM`) — **non engagé** | 0,15 | — | ≥ 160 → hardcore/drumbass ; 118–126 → house ; 128–145 → techno/trance (ne départage pas ces deux‑là) ; le BPM n'est pas dans le cache du scan | « 168 BPM (NML) » |

Règles :
- Les poids **s'additionnent par style** ; le style le mieux noté gagne ; `confidence`
  bornée à 1 (as-built : = score / somme des poids 1,25 ; **seuil 0,25**). Deux styles
  ex æquo → **pas de suggestion de style** : jamais de choix silencieux (règle D4
  EPIC-033).
- Si le sous-dossier ne donne qu'une **racine** (`_techno`) et que le voisinage précise
  un sous-style (`techno_acid`), le sous-style gagne s'il est compatible (même racine).
- **Tranche** quand l'année manque : `min(borne_acquisition, tranche du voisinage)` si
  disponible ; `_oldies` → 1990 ; sinon `null` → la palette demande.
  Borne d'acquisition : sous-dossier `YYYY_MM[_DD]` → tranche ≤ `trancheOf(YYYY)`.
- Le moteur tourne **à la demande** (ouverture de la palette / rendu de la colonne
  Style), résultat mémoïsé par `fullpath` + version du state (pas au scan, pas par
  navigation — même discipline que `dupMatches`).
- BPM : **hors périmètre tant que les 4 signaux locaux n'ont pas été mesurés en usage**
  (YAGNI). S'il s'avère nécessaire : `bpm` ajouté au scan via le NML (pas de route
  supplémentaire).

## UX

### Colonne `Style` dans le tableau épars (`fileRow.ts`, `makeFileTable`)

Nouvelle colonne entre `Année` et `Codec`, largeur fixe (colgroup EPIC-026), 3 états :

| État | Rendu | Sens |
|---|---|---|
| suggéré | chip gris pointillé `techno_acid ·72%` | moteur, non validé |
| choisi (session) | chip plein ambre `techno_acid` | validé par l'utilisateur, pas encore appliqué |
| écrit | chip plein vert `✓ techno_acid` | `TCON` sur disque == style (lu au scan) |
| aucun | `—` | ni signal ni choix |

Tooltip = évidences + destination calculée (`→ techno_acid_2020` ou `→ techno_acid_?
année manquante` ou `→ ➕ techno_percu_2010 (à créer)`).

**Filtre chip — extension obligatoire en P1** : `FilterSubject` (`filterEngine.ts`) ne
couvre aujourd'hui que `name`/`year`/`codec` — **le sous-dossier épars n'est pas
filtrable**, donc « F7 `_schranz` » ne marche pas en l'état. Ajouter un champ optionnel
`path` (chemin relatif du fichier) au sujet épars, et le `style` choisi/écrit. Régression
à surveiller : `dirHasMatchingFile`/`twinUnderFilteredDir` (EPIC-034) partagent le moteur
— le champ est optionnel et absent côté source, sémantique de l'arbre inchangée (tests
existants doivent rester verts sans modification).

### Palette `g` (popover ancré à la ligne focusée)

```
┌ Style — 01 - adam beyer - remainings iii.mp3 ──────────────────┐
│ Suggestion : techno_acid  72 %   [Enter accepter]              │
│   dossier _techno · Adam Beyer 4× techno_1995 · ID3 Techno    │
│                                                                │
│ t techno   a techno_acid   h techno_hard   x techno_acid_hard  │
│ r trance   q trance_acid   c hardcore      d drumbass          │
│ o house    e electro       b breakbeat     i italo_disco  …    │
│                                                                │
│ → techno_acid_2020 (78 fichiers)              Échap annuler    │
└────────────────────────────────────────────────────────────────┘
```

- Ouverture : `g` sur une ligne épars focusée (page `sync`, panel `epars`, `isInput:
  false`, `activeModal: null`, menu fermé). **Un seul nouveau binding** — vérifié libre
  dans la matrice EPIC-031 (n, l, r, e, s, /, ?, Espace, F5, F7, F10 pris). Le reste est
  un **chord** géré dans le `keydown` propre de la palette (couche DOM focusée +
  `stopPropagation`, pattern `ratingEdit.ts`), donc **zéro collision** avec les touches
  de page et zéro modification du registry.
- Séquence : `g` → lettre du style (ou `Enter` = suggestion) → si `needsYear` :
  chiffres `1`‑`9` = tranche (affichées `1 1985 … 9 2025`, la tranche suggérée pré-
  surlignée, `Enter` l'accepte) → palette fermée, chip « choisi », **focus descend à la
  ligne suivante** (option config, défaut oui — écoute en chaîne EPIC-031 P2 compatible).
- `Échap` ferme sans changer (pile Échap EPIC-031 : palette > menu > modale > filtre…).
- Lettre inconnue → rien (pas de bip, pas de fermeture). `Backspace` dans la palette →
  retire le choix de session de la ligne.
- **Lot** : sélection multiple existante (**Espace** au clavier — binding « Sélectionner le
  fichier (multi-copie) » de `navigation.ts` —, Ctrl/Shift‑clic à la souris ; **il n'existe
  pas de Ctrl+A**, à ajouter si le besoin se confirme) + `g` → le titre devient
  « 77 fichiers », la suggestion devient la **majoritaire** (compteur par style), le
  choix s'applique à toute la sélection ; les fichiers avec année gardent leur tranche,
  ceux sans année reçoivent la tranche saisie (ou restent « année manquante » si
  `Échap` à cette étape — le style est tout de même posé).
- Souris : clic sur le chip de la colonne Style ouvre la même palette ; les styles y
  sont cliquables. Le D&D existant (`dragDrop.ts` → F5) reste tel quel.

### Barre récap + preview → apply

- Barre sticky sous le chip filtre épars (même slot que le chip, EPIC-030) dès qu'il y a
  ≥ 1 choix de session : `🏷 143 assignés · 12 sans année · 3 dossiers à créer ·
  [Aperçu] [Annuler tout]`.
- `Aperçu` (touche `e`, cohérence Années — page `sync` seulement, `e` y est libre) →
  modale `confirmDialog` étendue : **groupée par dossier cible**

  ```
  → techno_acid_2020      38 fichiers
  → hardcore_1995          7 fichiers
  → ➕ techno_percu_2010    2 fichiers   (sera créé)
  ⚠ 12 fichiers sans année : ignorés (style conservé en session)
  ☑ Écrire le style dans les tags ID3 (TCON) — ancienne valeur journalisée
  [Appliquer 47 copies]  [Annuler]
  ```
- `Appliquer` = pour chaque dossier cible : `setBatchCopy(dest, files)` →
  `executeCopy()` (F5 batch existant : `/copy` crée le dossier au besoin, journal, patch
  state, `revealSourceDir`, pastille « déjà rangé » EPIC-034). Une erreur de copie sur un
  dossier n'annule pas les autres ; le récap final liste ok/échecs (toast + journal).
  La case « Écrire le style dans les tags » devient en P3 un **export** des choix
  (`POST /styles/review`, pattern années) consommé par `apply_styles.py --review` — pas
  d'écriture ID3 depuis le navigateur.
- Les choix de session **persistent** entre pages et scans (`state.styleChoices:
  Map<fullpath, {style, tranche}>`), sont **perdus au reload** sauf export
  (`POST /styles/review` → `data/style_review.json`, pattern `year_review.json`,
  reprise au chargement). Décision : même politique que les Années (P2 livrée).

### Légende / aide

- Ligne générée automatiquement dans la légende `?` (bijection registry ↔ légende,
  EPIC-031) : `g — Poser un style (palette)`, `e — Aperçu du rangement par style`.
- Section « Rangement par style » dans la légende (états du chip, chord).

## Backend

| Élément | Rôle |
|---|---|
| `get_audio_meta` (+`genre`) | lecture additive `TCON`/`GENRE`/`©gen` au scan (vérifié : aucune lecture de genre aujourd'hui) — **P2** |
| `GET /styles` | sert `data/styles.json` (ou champ `styles` ajouté à la réponse `/load` — le moins de surface) ; taxonomie calculée **côté client** depuis `state.sourceFiles` (déjà là) — **P1** |
| `POST /styles/review` | persiste les choix de session (`{fullpath: {style, tranche}}`, fusion, 400 si style hors taxonomie) — pattern `/years/review` — **P3** |
| `scripts/apply_styles.py` | **seul écrivain** : `--dry-run` défaut, `--review`, mutagen (MP3 `TCON`, FLAC `GENRE`, WAV chunk ID3, M4A `©gen` — mêmes formats qu'`apply_years`), **journal `data/style_apply_journal.jsonl` avec `old_genre`**, double check post-écriture, idempotent (`skip`), `--undo` (restaure `old_genre`, supprime la frame si absente avant) — **P3** |
| `POST /styles/apply` | **non engagé** — seulement si l'aller-retour script est trop lourd à l'usage |

- La valeur écrite est l'**id de style tel quel** (`techno_acid`) — c'est la clé de
  correspondance avec les dossiers ; lisible dans Traktor ; convertible plus tard.
- **Ordre à l'apply** : copie d'abord, tag ensuite, **sur les deux exemplaires** (l'épars
  original et la copie rangée) — sinon la copie à droite garde `Blues`. Décision : tagger
  les deux (l'épars est destiné à rester en place ou à être trié plus tard ; un tag juste
  ne nuit pas). Journal par chemin.
- `.wma`/`.ogg` : hors périmètre d'écriture (comme EPIC-033), copiés quand même,
  listés dans le récap.

## Pièges & garde-fous

- **Le dossier n'est pas la vérité** : ~21 % des années s'écartent de > 5 ans de leur
  dossier (EPIC-033). La tranche est **calculée depuis l'année du tag** ; si l'utilisateur
  veut forcer une autre tranche (compilations, rééditions), la palette accepte un chiffre
  même quand l'année existe (`g`, lettre, puis chiffre avant `Enter`) — surcharge
  explicite, mémorisée dans le choix de session.
- **Homonymes artiste** (voisinage) : « Prodigy » rangé en `hardcore_1995` ET
  `techno_2000` → évidence affichée avec les deux comptes, suggestion = majoritaire
  seulement si écart ≥ 2 ; sinon ex æquo → pas de suggestion.
- **Alias `null` obligatoire** pour les genres poubelle, sinon `Blues` ×65 devient un
  style. Table initiale fournie ; toute valeur ID3 non aliasée est **ignorée** (jamais
  transformée en style implicite).
- **Pas de doublon à la copie** : la pastille « déjà rangé » (EPIC-034) et `dupMatches`
  (EPIC-028) sont consultés à l'aperçu → ligne `⤷ 3 fichiers ont déjà un jumeau dans le
  dossier cible : décochés par défaut`.
- **Écriture TCON ≠ additive** : le journal porte `old_genre` (ou `null`), l'`--undo`
  est testé sur MP3 v2.3/v2.4, FLAC, WAV (fichiers minimaux réels, pattern
  `test_apply_years.py`). Aucun test ne peut passer si l'ancienne valeur n'est pas
  restaurable.
- **Chord et `isInput`** : la palette est un élément focusable non‑input ; la garde
  structurelle `isInput` (EPIC-030) n'est pas contournée ; le chip filtre ouvert ferme
  d'abord (pile Échap).
- **Palette = couche DOM, pas de champ registry** (révisé au plan, 2026-09-19) : le
  dispatcher écoute `document` en phase bubble (`script.ts:74`) et `ratingEdit.ts:153`
  intercepte déjà ses touches par un listener sur l'élément focusé + `stopPropagation()`
  — pattern reconnu par la matrice (« couche au-dessus du registry »). La palette fait
  pareil : `tabindex=-1`, `focus()`, `keydown` propre. Zéro champ `isStylePaletteOpen`,
  zéro binding existant modifié, aucune cellule existante à renuméroter (`style.js`
  importé en dernier). `g` : **0 binding registry et 0 handler brut** `key === 'g'` dans
  `static/src` (vérifié) ; les raccourcis lettre du cue editor vivent sous
  `activeModal: 'cueEditor'`, hors contexte. `e` : pris seulement en page `years` et en
  `Ctrl+e` playlist (vérifié) → libre en page `sync`.
- **Matrice clavier** : `g` et `e` ajoutent des cellules **nouvelles** à la matrice
  EPIC-031 ; le test d'invariants doit rester vert (aucune cellule rouge). Un test de la
  palette prouve que ses touches n'atteignent pas `document`.
- **Colonne Style = colgroup `table-layout: fixed` (EPIC-026)** : largeur à prendre sur
  les colonnes existantes, mesures headless à refaire ; `fileRow.test.ts` /
  `render.test.ts` comptent des colonnes → régression à anticiper, pas à découvrir.
- **Performance** : 5 092 lignes × suggestion → moteur mémoïsé, calcul paresseux au
  rendu visible (les lignes des dossiers repliés/filtrés ne le déclenchent pas) ; index
  artiste → styles construit une fois par `sourceFiles:changed`.

## Phasage

| Phase | Contenu | Valeur seule ? |
|---|---|---|
| **P1 — Socle** | `styles.ts` (parse/taxonomie/dest), `data/styles.json` optionnel (lecture seule), **`FilterSubject.path`** (filtre par sous-dossier épars — prérequis du lot), colonne Style (états suggéré/choisi), palette `g` + chord tranche + contexte registry, lot via Espace/sélection, barre récap, aperçu `e` groupé par dossier → `executeCopy` batch | ✅ rangement clavier à 1 touche, sans écriture ID3 |
| **P2 — Suggestions** | `styleSuggest.ts` : segments de chemin épars, voisinage artiste, choix de session, genre ID3 (scan `genre`), borne d'acquisition ; chip confiance + évidences | ✅ `Enter` remplace la lettre pour la majorité des cas |
| **P3 — Écriture TCON** | `POST /styles/review` + `scripts/apply_styles.py` (dry-run, journal `old_genre`, undo), export depuis l'aperçu, état « écrit ✓ » (genre lu au scan == style) | ✅ mémoire durable dans les fichiers, visible Traktor |
| **P4 — Confort** | reprise `style_review.json` au chargement, légende générée, `Backspace` retire un choix, onglet Config Styles, dossier cible pré-surligné à droite pendant la palette (pattern twin-hint), BPM si mesuré utile | — |

Ordre de grandeur : **1 848** épars portent un style au 1ᵉʳ segment (2 150 quelque part
dans le chemin) → lots (filtre `path` + Espace + `g`) ; ~2 900 restants à ~4 s/fichier
avec suggestion `Enter` → quelques sessions. Le « 4 s » est une estimation, pas une mesure.

## Validation (cible)

- `styles.test.ts` : regex sur les 86 noms réels (fixture), hors temps, `trancheOf`,
  `destFor` (exists/needsYear), hotkeys dérivées sans collision.
- `styleSuggest.test.ts` : chaque signal isolé, cumul, ex æquo → null, alias `null`,
  borne d'acquisition, voisinage homonyme.
- `stylePalette.test.ts` : chord complet, Échap, lot, année forcée, focus suivant,
  bijection légende, matrice EPIC-031 verte.
- pytest : `genre` lu au scan (MP3/FLAC/M4A mock), `/styles` GET/PUT, `/styles/review`
  400 hors taxonomie, `/styles/apply` écriture + journal `old_genre` + undo + idempotence
  + 403 hors zone.
- Live sur données réelles (fetch mocké pour la copie) : palette sur `_schranz` en lot,
  aperçu 3 dossiers dont 1 à créer, chip « écrit » après apply.

## Errata du fact-check (2026-09-19, même session)

Relecture forensique de la première version contre `data/cache.json` et le code :

| # | Affirmation initiale | Réalité vérifiée | Impact |
|---|---|---|---|
| 1 | « ~20 styles » | **25** (18 datés + 7 hors temps), regex 86/86 | palette plus large ; `techno_disco` manquait dans `timeless` |
| 2 | « 29 dossiers ≤ 3 fichiers » | **28** (chiffre initial non compté) | cosmétique |
| 3 | « ~1 800 fichiers datés, ~540 sans signal, ~1 900 pré-triés (dont `_oldies`) » | **2 419** datés, **764** sans signal, **1 848** stylés au 1ᵉʳ segment (`_oldies` n'est pas un style) ; `_electro`/`_breakbeat`/`breakbeat`/`_goa` oubliés | volumes des lots |
| 4 | « 1ᵉʳ segment du chemin » suffit | **1 296** fichiers imbriqués, segments profonds plus précis (`techno clashy`…), 2 150 stylés quelque part | moteur : tous les segments |
| 5 | « F7 `_schranz` → lot (existant) » | `FilterSubject` = name/year/codec — **le sous-dossier n'est pas filtrable** | nouvelle tâche P1 (`path`) |
| 6 | « Ctrl+A » (message de brainstorm) | **inexistant** ; multi-sélection = Espace + Ctrl/Shift-clic | doc corrigée |
| 7 | « `mkdir` à l'apply » | `/copy` fait déjà `os.makedirs` + maj cache | tâche supprimée (YAGNI) |
| 8 | « `POST /styles/apply` + onglet Config + GET/PUT » en P1/P3 | pattern années (export → script) suffit ; JSON lu seul en P1 | surface backend réduite |

Confirmé sans réserve : 86 dossiers à plat, 9 tranches toutes multiples de 5, 5 092 épars /
1 679 avec année (33 %), `g` et `e` libres en page sync, `isContextMenuOpen` existant,
`artist_title()` dans `collect_years.py`, `_trash` élagué du scan, `data/` git-ignoré,
`get_audio_meta` ne lit aucun genre.

## As-built P2 (2026-09-19, commit `09705b3`)

Ce qui a été livré, et où la spec a été ajustée en route (honnêteté forensique) :

| Point de spec | As-built | Pourquoi |
|---|---|---|
| Poids 0,50 / 0,45 / 0,25 / 0,20 (somme 1,40) | **0,50 / 0,40 / 0,20 / 0,15** (somme 1,25), confiance = score/1,25, seuil **0,25** | la hiérarchie chemin > artiste > session > genre est conservée ; le seuil 0,30 de la 1ʳᵉ implé ne laissait passer ni « genre seul » ni « genre + 1 session » — 0,25 les admet (suggestion visible = matière à trancher, l'humain valide toujours) |
| Voisinage artiste « porté en TS ou exposé par l'API » | `_build_source_index` **au scan** (Python, réutilise le vrai `_artist_title`), servi par `/scan` et `/load` + `parseArtistTitle` TS **simplifié** côté client pour parser le nom du fichier épars | le lookup côté client a besoin de l'artiste du fichier ÉPARS (pas indexé par le scan Python) ; le portage simplifié rate des cas exotiques → pas de signal, jamais une mauvaise suggestion |
| `StyleSuggestion.evidence[]` (lignes lisibles) | réduit au **seul %** de confiance (tooltip court « Suggéré (72 %) — g pour valider », hint palette « → techno_acid (72 %) — Enter = accepter ») | KISS ; les évidences détaillées n'avaient pas de consommateur réel — à réintroduire si la calibration montre des acceptations à tort |
| Borne d'acquisition (`YYYY_MM` → tranche ≤ `trancheOf(YYYY)`), `_oldies` → 1990, tranche proposée | **non implémenté** : `suggestStyle` ne suggère que le style, jamais la tranche ; l'étape tranche de la palette reste le seul chemin | séparer les deux décisions (style = subjectif → suggérable ; tranche = dérivée de l'année → clavier) ; la borne d'acquisition transformait une donnée objective en guess |
| Mémoïsation par fullpath | non faite — calcul au paint + à l'ouverture de palette | coût réel non mesuré ; à mémoïser sur l'identité `styleChoices` (pattern `currentTaxonomy`) si un lot de 1 347 ralentit le re-render |
| `FileIndex.genre` requis | **optionnel** (`genre?`) | 84 fixtures de tests existantes restent valides — diff de 0 ligne là où un champ requis aurait imposé 84 éditions |
| Filtre sur le `style` choisi (chip) | non fait — seul `genre` ajouté au `FilterSubject` | YAGNI : filtrer sur la colonne Style n'a pas encore de consommateur |
| `/styles/review` (P3), `data/styles.json` (P4) | inchangés, non faits | phasage respecté |

Ajouts hors spec : `_build_source_index` renvoie des **listes triées** (déterminisme des
fréquences) ; l'alias vers un style absent de la taxonomie est **ignoré** (testé) —
un dossier renommé ne produit jamais de suggestion fantôme ; le genre `STYLE` (Vorbis)
est lu en fallback de `GENRE`.

Validation as-built : 19 tests `styleSuggest` (segments, chaque signal isolé, cumul,
ex æquo → null, alias hors taxonomie, seuils) · chip testé dans `styleCell.test.ts`
· `Enter` = accepter testé dans `stylePalette.test.ts` · pytest genre + source_index.
**Non fait** : live P2 + calibration des poids (critère de réussite réel du moteur —
prochaine étape après un premier usage).

## As-built P3 (2026-09-19, commit `e6dfa82`)

L'écriture TCON suit la spec (export → script, pattern EPIC-033 P2) avec ces précisions
as-built :

| Point de spec | As-built |
|---|---|
| `POST /styles/review` (fusion, 400 hors taxonomie) | **Fait** — taxonomie dérivée **du cache disque** (`_known_styles()` parse les dossiers source du cache, même grammaire que le client) ; un style créé via ➕ sans fichier est refusé jusqu'à la première copie (cas d'angle accepté : l'export suit la copie, donc le dossier existe) |
| `scripts/apply_styles.py` (dry-run, journal `old_genre`, undo, double check, idempotent) | **Fait** — journal append-only JSONL `{path, old, new, style, tag, ok, twin, ts}` ; `--undo` restaure la **dernière** écriture par chemin (null → retire le tag, valeur → réécrit), idempotent, plusieurs passes remontent l'historique ; double check `current_genre()` post-écriture (lecture par mutagen, mêmes frames que `get_audio_meta`) |
| Tag l'épars **et** la copie rangée | **Fait** — la copie est retrouvée **par nom de fichier** dans le cache source (pas par calcul de fullpath) ; homonymes de noms dans deux dossiers styles → premier trouvé gagne (rare, journal `twin: true` permet l'audit) |
| Ordre : copie d'abord, tag ensuite | **Respecté par construction** — l'export n'écrit que les choix **copiés** (`done` de `applyRangementPlan`) ; l'apply script tourne ensuite, hors navigateur ; les exclus (sans année, jumeau déjà là) ne sont pas persistés (P4 si l'usage le demande) |
| Formats MP3 v2.3/v2.4 · FLAC · WAV · M4A | **Fait** — `SUPPORTED_EXTS = (.mp3, .flac, .wav, .m4a, .mp4)` ; MP3 conserve la version du tag existant (TCON TYER→v2.3 ? non : TCON existe en v2.3 et v2.4, mutagen gère) ; `.wma`/`.ogg` comptés `unsupported`, jamais touchés |
| État « écrit ✓ » = genre lu au scan == style | **Fait** — chip `style-chip.written` (✓ vert, `--accent-green`), tooltip « · écrit dans le tag » ; nécessite un scan APRÈS l'apply (le cache porte alors le nouveau genre via `get_audio_meta` P2) |
| Tests pytest sur fichiers minimaux réels | **Fait** — 14 tests, fabriques `make_mp3/make_flac/make_wav` réutilisées + `make_m4a` (boîtes ftyp+moov minimales) ; écriture/restore par format, remplace l'ancien genre, jumeau + `old_genre`, idempotence, undo 2 exemplaires, dernière écriture gagne, dry-run byte-identique |

Ajout hors spec : **échec de l'export non bloquant** — si `POST /styles/review` échoue
réseau, les copies restent réussies, un message d'état signale l'export manqué (les
choix restent en session, ré-exportables au prochain aperçu réussi).

Validation as-built : gate complet (typecheck 0 · 1 095 vitest · lint 0 · build OK ·
317 pytest). **Non fait** : dry-run réel sur données (aucun choix persisté avant un
premier usage de P1/P2).
