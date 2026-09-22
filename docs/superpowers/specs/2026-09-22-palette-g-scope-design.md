# Spec — Palette « g » : écriture immédiate des tags + résolution de scope (EPIC-041)

> **Date** : 2026-09-22 · **EPIC** : [EPIC-041](../epics/EPIC-041-palette-g-ecriture-immediate-scope.md)
> **Périmètre** : palette `g` (page Sync) — cible, écriture des tags, affichage complet.
> **Hors périmètre** : le cue editor (moteur audio séparé), le filtre de la colonne Source
> Data (décision EPIC-037 P1 bis : filtre par nom de dossier, inchangé).

## 1. Le problème, en trois couches

Le geste utilisateur « je surligne un morceau, `g`, je choisis un style » traversait trois
couches qui pouvaient chacune l'annuler silencieusement.

```
[ binding g ]──(couche 1 : scope)──>[ palette ]──(couche 2 : affichage)──>[ choix ]──(couche 3 : écriture)──>[ fichier ]
```

| Couche | Défaut d'origine | Conséquence observée |
|---|---|---|
| 1 · scope | `registry.bind({ key: 'g', activePanel: 'epars' })` | Clic dans la colonne droite ⇒ `g` **inerte** ; morceau de Source Data **non taggable** |
| 2 · affichage | Styles filtrés par la taxonomie + **9 paliers** au lieu des années | Impossible de choisir l'année réelle du morceau (1991, 2006…) |
| 3 · écriture | Choix de session seulement ; TCON écrit par `apply_styles.py` **hors navigateur**, année **jamais** écrite | Aucun tag modifié côté fichier après le geste |

## 2. Couche 3 — l'écriture (serveur)

Deux routes, **une seule** implémentation de validation :

```
POST /styles/apply  { targets: [fullpath…], style: "techno_acid" }
POST /years/apply   { targets: [fullpath…], year:  "1991" }
→ { ok, written, count, results: [{ path, ok, frame, old, <style|year>, error? }] }
```

Ordre imposé par cible (jamais d'écriture sans trace) :

1. **Valeur** valide (style ∈ taxonomie des dossiers source ; année = 4 chiffres) ;
2. **Confinement** : `path` sous une racine configurée (`source_data` ou `epars_dirs`) et
   extension ∈ `.mp3 .flac .wav .m4a .mp4` ;
3. lecture de l'ancienne valeur ;
4. écriture du frame **natif du format** (mutagen) — miroir de
   `apply_styles.write_genre` / `apply_years.write_year` ;
5. **relecture** : `ok = (valeur relue == valeur demandée)` — un fichier verrouillé ou un
   format exotique ne peut pas « réussir » en silence ;
6. **journal** `{path, old, new, source: "palette", frame, ok, ts}` dans le **même** fichier que
   les scripts (`style_apply_journal.jsonl` / `year_apply_journal.jsonl`).

Conséquence voulue : `apply_years.py --undo` / `apply_styles.py --undo` annulent ce que la
palette a écrit, et un morceau déjà tagué par un script peut être corrigé à la souris.

Côté client, après réponse :

| Événement | Effet local |
|---|---|
| style écrit | `entry.genre = style` (index épars **ou** source) + chip « ✓ écrit » si la ligne est épars |
| année écrite | `entry.year = année` + `td.year` de **toutes** les lignes portant ce chemin |
| cible épars | `state.styleChoices.set(path, {style, tranche})` → `refreshStyleCells` + `updateStyleRecap` |
| cible source | **aucun** choix de session (déjà rangé : rien à planifier) |

## 3. Couche 1 — la résolution de scope (`commands/style.ts`)

Plus de garde `activePanel`. La cible est le **morceau surligné** (`.focused`) d'une des deux
listes de la page Sync, avec cet ordre de priorité :

```
1. un élément FILE  bat  un élément DIRECTORY
2. à égalité (deux fichiers) : le panneau actif (state.activePanel) gagne
3. la sélection multiple (Espace) est épars-only :
   elle ne s'applique que si la cible n'est pas un fichier de Source Data
```

Table de vérité (mesurée par le harnais, §5/§7/§8) :

| Focus épars | Focus droite | Panneau actif | Cible | Sortie |
|---|---|---|---|---|
| fichier | — | épars | ligne épars | palette (lot = sélection si non vide) |
| fichier | — | **source** | ligne épars | palette ← **régression corrigée** |
| fichier | **fichier** | source | fichier source | palette, titre « Source Data · … » |
| fichier | dossier | source | ligne épars | palette (1 bat 2) |
| — | dossier | source | — | message « `g` s'applique à un morceau… » |
| — | — | — | — | message « Aucun morceau surligné… » |

Motif du choix « fichier > dossier » : l'utilisateur a **pointé un morceau** à un moment
récent ; agir dessus vaut mieux que ne rien faire, et le titre de la palette nomme le fichier
(Échap ferme sans rien écrire). L'alternative « le panneau actif gagne toujours » rendait `g`
muet dès qu'un dossier était surligné — c'est précisément le symptôme signalé.

## 4. Couche 2 — l'affichage

- **Années** : `YEAR_MIN..YEAR_MAX` (1970→2026, 57 boutons) rendues en grille 10 colonnes, dans
  une zone **non défilante** de la palette → elles ne peuvent pas être poussées hors écran.
- **Styles** : tous, triés par volume (`byCountThenId`), avec leur hotkey ; la grille est
  plafonnée (`max-height: 45vh`, `overflow-y: auto`) et la palette bornée à la fenêtre
  (`max-height: calc(100vh - 24px)`, colonne flex) → une taxonomie de 42 styles ne dégrade pas
  l'accès aux années.
- Le titre annonce le scope (`Source Data · `) et l'état courant du tag
  (`genre « … » · année …`) ; `title` complet = le chemin.

## 5. Preuve

`scripts/proof_style_palette.py` — monde Flask isolé (`capture_ui.build_world`, `data/` réel
jamais touché), Chrome headless via CDP, **touches et clics réels** (`Input.dispatch*`), et
lecture des tags **sur disque** par mutagen (pas la réponse HTTP).

- 9 vérifications (monde normal) / 10 avec `PROOF_EXTRA_STYLES=40` ;
- contrôle d'état initial (`TCON=None TDRC=None`) et contrôle de sensibilité par mutation :
  réintroduire `activePanel: 'epars'` ⇒ 4/9 en échec ; neutraliser `findSourceEntry` ⇒ 2 tests
  unitaires en échec ;
- ⚠ **rebuild obligatoire** (`npm run build`) : le JS/CSS est bundlé, un harnais lancé sans
  rebuild mesure la version précédente.

## 6. Ce qui n'est pas couvert

- Vérification sur la collection réelle (frames de production `.flac`/`.mp3`, ressenti du
  scope quand les deux colonnes sont surlignées).
- Aucune annulation **dans** la palette : l'undo passe par le journal des scripts
  (`--undo`), pas par l'UI.
