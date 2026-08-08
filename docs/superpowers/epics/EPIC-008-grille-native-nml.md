# EPIC-008 — Grille native Traktor : TEMPO + TYPE=4/GRID exposés et appliqués (P1)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) §P1

## Objectif

Utiliser la **grille native déjà présente dans la collection** (21,8 % des 56 645 ENTRY — mesuré) au
lieu de la recalculer : BPM **et phase** (position du beat 1) exacts de Traktor, zéro analyse.

## Contexte & découvertes (mesures sur la collection réelle)

- L'hypothèse « Traktor 4 n'exporte ni BPM ni BEATGRID » (EPIC-006) était **fausse** — on cherchait le
  mauvais élément (`<BEATGRID>` a disparu).
- La donnée vit dans : `<TEMPO BPM="…" BPM_QUALITY="…">` (13 410) et
  `<CUE_V2 TYPE="4" START="…"><GRID BPM="…"/></CUE_V2>` (12 323) — **START = phase** (position du beat 1),
  **GRID BPM = tempo**. Reconstruction : `t_k = START + k × 60/BPM`.
- **76,3 % des pistes n'ont rien** (ni TEMPO ni TYPE=4, mesuré sur 56 645) → la cascade NML →
  détection client reste active pour elles.
- Valeurs aberrantes mesurées : BPM 1.0 / 17178 → garde de plausibilité nécessaire.

## Tâches

- [x] **`nml.py::get_beatgrid(entry)`** : parse TEMPO + TYPE=4/GRID → `{bpm, phase, quality}` ou None ;
      GRID autoritaire sur TEMPO ; `BPM_QUALITY < 50` rejetée (sauf GRID présent) — garde théorique :
      **BPM_QUALITY vaut toujours 100 sur la collection réelle**, elle ne se déclenche jamais en pratique
      mais reste une défense correcte ; **borne 20–400 BPM** (valeurs pourries 1.0–17178 mesurées).
- [x] **`app.py`** : `/api/track/match` expose `grid: {bpm, phase, quality}` par entrée.
- [x] **`cueEditor.ts`** : état `_phase` + `_gridSource` (`nml`|`detected`|`manual`) ; la grille native
      **pré-remplit le BPM et applique la phase** (`buildBeats(bpm, dur, phase)` — param `startAt`
      existant) → grille et snap **calés sur le rythme réel** ; détection client **ignorée** si native.
- [x] **Badge de source** (`#cue-bpm-badge`) : `NML` (verte) / `auto` (détectée) / `manuel` (saisie) ;
      saisie manuelle → phase remise à 0 + badge bascule.
- [x] **Fix review** :
  - **Snap protégé avant le beat 1** : un cue dessiné dans l'intro (avant la phase, ex. 10s quand le
    beat 1 est à 55s) ne saute **plus** au beat 1.
  - **Garde de plausibilité frontend** sur le BPM natif (20–400) en défense en profondeur.
  - **Reset complet à la fermeture** (champ BPM, phase, badge) — champ BPM vidé au destroy.
- [x] Tests : parseur native / rejet qualité / rejet BPM aberrant / GRID autoritaire malgré qualité
      basse ; match expose grid + None sans données ; badge NML ; phase au rendu (lignes décalées) et au
      snap ; pas de snap avant beat 1 ; badge manuel ; reset à la fermeture.

## Fichiers impactés

`nml.py` · `app.py` · `static/src/render/cueEditor.ts` · `static/src/render/cueEditor.test.ts` ·
`templates/index.html` · `static/style.css` · `test_nml.py` · `test_app.py`

## Validation

- Suite complète : **614 vitest** (+7) / **128 pytest** (+8) / typecheck 0 / lint 0 / build OK — suite
  stabilisée en `--sequence.shuffle` (voir rapport `2026-08-08-audit-epics-review.md` §3).
- Bundle servi vérifié (cache-buster).

## Traçabilité (commits)

> Commit : `24d67de` (`feat(beatgrid): grille native Traktor (TEMPO + CUE_V2 TYPE=4/GRID) exposée et
> appliquée — BPM + phase réels [EPIC-008]`).

## Décisions

- Phase NML = beat quelconque, pas forcément le downbeat de la mesure → grille juste, barres « 1 »
  potentiellement décalées d'un temps (acceptable pour le snap) — voir EPIC-010 pour le downbeat.
- Le seuil de plausibilité vit **côté backend** (source unique) + **défense frontend**.
