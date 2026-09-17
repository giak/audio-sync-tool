# EPIC-033 — Enrichissement des années ID3 (MusicBrainz → Deezer), preview → apply

> **Statut** : 🔵 En cours (phase mesures/dry-run terminée, implémentation à venir)
> **Créée** : 2026-09-17 · **Dernière mise à jour** : 2026-09-17
> **Priorité** : Haute
> **Docs liées** : EPIC-028/032 (pattern preview → confirmation, jamais d'écriture automatique) · mémoire Mnemolite `9539d4ab` (veille APIs, 2026-09-17)

## Objectif

_Compléter les 3 704 fichiers sans année (57 % du corpus) avec l'année de première sortie du morceau, via un pipeline gratuit et sans clé (MusicBrainz puis Deezer), appliqué par vagues de confiance avec revue humaine — jamais d'écrasement d'une année existante._

## Contexte & découvertes (dry-run forensique, 2026-09-17)

**État des lieux vérifié en direct :**

- **3 704 / 6 522 fichiers sans année (57 %)** — l'info existe déjà dans le cache : `get_audio_meta`
  (app.py) lit TDRC/TYER/TORY/DATE ; le scan sait donc déjà qui manque.
- **MusicBrainz** : gratuit, **sans clé**, 1 req/s par IP (doc officielle), `first-release-date` =
  première sortie du *morceau*. **Deezer** : répond **sans clé** malgré un portail qui exige un login
  (pour la doc seulement) — `/search` (durée + album) puis `/album/{id}` → `release_date`.
- **mutagen 1.47.0 déjà dans le venv** — écrire les tags = zéro nouvelle dépendance.
- Protocole mémoire d'abord : cache miss Mnemolite → veille web → write-back (`9539d4ab`).

**Dry-run complet** (script lecture seule, 3 331 clés uniques dédupliquées, ~3 h 30 au rythme
imposé par MB, JSONL incrémental avec reprise) — sur **3 704 fichiers réels** :

| Statut | Fichiers | Part | Signification |
|---|---|---|---|
| **found** | **1 153** | **31 %** | année certaine : garde durée ±15 s + tokens compatibles + réponse unique |
| **ambiguous** | 572 | 15 % | candidats réels mais homonymes (2–7 candidates ; 311/466 clés n'en ont que 2) |
| **none** | 1 973 | 53 % | rien trouvé sous gardes strictes (vinyles absents des bases, noms dégénérés) |
| sans clé | 6 | 0,2 % | parser muet (`mix.wav`…) — traitement manuel |

Sources des matchs : **MusicBrainz 74 %** / Deezer 26 %. Répartition des années trouvées :
corps principal 1991–2011, pics 2002–2007, extrêmes 1977–2026 — cohérent avec la collection.

**Passe Discogs** (compte créé par l'utilisateur, token `data/discogs_token` git-ignoré chmod 600 ;
vérifié live : **60 req/min authentifié** vs 1 req/s MB ; `search?artist=&track=` + garde tokens,
durée vérifiée via tracklist master quand présente) sur les 1 262 clés `none` (~25 min) :
19 stricts (tokens+durée), 86 lax (année unique, tokens seuls), 51 ambiguës, 1 104 toujours none.
La durée tracklist Discogs est trop lacunaire (~30 %) pour une garde stricte — d'où le statut `lax`.
Années lax échantillonnées plausibles (Adam Beyer « Remainings III » → 2009, Prodigy « Omen » → 2009,
Lunar Module → 1994) : la base vinyle underground complète MB comme espéré.

**Passe iTunes** (2026-09-17, sans clé, doc Apple : ~20 req/min vérifiée) sur les
1 806 fichiers introuvables MB/Deezer/Discogs (1 703 clés) : statuts stricts/lax
identiques à Discogs. **Bilan final : 71 found / 44 lax / 57 ambiguës / 1 531 none
(89 %)** — le store couvre mal le vinyle underground, `none` fidèles (0 résultat brut,
garde non en cause, cf. mémoire Mnemolite `32392db0`).

**Consolidé (MB → Deezer → Discogs → iTunes), 3 704 fichiers sans année** — rapport
reproductible : `./venv/bin/python scripts/report_years.py [--files]` (priorité par clé
MB/Deezer → Discogs → iTunes, sans double comptage, vagues = règles d'`apply_years.py`).
**Mesure finale au 2026-09-17** (collecte iTunes terminée : 1 703/1 703 clés, 0 erreur re-jetable) :

| Vague | Fichiers | Part | Usage prévu |
|---|---|---|---|
| **certaines** (found toutes sources + consensus ambigu ≤ 2 ans MB/Deezer + Discogs strict) | **1 427** | **39 %** | apply par lot après confirmation (`apply_years.py`) |
| **à revue** (ambiguïtés hors consensus + lax Discogs/iTunes) | **642** | **17 %** | revue humaine (2 boutons quand 2 candidates) |
| **introuvables** | **1 629** | **44 %** | état inchangé ; recherche manuelle possible |
| sans clé | 6 | 0,2 % | traitement manuel |

Détail par source (clés) : certaines = MB/Deezer 1 151 (dont consensus « ambiguë fenêtre
≤ 2 ans », règle d'`apply_years.py`) + Discogs strict 19 + iTunes 71 ; à revue =
MB/Deezer 321 + Discogs 137 (ambiguës + lax) + iTunes 101. Baseline pré-iTunes
reconstituée : **1 355 / 537 / 1 806** ✓ (contrôle de cohérence du script). Contribution
nette iTunes : **177 fichiers sortis des introuvables** (72 certaines + 105 à revue), au
prix de 89 % de `none` — fidèles (0 résultat brut même sans garde : le store couvre mal
catalogue vinyle underground).

Discogs apporte ~167 fichiers supplémentaires (~8 % des échecs MB+Deezer) — modeste mais ciblé
exactement sur les vinyles que MB/Deezer ignorent ; et à 60 req/min, une future passe d'appoint
coûte ~25 min.

**Leçon forensique du run** : la première tentative rejetait 100 % des réponses MB — la garde
`tok_compat` comparait les tokens **sans normalisation de casse/accents**. Corrigé puis relance
propre (contrôle qualité à 16 clés au lieu de 3 h). La garde normalisée est un prérequis testé
de toute implémentation.

**Contrôle qualité iTunes** : un `none` vérifié à la main (Felix Da Housecat « Vengeance of
a Bad Man » → 0 résultat même sans garde) avant lancement complet — la garde n'écrase rien,
l'API renvoie tout simplement rarement ce catalogue.

**Qualité (constats d'honnêteté) :**

1. **Sémantique hétérogène** : MB = première sortie du morceau (Energy Flash → 1990), Deezer =
   année d'album de la version. Politique retenue : **tag = année de première sortie** (cohérente
   pour un DJ ; l'édition reste lisible dans le nom du fichier).
2. **Validation croisée dossier-décennie** : 30 % des `found` s'écartent de > 5 ans du dossier
   (`techno_1995`…) — mais les **tags existants** s'en écartent à 21 % : le dossier est un bucket
   d'époque, pas une vérité terrain. → signal d'attention UI, **jamais** filtre automatique.
3. **Ambiguïtés non auto-résolubles** : la décennie du dossier n'isole une candidate unique que
   pour 11/43 fichiers. Revue humaine = seul résolveur honnête ; l'arité favorable (2/3 des
   homonymies à 2 candidates) rend cette revue viable en pratique.

## Tâches

- [x] Vérification mémoire (Mnemolite, cache miss) + veille APIs + write-back (`9539d4ab`, Discogs `a5a0ea3d`)
- [x] Vérification live : MB sans clé/1 req/s, Deezer sans clé, mutagen présent, `year` déjà scanné
- [x] Dry-run complet 3 331 clés (~3 h 30, JSONL incrémental + reprise) — rapport : 1 153 / 572 / 1 973 / 6
- [x] Correctif garde tokens (normalisation casse/accents) après diagnostic « MB 0 match »
- [x] Compte Discogs (token `data/discogs_token` git-ignoré chmod 600) + passe complète : 1 262 clés
      en ~25 min (60 req/min) → 19 stricts / 86 lax / 51 ambiguës / 1 106 none ; 2 erreurs 502 re-jetées OK
- [x] **T1bis** Passe iTunes sur les 1 806 introuvables : script sans clé
      (`scripts/collect_itunes.py`, pacer ~19 req/min < 20 req/min doc Apple, reprise JSONL,
      erreurs re-jetables, statuts found/lax/ambiguous/none) + mémoire `32392db0` ;
      consolidation 4 sources sans double comptage : `scripts/report_years.py` (`--files`,
      baseline pré-iTunes reconstituée 1 355/537/1 806 ✓) — collecte terminée :
      1 703/1 703 clés, 0 erreur re-jetable (bilan 71 found / 44 lax / 57 ambiguës /
      1 531 none) ; consolidé final 1 427 / 642 / 1 629 (+ 6 sans clé)
- [x] **T1** Persister les résultats : `data/year_cache.jsonl` (3 331 clés) + `data/discogs_cache.jsonl`
      (1 262 clés, sans erreur) — git-ignorés, JSONL valides (clés uniques) ; scripts versionnés dans
      `scripts/` (MB/Deezer + Discogs, reprise incrémentale, erreurs re-jetables, rapport `--report`)
- [x] **T3a** `scripts/apply_years.py` — application de la vague « certaines » : dry-run par
      défaut, re-vérification de l'année à l'instant T (jamais écraser), écriture par format
      (MP3 → TYER/TDRC selon la version du tag existant, FLAC → DATE, WAV → TDRC ID3,
      M4A → ©day, .wma exclu car non relu par l'app), journal additif
      `data/year_apply_journal.jsonl` (l'opération est purement additive → le journal EST le
      backup), `--undo` idempotent, double check post-écriture. 10 tests pytest sur fichiers
      audio minimaux réels (MP3 v2.3/v2.4, FLAC, WAV) : écriture, undo, invariant, idempotence
- [x] **T2/T4** Voie UI : endpoint `GET /years/preview` (app.py — consolidation 4 sources
      sans double comptage, priorité MB/Deezer > Discogs > iTunes, last-wins par fichier,
      consensus ≤ 2 ans avec année = min des candidates, introuvables = compteur honnête ;
      conservation totale vérifiée) + vue « Années manquantes » (4ᵉ page du routeur,
      `render/yearsUI.ts` + `commands/years.ts`) : certaines en lecture seule (l'écriture
      reste `apply_years.py`), à revue interactif (ambigu = bouton par candidate, lax =
      accepter/rejeter — choix de SESSION locale, preview → confirmation, pattern EPIC-028/032)
- [x] **T5** Tests : parsing/gardes (normalisation !), écriture par format, invariant
      « jamais écraser », UI vagues + revue ambiguïtés — 16 tests gardes/consolidation
      (`test_collect_itunes.py`, `test_report_years.py`), 4 tests endpoint
      (`test_app.py -k years`), 8 tests vue (`yearsUI.test.ts`) ; total 221 pytest +
      935 vitest, typecheck + lint + build OK
- [x] **T6** Docs : `README.md` (section « Enrichissement des années » + Structure),
      `AGENT.md` (%ARCHITECTURE.years), index registre à jour
- [x] **T7** Validation complète : typecheck + vitest + pytest + lint + build

## Fichiers impactés (prévus)

| Fichier | Rôle |
|---|---|
| `data/year_cache.jsonl` | **Nouveau** (git-ignoré) — 3 331 matchs MusicBrainz/Deezer du dry-run |
| `data/discogs_cache.jsonl` | **Nouveau** (git-ignoré) — 1 262 résultats Discogs (0 erreur) |
| `data/itunes_cache.jsonl` | **Nouveau** (git-ignoré) — 1 703 clés iTunes, collecte complète (0 erreur) |
| `data/discogs_token` | **Nouveau** (git-ignoré, chmod 600) — token API Discogs |
| `scripts/collect_years.py` | **Nouveau** — collecte MB→Deezer (reprise incrémentale + rapport) |
| `scripts/collect_discogs.py` | **Nouveau** — passe Discogs sur les `none` (reprise, erreurs re-jetables) |
| `scripts/collect_itunes.py` | **Nouveau** — passe iTunes sans clé (~20 req/min) sur les introuvables consolidés (reprise, erreurs re-jetables, lax) |
| `scripts/report_years.py` | **Nouveau** — rapport consolidé 4 sources, vagues de confiance sans double comptage (`--files` pour le décompte par fichiers) |
| `scripts/apply_years.py` | **Nouveau** — apply vague « certaines » (dry-run, journal, undo) |
| `test_apply_years.py` | **Nouveau** — 10 tests (MP3/FLAC/WAV réels, invariant « jamais écraser ») |
| `test_collect_itunes.py` + `test_report_years.py` | **Nouveau** — 16 tests gardes/consolidation |
| `static/src/render/yearsUI.ts` | **Nouveau** — vue vagues + revue ambiguïtés (4ᵉ page) |
| `static/src/commands/years.ts` | **Nouveau** — clavier page Années (↑↓, Échap) |
| `app.py` (routes `/years/*`) | **Étendu** — `GET /years/preview` : consolidation caches → vagues |
| `static/style.css` | styles vagues + revue |
| `AGENT.md` | architecture (module années, %ARCHITECTURE.years) |

## Validation

- [x] Typecheck (`npm run typecheck`)
- [x] Tests frontend (`npm test`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _(à venir)_ | `feat(years): EPIC-033 — …` |

Phase dry-run : script + JSONL hors dépôt (`/tmp`, à persister en T1) — chiffres consignés ici.

## Découverte bonus (dry-run utilisateur, 2026-09-17)

3 « déjà année » du dry-run = des **M4A réellement taggés** (`©day` 2018/2019 sur disque) que
`get_audio_meta` ne savait pas lire — la boucle ID3 ne teste jamais `©day`. Le scan les comptait
« sans année » depuis toujours. **Corrigé dans `app.py`** (lecture additive) + test mock
(`test_get_audio_meta_m4a_cday`) — prochain scan, leurs années apparaîtront. Preuve au passage
de la valeur de la re-vérification disque du script (invariant « jamais écraser »).

**Apply final (2026-09-17)** : vague « certaines » élargie appliquée — **1 349 écritures OK,
0 échec** au journal (dont les 1 332 de la passe 17:38 et 17 MP3 sans header ID3v2, taggés
par création de tag additive). Correctif `write_year` : `ID3(path)` levait
`ID3NoHeaderError` sur les MP3 sans tag ID3v2 du tout (ID3v1 seul ou rien) — un tag v2
est désormais créé (+ test). Seul reste : un faux `.flac` corrompu (ni FLAC ni MP3,
hors scope du script).

## Décisions

- **D1 — MusicBrainz d'abord, Deezer en relais** : MB couvre le vinyle underground (16/24 des
  échecs Deezer sur échantillon) et donne la sémantique « première sortie » ; Deezer rattrape les
  tubes/rééditions. Deux services, zéro clé, zéro coût.
- **D2 — Consommer le cache du dry-run** : l'implémentation n'interroge plus les APIs pour les
  clés déjà résolues ; re-scans futurs = incrémentaux (reprise JSONL, clés sautées).
- **D3 — Trois vagues de confiance, jamais d'écriture automatique** : found → apply par lot après
  confirmation ; ambiguous → revue humaine (2 boutons quand 2 candidates) ; none → l'état reste.
  Pattern EPIC-028/032 (preview → confirmation).
- **D4 — Gardes strictes et testées** : durée ±15 s d'une des durées connues de la clé + tokens
  artiste/titre **normalisés** (casse/accents — leçon du run) ; homonymie → `ambiguous`, jamais
  de choix silencieux.
- **D5 — mutagen seul, formats ciblés** : TDRC (ID3v2.4) / DATE (Vorbis) / chunk ID3 (WAV) /
  ©day (M4A) — aucune nouvelle dépendance, aucune réécriture audio.

## Notes / Risques

- Caches persistés dans `data/` (git-ignoré) : les 4 593 clés collectées ne dépendent plus de `/tmp`.
- ~21 % des tags existants s'écartent de > 5 ans de la décennie du dossier : le dossier ne peut
  servir ni de vérité terrain ni de filtre d'application, seulement d'indice affiché.
- 49 % de `none` : hors périmètre de cette EPIC d'y répondre par une passe relâchée (chantier
  séparé éventuel : revue humaine sans garde durée, ou source tierce — Discogs déjà exploité).
- MB surchargé renvoie des 503 (retry 5/15/30 s éprouvé) ; Discogs des 502/429 (retry géré dans
  `collect_discogs.py`, erreurs re-jetables à la reprise). À 1 req/s, un re-scan MB complet coûte
  ~1 h — d'où l'injonction : toujours consommer les caches, ne collecter qu'en incrémental.
