# EPIC-032 — Doublons à deux niveaux : exemplaires (même enregistrement) + versions (même morceau)

> **Statut** : 🟢 Livrée (`3faf049`)
> **Créée** : 2026-09-17 · **Dernière mise à jour** : 2026-09-17
> **Priorité** : Haute
> **Docs liées** : EPIC-028 (détection v1, durée ±2 s + nom ≥ 0,88) · EPIC-029 (vue groupes v2)

## Objectif

_La vue Doublons doit retrouver un même morceau même quand ses exemplaires portent des noms très
différents et des durées différentes (versions album/radio/extended), tout en préservant la garantie
de l'arbitrage : « perdants → _trash » ne s'applique qu'aux mêmes enregistrements._

## Contexte & découvertes

Exemple réel (collection utilisateur, 2026-09-17) : « Joey Beltram — Energy Flash » existe en 5
exemplaires que le moteur v1 (`buildVersionGroups`) ne réunit **pas**, car 2 conditions bloquent :

1. **Durée ±2 s** : 285 s (radio/original) vs 349-353 s (versions album) → jamais comparés.
2. **Similarité nom ≥ 0,88** : `02 - Joey Beltram - Energy Flash.mp3` vs
   `joey beltram - classics - 01 - energy flash (from 'beltram vol1' energy flash 1990).mp3`
   → token-set ~0,55 (album « classics » inséré, numéro de piste médian, parenthèses inconnues).

Prototype validé sur les **vraies données** (`data/cache.json`, 6 522 fichiers) :

- Passe 1 — clé exacte `(artiste, titre)` après parsing « artiste - titre » (segments splités sur
  ` - ` AVANT remplacement des séparateurs ; numéros de piste retirés ; parenthèses/crochets et
  tokens de bruit retirés) : 5 799 clés, **605 groupes ≥ 2 exemplaires** (~1 316 fichiers).
- Passe 2 — union-find sur **inclusion de tokens** (clé courte ⊆ clé longue, ≥ 2 tokens, artistes
  compatibles si les deux présents) : réunit `0602 joey beltram energy flash` + `joey beltram |
  energy flash` en **1 cluster de 5 exemplaires** ; attrape aussi les alias
  (`thomas p heckmann a k a drax` ⊕ `drax`), les hash suffixés (`… 3b0bedf8`), les collages
  underscore (`270_gamble_202 - spicy bred of charity`).
- Garde anti-faux positifs identifiée : tokens faibles (`a1/b1/untitled…` des vinylrips) ne doivent
  jamais porter seuls une inclusion ; artistes incompatibles ⇒ pas d'union.
- Découvertes bonus du corpus : 10 fichiers *sans* durée (dépassement `get_audio_meta` ?) et
  ~1 500 fichiers sans codec (extensions sans `--` : `.mp3` nu) — hors périmètre ici.

## Spécification fonctionnelle (validée par prototype)

**Deux niveaux de vérité :**

- **Même enregistrement** (moteur v1 inchangé, durée ±2 s + nom ≥ 0,88) : arbitrage qualité
  autorisé → perdants **rangés** proposés au `_trash`. Un seul gagnant affiché.
- **Versions du même morceau** (nouveau : réunis par la passe artiste/titre, durées libres) :
  affichés dans le même groupe mais **exclus de l'arbitrage** — pas de gagnant, pas de trash
  automatique, revue humaine uniquement (durées différentes = mixes différents).

## Tâches

- [x] Prototype de validation sur `data/cache.json` (rappel + revue d'échantillon)
- [x] `musicKey.ts` : parsing artiste/titre (segments, pistes, parenthèses, bruit) + tokens faibles
- [x] Tests `musicKey.test.ts` (cas réels : Energy Flash, Drax/Heckmann, garde untitled/a1)
- [x] `dupGroups.ts` : passe 2 union-find par inclusion de tokens + champ `sameRecording`
- [x] Tests `dupGroups.test.ts` : versions réunies sans trash (Energy Flash réel), garde artiste
- [x] `dupsUI.ts` : titre du groupe « N exemplaires · M versions » + liséré sur les versions
- [x] CSS : `.dup-version` (liséré discret)
- [x] Validation : typecheck + vitest (927/927, shuffle-stable) + pytest (190) + lint + build

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/musicKey.ts` | **Nouveau** — clé musicale (artiste, titre) + tokens, pur et testable |
| `static/src/musicKey.test.ts` | **Nouveau** — cas réels du prototype |
| `static/src/dupGroups.ts` | Passe 2 (union-find clés) + `sameRecording` par membre |
| `static/src/dupGroups.test.ts` | Nouveaux tests deux niveaux |
| `static/src/render/dupsUI.ts` | Affichage versions vs exemplaires |
| `static/style.css` | `.dup-version` |

## Validation

- [x] Typecheck (`npm run typecheck`)
- [x] Tests frontend (`npm test` — 927/927, 39 fichiers, `--sequence.shuffle` vert sur les 3 fichiers nouveaux/modifiés)
- [x] Tests backend (`./venv/bin/python -m pytest -q` — 190/190)
- [x] Lint (`npm run lint`)
- [x] Build (`npm run build` + validate-build)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `3faf049` | `feat(dups): EPIC-032 — matching à deux niveaux, versions d'un même morceau réunies, trash restreint aux mêmes enregistrements` |

## Décisions

- **D1 — Réutiliser l'union-find existant de `dupGroups.ts`** (pas de nouveau moteur) : la passe 2
  s'insère après la passe durée/nom, même structure de nœuds. Convention EPIC-031 : évoluer
  l'existant avant d'architecturer.
- **D2 — Sémantique unique fondée sur la durée relative au gagnant** : le gagnant est désigné via
  les **cohortes** passe A (les confirmées ≥ 2 membres priment sur les singletons — un FLAC isolé
  peut n'être qu'une autre version), puis `sameRecording` = durée ±2 s **du gagnant**. Cette
  définition aligne l'affichage, `losers` (candidats trash) et la garde d'`applyGroupPlan` — la
  version d'implémentation « cohortes = sameRecording » était incohérente (classics@351, Δ2 s du
  gagnant@353, aurait été affichée « version » mais trashée par la garde durée). Testée sur les 5
  Energy Flash réels.
- **D3 — Inclusion de tokens stricte + artistes compatibles + tokens faibles exclus** : la revue
  d'échantillon a montré que « untitled »/« a1 » seul ponte des vinylrips entiers ; l'inclusion
  pure sans garde artiste fusionnerait des titres homonymes d'artistes différents.
- **D4 — `sameRecording` dérivé de la durée au moment du choix du gagnant** (±2 s vs gagnant)
  plutôt que par énumération de paires : O(n) par groupe, déterministe, et sémantiquement exact
  (le trash ne vise que les doublons « même prise »).

## Notes / Risques

- Faux positifs restants possibles (morceaux homonymes d'artistes différents avec artiste absent
  des deux noms) — accepté : l'action destructive reste derrière confirmation + `_trash`.
- Le parsing « artiste - titre » suppose des noms bien formés ; les cas dégénérés tombent en
  clé `(None, nom)` et ne fusionnent que par inclusion stricte (≥ 2 tokens porteurs).
