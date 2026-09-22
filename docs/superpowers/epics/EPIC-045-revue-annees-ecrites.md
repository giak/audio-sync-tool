# EPIC-045 — Revue des années déjà écrites : l'audit d'EPIC-040 a enfin une surface

> **Statut** : 🟢 Livré
> **Créée** : 2026-09-22 · **Dernière mise à jour** : 2026-09-22
> **Priorité** : Haute
> **Docs liées** : spec `2026-09-22-revue-annees-ecrites-design.md` · EPIC-040 (moteur + audit, dont c'est le dernier maillon) · EPIC-033 (vue Années, choix locaux + export) · EPIC-041/043/044 (grammaire d'écriture : aperçu → décision → journal partagé → `--undo`)

## Objectif

Rendre **visible et tranchable dans l'app** ce que l'audit des années déjà
écrites avait trouvé et qui vivait dans un fichier JSON : chaque cas où le tag
dit autre chose que les sources, avec le choix **corriger** (écriture immédiate,
journalisée, annulable) ou **garder** (rien n'est touché, le cas sort de la file).

## Contexte & découvertes

EPIC-040 a corrigé le robinet (orientations de clé, garde artiste/titre, Discogs
en 3ᵉ provider, règle des 2 providers concordants) **et** produit un audit des
écritures passées — `scripts/audit_applied_years.py` → `data/year_audit.json`.
Mesuré le 2026-09-22, **408 entrées** :

| Verdict | Nb | Sens |
|---|---|---|
| `confirme` | 23 | une source « première sortie » corrobore le tag |
| **`contredit`** | **38** | le tag dit autre chose que la première sortie — **proposition** fournie |
| `a_revoir` | 8 | désaccord sans signature de réédition |
| `non_verifie` | 339 | 100 aucune source / 13 candidats sans corroboration / 226 une seule source « édition » |

L'EPIC-040 listait noir sur blanc ce qui manquait : « **reste** : re-collecte
complète + **exposition en revue (vue Années)** + audit des 408 ». L'audit est
fait (contrairement à ce que disaient encore les docs), la re-collecte v2 est
engagée — il restait **le maillon entre le fichier et l'humain**. Sans lui, le
mode d'échec signalé au départ (une **réédition** écrite comme année du morceau :
« Inner Light » **2024** pour un morceau de **1991**) restait invisible : la vue
Années ne montre que les fichiers **sans** année.

Vérifié dans le navigateur sur les données réelles : les 38 `contredit` portent
une proposition utilisable, et l'écart est souvent net (`écrit 2003 → 1999`,
`écrit 2015 → 1987`, `écrit 2006 → 1985`).

## Tâches

- [x] Spec de conception (périmètre, décisions persistées, disque autoritaire, non-bloquant, dégradation silencieuse)
- [x] Backend : `GET /years/audit` (lecture seule, items par verdict, `non_verifie` allégés et comptés par classe)
- [x] Backend : `POST /years/audit/review` (`corriger` écrit **tout de suite** via `_write_target`, journal partagé `source: "audit:revue"` ; `garder` ne touche à rien) + persistance `data/year_audit_review.json`
- [x] Décisions comptées sous le nom de l'**action** (`corriger`/`garder`) — un seul vocabulaire du POST à la vue
- [x] Le disque est autoritaire : déjà au bon millésime → `deja`, aucune réécriture, aucune ligne de journal
- [x] Tests pytest du contrat (11 : verdicts, lecture seule, journal, `old` conservé, classe des raisons, refus nommés, confinement, `--undo` réel)
- [x] Frontend : module `render/yearAudit.ts` (section ⟲ en tête de la vue Années, badge « écrit A → B », preuves mises en forme, corriger/candidate/garder par ligne, lots sous `choiceDialog`)
- [x] Tests vitest du contrat (17) + `yearsUI` : l'audit absent ne change **rien** à la page
- [x] Vérification bout en bout sur bac à sable (navigation réelle, tag relu sur disque, `--undo` du script)
- [x] README (Années + routes) et registre

## Fichiers impactés

| Fichier | Rôle |
|---|---|
| `app.py` | `_write_target` extrait d'`_apply_tag` (partagé avec l'alignement EPIC-044), `GET /years/audit`, `POST /years/audit/review` |
| `test_app.py` | 11 tests du contrat backend (+ section EPIC-045) |
| `static/src/render/yearAudit.ts` (+test) | **Nouveau** — section de revue : lecture, rendu, décisions, lots |
| `static/src/render/yearsUI.ts` (+test) | la section est rendue en tête ; l'audit est relu à chaque ouverture |
| `static/styles/pages/years.css` | peinture de la section ⟲ (non collante, badge, ligne de preuve) |
| `README.md` | section Années (état réel de l'audit) + liste des routes qui écrivent |
| `docs/superpowers/specs/2026-09-22-revue-annees-ecrites-design.md` | spec |

## Validation

- [x] Typecheck (`npm run typecheck`) — 0
- [x] Tests frontend (`npm test`) — **1 188 vitest / 52 fichiers** (dont 17 sur `yearAudit`)
- [x] Tests backend (`./venv/bin/python -m pytest -q`) — **362 pytest / 12 fichiers** (dont 11 sur la revue, dont l'undo réel)
- [x] Lint (`npm run lint`) — 0 (1 avertissement `useTemplate` corrigé)
- [x] Build (`npm run build`)
- [x] **Bout en bout, navigateur, bac à sable** (serveur jetable, `config`/audit/journal redirigés, **bibliothèque réelle jamais touchée**) : « Corriger → 1991 » → tag **1991** (genre `Techno` intact), journal `old: 2024`, décision persistée, ligne retirée, statut explicite ; « Garder les 1 » → dialogue de confirmation, fichier **inchangé** (1999), **aucune** ligne de journal ; `apply_years.py --undo` → **2024 restauré**
- [x] **Lecture sur la collection réelle** : 408 auditées · 23 confirmées · 38 contredites · 8 à revoir · 339 non vérifiées · **46 à trancher** ; les 38 contredit affichent leurs sources et leur sortie (ex. « écrit 2004 → 1997 », `musicbrainz 1995 · deezer 2004`) — **aucune écriture** déclenchée

## Traçabilité (commits)

| Commit | Message |
|---|---|
| `47fd385` | `feat: EPIC-045 — l'audit des années écrites se tranche dans la vue Années` |

## Décisions

1. **Périmètre = les années déjà écrites**, pas les propositions de collecte :
   la vue Années garde son flux existant (choix locaux → export →
   `apply_years.py --review`), la section ⟲ agit, elle.
2. **Décision persistée** (`data/year_audit_review.json`) : « garder » **sort**
   l'item de la file. Sans persistance, la revue reproposerait les mêmes 46 cas à
   chaque ouverture et personne ne la rouvrirait.
3. **« corriger » écrit tout de suite**, journal partagé `source: "audit:revue"`
   (`old` conservé). Un export à appliquer plus tard aurait laissé le tag faux
   pendant ce temps — l'audit n'a de sens que s'il répare.
4. **Les candidates de l'audit sont cliquables** (une édition, un remaster, une
   compilation peuvent être la bonne réponse), mais **aucune année inventée** :
   la proposition vient de l'audit, le chemin aussi.
5. **Le disque est autoritaire** : relire avant d'écrire évite de réécrire un tag
   déjà corrigé (audit antérieur) et fait `deja` — pas de bruit dans le journal.
6. **Section optionnelle et silencieuse** : route absente (process pas redémarré —
   le cas de la session en cours), fichier absent, corps inattendu → la section
   n'existe pas, la vue Années est inchangée. Un extra ne casse pas une page.
7. **En tête de page** : c'est le seul bloc qui parle de tags **déjà posés** ;
   46 cartes plus bas, il ne serait jamais lu.
8. **Décisions comptées sous le nom de l'action** (`corriger`/`garder`) : le
   premier jet comptait un `garde` face à un `garder` persisté — l'item gardé
   restait proposé. Attrapé par les tests, corrigé à la racine (vocabulaire
   unique), pas contourné dans la vue.

## Notes / Risques

- **`evidence` = objets**, pas des phrases : le premier rendu réel affichait
  `[object Object]` (vu dans le navigateur sur les 408 entrées). La vue met en
  forme ; les tests utilisent désormais la **forme réelle** de
  `data/year_audit.json` (un fixture en chaînes avait laissé passer le bug).
- **339 non vérifiés** non tranchables ici : il faut de nouvelles sources
  (re-collecte v2, Beatport) — la section les compte et dit pourquoi.
- **Réécriture inutile évitée** mais pas d'idempotence « par scan » : si un
  fichier a été corrigé hors app puis que sa ligne d'audit est encore là, la
  relecture disque le voit (`deja`).
- **Non couvert** : la re-collecte v2 et l'application en masse des 38
  corrections sans revue (c'est justement ce que la revue existe pour éviter).
- Le serveur Flask de la session tournait **sans** les nouvelles routes
  (`/years/audit` → 404) : la section n'apparaîtra qu'après `npm start`, ce qui
  est exactement le cas de dégradation silencieuse testé.
