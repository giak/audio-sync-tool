# EPIC-007 — Ajouter une piste absente au collection.nml

> **Statut** : 🟢 Livré
> **Créée** : 2026-08-08 · **Dernière mise à jour** : 2026-08-08
> **Priorité** : Haute
> **Docs liées** : [plan beatgrid](plans/2026-08-08-beatgrid-calage-bpm-basse.md) · rapport audit §3

## Objectif

Sortir du cul-de-sac « ⚠️ Piste absente de la collection — sauvegarde des cues impossible » : permettre de
**créer l'ENTRY dans le collection.nml** depuis l'éditeur, puis basculer immédiatement en mode édition.

## Tâches

- [x] **`nml.py`** : `build_entry_element(meta, filesize, playtime, volume, dir_attr)` (ENTRY valide :
      LOCATION FILE/DIR/VOLUME, ALBUM, MODIFICATION_INFO, INFO avec FILESIZE/PLAYTIME/PLAYTIME_FLOAT) ;
      `append_entry(tree, el)` (append au COLLECTION + compteur ENTRIES).
- [x] **`app.py`** : helper `get_audio_tags` (title/artist/album/bitrate/playtime via mutagen, fallback
      nom de fichier) ; route **`POST /api/track/add`** : path existant (404), `is_path_allowed` (403),
      NML configuré (400), déjà présent → `ok+already` (pas de doublon), volume = requête sinon
      config `traktor_export_volume` sinon `TRAKTOR_USB` (max 64 car.), DIR = relatif au dossier source
      (normpath, cas racine `rel=''`), save_nml avec `.bak`, journal.
- [x] **Frontend** : ligne « ➕ Ajouter à la collection » dans la modal (volume pré-rempli depuis la
      config) ; re-match après ajout → **mode édition** ; état « ⏳ ajout… » + erreurs toast.
- [x] **Fix review** : **race condition** (fermer la modal pendant l'ajout la ré-ouvrait et crasnait →
      garde `state.activeModal !== 'cueEditor'` après la requête) ; cas **racine du dossier source**
      (slash final → DIR embarquant le chemin Linux absolu → normpath + rel='').
- [x] **Journal** : statut `collection` rendu proprement (fallback « erreur » supprimé).

## Fichiers impactés

`nml.py` · `app.py` · `static/src/render/cueEditor.ts` · `static/src/render/cueEditor.test.ts` ·
`static/src/render/journalUI.ts` · `templates/index.html` · `static/style.css` · `test_nml.py` ·
`test_app.py`

## Validation

- Tests : ajout OK (fichier + backup + re-match), déjà présent, 404/403/400, override volume, racine
  dossier source, flux complet frontend + erreur + reset + **race**.
- Suite complète : 614 vitest / 127 pytest / typecheck / lint / build.

## Traçabilité (commits)

> Livré en working tree dans la session du 2026-08-08. À commiter en référençant cette EPIC.

## Décisions

- Le volume saisi doit correspondre au **montage réel de Traktor** (ex. `D:`) — c'est lui que Traktor
  voit dans LOCATION/VOLUME.
- Traktor régénérera l'analyse (AUDIO_ID, BPM, beatgrid) au prochain scan — assumé et documenté.
