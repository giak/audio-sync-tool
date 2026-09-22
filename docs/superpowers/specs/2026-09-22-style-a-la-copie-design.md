# Spec — Le style est écrit au moment de la copie (F5)

> **Créée** : 2026-09-22 · **Statut** : validée (implémentée en EPIC-043)
> **Demande d'origine** : « quand je fais F5, je copie un fichier depuis Sync →
> Éparpillé vers Source Data, cela doit mettre à jour l'ID3 *style* (**pas année**)
> grâce au nom du dossier de destination de la copie. Le fichier se met à jour des
> deux côtés : Éparpillé et Source Data. »
> **Docs liées** : EPIC-043 · EPIC-035 (grammaire `<style>_<tranche>`, palette `g`) ·
> EPIC-041 (écriture immédiate des tags depuis le navigateur) · EPIC-034 (F5, pastille
> « déjà rangé », auto-expansion du dossier cible)

## Le problème

Aujourd'hui, F5 copie le fichier **sans toucher aux tags**. Le rangement par style
(EPIC-035) a deux moitiés qui ne se rejoignent jamais :

| Chemin | Effet sur le tag genre |
|---|---|
| Palette `g` (EPIC-041) — choix explicite | TCON/GENRE/©gen écrit **tout de suite** |
| F5 nu (copie vers un dossier `<style>_<tranche>`) | **rien** : la copie garde son ancien genre |
| Aperçu `e` (EPIC-035 P3) | choix exporté dans `style_review.json` → `apply_styles.py --review`, **hors navigateur** |

Conséquence mesurable : un fichier rangé dans `techno_acid_1990` peut porter
`genre = Blues`. Le scan suivant relit `Blues`, la colonne *Style* n'affiche pas le
chip « écrit ✓ » (il compare `entry.genre === choix.style`), la vue Sync paraît
incohérente avec le rangement qu'on vient de faire à la main, et le genre fautif
part dans les caches d'enrichissement (le signal « genre ID3 aliasé » de
`styleSuggest`, poids 0,15).

Or **le dossier de destination EST la décision de style** : dans cette app, la
grammaire `<style>_<tranche>` n'est pas décorative, c'est la seule déclaration
humaine du style. Puisque la copie enregistre cette décision dans le système de
fichiers, elle doit aussi l'enregistrer dans le tag — au même instant.

## Décisions

1. **Source de vérité = le nom du dossier de destination**, premier segment du
   chemin relatif à la racine Source Data : `<root>/techno_acid_1990/x.mp3` →
   `techno_acid` ; `<root>/techno_acid_1990/2008_08/x.mp3` → `techno_acid`
   (même règle que la taxonomie client et que `_known_styles()`).
2. **Grammaire stricte, identique au client** : `parseFolderName`
   (`static/src/styles.ts`) = `^[a-z]+(?:_[a-z]+)*?(?:_\d{4})?$`. Un dossier hors
   grammaire → **aucun style dérivé, aucun tag écrit** (le comportement actuel est
   préservé). Les dossiers techniques (`_trash`, `_playlists`, `_oldies` — préfixe
   `_`), datés (`2008_08`) ou capitalisés ne déclarent rien.
3. **Pas de validation contre la taxonomie connue.** La palette, elle, refuse un
   style hors `_known_styles()`, parce qu'un choix de palette doit être un style
   *existant*. À la copie, le dossier de destination **existe physiquement** : c'est
   une déclaration plus forte, et un dossier neuf (`techno_acid_1995` créé via ➕
   puis rempli au F5) doit fonctionner du premier coup. C'est un **écart assumé**
   avec `/styles/apply`, justifié par la nature différente de l'entrée.
4. **Les deux fichiers**, comme demandé : l'épars d'origine **et** la copie rangée.
   Sinon le scan suivant remonterait l'ancien genre sur l'épars, la cellule *Style*
   mentirait (« écrit ✓ » absent) et le fichier serait à moitié rangé.
5. **L'année n'est jamais écrite** (demande explicite). La tranche du dossier
   (`_1990`) reste une information de rangement ; `TDRC`/`TYER`/`DATE`/`©day` ne
   sont touchés par aucune route de copie.
6. **Idempotence** : `old == style` → ni écriture, ni ligne de journal,
   `changed: false`. Les copies sont fréquentes ; sans ce filtre, le journal
   d'annulation (`style_apply_journal.jsonl`) se remplirait de non-événements et
   `--undo` deviendrait illisible.
7. **Jamais bloquant** : la copie est la tâche, le tag est un effet de bord. Échec
   d'écriture (format non géré, permission, fichier absent, mutagen manquant) →
   rapporté dans la réponse (`style_writes[].error`), la copie reste `ok`.
8. **Journal partagé avec les scripts** (`data/style_apply_journal.jsonl`,
   `source: "copy-f5"`, `old`/`new`/`ok`) → `apply_styles.py --undo` restaure, y
   compris le cas `old: null` (retrait du frame, déjà géré par `restore_genre`).
   C'est la **seule** sortie de secours : l'écriture de l'épars est une mutation du
   fichier d'origine, consentie explicitement par la demande.
9. **Périmètre = la route `/copy`**, donc tous ses appelants : F5 simple, F5 batch
   (multi-sélection), aperçu de rangement `e` (EPIC-035), plan de groupe (EPIC-032),
   remplacement qualité (EPIC-028). `/move` (dont `_trash`) **hors périmètre** : un
   déménagement vers le trash ne déclare pas de style.
10. **Consentement dans la modale** : le texte de confirmation de F5 annonce
    l'effet de bord (`Le style « X » sera écrit dans le tag (épars + copie).`)
    quand le dossier cible en déclare un. Pas de case à cocher, pas de config : une
    phrase au moment de confirmer.

## Contrat d'API

`POST /copy` — champs de réponse ajoutés (les anciens sont inchangés) :

```json
{
  "ok": true,
  "year": "1991", "duration": 337, "codec": "FLAC 1011kbps", "genre": "techno_acid",
  "style": "techno_acid",
  "style_error": null,
  "style_writes": [
    {"path": "/epars/…/x.flac", "role": "epars", "ok": true, "changed": true,
     "old": "Blues", "style": "techno_acid", "frame": "GENRE"},
    {"path": "/src/techno_acid_1990/x.flac", "role": "copie", "ok": true,
     "changed": true, "old": "Blues", "style": "techno_acid", "frame": "GENRE"}
  ]
}
```

- `style` : style dérivé (`null` hors grammaire ou hors racine Source Data).
- `style_writes` : un objet par fichier de la paire, jamais vide quand `style` est
  non nul et mutagen disponible. `changed: false` = déjà au bon genre.
- `genre` (existant) est lu **après** l'écriture → il reflète le tag final.

## Tests

Backend (`test_app.py`) : style dérivé du dossier (sous-dossier inclus) ; dossier
hors grammaire (`_trash`, `2008_08`, `_oldies`) → aucun tag écrit ; copie hors
racine Source Data → aucun tag ; écriture sur **les deux** fichiers + journal
`source: "copy-f5"` ; idempotence (seconde copie = `changed: false`, zéro ligne de
journal) ; échec d'écriture non bloquant (copie `ok`, `style_writes[].ok` faux) ;
`.wma` non touché.

Frontend (`actions.test.ts`) : la réponse `/copy` patche le `genre` de l'entrée
épars et l'entrée source, et le statut annonce le style écrit / déjà à jour /
refusé ; l'absence de style ne change pas le message d'origine.

## Risques connus

- **Un dossier dont le nom ment** (copie de techno dans `hardcore_1990`) écrit un
  tag faux. La grammaire du dossier est la déclaration du rangement : si le
  rangement est faux, le tag l'est aussi — c'est cohérent, et `--undo` existe.
- **L'écriture de l'épars** modifie un fichier non rangé. C'est la demande
  explicite (« le fichier se met à jour des deux côtés ») et le geste F5 est
  confirmé par modale en connaissance de cause.
- **Écart palette/copie** (décision 3) : un style peut arriver dans un tag via la
  copie sans être un style « connu » de la taxonomie. Il le devient dès que le
  dossier contient un fichier (donc immédiatement après la copie).
