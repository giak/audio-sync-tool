# Rapport — Waveform, cue, loop, beatgrid : benchmark vs les meilleurs outils DJ (2024-2026)

> **Date** : 2026-08-08 · **Type** : brainstorm / benchmark · **Périmètre** : l'éditeur waveform
> (modal cue editor) de l'outil audio-sync-tool, comparé aux logiciels et matériels DJ de
> référence. Objectif : identifier ce qui fait la différence, ce qui nous manque, et prioriser
> des évolutions pragmatiques (KISS, pas d'usine à gaz).
>
> **Outils de référence étudiés** : Traktor Pro 4 (Native Instruments), rekordbox 7 + CDJ-3000
> (Pioneer/AlphaTheta), Serato DJ Pro 3.x, Engine DJ / SC6000 (Denon DJ), Mixxx (open source),
> djay Pro AI (Algoriddim), VirtualDJ 2026, Mixed In Key 11.
>
> **Recherche** : sources web 2024-2026 (blogs officiels NI, manuels Pioneer/Denon, docs Serato,
> docs Mixxx, avis DJ). Les citations notables sont référencées en cours de texte.

---

## 1. Contexte : quelle est la vraie nature de notre outil ?

Avant de comparer, une clarification honnête et structurante : **notre outil n'est pas un
logiciel de DJing live**, c'est un **outil de préparation** (prep) intégré à Traktor :

- il lit et écrit **directement le `collection.nml`** de Traktor (cues, loops, grille TYPE=4/GRID,
  TEMPO, DISPL_ORDER, backup automatique) — aucun import/export aller-retour ;
- il fait de l'**analyse serveur** (BPM/kick/phase, DSP maison) ;
- il affiche les **badges de match NML** dans la playlist (EPIC-016).

Cette nature change radicalement le barème de comparaison :

| Type de fonction | Logiciels DJ live | Notre outil (prep) |
|---|---|---|
| Synchro multi-deck, master, beatmatch | 💎 cœur de métier | hors sujet |
| Stems temps réel, effets, sampler | 💎 cœur de métier | hors sujet (YAGNI) |
| **Édition de grille (BPM/phase/downbeat)** | 🟢 présente | 🟢 **présente** (cœur) |
| **Préparation de cues/loops enregistrés** | 🟢 présente | 🟢 **présente** (cœur) |
| **Lisibilité de la waveform** | 🟢 poussée | 🟡 partielle |
| **Intégration au fichier de collection** | ⚪ via export | 🟢 **directe (différenciateur)** |

**Le différenciateur de notre outil n'est pas d'imiter un CDJ, c'est la fidélité au NML.**
Toute évolution doit être jugée par cette question : *« est-ce que ça aide à préparer une piste
pour la jouer dans Traktor ? »*

---

## 2. L'existant (inventaire précis, vérifié dans le code)

Modal cue editor (`static/src/render/cueEditor.ts`, wavesurfer.js + plugin Regions) :

**Beatgrid**
- BPM affiché (grille native Traktor **ou** détection serveur), champ BPM éditables ;
- nudge de phase ←/→ ±¼ temps ; mode « ◎ Beat 1 » (définir la phase/downbeat) ;
- « 🔍 Analyser » → analyse serveur kick/phase (`analysis.py`, filtre 40–150 Hz, ODF +
  autocorrélation, scan de phase) → badge « auto · % » ;
- « 💾 Grille » → écriture NML (`TEMPO` + `CUE_V2 TYPE=4 AutoGrid` + `GRID`, 6 décimales,
  idempotent, backup + journal) ;
- snap au beat (grille native ou BPM saisi) pour le placement de cues/loops ;
- bande d'énergie basse 40–150 Hz (client) + **numéros de barre** tous les 4 beats.

**Cues / loops**
- 8 slots hotcue A–H, couleurs, clic → pose d'un cue à la position courante ;
- boucles : mode dessin « ⟳ Loop » (drag sur la waveform), lecture de boucle « ▶ Loop » ;
- sauvegarde `POST /api/track/cues` avec **DISPL_ORDER préservé** (round-trip) ;
- suppression de la région sous le curseur (Delete/Backspace) ;
- multi-match (homonymes) : sélecteur d'entrée NML.

**UX / navigation**
- play/pause (espace), ←/→ ±5 s, plein écran, modal focus-trappée (EPIC-014) ;
- « Ajouter à la collection » si la piste est absente du NML (badge playlist rafraîchi).

**Absents aujourd'hui (vérifié)** : pas de contrôle de zoom, pas de waveform 3-bandes RGB,
pas de minimap/needle, pas de raccourcis de pose de cue (C/1-8), pas de renommage de cue dans
l'UI, pas d'undo, pas de grille flexible multi-marqueurs, pas de phase meter visuel.

---

## 3. Benchmark par domaine

### 3.1 Beatgrid — l'état de l'art

**Traktor Pro 4** (sorti mi-2024, enrichi 2025-2026) a livré ce que la communauté attendait :
les **Flexible Beatgrids** — des *Grid Markers* multiples qui épousent les variations de tempo
(décisif pour le disco/funk/live, moins pour la techno 4/4 fixe). Le workflow d'édition reste
classique : onglet GRID, métronome, « Move Grid BWD/FWD », calage du downbeat sur la grosse
caisse, zoom waveform détaillée. Le **Phase Meter** (barre d'alignement de phase) est activable
sous la waveform. Côté fichier : la grille est une `CUE_V2 TYPE=4` avec enfant `GRID` — **c'est
exactement le format que nous écrivons** (EPIC-011), validé sur la collection réelle.

**rekordbox / CDJ-3000** : mode *Grid Edit* dédié — ajustement du downbeat, correction BPM
(fixe ou dynamique), *drag individual beat*, moitié/double tempo, Key Lock. Sur CDJ-3000,
l'édition de grille se fait au **hardware** (jog + boutons) et se sauvegarde sur la clé USB.
L'IA de rekordbox 7 analyse la position des **vocaux** et crée des *Intelligent Cues*.

**Serato DJ Pro** : éditeur *Edit Grid* (ALT+Espace) avec grilles flexibles via **Red Set
Markers**, *Grid Adjust* (étirer/contracter depuis le dernier marqueur), *Set Grid from Here*,
*Reset*. Raccourcis clavier complets.

**Denon / Engine DJ (SC6000, Prime 4+)** : le cas le plus proche de notre positionnement —
l'édition se fait **sur l'écran tactile du matériel**, plein écran : déplacement du downbeat,
points d'ancrage multiples (grilles dynamiques multi-tempo), **BPM par pavé numérique ou TAP
tempo**, verrouillage (*Lock*) de la grille, boucles *Active Loops* (déclenchées quand la tête
de lecture entre dans la région).

**Mixxx / djay / VirtualDJ** : Mixxx (open source) — détection BPM très fiable en 4/4, options
*constant tempo* et *offset correction*, ajustement par stretch/compress. djay Pro AI — *Fluid
Beatgrid* dynamique, tap tempo, downbeat. VirtualDJ 2026 — *Fluid Grids* + *BPM Stabilizer*.
**Tendance 2026 claire : les grilles flexibles/dynamiques sont devenues le standard**, y compris
chez Traktor (le 4/4 fixe reste le cas nominal de la techno).

### 3.2 Cues & loops

- **Hot cues** : 8 partout (Traktor, rekordbox, Serato, Denon) — c'est **notre modèle** (slots
  A–H) ✅.
- **Memory cues** (rekordbox) : repères non déclenchables, pour structurer/naviguer. Traktor n'a
  pas l'équivalent natif (ses repères sont des hotcues ou le marqueur de chargement) — **à
  écarter pour nous** (corrélation Traktor, YAGNI).
- **Loops** : manuel + auto (1/2 → 32 temps) partout ; **Loop Divide** (÷2, ÷4 en live) et
  **Loop Roll** (bégaiement temporaire) côté rekordbox/Serato ; **Autoloop presets** côté
  Traktor ; **Smart Loops / Active Loops** côté Denon. → Pour un outil de **prep**, seule la
  **création et la sauvegarde de boucles** comptent (nous l'avons ✅) ; divide/roll/autoloop sont
  des fonctions de **performance**, hors périmètre.
- **Quantize** (rekordbox) : aligne les actions live sur la grille — équivalent prep = notre
  **snap au beat** ✅.

### 3.3 Waveform & visualisation (le plus gros écart)

C'est ici que l'écart avec l'état de l'art est le plus net :

| Fonction | Standard pro (2026) | Nous |
|---|---|---|
| Couleurs **3-bandes RGB** (basse=rouge, médium=vert, aigu=bleu) | 💎 standard absolu (Serato, rekordbox, Engine 5.0, Traktor) | ❌ waveform monochrome |
| **Zoom** (paliers, « 1 beat view », +/−) | 💎 indispensable pour l'édition de grille | ❌ aucun contrôle |
| **Minimap / overview / needle search** | 🟢 (Serato overview, rekordbox stack/needle) | ❌ pas de vue d'ensemble |
| Numéros de barre / downbeats différenciés | 🟢 (lignes fines/épaisses, 1,5,9…) | 🟡 barres ✅, downbeat non différencié |
| Bande d'énergie basse | ⚪ (rare) | 🟢 (atout, utile prep) |
| Phase meter | 🟢 (Traktor, CDJ-3000, Engine) | ❌ (le nudge existe, pas de visuel) |

Le zoom est décrit par tous les éditeurs pro comme **la** fonction d'édition de grille
(« zoom 1 beat pour aligner le downbeat sur le transitoire du kick »). Notre absence de zoom
est donc le manque le plus pénalisant pour la fonction cœur (calage BPM/phase).

### 3.4 Workflow & UX (raccourcis, modes dédiés)

- **Raccourcis standard** : Espace (lecture), `C` (set cue), `M` (memory cue), `1-8` (hot cues),
  `[`/`]` (loop), `*2`/`/2` (taille de boucle), `+`/`-` (zoom). → Nous n'avons qu'Espace, ←/→,
  Delete. **Raccourcis de pose de cue (1-8) et de zoom = gains immédiats.**
- **Modes d'édition dédiés** : tous les pros isolent le *Grid Edit Mode* (waveform seule,
  outils de déplacement/étirement, pas d'actions live accidentelles). Notre modal est déjà
  « isolée » — un état visuel explicite « édition grille » manque.
- **Édition sur matériel** (Denon, CDJ) : montre l'intérêt d'une édition **plein écran tactile /
  grand écran** — nous avons le plein écran ✅, mais sans les outils zoom.
- **Interaction régions** : drag des bords pour redimensionner une boucle (standard), double-clic
  pour éditer (renommer/couleur). wavesurfer supporte le drag des bords par défaut ; le
  double-clic d'édition (nom de cue) n'existe pas chez nous.

### 3.5 Analyse & IA (2026)

Stems temps réel (Traktor 4 via iZotope RX, Serato 3.x, rekordbox 7.2, Engine OS 5.0),
détection de vocaux (rekordbox 7), intelligent cues, key detection (Mixed In Key 11 : Camelot,
jusqu'à 8 cues auto + niveau d'énergie), cloud sync (rekordbox CloudDirectPlay, Serato+Spotify
2026). → **Tout ceci est hors périmètre d'un outil de prep mono-piste local** ; le seul point
potentiellement utile est la **détection de tonalité** (harmonique) pour le classement, mais
elle nécessite une lib lourde (chroma/HPCP) — à écarter pour l'instant (YAGNI, pas d'usine à gaz).

---

## 4. Tableau comparatif synthétique

| Fonction | Traktor 4 | rekordbox/CDJ | Serato | Denon/Engine | Mixxx | **Nous** |
|---|---|---|---|---|---|---|
| Grille native NML (TYPE=4/GRID) | ✅ | — | — | — | — | ✅ **écriture directe** |
| Grille flexible (multi-tempo) | ✅ | ✅ | ✅ | ✅ | partiel | ❌ (statique BPM+phase) |
| Édition downbeat/phase | ✅ | ✅ | ✅ | ✅ tactile | ✅ | ✅ nudge + Beat 1 |
| Détection BPM/phase | ✅ | ✅ IA | ✅ | ✅ | ✅ | ✅ serveur (DSP maison) |
| 8 hot cues couleurs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Noms de cues | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ stockés, pas d'UI |
| Memory cues | — | ✅ | — | ✅ | — | ❌ (hors corrélation) |
| Loop manuel enregistré | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Loop divide/roll/autoloop | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (perf, hors scope) |
| Snap/quantize | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ snap |
| Lecture de boucle audition | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Waveform 3-bandes RGB | ✅ | ✅ | ✅ | ✅ 5.0 | ✅ | ❌ |
| Zoom contrôlé / 1-beat | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Minimap/overview | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Numéros de barre | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (4 beats) |
| Phase meter | ✅ | ✅ CDJ | — | ✅ | partiel | ❌ |
| Raccourcis cue/zoom | ✅ | ✅ | ✅ | hardware | ✅ | ⚠️ Espace/←→/Del |
| Undo d'édition | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Stems/IA/cloud | ✅ | ✅ | ✅ | ✅ | — | ❌ (hors scope, assumé) |
| **Round-trip collection Traktor** | natif | export | export | export | — | ✅ **unique** |

---

## 5. Gap analysis priorisée (KISS, honnête)

Barème : **valeur prep** × **coût** × **cohérence Traktor**. On exclut d'office : stems, IA
vocaux, cloud, sync, memory cues, loop roll/divide, phase meter multi-deck (pas de master).

### P0 — à faire, valeur élevée / coût faible

1. **Zoom contrôlé de la waveform** (`+`/`-`, molette, boutons) avec paliers adaptatifs jusqu'à
   l'échelle « 1 beat » — c'est l'outil de calage downbeat/BPM de tous les pros. (wavesurfer :
   `ws.zoom()` ; coût ≈ 1 jour avec tests.)
2. **Raccourcis de pose de cue/loop** : touches `1-8` (slots A–H) et `C` (pose à la position
   courante), `[`/`]` (loop in/out) — alignement sur le standard, coût quasi nul.
3. **Différenciation visuelle du downbeat** dans la grille (ligne plus épaisse/colorée au beat 1,
   déjà calculé par `buildBeats`) — coût très faible, aide directe au calage de phase.

### P1 — valeur élevée / coût moyen

4. **Waveform 3-bandes RGB** (basse/médium/aigu) — le standard de lisibilité spectrale.
   Coût moyen : calcul client de 3 jeux de pics (filtres biquad par bande, déjà utilisés pour la
   bande basse) + rendu multicouche ; alternativement 3 passes `decodeAudioData` filtrées.
   (Alternative pragmatique : colorer la **bande d'énergie basse existante** en rouge et garder
   le reste neutre — 80 % du bénéfice pour 20 % du coût.)
5. **Minimap / overview** (plugin minimap wavesurfer) + navigation type needle — se repérer dans
   la structure (intro/drop/breakdown) sans dézoomer. Coût faible-moyen.
6. **Renommer / recolorer les cues dans l'UI** (double-clic sur un slot ou une région → petit
   éditeur : nom + couleur) — les noms sont déjà stockés dans le NML (round-trip), il manque
   juste l'édition. Très utile pour annoter (Drop, Breakdown, Build).

### P2 — plus tard / à évaluer

7. **Undo/redo local** des éditions (grille + cues) — valeur réelle pour la prep, mais nécessite
   une couche de snapshot par session ; à concevoir proprement.
8. **Grille flexible multi-marqueurs** (style TP4/Serato Red Markers) — **à ne faire que si**
   Traktor Pro 4 l'écrit dans le NML d'une façon stable et documentée ; gros chantier, à
   réévaluer après vérification forensique sur une vraie collection TP4.
9. **Mode « édition grille » dédié** (isolation + outils) — bon UX, mais notre modal est déjà
   isolée ; bénéfice marginal.
10. **Phase meter mono-piste** (alignement de la grille détectée sur le kick analysé, visuel de
    confiance) — le badge « auto · % » existe déjà ; un petit indicateur visuel du décalage de
    phase servirait surtout de feedback après « Analyser ».

### Hors scope (assumé, définitif)

Stems, détection de tonalité, memory cues, cloud, streaming, sync multi-deck, beatjump,
loop divide/roll, export vers d'autres écosystèmes. Le positionnement « prep Traktor fidèle au
NML » est la stratégie ; imiter un CDJ serait une usine à gaz.

---

## 6. Recommandation de feuille de route (suggérée, à transformer en EPICs)

1. **EPIC — Zoom waveform + raccourcis cue/loop (P0-1/2/3)** : zoom `+`/`-`/molette jusqu'à
   1-beat, touches `1-8`/`C`/`[`/`]`, downbeat différencié. Petit, cohérent, testable.
2. **EPIC — Lisibilité : minimap + waveform 3-bandes (ou bande basse colorée)** (P1-4/5).
3. **EPIC — Édition de cue complète : renommage/couleur par double-clic** (P1-6).
4. **EPIC — Feedback d'analyse : indicateur visuel de phase/confiance** (P2-10).
5. Revoir le sujet **grille flexible** après une investigation NML TP4 réelle (pas avant).

---

## 7. Verdict

- **Ce qui est déjà au niveau pro** : le cœur prep — grille native NML en lecture **et écriture**
  directe (round-trip DISPL_ORDER, backup), 8 hot cues, snap, analyse kick/phase serveur,
  lecture de boucle, numéros de barre. Aucun outil du marché ne fait du **prep en écriture
  directe dans le collection.nml** : c'est notre avantage concurrentiel, à protéger.
- **Le plus gros écart, et le moins cher à combler** : **la lisibilité et la manipulation de la
  waveform** (zoom, minimap, 3-bandes, downbeat visuel, raccourcis). C'est là que les pros
  brillent et que nous perdons des points, alors que le coût est faible.
- **Les écarts volontaires** (stems, IA, cloud, performance live) sont des **choix
  stratégiques**, pas des oublis : un outil de prep ne doit pas devenir un mini-rekordbox.

> Références principales : blog Native Instruments (Traktor Pro 4 : Flexible Beatgrids, stems
> iZotope RX, Pattern Player, 2024-2025) ; manuels Pioneer rekordbox 7 + CDJ-3000 (Grid Edit,
> quantize, loop divide, phase meter, Intelligent Cues) ; support Serato (Edit Grid, Red Set
> Markers, 3-band waveforms, raccourcis) ; release notes Engine DJ 2.4→5.0 (Beat Grid Editor,
> Smart/Active Loops, RGB waveforms, on-device stems) ; docs Mixxx (BPM detection, beatgrid
> adjust) ; djay Pro AI (Fluid Beatgrid) ; VirtualDJ 2026 (Fluid Grids) ; Mixed In Key 11.
