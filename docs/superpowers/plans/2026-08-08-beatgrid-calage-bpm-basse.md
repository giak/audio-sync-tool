# Brainstorm — Beatgrid : calcul & affichage (défaut + à la demande) avec calage BPM / basse / rythme

> Statut : **brainstorm** (recherche web + mesures sur la collection réelle) — pas encore implémenté.
> Date : 2026-08-08 — Contexte : `audio-sync-tool`, éditeur cues/loops (wavesurfer v7), grille actuelle calculée depuis un BPM détecté/saisi, **phase supposée à t=0**.

---

## 1. Constat mesuré sur la collection réelle (56 752 ENTRY)

L'implémentation actuelle part du principe que « Traktor 4 n'exporte ni BPM ni BEATGRID ».
**C'est faux** — on cherchait le mauvais élément (`<BEATGRID>` n'existe plus ; la donnée est ailleurs). Mesures :

| Indicateur | Valeur |
|---|---|
| ENTRY total | 56 752 |
| Avec `<TEMPO BPM=… BPM_QUALITY=…>` | 13 410 (23,6 %) |
| Avec grille `<CUE_V2 TYPE="4" START=…><GRID BPM=…>` | 12 323 (21,7 %) |
| **Sans TEMPO ni GRID** (→ analyse nécessaire) | **43 342 (76,4 %)** |
| TEMPO mais sans GRID (BPM seul, phase manquante) | 1 087 |
| ENTRY avec >1 GRID | 0 (toujours 1) |
| Hors Factory Sounds, avec TEMPO / avec GRID | 13 021 / 11 947 → vraie donnée utilisateur, pas que des démos |
| BPM (garbage possible, ex. 1.0 / 17178) | min 1.0, max 17178, moyenne 317 (→ `BPM_QUALITY` indispensable) |
| START des TYPE=4 (offset du beat 1) | 0.0 → 30720 s (cohérent avec une phase en secondes) |

### Structure exacte trouvée dans la collection

```xml
<ENTRY … TITLE="In the Warehouse" ARTIST="Native Instruments">
  <LOCATION DIR="/:…/:Factory Sounds/:" FILE="….mp3" VOLUME="C:"></LOCATION>
  <INFO BITRATE="320000" PLAYCOUNT="2" PLAYTIME="132" PLAYTIME_FLOAT="131.81" FILESIZE="5243"></INFO>
  <TEMPO BPM="133.000000" BPM_QUALITY="100.000000"></TEMPO>
  <LOUDNESS PEAK_DB="-0.40" PERCEIVED_DB="0.00" ANALYZED_DB="1.20"></LOUDNESS>
  <MUSICAL_KEY VALUE="21"></MUSICAL_KEY>
  <!-- La grille : TYPE=4, HOTCUE=-1, START = position du beat 1 (phase) -->
  <CUE_V2 NAME="n.n." DISPL_ORDER="0" TYPE="4" START="55.387418" LEN="0.000000" REPEATS="-1" HOTCUE="-1">
    <GRID BPM="133.000000"></GRID>
  </CUE_V2>
  <CUE_V2 NAME="n.n." DISPL_ORDER="0" TYPE="0" START="55.387418" LEN="0" REPEATS="-1" HOTCUE="0" COLOR="#FFFFFF"></CUE_V2>
</ENTRY>
```

**Lecture** : `GRID BPM` = tempo, `CUE_V2[TYPE=4].START` = **phase** (position du premier beat dans le fichier). Ces deux valeurs reconstruisent la grille exacte de Traktor : `t_k = START + k × 60/BPM`. C'est *exactement* le « calage » demandé (BPM **+** phase), et il est déjà là pour ~22 % des pistes — **zéro analyse**.

⚠️ Le backend ne le parse pas : `get_cues()` filtre `TYPE ∈ {0,5}` et `write_cues()` **conserve** les autres types → la grille est préservée au round-trip, mais invisible pour l'app.

---

## 2. Le problème à résoudre

1. **76 % des pistes** n'ont aucune donnée BPM/grille dans la collection → il faut la **calculer**.
2. La détection actuelle (`beatgrid.ts`) est best-effort : enveloppe d'énergie mono + autocorrélation (comb 4 harmoniques) → **BPM seul**, **phase supposée à 0**. Or le calage réel (kick, downbeat) est rarement à t=0 → le snap cue/loop est décalé du rythme.
3. Pas de persistance : le BPM détecté est perdu à la fermeture, et rien n'est réécrit dans le NML (Traktor ne verrait pas la grille).

---

## 3. Trois sources de grille (par ordre de priorité — pipeline en cascade)

### A. Grille native du NML (coût : ~0, précision : 100 % Traktor)
- Parsing de `TEMPO` (avec `BPM_QUALITY` pour filtrer les valeurs pourries : qualité < ~50 → rejeter) et de `CUE_V2 TYPE=4` → `{bpm, phase}`.
- Endpoint existant `/api/track/match` → ajouter `bpm`/`phase`/`grid_quality` dans la réponse, affichés et utilisés directement par l'éditeur.
- **Priorité maximale :** si la grille existe, on l'utilise, on ne recalcule rien.

### B. Analyse serveur (Python) — le vrai calage basse/rythme
Le backend a déjà Flask + mutagen. Ajouter une analyse audio (une seule fois par piste, mise en cache) :

- **`librosa`** (numpy/scipy, déjà standard) : `librosa.beat.beat_track` → BPM + positions de beats par programmation dynamique (Ellis 2007). Bon tempo, **phase moyenne** (dérive possible), **pas de downbeat natif**.
- **`madmom`** `DBNDownBeatTracker` (Böck et al., RNN + DBN) : état de l'art pour **downbeat 1** et phase stable sur EDM/techno. Plus lourd (modèles), mais une passe par piste suffit.
- **`essentia`** (Python) `RhythmExtractor2013` : BPM + beats + confiance, très précis.
- **Pipeline DSP maison léger** (sans grosse dépendance, voir §4) : filtrage kick 40–150 Hz → ODF → autocorrélation → **scan de phase**.

### C. Détection client (WebAudio) — fallback temps réel
Déjà en place (`detectBPMFromUrl`). À **améliorer** pour ajouter la phase (cf. §4). Intérêts : aucune dépendance serveur, instantané, fonctionne aussi pour la prévisualisation avant ajout à la collection.

**Cascade recommandée :** grille NML → analyse serveur (cache) → détection client → saisie manuelle (champ BPM existant + nouveau contrôle de phase).

---

## 4. Le calage BPM / basse / rythme — recherche web (l'essentiel)

Objectif : pas seulement « quel BPM », mais **où tombe le kick / le beat 1**. Constats de la recherche :

### 4.1 Le kick est l'ancre rythmique (EDM/techno 4/4)
- **Filtre passe-bande 40–150 Hz** (Butterworth ordre 2–4) : isole le « thump » du kick, élimine hats/voix/synths qui polluent la détection. C'est LE point clé pour un calage stable sur la basse.
- Frame 2048 / hop 512 (~46 ms / 11.6 ms à 44.1 kHz) → RMS par frame → **ODF** = `max(0, RMS[n] − RMS[n−1])` (flux d'énergie demi-onde rectifiée).
- Peak picking à **seuil adaptatif local** (moyenne glissante × δ ∈ [1.3, 1.5]) pour éviter les faux onsets.
- En 4/4, le kick est isochrone → pic d'autocorrélation massif à la période de la noire → **BPM robuste**, et la **phase** = l'offset qui maximise l'énergie ODF alignée sur la grille : `φ_opt = argmax_φ Σ_k ODF(φ + k·T)` (scan de φ ∈ [0, T], pas ~5 ms).

### 4.2 Downbeat (beat 1 de la mesure) vs phase (beat quelconque)
- **Phase** : aligner la grille sur *un* beat (suffit pour le snap des cues/loops).
- **Downbeat** : identifier *le premier temps de la mesure* — plus difficile (ambigüité de décalage 1/4). `madmom` le fait nativement (RNN entraîné) ; `librosa.beat.beat_track` non ; `web-audio-beat-detector.guess()` renvoie BPM + offset du premier beat sans notion de mesure.
- Pour le snap de cues/loops, la **phase** suffit. Le downbeat n'est utile que pour l'affichage des barres numérotées (confort).

### 4.3 Bibliothèques JS comparées (2024–2026)

| Lib | Précision EDM | Poids | Statut | Sortie |
|---|---|---|---|---|
| **`web-audio-beat-detector`** | Haute (4/4) | Tiny (pur JS, zéro WASM) | Actif | **BPM + offset 1er beat** via `.guess()` |
| `aubio.js` | Moyenne-haute | Lourd (WASM 1–3 Mo) | Sporadique | BPM + beats |
| `essentia.js` | Très haute | Très lourd (Mo) | Actif (MTG/UPF) | BPM + beats + downbeats + confiance |
| `Meyda` | — (features seulement) | Petit | Actif | spectralFlux/RMS par frame (briques) |
| `soundstretch.js` / `Tone.js` | N/A (pas détecteurs) | — | Actif | manipulation / transport, pas d'analyse |

**Synthèse** : côté client, `web-audio-beat-detector` est le meilleur rapport qualité/poids pour BPM+phase ; `essentia.js` est l'option « très précise » si on accepte le poids ; le DSP maison (§4.1) reste pertinent pour la transparence et zéro dépendance. Côté serveur, `madmom` (downbeat) > `librosa` (tempo/phase) > `essentia`.

---

## 5. Affichage de la grille (éditeur)

Actuel : lignes verticales `buildBeats(bpm, durée)`, tous les 4 temps renforcées, `left = t/durée × 100%`.

**Améliorations proposées :**
1. **Phase appliquée** : `buildBeats(bpm, durée, phase)` (déjà supporté par le param `startAt` !) — la grille se cale enfin sur le rythme réel.
2. **Numéros de barre** (1, 2, 3…) tous les 4 temps, en tête de grille — repérage immédiat.
3. **Bande d'énergie basse** sous la waveform (mini-strip du RMS filtré 40–150 Hz) : visualise le kick, aide à valider/corriger le calage à l'œil.
4. **Contrôle de phase manuel** : boutons « ← 1/4 » / « → 1/4 » (décalage d'un quart de beat) à côté du champ BPM — l'utilisateur ajuste le calage si l'auto-détection dérape d'une noire. (Alternative plus élégante : clic sur la waveform = « poser le beat 1 ici ».)
5. **Badge de source** : `NML` (native) / `détecté` (serveur/client) / `manuel` + qualité (`BPM_QUALITY` si présente) — transparence sur la fiabilité.
6. **Bouton « 🔍 Analyser » (à la demande)** : déclenche la détection phase+basse explicitement, avec état « ⏳ analyse… », en plus de l'auto-détection au ready.

---

## 6. Persistance — options

| Option | Effort | Gain |
|---|---|---|
| **6a. Cache app** (`data/cache.json`, clé `FILE+FILESIZE`) : {bpm, phase, source} | Faible | Recalcul évité entre sessions ; indépendant de Traktor |
| **6b. Écriture dans le NML** : ajouter/updater `TEMPO` + `CUE_V2 TYPE=4` + `<GRID BPM=…>` (via `append`/`write` existants, avec `.bak`) | Moyen | **Traktor lui-même afficherait la grille** — le graal : le DJ voit ses pistes calées dans Traktor ; et l'app n'analyse plus jamais ces pistes |
| 6c. Les deux (cache + NML) | Moyen+ | Recommandé à terme |

⚠️ **Risque 6b** : Traktor régénère son analyse (et peut écraser) au prochain scan complet ; `BPM_QUALITY` doit être cohérent. À valider sur une copie de collection avant d'activer.

---

## 7. Scénarios d'usage

- **Défaut (à l'ouverture)** : grille NML si présente → sinon analyse serveur en cache (si disponible) → sinon détection client légère → phase = 0 + badge « manuel » en dernier recours. Jamais bloquant.
- **À la demande** : bouton « Analyser (basse/phase) » pour (re)calculer avec le pipeline kick, ou ajustement manuel de phase.
- **Correction manuelle** : champ BPM + nudge de phase + « poser beat 1 » → marque la grille comme « manuelle » dans le cache (surpuissance).

---

## 8. Recommandation & découpage (phases)

1. **P1 (rapide, gros gain)** : parser `TEMPO` + `CUE_V2 TYPE=4`/`GRID` côté backend → exposer `{bpm, phase, quality}` dans `/api/track/match` et `/api/nml/status` ; l'éditeur applique la phase dans `buildBeats`. + badge de source. → ~22 % des pistes calées sans aucun calcul.
2. **P2** : contrôle de phase manuel (nudge + « poser beat 1 ») + cache `{bpm, phase, source}` par piste.
3. **P3** : analyse serveur kick/phase (librosa d'abord ; madmom si le downbeat devient utile) avec cache + bouton « Analyser » à la demande.
4. **P4 (optionnel, le graal)** : écriture `TEMPO`+`TYPE=4` dans le NML (test sur copie) → la grille survit dans Traktor.
5. **P5 (optionnel)** : bande d'énergie basse + numéros de barre.

**Coût estimé** : P1 ≈ une demi-journée (backend + frontend + tests) ; P2 ≈ une demi-journée ; P3 ≈ 1–2 jours ; P4 ≈ 1 jour + validation sur copie réelle.

---

## 9. Risques & limites

- `BPM_QUALITY` basse / valeurs aberrantes (1.0, 17178) → seuil de confiance avant d'utiliser `TEMPO`.
- Phase NML = beat quelconque, pas forcément le downbeat de la mesure → la grille est juste mais les barres « 1 » peuvent être décalées d'un temps (acceptable pour le snap).
- Pistes sans kick 4/4 (breakbeat, ambiant, classique) : détection kick moins fiable → repli sur le flux spectral large bande + BPM manuel.
- Analyse serveur : dépendances (numpy/scipy/librosa) à documenter dans l'install ; temps de calcul à limiter (premières 60–90 s de la piste suffisent pour BPM+phase).
- Gros fichiers de décodage côté client : `decodeAudioData` entier en mémoire — acceptable en one-shot, à garder hors du chemin critique.

---

## 10. Sources (recherche web)

- `web-audio-beat-detector` (chrisguttandin) — BPM + offset premier beat via `.guess()`, pur WebAudio.
- `aubio.js` / `essentia.js` (MTG-UPF) — ports WASM, sorties beats/downbeats.
- `Meyda`, `soundstretch.js`, `Tone.js` — briques / non-détecteurs.
- `librosa.beat.beat_track` (Ellis 2007, DP) — tempo + beats, pas de downbeat natif.
- `madmom` `DBNDownBeatTracker` (Böck et al.) — RNN + DBN, downbeat 1 natif, robuste EDM.
- Pipeline kick 40–150 Hz + ODF + seuil adaptatif + scan de phase (DSP standard, paramètres : frame 2048/hop 512, δ 1.3–1.5, scan φ pas 5 ms).
