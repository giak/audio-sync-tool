#!/usr/bin/env python3
"""EPIC-036 Phase 3 — contrôle d'équivalence originale vs couches stat/styles/.

NB : static/style.css a été supprimé à la fin de la Phase 3 (les couches sont
la seule source). Pour rejouer ce contrôle, restaurer l'original depuis
l'historique git (ex. `git show <commit-avant-P3>:static/style.css`), ou
comparer les couches entre elles après modification.

Vérifie, après retrait des commentaires et normalisation des espaces :
1. multiset des règles (sélecteur + corps) : chaque règle apparaît autant de
   fois de chaque côté, aux 2 transformations documentées près (résolution
   du --led-amber dupliqué ; fallback var(--text-secondary, #999)) ;
2. ordre relatif : pour chaque paire de règles distinctes, leur ordre
   d'apparition relatif est identique avant/après (aucune inversion de
   cascade).
Sortie : exit 0 si équivalent, 1 sinon (diff listé).
"""
import re
import os
import sys
from collections import Counter

# L'original peut être restauré depuis git pour rejouer le contrôle
# (static/style.css supprimé en fin de Phase 3).
ORIG = os.environ.get('CSS_ORIGINAL', 'static/style.css')

# Ordre = ordre original (cascade) — voir split_css_phase3.py et pages/index.css.
ORIG = os.environ.get('CSS_ORIGINAL', 'static/style.css')
LAYERS = ['static/styles/tokens.css', 'static/styles/base.css',
          'static/styles/pages/sync.css', 'static/styles/pages/dups.css',
          'static/styles/pages/years.css', 'static/styles/pages/sync-main.css',
          'static/styles/components.css', 'static/styles/pages/playlist.css',
          'static/styles/pages/overlays.css', 'static/styles/pages/cue-editor.css']

# Transformations attendues (avant → après), documentées dans split_css_phase3.py
XFORMS = [
    ('--led-amber: #ffaa00; --led-amber: #ffcc00;', '--led-amber: #ffcc00;'),
    ('var(--text-secondary, #999)', 'var(--text-secondary)'),
]

# Collapse documenté (splitter) : .years-section déclarée 2× à l'identique
# (l.478 et l.496 de l'original) → 1 seule déclaration conservée. Sans effet
# sur le computed style : déclarations identiques, la dernière gagnait déjà.
# Le contrôle retire donc UNE occurrence côté original (whitelist explicite).
KNOWN_DUP = ('.years-section',
             'font-weight: 600; font-size: 13px; margin: 12px 0 6px;')


def rules(path):
    """Règles top-level simplifiées : liste (sélecteur, corps) normalisés.
    Approximation : split sur '}' puis '}' — suffisant pour ce CSS plat
    (media queries traitées comme règles uniques, même des deux côtés)."""
    text = open(path, encoding='utf-8').read()
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    out = []
    for block in text.split('}'):
        block = block.strip()
        if not block:
            continue
        if '{' not in block:
            # fin de media query amputée — rare ; on ignore (même comportement des 2 côtés)
            continue
        sel, body = block.split('{', 1)
        sel = re.sub(r'\s+', ' ', sel).strip()
        body = re.sub(r'\s+', ' ', body).strip()
        out.append((sel, body))
    return out


def canon(rules_list):
    """Applique les transformations documentées pour rendre comparable."""
    c = []
    for sel, body in rules_list:
        r = f'{sel} {{ {body} }}'
        for a, b in XFORMS:
            r = r.replace(a, b)
        sel2, body2 = r.split(' { ', 1)
        body2 = body2.rsplit(' }', 1)[0]
        c.append((sel2.strip(), body2.strip()))
    return c


def compare(lhs, rhs, label_lhs='original', label_rhs='couches'):
    """Compare deux listes de règles canoniques : multiset + ordre relatif.
    Retourne (ok, message). Importable sans effet de bord."""
    from collections import Counter as _C
    co, cn = _C(lhs), _C(rhs)
    missing, added = co - cn, cn - co
    ok = True
    msgs = []
    if missing:
        ok = False
        msgs.append(f'❌ {sum(missing.values())} règle(s) manquante(s) dans {label_rhs} :')
        for (sel, body), n in list(missing.items())[:15]:
            head = f'{body[:90]}…' if len(body) > 90 else f'{body} }}'
            msgs.append(f'   ×{n} {sel} {{ {head}')
    if added:
        ok = False
        msgs.append(f'❌ {sum(added.values())} règle(s) en trop dans {label_rhs} :')
        for (sel, body), n in list(added.items())[:15]:
            head = f'{body[:90]}…' if len(body) > 90 else f'{body} }}'
            msgs.append(f'   ×{n} {sel} {{ {head}')
    order_o, order_n = {}, {}
    for i, r in enumerate(lhs):
        order_o.setdefault(r, i)
    for i, r in enumerate(rhs):
        order_n.setdefault(r, i)
    common = [r for r in order_o if r in order_n]
    # Règles exclues du contrôle d'ordre : sans paire (sélecteur) possible de
    # collision de cascade. ::-webkit-scrollbar (pseudo-élément, 1 seule règle
    # du genre dans le fichier) et @keyframes (isolées par nature).
    exempt = {r for r in common if r[0].startswith('::-webkit-scrollbar')}
    common = [r for r in common if r not in exempt]
    inv = 0
    for i, a in enumerate(common):
        for b in common[i + 1:]:
            if (order_o[a] < order_o[b]) != (order_n[a] < order_n[b]):
                inv += 1
    if inv:
        ok = False
        msgs.append(f'❌ {inv} inversion(s) d\'ordre (cascade)')
    msgs.append(f'règles : {label_lhs} {len(lhs)} · {label_rhs} {len(rhs)} · communes {len(common)}')
    msgs.append('✅ ÉQUIVALENCE : multiset + ordre relatif OK' if ok else '❌ DIVERGENCE DÉTECTÉE')
    return ok, '\n'.join(msgs)


if __name__ == '__main__':
    orig = canon(rules(ORIG))
    assert orig.count(KNOWN_DUP) == 2, \
        f'doublon attendu ×2 : trouvé ×{orig.count(KNOWN_DUP)} (original modifié ?)'
    orig.remove(KNOWN_DUP)
    new = []
    for f in LAYERS:
        new.extend(canon(rules(f)))
    ok, msg = compare(orig, new)
    print(msg)
    sys.exit(0 if ok else 1)
