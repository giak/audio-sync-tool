#!/usr/bin/env python3
"""Preuve headless — EPIC-037 P2 (chip collé) + P3 (clic dans le champ sans scroll).

Lance un serveur Flask ISOLÉ (monde synthétique de `capture_ui.build_world`,
data/ réel jamais touché, corpus gonflé pour garantir le scroll) et pilote Chrome
headless (CDP) sur 4 mesures :

  1. P2  — chip collé : le slot `#filter-slot-sync-epars` reste épinglé au haut
           du panneau pendant que la liste défile ;
  2. P2c — contrôle : sticky désactivé par override CSS → le slot défile (la
           mesure est sensible au CSS, elle ne passe pas par accident) ;
  3. P3  — clic RÉEL (Input.dispatchMouseEvent) dans le champ alors que la
           colonne est scrollée → `scrollTop` inchangé, champ focusé ;
  4. P3c — contrôle : clic synthétique sur la ligne d'état épars (hors chip) →
           `scrollTop` change (le mécanisme `setActivePanel → scrollIntoView`
           est bien vivant — sinon la mesure 3 ne prouverait rien) ;
  5. P4  — touche ↓ RÉELLE (Input.dispatchKeyEvent) dans le champ → le focus
           entre dans `#epars-container` (colonne DU chip) et pas dans la
           colonne de droite (régression d'origine : saut vers Source Data).

Usage : python3 scripts/proof_filter_chip.py [out_dir]
Sortie : rapport texte + captures PNG (`8-chip-scrolled.png`, `9-chip-clicked.png`).
"""
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture_ui import WS, build_world, free_port, make_mp3  # noqa: E402

EXTRA_FILES = 60          # corpus gonflé : le panneau doit dépasser la fenêtre
WINDOW = '1280,600'
PANEL = "document.getElementById('panel-left')"
SLOT = "document.getElementById('filter-slot-sync-epars')"

# Mesure commune : position du slot relatif au haut du panneau, à repos puis collé.
MEASURE = """(() => {
  const panel = document.getElementById('panel-left');
  const slot = document.getElementById('filter-slot-sync-epars');
  const top = () => slot.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  panel.scrollTop = 0;
  const atRest = top();
  const max = panel.scrollHeight - panel.clientHeight;
  panel.scrollTop = max;
  const pinned = top();
  const firstRow = document.querySelector('#epars-container .file-row');
  const rowTop = firstRow ? firstRow.getBoundingClientRect().top - panel.getBoundingClientRect().top : 0;
  return JSON.stringify({ maxScroll: Math.round(max), atRest: Math.round(atRest),
                          pinned: Math.round(pinned), firstRowTop: Math.round(rowTop) });
})()"""


def bootstrap():
    tmp = '/tmp/epic037_proof_world'
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    for mod in ('app.py', 'analysis.py', 'nml.py'):
        shutil.copy2(os.path.join(WS, mod), os.path.join(tmp, mod))
    os.makedirs(os.path.join(tmp, 'templates'), exist_ok=True)
    shutil.copy2(os.path.join(WS, 'templates', 'index.html'),
                 os.path.join(tmp, 'templates', 'index.html'))
    os.symlink(os.path.join(WS, 'static'), os.path.join(tmp, 'static'))
    build_world(tmp)
    epars_dir = os.path.join(tmp, 'epars', '_techno')
    for i in range(EXTRA_FILES):
        make_mp3(os.path.join(epars_dir, f'Probe {i:02d} - Track {i:02d}.mp3'))

    port = free_port()
    cdp = free_port()
    server = subprocess.Popen(
        [sys.executable, '-c',
         'import sys; sys.path.insert(0, "."); from app import app; '
         'app.run(host="127.0.0.1", port=%d, threaded=True)' % port],
        cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen(
        ['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu',
         f'--remote-debugging-port={cdp}', '--remote-allow-origins=*',
         f'--user-data-dir={tmp}/.chrome', f'--window-size={WINDOW}', 'about:blank'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return tmp, port, cdp, server, chrome


def main():
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/tmp/epic037_proof')
    os.makedirs(out, exist_ok=True)
    tmp, port, cdp, server, chrome = bootstrap()
    checks = []

    def check(label, ok, detail):
        checks.append((label, bool(ok), detail))
        print(f'  {"✅" if ok else "❌"} {label} : {detail}')

    try:
        import websocket  # websocket-client (python3 système, cf. capture_ui.py)

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
        n_epars = sum(len(v) for v in scan.get('epars', {}).values())
        if n_epars < 40:
            raise RuntimeError(f'scan incomplet ({n_epars} fichiers épars)')
        print(f'  monde de preuve : {tmp} ({n_epars} fichiers épars)')

        targets = None
        for _ in range(60):
            try:
                targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{cdp}/json'))
                break
            except Exception:
                time.sleep(0.25)
        if not targets:
            raise RuntimeError('Chrome CDP indisponible')
        page = next(t for t in targets if t['type'] == 'page')
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
            return send('Runtime.evaluate', expression=expr, awaitPromise=True,
                        returnByValue=True).get('result', {}).get('value')

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

        def click_real_at(x, y):
            send('Input.dispatchMouseEvent', type='mouseMoved', x=x, y=y)
            send('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y,
                 button='left', clickCount=1)
            send('Input.dispatchMouseEvent', type='mouseReleased', x=x, y=y,
                 button='left', clickCount=1)

        send('Page.enable')
        send('Page.navigate', url=page_url)
        wait("document.readyState === 'complete'")
        wait("!!document.querySelector('#epars-container .file-row')")
        # Animations gelées : captures déterministes (règle ASYNC du harnais EPIC-036).
        # IIFE obligatoire : Runtime.evaluate partage la portée globale (un `const s`
        # nu resterait déclaré et ferait échouer l'injection suivante).
        js("(() => {const s=document.createElement('style');s.id='freeze-anim';"
           "s.textContent='*,*::before,*::after{animation:none !important;"
           "transition:none !important;caret-color:transparent !important}';"
           "document.head.appendChild(s);})()")
        time.sleep(0.3)

        print('\n── P2 · chip collé ─────────────────────────────────────────')
        m = json.loads(js(MEASURE))
        shot('8-chip-scrolled')
        check('P2 sticky ON', m['maxScroll'] > 200 and -12 <= m['pinned'] <= 2
              and m['pinned'] < m['atRest'] and m['firstRowTop'] < 0,
              f"scroll max {m['maxScroll']}px · slot à repos {m['atRest']}px · "
              f"collé {m['pinned']}px · 1ʳᵉ ligne {m['firstRowTop']}px")

        js("(() => {const s=document.createElement('style');s.id='no-sticky';"
           "s.textContent='#panel-left > #filter-slot-sync-epars{position:static !important}';"
           "document.head.appendChild(s);})()")
        m2 = json.loads(js(MEASURE))
        check('P2 contrôle (sticky OFF)', m2['pinned'] < -100,
              f"slot {m2['pinned']}px — la mesure détecte bien l'absence de sticky")
        js("document.getElementById('no-sticky')?.remove()")

        print('\n── P3 · clic dans le champ pendant le scroll ───────────────')
        pos = json.loads(js(f"""(() => {{
          const panel = {PANEL};
          const input = document.querySelector('.filter-chip[data-scope="sync-epars"] .filter-input');
          panel.scrollTop = 200;
          const r = input.getBoundingClientRect();
          return JSON.stringify({{ before: Math.round(panel.scrollTop),
                                   x: Math.round(r.left + r.width / 2),
                                   y: Math.round(r.top + r.height / 2),
                                   visible: r.top > 0 && r.bottom < window.innerHeight }});
        }})()"""))
        click_real_at(pos['x'], pos['y'])
        time.sleep(0.4)
        after = json.loads(js(f"""(() => {{
          const panel = {PANEL};
          const input = document.querySelector('.filter-chip[data-scope="sync-epars"] .filter-input');
          return JSON.stringify({{ after: Math.round(panel.scrollTop),
                                   focused: document.activeElement === input }});
        }})()"""))
        shot('9-chip-clicked')
        check('P3 clic réel dans le chip', pos['visible'] and after['after'] == pos['before']
              and after['focused'],
              f"champ visible {pos['visible']} (y={pos['y']}) · scrollTop {pos['before']} → "
              f"{after['after']} · focus champ {after['focused']}")

        ctrl = json.loads(js(f"""(() => {{
          const panel = {PANEL};
          panel.scrollTop = 200;
          const before = panel.scrollTop;
          document.getElementById('epars-status-line').dispatchEvent(
            new MouseEvent('click', {{ bubbles: true, cancelable: true }}));
          return JSON.stringify({{ before: Math.round(before), after: Math.round(panel.scrollTop) }});
        }})()"""))
        check('P3 contrôle (clic hors chip)', ctrl['after'] != ctrl['before'],
              f"scrollTop {ctrl['before']} → {ctrl['after']} — le scroll du panneau reste vivant")

        print('\n── P4 · ↓ depuis le champ → la liste DE SA colonne ───────')
        pre = json.loads(js(f"""(() => {{
          const panel = {PANEL};
          const input = document.querySelector('.filter-chip[data-scope="sync-epars"] .filter-input');
          panel.scrollTop = 0;
          for (const el of document.querySelectorAll('.focused')) el.classList.remove('focused');
          input.focus();
          return JSON.stringify({{ focusedChip: document.activeElement === input }});
        }})()"""))
        send('Input.dispatchKeyEvent', type='rawKeyDown', key='ArrowDown',
             code='ArrowDown', windowsVirtualKeyCode=40, nativeVirtualKeyCode=40)
        send('Input.dispatchKeyEvent', type='keyUp', key='ArrowDown',
             code='ArrowDown', windowsVirtualKeyCode=40, nativeVirtualKeyCode=40)
        time.sleep(0.4)
        post = json.loads(js(f"""(() => {{
          const epars = document.querySelector('#epars-container .focused');
          const source = document.querySelector('#source-container .focused');
          return JSON.stringify({{
            chipStillFocused: document.activeElement?.classList?.contains('filter-input') ?? false,
            eparsFocus: epars ? (epars.dataset.focuspath || epars.className) : null,
            sourceFocus: source ? (source.dataset.focuspath || source.className) : null,
            leftActive: document.getElementById('panel-left').classList.contains('panel-active'),
          }});
        }})()"""))
        check('P4 ↓ dans le champ', pre['focusedChip'] and not post['chipStillFocused']
              and post['eparsFocus'] is not None and post['sourceFocus'] is None,
              f"champ quitté {not post['chipStillFocused']} · focus épars "
              f"{post['eparsFocus']!r} · focus source {post['sourceFocus']!r} · "
              f"colonne gauche active {post['leftActive']}")

        print()
        failed = [c for c in checks if not c[1]]
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
