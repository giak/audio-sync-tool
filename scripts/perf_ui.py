#!/usr/bin/env python3
"""Harnais de mesure perf — EPIC-036 Phase 4 (décisions data-driven).

Monde synthétique à l'échelle RÉELLE (5 092 fichiers épars — le chiffre du
corpus de l'étude, monde isolé /tmp/epic036_perf, jamais le vrai data/), puis
3 interactions contractuelles mesurées dans Chrome headless (CDP) :

  A. rendu initial de la liste épars (5 092 lignes)
  B. frappe de filtre (matchesTokens + re-render des lignes filtrées)
  C. copie d'un fichier (re-render après copie)

Instruments (aucun hook dans le code applicatif) :
- PerformanceObserver 'longtask' injecté AVANT le chargement (entryTypes
  longtask : ne rapporte que les tâches > 50 ms — le seuil de décision) ;
- enveloppe rAF (le rendu applicatif passe par le batch rAF de state.ts) ;
- CDP Performance.getMetrics : deltas ScriptDuration/RecalcStyleDuration/
  LayoutDuration cumulatifs par interaction ;
- Profiler CDP autour de l'interaction C → top self-time par fonction
  (+ recherche nommée : renderEpars, matchesTokens, styleSuggest…).

Usage : python3 scripts/perf_ui.py   # écrit docs/refactoring/phase4/rapport-perf.md
"""
import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

import websocket

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WS, 'scripts'))
import capture_ui as cap  # free_port, make_mp3, WS, conventions monde

N_FILES = 5092
PORT, CDP = None, None


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def make_tiny_mp3(path):
    """MP3 minimal VALIDE (4 frames MPEG1L3) — mutagen lit l'en-tête, ~1,7 Ko."""
    with open(path, 'wb') as f:
        for _ in range(4):
            f.write(b'\xff\xfb\x90\x00' + b'\x00' * 413)


ARTISTS = [
    'Jeff Mills', 'Robert Hood', 'Carl Craig', 'Laurent Garnier', 'Dave Clarke',
    'Ben Sims', 'Adam Beyer', 'Joey Beltram', 'Robert Armani', 'Cristian Vogel',
    'Richie Hawtin', 'Sven Väth', 'Paul Kalkbrenner', 'Ellen Allien', 'Modeselektor',
    'Clark', 'Autechre', 'Aphex Twin', 'Drexciya', 'Aux 88',
    'DJ Bone', 'Surgeon',
]
ADJ = ['Silent', 'Electric', 'Dark', 'Neon', 'Frozen', 'Broken', 'Silver', 'Crimson']
NOUN = ['Bells', 'Machine', 'Signal', 'Horizon', 'Circuit', 'Rain', 'Runner', 'Ghost']


def build_perf_world(root, n=N_FILES):
    """Corpus épars à l'échelle réelle + squelettes data/ (comme capture_ui)."""
    data = os.path.join(root, 'data')
    epars_dir = os.path.join(root, 'epars')
    src1 = os.path.join(root, 'src', 'techno_1990')
    os.makedirs(data, exist_ok=True)
    for d in (epars_dir, src1):
        os.makedirs(d, exist_ok=True)

    for i in range(n):
        artist = ARTISTS[i % len(ARTISTS)]
        title = (f"{ADJ[i % len(ADJ)]} {NOUN[(i // len(ADJ)) % len(NOUN)]} {i:05d}")
        make_tiny_mp3(os.path.join(epars_dir, f'{artist} - {title}.mp3'))
        # ~10 % doublons rangés (doublons fuzzy de l'app plus probables)
        if i % 10 == 0:
            make_tiny_mp3(os.path.join(src1, f'{artist} - {title}.mp3'))

    with open(os.path.join(data, 'journal.json'), 'w') as f:
        json.dump([], f)
    with open(os.path.join(data, 'ratings.json'), 'w') as f:
        json.dump({}, f)
    with open(os.path.join(data, 'playlists.json'), 'w') as f:
        json.dump([{'name': 'perf-1', 'exported': None, 'tracks': []}], f)
    open(os.path.join(data, 'year_cache.jsonl'), 'w').close()
    open(os.path.join(data, 'itunes_cache.jsonl'), 'w').close()
    with open(os.path.join(data, 'config.json'), 'w') as f:
        json.dump({'active': 0, 'configs': [
            {'name': 'perf', 'source_data': os.path.join(root, 'src'),
             'epars_dirs': [os.path.join(root, 'epars')]},
        ]}, f)


# ── CDP minimal ──────────────────────────────────────────────────────────
def cdp_connect(cdp_port):
    for _ in range(60):
        try:
            targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{cdp_port}/json'))
            page = next(t for t in targets if t['type'] == 'page')
            return websocket.create_connection(page['webSocketDebuggerUrl'], timeout=120)
        except Exception:
            time.sleep(0.25)
    raise RuntimeError('Chrome CDP indisponible')


class Cdp:
    def __init__(self, ws):
        self.ws, self.seq = ws, 0

    def send(self, method, **params):
        self.seq += 1
        self.ws.send(json.dumps({'id': self.seq, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.seq:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg.get('result', {})

    def js(self, expr):
        return self.send('Runtime.evaluate', expression=expr, awaitPromise=True,
                         returnByValue=True).get('result', {}).get('value')


INJECT = """(() => {
  window.__longtasks = [];
  try {
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) window.__longtasks.push(
        {dur: Math.round(e.duration), start: Math.round(e.startTime)});
    }).observe({entryTypes: ['longtask']});
  } catch (e) {}
  window.__raf = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => {
    const t0 = performance.now();
    try { cb(t) } finally { window.__raf.push({dur: +(performance.now() - t0).toFixed(1)}); }
  });
})();
"""


def wait_js(c, cond, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        if c.js(cond):
            return
        time.sleep(0.2)
    raise RuntimeError(f'condition non remplie : {cond}')


def metrics(c):
    return {m['name']: m['value'] for m in c.send('Performance.getMetrics')['metrics']}


def dmetrics(a, b):
    return {k: round(b[k] - a.get(k, 0), 1) for k in
            ('ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'TaskDuration')}


def profile_top(profile, top_n=15):
    """Self-time par fonction : ATTRIBUTION PAR COMPTAGE D'ÉCHANTILLONS
    (chaque sample = tranche égale). L'attribution par timeDeltas est
    unusable en headless — deltas incohérents avec le temps mural (14,4 s de
    TaskDuration pour 2 s de fenêtre, constat run 6)."""
    from collections import Counter
    nodes = {n['id']: n for n in profile['nodes']}
    counts = Counter()
    for sid in profile['samples']:
        node = nodes.get(sid)
        if node:
            fn = node['callFrame']['functionName'] or '(anonyme)'
            counts[fn] += 1
    total = sum(counts.values()) or 1
    top = counts.most_common(top_n)
    n_perf = max(1, int(0.001 * total))
    return [(k, round(100 * v / total, 1), v) for k, v in top if v >= n_perf]


def profile_named(profile, names):
    """% d'échantillons des fonctions dont le nom contient un des motifs."""
    from collections import Counter
    nodes = {n['id']: n for n in profile['nodes']}
    counts = Counter()
    for sid in profile['samples']:
        node = nodes.get(sid)
        if node:
            fn = node['callFrame']['functionName'] or '(anonyme)'
            for name in names:
                if name in fn:
                    counts[name] += 1
                    break
    total = sum(1 for sid in profile['samples'] if sid in nodes) or 1
    return {k: f'{round(100 * v / total, 1)}%' for k, v in counts.most_common()}


def main():
    global PORT, CDP
    tmp = '/tmp/epic036_perf'
    if os.path.exists(tmp):
        shutil.rmtree(tmp)
    os.makedirs(tmp)
    # Copie de l'app dans un tmp (comme capture_ui.py) : DATA_DIR = <tmp>/data.
    for mod in ('app.py', 'analysis.py', 'nml.py'):
        shutil.copy2(os.path.join(WS, mod), os.path.join(tmp, mod))
    os.makedirs(os.path.join(tmp, 'templates'), exist_ok=True)
    shutil.copy2(os.path.join(WS, 'templates', 'index.html'),
                 os.path.join(tmp, 'templates', 'index.html'))
    # static/ du monde = vrai dossier (PAS un symlink) : on y place un bundle
    # NON MINIFIÉ (noms de fonctions lisibles pour le CPU profile), construit
    # depuis les sources du dépôt — la logique mesurée est identique.
    wstatic = os.path.join(tmp, 'static')
    os.makedirs(os.path.join(wstatic, 'dist'), exist_ok=True)
    shutil.copy2(os.path.join(WS, 'static', 'dist', 'script.css'),
                 os.path.join(wstatic, 'dist', 'script.css'))
    subprocess.run(
        ['node', '-e',
         'import("esbuild").then(async e => { await e.build({'
         'entryPoints: ["static/src/script.ts"], bundle: true,'
         'outfile: process.argv[1], format: "esm", target: "es2022",'
         'minify: false, logLevel: "silent"}); });',
         os.path.join(wstatic, 'dist', 'script.js')],
        cwd=WS, check=True,
        env={**os.environ, 'NODE_PATH': os.path.join(WS, 'node_modules')})
    build_perf_world(tmp)
    print(f'monde perf : {tmp} ({N_FILES} épars, bundle non minifié)')

    PORT, CDP = free_port(), free_port()
    # Le cwd du serveur = tmp → DATA_DIR tombe dans le monde de perf.
    proc = subprocess.Popen(
        [sys.executable, '-c',
         'import sys; sys.path.insert(0, "."); from app import app; '
         'app.run(host="127.0.0.1", port=%d, threaded=True)' % PORT],
        cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen(
        ['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu',
         f'--remote-debugging-port={CDP}', '--remote-allow-origins=*',
         '--user-data-dir=/tmp/epic036_perf_chrome', '--window-size=1440,900',
         'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        page_url = f'http://127.0.0.1:{PORT}/'
        for _ in range(60):
            try:
                urllib.request.urlopen(page_url, timeout=1)
                break
            except Exception:
                time.sleep(0.25)
        scan = json.load(urllib.request.urlopen(f'{page_url}scan', timeout=600))
        n_epars = sum(len(v) for v in scan.get('epars', {}).values())
        print(f'  scan effectué : {n_epars} épars (attendu ≥ {N_FILES - 8})')
        assert n_epars >= N_FILES - 8, f'scan incomplet : {n_epars}'

        # Réalisme des durées : les MP3 minimaux ont toutes ~la même durée →
        # buckets dup-fuzzy DÉGÉNÉRÉS (coût de similarité surestimé ×N vs corpus
        # réel). On patche cache.json avec une durée réaliste DÉTERMINISTE par
        # nom (même morceau = même durée des deux côtés → les jumeaux restent
        # matchables) ; distribution 2-7 min comme un vrai casier. Le /load de
        # l'app lit ce cache — le patch doit précéder la navigation.
        import zlib
        cache_path = os.path.join(tmp, 'data', 'cache.json')
        with open(cache_path, encoding='utf-8') as f:
            cache = json.load(f)
        n_patched = 0
        for section in ('epars', 'source', 'extra_dirs'):
            for _dir, entries in (cache.get(section) or {}).items():
                for name, meta in entries.items():
                    meta['duration'] = 120 + zlib.crc32(name.encode()) % 300
                    n_patched += 1
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(cache, f)
        print(f'  durées réalistes posées : {n_patched} fichiers (120-420 s, déterministes)')

        c = Cdp(cdp_connect(CDP))
        c.send('Page.enable')
        c.send('Performance.enable')
        c.send('Profiler.enable')
        c.send('Page.addScriptToEvaluateOnNewDocument', source=INJECT)
        # ── A. rendu initial profilé : Profiler de la navigation au premier
        #    rendu complet (attribution makeFileEl / layout / dup-suggest) et
        #    deltas Performance.getMetrics exploitables (baseline pré-nav).
        c.send('Profiler.start')
        m_prev = metrics(c)
        c.send('Page.navigate', url=page_url)
        wait_js(c, "document.readyState === 'complete'")
        wait_js(c, f"document.querySelectorAll('#epars-container .file').length >= {N_FILES - 8}",
                timeout=60)
        prof_a = c.send('Profiler.stop')['profile']
        m_now = metrics(c)

        rapport = {'n_epars': n_epars}

        # ── A. rendu initial (5 092 lignes) ─────────────────────────────
        raf = c.js("JSON.stringify(window.__raf)")
        lt = c.js("JSON.stringify(window.__longtasks)")
        rapport['A_rendu_initial'] = {
            'raf_durs_ms': json.loads(raf),
            'longtasks': json.loads(lt),
            'metrics_delta': dmetrics(m_prev, m_now),
            'top_self_time_pct': profile_top(prof_a, top_n=15),
            'named': profile_named(prof_a, ['renderEpars', 'makeFileEl', 'suggest',
                                            'scoreFromStyles', 'nameSimilarity',
                                            'normalizeName', 'refreshDupMatches']),
        }
        c.js("window.__raf = []; window.__longtasks = [];")

        # ── B. frappe de filtre ─────────────────────────────────────────
        m0 = metrics(c)
        c.js("""(() => {
          const inp = document.querySelector('.filter-input');
          inp.focus();
          inp.value = 'bells';
          inp.dispatchEvent(new Event('input', {bubbles: true}));
        })()""")
        wait_js(c, "window.__raf.length > 0", timeout=10)
        time.sleep(0.5)
        m1 = metrics(c)
        rapport['B_frappe_filtre'] = {
            'raf_durs_ms': json.loads(c.js("JSON.stringify(window.__raf)")),
            'longtasks': json.loads(c.js("JSON.stringify(window.__longtasks)")),
            'metrics_delta': dmetrics(m0, m1),
            'rows_after': c.js("document.querySelectorAll('#epars-container .file').length"),
        }
        c.js("window.__raf = []; window.__longtasks = [];")

        # ── C. copie (re-render après copie) + CPU profile ──────────────
        # F5 = « Copier la sélection → dossier focusé » (commands/copy.ts, page
        # sync). executeCopy exige : focus gauche (.focused .file), focus d'un
        # DOSSIER à droite (.focused.directory), puis confirmation modal.
        # Le clic dossier déplie l'arbre (re-render → focus perdu) : on clique
        # la ligne épars (qui déclenche le rendu de l'arbre), PUIS on pose le
        # focus du dossier manuellement (executeCopy lit le DOM direct —
        # équivalent au focus clavier, contournement du re-render).
        # F5 = KeyboardEvent SYNTHÉTIQUE sur `document` (le handler du registry
        # n'a pas de garde isTrusted ; F5 NATIF est consommé par Chrome = reload,
        # constat run 3 — même approche que la suite jsdom). Le run 1 avait
        # échoué à cause d'un mauvais sélecteur, pas du dispatch.
        c.js("document.querySelector('#epars-container .file-row').click()")
        wait_js(c, "!!document.querySelector('#epars-container .focused')", timeout=10)
        wait_js(c, "!!document.querySelector('#source-container .directory')", timeout=30)
        c.js("(() => { const d = document.querySelector('#source-container .directory');"
             "d.classList.add('focused'); })()")
        c.js("window.__raf = []; window.__longtasks = [];")
        c.send('Profiler.start')
        m2 = metrics(c)
        c.js("document.dispatchEvent(new KeyboardEvent('keydown', "
             "{key: 'F5', code: 'F5', bubbles: true, cancelable: true}))")
        wait_js(c, "!!document.querySelector('#modal-dialog:not(.hidden)')", timeout=10)
        c.js("document.getElementById('dialog-confirm').click()")
        time.sleep(2)
        prof = c.send('Profiler.stop')['profile']
        m3 = metrics(c)
        rapport['C_copie'] = {
            'raf_durs_ms': json.loads(c.js("JSON.stringify(window.__raf)")),
            'longtasks': json.loads(c.js("JSON.stringify(window.__longtasks)")),
            'metrics_delta': dmetrics(m2, m3),
            'top_self_time_pct': profile_top(prof, top_n=15),
            'named': profile_named(prof, ['renderEpars', 'matchesTokens', 'suggest',
                                          'scoreFromStyles', 'buildSourceTrees',
                                          'renderSource', 'patchSource', 'fmtCount']),
            'status_after': c.js("document.getElementById('status-text').textContent"),
        }

        # ── Verdict longtask (> 50 ms) ──────────────────────────────────
        for k in ('A_rendu_initial', 'B_frappe_filtre', 'C_copie'):
            r = rapport[k]
            lt = r['longtasks']
            raf = sorted((x['dur'] for x in r['raf_durs_ms']), reverse=True)[:5]
            r['verdict_50ms'] = (f'{len(lt)} longtask(s), max {max((x["dur"] for x in lt), default=0)} ms'
                                 if lt else 'aucun longtask (< 50 ms)')
            r['raf_top5_ms'] = raf

        out_dir = os.path.join(WS, 'docs', 'refactoring', 'phase4')
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, 'mesures.json'), 'w') as f:
            json.dump(rapport, f, indent=2, ensure_ascii=False)
        print(json.dumps(rapport, indent=2, ensure_ascii=False))
    finally:
        chrome.terminate()
        proc.terminate()
        shutil.rmtree('/tmp/epic036_perf_chrome', ignore_errors=True)


if __name__ == '__main__':
    main()
