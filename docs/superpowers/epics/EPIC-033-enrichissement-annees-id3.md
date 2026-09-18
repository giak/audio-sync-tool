# EPIC-033 — Enrichissement des années ID3 (MusicBrainz → Deezer), preview → apply

> **Statut** : 🟢 Livrée (T1–T7 : collectes, apply 1 349 tags, UI revue ; passe Discogs reformulée terminée — 14 found / 54 lax / 66 ambiguës sur 1 530 clés, intégrée au consolidé et vérifiée en direct)
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
      backup), `--undo` idempotent, double check post-écriture. 11 tests pytest sur fichiers
      audio minimaux réels (MP3 v2.3/v2.4, FLAC, WAV) : écriture, undo, invariant, idempotence
- [x] **T2/T4** Voie UI : endpoint `GET /years/preview` (app.py — consolidation des sources
      sans double comptage, priorité MB/Deezer > Discogs > iTunes > reform, last-wins par
      fichier, consensus ≤ 2 ans avec année = min des candidates, introuvables = compteur
      honnête ; conservation totale vérifiée) + vue « Années manquantes » (4ᵉ page du routeur,
      `render/yearsUI.ts` + `commands/years.ts`) : certaines en lecture seule (l'écriture
      reste `apply_years.py`), à revue interactif (ambigu = bouton par candidate, lax =
      accepter/rejeter — choix de SESSION locale, preview → confirmation, pattern EPIC-028/032)
- [x] **T5** Tests : parsing/gardes (normalisation !), écriture par format, invariant
      « jamais écraser », UI vagues + revue ambiguïtés — 16 tests gardes/consolidation
      (`test_collect_itunes.py`, `test_report_years.py`), 4 tests endpoint
      (`test_app.py -k years`), 8 tests vue (`yearsUI.test.ts`) ; total 237 pytest +
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
| `data/discogs_reform_cache.jsonl` | **Nouveau** (git-ignoré) — passe Discogs sur requêtes reformulées (clé + `query` journalisée), run en cours |
| `scripts/collect_discogs_reform.py` | **Nouveau** — passe Discogs reformulée (junk-artiste → split au 1ᵉʳ marqueur de face, suffixes junk) sur les introuvables |
| `data/discogs_token` | **Nouveau** (git-ignoré, chmod 600) — token API Discogs |
| `scripts/collect_years.py` | **Nouveau** — collecte MB→Deezer (reprise incrémentale + rapport) |
| `scripts/collect_discogs.py` | **Nouveau** — passe Discogs sur les `none` (reprise, erreurs re-jetables) |
| `scripts/collect_itunes.py` | **Nouveau** — passe iTunes sans clé (~20 req/min) sur les introuvables consolidés (reprise, erreurs re-jetables, lax) |
| `scripts/report_years.py` | **Nouveau** — rapport consolidé 4 sources, vagues de confiance sans double comptage (`--files` pour le décompte par fichiers) |
| `scripts/apply_years.py` | **Nouveau** — apply vague « certaines » (dry-run, journal, undo) |
| `test_apply_years.py` | **Nouveau** — 11 tests (MP3/FLAC/WAV réels, invariant « jamais écraser ») |
| `test_collect_discogs_reform.py` | **Nouveau** — 12 tests (reformulation sur cas réels, ciblage, run simulé) |
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
| `a1810d6` | `feat(years): EPIC-033 — 57 % du corpus sans année : 4 passes sans clé (MB/Deezer/Discogs/iTunes), 1 349 tags appliqués, vue Années pour la revue` |
| `ee9e8a3` | `feat(years): EPIC-033 — passe Discogs reformulée intégrée au consolidé (5ᵉ source)` |
| `5a178ec` | `feat(years): EPIC-033 — revue industrialisée (export choix → apply --review), passe junk-artiste numérique, Beatport prêt (en pause)` |

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

## Suite proposée — attaquer les 1 629 introuvables (2026-09-17, non engagée)

Caractérisation mesurée : 634 clés junk-artiste (info réelle dans le titre), 897 plausibles
(dont 152 avec marqueur de face, 44 avec suffixe junk) ; **986 clés déjà `none` Discogs**
(re-quête identique inutile), 545 jamais interrogées ; heuristique dossier **morte**
(2/1 531 indices) ; 1 528 clés avec durée connue (gardes strictes possibles). Sonde live :
la **reformulation** (retirer a1/b1, junk-artiste → requête = titre, nettoyer les suffixes)
passe de 0 résultat brut systématique à **4/6 clés résolues** (garde conservée).

Priorités : **P1** passe Discogs d'appoint sur requêtes reformulées (~26 min, cache séparé
avec la requête envoyée, mêmes gardes ; second rideau iTunes optionnel) → est. 100-300 clés ;
**P1 — script écrit (2026-09-17)** : `scripts/collect_discogs_reform.py` (+12 tests, suite
234 pytest ✓) — reformulation testée sur les cas réels (junk-artiste → split au 1ᵉʳ marqueur
de face, marqueur en tête retiré, n° de matrice, suffixes junk ; aperçu réel : 90 splits /
223 marqueurs / 25 numéros / 69 suffixes / 1 124 inchangées), cache `discogs_reform_cache.jsonl`
avec `query` journalisée, sources préfixées `reform_*`, reprise + erreurs re-jetables.
**Passe exécutée** (terminée 2026-09-18) : **1 530 clés — 14 found / 54 lax /
66 ambiguës / 1 396 none** (134 conclusives ≈ 9 %, bas de l'estimation 100-300).
Gain net consolidé (déduction des 9 clés sharp + 1 found déjà comptées en à-revue) :
**+15 certaines / +127 à revue / −142 introuvables** → vagues fichiers :
**1 442 / 769 / 1 487** (+6 sans clé), conservation vérifiée.
**Intégration post-passe vérifiée en direct** (2026-09-18) : le pool `reform_*` est consommé par le consolidé — `report_years.py`
(priorité MB/Deezer > Discogs > iTunes > **reform**, dernier rideau sans chevauchement :
elle ne cible par construction que des clés 'none' partout) et `GET /years/preview`
(app.py, `_load_years_caches` + `REFORM_CACHE_PATH`) ; les `reform_ambiguous/lax`
tombent en « à revue » (pas de consensus automatique, idem Discogs/iTunes) —
+3 tests (`test_report_years.py`, `test_app.py`, suite 237 pytest ✓, typecheck +
935 vitest ✓) ; helpers de tests redirigent DÉSORMAIS le cache reform (écrit en
direct par le run — sinon fuite de données réelles dans les tests) ; endpoint vérifié
sur données réelles : 142 items reform dans la vue (15 stricts → certaines, 127 → à revue).
**P2 — livrée (2026-09-18)** : export des choix de la vue Années + consommation
`apply_years --review` (industrialise la revue des 769 à revue). Chaîne : choix de session →
**e** (ou bouton 💾) → `POST /years/review` → `data/year_review.json` (pattern ratings,
fusion, clés sans tab / années non numériques → 400) → `apply_years.py --review`
(override : l'humain bat toute source, `source: 'review'`) → écriture par lot avec journal +
undo inchangés. Reprise de session au chargement (choix persistés re-marqués), champ année
libre pour trancher une ambiguïté hors candidates (appliqué à la carte focusée à l'export),
choix de session désormais réinitialisés à l'ouverture (pas de focus hérité). Correctif de
cohérence au passage : `load_found()` consomme désormais les found iTunes + reform (dernier
rideau, priorité report_years) — l'apply ne s'appuyait plus sur un socle partiel. +4 tests
pytest (endpoint ×2, last-rideau apply, override review — suite **241**) +6 vitest (export,
reprise, champ année — suite **941**) ; lint + build OK.

**UI — recherche + actions accessibles (2026-09-18)** : chip filtre du pattern EPIC-030
branché sur la page Années — **F7** ouvre/referme, **`/`** ouvre (vim), **Échap** ferme,
terme mémorisé par scope `years` (restauré au retour) ; filtre cartes certaines ET à revue,
compteur matchés/total, ↑↓ naviguent dans l'ordre VISIBLE (hors-filtre et rejetés sautés).
Zéro nouveau binding (F7 et `/` étaient déjà globaux — matrice 83 cellules intacte). Barre
d'actions accessible au scroll (option sticky, CSS pur) : le chip (via son slot) et le
titre « à revue » (champ année + Export) se collent en haut du conteneur — fond opaque,
espacement dans le fond peint (aucune fente), `z-index: 0` sur les cartes (sans quoi elles
peignent au-dessus d'un sticky descendant). Suite **948 vitest** (+7), 267 pytest, vérifié
en live sur données réelles.

**P1bis — passe Beatport (2026-09-18, script écrit — ⏸️ EN PAUSE, décision utilisateur : accès OAuth fermé + token portail à recopier ~1 h = trop de friction ; reprise = token dans data/beatport_token.json puis run)** :
suite au brainstorm/sondes (mémoire Mnemolite `ad9e92a8`) — YouTube « - Topic » validé comme
source fiable UNIQUEMENT ère digitale (release_date yt-dlp, 3/3 d'accord, mais 0 couverture
vinyle-era + biais réédition démontré : Model 500 → 2009 au lieu de 1985) → écarté comme
source automatique du résidu ; **Beatport retenu** (base techno digitale 2004+, OAuth compte
gratuit, pattern Discogs). `scripts/collect_beatport.py` (+8 tests, suite **251 pytest**) :
OAuth2 doc officielle — **création d'app OAuth fermée au public** (constaté live 2026-09-18 +
beets-beatport4 : « not possible to request API access the normal way ») → méthode éprouvée :
token copié du portail docs (F12 → POST /auth/o/token/ → JSON dans
data/beatport_token.json, chmod 600, expiration ~1 h re-copiable) ; app privée optionnelle
(data/beatport_oauth.json → client_credentials/password) ; /v4/catalog/search/ → tracks (garde tokens
+ durée EXACTE length_ms via détail ±15 s → beatport_strict) puis releases (→ lax) ; cible le
résidu via reform_targets() (1 396 clés none : 556 junk-artiste / 840 plausibles) ; reprise +
erreurs re-jetables ; pool `beatport` intégré au consolidé (5ᵉ rideau : report_years,
/years/preview, apply_years load_found) + 2 tests. **P3** fingerprint AcoustID/chromaprint
sur le résiduel uniquement (clé app requise, couverture faible sur ce catalogue). Interdits
inchangés : écriture auto de lax, heuristique dossier, re-requête identique déjà `none`.

**P1bis — reform v2 (junk-artiste numérique, 2026-09-18)** : la passe v1 ne couvrait que
« artiste vide / suffixes junk » ; le résidu garde des artistes ENTIÈREMENT
numériques/symboliques (n° de matrice `204`, préfixe de série `2cb`, année en tête
`2006 prodigy`, `#07 enzyme x`). `scripts/collect_discogs_reform2.py` : retrait du 1ᵉʳ
token numérique/symbole (junk word = ≤ 4 caractères num/symboles ; garde 5+ — `006b1`
conservé, limite documentée) ; fallback « artiste vide → titre porteur de l'info » hérité
v1 ; **aperçu lecture-seule par défaut** (`--go` pour interroger), ciblage via v1_targets
+ interdit de re-requête identique + conclusifs v1 exclus — **aperçu réel : 29 requêtes
v2 (~30 s à 57 req/min)**, ex. `#07 enzyme x — opbokken` → `enzyme x — opbokken`,
`2006 prodigy — outta space` → `prodigy — outta space`. Pool `reform2` = 6ᵉ rideau du
consolidé (report_years, /years/preview, apply_years) + 13 tests (suite **266 pytest**).

**Exécutée le 2026-09-18** (`--go`) : 29 requêtes + 2 rejets (normalisation `=` — voir
+ bas) = **30 clés conclusives : 1 found / 4 lax / 8 ambiguës / 17 none**. Gain net sur
les vagues : **1 443 certaines / 781 à revue / 1 474 introuvables** (vs 1 442 / 769 /
1 487 avant la passe). Au passage : bug corrigé (chemin « artiste vide » de `reform2()`
sans normalisation — `one phantasia=inner light` → 403 reproductible de Discogs ; '='
→ espace, espaces réduits, `_norm()` sur TOUTES les sorties v2 ; ciblage « fait »=
requête identique → les 2 clés avec '=' re-requêtées automatiquement). Suite **267 pytest**.
Correctif robustesse `report_years.load_all()` : garde d'existence des caches (crash
FileNotFoundError sur beatport_cache.jsonl absent — passe jamais lancée).
