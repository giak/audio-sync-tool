# EPIC-040 — Années corroborées : plus jamais une réédition écrite comme année du morceau

> **Statut** : 🟡 Moteur + audit + **revue livrés** (EPIC-045), re-collecte complète à suivre
> **Créée** : 2026-09-21 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : spec `2026-09-21-annees-corroboration-design.md` · **EPIC-045** (revue des items, dernier maillon) · EPIC-033 (collecte d'origine) · mémoire MnemoLite `a4494da3`

## Objectif

Aucune année ne doit plus être écrite en base sur une **source unique non gardée** —
et les années déjà écrites par le robinet fautif doivent être **re-vérifiées puis
corrigées**, avec preuve et retour arrière possible.

## Contexte & découvertes

Retour d'usage : « Inner Light / Phantasia, j'ai du 2024 alors que c'est du 1991,
n'importe quelle simple recherche web le trouve de suite. » Fait vérifié (MnemoLite
cache miss → web → mémoire `a4494da3` `status:CONFIRME`) : Phantasia « Inner Light »
(R&S) = **1991** (Discogs : « the month listed for Phantasia release … is April 1991 »).

**Les trois maillons, mesurés sur la collection** :

1. **Orientation devinée** — `collect_years.py::load_keys()` construit la clé de
   recherche depuis le **nom de fichier** en supposant « Artiste - Titre ».
   `Inner Light - Phantasia.mp3` devient `artiste='Inner Light'`, `titre='Phantasia'`
   (clé réelle dans `year_cache.jsonl`). Et quand le nom est un collage
   (`inner lightphantasia.mp3`), aucune heuristique ne s'en sort — alors que les
   **tags du fichier disent artist=Phantasia / title=Inner Light**. Cette donnée était
   jetée (`load_keys` ne lit pas les tags).
2. **Deezer sans garde** — `dz_lookup()` n'avait **aucun contrôle artiste/titre**
   (MusicBrainz, Discogs et iTunes en ont un). Seul filtre : durée ±15 s, *inactif*
   quand la durée du fichier est inconnue. Rejoué à l'instant :
   `q="Inner Light Phantasia"` → `'Phantasia' — 'Inner Light (Out of Orbit Remix)'`,
   album **« Ooo », release_date=2024-01-15**, durée 322 s (fichier 335 s → 13 s
   d'écart → accepté). La requête **correcte** `artist:"Phantasia" track:"Inner Light"`
   renvoie **vide** : seul le repli texte libre concluait.
3. **Sémantique confondue** — Deezer n'expose que `release_date` de **l'album
   matché** (une **réédition**) ; MusicBrainz expose `first-release-date`. Le pipeline
   mélangeait les deux dans la même colonne « année certaine ».

**Ampleur mesurée** (`data/year_apply_journal.jsonl`, lecture seule) :

| source d'écriture | années écrites | dont ≥ 2015 |
|---|---|---|
| **deezer** | 408 | **173 (42,4 %)** |
| musicbrainz | 740 | 89 (12,0 %) |
| revue manuelle (humain) | 713 | 42 (5,9 %) |
| consensus | 182 | 5 (2,7 %) |
| itunes | 71 | 22 (31,0 %) |

Répartition Deezer : **356 épars** (140 ≥ 2015) + 52 fichiers déjà rangés. Les épars
sont le vrai danger : EPIC-035 calcule la tranche de rangement **depuis l'année** — un
faux « 2024 » range un morceau de 1991 dans `techno_2020` (c'est le cas du FLAC
`10. Phantasia - Inner Light (Out of Orbit Remix).flac`).

Et le mécanisme qui rendait l'erreur **définitive** : le pipeline **n'écrase jamais**
une année existante et la vue Années ne montre que les fichiers **sans** année. Une
fois 2024 écrit, rien ne le contredit — aucune des 350 clés Deezer n'avait de 2ᵉ
source (0 recoupement local, par construction).

**Décisions utilisateur (2026-09-21)** :
1. Portée : **pipeline + audit des 408 années Deezer** (re-vérif MB/Discogs → revue → apply avec backup).
2. Règle : **2 sources concordantes exigées, sinon → revue (rien n'est écrit)**.

## Tâches

- [x] Moteur : **orientations multiples** (`key_variants` : tags du fichier → nom → nom inversé), la garde tranche au lieu d'une supposition.
- [x] Moteur : **garde artiste ET titre sur Deezer** (comme MusicBrainz), + `evidence` qui conserve l'album et sa date (la réédition devient visible).
- [x] Moteur : **Discogs** ajouté comme 3ᵉ provider (token présent) — c'est lui qui sait dire 1991.
- [x] Moteur : **règle des 2 providers indépendants concordants** (`found`), sinon `single` / `conflict` / `ambiguous` / `none` avec **proposition pré-remplie** (`proposed`) et candidates.
- [x] Indépendance des sources : `reform`/`reform2` sont des requêtes **Discogs** → comptées comme une seule voix (`PROVIDER`, `PROVIDER_OF`) ; classes sémantiques `first` (MB, Discogs) vs `edition` (Deezer, iTunes, Beatport, YouTube).
- [x] `year_cache.jsonl` **versionné** (`v:2`) : les enregistrements v1 (moteur sans garde) sont ignorés par `done_keys()` → ils seront re-collectés, et `load_votes()` refuse de s'en servir.
- [x] `apply_years.py` : `load_votes()` + `corroborate()` — **une année ne s'écrit que si ≥2 providers concordent** ; un désaccord ou une source unique ne s'écrit pas.
- [x] `--undo` restaure les années **corrigées** (`old` renseigné), au lieu de ne couvrir que les écritures additives.
- [x] `scripts/audit_applied_years.py` : rejoue le moteur corrigé sur les écritures du journal et classe `confirme` / `contredit` / `a_revoir` / `non_verifie` ; rapport + `data/year_audit.json` ; `--apply [--yes]` (dry-run par défaut) décidé par la revue.
- [x] **Cas signalé corrigé** : les 2 fichiers Phantasia « Inner Light » sont passés de **2024 → 1991** (journal : `old=2024, new=1991, source=audit:deezer+discogs`).
- [x] **YouTube Topic** câblé comme 4ᵉ provider **en direct** (`--youtube`) : classe `edition` (release_date YouTube) → il ne conclut pas seul mais **corrobore** une source `first`. Coût réel (yt-dlp, sous-processus) → flag opt-in, à réserver aux clés non résolues (`--only=unresolved`) — sa passe historique n'avait produit **aucune** année (168 lignes, 0 found).
- [x] **Recherche web** (Brave Search, `BRAVE_API_KEY` ou `data/search_token`) comme source de **dernier recours** : elle alimente `web_candidates` / `web_proposed` et l'`evidence` (titre + URL + extrait), et **ne vote jamais** — un extrait de page web n'a pas le niveau de preuve d'une API de disques, la règle des 2 sources ne doit pas se contourner avec un moteur de recherche.
- [ ] **Re-collecte complète** (`collect_years.py`, moteur v2) : ~3 700 clés × 3 providers, reprenable ; c'est elle qui produira les propositions pour les fichiers **sans** année — **engagée à ~30 %** (1 464 clés en v2, 3 331 en v1 volontairement ignorées).
- [x] **Audit complet des 408 exécuté** (2026-09-22, `data/year_audit.json`) : **23 confirmées · 38 contredites** (proposition fournie) **· 8 à revoir · 339 non vérifiées** (100 aucune source / 13 candidats sans corroboration / 226 une seule source « édition »). Aucune écriture déclenchée : les 38 corrections attendent la revue.
- [x] **Exposition en revue** des items dans la vue Années — **livrée en [EPIC-045](EPIC-045-revue-annees-ecrites.md)** : section **⟲** (badge `écrit 2024 → 1991`, sources, fiche de sortie), **GET `/years/audit`** (lecture seule, `non_verifie` allégés et comptés par classe), **POST `/years/audit/review`** (`corriger` écrit **tout de suite** via le journal partagé `source: "audit:revue"` ⇒ `apply_years.py --undo` restaure ; `garder` sort le cas de la file, décision persistée).

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `scripts/collect_years.py` | Moteur : orientations (`key_variants`, `tags_artist_title`), garde Deezer, 3 providers, classes sémantiques, règle des 2 sources, `v:2`, mode `--probe` |
| `scripts/apply_years.py` | `load_votes()` + `corroborate()` (règle des 2 sources), `--undo` qui restaure les corrections |
| `scripts/audit_applied_years.py` | **Nouveau** — audit des années déjà écrites (rapport, JSON, apply/undo) |
| `test_collect_years.py` | **Nouveau** — 11 tests (dont la régression Phantasia) |
| `test_apply_years.py` | Fixtures à la nouvelle règle + test du `--undo` de correction |

## Validation

**Cas signalé, bout en bout** (`--probe='inner light|phantasia' --durs=337`) :

| | avant | après |
|---|---|---|
| Statut du moteur | `found` 2024 (Deezer seul, sans garde) | **`conflict`** (deezer=2024 édition / discogs=1991 première sortie) |
| Année écrite | **2024** | **rien** (revue), proposition **1991** |
| Orientation | devinée (inversée, jamais détectée) | **auto-corrigée** (`variant: inverse`) |
| Trace | aucune | `evidence` album « Ooo » 2024-01-15 |

**Audit** : `--match=phantasia` → 2/2 `contredit` avec proposition 1991 → `--apply --yes`
→ tags relus sur le disque : **`date: 1991`** sur les deux fichiers, journal additif
(`old=2024`) donc **réversible**.

**Tests** : `326 pytest` (11 nouveaux + 14 sur `apply_years`), dont la régression
`test_regression_phantasia_2024_ne_conclut_pas`. **Validés par mutation** :
- règle des 2 sources neutralisée (`single` → `found`) → le test de régression échoue ;
- garde artiste retirée de Deezer → `test_deezer_rejette_un_meme_titre_autre_artiste` échoue.

- [x] Tests backend (`./venv/bin/python -m pytest -q`) — 326
- [x] Tests frontend (`npm test`) — 1 137 (aucun fichier TS touché par cet EPIC)
- [x] Typecheck / Lint / Build — 0 erreur

## Traçabilité (commits)

| Commit | Message |
|---|---|
| _(working tree 2026-09-21)_ | Années : orientations + garde Deezer + règle des 2 providers concordants, audit des années déjà écrites, correction du cas Phantasia |

## Décisions

- **« 2 sources concordantes, sinon revue » (utilisateur)** : une source unique non gardée a écrit 173 années ≥ 2015. Le coût assumé est une file de revue plus longue ; le bénéfice est qu'aucune année ne peut plus entrer en base sur une seule voix.
- **Indépendance des providers** : `reform`/`reform2` sont **Discogs**. Les compter séparément fabriquerait une fausse corroboration entre deux requêtes du même site.
- **Classes sémantiques** : MB/Discogs = `first` (première sortie), Deezer/iTunes/Beatport/YouTube = `edition` (date de l'édition matchée). En cas de désaccord, la **proposition** part de la plus ancienne année « première sortie » — jamais d'écriture automatique pour autant.
- **Pas de « consensus silencieux »** : l'ancienne heuristique (ambiguous ≤ 2 ans → min écrit en base) est supprimée, elle écrivait sans corroboration.
- **L'audit ne propose que sur signature de réédition** : on ne change une année que si une source « première sortie » annonce une année **antérieure** à celle écrite (1991 < 2024). Un désaccord sans cette signature (remix tardif : « Stompbox (Spor Remix) » écrit 2007, MB 2012) part en `a_revoir` **sans proposition** — la logique « le plus ancien = l'original » n'y tient pas.
- **Vue avant apply** : `--apply` est un dry-run par défaut ; `--yes` écrit. Rien n'est corrigé sans que la liste soit lisible d'abord.
- **Retour arrière réel** : `--undo` restaure `old` pour les corrections (et non « retire le frame ») — sans quoi une correction d'année aurait été irréversible.

## Commandes (re-collecte + audit)

```bash
# 1. Re-collecte moteur v2 (MB + Deezer + Discogs) — reprenable par tranches
./venv/bin/python scripts/collect_years.py --max-seconds=7200     # à relancer jusqu'à « a_traiter=0 »
./venv/bin/python scripts/collect_years.py --report               # found / single / conflict / ambiguous

# 2. 2ᵉ voix sur les clés NON RÉSOLUES (YouTube coûteux + recherche web)
./venv/bin/python scripts/collect_years.py --only=unresolved --youtube --max-seconds=3600

# 3. Écriture des années corroborées (dry-run par défaut)
./venv/bin/python scripts/apply_years.py [--apply]

# 4. Audit des années déjà écrites par les sources « édition »
./venv/bin/python scripts/audit_applied_years.py --limit 20          # contrôle
./venv/bin/python scripts/audit_applied_years.py                      # 408 (≈30 min)
./venv/bin/python scripts/audit_applied_years.py --report             # contredit / confirme / non_verifie
./venv/bin/python scripts/audit_applied_years.py --apply [--yes]      # corrections (journal = backup)
./venv/bin/python scripts/apply_years.py --undo                       # restaure old / retire les frames

# Diagnostic d'une clé (le cas Phantasia)
./venv/bin/python scripts/collect_years.py --probe='inner light|phantasia' --durs=337
```

Clé de recherche : `BRAVE_API_KEY` dans l'environnement, ou `data/search_token`
(`data/` est ignoré par git). Sans clé, la source web est simplement ignorée.

## Notes / Risques

- **File de revue** : la règle des 2 sources va faire passer beaucoup de clés en `single`/`conflict` (les 656 MB trouvés seuls, par ex.). C'est le prix de la décision ; l'ordre de grandeur est connu (~1 000 clés) et la revue humaine existante en a déjà soldé 692.
- **Coût de la re-collecte** : 3 providers par clé (~11 000 appels API, MusicBrainz à 1 req/s) → la passe est reprenable (`done_keys` + `--max-seconds`). Non lancée dans cette session.
- **Non couvert** : le cue editor et les autres passes de collecte (Beatport/YouTube) gardent leurs propres caches — leurs années passent maintenant par la même règle de corroboration au moment de l'écriture, mais leurs *clés* n'ont pas été recalculées avec les nouvelles orientations.
- **Non couvert** : les années fausses issues d'une source `first` (Discogs qui pointe une réédition) — le pipeline ne les détecte pas ; seul un futur contrôle « première sortie vs édition » global les verrait.
- **La recherche web ne remplace pas une source** : elle sert à *voir* une année plausible en revue (et à la donner à un humain), pas à écrire. Si tu veux qu'une réponse web puisse valider une année, c'est la revue humaine qui le fait (`year_review.json`), pas le moteur.
