# Audio Sync Tool

Outil web local pour cartographier des fichiers musicaux entre dossiers
éparpillés et un dossier source organisé manuellement. Repère les fichiers
manquants, les copie en un clic vers le bon sous-dossier, complète les années
manquantes, range par style, et intègre un **éditeur de cues/loops avec
waveform** calé sur la collection **Traktor (NML)** (beatgrid, BPM, grille
native, export de playlists).

Stack : **Python 3.12 + Flask 3.1**, **TypeScript vanilla** bundlé par esbuild
(aucun framework), **Vitest** (frontend) + **pytest** (backend), **mutagen**
(tags), `data/` en JSON (git-ignoré).

## Fonctionnalités

- **Sync** : scan des dossiers éparpillés, détection manquant/doublon (nom
  exact **et** homonymes probables — durée ±2 s + nom, LED ambre), copie en un
  clic (F5) vers le bon sous-dossier, remplacement d'homonyme de moindre qualité
  (R — l'ancien part dans `_trash/<date>/`, jamais effacé).
- **Filtre rapide** (chips persistants au-dessus de chaque liste) : F7 ou /
  focus le chip de la liste focusée, filtre en direct insensible casse/accents
  sur nom + **année** + codec, mémorisé par liste (changer de colonne/page le
  conserve), ✕/Backspace pour effacer. Sur les arbres source : **filtre à deux
  niveaux** — dossiers seuls par défaut (déplier montre TOUS les fichiers, pour
  vérifier un doublon), toggle 📄 fichiers pour chercher aussi par nom de fichier.
- **Rangement assisté** : pastille « ⤷ déjà rangé » sur les fichiers éparpillés
  dont le jumeau existe déjà dans le dossier visé par le filtre source (tooltip
  = chemin exact — copier créerait un doublon). Le dossier destination **reste
  plié** après F5 (clic ou Entrée déplient) mais **garde son focus** à travers
  les re-renders (EPIC-053) — le cycle F5 → ↑↓ → F5 se parcourt sans re-viser
  le dossier ; un **clic ne fait jamais bouger le scroll** (EPIC-052, seul le
  clavier amène la vue).
- **Rangement par style** (palette `G`) : le style se choisit dans une palette
  clavier, la destination (`<style>_<tranche>`) **se calcule** depuis l'année, et
  le **tag du fichier est écrit tout de suite** ; `A` aligne ensuite le **stock
  déjà rangé** sur son arborescence — voir « Rangement par style ».
- **Années manquantes** : page de revue des années douteuses (consolidation
  multi-sources), avec filtre, écoute avant de trancher, et export des choix —
  voir « Enrichissement des années ». En tête de page, la section **⟲ Années
  déjà écrites** tranche les cas où le tag contredit les sources (« écrit 2024 →
  1991 ») : **Corriger** écrit tout de suite (annulable), **Garder** sort le cas
  de la file.
- **Doublons** : vue dédiée des groupes de versions d'un même morceau (épars
  et/ou rangés) — arbitrage automatique par qualité (FLAC > 320 > 128), override
  au clic, application du plan (gagnant rangé à droite, perdants rangés → trash).
- **Playlist** : création/édition de playlists, notation (0–100), export par
  hard links, badge d'importation NML (`✓ NML` / `≈ homonymes` / `✕ non importé`).
- **Lecture audio partout** : bouton ▶/⏹ sur les cartes Années et les membres
  de groupe Doublons — comme sur les listes — **un seul lecteur** (singleton
  strict : une piste audible à la fois, quel que soit le point d'entrée), état
  « en lecture » re-marqué après chaque re-render.
- **Éditeur cues / loops (waveform)** : cues A–H (touches `1–8`), loops, zoom
  contrôlé (+/−, molette, « Fit », « 1 beat »), minimap synchronisée au zoom,
  waveform **3 bandes RGB** (low/mid/high standard DJ), renommage/recolorisation
  des cues, **undo/redo**.
- **Beatgrid** : snap sur BPM (détecté ou saisi), calage manuel de phase
  (`←/→ 1/4`, `◎ Beat 1`), analyse serveur kick/phase (DSP pur Python, bouton
  🔍 Analyser), **écriture de la grille dans le `collection.nml`** (TEMPO +
  TYPE=4 `AutoGrid`, bouton 💾 Grille).
- **Collection Traktor** : lecture de la collection NML, match par FILESIZE (Ko,
  convention Traktor), ajout des pistes absentes au collection, export NML
  configurable.
- **Légende `?`** : feuille de raccourcis **générée depuis les bindings du code**
  (bijection vérifiée par test) — impossible qu'elle décrive un raccourci qui
  n'existe pas, ou l'inverse.
- **Focus lisible** : une seule grammaire de curseur (boîte d'accent 2 px +
  barre 4 px + fond teinté) pour les fichiers comme pour les dossiers, dans
  toutes les listes.

## Installation

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt   # Flask 3.1.3, mutagen 1.47.0, pytest 9.1.1
npm install                                  # frontend : esbuild, vitest, biome
```

> **Analyse serveur (bouton 🔍 Analyser)** : utilise `ffmpeg` (binaire système) pour décoder
> les mp3/flac/ogg. Les `.wav` fonctionnent sans (repli stdlib). Si ffmpeg est absent, seul le
> décodage WAV + la détection client restent disponibles.

## Utilisation

```bash
npm start                    # tue le process sur 8765, rebuild, lance Flask
# ou, sans rebuild :
./venv/bin/python app.py
# → http://localhost:8765
```

Quatre pages accessibles depuis la toolbar, plus un **éditeur de cues** ouvert
depuis la page Playlist (bouton « Cues » sur une ligne, ou menu clic droit) :

| Page / Outil | Bouton | Fonction |
|------|--------|----------|
| **Sync** | 📦 Sync | Copier des fichiers éparpillés vers la source data (F5) |
| **Playlist** | 🎵 Playlist | Créer des playlists, noter les morceaux, exporter |
| **Doublons** | ↔ Doublons | Groupes de versions d'un même morceau, arbitrage qualité, perdants rangés → `_trash/` |
| **Années** | 📅 Années | Revue des années manquantes non corroborées (choisir / rejeter, export des choix) |
| **Cue editor** | 🎛️ Cue Editor / « Cues » | Éditer cues/loops, zoom waveform, beatgrid, grille NML |

Les **outils** (⚙️ Config, 🔄 Scan, 📋 Journal, ❓ Raccourcis) sont
disponibles dans les pages.

> **Config** — renseigne aussi le chemin du `collection.nml` Traktor (champ
> *Traktor NML path*), nécessaire pour le match NML et l'écriture de la grille.

> ⚠ **Après toute modification de `templates/index.html`, redémarrer l'app**
> (`npm start`). Flask compile le template au chargement (`debug` est éteint) :
> le template est figé dans le process, alors que le JS/CSS repartent au simple
> rafraîchissement (cache-buster par mtime). Sans redémarrage, le navigateur
> exécute le nouveau bundle contre l'ancien HTML — deux sections de la légende
> s'affichaient ainsi vides le 2026-09-22.

### Workflow de base

1. **Config** — renseigne le dossier source data et les dossiers éparpillés.
2. **Scan** — analyse tous les dossiers et extrait les métadonnées.
3. **Navigation** — au clavier : Tab, ↑↓, F5, F7.
4. **Playlist** — crée des playlists, sauvegarde, export par hard links.
5. **Cues** — ouvre l'éditeur waveform depuis une ligne de playlist.

## Raccourcis clavier

> La **référence** est la légende **`?`** de l'app : elle est **générée depuis les
> bindings** (`static/src/commands/*.ts`) et un test de bijection garantit que
> chaque raccourci labellisé y figure et qu'aucune ligne n'est orpheline. Les
> tableaux ci-dessous ne gardent que les gestes du quotidien ; les modifier dans
> le HTML ou ici ne changerait rien au comportement.

### Page Sync

| Touche | Action |
|--------|--------|
| **Tab** | Basculer de colonne (Éparpillé ↔ Source Data) |
| **↑ ↓** | Naviguer dans la liste focusée |
| **← →** | Colonne précédente / suivante (pendant une écoute : seek) |
| **Entrée** | Jouer le fichier / déplier le dossier |
| **Espace** | Sélectionner le fichier (multi-copie) |
| **F5** | Copier vers le dossier surligné — modale « fichier → destination » ; si le dossier déclare un style, le tag genre est écrit des deux côtés (le dossier reste plié) |
| **R** | Remplacer l'homonyme rangé (l'ancien → `_trash/<date>/`) |
| **F7** / **/** | Afficher/masquer le filtre — taper pour filtrer (nom, année, codec) |
| **G** | Style : écrit la **paire complète** (épars + jumeau rangé, genre et année) — palette si épars (voir « Rangement par style ») |
| **E** | Aperçu du rangement par style (copies groupées par dossier cible) |
| **A** | Aligner le genre des fichiers rangés sur leur dossier (aperçu, 2 modes) |
| **⌫** | Aller au dossier parent · **Ctrl+L** : aller au fichier en lecture |
| **Alt + ← →** | Historique de navigation |
| **Shift + ← →** | Seek ±20 s pendant l'écoute |
| **Shift + F10** | Menu contextuel clavier (↑↓ + Entrée) |
| **?** | Ouvrir cette légende |

### Page Doublons

| Touche | Action |
|--------|--------|
| **↑ ↓** | Naviguer les paires de doublons |
| **Clic sur un exemplaire** | Le désigner gagnant (override de l'arbitrage qualité) |
| **▶ / ⏹ (bouton du membre)** | Écouter avant de trancher — ne désigne **jamais** le gagnant |
| **R** / bouton **✓ Appliquer** | Plan du groupe (confirmation) : gagnant rangé à droite, perdants → `_trash/<date>/` |
| **Échap** / **📦 Sync** | Revenir à la page Sync |

> **Arbitrage qualité** : score par paliers — lossless (FLAC/WAV/AIFF/ALAC) =
> 100, ≥ 256 kbps = 80, 128-255 = 60, < 128 = 40 ; tie-breaks durée puis chemin.
> Le tooltip et la colonne « codec » permettent de juger ; la détection est une
> heuristique (revue humaine = confirmation obligatoire).

### Page Années

| Touche | Action |
|--------|--------|
| **↑ ↓** | Naviguer les cartes (ordre **visible** : saute hors-filtre et rejetés) |
| **F7** / **/** | Filtrer les cartes (artiste, titre, année) |
| **Clic** | Choisir une année / rejeter la carte (session locale) |
| **▶** | Écouter le fichier avant de trancher |
| **E** | Exporter les choix (`apply_years.py --review`) |
| **Échap** | Revenir à la page Sync |

### Page Playlist

| Touche | Action |
|--------|--------|
| **Tab** | Basculer source ↔ sidebar |
| **↑ ↓** | Naviguer (source ou pistes), **Entrée** : jouer |
| **Espace** | Ajouter / retirer le morceau |
| **Suppr** / **⌫** | Retirer la piste du sidebar |
| **Ctrl + ↑ ↓** | Réordonner les pistes · **Ctrl+S** sauvegarder · **Ctrl+E** exporter |
| **← →** | Colonne précédente / suivante (seek pendant l'écoute) |
| **N** | Noter le morceau ou la source (édit inline) |

> **Note :** Échap ne quitte plus la page Playlist. Pour revenir à Sync,
> cliquer sur **📦 Sync** dans la toolbar.

### Éditeur de cues

| Touche | Action |
|--------|--------|
| **← →** | Seek audio ±5 s |
| **+/−** | Zoom waveform (molette aussi : ×1,25) |
| **Espace** | Lecture / pause |
| **1–8** | Poser un cue sur les slots A–H |
| **C** | Poser un cue au curseur (déplace l'existant si 8 pleins) |
| **Ctrl + Z** / **Ctrl + Shift + Z** (ou **Ctrl + Y**) | Annuler / rétablir (undo/redo) |
| **⟳ Loop / 🔁 Play** | Dessiner / lire une boucle |
| **←/→ 1/4** | Calage manuel de la grille (nudge de phase ±1/4 beat) |
| **◎ Beat 1** | Poser le premier beat |
| **🔍 Analyser** | Analyse serveur de la basse/du kick (BPM + phase) |
| **💾 Grille** | Écrire la grille (TEMPO + TYPE=4) dans le collection.nml |
| **Suppr** / clic droit | Retirer / supprimer un cue |
| **Double-clic** (slot ou région) | Renommer / recolorer le cue |
| **Échap** | Fermer l'éditeur (ou quitter le plein écran) |

### Transverse

`Échap` ferme dans l'ordre : **menu contextuel → modale → filtre → dossier
déplié → stop audio** (pile de fermeture explicite, testée par invariant).
`Shift+F10` ouvre le menu contextuel de l'élément surligné (`↑↓` + `Entrée`).

### États & pastilles

| Marqueur | Signification |
|----------|--------------|
| LED bleue | Nouveau — hors Source Data |
| LED grise | Doublon — nom identique |
| LED ambre | Homonyme probable (durée + nom) |
| LED verte | Traité — déjà copié |
| LED cyan | En lecture (audio) |
| LED bleue + fond | Sélectionné (multi-copie, Espace) |
| Carré ambre pulsé | Jumeau du doublon surligné (colonne droite) |
| Badge chiffré | Note personnelle (0-100) |
| Badge ✅ | Dans la playlist active |
| Badge ✓ NML | Matché dans la collection Traktor |
| Badge ≈ homonymes | Plusieurs entrées Traktor |
| Badge ✕ non importé | Absent de la collection Traktor |

**Métadonnées affichées** : chaque fichier montre **Année** — **Codec** — **Durée**.

## Workflow F5

1. Naviguer sur un fichier ● (panneau gauche) — la pastille « ⤷ déjà rangé »
   signale ceux dont le jumeau existe déjà dans le dossier filtré à droite
2. **Tab** → panneau droit
3. **↑↓** sur un dossier de destination
4. **F5** → modale « fichier → destination » (**Entrée** valide, **Échap**
   annule) : le morceau, le dossier cible et le consentement style s'y lisent
   d'un coup d'œil
5. Le dossier destination **reste plié** (clic ou Entrée déplient) et **garde
   son focus** — le focus épars reste en place pour enchaîner
6. Si le dossier cible déclare un style (`<style>_<tranche>`), le **tag genre est
   écrit des deux côtés** — épars et copie — et le statut le dit
   (`· style « techno » écrit (epars + copie)`). L'année n'est **jamais** touchée.

## Page Playlist

1. Cliquer **🎵 Playlist** dans la toolbar → deux panneaux : Source / Sidebar
2. **Espace** sur un fichier → ajoute ✅ / retire
3. **Ctrl + S** → sauvegarde persistante
4. **Ctrl + E** → export par hard links vers `source_data/_playlists/<nom>/`
5. Revenir à Sync → cliquer **📦 Sync** dans la toolbar

## Éditeur de cues & beatgrid

1. Dans la page Playlist, cliquer **« Cues »** sur une ligne (ou clic droit →
   *Cues / loops (waveform)*) → modale waveform de la piste.
2. **Cues** — `1–8` ou **C** pose un cue ; **Suppr**/clic droit le retire ;
   double-clic pour le renommer/recolorer (écrit dans le NML au save).
3. **Zoom** — +/− ou molette, `Fit` (piste entière), `1 beat` (largeur ÷
   intervalle, nécessite BPM) ; la minimap sous la waveform reste synchronisée,
   clic = seek.
4. **Waveform** — 3 bandes RGB (rouge basse / vert médium / bleu aigu), downbeat
   différencié (trait ambre), numéros de barre tous les 4 beats.
5. **Beatgrid** — `←/→ 1/4` et `◎ Beat 1` calent la grille ; **🔍 Analyser**
   lance l'analyse serveur (BPM + phase, cache par piste) ; **💾 Grille** écrit
   TEMPO + TYPE=4 dans le `collection.nml`.

## Notation (Ratings)

Une note de 0 à 100 est **visible sur tous les fichiers** (pages Sync,
Playlist, Années), affichée à droite du row après la durée. Elle est stockée
globalement (pas par playlist) dans `data/ratings.json`, clé = chemin absolu.

| Action | Raccourci / Gestuelle | Où |
|--------|----------------------|-----|
| **Éditer la note** | **N** sur l'élément focusé (sidebar ou arbre source) | Page Playlist |
| **Éditer la note** | **Clic** sur la zone de note (`.file-rating`) | Page Playlist (panneau Source) |
| **Valider** | **Entrée** → sauvegarde immédiate | — |
| **Annuler** | **Échap** → note précédente | — |
| **Effacer** | Champ vide + **Entrée** | — |
| **Valider auto** | **Blur** → sauvegarde automatique | — |

> **Hors Playlist**, la cellule de note n'est pas éditable : sur la page Sync,
> `N` ne déclenche rien (cellule de matrice « sync: n sans playlist = rien ») et
> le clic ne fait que surligner la ligne. Limite connue, consignée dans
> « Limites connues ».

**Implémentation :** fonction partagée `_startInlineRatingEdit()` dans
`render/ratingEdit.ts`, avec deux points d'entrée `startRatingEdit()` (sidebar
Playlist) et `startSourceRatingEdit()` (arbre source Playlist).

## Rangement par style (`G`)

Les dossiers de Source Data suivent la grammaire `<style>_<tranche>` (tranche =
palier de 5 ans : `techno_acid_1990`) ou `<style>` seul pour les styles hors
temps (`italo_disco`). La **taxonomie est dérivée des dossiers existants**
(aucune liste à maintenir) ; le style est la seule décision humaine, la tranche
se déduit de l'année du tag, le dossier cible est calculé.

1. **G** sur la ligne surlignée — **Éparpillé ou Source Data** (un fichier prime
   sur un dossier, le panneau actif arbitre) :
   - **fichier rangé** (Source Data) → le dossier **déclare** le style, donc `G`
     l'écrit dans le tag tout de suite, en **une frappe** (EPIC-050) : il n'y a
     rien à choisir. Le **clic** sur la cellule Style ouvre la palette, pour un
     *autre* style ; un dossier hors grammaire (`_trash`, `2008_08`) n'écrit
     rien et ouvre la palette ;
   - **fichier épars** → la palette s'ouvre : **clic** (ou lettre) = style,
     **4 chiffres** = année, **Entrée** = accepter la suggestion locale.
   La palette propose les styles **des dossiers du disque** — un dossier encore
   **vide** est une déclaration de style (`breakbeat_2000` est proposé, et
   `/styles/apply` l'accepte, même sans fichier dedans) — et s'adapte à l'écran
   (`clamp(560px, 44vw, 1180px)` : 44 % de la largeur à 2 560 px, colonnes
   `auto-fill`, **0** pavé de touche `<kbd>` dans un bouton cliquable).
   **Les 57 années réelles (1970→2026)** sont toujours proposées en entier.
2. **Le tag est écrit immédiatement** — `TCON`/`GENRE`/`©gen` pour le style,
   `TDRC`/`TYER`/`DATE`/`©day` pour l'année — via `POST /styles/apply` et
   `POST /years/apply` (validation → confinement aux racines configurées →
   journal `old` → écriture du frame natif → **relecture** de la valeur). Le
   journal est **celui des scripts** (`data/style_apply_journal.jsonl`,
   `data/year_apply_journal.jsonl`, `source: "palette"`) : `apply_styles.py
   --undo` / `apply_years.py --undo` annulent indifféremment l'écriture faite par
   la palette ou par le script. **`g` écrit la paire complète** (EPIC-051) :
   un épars ciblé étend l'écriture à son jumeau rangé — style **et** année, en
   une seule requête ; un rangé ciblé directement ne s'étend pas (la divergence
   reste visible `≠` et corrigeable via `a`).
3. **E** → aperçu groupé par dossier cible (fichiers sans année et jumeaux déjà
   rangés exclus et listés) → **Appliquer** = copies enchaînées via le flux F5
   (journal, pastille « déjà rangé »). Le choix de
   session reste **épars-only** : taguer une piste déjà rangée corrige la
   métadonnée, ça ne planifie aucune copie.

La colonne « Style » montre le choix, la suggestion (`chip` à confiance > seuil,
issue de 4 signaux pondérés : segment du chemin épars (0,50), voisinage artiste
dans la source (0,40), historique de session du sous-dossier épars (0,20), genre
ID3 aliasé (0,15) — suggestion retenue si la confiance ≥ 0,30) et la destination en
tooltip (`→ techno_acid_1990`, `→ ➕ … (sera créé)`, `année manquante`). Sans
choix de session mais avec un genre écrit (copie F5), la cellule montre un
**chip neutre** — le tag écrit est le réel (EPIC-051).
Le filtre de la colonne gauche matche aussi le **sous-dossier** épars
(`_techno`, `2008_08`).

La colonne **Source Data** a sa **propre** cellule « Style » (EPIC-046) : sa
référence n'est pas un choix de session mais **le dossier** — un fichier rangé
est *dans* sa déclaration de style. Elle affiche `✓ techno_acid` (tag et dossier
d'accord), `techno_acid ≠` (divergence, ambre, `G` corrige) ou `techno_acid ?`
(tag vide) ; un dossier hors grammaire la laisse **vide** (aucune cible
inventée). Elle est rafraîchie par chaque écriture (copie F5, `G`, alignement),
donc ce qu'elle montre est ce que le disque dit.

4. **F5 (et tout ce qui copie) écrit le style aussi** — le nom du dossier de
   destination est la déclaration de style, donc une copie vers `techno_acid_1990`
   met le tag genre à `techno_acid` **sur l'épars et sur la copie** (jamais
   l'année). Pas de validation contre la taxonomie : un dossier neuf marche du
   premier coup. Un dossier hors grammaire (`_trash`, `2008_08`, capitalisé)
   n'écrit rien, et un échec de tag est **rapporté sans bloquer la copie**.
   Journal partagé (`source: "copy-f5"`), comme la palette.
5. **A (page Sync) aligne le STOCK sur les dossiers** — les fichiers **déjà
   rangés** dont le genre ne dit pas ce que le dossier déclare (mesuré : 1 023
   contredisent leur dossier, 258 n'ont pas de genre). **A** ouvre un aperçu
   (aucune écriture) puis propose deux modes : *corriger + remplir* ou *remplir
   seulement les vides*. Le disque tranche fichier par fichier (un cache périmé
   n'écrase jamais un genre existant en mode « vides »), l'année n'est pas
   touchée, les lignes sont journalisées (`source: "align"`) — `apply_styles.py
   --undo` restaure, comme pour la palette et les copies. Les **épars** sont hors
   périmètre : leur genre est un indice de suggestion, pas un rangement.

⚠ L'écriture est **immédiate et définitive** pour le fichier : la sortie est le
journal (`--undo`), pas une annulation dans la palette (Échap annule *avant*
écriture).

## Enrichissement des années

À l'origine : **3 704 / 6 522 fichiers sans année (57 %)**. Pipeline **gratuit et sans compte**
(mise à part l'option Discogs) : MusicBrainz (1ʳᵉ sortie du morceau, 1 req/s) → Deezer (sans
clé) → Discogs (60 req/min, token dans `data/discogs_token`, git-ignoré chmod 600).
Les résultats sont **mis en cache** (`data/year_cache.jsonl`, `data/discogs_cache.jsonl`,
`data/itunes_cache.jsonl`, `data/discogs_reform_cache.jsonl`, `data/discogs_reform2_cache.jsonl`,
`data/youtube_topic_cache.jsonl` — git-ignorés) : les clés déjà
collectées ne sont **jamais re-interrogées** ; une relance de collecte ne traite que
l'incrément (reprise JSONL, erreurs re-jetables).

**Un remix doit PROUVER son remixeur (EPIC-048, moteur v3)** : `artist_title()` retire les
segments parenthésés et `NOISE` effaçait `mix`/`remix`/`edit` **avant** la recherche — la version
de remix devenait invisible au lieu d'être vérifiée. Conséquence mesurée :
`age of love - the age of love (cosmic gate mix)(tasnoise).mp3` concluait **1990**, l'année de
l'**original**, pour un remix de 2004. Le crédit est maintenant lu (`scripts/remix_credit.py` :
le PREMIER segment qui **nomme quelqu'un** — `(cosmic gate mix)`, jamais `(tasnoise)` ; un
« Extended Mix » n'est personne), et MusicBrainz comme Deezer doivent **nommer le remixeur** pour
compter. Sans source nommante : **aucune année n'est écrite**, la suggestion vient de la piste
web cherchée **avec** le remixeur, et s'il n'y a pas de consensus, il n'y a **pas de
suggestion** (on ne propose pas l'année de l'original). Le moteur passe en **v3** :
`--only=remix` re-collecte les seules clés dont le nom porte un remixeur.

**Règle de corroboration (EPIC-040)** : aucune année n'est écrite sur la foi d'une seule
source quand elle contredit les autres. La clé artiste/titre est construite en orientations
multiples (tags du fichier → nom → nom inversé, une garde de tokens tranche), Deezer est
sommé de respecter artiste **et** titre, `release_date` d'album n'est plus prise pour une
première sortie — et **deux providers indépendants concordants** sont exigés (Discogs en
3ᵉ provider) ; sinon la ligne part en **revue humaine**. Motif : 408 écritures Deezer dont
**173 ≥ 2015 (42,4 %)** pour des morceaux des années 90. Audit des années déjà écrites :
`scripts/audit_applied_years.py` (classe `confirme` / `contredit` / `a_revoir` /
`non_verifie`) — **audit complet exécuté le 2026-09-22** (`data/year_audit.json`, 408 entrées) :
**23 confirmées · 38 contredites** (le tag dit autre chose que la première sortie, proposition
fournie) **· 8 à revoir · 339 non vérifiées** (226 « une seule source « édition » », 100 « aucune
source », 13 candidats sans corroboration).

**Revue des années déjà écrites (EPIC-045)** : la vue Années ouvre sur la section **⟲** — pour
chaque cas à trancher, l'année écrite et la proposition (badge `écrit 2024 → 1991`), les années
de chaque source (`musicbrainz 1995 · deezer 2004`) et la fiche de sortie. **Corriger** écrit
l'année tout de suite (journal partagé, `source: "audit:revue"` → `apply_years.py --undo`
**restaure** l'année d'avant), une **candidate** de l'audit est cliquable (édition, remaster),
**Garder** ne touche à rien et sort le cas de la file (décision persistée), et les lots
(« Corriger les 38 proposées » / « Garder les 46 ») passent par un dialogue qui dit ce qu'il va
écrire. Le disque reste autoritaire (déjà au bon millésime → aucune réécriture, aucune ligne de
journal) et un échec est nommé sans interrompre le lot. Les **339 non vérifiées** sont seulement
comptées par classe : rien à trancher sans nouvelles sources.

**État au 2026-09-18 — EPIC-033 clôturée** : vague « certaines » **appliquée** (1 349 écritures
OK, journal = backup `data/year_apply_journal.jsonl`, `--undo` idempotent) — consolidation
7 sources : **1 443 certaines / 782 à revue / 1 473 introuvables** (+6 non parsables), dont les
apports **reformulé** (`collect_discogs_reform.py` : +15 certaines / +127 à revue) et
**junk-artiste numérique** (`collect_discogs_reform2.py` : +1 certaine / +12 à revue sur
les 556 artistes numériques/symboles — `#07 enzyme x`, `204`, `2006 prodigy`). La passe
**YouTube « - Topic »** a été **exécutée sans trouvaille (0/84)** : les chaînes Topic sont
fusionnées depuis 2025-2026 dans les profils artiste — le garde-fou reste en place.

**Revue industrialisée** : dans la vue Années, **F7** ou **/** filtre les cartes
(artiste, titre, année — terme mémorisé), choisissez/rejetez puis **e** (ou bouton 💾) → les
choix sont persistés (`data/year_review.json`) ; le chip filtre et la barre d'export se
collent en haut pendant le scroll ; chaque carte porte un bouton **▶** pour écouter le
fichier avant de trancher (player global, état conservé à travers les re-renders) ;
`apply_years.py --review --apply` applique le lot — un choix humain OVERRIDE toujours la
consolidation, journal + `--undo` inchangés. **Aucune écriture ne part de l'interface** hors
les routes `/years/apply` et `/styles/apply` décrites plus haut.

**Passe Beatport — retirée du pipeline (EPIC-049)** : elle n'a **jamais tourné**
(`data/beatport_cache.jsonl` n'a jamais existé, aucun tag ne vient d'elle) et son
token devait être recopié à la main toutes les heures depuis l'onglet Réseau du
portail — friction refusée deux fois. Elle était annoncée dans l'ordre de priorité
comme une source active : elle n'en était pas une. `scripts/collect_beatport.py` et
ses tests sont supprimés, et l'app ne la lit plus.

**Recherche web — locale et gratuite (EPIC-049)** : l'ancien provider (Brave,
`BRAVE_API_KEY`) était **payant et jamais configuré** : il ne produisait rien.
Le moteur interroge désormais le **DuckDuckGo local** (serveur MCP `search`,
`http://localhost:8010/mcp` — `data/search_mcp.json` ou `SEARCH_MCP_URL` pour le
changer) avec repli sur l'endpoint HTML public, **sans clé ni compte**.
`GET /years/web-status` **sonde** le provider (1 s) et la vue Années peut dire
« recherche web indisponible » au lieu de laisser croire qu'elle l'est. Les
années trouvées par le web restent des **candidats** (`web_candidates`) : elles
ne votent jamais — la règle des 2 sources ne se contourne pas avec un moteur de
recherche.

```bash
# Collecte (incrémentale — inutile tant qu'aucun nouveau fichier n'arrive)
./venv/bin/python scripts/collect_years.py --report        # MB → Deezer (1 req/s)
./venv/bin/python scripts/collect_discogs.py --report      # Discogs sur les 'none'
./venv/bin/python scripts/collect_itunes.py --report       # iTunes sans clé (~20 req/min)
./venv/bin/python scripts/collect_discogs_reform.py        # Discogs requêtes reformulées
./venv/bin/python scripts/collect_discogs_reform2.py --go  # junk-artiste numérique (aperçu sans --go)
./venv/bin/python scripts/collect_youtube_topic.py         # YouTube « - Topic » (0/84, relançable)
./venv/bin/python scripts/collect_years.py --only=remix    # re-collecte des SEULES clés de remix

# Diagnostic d'une clé (réseau réel, record complet)
./venv/bin/python scripts/collect_years.py "--probe=age of love|the age of love" \
  "--name=age of love - the age of love (cosmic gate mix)(tasnoise).mp3"

# Rapport consolidé (toutes sources, sans double comptage)
./venv/bin/python scripts/report_years.py --files

# Application de la vague « certaines »
./venv/bin/python scripts/apply_years.py            # dry-run : rien n'écrit
./venv/bin/python scripts/apply_years.py --apply    # écrit les tags
./venv/bin/python scripts/apply_years.py --review   # + choix humains de la vue Années
./venv/bin/python scripts/apply_years.py --report   # résumé du journal
./venv/bin/python scripts/apply_years.py --undo     # annule (idempotent)

# Rangement par style (mêmes garanties, côté genre)
./venv/bin/python scripts/apply_styles.py --undo     # annule les TCON écrits

# Audit des années déjà écrites (EPIC-040)
./venv/bin/python scripts/audit_applied_years.py     # dry-run ; --apply --yes pour agir
```

**Garanties** (testées dans `test_apply_years.py` / `test_apply_styles.py`) :

- **Jamais écraser** : chaque fichier est re-vérifié sur disque juste avant écriture ;
  une année apparue depuis le scan → fichier sauté.
- **Journal = backup** : `data/year_apply_journal.jsonl` (append-only) enregistre chaque
  écriture ; l'opération étant purement additive (fichiers sans année), `--undo` retire
  exactement les frames posés et restaure l'état antérieur.
- **Formats natifs, lisibles par l'app** : MP3 `TYER` (tag v2.3) / `TDRC` (v2.4) — version
  du tag existant préservée, FLAC `DATE`, WAV `TDRC` (chunk ID3), M4A `©day` ; `.wma`
  exclu (non relu par `get_audio_meta`).
- Dry-run par défaut, `--limit N` pour un échantillon de contrôle.

**Clôture de la revue (2026-09-18)** : 692 choix exportés (633 années + 59 rejets) — les
782 à-revue sont **toutes soldées** (713 taggées, 59 rejetées, 9 échecs structurels
connus, 1 fanfare tranchée → 1980) ; `apply_years --review --apply` final : ok=1,
skip=2 152, idempotence vérifiée. Couverture au périmètre du scan du 2026-09-18 : **76 %**
(4 970 / 6 508, contre 43 % à l'ouverture).

**Re-scan du 2026-09-21 (état courant)** : le scan a été relancé — **6 696 fichiers scannés**
(1 604 Source Data + 5 092 épars), **5 141 avec année (76,8 %)**, **1 555 sans**. Le rapport
consolidé ne propose plus que **3 fichiers « certaines » / 54 en revue / 1 492 introuvables**
(6 non parsables) et `apply_years.py` en dry-run ne trouve **0 candidat** — plus rien à écrire.
L'audit des années déjà écrites a traité son premier cas (Phantasia « Inner Light » : 2024 écrit
par Deezer → **1991** sur corroboration Discogs, journal `audit:deezer+discogs`, `--undo`
disponible) puis a été **exécuté en entier** (408 entrées : 23 confirmées / **38 contredites** /
8 à revoir / 339 non vérifiées) — ces 46 cas sont maintenant **tranchables dans la vue Années**
(section ⟲, EPIC-045), aucune correction automatique n'a été appliquée.

**La re-collecte moteur n'est pas « à 30 % » : elle est TERMINÉE, et son rendement est nul.**
Mesure (2026-09-22) : les 1 555 fichiers sans année font **1 448 clés uniques**, **toutes**
interrogées (0 restante) → **1 416 `none`** (aucune source ne connaît le morceau), 29 `single`,
15 `ambiguous`, 3 `conflict`, **1 `found`**. Les 3 331 lignes « v1 » du cache sont la passe
d'**avant** EPIC-040 sur des clés **depuis résolues** : les compter comme du travail restant
était une erreur de lecture (lignes ≠ clés).

**La vraie cause du chiffre, elle, est structurelle et non corrigée** : `load_keys()` construit
la clé de recherche **depuis le nom de fichier**, alors que la fonction qui lit les tags existe
(`tags_artist_title()`, utilisée par `--probe` et par l'audit). Sur les 1 555 fichiers sans
année, **1 204** portent artiste **et** titre dans leurs tags et **1 102 (71 %)** ont une clé
de tags **jamais interrogée** — et ce ne sont pas des nuances de casse : `Gb - Maddix, Fēlēs -
My Gasoline (Extended Mix).mp3` donne `gb / my gasoline (extended mix)` par le nom contre
`maddix / …` par les tags. C'est le prochain chantier, borné (~1 100 clés ≈ 1 h, reprenable,
additionnel) et mesurable (combien des 1 102 se résolvent).

Historique complet, chiffres détaillés et bilan de clôture : [EPIC-033](docs/superpowers/epics/EPIC-033-enrichissement-annees-id3.md)
· corroboration : [EPIC-040](docs/superpowers/epics/EPIC-040-annees-corroboration-2-sources.md).

## Structure

```
audio-sync-tool/
├── app.py                 # Serveur Flask (port 8765, routes REST + écriture des tags)
├── analysis.py            # Analyse serveur kick/phase (DSP pur Python, beatgrid)
├── nml.py                 # Parser/écriture collection Traktor (NML) : match, add, export, grille
├── templates/index.html   # Interface utilisateur (structure des modales incluse)
├── static/
│   ├── styles/            # CSS EN COUCHES : tokens, base, components + pages/*.css (11 fichiers)
│   │   └── pages/index.css  # agrège les @import — l'ordre fait la cascade, ne pas réordonner
│   ├── src/               # TypeScript : 61 modules + 53 fichiers de test
│   │   ├── commands/      # Command Registry (13 modules) : navigation, audio, filter, style…
│   │   │                  #   + keyboardMatrix.test.ts (matrice touches × contextes)
│   │   ├── render/        # Component factories (fileRow, sourceTree, cueEditor, legend…)
│   │   ├── core/          # Helpers partagés : format, feedback, subscribe, dom
│   │   ├── router.ts      # state.page : sync | playlist | dups | years
│   │   ├── styleSuggest.ts# suggestions de style (chemin, voisinage artiste, genre ID3)
│   │   ├── dupDetect.ts   # Détection doublons (durée ±2 s + nom fuzzy)
│   │   ├── dupGroups.ts   # Groupes de versions + arbitrage qualité
│   │   └── script.ts / state.ts / api.ts / audio.ts / focus.ts / ui.ts
│   └── dist/              # script.js + script.css bundlés par esbuild (gitignored)
├── data/                  # Config, journal, caches, playlists, ratings, beatgrids (gitignored)
├── docs/superpowers/      # Specs + plans + rapports
│   └── epics/             # ⭐ Registre des EPICs (traçabilité de toute évolution)
├── build.js · scripts/validate-build.js · scripts/audit-css.mjs   # bundle esbuild + validation
├── scripts/               # enrichissement Python : collect_*, apply_years, apply_styles,
│   │                      #   report_years, audit_applied_years ; capture_ui / perf_ui
│   └── proof_*.py · measure_*.py   # harnais de preuve headless (Chrome CDP)
├── tests/fixtures/        # échantillons (nml-sample.xml)
├── docs/refactoring/ · docs/TESTING-GUIDE.md   # bilan de refactoring, guide de test
├── .github/workflows/     # CI : typecheck + lint + vitest + shuffle + pytest
├── biome.json · vitest.config.js · tsconfig.json · package.json · requirements.txt
├── test_app.py            # Tests backend API (164 tests)
├── test_analysis.py · test_nml.py · test_apply_*.py · test_collect_*.py · test_report_years.py
└── README.md
```

Routes REST principales : `/config`, `/scan`, `/scan-progress`, `/load`, `/ping`,
`/copy`, `/move`, `/delete`, `/mkdir`, `/journal` (GET/DELETE), `/audio`,
`/ratings`, `/playlists` (+ `/<name>`, `/export`), `/years/preview`,
`/years/review`, `/years/apply`, `/styles/review`, `/styles/apply`,
`/styles/audit`, `/styles/align`, `/years/audit`, `/years/audit/review`,
`/api/nml/status`, `/api/track/match`, `/api/track/add`, `/api/track/cues`,
`/api/track/grid`, `/api/beatgrid`, `/api/track/analyze`.

**Routes qui écrivent des tags** — `/years/apply` et `/styles/apply` (palette `G`),
`/styles/align` (`A`, alignement genre ↔ dossier) et `/years/audit/review` (revue des années
déjà écrites), plus `/copy` (F5 écrit le style du dossier cible). Toutes suivent la même
grammaire (validation → confinement aux racines configurées → journal `old` → écriture →
**relecture**) et le **même journal** que les scripts : `apply_years.py --undo` et
`apply_styles.py --undo` annulent aussi ces écritures. Depuis EPIC-050, **l'écriture remet
l'index à jour** dans la même requête (le cache de scan prend la valeur relue ; la réponse
porte `cache_updated`) : sans cela, l'écran resservait la valeur d'avant au rechargement et
`/styles/audit` continuait de compter un cas déjà corrigé. `/years/audit` et `/styles/audit`
sont les deux vues d'aperçu, en **lecture seule**.

## Développement

Tout le code frontend est en **TypeScript** ; les fichiers `.js` de `static/dist/`
sont des artefacts de build (gitignorés) générés par esbuild.

```bash
npm start                  # tue le process 8765, build, lance Flask (le plus sûr)
npm run dev                # Watch mode (rebuild à chaque changement)
npm run build              # Build + validation du bundle (script.js parsable, invariants)
npm run typecheck          # tsc --noEmit
npm run lint               # biome check static/src/
npm test                   # vitest run — 1 230 tests, 53 fichiers
npm run test:shuffle       # ordre aléatoire (détecte les fuites d'état entre tests)
npm run test:shuffle:gate   # 3 graines FIXES (un échec de shuffle redevient reproductible)
npm run coverage           # clean → vitest --coverage → build
npm run audit:css          # classes CSS mortes (rapport seul, vérification manuelle)
./venv/bin/python -m pytest -q    # 367 tests backend
```

> **CI** (`.github/workflows/ci.yml`, chaque push/PR) : typecheck, lint, `npm test`, `test:shuffle` (graine aléatoire) puis `test:shuffle:gate` (3 graines fixes : un échec de shuffle redevient reproductible) et pytest.

> ⚠ **Le CSS et le JS sont bundlés** : `npm run build` est **obligatoire avant toute
> mesure dans le navigateur** (et `npm start` après une modification de template).
> Un harnais lancé sans rebuild mesure la version précédente.

**Preuves headless** — plusieurs décisions d'UI sont tranchées par la mesure, pas à
l'œil : `scripts/measure_legend.py` (légende : alignement, libellés coupés, contraste
calculé comme le navigateur le rend, tenue de la modale — 13 vérifications, rejouable à
toute largeur avec `PROOF_WINDOW=2560,1400`), `measure_focus_visibility.py` (contraste du
focus), `proof_filter_chip.py`, `proof_style_palette.py` (tags relus **sur disque**).

### Couverture (mesurée le 2026-09-23)

| Suite | Tests | Couverture |
|-------|-------|------------|
| Pytest | **367** (12 fichiers) | — |
| Vitest | **1 230** (53 fichiers) | **94,72 %** lignes/statements, **83,96 %** branches, **91,18 %** fonctions |

## Limites connues

- **Notation hors Playlist** : la note est *visible* partout, mais éditable seulement en page
  Playlist (`N`, ou clic en panneau Source). Sur Sync, `N` ne fait rien et le clic ne fait que
  surligner la ligne (documenté par une cellule de la matrice clavier).
- **Le tag suit le rangement** : une copie vers un dossier qui « ment » (`techno` dans un
  dossier `hardcore_1990`) écrit un tag faux — c'est cohérent avec la déclaration du dossier, et
  `apply_styles.py --undo` revient en arrière (journal `source: "copy-f5"`). L'année, elle,
  n'est jamais écrite par une copie. L'alignement **A** remplace à dessein des genres externes
  (`Electronic`, `Dance`…) par le style du dossier : c'est l'objectif, et le journal les garde.
  Depuis EPIC-051, `g` étend l'écriture au **jumeau rangé** même si son dossier
  contredit — la divergence reste visible (`≠`) et corrigeable via `a`.
- **Template ≠ bundle** : après une modification de `templates/index.html`, redémarrer l'app
  (voir l'avertissement en tête de « Utilisation »). Le code tolère un HTML d'une autre version
  (sections statiques adoptées par leur titre, jamais effacées) mais garde alors l'ancienne mise
  en forme.
- **Légende sous 1 850 px** : la feuille passe de 4 à 2 colonnes (équilibre mesuré 1,07) et fait
  alors **1 061 px** de haut — un peu de défilement sur une fenêtre courte. Le palier 3 colonnes a
  été **écarté** après mesure (inéquilibrable avec ces sept sections : 410 px contre 770 px).
  Harnais rejoué à 2 560 / 1 600 / 1 366 px : **13/13**.
- **Colonne Source Data** : le filtre des arbres teste les **noms de dossiers** par défaut
  (toggle 📄 fichiers pour les noms de fichiers) — décision assumée, EPIC-037.
- **Années** : le re-scan du 2026-09-21 laisse **1 555 fichiers sans année sur 6 696 (76,8 %
  couverts)** ; le rapport consolidé ne propose plus que 3 fichiers « certaines » / 54 en revue /
  1 492 introuvables (6 non parsables) et `apply_years.py` en dry-run ne trouve **0 candidat**.
  L'audit des années déjà écrites est **exécuté** (408 entrées · 38 contredites · 8 à revoir) et
  **tranchable** dans la vue Années (section ⟲, EPIC-045) — les corrections ne partent que d'un
  clic, jamais en lot automatique. La re-collecte moteur est **terminée** (1 448 clés, 0
  restante) avec un rendement quasi nul (1 416 `none`, **1** `found`) ; le gisement suivant est
  la clé construite depuis les **tags** (1 102 clés jamais interrogées sur les 1 555 fichiers
  sans année — non corrigé à ce jour) ; les années « à revue » non tranchées restent hors
  application automatique.
- **`data/` en JSON** : config, journal, caches, playlists, ratings, beatgrids, journaux
  d'écriture (`year_apply_journal.jsonl`, `style_apply_journal.jsonl` — créés à la première
  écriture). Jamais supprimés par l'outil ; le trash (`<source>/_trash/<date>/`) remplace
  toute suppression de fichier audio.

## Évolutions & traçabilité

Toute évolution/amélioration du projet est tracée dans une **EPIC**
(`docs/superpowers/epics/`) : registre central `README.md` + un fichier par
évolution (objectif, tâches cochables, fichiers, validation, commits, décisions).
Créer une nouvelle EPIC = copier `_template.md` + l'ajouter à l'index.
Statuts : ⚪ Backlog → 🔵 En cours → 🟢 Livré | 🟠 Bloqué | 🔴 Abandonné.

Dernières EPICs : **040** (années corroborées : 2 providers concordants exigés),
**041** (palette `G` : le tag s'écrit tout de suite, cible Éparpillé *ou* Source Data),
**042** (légende : mise en forme mesurée — une seule abscisse de libellé, familles de
touches, flux multi-colonnes ; deux régressions d'usage corrigées et verrouillées par
des vérifications de harnais),
**043** (F5 range **et** tague : le style du dossier cible est écrit sur l'épars et
sur la copie, journal partagé des scripts, année jamais touchée),
**044** (le stock de genres rejoint l'arborescence : aperçu, deux modes, disque
autoritaire, `--undo`),
**045** (l'audit des années écrites a une surface : section ⟲, corriger/garder, `--undo`),
**046** (le style se lit des deux côtés : colonne Style côté Source Data, référence = le dossier),
**047** (palette complète — dossiers vides du disque — et à l'échelle de l'écran, plus de `<kbd>`),
**048** (un remix ne date pas de l'original : le remixeur doit être nommé par la source ; la
piste web le cherche avec lui),
**049** (recherche web **locale** DuckDuckGo sans clé, Brave et Beatport retirés du pipeline),
**050** (l'écriture met l'index à jour, les slashes de racine sont pliés, `G` sur un rangé écrit
le style de son dossier),
**051** (la copie se lit d'un coup d'œil : modale « fichier → destination » élargie sans
troncature, dossier plus auto-déplié, `g` écrit la **paire complète** et le style se voit des
deux côtés),
**052** (un clic ne fait jamais bouger le scroll),
**053** (le focus du dossier destination survit au re-render après copie — le cycle
F5 → ↑↓ → F5 sans re-viser le dossier).

## Architecture

Le frontend utilise le **Command Pattern** pour router les entrées clavier : un
`CommandRegistry` déclaratif remplace l'ancien handler monolithique. Les touches
sont réparties dans **13 modules de commandes** (`registry`, `navigation`,
`audio`, `copy`, `filter`, `rating`, `playlist`, `modals`, `replace`, `dups`,
`menu`, `style`, `years`), scopées par page (`state.page`), par contexte
(`page`, `activePanel`, `playlistMode`, `activeModal`, `isContextMenuOpen`…).

Points de contrat à connaître avant de toucher l'existant :

- **Raccourcis** : ils se déclarent **dans** `commands/*.ts` (`label`, `group`,
  `legendFamily`), jamais dans le HTML ni dans le README. La légende `?` en est la
  projection, et `commands/keyboardMatrix.test.ts` (matrice touches × contextes)
  fait échouer la CI sur un binding mort ou shadowé.
- **CSS** : une nouvelle règle va dans le fichier de sa page, une règle transversale
  dans `components.css`, une nouvelle variable **uniquement** dans `tokens.css`
  (jamais deux déclarations du même token). `npm run audit:css` signale le CSS mort.
- **Journal des écritures** : toute écriture de tag passe par un journal additif
  partagé avec les scripts, seule voie d'annulation (`--undo`).
- **Trash** : `_trash/<date>/` sous la source, jamais d'effacement.

```
script.ts (orchestrateur) → commands/ (CommandRegistry) → state.ts (Proxy + EventEmitter)
                          → render/ (component factories) → core/ (format, feedback, subscribe, dom)
actions.ts (mutations d'état) · api.ts (fetch + retry) · audio.ts (lecteur singleton)
```

**Tags git :**
- `v0.1-functional` — appli fonctionnelle (291 tests à l'époque)
- `v0.2-clean-architecture` — Command Pattern + EventEmitter (313 tests à l'époque)
