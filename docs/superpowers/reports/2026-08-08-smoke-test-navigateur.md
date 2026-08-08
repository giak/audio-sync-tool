# Smoke test navigateur — collection réelle (2026-08-08)

> Test complet en navigateur (Chrome + browser-use) sur `http://localhost:8765`, avec la
> **collection réelle** `data/traktor4/collection.nml` (40 Mo, 56 645 ENTRY) et le profil
> « travail » (`source_data=/home/giak/Music/select/style/`, `epars=/media/giak/music/--[ montage audio/`).

## Résumé

| Volet | Résultat |
|---|---|
| Scan réel | ✅ 9 258 fichiers indexés (1 401 source + 5 092 épars + autres) |
| Smoke test navigateur (8 étapes) | ✅ 8/8 OK, **zéro erreur console** |
| Découverte forensique | 🚨 **BUG bloquant : FILESIZE en Ko vs octets → match NML impossible sur la collection réelle** |

## 1. Smoke test navigateur (8/8 OK)

| # | Étape | Résultat |
|---|---|---|
| 1 | Chargement `http://localhost:8765/` + UI (panneaux Source/Éparpillé, toolbar) | ✅ |
| 2 | Scan affiché (1 401 source, 5 092 épars, dossiers `techno_2020`, `techno_acid_2020`…) | ✅ |
| 3 | Sélection d'une piste + ajout à la playlist | ✅ |
| 4 | Cue editor : ouverture, waveform, play/pause, fermeture (✕ / Échap) | ✅ |
| 5 | Bouton « 🔍 Analyser » : réponse + badges affichés | ✅ |
| 6 | Export NML (📦) + Sauvegarde (💾) : confirmation visible | ✅ |
| 7 | Raccourcis clavier de navigation | ✅ |
| 8 | Erreurs console | ✅ aucune |

Traces réelles laissées par le test : playlist `playlist-1` (5 pistes), 3 beatgrids en cache
(`data/beatgrids.json`, sources detected/manual). La collection `collection.nml` **n'a pas été
modifiée** (mtime inchangé) — l'export écrit dans les playlists, pas dans la collection source.

## 2. 🚨 BUG bloquant découvert — FILESIZE en Ko vs octets

### Symptôme

`/api/track/match` renvoie **toujours `entries: []`** sur les fichiers de la collection réelle,
alors que le flux UI (cue editor, sauvegarde de cues, écriture de grille) en dépend entièrement.

### Preuve forensique

- Sur un échantillon de **300 fichiers réels** :
  - match avec `os.path.getsize()` (octets) → **0 / 300**
  - match avec la taille en **Ko** (`//1024` ou `round`) → **293 / 300**
- Piste du smoke test (`Global Communication - The Way…flac`, 72 826 114 octets sur disque) :
  - clé `(filename, "72826114")` → absent de l'index NML
  - clé `(filename, "71120")` (Ko) → **présent**
- Collection réelle : `FILESIZE="5243"` pour un fichier de ~5 368 832 octets → `5243` **Ko**.
- `nml.py:build_index` construit `(FILE, FILESIZE)` tel quel (donc en Ko, correct pour le NML) ;
  `app.py:track_match` compare `str(os.path.getsize(local))` (**octets**) → **incohérence d'unité**.
- `nml.py:build_entry_element` (EPIC-007, ajout de piste) écrit `FILESIZE=str(os.path.getsize())`
  → des **octets**, incohérent avec la convention Traktor (Ko) → les pistes ajoutées seraient
  introuvables au prochain match **et** Traktor lirait une taille fausse.

### Pourquoi les tests passent ?

Les fixtures (`tests/fixtures/nml-sample.xml`) utilisent des valeurs `FILESIZE` petites
(5243, 5004, …) que les tests fabriquent en octets (`local.write_bytes(b'x' * 5243)`) :
la coïncidence numérique octets=Ko sur de petites valeurs masque le bug. La vraie collection
a des tailles ≥ 3 000 Ko où la différence d'unité devient décisive.

### Impact utilisateur

- Cue editor : « ⚠️ Piste absente de la collection Traktor — visualisation seule » sur **toutes**
  les pistes réelles → pas de chargement des cues/grille Traktor, **sauvegarde de cues impossible**.
- Écriture de grille NML (EPIC-011) et bouton « 💾 Grille » : inopérants (aucun ENTRY matché).
- EPIC-007 (ajout de piste) : écrit des FILESIZE en octets → entrées incohérentes avec Traktor.

### Correctif (livré — EPIC-015 🟢)

Choix retenu (vérité forensique : le NML est en Ko, l'index reste tel quel) :

- `nml.py` : helper `filesize_kb()` (Ko **arrondi** half-up `(size+512)//1024` — prouvé
  581/600 vs 274/600 pour `//1024`) ; `build_export_nml` matche en Ko ; `build_entry_element`
  documente FILESIZE en Ko (écrit la valeur fournie par `track_add`, déjà en Ko).
- `app.py` : `track_match` et `track_add` comparent en Ko.
- Tests : cas réels (fichier ≥ 3 Mo, Ko ≠ octets : 5 368 832 octets → '5243'), match/add/export,
  fixtures adaptées (`b'x' * 5243 * 1024`).
- Résultat sur la collection réelle : **0/300 → 97,5 % (78/80 via HTTP)** ; les non-matchés
  sont des fichiers absents du collection.nml (jamais importés dans Traktor).

## 3. Autres observations

- Serveur déjà actif au démarrage du test (build dist à jour, cache-buster OK).
- Profil actif basculé de « smoke-test » (dossiers `/tmp` inexistants) vers « travail » (chemins réels).
- Scan réel ~2 min 50 s pour 9 258 fichiers (mutagen) ; le cache parse NML (EPIC-013) évite le
  re-parse du NML à chaque GET.
