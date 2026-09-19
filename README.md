# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants, les copie en un clic vers le bon sous-dossier, et intègre un
**éditeur de cues/loops avec waveform** calé sur la collection **Traktor (NML)**
(beatgrid, BPM, grille native, export de playlists).

## Fonctionnalités

- **Sync** : scan des dossiers éparpillés, détection manquant/doublon (nom
  exact **et** homonymes probables — durée ±2 s + nom, LED ambre), copie en un
  clic (F5) vers la bonne source, remplacement d'homonyme de moindre qualité
  (R — l'ancien part dans `_trash/<date>/`, jamais effacé).
- **Filtre rapide** (chips intégrés au-dessus des colonnes Sync) : F7 ou /
  focus le chip de la colonne focusée, filtre en direct insensible casse/accents
  sur nom + **année** + codec, mémorisé par liste (changer de colonne/page le
  conserve), ✕/Backspace pour effacer. Sur les arbres source : **filtre à deux
  niveaux** — dossiers seuls par défaut (déplier montre TOUS les fichiers, pour
  vérifier un doublon), toggle 📄 fichiers pour chercher aussi par nom de fichier.
- **Rangement assisté** (EPIC-034) : pastille « ⤷ déjà rangé » sur les fichiers éparpillés
  dont le jumeau existe déjà dans le dossier visé par le filtre source (tooltip
  = chemin exact — copier créerait un doublon), et **auto-ouverture du dossier
  destination après F5** : la copie est visible immédiatement, sans re-déplier,
  focus épars conservé pour enchaîner.
- **Lecture audio partout** : bouton ▶/⏹ sur les cartes Années et les membres
  de groupe Doublons (réutilise le player global — écouter avant de trancher),
  état « en lecture » re-marqué après chaque re-render.
- **Doublons** : vue dédiée des groupes de versions d'un même morceau (épars
  et/ou rangés) — arbitrage automatique par qualité (FLAC > 320 > 128), override
  au clic, application du plan (gagnant rangé à droite, perdants rangés → trash).
- **Playlist** : création/édition de playlists, notation (0–100), export par
  hard links, badge d'importation NML (`✓ NML` / `≈ homonymes` / `✕ non importé`).
- **Éditeur cues / loops (waveform)** : cues A–H (touches `1–8`), loops, zoom
  contrôlé (+/−, molette, « Fit », « 1 beat »), minimap synchronisée au zoom,
  waveform **3 bandes RGB** (low/mid/high standard DJ), renommage/recolorisation
  des cues, **undo/redo**.
- **Beatgrid** : snap sur BPM (détecté ou saisi), calage manuel de phase
  (`←/→ 1/4`, `◎ Beat 1`), analyse serveur kick/phase (DSP pur Python, bouton
  🔍 Analyser), **écriture de la grille dans le `collection.nml`** (TEMPO +
  TYPE=4 `AutoGrid`, bouton 💾 Grille).
- **Collection Traktor** : lecture de la collection NML, match par FILESIZE (Ko,
  convention Traktor), ajout des pistes absentes au collection, export NML
  configurable.
- **Enrichissement des années** (scripts hors interface, EPIC-033) : compléter
  les tags sans année via MusicBrainz → Deezer → Discogs, par vagues de
  confiance (certaines appliquées en lot, ambiguës réservées à une revue),
  jamais écraser une année existante — voir « Enrichissement des années » plus bas.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install flask mutagen
./venv/bin/pip install pytest          # pour les tests backend
```

> **Analyse serveur (bouton 🔍 Analyser)** : utilise `ffmpeg` (binaire système) pour décoder
> les mp3/flac/ogg. Les `.wav` fonctionnent sans (repli stdlib). Si ffmpeg est absent, seul le
> décodage WAV + la détection client restent disponibles.

```bash
npm install                            # pour le frontend (vitest, biome, esbuild)
```

## Utilisation

```bash
./venv/bin/python app.py
# → http://localhost:8765
```

L'outil a **trois pages** accessibles depuis la toolbar, plus un **éditeur de
cues** ouvert depuis la page Playlist (bouton « Cues » sur une ligne, ou menu
clic droit) :

| Page / Outil | Bouton | Fonction |
|------|--------|----------|
| **Sync** | 📦 Sync | Copier des fichiers éparpillés vers la source data (F5) |
| **Playlist** | 🎵 Playlist | Créer des playlists, noter les morceaux, exporter |
| **Doublons** | ↔ Doublons | Groupes de versions d'un même morceau, arbitrage qualité, perdants rangés → `_trash/` |
| **Cue editor** | « Cues » (ligne playlist) | Éditer cues/loops, zoom waveform, beatgrid, grille NML |

Les **outils** (⚙️ Config, 🔄 Scan, 📋 Journal, ❓ Raccourcis) sont
disponibles dans les pages.

> **Config** — renseigne aussi le chemin du `collection.nml` Traktor (champ
> *Traktor NML path*), nécessaire pour le match NML et l'écriture de la grille.

### Workflow de base

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
2. **Scan** — analyse tous les dossiers et extrait les métadonnées.
3. **Navigation** — au clavier uniquement : Tab, ↑↓, F5, F7.
4. **Playlist** — crée des playlists, sauvegarde, export par hard links.
5. **Cues** — ouvre l'éditeur waveform depuis une ligne de playlist.

### Raccourcis clavier (mode normal)

| Touche | Panel gauche (Éparpillé) | Panel droit (Source Data) |
|--------|--------------------------|---------------------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer dossiers |
| **← →** | — | Colonne suivante/précédente (2 colonnes) |
| **Shift + ← →** | Seek audio ±20s (pendant lecture) | |
| **Tab** | ↔ basculer de panneau | |
| **Entrée** | Jouer le fichier | Déplier/replier un dossier |
| **Espace** | Sélectionner le fichier | Déplier/replier un dossier |
| **F5** | Copier vers le dossier survolé (avec confirmation) — le dossier destination s'ouvre automatiquement (auto-expansion mémoire) | |
| **F7** / **/** | Focus le chip de filtre de la colonne focusée — tape pour filtrer (nom, année, codec) ; ✕ ou Backspace champ vide pour effacer | Même comportement sur l'arbre (auto-dépliage des branches matchées) |
| **Échap** | Sortir du chip / fermer modale / stopper l'audio | |
| **N** | Noter le fichier focusé (0-100, clic sur la zone de note aussi possible) | |
| **R** / double-clic | Remplacer l'homonyme (l'ancien rangé → `_trash/<date>/`) — seulement sur les lignes à LED ambre | |
| **G** | Poser un **style** (palette : lettre = style, puis chiffre 1-9 = tranche si l'année manque) sur la ligne focusée ou la sélection (Espace / Ctrl-clic) — voir « Rangement par style » | |
| **E** | Aperçu du rangement par style (copies groupées par dossier cible → confirmation) | |

### Raccourcis clavier (page Doublons)

| Touche | Action |
|--------|--------|
| **↑ ↓** | Naviguer les groupes de versions |
| **Clic sur un exemplaire** | Le désigner gagnant (override de l'arbitrage qualité) |
| **▶ / ⏹ (bouton du membre)** | Écouter avant de trancher — ne désigne **jamais** le gagnant (clic isolé) |
| **R** / bouton **✓ Appliquer** | Plan du groupe (confirmation) : gagnant rangé à droite, rangés perdants → `_trash/<date>/` |
| **Échap** / **📦 Sync** | Revenir à la page Sync |

> **Arbitrage qualité** : score par paliers — lossless (FLAC/WAV/AIFF/ALAC) =
> 100, ≥ 256 kbps = 80, 128-255 = 60, < 128 = 40 ; tie-breaks durée puis chemin.
> Le tooltip et la colonne « codec » permettent de juger ; la détection est une
> heuristique (revue humaine = confirmation obligatoire).

### Raccourcis clavier (page Playlist)

| Touche | Panneau Source | Panneau Sidebar |
|--------|----------------|-----------------|
| **↑ ↓** | Naviguer fichiers/dossiers | Naviguer pistes |
| **Tab** | ↔ basculer de panneau | |
| **Entrée** | Jouer le fichier | — |
| **Espace** | Ajouter/retirer le morceau | — |
| **F7** / **/** | Filtrer les fichiers | — |
| **Delete** / **Backspace** | — | Supprimer la piste |
| **Ctrl + S** | Sauvegarder la playlist | |
| **Ctrl + E** | Exporter la playlist | |
| **Ctrl + ↑↓** | — | Réorganiser les pistes |
| **N** | Noter le fichier focusé (0-100, clic sur la zone de note aussi possible) | — |

> **Note :** Échap ne quitte plus la page Playlist. Pour revenir à Sync,
> cliquer sur **📦 Sync** dans la toolbar.

### Raccourcis clavier (éditeur de cues)

| Touche | Action |
|--------|--------|
| **← →** | Seek audio ±5s |
| **+/−** | Zoom waveform (molette aussi : ×1,25) |
| **1–8** | Poser un cue sur les slots A–H |
| **C** | Poser un cue au curseur (déplace l'existant si 8 pleins) |
| **Ctrl + Z** / **Ctrl + Shift + Z** | Annuler / rétablir (undo/redo) |
| **←/→ 1/4** | Calage manuel de la grille (nudge de phase ±1/4 beat) |
| **◎ Beat 1** | Poser le premier beat |
| **🔍 Analyser** | Analyse serveur de la basse/du kick (BPM + phase) |
| **💾 Grille** | Écrire la grille (TEMPO + TYPE=4) dans le collection.nml |
| **Suppr** / clic droit | Retirer / supprimer un cue |
| **Double-clic** (slot ou région) | Renommer / recolorer le cue |

### Badges

| Badge | Signification |
|-------|--------------|
| ● bleu | Nouveau — pas encore dans source data |
| ○ gris | Doublon — existe déjà dans source data |
| ● vert | Traité — déjà copié (journal) |
| ● cyan | En cours de lecture |
| ✅ | Dans la playlist active (mode Playlist) |
| ✓ **NML** | Matché dans le collection.nml (sauvegardable) |
| ≈ **homonymes** | Plusieurs entrées NML homonymes (sélecteur au clic « Cues ») |
| ✕ **non importé** | Absent du collection.nml (visualisation seule) |

### Métadonnées affichées

Chaque fichier affiche : **Année** — **Codec** — **Durée**

### Workflow F5

1. Naviguer sur un fichier ● (panneau gauche) — la pastille « ⤷ déjà rangé »
   signale ceux dont le jumeau existe déjà dans le dossier filtré à droite
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → modale de confirmation (**Entrée** valide, **Échap** annule)
5. Le dossier destination **s'ouvre automatiquement** et montre la copie —
   le focus reste sur l'épars pour enchaîner

### Page Playlist

1. Cliquer **🎵 Playlist** dans la toolbar → deux panneaux : Source / Sidebar
2. **Espace** sur un fichier → ajoute ✅ / retire
3. **Ctrl + S** → sauvegarde persistante
4. **Ctrl + E** → export par hard links vers `source_data/_playlists/<nom>/`
5. Revenir à Sync → cliquer **📦 Sync** dans la toolbar

### Éditeur de cues & beatgrid

1. Dans la page Playlist, cliquer **« Cues »** sur une ligne (ou clic droit →
   *Cues / loops (waveform)*) → modale waveform de la piste.
2. **Cues** — `1–8` ou **C** pose un cue ; **Suppr**/clic droit le retire ;
   double-clic pour le renommer/recolorer (écrit dans le NML au save).
3. **Zoom** — +/− ou molette, `Fit` (piste entière), `1 beat` (largeur ÷
   intervalle, nécessite BPM) ; la minimap sous la waveform reste synchronisée,
   clic = seek.
4. **Waveform** — 3 bandes RGB (rouge basse / vert médium / bleu aigu), downbeat
   différencié (trait ambre), numéros de barre tous les 4 beats.
5. **Beatgrid** — `←/→ 1/4` et `◎ Beat 1` calent la grille ; **🔍 Analyser**
   lance l'analyse serveur (BPM + phase, cache par piste) ; **💾 Grille** écrit
   TEMPO + TYPE=4 dans le `collection.nml`.

### Notation (Ratings)

Une note de 0 à 100 est visible sur **tous les fichiers** (mode Sync et
Playlist), affichée à droite du row après la durée. La zone de note est
cliquable (ouvre un edit inline en mode Playlist Source) et éditable au
clavier via la touche **N**.

Les notes sont stockées globalement (pas par playlist) dans
`data/ratings.json`, avec la clé = chemin absolu du fichier.

| Action | Raccourci / Gestuelle |
|--------|----------------------|
| **Éditer la note** | **N** sur fichier focusé (Sync ou Playlist) → input inline |
| **Éditer la note** | **Clic** sur la zone de note (`.file-rating`) → input inline |
| **Valider** | **Entrée** → sauvegarde immédiate |
| **Annuler** | **Échap** → retour à la note précédente |
| **Effacer** | Champ vide + **Entrée** → suppression de la note |
| **Valider auto** | **Blur** → sauvegarde automatique |

**Affichage :**
- `85` — note en chiffres tabulaires
- *vide* — pas encore noté
- Dans le sidebar Playlist : `—` si pas noté

**Implémentation :** fonction partagée `_startInlineRatingEdit()` dans render.ts,
avec deux points d'entrée `startRatingEdit()` (sidebar tracks) et
`startSourceRatingEdit()` (file-rows dans l'arbre source).

## Rangement par style (EPIC-035, P1)

Les dossiers de Source Data suivent la grammaire `<style>_<tranche>` (tranche = palier de
5 ans : `techno_acid_1990`) ou `<style>` seul pour les styles hors temps (`italo_disco`).
La **taxonomie est dérivée des dossiers existants** (aucune liste à maintenir) ; le style est
la seule décision humaine, la tranche se déduit de l'année du tag, le dossier cible est
calculé.

1. Colonne gauche : focus une ligne (ou sélectionne un lot : **F7** `_schranz` puis
   **Espace** / Ctrl-clic) → **G** → lettre du style (affichée dans la palette) → si un
   fichier n'a pas d'année : chiffre **1-9** = tranche (`1985 … 2025`), **Entrée** = style
   seul. **Échap** annule, **⌫** retire le style. La colonne « Style » montre le choix et
   la destination en tooltip (`→ techno_acid_1990`, `→ ➕ … (sera créé)`, `année manquante`).
2. **E** → aperçu groupé par dossier cible (fichiers sans année et jumeaux déjà rangés
   exclus et listés) → **Appliquer** = copies enchaînées via le flux F5 (journal,
   auto-expansion du dossier, pastille « déjà rangé »). Les choix sont de **session**
   (perdus au rechargement) ; rien n'est copié sans l'aperçu ; **aucune écriture ID3 en P1**.

Le filtre de la colonne gauche matche aussi le **sous-dossier** épars (`_techno`, `2008_08`).

## Enrichissement des années (EPIC-033)

À l'origine : **3 704 / 6 522 fichiers sans année (57 %)**. Pipeline **gratuit et sans compte**
(mise à part l'option Discogs) : MusicBrainz (1ʳᵉ sortie du morceau, 1 req/s) → Deezer (sans
clé) → Discogs (60 req/min, token dans `data/discogs_token`, git-ignoré chmod 600).
Les résultats sont **mis en cache** (`data/year_cache.jsonl`, `data/discogs_cache.jsonl`,
`data/itunes_cache.jsonl`, `data/discogs_reform_cache.jsonl`, `data/discogs_reform2_cache.jsonl`,
`data/youtube_topic_cache.jsonl` — git-ignorés) : les clés déjà
collectées ne sont **jamais re-interrogées** ; une relance de collecte ne traite que
l'incrément (reprise JSONL, erreurs re-jetables).

**État au 2026-09-18 — EPIC CLÔTURÉE** : vague « certaines » **appliquée** (1 349 écritures
OK, journal = backup `data/year_apply_journal.jsonl`, `--undo` idempotent) — consolidation
7 sources : **1 443 certaines / 782 à revue / 1 473 introuvables** (+6 non parsables), dont les
apports **reformulé** (`collect_discogs_reform.py` : +15 certaines / +127 à revue) et
**junk-artiste numérique** (`collect_discogs_reform2.py` : +1 certaine / +12 à revue sur
les 556 artistes numériques/symboles — `#07 enzyme x`, `204`, `2006 prodigy`) — intégré au
consolidé (`scripts/report_years.py` + `/years/preview`) en dernier rideau, sans
chevauchement avec les sources amont. La passe **YouTube « - Topic »** a été **exécutée
sans trouvaille (0/84)** : les chaînes Topic sont fusionnées depuis 2025-2026 dans les
profils artiste — le garde-fou reste en place pour les relances futures (7ᵉ rideau).

**Revue industrialisée (P2)** : dans la vue Années, **F7** ou **/** filtre les cartes
(artiste, titre, année — terme mémorisé), choisissez/rejetez puis **e** (ou bouton 💾) → les
choix sont persistés (`data/year_review.json`) ; le chip filtre et la barre d'export se
collent en haut pendant le scroll ; chaque carte porte un bouton **▶** pour écouter le
fichier avant de trancher (player global, état conservé à travers les re-renders) ;
`apply_years.py --review --apply` applique le lot — un
choix humain OVERRIDE toujours la consolidation, journal + `--undo` inchangés.

**Passe Beatport** (techno digitale 2004+, complément des sources vinyle) : Beatport
n'ouvre pas la création d'apps OAuth au public — méthode éprouvée (celle de beets-beatport4) :
ouvrir https://api.beatport.com/v4/docs/, onglet Réseau (F12), « Login with Beatport », puis
copier la réponse JSON du POST `/v4/auth/o/token/` dans `data/beatport_token.json`
(chmod 600, git-ignoré). Le token expire (~1 h) : recommencer la copie quand le script le
demande.

**Passe YouTube « - Topic »** (dernier rideau, sans compte) : `collect_youtube_topic.py`
cible les clés `none` plausibles ≥ 2015 (année dans le chemin des dossiers), et exige la
chaîne « - Topic », tous les tokens artiste + titre dans le titre vidéo, la durée ± 15 s
d'un fichier de la clé et la `release_date` (l'upload_date n'est jamais utilisé).
Exécutée le 2026-09-18 : **0/84** — YouTube fusionne les chaînes Topic dans les profils
artiste depuis 2025-2026 ; le garde-fou reste utile aux relances futures.

```bash
# Collecte (incrémentale — inutile tant qu'aucun nouveau fichier n'arrive)
./venv/bin/python scripts/collect_years.py --report        # MB → Deezer (1 req/s)
./venv/bin/python scripts/collect_discogs.py --report      # Discogs sur les 'none'
./venv/bin/python scripts/collect_itunes.py --report       # iTunes sans clé (~20 req/min)
./venv/bin/python scripts/collect_discogs_reform.py        # Discogs requêtes reformulées
./venv/bin/python scripts/collect_discogs_reform2.py --go  # junk-artiste numérique (aperçu sans --go)
./venv/bin/python scripts/collect_beatport.py              # Beatport (EN PAUSE — token portail requis)
./venv/bin/python scripts/collect_youtube_topic.py         # YouTube « - Topic » (exécutée : 0/84, relançable)
./venv/bin/python scripts/collect_youtube_topic.py --go --verified  # tier chaînes vérifiées (tout en lax)

# Rapport consolidé (toutes sources, sans double comptage)
./venv/bin/python scripts/report_years.py --files

# Application de la vague « certaines »
./venv/bin/python scripts/apply_years.py            # dry-run : rien n'écrit
./venv/bin/python scripts/apply_years.py --apply    # écrit les tags (~5-10 min)
./venv/bin/python scripts/apply_years.py --review   # + choix humains de la vue Années
./venv/bin/python scripts/apply_years.py --report   # résumé du journal
./venv/bin/python scripts/apply_years.py --undo     # annule (idempotent)
```

**Garanties** (testées dans `test_apply_years.py`, 10 tests) :

- **Jamais écraser** : chaque fichier est re-vérifié sur disque juste avant écriture ;
  une année apparue depuis le scan → fichier sauté.
- **Journal = backup** : `data/year_apply_journal.jsonl` (append-only) enregistre chaque
  écriture ; l'opération étant purement additive (fichiers sans année), `--undo` retire
  exactement les frames posés et restaure l'état antérieur.
- **Formats natifs, lisibles par l'app** : MP3 `TYER` (tag v2.3) / `TDRC` (v2.4) — version
  du tag existant préservée, FLAC `DATE`, WAV `TDRC` (chunk ID3), M4A `©day` ; `.wma`
  exclu (non relu par `get_audio_meta`).
- Dry-run par défaut, `--limit N` pour un échantillon de contrôle.

**Clôture de la revue (2026-09-18)** : 692 choix exportés (633 années + 59 rejets) — les
782 à-revue sont **toutes soldées** (713 taggées, 59 rejetées, 9 échecs structurels
connus, 1 fanfare tranchée → 1980) ; `apply_years --review --apply` final : ok=1,
skip=2 152, idempotence vérifiée. Couverture finale au périmètre du scan : **76 %**
(4 970 / 6 508, contre 43 % à l'ouverture) ; ~3 551 fichiers nouveaux sans année depuis
le scan attendent un re-scan (collectes incrémentales, prêtes à relancer).

Historique complet, chiffres détaillés et bilan de clôture : [EPIC-033](docs/superpowers/epics/EPIC-033-enrichissement-annees-id3.md).

## Structure

```
audio-sync-tool/
├── app.py                 # Serveur Flask (port 8765, routes REST)
├── analysis.py            # Analyse serveur kick/phase (DSP pur Python, beatgrid P3)
├── nml.py                 # Parser/écriture collection Traktor (NML) : match, add, export, grille
├── templates/index.html   # Interface utilisateur
├── static/
│   ├── style.css          # Thème SCADA (JetBrains Mono, LED glow)
│   ├── src/               # Sources TypeScript (42 modules)
│   │   ├── commands/      # Command Pattern (10 modules)
│   │   ├── render/        # Component factories (11 modules — fileRow, cueEditor, playlistUI, dupsUI…)
│   │   ├── router.ts      # Routeur de pages (sync | playlist | dups)
│   │   ├── dupDetect.ts   # Détection doublons (durée ±2 s + nom fuzzy)
│   │   ├── dupGroups.ts   # Groupes de versions + arbitrage qualité
│   │   ├── script.ts      # Orchestrateur (~160 lignes)
│   │   ├── state.ts       # Proxy + EventEmitter + RAF batcher
│   │   └── *.test.ts      # 34 fichiers de test (vitest)
│   └── dist/              # Compilés par esbuild (gitignored)
├── data/                  # Config, journal, cache, playlists, ratings, beatgrids (gitignored)
├── docs/superpowers/      # Specs + plans d'implémentation
│   └── epics/             # ⭐ Registre des EPICs (traçabilité de toute évolution)
├── scripts/               # Outils Node (build, validation) + enrichissement années (collect_years, collect_discogs, apply_years — Python)
├── .github/workflows/     # CI : typecheck + lint + vitest + pytest
├── biome.json             # Linter + formateur Biome
├── vitest.config.js       # Tests frontend + coverage
├── tsconfig.json          # TypeScript config
├── package.json           # Dépendances JS
├── test_app.py            # Tests backend API (pytest)
├── test_analysis.py       # Tests DSP analyse kick/phase (pytest)
├── test_nml.py            # Tests parser/writer NML (pytest)
└── README.md
```

Routes REST principales : `/scan`, `/copy`, `/move`, `/config`, `/journal`,
`/ratings`, `/playlists[/<name>]`, `/mkdir`, `/api/nml/status`, `/api/track/match`,
`/api/track/add`, `/api/track/cues`, `/api/track/grid`, `/api/beatgrid`,
`/api/track/analyze`.

## Développement

Tout le code frontend est en **TypeScript**. Les fichiers `.js` sont des
artefacts de build (gitignorés) générés par esbuild.

```bash
npm run build              # Compilation unique .ts → .js
npm run dev                # Watch mode (compilation automatique)
npm run typecheck          # Vérification des types (tsc)
npm run lint               # Vérification Biome (0 erreurs — vérifié)
npm run lint:write         # Correction auto des problèmes
npm run format             # Formatage Biome
npm test                   # 811 tests, 34 fichiers
npm run test:shuffle       # Même suite en --sequence.shuffle (stabilité)
```

> **CI** : un workflow GitHub Actions (`.github/workflows/ci.yml`) vérifie
> typecheck, lint, vitest, pytest et le build sur chaque push/PR.

### Tests

#### Backend (pytest)

```bash
./venv/bin/python -m pytest -q
```

#### Frontend (vitest)

```bash
npm test                   # 811 tests, 34 fichiers
npm run coverage           # Clean → test → rapport (~91% lignes)
```

### Couverture

| Suite | Tests | Couverture |
|-------|-------|------------|
| Pytest | 190 | — |
| Vitest | 811 | 90.98% lignes/statements, 81.87% branches, 87.43% fonctions (mesure EPIC-021 — à rafraîchir) |

### Évolutions & traçabilité

Toute évolution/amélioration du projet est tracée dans une **EPIC**
(`docs/superpowers/epics/`) : registre central `README.md` + un fichier par
évolution (objectif, tâches cochables, fichiers, validation, commits, décisions).
Créer une nouvelle EPIC = copier `_template.md` + l'ajouter à l'index.
Statuts : ⚪ Backlog → 🔵 En cours → 🟢 Livré | 🟠 Bloqué | 🔴 Abandonné.

## Architecture (v0.2)

Le frontend utilise le **Command Pattern** pour router les entrées clavier.
Un `CommandRegistry` déclaratif remplace l'ancien handler monolithique
de 593 lignes. Les touches sont dispatchées vers 10 modules de commandes
(`registry`, `navigation`, `audio`, `copy`, `filter`, `rating`, `playlist`,
`modals`, `replace`, `dups`), scopés par page via `router.ts`
(`state.page` = sync | playlist | dups).

```
script.ts (~160 lignes, orchestrateur)
  └─▶ commands/ (8 modules, CommandRegistry)
state.ts (Proxy + EventEmitter + RAF batcher)
  └─▶ render/ (component factories — fileRow, sourceTree, playlistUI, cueEditor, index)
actions.ts (mutations state pures)
```

L'éditeur de cues (`render/cueEditor.ts`) pilote wavesurfer (waveform,
minimap, régions cues/loops) et conserve ses métadonnées dans des sources de
vérité internes (`_cueMeta`, `_displOrders`) pour un round-trip NML complet ;
la beatgrid s'appuie sur `bands.ts` (FFT fenêtrée, 3 bandes RGB) et le backend
(`analysis.py` + cache `data/beatgrids.json`).

**Tags git :**
- `v0.1-functional` — appli fonctionnelle (291 tests à l'époque)
- `v0.2-clean-architecture` — Command Pattern + EventEmitter (313 tests à l'époque)