# EPIC-050 — L'écriture se voit, et sur la forme réelle des chemins

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : [spec](../specs/2026-09-22-ecriture-visible-et-double-slash-design.md) · EPIC-041 (écriture immédiate) · EPIC-043 (style à la copie) · EPIC-046 (cellule Style)

## Objectif

Après une écriture de tag (`g`, F5, revue), **l'écran doit suivre le disque** —
et `g` doit faire, sur un fichier rangé, ce que l'utilisateur attend : une frappe,
pas une palette à cliquer.

## Contexte & découvertes

Signalements : « la mise à jour ID3 dans les 2 colonnes ne s'est pas faite »,
puis « quand j'utilise `g`, cela ne met toujours pas à jour ». Mesuré sur un bac
à sable isolé (voir la spec pour le tableau complet) :

1. **Le cache n'était pas patché** par `/styles/apply` / `/years/apply` —
   contrairement à `/copy` et `/styles/align`. Conséquence mesurée : après
   l'écriture, **le disque disait `house` et le cache `techno_hard`** ; `/load`
   (donc la cellule) resservait l'ancienne valeur au rechargement, et
   `/styles/audit` continuait de compter le fichier « à corriger ».
2. **Le chemin réel a un double slash.** La config réelle porte
   `source_data = …/style/` : les chemins joints sont `…/style//techno_acid_1990/…`.
   `sourceStyleOf` comparait sans plier les slashes → `null` → **aucune cellule
   Style** et **aucun alignement** chez l'utilisateur, alors que l'EPIC-046 était
   vert (sa fixture n'avait pas cette forme).
3. **`g` sur un rangé n'écrivait rien** : il ouvrait la palette et attendait un
   clic, alors que le dossier de rangement **déclare** déjà le style.

## Tâches

- [x] `_apply_tag` : patcher l'index après une écriture réussie (une seule
      écriture de cache par lot, jamais par cible), et exposer `cache_updated`
- [x] Ne rien patcher quand l'écriture échoue (fichier absent, style refusé)
- [x] `sourceStyleOf` : plier les slashes des deux côtés (chemin **et** racine)
- [x] `g` sur un fichier rangé → écriture du style déclaré par le dossier ;
      dossier hors grammaire → palette ; épars → palette
- [x] La cellule Style d'un rangé se met à jour après l'écriture
      (`refreshSourceStyleCells`) et le statut annonce `apply_styles.py --undo`
- [x] Tests : 6 pytest + 6 vitest, dont la forme réelle du chemin (double slash)
- [x] Docs : spec + registre + README à l'état réel

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `_apply_tag` patche le cache (`_cache_update_meta`), `cache_updated` |
| `static/src/render/styleCell.ts` | `sourceStyleOf` plie les slashes ; cellule déjà rafraîchie |
| `static/src/render/stylePalette.ts` | `writeStyleTagFor` + `alignStyleToFolder` (exporté) |
| `static/src/commands/style.ts` | `g` : rangé → alignement sur le dossier, sinon palette |
| `static/styles/pages/sync.css` | (.style-chip → rien de nouveau ; voir EPIC-046/047) |
| `test_app.py` | 3 tests (cache, audit, échec sans patch) |
| `static/src/commands/style.test.ts` | 3 tests (rangé, hors grammaire, épars) |
| `static/src/render/stylePalette.test.ts` | 2 tests (`alignStyleToFolder` ✓ / échec) |
| `static/src/render/styleCell.test.ts` | 1 test (double slash) |

## Validation

- [x] Typecheck (`npx tsc --noEmit`) — 0
- [x] Tests frontend (`npx vitest run`) — **1 201 / 52 fichiers**
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **367**
- [x] Lint (`npm run lint`) — 0
- [x] Build (`npm run build`) — OK
- [x] Navigateur (bac à sable, config à slash final) : `g` → `✓ techno_hard`,
      `cache_updated: true`, `/load` d'accord avec le disque, année intacte

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `…` | `fix: EPIC-050 — l'écriture met l'index à jour, g aligne le rangé` |

## Décisions

- **Patcher l'index dans la route qui écrit** (plutôt que « rescanner ») : un scan
  de la collection coûte 433 s ; le patch coûte une lecture/écriture du cache.
- **Le patch suit le succès relu** (`get_audio_meta` après écriture), pas
  l'intention : c'est le même critère que le journal.
- **`g` écrit sans confirmer sur un rangé** : cohérent avec la palette (clic =
  écriture) et la copie F5 ; annulation par `apply_styles.py --undo`.
- **Le double slash n'est pas « nettoyé » à la source** : la forme des chemins est
  partagée par toute l'app (clés de cache, datasets DOM) ; on plie **au moment de
  comparer**, pas dans les données.

## Notes / Risques

- `_cache_update_meta` cherche le parent dans les racines connues : un fichier
  hors racines (écriture refusée de toute façon) n'est jamais patché.
- Si le cache est absent (jamais scanné), le patch est un no-op silencieux : rien
  à mettre à jour, et `cache_updated: false` le dit.
- La cellule Style d'un rangé reste **vide** pour un dossier hors grammaire
  (`_trash`, `2008_08`, dossier capitalisé) : c'est volontaire (aucune cible
  inventée), et `g` ouvre alors la palette.
