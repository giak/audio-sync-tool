#!/usr/bin/env python3
"""Harnais de capture UI — EPIC-036 Phase 3 (CSS en couches), captures avant/après.

Lance un serveur Flask ISOLÉ (data/ synthétique + corpus audio minimal, static/
lié en place, jamais le vrai data/) et capture 7 états de l'app avec Chrome
headless (CDP) : sync fermé, sync déplié, doublons, années, playlist, légende,
config. Les clics ne déclenchent que rendus et navigations — aucune écriture
destructrice (pas de copy/replace/apply).

Usage :
    python3 scripts/capture_ui.py <out_dir>     # serveur éphémère + captures
"""
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WS, 'scripts'))


def free_port():
    """Port éphémère — un zombie d'un run précédent ne peut plus polluer
    les captures (constaté : un serveur orphelin répondait sur le port fixe)."""
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


def make_mp3(path):
    """MP3 minimal (frames MPEG1L3 silencieuses, ~2,6 s) — valide sans tag."""
    with open(path, 'wb') as f:
        for _ in range(80):
            f.write(b'\xff\xfb\x90\x00' + b'\x00' * 413)


def build_world(root):
    """data/ synthétique + corpus. Aucun fichier du vrai data/ n'est utilisé."""
    data = os.path.join(root, 'data')
    os.makedirs(data, exist_ok=True)
    epars_dir = os.path.join(root, 'epars', '_techno')
    src1 = os.path.join(root, 'src', 'techno_1990')
    src2 = os.path.join(root, 'src', 'techno_hard')
    for d in (epars_dir, src1, src2):
        os.makedirs(d, exist_ok=True)

    filenames = [
        'Daft Punk - Around the World.mp3',
        'Laurent Garnier - The Man with the Red Face.mp3',
        'Jeff Mills - The Bells.mp3',
        'Dave Clarke - Red 2.mp3',
        'Ben Sims - Manipulated.mp3',
        'Adam Beyer - Teach Me.mp3',
        'Robert Armani - Ambulance.mp3',
        'Joey Beltram - Energy Flash.mp3',
    ]
    for fn in filenames:
        make_mp3(os.path.join(epars_dir, fn))
        # 5/8 sont rangés aussi (doublons) ; 3 restent 'nouveau'
        if fn.split(' - ')[0] in ('Daft Punk', 'Laurent Garnier', 'Jeff Mills',
                                  'Dave Clarke', 'Robert Armani'):
            make_mp3(os.path.join(src1, fn))
    make_mp3(os.path.join(src2, 'Adam Beyer - Teach Me.mp3'))

    with open(os.path.join(data, 'journal.json'), 'w') as f:
        json.dump([
            {'timestamp': '2026-09-19T10:00:00', 'action': 'copied', 'status': 'copied',
             'source': '/x/a.mp3', 'dest': '/y/a.mp3',
             'filename': 'Ben Sims - Manipulated.mp3'},
        ], f)

    with open(os.path.join(data, 'ratings.json'), 'w') as f:
        json.dump({'/src/techno_1990/Daft Punk - Around the World.mp3': 4}, f)

    with open(os.path.join(data, 'playlists.json'), 'w') as f:
        # NB : playlists.json = un TABLEAU nu (GET /playlists le renvoie tel quel)
        json.dump([
            {'name': 'test-1', 'exported': None, 'tracks': [
                {'filename': 'Laurent Garnier - The Man with the Red Face.mp3',
                 'fullPath': f'{epars_dir}/Laurent Garnier - The Man with the Red Face.mp3',
                 'year': '1999', 'duration': 300, 'codec': 'MP3'},
                {'filename': 'Joey Beltram - Energy Flash.mp3',
                 'fullPath': f'{epars_dir}/Joey Beltram - Energy Flash.mp3',
                 'year': None, 'duration': 240, 'codec': 'MP3'},
            ]},
            {'name': 'test-2', 'exported': None, 'tracks': []},
        ], f)

    # Caches années (JSONL : une ligne = un dict JSON, dernier gagnant par clé).
    # Clé = 'artiste\ttitre' en MINUSCULES (sortie de _artist_title, comme les
    # vraies collectes).
    with open(os.path.join(data, 'year_cache.jsonl'), 'w') as f:
        f.write(json.dumps({'key': 'jeff mills\tthe bells', 'status': 'found',
                            'year': '1997', 'source': 'musicbrainz'}) + '\n')
        f.write(json.dumps({'key': 'ben sims\tmanipulated', 'status': 'ambiguous',
                            'year': None, 'source': 'musicbrainz',
                            'years': ['1997', '1999']}) + '\n')
    with open(os.path.join(data, 'itunes_cache.jsonl'), 'w') as f:
        f.write(json.dumps({'key': 'adam beyer\tteach me', 'status': 'lax',
                            'year': '1998', 'source': 'itunes'}) + '\n')

    with open(os.path.join(data, 'config.json'), 'w') as f:
        json.dump({'active': 0, 'configs': [
            {'name': 'capture', 'source_data': os.path.join(root, 'src'),
             'epars_dirs': [os.path.join(root, 'epars')]},
        ]}, f)


def main():
    out = os.path.abspath(sys.argv[1])
    os.makedirs(out, exist_ok=True)
    port = free_port()
    cdp = free_port()
    # Chemin FIXE (pas mkdtemp) : les chemins du monde s'affichent à l'écran
    # (inputs cfg-source/cfg-epars de la modal config) → un suffixe aléatoire
    # rendrait le diff pixel non déterministe entre deux runs.
    tmp = '/tmp/epic036_capture'
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)

    # Copie de l'app dans un tmp : DATA_DIR = <tmp>/data (jamais le vrai data/).
    for mod in ('app.py', 'analysis.py', 'nml.py'):
        shutil.copy2(os.path.join(WS, mod), os.path.join(tmp, mod))
    os.makedirs(os.path.join(tmp, 'templates'), exist_ok=True)
    shutil.copy2(os.path.join(WS, 'templates', 'index.html'),
                 os.path.join(tmp, 'templates', 'index.html'))
    os.symlink(os.path.join(WS, 'static'), os.path.join(tmp, 'static'))

    build_world(tmp)
    print(f'monde de capture : {tmp}')

    # Le cwd du serveur = tmp → DATA_DIR tombe dans le monde de capture.
    proc = subprocess.Popen(
        [sys.executable, '-c',
         'import sys; sys.path.insert(0, "."); from app import app; '
         'app.run(host="127.0.0.1", port=%d, threaded=True)' % port],
        cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen(
        ['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu',
         f'--remote-debugging-port={cdp}', '--remote-allow-origins=*',
         f'--user-data-dir={tmp}/.chrome',
         '--window-size=1440,900', 'about:blank'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        run_captures(out, port, cdp)
    finally:
        chrome.terminate()
        proc.terminate()

    print('✅ Captures écrites dans', out)


def run_captures(out, port, cdp):
    import websocket  # websocket-client (python3)

    page_url = f'http://127.0.0.1:{port}/'

    def wait_server():
        for _ in range(60):
            try:
                urllib.request.urlopen(page_url, timeout=1)
                return
            except Exception:
                time.sleep(0.25)
        raise RuntimeError('serveur Flask non démarré')

    wait_server()
    # Le monde de capture doit être scanné avant la navigation, sinon les
    # panneaux restent légitimement vides (états EPIC-014). Garde : la réponse
    # doit contenir les fichiers du monde (pas un zombie d'un ancien run).
    scan = json.load(urllib.request.urlopen(f'{page_url}scan', timeout=30))
    n_epars = sum(len(v) for v in scan.get('epars', {}).values())
    if n_epars < 8:
        raise RuntimeError(f'scan de capture incomplet ({n_epars} fichiers épars)')
    print(f'  scan de capture effectué ({n_epars} fichiers épars)')
    for _ in range(60):
        try:
            targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{cdp}/json'))
            page = next(t for t in targets if t['type'] == 'page')
            break
        except Exception:
            time.sleep(0.25)
    else:
        raise RuntimeError('Chrome CDP indisponible')

    ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=15)
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

    def wait(cond, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            if js(cond):
                return
            time.sleep(0.2)
        raise RuntimeError(f'condition non remplie : {cond}')

    def shot(name):
        data = send('Page.captureScreenshot', format='png')['data']
        with open(os.path.join(out, f'{name}.png'), 'wb') as f:
            f.write(base64.b64decode(data))
        print(f'  📸 {name}.png')

    send('Page.enable')
    send('Page.navigate', url=page_url)
    wait("document.readyState === 'complete'", 15)
    wait("!!document.querySelector('#epars-container .file')", 15)

    # Sonde DOM optionnelle (CAPTURE_PROBE=1) : JSON au point de capture 1-sync,
    # pour vérifier le déterminisme du harnais (règle ASYNC du §5.3 de l'étude).
    if os.environ.get('CAPTURE_PROBE'):
        probe = js("JSON.stringify({"
                   "toast: document.getElementById('toast')?.className ?? null,"
                   "status: document.getElementById('status-text')?.textContent ?? null,"
                   "srcFiles: document.querySelectorAll('#source-container .file').length,"
                   "srcDirs: document.querySelectorAll('#source-container .directory').length,"
                   "badge: document.getElementById('badge-epars')?.textContent ?? null})")
        print('  sonde DOM :', probe)

    # Gèle animations/transitions/caret pour des captures déterministes (règle
    # ASYNC §5.3 de l'étude : twinPulse 2.4s infini rendait le diff pixel
    # non reproductible d'un run à l'autre). Injecté une fois, couvre les 7 shots.
    js("const s=document.createElement('style');s.id='freeze-anim';"
       "s.textContent='*,*::before,*::after{animation:none !important;"
       "transition:none !important;caret-color:transparent !important}';"
       "document.head.appendChild(s)")
    time.sleep(0.3)

    # 1. sync fermé
    shot('1-sync')

    # 2. sync déplié (clic dossier source = toggle)
    js("document.querySelector('#source-container .directory')?.click()")
    wait("!!document.querySelector('#source-container .children .file')", 8)
    shot('2-sync-expanded')

    # 3. doublons
    js("document.getElementById('page-dups').click()")
    wait("!!document.querySelector('.dup-card')", 8)
    shot('3-dups')

    # 4. années
    js("document.getElementById('page-years').click()")
    wait("!!document.querySelector('.years-card')", 8)
    shot('4-years')

    # 5. playlist
    js("document.getElementById('page-playlist').click()")
    wait("!!document.querySelector('.pl-track')", 8)
    shot('5-playlist')

    # 6. légende
    js("document.getElementById('btn-legend').click()")
    wait("!!document.querySelector('#modal-legend:not(.hidden)')", 8)
    shot('6-legend')

    # 7. config
    js("document.getElementById('btn-config').click()")
    wait("!!document.querySelector('#modal-config:not(.hidden)')", 8)
    if os.environ.get('CAPTURE_PROBE'):
        p2 = js("(()=>{const box=r=>{const b=r.getBoundingClientRect();"
                "return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};"
                "const els=[...document.querySelectorAll('#modal-config input,#modal-config select,#modal-config textarea')];"
                "const e1=document.elementFromPoint(630,315);const e2=document.elementFromPoint(630,520);"
                "return JSON.stringify({els:els.map(e=>({id:e.id,tag:e.tagName,box:box(e),v:e.value})),"
                "at315:e1?{id:e1.id,tag:e1.tagName}:null,at520:e2?{id:e2.id,tag:e2.tagName}:null})})()")
        print('  sonde 7-config :', p2)
    shot('7-config')


if __name__ == '__main__':
    main()
