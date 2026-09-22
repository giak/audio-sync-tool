# Spec — Années corroborées & audit des années déjà écrites (EPIC-040)

> Décisions utilisateur du 2026-09-21 : (1) pipeline **et** audit des 408 années Deezer
> déjà écrites ; (2) **2 sources concordantes exigées, sinon revue — rien n'est écrit**.
> Cas fondateur : Phantasia « Inner Light » (1991, R&S) écrit **2024** (album « Ooo »).
> Mémoire du fait : MnemoLite `a4494da3` (`status:CONFIRME`).

## 1. La chaîne de défaillance (prouvée, pas supposée)

```
nom de fichier ──► artist_title()  ──► clé (artiste, titre)
   « Inner Light - Phantasia.mp3 »        ('inner light', 'phantasia')   ← INVERSÉ
        │
        ├─ MusicBrainz : garde tokens → rien (le morceau est de Phantasia, pas d'Inner Light)
        └─ Deezer      : AUCUNE garde  → 'Phantasia — Inner Light (Out of Orbit Remix)'
                          durée 322 s vs fichier 335 s (±15 s) → ACCEPTÉ
                          release_date de l'album « Ooo » = 2024-01-15
                                   │
                                   ▼
                       status=found, year=2024  ──►  TDRC écrit dans l'ID3
                                   │
                    (aucune 2ᵉ source, aucune remise en cause possible)
                                   ▼
              rangement EPIC-035 : tranche calculée depuis 2024 → techno_2020
```

Trois défauts indépendants, tous nécessaires au résultat :

| # | Défaut | Preuve locale |
|---|---|---|
| 1 | L'ordre artiste/titre est deviné depuis le nom | clé `'inner light\tphantasia'` dans `year_cache.jsonl` |
| 2 | Deezer sans garde artiste/titre (durée seule, inopérante sans durée connue) | `dz_lookup()` v1 : un seul `if durs and …` |
| 3 | `release_date` d'album (réédition) traité comme l'année du morceau | album « Ooo » 2024-01-15 vs 1991 |

Conséquence mesurée : 408 écritures Deezer, **173 ≥ 2015 (42,4 %)** — contre 12,0 % pour
MusicBrainz, 5,9 % pour la revue humaine, 2,7 % pour le consensus. Deezer est l'aberrant.

## 2. Règle de décision

```
votes[key] = { provider: année }        provider ∈ {musicbrainz, discogs, deezer, itunes, …}

trouvé  ⟺  |années distinctes(votes)| == 1  ET  |providers| ≥ 2
sinon   →  single | conflict | ambiguous | none   →  REVUE (aucune écriture)
```

Deux propriétés qui portent tout le reste :

- **Indépendance** : `reform` et `reform2` sont des requêtes **Discogs** → une seule voix
  (`PROVIDER`). Sinon deux appels du même site se « corroborent » tout seuls.
- **Sémantique** : MB (`first-release-date`) et Discogs = classe `first` ; Deezer, iTunes,
  Beatport, YouTube = classe `edition` (date de l'édition matchée). En cas de désaccord, la
  **proposition** prend la plus ancienne année `first` — mais elle n'est **jamais** écrite
  automatiquement : c'est la revue qui tranche.

### Orientations de clé

```
key_variants(a, t, alt) = [ alt,            # tags du fichier (les seuls qui ne devinent pas)
                            (a, t),         # lecture du nom
                            (t, a) ]        # nom inversé (exige un artiste)
```
La **garde tokens** est l'arbitre : une orientation qui ne produit que des candidats
rejetés par la garde ne conclut pas, la suivante est essayée. C'est ce qui rend la collecte
insensible à la convention de nommage — et ce qui a fait passer la clé Phantasia de
'inverse' (jamais détecté avant) à `variant: inverse` explicite.

### Garde par source

| Source | artiste | titre | durée |
|---|---|---|---|
| MusicBrainz | tokens | tokens | ±15 s (si durée connue) |
| Discogs | tokens + durée (strict) | ✅ | ±15 s |
| **Deezer** | **tokens (EPIC-040)** | **tokens (EPIC-040)** | ±15 s (si durée connue) |

## 3. Ce qui change dans les données

- `year_cache.jsonl` : enregistrements **`v: 2`** (le v1 est ignoré par `done_keys()` et
  par `load_votes()` → les clés seront re-collectées ; dernier gagnant par clé).
- Champs ajoutés au record : `sources` (votes nommés), `classes`, `candidates`,
  `proposed`, `variant`, `n_sources`, `evidence` (album + `release_date` Deezer).
- `apply_years.py` : `load_found()` = clés corroborées uniquement. Les choix humains
  (`--review`) restent un **override** et valent à eux seuls.
- `--undo` distingue désormais deux cas : écriture **additive** (`old = null`) → retrait du
  frame ; écriture de **correction** (`old` renseigné) → **restauration** de l'ancienne année.

## 4. Audit des années déjà écrites (`scripts/audit_applied_years.py`)

```
journal (source ∈ {deezer, itunes, …})            # 408 écritures Deezer
   └─ pour chaque fichier : clé = tags du fichier sinon nom
        └─ moteur corrigé (MB + Deezer + Discogs) ──► classement :
              confirme     l'année écrite ∈ votes d'une source « première sortie »
              contredit    une source « première sortie » annonce PLUS ANCIEN
              a_revoir     désaccord sans signature de réédition (remix tardif)
              non_verifie  aucune source « première sortie » (Deezer seul, ou rien)
```

- **Lecture seule par défaut** : rapport console + `data/year_audit.json`.
- `--apply` = dry-run ; `--apply --yes` écrit **les seuls `contredit`** (journal `old → new`
  ⇒ `apply_years.py --undo` restaure).
- Reprenable : `--limit`, `--match=<substring>`, sauvegarde toutes les 25 entrées.
- Pourquoi `a_revoir` sans proposition : sur « Stompbox - The Qemists (Spor Remix) »
  (écrit 2007 par Deezer, MusicBrainz 2012), « le plus ancien = l'original » est faux — il
  s'agit du remix, plus tardif. On ne touche pas : on signale.

## 5. Tests (verrouillages)

| Test | Ce qu'il empêche |
|---|---|
| `test_regression_phantasia_2024_ne_conclut_pas` | Le retour du `found` 2024 : exige `conflict`, `year is None`, `proposed == '1991'`, `variant == 'inverse'` |
| `test_deezer_rejette_un_meme_titre_autre_artiste` | Homonyme de titre (la garde artiste seule le refuse) |
| `test_deezer_accepte_et_garde_l_album` | La perte de la trace de réédition (`album` + `release_date`) |
| `test_une_seule_source_ne_conclut_pas` | La règle des 2 sources côté moteur |
| `test_pools_comptent_une_voix_par_provider` | La fausse corroboration reform↔reform2 |
| `test_load_found_exige_deux_providers` | L'écriture sur une source unique côté `apply_years` |
| `test_undo_restaure_une_correction` | L'irréversibilité des corrections d'année |
| `test_done_keys_ignore_le_moteur_v1` | Le blocage de la re-collecte par les vieux records |

Sensibilité prouvée par **mutation** : neutraliser la règle des 2 sources fait échouer le
test de régression ; retirer la garde artiste Deezer fait échouer le test d'homonyme.

## 6. Reste à faire (tracé, non fait)

1. **Re-collecte complète** en moteur v2 (3 providers × ~3 700 clés ; MB à 1 req/s →
   reprenable via `done_keys`/`--max-seconds`).
2. **Exposition en revue** : servir `single`/`conflict` (collecteur) et
   `contredit`/`a_revoir`/`non_verifie` (audit) dans la vue Années existante, avec la
   proposition pré-remplie — la route et le rendu restent à câbler.
3. **Audit complet des 408** : le script est prêt, l'échantillon (`--match=phantasia`,
   `--limit 6`) l'a validé.
