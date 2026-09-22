#!/usr/bin/env python3
"""Mesure headless — lisibilité du focus dans les listes (EPIC-039).

Lance le monde synthétique isolé (réutilise `proof_filter_chip.bootstrap`) et
compare, DANS LE MÊME NAVIGATEUR, l'état de focus **avant** (règles d'origine
réinjectées) et **après** (build courant) :

  A. anneau d'un DOSSIER      : épaisseur outline + contraste WCAG ;
  B. barre d'accent de LIGNE  : épaisseur (box-shadow inset) ;
  C. fond teinté de la LIGNE  : distance sRGB avec une ligne non focusée ;
  D. bordure du PANNEAU actif : contraste WCAG ;
  E. clic réel dans la liste  : l'app pose bien `focused` sur la ligne cliquée.

Le contraste est calculé comme le navigateur le rend (canvas 1×1 : vraie
composition alpha), pas depuis les tokens. Deux captures sont écrites.

Usage : python3 scripts/measure_focus_visibility.py [out_dir]
"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from proof_filter_chip import bootstrap  # noqa: E402

# Règles de focus telles qu'elles étaient AVANT l'EPIC-039 (git HEAD),
# réinjectées pour mesurer le « avant » dans les mêmes conditions de rendu.
OLD_FOCUS_CSS = """
.panel-active { border: 1px solid var(--border-active) !important; box-shadow: none !important; }
.directory.focused { background: var(--bg-focus) !important;
                     outline: 1px solid var(--border-focus) !important; box-shadow: none !important; }
.file-row.focused > td { background: var(--bg-focus) !important;
                         box-shadow: none !important; }
.file-row.focused > td:first-child { box-shadow: inset 3px 0 0 var(--accent) !important; }
.file-row.focused > td:last-child { box-shadow: inset -1px 0 0 var(--border-focus) !important; }
.file-row.focused td.file { outline: 1px solid var(--border-focus) !important; }
"""

# Sonde JS : géométrie + contraste WCAG réellement rendus par le navigateur.
PROBE = """(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const ctx = cv.getContext('2d');
  const over = (fg, bg) => {                    // fg au-dessus d'un fond OPAQUE
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = bg;     ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = fg;     ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  };
  const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const contrast = (a, b) => {
    const l1 = Math.max(lum(a), lum(b)), l2 = Math.min(lum(a), lum(b));
    return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
  };
  const dist = (a, b) => Math.round(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b));
  const cs = el => getComputedStyle(el);
  const px = v => parseFloat(v) || 0;
  let back = document.body, pageBg = 'rgb(0, 0, 0)';
  while (back) {
    const c = cs(back).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { pageBg = c; break; }
    back = back.parentElement;
  }

  const panel = document.getElementById('panel-left');
  const panelBg = cs(panel).backgroundColor;

  // A. dossier focusé
  const dir = document.querySelector('#source-container .directory');
  dir.classList.add('focused');
  const dirBg = over(cs(dir).backgroundColor, panelBg);
  const dirRing = over(cs(dir).outlineColor, dirBg);

  // B/C. ligne focusée (épars) — 1re ligne vs 2e (non focusée)
  const rows = document.querySelectorAll('#epars-container .file-row');
  const row = rows[0];
  row.classList.add('focused');
  const first = row.children[0];
  const mid = row.children[1] || first;
  const last = row.children[row.children.length - 1];
  const txt = cs(first);
  const shadow = txt.boxShadow;
  const barM = /(-?[\\d.]+)px\\s+-?[\\d.]+px\\s+0px\\s+0px/.exec(shadow);
  const ringM = /0px\\s+(-?[\\d.]+)px\\s+0px\\s+0px/.exec(cs(mid).boxShadow);
  const rowTint = over(txt.backgroundColor, panelBg);
  const plain = rows[1] || row;
  const plainTint = over(cs(plain.children[0]).backgroundColor, panelBg);
  const midShadow = cs(mid).boxShadow;
  const ringC = midShadow === 'none' ? null : midShadow.slice(0, midShadow.indexOf(')') + 1);
  const rowRing = ringC ? over(ringC, rowTint) : null;

  // D. panneau actif
  panel.classList.add('panel-active');
  const frame = over(cs(panel).borderTopColor, pageBg);
  const pageBgObj = over(pageBg, '#000');

  return JSON.stringify({
    barPx: barM ? Math.abs(parseFloat(barM[1])) : 0,
    lastShadow: cs(last).boxShadow,
    dir: { px: px(cs(dir).outlineWidth), offset: cs(dir).outlineOffset,
           contrast: contrast(dirRing, dirBg) },
    rowRing: { px: ringM ? Math.abs(parseFloat(ringM[1])) : 0,
               contrast: rowRing ? contrast(rowRing, rowTint) : 0 },
    tint: { delta: dist(rowTint, plainTint), rowTint: `rgb(${rowTint.r},${rowTint.g},${rowTint.b})` },
    frame: { contrast: contrast(frame, pageBgObj), pageBg },
    palette: { accent: cs(dir).outlineColor, tint14: txt.backgroundColor },
  });
})()"""


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/tmp/epic039_focus')
    os.makedirs(out, exist_ok=True)
    tmp, port, cdp, server, chrome = bootstrap()
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
                raise RuntimeError(f'JS: {json.dumps(r["exceptionDetails"])[:300]}')
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

        send('Page.enable')
        send('Page.navigate', url=page_url)
        wait("document.readyState === 'complete'")
        wait("!!document.querySelector('#epars-container .file-row .file')")
        # geler les animations/transitions : la mesure CSS ne doit pas dépendre d'un frame
        js("(() => {const s=document.createElement('style');s.textContent="
           "'*,*::before,*::after{animation:none !important;transition:none !important}';"
           "document.head.appendChild(s);})()")
        time.sleep(0.3)

        after = json.loads(js(PROBE))
        shot('10-focus-apres')

        js("(() => {const s=document.createElement('style');s.id='old-focus';"
           f"s.textContent={json.dumps(OLD_FOCUS_CSS)};document.head.appendChild(s);}})()")
        time.sleep(0.2)
        before = json.loads(js(PROBE))
        shot('11-focus-avant')

        js("document.getElementById('old-focus')?.remove();"
           "document.querySelectorAll('.focused,.panel-active').forEach(e=>e.classList.remove('focused','panel-active'));")
        time.sleep(0.2)

        # E. clic RÉEL dans la liste : l'app doit poser `focused` sur la ligne cliquée
        box = json.loads(js("""(() => {
          const cell = document.querySelectorAll('#epars-container .file-row')[2].children[1];
          cell.scrollIntoView({block: 'center'});
          const r = cell.getBoundingClientRect();
          return JSON.stringify({x: r.left + r.width / 2, y: r.top + r.height / 2});
        })()"""))
        for kind in ('mousePressed', 'mouseReleased'):
            send('Input.dispatchMouseEvent', type=kind, x=box['x'], y=box['y'],
                 button='left', clickCount=1)
        time.sleep(0.3)
        real = json.loads(js("""(() => {
          const focused = [...document.querySelectorAll('#epars-container .focused')];
          const rows = [...document.querySelectorAll('#epars-container .file-row')];
          return JSON.stringify({count: focused.length, index: rows.indexOf(focused[0])});
        })()"""))
        shot('12-focus-clic-reel')

        print('\n── Contraste / épaisseur du focus (rendu navigateur) ────────')
        for label, key, fmt in (
            ('A. anneau dossier   ', 'dir', lambda v: f"{v['px']}px (offset {v['offset']}) · contraste {v['contrast']}:1"),
            ('B. barre ligne      ', 'barPx', lambda v: f'{v}px'),
            ('   boîte ligne      ', 'rowRing', lambda v: f"{v['px']}px · contraste {v['contrast']}:1"),
            ('C. fond teinté ligne', 'tint', lambda v: f"delta sRGB {v['delta']} · {v['rowTint']}"),
            ('D. bordure panneau  ', 'frame', lambda v: f"contraste {v['contrast']}:1 (fond {v['pageBg']})"),
        ):
            print(f'  {label} · avant : {fmt(before[key])}')
            print(f'  {label} · après : {fmt(after[key])}')
        print(f"  palette            : accent {after['palette']['accent']} · teinte {after['palette']['tint14']}")
        print(f"  E. clic réel       : {real['count']} ligne(s) focusée(s), index {real['index']}")

        ok = [
            ('A dossier : outline ≥ 2 px', after['dir']['px'] >= 2, f"{after['dir']['px']}px"),
            ('A dossier : contraste ≥ 4,5:1', after['dir']['contrast'] >= 4.5, f"{after['dir']['contrast']}:1"),
            ('B ligne : barre ≥ 4 px', after['barPx'] >= 4, f"{after['barPx']}px"),
            ('B ligne : boîte ≥ 2 px et contraste ≥ 4,5:1',
             after['rowRing']['px'] >= 2 and after['rowRing']['contrast'] >= 4.5,
             f"{after['rowRing']['px']}px · {after['rowRing']['contrast']}:1"),
            ('C ligne : fond distinguable (delta ≥ 25)', after['tint']['delta'] >= 25, f"{after['tint']['delta']}"),
            ('D panneau : contraste ≥ 4,5:1', after['frame']['contrast'] >= 4.5, f"{after['frame']['contrast']}:1"),
            ('E clic réel : l\'app focus la ligne cliquée',
             real['count'] == 1 and real['index'] == 2, f"count={real['count']} index={real['index']}"),
            ('Référence AVANT : état faible (outline ≤ 1 px, contraste < 2,5:1, barre ≤ 3 px)',
             before['dir']['px'] <= 1 and before['dir']['contrast'] < 2.5 and before['barPx'] <= 3,
             f"{before['dir']['px']}px · {before['dir']['contrast']}:1 · barre {before['barPx']}px"),
        ]
        print()
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
