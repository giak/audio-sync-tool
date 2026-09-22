# EPIC-043 — Le style est écrit à la copie : F5 range **et** tague (épars + copie)

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : spec `2026-09-22-style-a-la-copie-design.md` · EPIC-035 (grammaire `<style>_<tranche>`) · EPIC-041 (écriture immédiate depuis le navigateur) · EPIC-034 (flux F5)

## Objectif

Quand F5 copie un fichier épars vers un dossier de Source Data, le style déclaré par
le **nom du dossier de destination** est écrit dans le tag genre — **sur la copie
rangée et sur l'épars d'origine** — immédiatement, dans le journal partagé avec les
scripts. L'année n'est **jamais** touchée.

## Contexte & découvertes

Retour d'usage : le rangement par style a deux moitiés qui ne se rejoignaient pas.

- La **palette `g`** (EPIC-041) écrit le TCON tout de suite — mais seulement si on
  l'utilise.
- **F5 nu** copiait sans toucher aux tags : un fichier rangé dans `techno_acid_1990`
  pouvait garder `genre = Blues`.
- L'**aperçu `e`** (EPIC-035 P3) exportait le choix vers `style_review.json` pour
  `apply_styles.py --review`, donc **hors navigateur**, après coup.

Conséquences réelles du trou : le scan suivant relit le genre fautif ; la cellule
*Style* n'affiche pas le chip « écrit ✓ » (elle compare `entry.genre === choix.style`) ;
le filtre par genre (EPIC-037/`filterEngine`) et le signal « genre ID3 aliasé » de
`styleSuggest` (poids 0,15) travaillent sur une valeur qui contredit le rangement.

Le dossier cible, lui, **est** la décision de style : la grammaire `<style>_<tranche>`
est la seule déclaration humaine du style dans cette app. La copie enregistre cette
décision dans le système de fichiers ; elle doit l'enregistrer dans le tag au même
instant.

## Tâches

- [x] Spec de conception (source de vérité, grammaire, écart assumé avec `/styles/apply`, idempotence, non-bloquant)
- [x] Backend : `_style_of_folder` / `_style_of_dest_dir` (miroir de `styles.ts::parseFolderName`), `_write_style_at_copy` (journal `source: "copy-f5"`), branchement dans `/copy`
- [x] Cache : genre de l'épars mis à jour après écriture (le scan suivant relit la même vérité)
- [x] Tests pytest du contrat (dérivation, hors grammaire, hors racine, idempotence, non-bloquant, `.wma`)
- [x] Frontend : `genre` patché dans l'état (épars + source), cellule *Style* rafraîchie, message de statut, phrase de consentement dans la modale F5 (et note dans le toast de l'aperçu `e`)
- [x] Tests vitest du contrat frontend (dérivation + table de noms partagée, patch des deux côtés, hors grammaire, échec rapporté, consentement)
- [x] README (feature « Rangement par style ») et index EPIC

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `STYLE_FOLDER_RX`, `_style_of_folder`, `_style_of_dest_dir`, `_write_style_at_copy`, `/copy` (réponse `style` / `style_writes` / `style_error`), cache épars |
| `static/src/actions.ts` | `CopyStyleWrite`/`CopyResponse`, `styleOfDestDir`, `styleConsentLine`, `styleNoteOf`, `applyCopyStyle`, `copyFilesTo` (retour `{copied, styleNote}`) + F5 simple |
| `static/src/domPatches.ts` | `patchSourceFileAfterCopy` accepte `genre` (l'entrée poussée dans l'arbre le porte) |
| `static/src/render/styleCell.ts` | inchangé (`refreshStyleCell` est réutilisé) |
| `static/src/render/stylePreview.ts` | l'aperçu `e` remonte la note de style de chaque copie dans son toast |
| `static/src/styles.ts` | inchangé (la grammaire est réutilisée telle quelle par `parseFolderName`) |
| `test_app.py` | contrat backend |
| `static/src/actions.test.ts` · `static/src/render/stylePreview.test.ts` · `static/src/styles.test.ts` | contrat frontend (dont la **table de noms partagée avec Python**) |
| `README.md` | une ligne dans « Rangement par style » |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npm test`) — **1 154 vitest / 50 fichiers** (`test:shuffle:gate` rejoué : 3 graines fixes, vert)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **342 pytest / 12 fichiers**
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`)

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `feat: EPIC-043 — F5 range et tague : le style du dossier cible est écrit (épars + copie)` |

## Décisions

1. **Le nom du dossier de destination est la source de vérité** (premier segment du
   chemin relatif à la racine Source Data) — même règle que la taxonomie client et
   `_known_styles()`.
2. **Grammaire stricte identique au client** (`^[a-z]+(?:_[a-z]+)*?(?:_\d{4})?$`) :
   `_trash`, `_playlists`, `_oldies`, `2008_08` ne déclarent **rien** → aucun tag
   écrit, comportement d'avant préservé.
3. **Pas de validation contre la taxonomie connue** (écart assumé avec
   `/styles/apply`) : à la copie le dossier existe physiquement, c'est une
   déclaration plus forte que la liste des styles dérivée du scan, et un dossier
   neuf (`techno_acid_1995` via ➕ puis F5) doit marcher du premier coup.
4. **Les deux fichiers** (épars + copie) : sinon le scan suivant remontrerait
   l'ancien genre sur l'épars et la cellule *Style* mentirait.
5. **L'année n'est jamais écrite** par une copie (la tranche du dossier n'atteint
   jamais `TDRC`/`TYER`/`DATE`/`©day`).
6. **Idempotence** : `old == style` → ni écriture ni journal. Les copies sont
   fréquentes ; le journal d'annulation doit rester lisible.
7. **Jamais bloquant** : la copie est la tâche, le tag un effet de bord ; un échec
   est rapporté (`style_writes[].error`) et la copie reste `ok`.
8. **Journal partagé** `data/style_apply_journal.jsonl`, `source: "copy-f5"` →
   `apply_styles.py --undo` reste la sortie de secours (y compris `old: null`).
9. **Périmètre = `/copy`** donc F5 simple, F5 batch, aperçu `e` (EPIC-035), plan de
   groupe (EPIC-032), remplacement (EPIC-028) ; `/move` et `_trash` hors périmètre.
10. **Consentement** : une phrase dans la modale de confirmation F5 annonce
    l'écriture du tag — pas de case à cocher ni de config.

## Notes / Risques

- **Un dossier dont le nom ment** écrit un tag faux. C'est cohérent (le tag suit le
  rangement déclaré) et `--undo` existe ; le risque est tracé, pas caché.
- **L'épars est muté** : c'est la demande explicite. Le journal est la seule
  sauvegarde, la modale le dit avant.
- **Miroir de grammaire Python/TS** : deux implémentations de la même règle, tenues
  honnêtes par une **même table de noms** testée des deux côtés
  (`test_app.py` / `actions.test.ts`), comme le couple `_write_tag` /
  `apply_styles.write_genre`.
- **Non couvert** : `/move` (trash), les bibliothèques de playlist, et le cas d'un
  fichier copié **puis** dont le dossier est renommé (le tag garde l'ancien style
  jusqu'à la prochaine copie ou palette).
