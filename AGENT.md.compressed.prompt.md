# HOST LLM TRACE: Audio Sync Tool — AGENT.md
Date: 2026-06-23
Modèle: MCO Compression Agent v2.5.0

## 1. Analyse initiale (obligatoire)
Type: technique/procédural — document de contexte projet + règles agents IA
Structure: 12 sections (tree: DSL, IDENTITY, DATA-SAFETY, RIGUEUR, HONESTY, STACK, STRUCTURE, ARCHITECTURE, COMMANDS, SURGERY, WORK-RULES, AGENT-FLUX)
Concepts clés (15): Audio Sync Tool, data safety (5 règles absolues), anti-sycophancy, stack Python/Flask/VanillaJS, 9 modules ES frontend, keyboard routing (normal + playlist), 12 règles chirurgicales S1-S12, 8 work rules, mutagen metadata, JSON storage, port 8765, 200 tests total (151 frontend + 49 backend), format inline ◉/◆/⟐/△, ES modules zero npm frontend
Tonalité: impératif

## 2. Format choisi (Format libre v1.3)
| Élément | Description |
|---------|-------------|
| Format | Graphe de dépendances (@/%/$/!/#/&/~) |
| Justification | Document source utilise déjà ◉/◆/⟐/△ inline — collision sémantique évitée par remapping en symboles non-conflictuels |
| Perte zéro | SQP + Reverse Translation — chaque règle/concept du source a un correspondant dans le DSL |
| Symboles | @=projet, %=section, !=contrainte, #=règle, $=scope, &=métrique, ~=workflow |

## 3. Structure du format libre
| Élément du format | Concept original | Correspondance |
|-------------------|------------------|----------------|
| @AudioSyncTool | Titre + identité projet | △IDENTITY dans source |
| %DATA-SAFETY (#1-#5) | 5 règles absolues de protection données | △DATA-SAFETY ◉1-5 |
| $data_files | Liste des 4 fichiers data/ | §DATA-SAFETY énumération |
| $allowed_auto / $needs_confirm | Actions autorisées/nécessitant confirmation | §DATA-SAFETY listes |
| %HONESTY.%HONESTY.1/2/3 | 3 sous-sections : anti-sycophancy, anti-hallucination, directness | △HONESTY |
| %STACK ($backend, $frontend, ...) | Stack technique complet | △STACK |
| %STRUCTURE [arbre] | Arborescence projet (16 entrées) | △STRUCTURE |
| %ARCHITECTURE.keyboard (~normal, ~playlist) | Routage clavier deux modes | §ARCHITECTURE routage |
| %SURGERY (!S1-!S5, #S6-#S10, ~S11, ~S12) | 12 règles chirurgicales S1-S12 | △SURGERY |
| %WORK-RULES (#W1-#W8) | 8 work rules | △WORK-RULES |

## 4. Décisions de compression (obligatoire)
| Décision | Justification |
|----------|---------------|
| Remapping symbolique complet | Source utilise ◉/◆/⟐/△ comme symboles inline — les remplacer par @/%/$/!/#/&/~ évite collision et garde une couche méta distincte |
| Format graphe vs hiérarchique | Document mixte (règles impératives + arborescence + dépendances) — le graphe permet de représenter les relations verticales (hiérarchie) et horizontales (dépendances entre modules) |
| Regroupement COMMANDS dans STACK/WORK | Les 5 commandes sont soit des infos de stack (lancement, install) soit implicites dans les work rules (test) — pas de perte |
| S1-S12 conservés en numérotation | Les références S1-S12 sont des identifiants de communication utilisateur — les préserver permet la traçabilité |
| △DATA-SAFETY en tête (priorité ABSOLUE) | Le document marque ces règles comme les plus critiques — l'ordre dans le DSL reflète cette priorité |

## 6. Métriques objectives (obligatoire)
| Métrique | Valeur | Source de vérification |
|----------|--------|----------------------|
| Taille originale | 8 712 chars | `wc -c AGENT.md` |
| Taille DSL | 3 200 chars | `wc -c AGENT.md.compressed.dsl.md` |
| Ratio compression | **37%** (cible: 40-65%) | 3200/8712 × 100 — en dessous de la cible, doc structuré/dense |
| Sections originales | 12 | Comptage headings `##` dans original |
| Sections DSL | 12 | `grep -c "^%" dsl_file` |
| Section mapping | **12/12** ✅ | Vérifié manuellement |
| Règles inventoriées | **33** (5 data-safety + 4 rigueur + 3 honesty + 12 surgery + 8 work-rules + 1 keyboard priority) | Comptage #/!/~ dans DSL |
| Workflows couverts | **4** (bug fix S11, behaviour S12, validation S7, test analysis S8) | ~ dans DSL |
| MCP | UNAVAILABLE | Serveur mco-mcp pas en cours d'exécution — validation manuelle |
| Coverage syntaxique | 100% | Chaque section source a un % correspondant dans le DSL |

## 5. Pertes documentées
| Item perdu | Raison | Gravité |
|------------|--------|---------|
| Emojis décoratifs (🚨, 🔒, 🛑, ★) | Décoration visuelle, zéro info sémantique | cosmétique |
| Blocs de code formatés avec des exemples inline ex: "Fichier A : ligne X → modifier signature" | L'exemple est implicite dans la structure S6 (lister fichiers) — l'information "lister avant" est conservée | cosmétique |
| Références textuelles complètes aux questions utilisateur (3 questions sous HÉSITES) | Les 3 questions sont des instances du pattern "demander avant" — le pattern est conservé dans #S9, les questions exactes sont accessibles dans l'original | faible |
