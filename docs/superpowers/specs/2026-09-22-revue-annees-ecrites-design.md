# Spec — Revue des années déjà écrites (dernier maillon d'EPIC-040)

> **Date** : 2026-09-22 · **EPIC** : [EPIC-045](../epics/EPIC-045-revue-annees-ecrites.md)
> **Contexte** : EPIC-040 (moteur + audit) · EPIC-033 (collecte d'origine) · EPIC-041/043/044 (même grammaire d'écriture)

## Le problème

`scripts/audit_applied_years.py` rejoue le moteur corrigé sur les écritures du
journal et classe chaque année déjà écrite. Son résultat vit dans
`data/year_audit.json` — **un fichier JSON sans aucune surface**. Mesuré le
2026-09-22 :

| Verdict | Nb | Sens |
|---|---|---|
| `confirme` | 23 | une source « première sortie » corrobore le tag |
| **`contredit`** | **38** | le tag dit autre chose que la première sortie (**proposition** fournie) |
| `a_revoir` | 8 | désaccord sans signature de réédition |
| `non_verifie` | 339 | aucune source « première sortie » ne parle (100) / candidats sans corroboration (13) / une seule source « édition » (226) |

Tant que ce fichier n'est pas lisible par un humain **dans l'app**, ces 46 cas
restent invisibles — et le mode d'échec est exactement celui qui avait été
signalé (une **réédition** écrite comme année du morceau : « Inner Light » 2024
pour un morceau de 1991). Les 38 `contredit` ont un `proposed` calculé : rien à
inventer, il suffit de trancher.

## Décisions

1. **Deux routes, une seule grammaire de revue** (celle des EPIC-041/043/044 :
   aperçu → décision → journal partagé → relecture).
   - `GET /years/audit` — **lecture seule** : verdicts, compteurs, items.
     Les 339 `non_verifie` sont envoyés **allégés** et comptés par **CLASSE**
     (leurs `reason` sont toutes uniques : 339 phrases ne servent à rien dans
     une page).
   - `POST /years/audit/review` — `{"decisions": [{path, action, year?}]}`.
2. **Décision persistée, pas de session locale** (`data/year_audit_review.json`).
   Contrairement aux cartes « à revue » d'EPIC-033 (où les choix restent locaux
   jusqu'à l'export), une décision d'audit **agit** : « garder » ne touche à
   rien mais doit **sortir l'item de la file** — sinon la revue remontrerait les
   mêmes 46 cas à chaque ouverture.
3. **« corriger » écrit tout de suite.** C'est l'intérêt : l'année proposée est
   écrite dans le tag, immédiatement, via le **journal partagé des scripts**
   (`source: "audit:revue"`, `old` conservé) — `apply_years.py --undo` **restaure**
   l'année d'avant (pas une suppression). Une correction n'est pas un export à
   appliquer plus tard.
4. **Aucun chemin, aucune année libre ne vient du client** : le chemin doit
   exister dans l'audit (`data/year_audit.json`) — la proposition se lit dedans.
   Le client peut choisir **une autre candidate de l'audit** (édition, remaster,
   compilation : la proposition du moteur n'est pas toujours la bonne) mais pas
   une valeur inventée. Le confinement aux racines configurées s'applique
   comme partout (`_write_target`).
5. **Le disque est autoritaire** : avant d'écrire, on relit l'année sur le
   fichier. Si elle est **déjà** celle visée (audit calculé avant une correction),
   le tag n'est pas réécrit pour rien (compté `deja`, **aucune ligne de
   journal**) — la décision est quand même persistée pour ne pas le reproposer.
6. **Jamais bloquant** : absent du disque, extension non gérée, relecture ratée,
   chemin hors audit, action inconnue → **refus nommé** dans `failed`, le lot
   continue. Un lot de 38 corrections ne s'arrête pas à la première.
7. **Côté vue : relire le serveur, jamais re-dériver.** Après un POST, le client
   recharge `GET /years/audit` et se redessine depuis la réponse : l'affichage ne
   peut pas diverger du disque (le serveur renvoie aussi `written` pour le
   statut).
8. **Section en TÊTE de la vue Années.** Elle parle de tags **déjà posés** (dont
   une année fausse sur le disque) — c'est le seul bloc de la page qui a cette
   gravité, et 46 cartes plus bas personne ne le verrait.
9. **Lot entier sous confirmation** (`choiceDialog`) : « Corriger les 38
   proposées » / « Garder les 46 » — le dialogue **dit** le nombre, la référence
   et l'annulation possible avant d'agir. Les corrections unitaires ne demandent
   pas de dialogue (un clic = une année, journalisée et annulable).
10. **Section optionnelle** : route absente (process pas redémarré), fichier pas
    encore produit, ou corps inattendu → la section **disparaît**, la vue Années
    reste exactement ce qu'elle était. Une page ne casse pas parce qu'un extra
    manque.

## Contrat d'API

```jsonc
// GET /years/audit
{
  "ok": true, "files": 408,
  "counts": {"confirme": 23, "contredit": 38, "a_revoir": 8, "non_verifie": 339,
             "corriger": 0, "garder": 0},          // décisions sous le nom d'ACTION
  "raisons": {"une seule source « édition » parle": 226, "aucune source ne parle": 100,
              "candidats sans corroboration": 13},
  "contredit": [{"path": "…", "filename": "…", "applied": "2024", "proposed": "1991",
                 "candidates": ["1991","1992"], "sources": {"deezer":"2024","discogs":"1991"},
                 "evidence": [{"artist":"…","title":"…","album":"…","release_date":"…"}],
                 "variant": "album", "reason": "…", "decision": null}],
  "a_revoir": [...], "non_verifie": [...], "confirme": [...]
}

// POST /years/audit/review
// {"decisions": [{"path": "…", "action": "corriger", "year": "1991"},
//                {"path": "…", "action": "garder"}]}
// → {"ok": true, "written": [{path, old, year}], "kept": [path], "deja": [path],
//    "failed": [{path, error}], "reviewed": 1}
```

`counts` porte les verdicts **et** les décisions : une décision est comptée sous
le nom de l'**action** (`corriger` / `garder`) — un seul vocabulaire du POST à la
vue. (Bug attrapé en écrivant les tests : un `garde` face à un `garder` ne se
comptait pas, et l'item gardé restait proposé.)

## Formes réelles des données (piège mesuré)

`evidence` est une liste d'**objets** de sortie
(`{artist, title, album, release_date}`) — pas des phrases. Le premier rendu
affichait `[object Object]` à l'écran (constaté dans le navigateur, sur les 408
entrées réelles) ; la vue met en forme : `sources` triées par année
(`discogs 1991 · deezer 2024`) puis la fiche de sortie
(`Phantasia — Inner Light · album « Inner Light », 1991-09-01`).

## Preuves

- **pytest** (11 tests) : verdicts de la vue et **lecture seule** vérifiée
  (aucun journal, aucun fichier de revue écrit) ; classes de raisons ;
  « corriger » écrit **et** persiste (journal `audit:revue`, `old` conservé, genre
  intact) ; année choisie parmi les candidates ; « garder » n'écrit rien mais
  sort l'item de la file ; refus nommés (hors audit, année illisible, action
  inconnue) avec le lot qui continue ; confinement aux racines ; **déjà au bon
  millésime** → aucune réécriture ; mutagen absent → 500 ; **`--undo` réel** :
  `apply_years.py::do_undo()` rend 2024 au fichier.
- **vitest** (17 tests sur `yearAudit`, + `yearsUI` inchangée) : texte des
  compteurs, classes des non vérifiés, mise en forme des preuves, ligne de
  résultat ; rendu (badge « écrit 2024 → 1991 », candidates, pas de re-proposition
  d'un item décidé) ; POST par item (corriger / candidate / garder), POST du lot
  après dialogue ; échec → statut, pas de redessin ; audit absent ou informe →
  section absente.
- **Bout en bout, dans le navigateur, sur un bac à sable** (serveur jetable,
  `data/` redirigé) : clic « Corriger → 1991 » → tag **1991** sur le disque
  (genre intact), journal `{"old":"2024","new":"1991","source":"audit:revue"}`,
  ligne retirée de la file, statut « 1 année(s) corrigée(s) · `apply_years.py
  --undo` restaure » ; « Garder les 1 » → dialogue, fichier **inchangé**,
  décision persistée ; `apply_years.py --undo` sur ce journal → **2024 restauré**.
- **Dry-run sur la collection réelle** : `GET /years/audit` → 408 auditées,
  23 / 38 / 8 / 339 ; **aucune écriture** n'a été faite sur la bibliothèque (la
  revue attend un clic).

## Limites

- Les 339 `non_verifie` ne sont pas tranchables ici : il faudrait de nouvelles
  sources (re-collecte v2, Beatport) — la section les **compte** et explique
  pourquoi, elle ne les propose pas.
- Un item décidé reste visible dans `contredit`/`a_revoir` avec sa décision (il
  ne repart pas en file) : c'est la trace de ce qui a été tranché, pas une
  re-proposition.
- La revue **ne rafraîchit pas** les autres blocs de la page (les propositions de
  collecte restent celles du cache) : l'année corrigée n'apparaît pas dans les
  vagues « sans année », elle était déjà écrite.
- Un dossier/file dont le nom ment n'est pas concerné : l'audit porte sur la
  valeur du tag vs les sources, pas sur le rangement.
