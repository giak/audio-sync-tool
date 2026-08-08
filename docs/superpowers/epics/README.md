# EPICs — Registre central (traçabilité)

> Chaque évolution/amélioration du projet est une **EPIC** : un fichier dédié sous `docs/superpowers/epics/`
> avec objectif, tâches cochables, fichiers impactés, validation, décisions et **traçabilité** (commits,
> journal, dates). Ce README est l'**index unique** : toute nouvelle évolution → nouvelle EPIC + entrée ici.
>
> Convention : `EPIC-NNN-slug.md` (NNN incrémental, jamais réutilisé). Statuts :
> `⚪ Backlog` → `🔵 En cours` → `🟢 Livré` | `🟠 Bloqué` | `🔴 Abandonné`.

## Règles d'or de la traçabilité

1. **Une évolution = une EPIC** (feature, correctif structurant, dette technique, refonte UX).
2. **Toute EPIC livrée** référence ses commits (`git log`), ses tests, et les docs liées (plan/spec/rapport).
3. **Toute EPIC backlog** pointe vers le plan/spec qui la détaille (jamais de promesse orpheline).
4. Mettre à jour le **statut + la date** dans ce README **et** dans le fichier EPIC.
5. Un bug ponctuel ne crée pas d'EPIC — il se règle en direct (mais une **série de bugs sur un même
   domaine** devient une EPIC « dette »).

## Index

| EPIC | Titre | Statut | Priorité | Doc liée |
|---|---|---|---|---|
| [EPIC-001](EPIC-001-cue-editor-waveform.md) | Éditeur waveform cue/loop (nml.py + routes + modal wavesurfer) | 🟢 Livré | — | plan `2026-08-08-waveform-cue-editor.md` |
| [EPIC-002](EPIC-002-correctifs-bloquants-audit.md) | Correctifs bloquants de l'audit (B1–B7) | 🟢 Livré | — | rapport `2026-08-08-audit-technique-ux.md` |
| [EPIC-003](EPIC-003-export-nml-configurable.md) | Export NML configurable + round-trip DISPL_ORDER (B8–B9) | 🟢 Livré | — | rapport audit |
| [EPIC-004](EPIC-004-hygiene-lint-ci-docs.md) | Lint 0 erreur + CI GitHub Actions + docs à jour | 🟢 Livré | — | rapport audit §P2 |
| [EPIC-005](EPIC-005-ux-cue-editor.md) | UX cue editor : accès playlist, plein écran, homonymes | 🟢 Livré | — | rapport audit §3 |
| [EPIC-006](EPIC-006-beatgrid-snap-loop.md) | Snap beatgrid (BPM détecté/saisi) + lecture de boucle | 🟢 Livré | — | plan `2026-08-08-beatgrid-calage-bpm-basse.md` |
| [EPIC-007](EPIC-007-ajout-piste-collection.md) | Ajouter une piste absente au collection.nml (POST /api/track/add) | 🟢 Livré | — | plan beatgrid |
| [EPIC-008](EPIC-008-grille-native-nml.md) | Grille native Traktor (TEMPO + TYPE=4/GRID) exposée et appliquée (P1) | 🟢 Livré | — | plan beatgrid §P1 |
| [EPIC-009](EPIC-009-phase-manuelle-cache.md) | Beatgrid P2 : contrôle de phase manuel + cache par piste | 🟢 Livré | Haute | plan beatgrid §P2 |
| [EPIC-010](EPIC-010-analyse-serveur-kick.md) | Beatgrid P3 : analyse serveur kick/phase (DSP maison) + bouton Analyser | 🟢 Livré | Haute | plan beatgrid §P3 |
| [EPIC-011](EPIC-011-ecriture-grille-nml.md) | Beatgrid P4 : écrire TEMPO+TYPE=4 dans le NML (le graal) | ⚪ Backlog | Moyenne | plan beatgrid §P4 |
| [EPIC-012](EPIC-012-bande-basse-barres.md) | Beatgrid P5 : bande d'énergie basse + numéros de barre | ⚪ Backlog | Basse | plan beatgrid §P5 |
| [EPIC-013](EPIC-013-robustesse-backend.md) | Robustesse backend : JSON atomique, verrou scan, cache parse, debug off | ⚪ Backlog | Moyenne | rapport audit §6/B11/B12 |
| [EPIC-014](EPIC-014-ux-generale.md) | UX générale : focus trap, aria, police locale, prompt→modales, responsive | ⚪ Backlog | Moyenne | rapport audit §4 |

## État actuel du projet (2026-08-08)

- Tests : **635 vitest** / **153 pytest** — tous verts, y compris en `--sequence.shuffle` (25+ runs).
- EPIC-009 livrée (phase manuelle + cache beatgrid) : nudge ←/→ 1/4, « ◎ Beat 1 », cascade
  NML → cache (`data/beatgrids.json`) → détection, invalidation par FILESIZE.
- EPIC-010 livrée (analyse serveur kick/phase) : pipeline DSP maison pur Python (`analysis.py`,
  zéro dépendance lourde — décision review KISS), `POST /api/track/analyze` → {bpm, phase,
  confidence} persisté en cache (source detected), bouton « 🔍 Analyser » (état ⏳), badge
  « auto · % ». Filtre 40–150 Hz + ODF + autocorrélation (comb 4 harmoniques, interpolation
  parabolique du lag) + scan de phase 5 ms ; repli large bande si pas de kick 4/4.
- Typecheck 0 · Lint 0 · Build OK (bundle servi avec cache-buster).
- EPIC-002 → EPIC-009 livrées et **commitées** (`a21f1ae` → `3f3b669`), EPIC-001 à ses commits
  historiques, ce registre inclus dans `7bb1735`.
- Review critique des EPICs : `reports/2026-08-08-audit-epics-review.md` (corrections chiffres,
  stabilisation shuffle, sécurité `/api/track/match`).

## Créer une nouvelle EPIC

```bash
# 1. Copier le gabarit
cp docs/superpowers/epics/_template.md docs/superpowers/epics/EPIC-NNN-slug.md
# 2. Remplir + ajouter une ligne à l'index ci-dessus
# 3. Cocher au fil de l'eau ; passer le statut à 🟢 une fois tests verts + commit
```

Voir le [gabarit](_template.md) pour la structure type d'un fichier EPIC.
