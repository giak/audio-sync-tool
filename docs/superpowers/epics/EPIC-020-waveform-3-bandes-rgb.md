# EPIC-020 — Waveform 3-bandes RGB complète (low/mid/high, standard DJ)

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Moyenne (P1-4 du benchmark — la 2e moitié de l'EPIC-018, « étape 1 »)
> **Docs liées** : [rapport benchmark](2026-08-08-waveform-cue-beatgrid-benchmark.md) §P1-4

## Objectif

Compléter la **waveform 3-bandes RGB** (étape 1 de l'EPIC-018 : bande basse rouge) :
rendre les 3 bandes **low / mid / high** séparément — rouge / vert / bleu — le standard
spectral de lisibilité de Serato, rekordbox, Traktor et Engine DJ. L'utilisateur doit
pouvoir distinguer d'un coup d'œil le kick (rouge), les voix (vert) et les hats/cymbales
(bleu), et repérer les sections (breakdown sans kick, drop, etc.).

## Découverte forensique (point de blocage clé)

Le biquad RBJ bandpass existant (pipeline EPIC-012) **ne suffit pas** pour séparer 3
bandes : avec les Q imposés par des bandes larges (Q = f0/(fHi-fLo) ≈ 0,3–0,7), la
réponse mesurée laisse fuir 20–35 % du hors-bande proche :

| Signal | Bande low (40-150) | Bande mid (150-2000) | Bande high (2-16k) |
|---|---|---|---|
| kick 60 Hz | 0.94 (OK) | **0.35** (fuite) | 0.03 |
| voix 500 Hz | **0.22** (fuite) | 1.0 (OK) | **0.20** (fuite) |
| hat 8 kHz | 0.01 | **0.20** (fuite) | 0.95 (OK) |

→ Une cascade d'ordre 8 (4 passes) serait nécessaire pour descendre sous 2 % sur tous
les cas, à un coût CPU prohibitif sur les longues pistes (4 passes × signal complet).
**Décision** : `computeRGBBands` utilise une **FFT par fenêtre** (Hann 4096, 3 fenêtres
réparties par barre) — la séparation par bins est quasi parfaite (résidu ~-60 dB), et le
coût est d'un ordre de grandeur inférieur. `computeBassBand` (EPIC-012) est **conservé
tel quel** (API validée, port conforme du serveur) — deux méthodes complémentaires,
documentées dans `bands.ts`.

## Tâches

- [x] `static/src/bassband.ts` → `static/src/bands.ts` (renommage git) : le module devient
      un analyseur spectral. `computeBassBand` conservé à l'identique (EPIC-012) ;
      `computeRGBBands` ajouté (FFT fenêtrée) + constante `RGB_BANDS` + type `RGBBands`
- [x] Normalisation **par bande** (chaque bande montre sa propre dynamique — une piste
      kick-lourd garde une bande high lisible) + **garde anti-faux-signal** : une bande
      dont le max < 2 % du max global des 3 est considérée vide (résidu spectral) → 0
- [x] `cueEditor.ts` : `_rgbBands` remplace `_bassBand` ; `loadRGBBands`/`renderRGBBands`
      (calcul différé setTimeout(0), best-effort, reset au render/destroy — pattern EPIC-012)
- [x] Rendu **3 couches superposées** `#cue-editor-rgbband` → `.rgb-layer.rgb-low|mid|high`
      avec `mix-blend-mode: screen` : mélange additif RGB (kick+voix = jaune, tout = blanc)
- [x] `static/style.css` : couleurs standard (rouge basse / vert médium / bleu aigu,
      dégradés), `#cue-editor-waveform.zoomed #cue-editor-rgbband { display: none }`
      (masquage en zoom conservé, EPIC-017), z-index sous la grille (1 < 2 < 5)
- [x] Tests `bands.test.ts` (renommé) : 7 tests RGB (trop court, silence, kick→low,
      voix→mid, hats→high, normalisation indépendante, barCount) + 6 tests compat EPIC-012
- [x] Tests `cueEditor.test.ts` : mise à jour EPIC-012/018 (id `rgbband`, 3 couches × 160
      barres, title « 3-bandes », masquage zoom, reset lifecycle) + 3 tests EPIC-020
      (3 couches distinctes, dominance low pendant les kicks vs high pendant les hats
      sur un buffer 3 segments 60 Hz/500 Hz/8 kHz, reset)

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `static/src/bands.ts` (ex `bassband.ts`) | analyse spectrale : biquad (EPIC-012, conservé) + FFT 3-bandes |
| `static/src/render/cueEditor.ts` | `_rgbBands`, `loadRGBBands`/`renderRGBBands`, resets, appel différé |
| `static/style.css` | bande RGB 3 couches (screen-blend), masquage zoom |
| `static/src/bands.test.ts` (ex `bassband.test.ts`) | tests RGB + compat EPIC-012 |
| `static/src/render/cueEditor.test.ts` | mise à jour EPIC-012/018 + tests EPIC-020 |
| `docs/superpowers/epics/EPIC-020-waveform-3-bandes-rgb.md` | cette EPIC |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npx vitest run --sequence.shuffle`) — ✓
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Tests ciblés : `bands.test.ts` + `cueEditor.test.ts` — 127 ✓
- [x] Mesure empirique de la réponse du biquad (script jetable) : justification du choix FFT
      documentée dans cette EPIC (tableau des fuites ci-dessus)
- [x] Smoke test navigateur (collection réelle, profil travail) : bande RGB visible sur une
      vraie piste (techno_2020) — `#cue-editor-rgbband` avec 3 couches distinctes
      (rouge/vert/bleu), **zéro erreur console**

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat(ui): EPIC-020 — waveform 3-bandes RGB (low/mid/high, standard DJ)` |

## Décisions (KISS, vérité forensique)

- **FFT par fenêtre pour les 3 bandes, biquad conservé pour la bande basse** : la cascade
  biquad d'ordre 8 nécessaire pour séparer proprement 3 bandes coûterait 4× plus cher que
  la FFT (mesuré : fuites 20-35 % à l'ordre 2, besoin de l'ordre 8 pour < 2 %). Ne pas
  casser une API validée (EPIC-012) pour un rendu qui n'en a pas besoin.
- **Normalisation par bande** (dynamique propre à chaque bande) plutôt que globale : une
  piste kick-lourd doit montrer ses hats, pas les écraser. La garde à 2 % du max global
  élimine le faux signal (résidu spectral d'une bande réellement absente).
- **`mix-blend-mode: screen`** plutôt que l'empilement d'opacités : mélange additif natif,
  le rendu exact des DJ softs (kick seul = rouge, kick+voix = jaune, tout = blanc).
- Renommage `bassband.ts` → `bands.ts` via `git mv` : le fichier n'est plus une « bande
  basse », garde l'historique git.

## Notes / Risques

- Coût du calcul : 160 barres × 3 fenêtres × FFT 4096 ≈ 480 FFT par piste, différées en
  `setTimeout(0)` (aucun blocage du rendu). Bien inférieur à la cascade biquad équivalente.
- Le rendu RGB est une **bande d'énergie** sous la waveform (héritage EPIC-012), pas une
  recoloration de la forme d'onde elle-même — c'est le choix documenté depuis l'EPIC-018
  (80 % du bénéfice pour 20 % du coût). La recoloration de la forme d'onde principale
  resterait une évolution possible, non prioritaire.
- **Fidélité temporelle** : 3 fenêtres FFT réparties (0.25/0.5/0.75) couvrent ~25 % du
  segment temporel d'une barre (3 × 93 ms sur ~1,1 s de barre en vraie piste) — un
  événement très court isolé peut passer entre deux fenêtres. Acceptable pour une
  visualisation de prep (les kicks sont réguliers en 4/4, l'énergie est moyennée sur la
  piste), et bien moins coûteux que le balayage complet du biquad EPIC-012. À garder en
  tête si une fidélité temporelle au kick près devenait nécessaire.
- **Rendu visuel** : `mix-blend-mode: screen` mélange les 3 couches avec le canvas
  wavesurfer — validé par un smoke-test navigateur (non couvert par les tests unitaires,
  qui vérifient la structure DOM et les valeurs).
- La bande RGB est masquée en zoom (elle couvre toute la piste en absolu) — comportement
  EPIC-017 conservé.
- `computeBassBand` et `computeRGBBands` coexistent : la 1re est le port client du serveur
  (analysis.py), la 2e l'analyse spectrale client. Les bornes de bandes sont partagées via
  `RGB_BANDS` (40-150 / 150-2000 / 2000-16000 Hz, conventions DJ).
