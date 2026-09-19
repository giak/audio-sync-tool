#!/usr/bin/env python3
"""EPIC-036 Phase 3 — découpage mécanique de static/style.css (1 500 lignes)
en couches : tokens.css, base.css, components.css, pages/{sync,sync-main,dups,
years,playlist,overlays,cue-editor}.css (+ pages/index.css agrégateur).

Pourquoi sync est coupé en deux (sync.css + sync-main.css) et pourquoi
overlays.css existe : l'ordre GLOBAL des règles fait partie de la cascade.
Dans le fichier original, dups (347-460) et years (462-553) s'intercalent
entre les deux moitiés de sync, et Context Menu/D&D (1168-1199) viennent
APRÈS playlist. pages/index.css importe donc les fichiers dans l'ordre
original exact → zéro inversion de cascade (prouvé par check_css_equiv.py).

Transformations de contenu (les seules, documentées) :
- --led-amber dupliqué résolu (la cascade gardait déjà #ffcc00) ;
- fallback var(--text-secondary, #999) → var(--text-secondary) (la var existe) ;
- .years-section dupliquée à l'identique (l.478 et l.496 de l'original)
  → 1 seule déclaration (le computed style est inchangé : déclarations
  identiques, la dernière gagnait déjà).

Usage : python3 scripts/split_css_phase3.py && python3 scripts/check_css_equiv.py
"""
import os

SRC = 'static/style.css'
OUT = 'static/styles'

with open(SRC, encoding='utf-8') as f:
    lines = f.readlines()  # accès 1-indexed via [n-1]

def seg(a, b):
    """Segment 1-indexed inclusif."""
    return ''.join(lines[a - 1:b]).rstrip('\n') + '\n'

os.makedirs(f'{OUT}/pages', exist_ok=True)

# ── tokens.css : en-tête font + :root (1-39) ─────────────────────────────
tokens = seg(1, 39)
tokens = tokens.replace('  --led-amber:     #ffaa00;\n  --led-amber:     #ffcc00;\n',
                        '  --led-amber:     #ffcc00;\n')
tokens = tokens.replace(
    '/* Police : fallback système assumé (EPIC-014). JetBrains Mono si installée en\n'
    '   local, sinon stack monospace du système — plus aucun CDN (hors-ligne vrai,\n'
    '   zéro fuite de vie privée). */',
    '/* Tokens du design system (EPIC-036 P3). Police : fallback système assumé\n'
    '   (EPIC-014). JetBrains Mono si installée en local, sinon stack monospace du\n'
    '   système — plus aucun CDN (hors-ligne vrai, zéro fuite de vie privée). */')
assert tokens.count('--led-amber:') == 1

# ── base.css : Reset+Utility+Focus+Motion (40-65) + Scrollbar (1200-1204) ─
# (scrollbar = pseudo-éléments ::-webkit-scrollbar, uniques dans le fichier —
#  avancée vs ordre original sans risque de collision, vérifié par le checkeur)
base = seg(40, 65) + '\n' + seg(1200, 1204)

# ── components.css : familles transversales, bloc CONTIGU 708-999 ────────
# (toast+badge → filter-chip → modal → config form → legend → journal →
#  dialog → panel-empty). Ordre original garanti sans arithmétique.
components = seg(708, 999)
components = components.replace(
    '/* ===== Modal System ================================================== */',
    '/* ===== Modal System ================================================== */\n'
    '/* Gabarits de boîtes (modal / palette / toast) : couleurs et ombres\n'
    '   intentionnellement différentes par famille (popover ambre, panel neutre,\n'
    '   toast fonction) — PAS de classe de base partagée : elle exigerait des\n'
    '   overrides par instance, verdict EPIC-036 P3. */')
components = components.replace(
    '.style-chip.suggested { border-style: dotted; opacity: 0.55; '
    'color: var(--text-secondary, #999); border-color: var(--text-secondary, #999); '
    'background: none; }',
    '.style-chip.suggested { border-style: dotted; opacity: 0.55; '
    'color: var(--text-secondary); border-color: var(--text-secondary); '
    'background: none; }')
assert ', #999' not in components

# ── pages/* : sections contiguës de l'original, tri par panneau ──────────
pages = [
    ('sync.css',     seg(66, 346),      'layout, nav, header, panneaux, table, LED, palette'),
    ('dups.css',     seg(347, 460),     'EPIC-028 doublons fuzzy + vue dédiée'),
    ('years.css',    seg(462, 553),     'EPIC-033 vue Années'),
    ('sync-main.css', seg(555, 557) + '\n' + seg(559, 707),
                     'métadonnées, éparpillé, player, scan, status-bar (suite de sync dans l\'ordre original)'),
    ('playlist.css', seg(1000, 1167),   'mode playlist'),
    ('overlays.css', seg(1168, 1199),   'menu contextuel + états drag & drop'),
    ('cue-editor.css', seg(1206, 1500), 'éditeur de cues (modal)'),
]

header = ('/* EPIC-036 P3 : couche générée depuis static/style.css (découpage mécanique\n'
          '   par sections ; l\'ordre de cascade est garanti par l\'ordre d\'import dans\n'
          '   pages/index.css — voir scripts/split_css_phase3.py). */\n\n')

for name, text, desc in pages:
    if name == 'years.css':
        # Collapse du doublon .years-section (déclarations strictement identiques).
        # On retire la PREMIÈRE occurrence (bloc multi-lignes l.478) — même choix
        # que check_css_equiv.py (list.remove = 1ʳᵉ) pour un ordre identique.
        dup = '\n.years-section {\n  font-weight: 600; font-size: 13px; margin: 12px 0 6px;\n}'
        assert text.count(dup) == 1, 'doublon .years-section introuvable ou déjà résolu'
        text = text.replace(dup, '', 1)
    with open(f'{OUT}/pages/{name}', 'w', encoding='utf-8') as f:
        f.write(header + f'/* {desc}. */\n\n' + text)
    print(f'pages/{name:18s} {text.count(chr(10)):5d} lignes')

for name, text in [('tokens.css', tokens), ('base.css', base),
                   ('components.css', components)]:
    with open(f'{OUT}/{name}', 'w', encoding='utf-8') as f:
        f.write(header + text)
    print(f'{name:28s} {text.count(chr(10)):5d} lignes')

with open(f'{OUT}/pages/index.css', 'w', encoding='utf-8') as f:
    f.write("/* EPIC-036 P3 : point d'entrée unique du CSS (importé par script.ts).\n"
            "   L'ordre des @import = l'ordre des sections de l'ancien style.css →\n"
            "   cascade inchangée (prouvé par scripts/check_css_equiv.py). */\n"
            "@import '../tokens.css';\n"
            "@import '../base.css';\n"
            "@import './sync.css';\n"
            "@import './dups.css';\n"
            "@import './years.css';\n"
            "@import './sync-main.css';\n"
            "@import '../components.css';\n"
            "@import './playlist.css';\n"
            "@import './overlays.css';\n"
            "@import './cue-editor.css';\n")
print("pages/index.css              (agrégateur, ordre = cascade originale)")
