# SCADA Industrial Design — Audio Sync Tool

## Résumé

Remplacement du thème Catppuccin Mocha actuel par un thème SCADA
industriel : fond bleu-nuit profond (`#050510`), typographie monospace,
indicateurs LED avec glow, bordures bleutées. L'interface existante
reste inchangée structurellement.

---

## Principes du design SCADA (d'après ISA-101, Siemens IX, Rockwell,
inspiré du design system MnemoLite)

| Principe | Application |
|----------|------------|
| Fond bleu-nuit profond | `#050510` arrière-plan, `#0a0e27` surfaces panneaux |
| Couleur = sens | Couleurs réservées aux indicateurs d'état |
| État nominal = grisé | Pas de vert partout — le vert signale un état actif |
| Police monospace | JetBrains Mono pour tout |
| Angles industriels | 0px border-radius partout |
| Bordures bleutées | `rgba(0, 136, 255, 0.12)` subtil — pas de gris terne |
| Haute densité | Compact, pas d'espace perdu |

---

## 1. Palette de couleurs

```css
/* Fond
  ============================================ */
  --bg-deep:       #050510;  /* fond principal — bleu-nuit profond */
  --bg-panel:      #0a0e27;  /* panneaux latéraux — bleu-nuit */
  --bg-surface:    #0e1230;  /* header, player bar, status */
  --bg-hover:      #141838;  /* hover sur entrées */
  --bg-focus:      #1a1f45;  /* focus / sélection */
  --bg-input:      #080b1f;  /* champs input */

/* Texte
  ============================================ */
  --text-primary:  #e0e8f0;  /* texte principal — légèrement bleuté */
  --text-secondary:#8892b0;  /* secondaire */
  --text-muted:    #556080;  /* faibles (année, compteurs) */
  --text-dim:      #334060;  /* très faible (placeholder) */

/* Bordures — teintées cyan
  ============================================ */
  --border-panel:  rgba(0, 136, 255, 0.12);  /* séparation panneaux */
  --border-focus:  rgba(0, 136, 255, 0.35);  /* focus clavier */
  --border-active: rgba(0, 212, 255, 0.5);   /* panel actif */
  --border-emph:   rgba(0, 212, 255, 0.25);  /* hover emphasis */

/* LED — couleurs d'état SCADA
  ============================================ */
  --led-green:     #00ff88;  /* traité / OK / nominal */
  --led-green-glow: 0 0 8px #00ff8840;
  --led-blue:      #00aeff;  /* nouveau / information */
  --led-blue-glow:  0 0 8px #00aeff40;
  --led-grey:      #334060;  /* doublon / inactif — éteint */
  --led-amber:     #ffcc00;  /* warning / attention */
  --led-red:       #ff4466;  /* alerte / erreur */
  --led-cyan:      #00ddff;  /* lecture en cours (player) */

/* Accents SCADA
  ============================================ */
  --accent:        #00d4ff;  /* cyan — highlight global */
  --accent-green:  #00ff88;  /* vert terminal */
```

---

## 2. Typographie

| Usage | Police | Poids | Taille |
|-------|--------|-------|--------|
| Titres de panneaux | `'JetBrains Mono', monospace` | 600 | 13px |
| Noms de fichiers | `'JetBrains Mono', monospace` | 400 | 12px |
| Noms de dossiers | `'JetBrains Mono', monospace` | 600 | 12px |
| Année / compteurs | `'JetBrains Mono', monospace` | 400 | 11px |
| Status bar | `'JetBrains Mono', monospace` | 400 | 12px |
| Player bar | `'JetBrains Mono', monospace` | 400 | 12px |
| Labels inputs | `'JetBrains Mono', monospace` | 400 | 12px |

Pas d'espacement supplémentaire, tracking normal (0).

---

## 3. Composants

### 3.1 Layout général

```
┌──────────────────────────────────────────────────────┐
│ [SCADA] Audio Sync Tool         [CONFIG] [SCAN] [LOG]│  ← header sur bg-surface
├──────────────────────────────────────────────────────┤
│  Config panel (caché par défaut, fond bg-panel)       │
├──────────────────────┬───────────────────────────────┤
│ 📁 Éparpillé  (245)  │ 📁 Source Data  (8 420)      │  ← titres sur bg-panel
│ ───────────────────  │ ─────────────────────────    │  ← séparateur 1px border
│ ● track01.mp3 2025   │ 📁 Rock  (230)               │
│ ○ track02.mp3 1999   │ 📁 Electronic  (1 200)       │
│ ▲ track03.mp3 2012   │                              │
├──────────────────────┴───────────────────────────────┤
│ [▶ PLAYING] track01.mp3  ──████████░░──  1:23 / 4:05│  ← player, bg-surface
├──────────────────────────────────────────────────────┤
│ STATUS: READY  |  SELECTED: track01.mp3  |  2026-06 │  ← status, bg-deep
└──────────────────────────────────────────────────────┘
```

### 3.2 Badges LED (remplacent les ● ○ ▲)

Les badges texte actuels (`● ○ ▲`) deviennent des LED lumineuses,
affichées avant le nom du fichier avec un effet de glow :

```css
/* LED indicators — cercles pleins avec glow */
.led-nouveau::before { content: ''; display: inline-block;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--led-blue);
  box-shadow: var(--led-blue-glow);
  margin-right: 6px;
  vertical-align: middle; }

.led-doublon::before { content: ''; display: inline-block;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--led-grey);
  margin-right: 6px;
  vertical-align: middle; }

.led-traite::before { content: ''; display: inline-block;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--led-green);
  box-shadow: var(--led-green-glow);
  margin-right: 6px;
  vertical-align: middle; }

.led-playing::before { content: ''; display: inline-block;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--led-cyan);
  box-shadow: 0 0 8px var(--led-cyan);
  margin-right: 6px;
  vertical-align: middle; }
```

### 3.3 Header / Toolbar

- Fond `var(--bg-surface)` uni, bordure basse
  `1px solid var(--border-panel)`
- `[SCADA]` tag en `var(--accent)` (cyan) avec glow, comme un badge de système
- Boutons : fond `var(--bg-hover)`, texte `var(--text-secondary)`,
  `border-radius: 0`, bordure `1px solid var(--border-panel)`
- Bouton hover : fond `var(--bg-focus)`, bordure `var(--border-emph)`

### 3.4 Panneaux

- Fond `var(--bg-panel)` uni, séparés par
  `1px solid var(--border-panel)`
- Panel actif : bordure extérieure `1px solid var(--border-active)`
- Titre de panneau : `var(--text-primary)` weight 600, avec compteur en
  `var(--text-muted)`
- Ligne de séparation sous le titre : `1px solid var(--border-panel)`

### 3.5 Dossiers (Source Data)

- `var(--text-primary)` weight 600, avec icône `📁` / `📂`
  (inchangé)
- Compteur `(n)` en `var(--text-muted)`
- Au focus : outline `1px solid var(--border-focus)`
- Au hover : fond `var(--bg-hover)`
- Children indentés : `padding-left: 16px`, séparateur vertical
  `1px solid var(--border-panel)` en bordure gauche (optionnel)

### 3.6 File rows

- Nom fichier : `var(--text-primary)` size 12px
- Année : `var(--text-muted)` size 11px
- Play button : `[>]` en `var(--led-green)` avec glow quand en cours
- Au focus : fond `var(--bg-focus)`, outline `1px solid var(--border-focus)`

### 3.7 Player bar

- Fond `var(--bg-surface)`, bordure haute `1px solid var(--border-panel)`
- Texte : `var(--text-primary)` pour le nom, `var(--text-secondary)`
  pour le temps
- Barre de progression : fond `var(--bg-focus)`, remplissage
  `var(--accent-green)`
- Seek buttons : `var(--text-secondary)`, hover `var(--led-cyan)`

### 3.8 Status bar

- Fond `var(--bg-deep)` — le fond le plus profond, comme un affichage
  de console de contrôle
- Bordure haute : `1px solid var(--border-panel)`
- Texte : `var(--text-secondary)` monospace 12px
- `STATUS:` tag en `var(--accent-green)`

### 3.9 Configuration panel

- Fond `var(--bg-panel)`, bordure basse `1px solid var(--border-panel)`
- Inputs : fond `var(--bg-input)`, bordure `1px solid var(--border-panel)`,
  `border-radius: 0`
- Input focus : bordure `1px solid var(--border-active)`
- Sauvegarder : fond `var(--accent-green)`, texte `var(--bg-deep)`,
  `border-radius: 0`

### 3.10 Confirm dialog

- Overlay : `rgba(0,0,0,0.85)`
- Boîte : fond `var(--bg-panel)`, bordure `1px solid var(--border-panel)`,
  `border-radius: 0`
- Bouton Copier : fond `var(--accent-green)`, texte `var(--bg-deep)`, `border-radius: 0`
- Bouton Annuler : fond `var(--bg-hover)`, texte `var(--text-secondary)`, `border-radius: 0`

### 3.11 Journal

- Fond `var(--bg-panel)`, bordure haute `1px solid var(--border-panel)`
- Lignes monospace 11px, `.copied` en `var(--led-green)`,
  `.error` en `var(--led-red)`

---

## 4. Effets

Aucun effet animé (pas de pulse, pas de glow hover, pas de scanlines).
Le seul effet visuel est le glow statique des LED (box-shadow fixe).

---

## 5. Spécifications techniques

- **Aucune dépendance** — tout est CSS pur, pas de JS additionnel
- **Police** : `'JetBrains Mono', monospace` — chargée via Google Fonts `@import`
- **Fichier modifié** : uniquement `static/style.css`
- **Aucun changement HTML** : les IDs et classes HTML existants restent
  identiques — seules les valeurs CSS changent
- **Aucun changement JS** : pas de modification de `static/script.js`
- Le badge LED utilise un `::before` sur une classe `.led-status` ajoutée
  au `.file` span via JS (changement JS minimal : une classe en plus
  dans `makeFileEl`)
- Les variables CSS sont définies dans `:root` et accessibles globalement

---

## 6. Migration depuis Catppuccin

Tous les changements sont dans `static/style.css` :

1. Remplacer la palette de couleurs (dont `#050510` / `#0a0e27` / `rgba(0,136,255,0.12)`)
2. Remplacer les polices (ajouter JetBrains Mono via Google Fonts `@import`)
3. Remplacer les `border-radius` par 0 partout
4. Remplacer les outline par des border
5. Remplacer les badges texte (● ○ ▲) par des LED glow
6. Ajuster les espacements (un peu plus serrés)
7. Appliquer les nouveaux fonds (`#050510`, `#0a0e27`, `#0e1230`)

---

## 7. À valider

- [x] Police JetBrains Mono : Google Fonts
- [x] Scanlines : non
- [x] Dégradés sur les panneaux : non
- [x] Pulse LED animation : non
- [x] Glow au hover : non
- [x] `border-radius` : 0 partout
