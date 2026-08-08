# EPIC-006 — Snap beatgrid (BPM détecté/saisi) + lecture de boucle

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) (préambule)

## Objectif

Caler les cues/loops dessinés sur une grille de beats et permettre l'écoute continue d'une boucle.

## Contexte & découvertes

- Traktor 4 n'exporte ni `<BEATGRID>` ni BPM dans la forme attendue → **hypothèse de départ** : grille
  calculée depuis un BPM détecté (WebAudio) ou saisi manuellement. (Cette hypothèse sera **réfutée** par
  l'EPIC-008 : la donnée existe, sous `TEMPO` + `CUE_V2 TYPE=4/GRID`.)
- **Bug pré-existant découvert** : les loops dessinés par drag recevaient un id **chaîne aléatoire**
  (`region-x7k2`) → sauvegarde avec `HOTCUE="region-x7k2"` → **400 backend**. Correctif : slot A–H libre.

## Tâches

- [x] **`beatgrid.ts`** : `beatInterval`, `buildBeats`, `snapToBeat` (recherche binaire), détection tempo
      par autocorrélation centrée + **comb pondéré 4 harmoniques** (détecte l'harmonique quand le tempo
      vrai est hors bornes, ex. 60→120), garde de variance **relative à l'énergie** (signal plat → 0),
      `detectBPMFromUrl` (fetch + decodeAudioData + enveloppe d'énergie + diff première rectifiée).
- [x] **Transport** : champ BPM (redessine la grille), bouton **🧲 Snap** (actif par défaut), bouton
      **🔁 Play** (lecture continue de la boucle sous le curseur, relance sur `finish`, bouton pulsant).
- [x] **Grille visuelle** : overlay de lignes, tous les 4 temps renforcées.
- [x] **Slots** : id A–H libre pour les loops dessinés (toast si 8 slots pleins).
- [x] **Fix review** : suppression de la boucle en lecture → `pause()` immédiat (clavier Suppr + clic-droit).

## Fichiers impactés

`static/src/beatgrid.ts` (créé) · `static/src/beatgrid.test.ts` (créé) ·
`static/src/render/cueEditor.ts` · `static/src/render/cueEditor.test.ts` · `templates/index.html` ·
`static/style.css`

## Validation

- 9 tests dédiés dans `beatgrid.test.ts` + tests snap/BPM/lecture-boucle dans `cueEditor.test.ts`
  (62 tests au total sur les 2 fichiers), suite complète verte — stabilisée en `--sequence.shuffle`
  (voir rapport `2026-08-08-audit-epics-review.md` §3).

## Traçabilité (commits)

> Commit : `e9391b2` (`feat(cue-editor): snap beatgrid + lecture de boucle (🔁 Play) + slots A–H pour
> les loops [EPIC-006]`).

## Décisions

- Snap au **temps** (phase supposée t=0 faute de marker) — corrigé ensuite par EPIC-008 (phase native).
- Détection best-effort : ne **jamais bloquer** l'éditeur si le BPM est introuvable.
