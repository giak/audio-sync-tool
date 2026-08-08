# Audit technique & UI/UX — Audio Sync Tool (2026-08-08)

> **Objet** : audit complet du dépôt `audio-sync-tool` — code backend (Flask), frontend (TypeScript),
> tests, build, docs et expérience utilisateur — avec focus sur la fonctionnalité
> « Éditeur waveform cue/loop » (plan `2026-08-08-waveform-cue-editor.md`) jugée non probante.
>
> **Méthode** : lecture de l'ensemble des sources (28 modules TS + app.py + nml.py + templates + CSS + docs),
> exécution des suites de tests, du lint, du typecheck et du build, et **vérification du serveur réel
> par curl** (démarrage de `python app.py`, requêtes HTTP réelles). La vérification navigateur automatisée
> (browser-use) n'a pas pu aboutir dans cet environnement (processus isolés, pas de tmux) ; les conclusions
> UI/UX reposent donc sur l'analyse statique des sources, du DOM et du CSS — corroborée par des preuves
> exécutables (curl, tests).

---

## 1. Synthèse exécutive

### Verdict

Le projet est **globalement sain** : architecture claire (Command Pattern + EventEmitter + composants),
couverture de tests **quantitativement impressionnante** (540 vitest + 91 pytest, tous verts), design
SCADA cohérent, et un backend NML bien pensé (écriture atomique, backup, index `(FILE, FILESIZE)`).

Cependant, **la fonctionnalité livrée par le plan du 08-08 — l'éditeur waveform cue/loop — est
inutilisable en l'état**, et la raison est structurelle : **les tests passent, mais l'intégration réelle
est cassée**. Quatre bugs bloquants s'enchaînent :

| # | Sévérité | Bug | Preuve |
|---|----------|-----|--------|
| B1 | 🔴 **Critique** | `POST /api/track/cues` → **404 en production** : la route est déclarée **après** `app.run()` | curl réel : `404 Not Found` alors que `/api/nml/status` répond 200 |
| B2 | 🔴 **Critique** | Mismatch de types `start`/`len` (strings du backend → arithmétique frontend) : les régions sont mal placées (concaténation de chaînes) | lecture croisée `get_cues` (str) ↔ `cuesToRegions` (nb) ; tests verts car ils utilisent des nombres |
| B3 | 🔴 **Critique** | Multi-match (≈12 % des pistes réelles) : la sauvegarde **omet** le champ `entry` → le backend répond systématiquement 409 | lecture croisée `saveCues` ↔ route `track_cues` |
| B4 | 🔴 **Critique** | **Aucun contrôle de lecture dans la modal** : wavesurfer v7 en clic = *seek* uniquement (pas de play/pause), aucune barre de transport, aucun binding clavier | vérifié dans `wavesurfer.js` (handler `click` → `seekTo` seulement) et dans `cueEditor.ts` |

Conséquence : l'utilisateur ne peut ni **écouter** le morceau dans l'éditeur, ni **sauvegarder** les cues
(404), et quand il le pourrait les positions seraient **fausses** (B2) ou rejetées (B3). Le « résultat
non probant » constaté par l'utilisateur est donc exactement cela : un livrable qui coche des cases
(commits, tests verts) mais qui ne fonctionne pas de bout en bout.

### État vérifié du dépôt (exécuté le 2026-08-08)

| Vérification | Commande | Résultat |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ 0 erreur |
| Build + validation bundle | `npm run build` | ✅ OK (121 KB, 6 signatures OK) |
| Tests frontend | `npm test` | ✅ **540 passed / 25 fichiers** |
| Tests backend | `./venv/bin/python -m pytest -q` | ✅ **91 passed** |
| **Lint** | `npm run lint` | ❌ **65 erreurs / 15 warnings / 15 infos** (le README prétend « 0 erreurs ») |
| Serveur réel | `python app.py` + curl | `/api/nml/status` → 200 ; `POST /api/track/cues` → **404** |
| CI | — | ❌ **aucun CI** (pas de `.github/`) |

---

## 2. Bugs fonctionnels (par ordre de gravité)

### B1 — 🔴 CRITIQUE : `POST /api/track/cues` est injoignable en production

**Localisation** : `app.py`, tout à la fin du fichier :

```python
if __name__ == '__main__':
    app.run(debug=True, threaded=True, port=8765)


@app.route('/api/track/cues', methods=['POST'])   # ← JAMAIS EXÉCUTÉ
def track_cues():
    ...
```

Quand on lance `python app.py` (c'est ce que fait `npm start`), Python exécute le fichier de haut en bas :
`app.run()` **bloque** (serveur + reloader Werkzeug), donc la ligne `@app.route('/api/track/cues')` située
en dessous **n'est jamais exécutée**. La route n'existe pas → le bouton « 💾 Enregistrer » du cue editor
recevra toujours un 404.

**Preuve exécutable** (faite pendant l'audit) :

```
$ python app.py &   # serveur lancé
$ curl http://127.0.0.1:8765/api/nml/status        → 200
$ curl -X POST http://127.0.0.1:8765/api/track/cues → 404 Not Found
```

**Pourquoi les tests passent** : pytest *importe* `app` comme module (`__name__ != '__main__'`) → le bloc
`app.run()` est sauté → la route est enregistrée. Le test couvre donc un état qui n'existe jamais en
exécution réelle. C'est exactement le genre de trou que la « Task 9, étape 5 : vérification manuelle
réelle » du plan (restée **non cochée**) devait attraper.

**Correctif** (2 lignes) : déplacer le bloc `if __name__ == '__main__'` **à la toute fin du fichier**,
ou enregistrer la route avant ce bloc.

---

### B2 — 🔴 CRITIQUE : `start`/`len` chaînes de caractères → régions cassées

**Chaîne de cause** :
1. `nml.get_cues()` renvoie `start` et `len` en **strings** (`'60.125000'`) — fidèle au NML.
2. `GET /api/track/match` les renvoie tels quels au frontend.
3. `cueModel.cuesToRegions()` fait de l'arithmétique :

```ts
end: c.type === '5' && c.len > 0 ? c.start + c.len : c.start + 0.08,
```

Avec `c.start = "60.125000"` (string), `c.start + 0.08` → **concaténation** `"60.1250000.08"` → `parseFloat`
donne `60.1250000` : **la région cue fait une largeur nulle, posée à la position de départ**. Pour les
loops, `"60.125000" + "4.000000"` → `"60.1250004.000000"` → 60.1250004 au lieu de 64.125.

**Pourquoi les tests sont verts** : `cueModel.test.ts` et `cueEditor.test.ts` alimentent `cuesToRegions`
avec des **nombres** (`start: 5`, `len: 0`), jamais avec la forme réelle de l'API (strings). Le contrat
`CueDTO { start: number }` est contredit par le backend, et `any[]` fait passer la violation de type
sous `tsc`.

**Correctif** : forcer la conversion à la frontière, une seule fois — dans `cueEditor.ts`
(`renderWaveform`) ou dans `cuesToRegions` : `start: Number(c.start)`, `len: Number(c.len)`. Ajouter un
test d'intégration avec la forme réelle de l'API.

---

### B3 — 🔴 CRITIQUE : sauvegarde impossible sur les homonymes (≈12 % des pistes)

L'audit du vrai `collection.nml` (56 645 entrées) a établi que **le multi-match n'est pas un edge case** :
`(FILE, FILESIZE)` laisse ~12 % des clés ambiguës. Le plan a donc prévu :
- côté UI : sélecteur d'homonymes + mémorisation `localStorage` ✅ **livré** ;
- côté API : champ optionnel `entry` (index) dans le body du POST ✅ **livré** côté serveur ;
- côté client : **envoyer cet index** ❌ **manquant**.

```ts
// cueEditor.ts — saveCues()
const payload = { filename: _entryRef.filename, filesize: _entryRef.filesize, cues };
```

`_entryRef` ne porte **pas l'index choisi dans le sélecteur**, et le payload ne contient aucun `entry`.
Résultat : pour toute piste homonyme, `POST /api/track/cues` reçoit `sel = None` et `len(hits) > 1` →
**409 `{error: 'multiple'}`** → l'utilisateur voit « ❌ sauvegarde refusée » alors qu'il vient de choisir
l'entrée dans la liste déroulante. La mémorisation `cue/sel:` ne sert qu'à l'affichage, pas à l'écriture.

**Correctif** : stocker l'index sélectionné dans `_entryRef` et l'inclure dans le payload
(`entry: <index>`). Ajouter un test vitest qui simule `multiple: true`, sélectionne une entrée, et vérifie
que `api` est appelé avec `entry`.

---

### B4 — 🔴 CRITIQUE : impossible d'écouter le morceau dans l'éditeur

Dans `renderWaveform()`, on crée `WaveSurfer.create({ container, url })` et on n'attache **aucun
transport** : pas de bouton play/pause, pas de binding espace, pas de contrôle dans le HTML de la modal.

Vérifié dans le bundle wavesurfer v7 (`initRendererEvents`) : **un clic sur la waveform ne fait que
`seekTo()`** — il ne joue pas la piste. Sans `autoplay`, sans `ws.play()`, et avec le player global
(`audio.ts`) déconnecté de la modal, **il n'existe aucune manière de lire l'audio depuis l'éditeur**.

Conséquences directes :
- `onSlotClicked()` pose un cue à `ws.getCurrentTime()` = **0** (jamais joué) → tous les slots pointent 0:00 ;
- l'utilisateur ne peut positionner un cue « à l'oreille » qu'en devinant puis en faisant glisser la région
  (drag) — le workflow décrit dans la spec (écouter → poser A–H) est impossible.

**Correctif minimal** : bouton ▶/⏸ + affichage du temps courant dans la modal, `ws.on('interaction')` →
update temps, binding `Space`/`←→` sur la modal (déjà le pattern Command du projet). C'est le point
d'UX le plus urgent.

---

### B5 — 🔴 HAUTE : `write_cues` détruit les cues non éditables (`TYPE∈{0,5}` avec `HOTCUE=-1`)

```python
def write_cues(entry, cues):
    kept = [c for c in entry.findall('CUE_V2') if c.get('TYPE') not in ('0', '5')]
    for c in list(entry.findall('CUE_V2')):
        entry.remove(c)
    ...
```

La spec (amendée par l'audit NML) est claire : « éditable = `TYPE∈{0,5}` **ET** `HOTCUE 0..7` ;
masquer `HOTCUE=-1` ». Or `write_cues` supprime **tous** les `TYPE∈{0,5}`, y compris ceux à
`HOTCUE=-1` qui ne sont pas restitués par `get_cues()` (filtrés). En vraie collection : **1 cue
`TYPE=0/HOTCUE=-1`** et les **loops `TYPE=5` sans hotcue** (partie des 97) seraient **silencieusement
effacés** à la première sauvegarde d'un morceau. Le test existant (`test_write_cues_replace_only_editable`)
vérifie la conservation de `TYPE=4` mais **pas** le cas `TYPE=0/5` + `HOTCUE=-1`.

**Correctif** : `kept` doit aussi conserver `TYPE∈{0,5}` avec `HOTCUE == -1` :
```python
kept = [c for c in entry.findall('CUE_V2')
        if c.get('TYPE') not in ('0', '5') or c.get('HOTCUE', '-1') == '-1']
```

---

### B6 — 🔴 HAUTE : aucune validation serveur des cues reçus

La route `track_cues` accepte n'importe quel dict `{type, start, len, hotcue, …}` : un `hotcue` hors
0..7, un `type` hors {0,5}, un `start` négatif ou non numérique sont écrits tels quels dans le NML
(`str(c.get(...))`), produisant un fichier que Traktor pourrait mal interpréter. La spec §2.3 exigeait
l'alignement aux contraintes « éditable = TYPE∈{0,5}, HOTCUE 0..7 ». Le client *peut* aussi être défaillant
(ancienne version du bundle), donc le serveur doit rester la ligne de défense.

**Correctif** : valider chaque cue (type ∈ {0,5}, hotcue entier 0..7, start/len numériques ≥ 0) et
retourner 400 sinon — avec des tests pytest pour les cas invalides.

---

### B7 — 🔴 HAUTE : fuite d'instance wavesurfer au changement d'entrée (homonymes)

`renderWaveform()` fait `el.innerHTML = ''` puis `ws = WaveSurfer.create(...)` **sans détruire** l'instance
précédente. `destroyCueEditor()` n'est appelé qu'à la fermeture de la modal. Or `renderEntry()` (sélecteur
homonymes) rappelle `renderWaveform()` : chaque bascule d'entrée **laisse une instance vivante**
(Web Audio actif, décodage en cours, listeners) → mémoire qui grossit, et si une piste jouait,
**chevauchement audio** entre l'ancienne et la nouvelle instance.

**Correctif** : en tête de `renderWaveform()` :
```ts
ws?.destroy(); ws = null; _regions = null;
```

---

### B8 — 🔴 HAUTE : export NML non configurable + échec silencieux

1. **L'UI Config ne contient que `traktor_nml_path`** (champ `cfg-traktor-nml-path`). Les champs
   `traktor_export_root` et `traktor_export_volume` définis dans la spec §2.1 **n'ont jamais été ajoutés**
   à `index.html` ni à `actions.ts` (`ConfigEntry` ne les connaît pas). Il est donc **impossible de
   configurer l'export NML depuis l'interface** sans éditer `data/config.json` à la main.
2. Quand ces champs sont absents, `build_export_nml` reçoit `export_root = ''` →
   `os.makedirs('', exist_ok=True)` lève `FileNotFoundError` → **attrapé et loggé** (« Export NML échoué »)
   → le client ne voit **aucun message** : `result` ne contient simplement pas `nml`. Échec silencieux.
3. **Sémantique de `LOCATION` douteuse** : `rel = os.path.relpath(os.path.dirname(local), export_root)`
   calcule le chemin **depuis le dossier source d'origine** de chaque piste — alors que les fichiers sont
   copiés dans `source_data/_playlists/<name>/` (ou sur le volume). Le `DIR` écrit pointe donc vers des
   chemins Linux locaux inexistants sur le HD/USB. La promesse de la spec (« LOCATION réécrites vers la
   racine d'export ») n'est pas tenue.

**Correctif** : ajouter les 2 champs de config (UI + `ConfigEntry`), garder le `export_root` vide →
message explicite, et calculer `DIR` à partir de l'emplacement **réel** des fichiers exportés
(`<export_root>/…` ou `_playlists/<name>/`).

---

### B9 — 🟠 MOYENNE : `regionToCue` reconstruit `DISPL_ORDER`

```ts
export function regionToCue(r) {
  ...
  displ_order: String(r.id),   // r.id = hotcue (slot)
```

L'audit NML a mesuré **326 / 8 435** cas où `DISPL_ORDER != HOTCUE` dans la vraie collection, et la
décision verrouillée est : « Ne jamais reconstruire DISPL_ORDER depuis HOTCUE ». Le mapping actuel le
fait à chaque sauvegarde : les cues existants verront leur `DISPL_ORDER` écrasé. Impact faible (l'ordre
d'affichage peut changer dans Traktor) mais c'est une **violation explicite de la décision de design**.

**Correctif** : transporter `displ_order` dans les régions (metadata) et le restituer tel quel ; pour les
nouveaux cues, choisir un ordre d'affichage explicite (ex. ordre chronologique des slots), pas l'index.

---

### B10 — 🟠 MOYENNE : journal — statuts affichés en rouge à tort

`renderJournal()` (journalUI.ts) ne connaît que `copied`, `scan`, `config` ; **tout autre statut tombe
dans la branche « erreur » rouge**. Or le backend journalise `deleted`, `cues`, `export`… → après une
suppression de fichier, l'entrée du journal apparaît **en rouge comme une erreur**. Trompeur.

---

### B11 — 🟠 MOYENNE : `app.run(debug=True)` en environnement « de production »

Le serveur local tourne avec le **debugger Werkzeug** (`debug=True`). Sur une machine locale c'est
tolérable, mais le debugger est une **porte d'exécution de code à distance** si le port est exposé
(et `npm start` fait un `fuser -k` sur 8765 sans vérifier qui d'autre l'écoute). Au minimum : activer le
debugger conditionnellement (`--debug` en arg) et servir le mode dev via `npm run dev`.

---

### B12 — 🟠 MOYENNE : robustesse des données JSON

- `save_json()` n'est **pas atomique** (écriture directe) → une coupure pendant l'écriture de
  `playlists.json`/`ratings.json`/`journal.json` peut corrompre le fichier. Le module NML, lui, fait
  `.tmp` + `os.replace` — la même rigueur devrait s'appliquer aux JSON.
- Le **journal grossit sans borne** : aucune rotation/limite, aucun bouton « vider ». À la longue, la
  modal Journal et les re-rendus s'alourdissent.
- `/scan` n'a **pas de verrou** : deux scans simultanés (clic ×2) s'entrelacent (progress corrompu,
  cache écrasé).

---

## 3. UI/UX — Éditeur de cues (le livrable « non probant »)

| Point | Constat |
|---|---|
| **Lecture audio** | Aucun transport dans la modal (B4). Clic waveform = seek seul. |
| **Positionnement** | Slot posé à `getCurrentTime()` = 0 tant que rien ne joue (B4). |
| **Bouton loop** | La spec §3.1 (et le plan Task 7) prévoit un bouton « ⟳ Loop » (`#cue-btn-loop`) : **absent** de `index.html` et de `cueEditor.ts`. Une boucle ne peut être créée qu'en étirant une région — non découvert par l'utilisateur, aucun libellé. |
| **Suppression** | Aucun bouton de suppression visible sur une région : seul le re-clic du même slot retire la région (mécanique invisible). Pas de clic-droit région, pas de touche Suppr. |
| **Erreurs de chargement** | Si `/audio` échoue (fichier introuvable, décodage), **aucun message** : waveform vide, modal muette. |
| **Clavier** | Aucun binding dans la modal (Espace, ←→, ±) alors que l'app est clavier-first. |
| **Statut** | `#cue-editor-status` est **vide** dans le HTML et jamais alimenté ; `.cue-slot.live` n'est jamais activé (CSS prévu mais mort). |
| **Sélecteur homonymes** | Présent, mais sans les infos discriminantes préconisées par l'audit NML (DIR, VOLUME) et inopérant pour la sauvegarde (B3). |
| **Fermeture** | OK (Esc/backdrop/✕ → destroy). Mais pas de confirmation si des modifications non sauvegardées. |
| **Tests** | `cueEditor.test.ts` mocke api + wavesurfer + state : il ne teste **ni** la forme réelle des données (B2) **ni** le payload avec `entry` (B3) **ni** le 404 réel (B1). |

---

## 4. UI/UX — Application générale

### Ce qui est bien fait ✅
- **Thème SCADA cohérent** : tokens CSS en `:root`, LED colorées avec glow, police JetBrains Mono, barre
  de progression de scan avec gradient, badges de serveur en ligne/hors ligne.
- **Accessibilité de base** : `:focus-visible` propre, `prefers-reduced-motion`, `user-select: none` sur
  les contrôles, `kbd` stylés dans la légende.
- **Perf de rendu** : `content-visibility: auto` sur les rows, restauration du scroll après re-render,
  debounce 150 ms sur le filtre.
- **Feedback immédiat** : badges LED après copie, patch DOM ciblé (pas de re-render complet),
  toast/erreur dans la barre d'état, indicateur de scan désactivé + spinner.
- **Navigation 100 % clavier** : Command Registry déclaratif, historique Alt+←/→, filtre F7/`/`.

### Points faibles ⚠️
1. **« 100 % hors-ligne » contredit** : `style.css` fait `@import url('https://fonts.googleapis.com/…')`
   alors que la spec exige zéro CDN. Hors-ligne, bascule silencieuse sur la police système (acceptable,
   mais la revendication « app 100 % hors-ligne » est fausse). + fuite de vie privée (requête vers Google).
2. **`prompt()`/`confirm()` natifs** utilisés dans le gestionnaire de playlists (renommer, supprimer,
   nouvelle playlist) — incohérents avec le système de modales custom du reste de l'app (et non
   stylisables, non testables en vitest).
3. **Pas de responsive** : sidebar fixe 340 px, `column-count: 2` sur la source, `overflow: hidden` sur
   `body`. Sur écran < 1024 px ou fenêtre réduite, l'app devient inutilisable. Aucune enquête
   `@media` (hors reduced-motion).
4. **Accessibilité avancée absente** : pas de **focus trap** dans les modales (Tab s'échappe dans le
   DOM derrière), pas de `role="dialog"`/`aria-modal`, beaucoup d'éléments interactifs sont des `span`/
   `div` sans `tabindex` (menu contextuel, slots A–H — le clavier ne peut pas les atteindre, alors que
   tout le reste de l'app est clavier-first).
5. **États vides** : pas d'état « aucun dossier configuré » visuel dans les panneaux (juste la barre
   d'état) ; pas d'illustration/guidance pour le premier lancement.
6. **Un seul canal de messages** : toast et erreur partagent `#status-text` (un toast écrase une erreur
   et réciproquement) ; le toast « Prêt. » est écrasé par l'init sans re-persistance.
7. **Cache-buster** basé sur `mtime(script.js)` uniquement : une modif de `style.css` seule ne force pas
   le rechargement du CSS.
8. **Menu contextuel** : accessible souris uniquement ; pas d'équivalent clavier (ex. Shift+F10).
9. La modal d'édition de note (rating) : pas de validation visuelle de la plage 0–100 à la frappe
   (seulement au commit, silencieusement ignorée si hors plage).

---

## 5. Qualité du code, tests & process

### Points forts ✅
- **Architecture frontend propre** : `script.ts` orchestreur (~150 lignes), Command Registry déclaratif
  (premier binding gagnant), `state.ts` Proxy + EventEmitter + batch RAF, mutations pures dans
  `actions.ts`, factories DOM dans `render/`. La refonte `v0.2` est une vraie réussite.
- **API client robuste** (`api.ts`) : retry avec backoff, `ApiError` typé, pas de retry sur 4xx/5xx.
- **Ratings** : mise à jour optimiste avec rollback correct (tests dédiés).
- **Typecheck strict + build validé** (signatures textuelles post-minification dans
  `scripts/validate-build.js` — astucieux).
- **Backend NML soigné** : index `(FILE, FILESIZE)`, écriture atomique `.tmp` + `os.replace`, backup
  `.bak.nml` écrasé, header `standalone="no"`, tests pytest réels sur fixture.
- **Sécurité** : `is_path_allowed` (realpath, CWE-22) sur `/audio` et `/delete` ; `delete` restreint.
- **Doc de test sérieuse** (`docs/TESTING-GUIDE.md`) : SDD, contraintes constitutionnelles C1–C5,
  matrice raccourci↔test. Rare et précieux.

### Points faibles ⚠️
1. **Lint cassé** : 65 erreurs / 15 warnings / 15 infos (`noUnusedImports` dans `commands/filter.ts`,
   `commands/rating.ts`, format, etc.). Le README affirme « 0 erreurs » → faux. Aucun hook/CI ne protège.
2. **Tests verts ≠ feature OK** : les 3 bugs critiques (B1, B2, B3) sont **invisibles** pour la suite
   parce que l'intégration réelle (route en `__main__`, formes de données réelles, payload complet)
   n'est pas testée. C'est le problème de fond que ce rapport veut signaler : **la couverture est
   quantitative, pas toujours sémantique**.
3. **`as any` omniprésent** (~90 occurrences, surtout dans les tests mais aussi en prod :
   `eparsUI.ts`, `cueEditor.ts` (`entries: any[]`, `_regions: any`)). Le typage de `cueEditor.ts` est
   volontairement lâche — c'est lui qui a laissé passer B2.
4. **Duplication** : 3 implémentations quasi identiques de la création d'un nœud dossier
   (`renderDirTree` / `renderFilteredDirNode` / `buildSourceChildren`), `escapeHtml` dupliqué
   (playlistUI + ailleurs), logique de copie dupliquée (single vs batch dans `actions.ts`).
5. **Perf `sourceNodeMap`** : `new Map([...state.sourceNodeMap, [k, v]])` à **chaque nœud** → O(n²) sur
   les grosses bibliothèques ; avec le cache réel de 1,4 Mo, le re-render complet de la source peut
   dépasser la centaine de ms. Mutation en place + un seul `emit` serait mieux.
6. **Tests pytest** : le nouveau `test_app.py` valide les routes via import (donc « triche » sur B1) ;
   aucun test ne simule l'exécution `python app.py`.
7. **Pas de CI** : rien ne bloque un commit qui casse lint ou tests.
8. **README / docs obsolètes** :
   - « 313 tests, 14 fichiers » → réalité 540/25 ; « 59 pytest » → 91 ;
   - « 12 routes » → plus d'une vingtaine ; « 28 modules » → obsolète ;
   - `docs/TESTING-GUIDE.md` référence `integration.test.js` et `script.test.js` — ces fichiers
     **n'existent plus** (tout est en `.ts`), et le « fichier interdit » cité (`script.test.js`) a
     disparu avec la refonte : le guide doit être réécrit pour le présent.
   - Le plan `2026-08-08` lui-même : Task 9 étape 5 (vérification manuelle réelle) **non cochée** — c'est
     précisément là que B1/B2/B3 auraient dû être attrapés.

---

## 6. Sécurité & robustesse backend (compléments)

| Point | Évaluation |
|---|---|
| Path traversal (`/audio`, `/delete`) | ✅ protégé par `is_path_allowed` + `realpath` |
| `/api/track/match` | ✅ **aligné** depuis la review EPICs (2026-08-08, R2) : garde `is_path_allowed` → 403 hors dossiers autorisés + test dédié |
| Écriture NML | ✅ atomique + backup (mieux que les JSON de l'app, cf. B12) |
| Round-trip NML | ✅ objectif réaliste (attributs + ordre, pas byte-identical) — conforme à l'audit |
| Parse NML à chaque GET | ⚠️ 0,5 s de parse par requête (`get_nml_index` sans cache). Acceptable (1,5 s/POST mesuré), mais un cache mtime éviterait le re-parse sur `/match` |
| `load_json` | ⚠️ aucun try/except : un JSON corrompu fait crasher la route avec un 500 non formaté |
| Journal | ⚠️ pas de rotation ; écriture non atomique |

---

## 7. Recommandations priorisées

### P0 — débloquer le cue editor (faisable en ½ journée)
1. **B1** : déplacer `if __name__ == '__main__'` à la fin de `app.py` (+ test : vérifier via
   `subprocess` que les routes répondent, ou au minimum un commentaire + smoke-test manuel).
2. **B4** : ajouter play/pause + temps courant + seek dans la modal (`ws.playPause()`, bouton ▶, binding
   `Space`/`←→` via le registry, `on('interaction')`).
3. **B2** : `Number()` sur `start`/`len` à la frontière API ↔ `cuesToRegions` ; test avec la forme réelle.
4. **B3** : envoyer `entry` dans `saveCues` + test multi-match ; montrer `DIR`/`VOLUME` dans le sélecteur.
5. **B5** : préserver `TYPE∈{0,5}`/`HOTCUE=-1` dans `write_cues` + test.
6. **B7** : `ws?.destroy()` en tête de `renderWaveform`.
7. **B6** : validation serveur des cues (type/hotcue/start/len) + tests pytest.
8. Cocher/faire la **Task 9 étape 5** (vérification manuelle réelle) du plan.

### P1 — fiabiliser l'export NML
9. **B8** : champs `traktor_export_root`/`traktor_export_volume` dans l'UI Config ; message d'erreur si
   absent ; `DIR` calculé depuis l'emplacement réel des fichiers exportés.
10. **B9** : préserver `displ_order` au round-trip (metadata région).

### P2 — hygiène & UX générale
11. `npm run lint` à 0 (fix `noUnusedImports` + format) puis **hook pre-commit ou CI minimal**
    (typecheck + lint + vitest + pytest en 3 étapes GitHub Actions).
12. Corriger README/TESTING-GUIDE (chiffres réels, fichiers `.ts`, supprimer la référence à
    `script.test.js`).
13. Journal : couleurs par statut complet (dont `deleted`/`cues`/`export`) + bouton vider + écriture
    atomique + rotation (garder les 500 dernières).
14. Modales : focus trap + `role="dialog"`/`aria-modal` + `aria-label` sur ✕ ; rendre les contrôles
    clavier-first (slots A–H avec tabindex + touches A–H).
15. Police auto-hébergée (supprimer l'import Google Fonts) pour tenir la promesse hors-ligne.
16. Remplacer `prompt()`/`confirm()` par des modales custom (patterns déjà en place).
17. Cache-buster sur `style.css` aussi ; `@media` de repli pour les petites fenêtres.
18. Dédoublonner les rendus d'arbre ; muter `sourceNodeMap` en place + un `emit`.
19. Verrou simple sur `/scan` ; `save_json` atomique ; try/except sur `load_json`.
20. Ajouter des tests d'intégration « bout en bout » du cue editor (modal ouverte → region posée →
    POST avec le bon payload) — c'est le filet qui manque.

---

## 8. Conclusion

Le socle (architecture, tests, thème, backend NML) est **au-dessus de la moyenne** des outils locaux de
ce type. Mais le livrable du 08-08 ne tient pas la route : la chaîne « ouvrir l'éditeur → écouter →
poser un cue → sauvegarder » est **cassée à chaque maillon** (B4 → B2 → B1/B3), et la suite de tests —
pourtant massive — n'a pas détecté un seul de ces défauts parce qu'elle teste des formes de données et
des chemins d'exécution qui ne correspondent pas à la réalité. La leçon de process est aussi importante
que les bugs : **la vérification manuelle prévue par le plan (Task 9.5) a été sautée**, et c'est elle
qui aurait coûté 2 minutes pour révéler le 404.

L'effort recommandé est concentré : ~½ journée pour le P0 (7 correctifs ciblés, tous avec tests),
~½ journée pour le P1, puis l'hygiène P2 au fil de l'eau. Après cela, la fonctionnalité sera non
seulement démontrable, mais réellement utilisable.

---

## Annexe A — Commandes exécutées pendant l'audit

```
npm run typecheck                    → 0 erreur
npm run lint                         → 65 erreurs / 15 warnings / 15 infos
npm run build                        → OK (121 KB, validation 6 signatures OK)
npm test                             → 540 passed / 25 files
./venv/bin/python -m pytest -q       → 91 passed
python app.py & ; curl /api/nml/status → 200 ; POST /api/track/cues → 404
git log --oneline -25 ; git status   → historique des commits feature cue editor
```

## Annexe B — Fichiers audités (principaux)

- Backend : `app.py`, `nml.py`, `test_app.py`, `test_nml.py`, `tests/fixtures/nml-sample.xml`
- Frontend : `static/src/` (28 modules) — `script.ts`, `state.ts`, `actions.ts`, `api.ts`, `ui.ts`,
  `audio.ts`, `playlist.ts`, `ratings.ts`, `focus.ts`, `utils.ts`, `domPatches.ts`, `render.ts`,
  `render/*` (cueEditor, playlistUI, fileRow, sourceTree, eparsUI, ratingEdit, journalUI, dragDrop,
  batchCopy, index), `commands/*` (registry, navigation, audio, copy, filter, rating, playlist, modals)
- UI : `templates/index.html`, `static/style.css` (696 lignes)
- Outillage : `package.json`, `build.js`, `scripts/validate-build.js`, `vitest.config.js`,
  `tsconfig.json`, `biome.json`, `.gitignore`
- Docs : `README.md`, `llms.txt`, `docs/TESTING-GUIDE.md`, plans/specs/rapports superpowers
  (dont `2026-08-08-waveform-cue-editor.md` et `2026-08-08-nml-audit-real-collection.md`)
