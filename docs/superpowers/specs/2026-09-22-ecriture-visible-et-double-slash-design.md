# Écriture de tag : l'index suit le disque (EPIC-050)

> **Statut** : conception validée, implémentée
> **Créée** : 2026-09-22
> **Docs liées** : [EPIC-050](../epics/EPIC-050-ecriture-visible-et-double-slash.md) ·
> EPIC-041 (écriture immédiate) · EPIC-043 (style à la copie) · EPIC-044 · EPIC-046

## Le signalement, mot pour mot

> « quand je fais F5, je copie un fichier depuis "sync" > "éparpillé" vers
> "source data" […] la mise à jour ID3 dans les 2 colonnes ne s'est pas faite ? »
> « Quand j'utilise "g", la raccourcie, cela ne met toujours pas à jour !!!! »

Trois défauts distincts se cachaient derrière.

## Ce qui a été mesuré

Bac à sable isolé (`/tmp/e46`, `DATA_DIR` redirigé, aucun accès à la collection
réelle), un seul fichier `02 - Joey Beltram - Energy Flash.mp3` (genre
`techno_acid`, année 1990) et trois dossiers de destination dont deux **vides**.

| Ce qu'on teste | Résultat mesuré |
|---|---|
| `POST /copy` vers `techno_hard_2005` | `style: "techno_hard"`, `style_writes` **2** entrées `ok`, `changed` — journal `copy-f5` ×2, année **1990 intacte** |
| Tag relu par mutagen, épars ET copie | `techno_hard` / 1990 des deux côtés |
| `/styles/apply` (chemin de `g`), puis `/load` | **DISQUE `house`, CACHE `techno_hard`** — la cellule reprenait l'ancienne valeur |
| `/styles/audit` après l'écriture | comptait encore le fichier « à corriger » |
| `g` sur un fichier rangé | ouvrait la palette et **n'écrivait rien** (il fallait cliquer un style) |
| Cellule Style d'une ligne Source Data, **config réelle** (`source_data` = `…/style/`) | **absente** : le chemin joint est `…/style//techno_hard_2005/…` (double slash) et `sourceStyleOf` rendait `null` |
| Dossiers vides (`breakbeat_2000`, `house_1995`) | apparaissent dans `extra_dirs`, et `/styles/apply` les **accepte** (avant : 400 « style inconnu ») |

## Décisions

**1. L'index est patché par la route qui écrit.** `/copy` et `/styles/align` le
faisaient déjà ; `/styles/apply` et `/years/apply` ne le faisaient pas. Le disque
est autoritaire, donc l'index doit suivre **dans la même requête** — sinon
`/load` (et donc l'écran) ressert une valeur périmée dès le rechargement, et
l'aperçu d'alignement réclame une correction déjà faite. Le patch est
conditionné au succès (`ok`) : l'index ne raconte jamais une écriture qui n'a pas
eu lieu (`cache_updated` dans la réponse, `false` sinon).

**2. Les chemins sont pliés avant toute comparaison de racine.** La config réelle
porte un slash final, donc les chemins joints par `sourceTree` contiennent un
double slash. Une seule normalisation (`/+` → `/`) suffit partout où on teste
l'appartenance à une racine.

**3. `g` sur un fichier rangé écrit le style du dossier.** Un fichier rangé est
**dans** sa déclaration de style (EPIC-035/043) : il n'y a rien à choisir. Le clic
sur la cellule Style garde la palette (pour un **autre** style), `g` fait le geste
attendu en une frappe. Un dossier hors grammaire (`_trash`, `2008_08`) ne déclare
rien → la palette s'ouvre, aucun style n'est deviné.

## Ce qui n'est pas fait (assumé)

- Pas de « dry-run » sur `/styles/apply` : l'écriture est immédiate par
  conception (c'est le contrat d'EPIC-041, journal partagé + `--undo`).
- `g` **écrit** sans confirmation sur un rangé. C'est le comportement de la
  palette (clic = écriture) et de la copie F5 ; la barre d'état annonce
  l'écriture et la commande d'annulation.

## Preuves

- 6 pytest nouveaux (dont un qui vérifie que `/styles/audit` **cesse** de compter
  un cas corrigé, et un qui vérifie qu'un échec ne patche pas l'index).
- 6 vitest nouveaux (`g` rangé → alignement ; dossier hors grammaire → palette ;
  épars → palette ; double slash ; cellule marquée ✓ ou pas selon le succès).
- Navigateur : `g` sur la ligne Source Data d'un bac à sable → `✓ techno_hard`,
  statut `✓ style « techno_hard » écrit dans le tag (1 fichier) — annuler :
  apply_styles.py --undo`, `cache_updated: true`, `/load` d'accord avec le disque.
