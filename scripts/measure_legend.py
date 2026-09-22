#!/usr/bin/env python3
"""Mesure headless — lisibilité de la modale « ❓ Raccourcis & Légende » (EPIC-042).

Monde synthétique isolé (réutilise `proof_filter_chip.bootstrap`), Chrome CDP,
ouverture de la modale par une touche RÉELLE (`?`), puis mesure de ce qui décide
la lisibilité d'une feuille de raccourcis :

  A. alignement  : les libellés commencent-ils tous à la même abscisse dans une
                   COLONNE, et la même partout ? (avant : `max-content` par
                   ligne puis par section → une abscisse par section) ;
  B. retour ligne: libellés qui passent à la ligne (colonnes trop étroites) ;
  C. contraste   : texte de ligne et texte des touches, calculés comme le
                   navigateur les rend (canvas 1×1, composition alpha réelle) ;
  D. remplissage : ratio hauteur max/min entre colonnes + espace vide en bas de
                   la grille (cellules de grille fantômes) ;
  E. uniformité  : lignes sans marqueur (ni touche, ni pastille, ni badge) ;
  F. tenue       : la modale tient-elle sans défilement ? (exigé à partir de
                   1600 px de large : en dessous, une feuille de 71 lignes ne
                   peut pas tenir sans couper des libellés — mesuré)
  G. compte      : sections, lignes, marqueurs — le contrat de contenu ;
  H. silence     : sections VIDES (une légende muette sur un de ses états —
                   régression live 2026-09-22 : template d'une autre version) ;
  I. colonnes    : largeurs de colonnes homogènes (colonne orpheline pleine
                   largeur = feuille bancale : mesuré à 1 366 px).

Le contenu est GÉNÉRÉ depuis les bindings (render/legend.ts) : ce harnais mesure
la mise en forme, pas la vérité des raccourcis (celle-ci est verrouillée par
legend.test.ts — bijection légende ↔ bindings labellisés).

Usage : python3 scripts/measure_legend.py [out_dir]
Sortie : rapport texte + captures (1-legende.png).
"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proof_filter_chip import bootstrap  # noqa: E402

# Fenêtre RÉALISTE (la modale est en `max-height: 80vh` : la mesurer dans une
# fenêtre de 600 px ne dit rien de la lisibilité sur un écran d'usage).
# Fenêtre RÉALISTE (la modale est en `max-height: 92vh` : la mesurer dans une
# fenêtre de 600 px ne dit rien de la lisibilité sur un écran d'usage).
# PROOF_WINDOW permet de rejouer la mesure sur une autre taille d'écran —
# 1600 est la cible de conception (feuille plafonnée à 1 460 px).
WINDOW = os.environ.get('PROOF_WINDOW', '1600,1000')
WINDOW_W = int(WINDOW.split(',')[0])
WINDOW_H = WINDOW.split(',')[1]
# Largeur à partir de laquelle la feuille DOIT tenir sans défilement.
WINDOW_FULL = 1600

# Sonde : géométrie + contraste réellement rendus par le navigateur.
# Le LIBELLÉ est mesuré via un Range sur son nœud texte : la mesure ne dépend
# donc pas de la structure DOM (nœud texte nu aujourd'hui, <span> ensuite).
PROBE = """(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d');
  const over = (fg, bg) => {                    // fg au-dessus d'un fond OPAQUE
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = fg; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  };
  const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const contrast = (a, b) => {
    const l1 = Math.max(lum(a), lum(b)), l2 = Math.min(lum(a), lum(b));
    return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
  };
  const cs = el => getComputedStyle(el);
  const px = v => Math.round((parseFloat(v) || 0) * 100) / 100;

  // Abscisse du TEXTE du libellé (nœud texte ou dernier élément), sans
  // dépendre de la structure : Range sur le contenu textuel de la ligne.
  const labelRect = row => {
    const nodes = [...row.childNodes].filter(n =>
      (n.nodeType === 3 && n.textContent.trim()) ||
      (n.nodeType === 1 && !n.matches('kbd, .led-demo, .badge-demo, .twin-demo')));
    const last = nodes[nodes.length - 1];
    if (!last) return null;
    const r = document.createRange();
    r.selectNodeContents(last);
    return r.getBoundingClientRect();
  };

  const modal = document.querySelector('#modal-legend .modal-content');
  const grid = document.getElementById('legend-grid');
  const cols = [...grid.children];
  const sections = [...grid.querySelectorAll('.legend-section')];
  const rows = [...grid.querySelectorAll('.legend-row')];

  // fond réel derrière le texte : on remonte la chaîne des fonds opaques
  const opaqueBg = el => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = cs(node).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
      node = node.parentElement;
    }
    return cs(document.body).backgroundColor;
  };
  const modalBg = opaqueBg(modal || grid);

  const perSection = sections.map(s => {
    const srows = [...s.querySelectorAll('.legend-row')];
    const xs = new Set();
    const rowGap = px(cs(s).rowGap) || 0;
    let wrapped = 0, noMark = 0, tallest = 0, content = 0;
    for (const r of srows) {
      if (!r.querySelector('kbd, .led-demo, .badge-demo, .twin-demo')) noMark++;
      const lr = labelRect(r);
      if (lr) {
        xs.add(Math.round(lr.left));
        const lh = px(cs(r).lineHeight) || px(cs(r).fontSize) * 1.2;
        if (lr.height > lh * 1.5) wrapped++;
      }
      const rh = Math.round(r.getBoundingClientRect().height);
      tallest = Math.max(tallest, rh);
      content += rh;
    }
    // Contenu RÉEL de la section : titre (hauteur + marge basse) + lignes +
    // gouttières. C'est la différence avec le rect de la section qui dit si la
    // section est ÉTIRÉE (cellule de grille fantôme — le défaut d'origine).
    const h4 = s.querySelector('h4');
    if (h4) content += Math.round(h4.getBoundingClientRect().height + px(cs(h4).marginBottom));
    if (srows.length > 1) content += Math.round(rowGap * (srows.length - 1));
    const rect = s.getBoundingClientRect();
    const marks = [...s.querySelectorAll('.legend-mark')].map(m => ({ w: Math.round(m.getBoundingClientRect().width),
      n: m.querySelectorAll('kbd, .led-demo, .badge-demo, .twin-demo').length,
      html: m.innerHTML.slice(0, 120) })).sort((a, b) => b.w - a.w);
    // `grid-template-columns` de la ligne : 1re valeur = piste des touches.
    // Elle doit être la MÊME partout (token `--legend-key`), sinon chaque
    // section a sa propre abscisse de libellé (« rien n'est calé »).
    const markTrack = srows.length
      ? px((cs(srows[0]).gridTemplateColumns || '').split(' ')[0])
      : 0;
    return { title: (s.querySelector('h4')?.textContent || '').trim(), rows: srows.length,
             height: Math.round(rect.height), content, dead: Math.max(0, Math.round(rect.height) - content),
             top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width),
             labelXs: [...xs].sort((a, b) => a - b), wrapped, noMark, tallestRow: tallest,
             markTrack,
             widestMark: marks[0] || null,
             wrappedRows: srows.filter(r => { const lr = labelRect(r); const lh = px(cs(r).lineHeight) || px(cs(r).fontSize) * 1.2;
                              return lr && lr.height > lh * 1.5; })
                                .map(r => { const t = r.querySelector('.legend-text');
                                  const avail = Math.round(r.getBoundingClientRect().width
                                    - (r.querySelector('.legend-mark')?.getBoundingClientRect().width || 0) - 10);
                                  return { t: (t?.textContent || '').trim(),
                                           need: Math.ceil(t ? t.getBoundingClientRect().width : 0), avail }; })
                                .slice(0, 12) };
  });

  // colonnes : regroupées par abscisse de section
  const byLeft = new Map();
  for (const s of perSection) {
    const key = s.left;
    const col = byLeft.get(key) || { left: key, height: 0, sections: [] };
    col.height += s.height + 16;
    col.sections.push(s.title);
    byLeft.set(key, col);
  }
  const colHeights = [...byLeft.values()].map(c => c.height);
  const gridBox = grid.getBoundingClientRect();
  const gridCols = [...grid.children].map(c => {
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left),
             top: Math.round(r.top),
             sections: [...c.children].map(s => (s.querySelector('h4')?.textContent || '').trim()) };
  });

  const kbdRow = rows.find(r => r.querySelector('kbd')) || null;
  const kbd = kbdRow ? kbdRow.querySelector('kbd') : null;
  const textRow = rows.find(r => (labelRect(r) || {}).height > 0) || null;
  // Le LIBELLÉ est le <span class=legend-text> quand il existe (EPIC-042) :
  // la couleur du texte vit là, pas sur la ligne — lire la ligne surestime le
  // contraste (avant, le libellé était un nœud texte nu : repli sur la ligne).
  const textEl = textRow ? (textRow.querySelector('.legend-text') || textRow) : null;
  const kbdBg = kbd ? over(cs(kbd).backgroundColor, modalBg) : null;
  const textBg = textEl ? over(cs(textEl).backgroundColor || 'rgba(0,0,0,0)', modalBg) : null;

  return JSON.stringify({
    viewport: { w: window.innerWidth, h: window.innerHeight },
    modal: modal ? { h: Math.round(modal.getBoundingClientRect().height),
                     scrollH: modal.scrollHeight, clientH: modal.clientHeight,
                     top: Math.round(modal.getBoundingClientRect().top) } : null,
    grid: { h: Math.round(gridBox.height), w: Math.round(gridBox.width), left: Math.round(gridBox.left),
            columns: byLeft.size, colHeights, cols: gridCols },
    footer: (() => { const f = document.getElementById('legend-footer');
      return f ? { rows: f.children.length, h: Math.round(f.getBoundingClientRect().height),
                   wrapped: [...f.children].filter(c => c.getBoundingClientRect().height > 22).length } : null; })(),
    sections: sections.length, rows: rows.length,
    marks: rows.filter(r => r.querySelector('kbd, .led-demo, .badge-demo, .twin-demo')).length,
    noMark: rows.filter(r => !r.querySelector('kbd, .led-demo, .badge-demo, .twin-demo')).length,
    kbdCount: grid.querySelectorAll('kbd').length,
    fonts: { h4: sections.length ? px(cs(sections[0].querySelector('h4')).fontSize) : 0,
             row: textEl ? px(cs(textEl).fontSize) : 0,
             kbd: kbd ? px(cs(kbd).fontSize) : 0 },
    deadTotal: perSection.reduce((a, s) => a + s.dead, 0),
    rowH: (() => { const hs = rows.map(r => Math.round(r.getBoundingClientRect().height));
      return { min: Math.min(...hs), max: Math.max(...hs), avg: Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) }; })(),
    contrast: { text: textBg ? contrast(over(cs(textEl).color, textBg), textBg) : 0,
                kbd: kbdBg ? contrast(over(cs(kbd).color, over(cs(kbd).backgroundColor, modalBg)), kbdBg) : 0,
                textColor: textEl ? cs(textEl).color : null },
    perSection,
  });
})()"""


def orphan_rows(m):
    """Colonnes ORPHELINES, sans dépendre de la technique de mise en page
    (flex, grille, multi-colonnes) : dans une feuille saine, toutes les colonnes
    ont la même largeur. Dès qu'une colonne prend la largeur entière (défaut
    constaté en live 2026-09-22 à 1366 px : 3 colonnes de 391 px + une 4ᵉ de
    1233 px jetée en dessous), la feuille est bancale."""
    widths = [c['w'] for c in m['grid']['cols']]
    if len(widths) < 2:
        return False
    median = sorted(widths)[len(widths) // 2]
    return max(widths) > 1.5 * median


def orphans_detail(m):
    widths = sorted(c['w'] for c in m['grid']['cols'])
    if len(widths) < 2:
        return f"une seule colonne de {widths[0] if widths else 0}px"
    median = widths[len(widths) // 2]
    if max(widths) > 1.5 * median:
        return (f"largeurs {widths} — la plus large fait {max(widths)}px contre {median}px de "
                f"médiane : une colonne prend la largeur entière (orpheline)")
    return f"{len(widths)} colonnes homogènes (largeurs {widths[0]}–{widths[-1]}px, médiane {median}px)"


def keys_detail(m):
    """Piste des touches : largeur fixe attendue, et le plus large marqueur
    (un marqueur plus large que la piste chevaucherait le libellé voisin)."""
    tracks = sorted({s['markTrack'] for s in m['perSection'] if s['rows']})
    worst = max(((s['widestMark'] or {}).get('w', 0), s['title']) for s in m['perSection'])
    return f"piste {tracks}px · pire marqueur {worst[0]}px ({worst[1]})"


def empty_detail(m):
    """Sections sans AUCUNE ligne (régression live 2026-09-22 : un template
    d'une autre version vidait « États » et « Cue editor » sans que rien ne le
    signale — le reste de la feuille allait très bien)."""
    empty = [s['title'] for s in m['perSection'] if s['rows'] == 0]
    if empty:
        return f"section(s) VIDE(S) : {', '.join(empty)}"
    return f"{m['sections']} sections, toutes remplies"


def dead_detail(m):
    """Détail du vide INTERNE aux sections (une cellule de grille étirée laisse
    un blanc sous ses lignes) — distinct du vide de colonne, inévitable avec des
    sections de tailles différentes."""
    parts = [f"{s['title']} {s['dead']}px" for s in m['perSection'] if s['dead']]
    if not parts:
        return 'aucune section étirée'
    return f"{m['deadTotal']}px au total ({', '.join(parts)})"


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/tmp/epic042_legend')
    os.makedirs(out, exist_ok=True)
    tmp, port, cdp, server, chrome = bootstrap(WINDOW)
    checks = []
    try:
        import urllib.request

        import websocket

        page_url = f'http://127.0.0.1:{port}/'
        for _ in range(60):
            try:
                urllib.request.urlopen(page_url, timeout=1)
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError('serveur Flask non démarré')
        scan = json.load(urllib.request.urlopen(f'{page_url}scan', timeout=60))
        n = sum(len(v) for v in scan.get('epars', {}).values())
        print(f'  monde de mesure : {tmp} ({n} fichiers épars)')

        page = None
        for _ in range(60):
            try:
                page = next(t for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{cdp}/json'))
                            if t['type'] == 'page')
                break
            except Exception:
                time.sleep(0.25)
        if not page:
            raise RuntimeError('Chrome CDP indisponible')
        ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=20)
        seq = [0]

        def send(method, **params):
            seq[0] += 1
            ws.send(json.dumps({'id': seq[0], 'method': method, 'params': params}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get('id') == seq[0]:
                    if 'error' in msg:
                        raise RuntimeError(f'{method}: {msg["error"]}')
                    return msg.get('result', {})

        def js(expr):
            r = send('Runtime.evaluate', expression=expr, awaitPromise=True, returnByValue=True)
            if 'exceptionDetails' in r:
                raise RuntimeError(f'JS: {json.dumps(r["exceptionDetails"])[:400]}')
            return r.get('result', {}).get('value')

        def wait(cond, timeout=15):
            end = time.time() + timeout
            while time.time() < end:
                if js(cond):
                    return
                time.sleep(0.2)
            raise RuntimeError(f'condition non remplie : {cond}')

        def shot(name):
            data = send('Page.captureScreenshot', format='png')['data']
            path = os.path.join(out, f'{name}.png')
            with open(path, 'wb') as f:
                f.write(base64.b64decode(data))
            print(f'  📸 {path}')

        def key_real(key, code, vk, text=''):
            for kind in ('keyDown', 'keyUp'):
                send('Input.dispatchKeyEvent', type=kind, key=key, code=code,
                     text=text or '', unmodifiedText=text or '',
                     windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)

        send('Page.enable')
        send('Page.navigate', url=page_url)
        wait("document.readyState === 'complete'")
        wait("!!document.querySelector('#epars-container .file-row .file')")
        js("(() => {const s=document.createElement('style');s.textContent="
           "'*,*::before,*::after{animation:none !important;transition:none !important}';"
           "document.head.appendChild(s);})()")
        time.sleep(0.3)

        # Ouverture par la touche RÉELLE `?` (binding du registry), pas par le DOM.
        key_real('?', 'Slash', 191, '?')
        wait("!!document.querySelector('#modal-legend .modal-content')")
        wait("!document.getElementById('modal-legend').classList.contains('hidden')")
        time.sleep(0.4)

        js(f"document.title = 'legend-measure'")
        m = json.loads(js(PROBE))
        shot('1-legende')

        print('\n── La modale en un coup d’œil ───────────────────────────────')
        print(f"  fenêtre {m['viewport']['w']}×{m['viewport']['h']}px")
        print(f"  sections {m['sections']} · lignes {m['rows']} · marqueurs {m['marks']} "
              f"(sans marqueur : {m['noMark']}) · <kbd> {m['kbdCount']}")
        print(f"  boîte modale {m['modal']['h']}px (scrollHeight {m['modal']['scrollH']} / "
              f"clientHeight {m['modal']['clientH']}) · grille {m['grid']['w']}×{m['grid']['h']}px")
        print(f"  colonnes {m['grid']['columns']} : hauteurs {m['grid']['colHeights']} "
              f"· espace mort total {m['deadTotal']}px")
        print(f"  grille à x={m['grid']['left']} : "
              + ' | '.join(f"{c['w']}px ← {', '.join(c['sections'])}" for c in m['grid']['cols']))
        print(f"  lignes : h min/moy/max {m['rowH']['min']}/{m['rowH']['avg']}/{m['rowH']['max']}px")
        print(f"  typographie : titre {m['fonts']['h4']}px · ligne {m['fonts']['row']}px · touche {m['fonts']['kbd']}px")
        print(f"  contraste : libellé {m['contrast']['text']}:1 ({m['contrast']['textColor']}) · "
              f"touche {m['contrast']['kbd']}:1")
        if m['footer']:
            print(f"  pied de modale : {m['footer']['rows']} notes · {m['footer']['h']}px "
                  f"({m['footer']['wrapped']} sur plusieurs lignes)")

        print('\n── Par section ─────────────────────────────────────────────')
        print(f"  {'section':34} {'lignes':>6} {'h':>5} {'contenu':>7} {'mort':>5} {'libellé x':>12} {'retours':>7} {'sans marque':>11}")
        for s in m['perSection']:
            print(f"  {s['title'][:34]:34} {s['rows']:>6} {s['height']:>5} {s['content']:>7} {s['dead']:>5} "
                  f"{str(s['labelXs'])[:12]:>12} {s['wrapped']:>7} {s['noMark']:>11}")
        print('\n── Colonnes de touches (marqueur le plus large de chaque section) ──')
        for s in m['perSection']:
            w = s['widestMark'] or {}
            print(f"  {s['title'][:22]:22} largeur section {s['width']:>4} · x libellé {s['labelXs'][0] if s['labelXs'] else '-'} "
                  f"(piste touches ≈ {w.get('w', 0)}px, {w.get('n', 0)} touche(s))")
            print(f"      pire marqueur : {w.get('html', '')}")
            for w in s['wrappedRows']:
                print(f"      2 lignes : {w['need']}px nécessaires / {w['avail']}px disponibles — « {w['t']} »")

        print()
        # Alignement : l'abscisse doit être unique PAR COLONNE (et non plus par
        # section : 7 sections = 7 abscisses, ce que l'usage a rejeté).
        by_col = {}
        for s in m['perSection']:
            by_col.setdefault(s['left'], []).append(s)
        col_xs = {left: sorted({x for s in group for x in s['labelXs']}) for left, group in by_col.items()}
        misaligned = [left for left, xs in col_xs.items() if len(xs) > 1]
        cols = m['grid']['colHeights']
        balance = (max(cols) / min(cols)) if cols else 1
        unwrapped = [s for s in m['perSection'] if s['wrapped'] == 0]

        ok = [
            ('A alignement : 1 seule abscisse de libellé par COLONNE',
             not misaligned,
             (f"{len(col_xs)} colonne(s) → abscisses {sorted(set(x for xs in col_xs.values() for x in xs))}"
              if not misaligned else
              f"{len(misaligned)} colonne(s) désalignée(s) — "
              + ', '.join(f"x={left}: {len(col_xs[left])} abscisses" for left in misaligned[:4]))),
            ('B aucun libellé renvoyé à la ligne', all(s['wrapped'] == 0 for s in m['perSection']),
             f"{sum(s['wrapped'] for s in m['perSection'])} libellé(s) sur 2 lignes "
             f"({len(unwrapped)}/{len(m['perSection'])} sections nettes)"),
            ('C contraste libellé ≥ 4,5:1', m['contrast']['text'] >= 4.5,
             f"{m['contrast']['text']}:1"),
            ('C contraste touche ≥ 4,5:1', m['contrast']['kbd'] >= 4.5, f"{m['contrast']['kbd']}:1"),
            ('D colonnes équilibrées (max/min ≤ 1,6)', balance <= 1.6,
             f"ratio {round(balance, 2)} ({cols})"),
            ('D aucune section étirée (vide interne ≤ 24px au total)', m['deadTotal'] <= 24, dead_detail(m)),
            ('D lignes de hauteur uniforme (une seule ligne de texte)',
             m['rowH']['max'] - m['rowH']['min'] <= 2,
             f"min {m['rowH']['min']} / moy {m['rowH']['avg']} / max {m['rowH']['max']}px "
             f"— écart {m['rowH']['max'] - m['rowH']['min']}px"),
            ('E chaque ligne porte un marqueur', m['noMark'] == 0,
             f"{m['noMark']} ligne(s) sans touche/pastille/badge"),
            (f'F la modale tient sans défilement (fenêtre ≥ {WINDOW_FULL}px de large)',
             m['modal']['scrollH'] <= m['modal']['clientH'] + 1 or WINDOW_W < WINDOW_FULL,
             f"scrollHeight {m['modal']['scrollH']} vs clientHeight {m['modal']['clientH']} "
             f"(fenêtre {WINDOW_W}×{WINDOW_H}px)"
             + ('' if WINDOW_W >= WINDOW_FULL else
                f" — non exigé sous {WINDOW_FULL}px : défile de "
                f"{max(0, m['modal']['scrollH'] - m['modal']['clientH'])}px")),
            ('G contenu complet (sections et lignes de bindings)', m['sections'] == 7 and m['rows'] >= 64,
             f"{m['sections']} sections · {m['rows']} lignes"),
            ('H aucune section vide (une légende muette = une légende fausse)',
             not [s for s in m['perSection'] if s['rows'] == 0], empty_detail(m)),
            ('I colonnes de largeur homogène (aucune colonne orpheline)',
             not orphan_rows(m), orphans_detail(m)),
            ('J aucun marqueur plus large que la piste des touches',
             all((s['widestMark'] or {}).get('w', 0) <= s['markTrack'] + 1 for s in m['perSection']),
             keys_detail(m)),
        ]
        for label, passed, detail in ok:
            checks.append((label, passed))
            print(f'  {"✅" if passed else "❌"} {label} : {detail}')
        failed = [c for c in checks if not c[1]]
        print()
        if failed:
            print(f'❌ {len(failed)}/{len(checks)} vérifications en échec')
            return 1
        print(f'✅ {len(checks)}/{len(checks)} vérifications passées — captures dans {out}')
        return 0
    finally:
        chrome.terminate()
        server.terminate()


if __name__ == '__main__':
    sys.exit(main())
