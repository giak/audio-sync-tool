#!/usr/bin/env python3
"""Preuve headless — EPIC-041 · palette « g » (style + année écrits tout de suite).

Monde Flask ISOLÉ (`capture_ui.build_world`, le data/ réel n'est jamais touché),
Chrome headless piloté par CDP, et des touches/clics RÉELS (`Input.dispatch*`).
Ce que ça prouve, sur le fichier **sur disque** (relu par mutagen, pas par l'API) :

  1. `g` ouvre la palette sur la ligne épars focusée (touche réelle) ;
  2. la modale montre TOUT : chaque style et les 57 années (1970→2026) sont
     présents ET entièrement dans la boîte visible (aucun bouton coupé) ;
  3. cliquer un style écrit le **TCON** immédiatement (avant : rien au disque) ;
  4. cliquer une année écrit le **TDRC** immédiatement, et la cellule Année de
     la ligne se met à jour dans l'UI ;
  5. contrôle : avant tout clic, le fichier n'a ni genre ni année — la
     modification mesurée est bien causée par le clic, pas préexistante ;
  6. `g` sur un MORCEAU déjà rangé (colonne Source Data) : palette ouverte,
     titre « Source Data · », tags écrits, **aucun** choix de rangement ;
  7. `g` avec seulement un DOSSIER surligné : message explicite, pas de palette ;
  8. régression mesurée : `g` sur une ligne épars alors que le panneau actif est
     la colonne droite → la palette s'ouvre (avant EPIC-041 : silence total).

Taxonomie chargée : `PROOF_EXTRA_STYLES=40` ajoute 40 styles au monde pour
vérifier que la grille des styles défile sans jamais pousser les années hors
de la palette (les 57 années restent entièrement visibles).

NB : le CSS/JS est bundlé — `npm run build` AVANT de lancer, sinon on mesure
l'ancien bundle (piège déjà rencontré).

Usage : python3 scripts/proof_style_palette.py [out_dir]
Sortie : rapport texte + captures PNG (1-palette.png, 2-style.png, 3-annee.png,
         4-source-data.png).
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

WINDOW = '1280,800'
VENV_PY = os.path.join(WS, 'venv', 'bin', 'python')
# Relit les tags du fichier SUR DISQUE (le point de la preuve : pas la réponse HTTP).
TAG_READER = (
    'import json,sys,mutagen;'
    'from mutagen import File as MF;'
    'a=MF(sys.argv[1],easy=False);'
    't=getattr(a,"tags",None) or {};'
    'g=t.get("TCON");g=str(g[0]) if g and isinstance(g,(list,tuple)) else (str(g) if g else None);'
    'y=t.get("TDRC") or t.get("TYER");'
    'y=str(y[0])[:4] if y and isinstance(y,(list,tuple)) else (str(y)[:4] if y else None);'
    'print(json.dumps({"genre":g,"year":y}))'
)

# Visibilité intégrale : chaque bouton doit être contenu dans la palette ET le viewport.
# Un `.sp-style` peut être hors de la boîte SI la grille dédiée défile (il reste
# atteignable) ; les ANNÉES, elles, ne doivent JAMAIS être coupées (EPIC-041).
VISIBILITY = """(() => {
  const pal = document.querySelector('.style-palette');
  if (!pal) return JSON.stringify({open: false});
  const pr = pal.getBoundingClientRect();
  const box = [...pal.querySelectorAll('.sp-style, .sp-year')];
  const clipped = [];
  for (const b of box) {
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { clipped.push([b.className + ':' + (b.dataset.style || b.dataset.year), 'taille 0']); continue; }
    if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 ||
        r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) {
      clipped.push([b.className + ':' + (b.dataset.style || b.dataset.year), 'hors palette']);
    } else if (r.top < 0 || r.bottom > window.innerHeight) {
      clipped.push([b.className + ':' + (b.dataset.style || b.dataset.year), 'hors écran']);
    }
  }
  const grid = pal.querySelector('.sp-styles');
  const years = [...pal.querySelectorAll('.sp-year')];
  return JSON.stringify({
    open: true,
    styles: pal.querySelectorAll('.sp-style').length,
    years: years.length,
    span: years.length ? [years[0].dataset.year, years[years.length - 1].dataset.year] : [],
    clipped: clipped.filter(c => c[0].startsWith('sp-year')).slice(0, 6),
    clippedCount: clipped.filter(c => c[0].startsWith('sp-year')).length,
    styleGrid: {
      scrollable: grid ? grid.scrollHeight > grid.clientHeight + 1 : false,
      scrollH: grid ? Math.round(grid.scrollHeight) : 0,
      clientH: grid ? Math.round(grid.clientHeight) : 0,
      visible: grid ? grid.querySelectorAll('.sp-style').length : 0,
    },
    paletteBox: [Math.round(pr.top), Math.round(pr.bottom), Math.round(pr.height)],
    windowH: window.innerHeight,
  });
})()"""

# Dernier style atteignable : on fait défiler la GRILLE jusqu'en bas et on
# vérifie que le dernier bouton est alors entièrement dans la palette.
REACH_LAST_STYLE = """(() => {
  const pal = document.querySelector('.style-palette');
  const grid = pal?.querySelector('.sp-styles');
  const all = [...(grid?.querySelectorAll('.sp-style') || [])];
  if (!pal || !grid || !all.length) return JSON.stringify({ok: false, reason: 'pas de grille'});
  grid.scrollTop = grid.scrollHeight;
  const last = all[all.length - 1];
  const pr = pal.getBoundingClientRect();
  const r = last.getBoundingClientRect();
  return JSON.stringify({
    ok: r.top >= pr.top - 0.5 && r.bottom <= pr.bottom + 0.5 && r.height > 1,
    last: last.dataset.style,
    box: [Math.round(r.top), Math.round(r.bottom)],
    palette: [Math.round(pr.top), Math.round(pr.bottom)],
    scrolled: Math.round(grid.scrollTop),
  });
})()"""


# Géométrie d'un élément ciblé + ce qui se trouve RÉELLEMENT au point cliqué.
# `__EXPR__` = expression JS qui renvoie l'élément (sert aussi pour un élément
# calculé par index, là où un sélecteur CSS serait fragile).
RECT_JS = """(() => {
  const el = (__EXPR__);
  if (!el) return JSON.stringify({missing: true});
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return JSON.stringify({x, y, w: Math.round(r.width), h: Math.round(r.height),
    inView: r.top >= 0 && r.bottom <= window.innerHeight,
    covers: !!hit && hit !== el && !el.contains(hit) && !hit.contains(el),
    hit: hit ? (hit.id || hit.className || hit.tagName) + '' : null});
})()"""

# Dossier racine 0 de la colonne droite : on vise sa LIGNE DE NOM (span), pas
# l'élément `.directory` — déplié, son rect englobe ses enfants et le centre
# tomberait dans une ligne fichier.
DIR0_EXPR = "document.querySelectorAll('#source-container .directory')[0]?.querySelector('span')"


def tag_of(path):
    """Tags réellement présents dans le fichier, relus hors de l'app."""
    out = subprocess.run([VENV_PY, '-c', TAG_READER, path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


# Mots de style VALIDES pour la grammaire (`[a-z]+(_[a-z]+)*`) — assez pour
# éprouver une grille qui défile (40 styles + 2 du monde de base).
EXTRA_STYLE_WORDS = (
    'acid', 'ambient', 'bass', 'breakbeat', 'chicago', 'detroit', 'disco', 'dub',
    'electro', 'eurodance', 'freestyle', 'funk', 'gabber', 'garage', 'goa',
    'hardcore', 'housemusic', 'industrial', 'italo', 'jungle', 'latin', 'makina',
    'minimal', 'newbeat', 'oldschool', 'progressive', 'rave', 'schranz', 'soul',
    'swing', 'tribal', 'trance', 'trip_hop', 'ukgarage', 'vocal', 'warehouse',
    'acid_jazz', 'big_beat', 'drum_and_bass', 'ghetto_tech',
)


def bootstrap():
    tmp = '/tmp/epic041_proof_world'
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

    # Taxonomie chargée (facultatif) : des styles réels, aux noms longs, pour
    # éprouver la grille défilante de la palette. NB : la grammaire des dossiers
    # (`styles.parseFolderName`) n'accepte QUE des lettres — un style nommé
    # `…_00_1995` est ignoré silencieusement (piège rencontré : la mesure
    # annonçait « 2 styles » avec 40 dossiers créés).
    extra = int(os.environ.get('PROOF_EXTRA_STYLES', '0'))
    for i in range(extra):
        # Noms UNIQUES au-delà de la liste de base (deux mots accolés, toujours
        # des lettres) — sinon `PROOF_EXTRA_STYLES=80` ne crée que 40 styles
        # distincts et la grille défilante n'est jamais sollicitée.
        base = EXTRA_STYLE_WORDS[i % len(EXTRA_STYLE_WORDS)]
        word = base if i < len(EXTRA_STYLE_WORDS) else f'{base}_{EXTRA_STYLE_WORDS[(i // len(EXTRA_STYLE_WORDS)) % len(EXTRA_STYLE_WORDS)]}'
        d = os.path.join(tmp, 'src', f'hard_techno_{word}_1995')
        os.makedirs(d, exist_ok=True)
        make_mp3(os.path.join(d, f'Artist {i} - Long Track Title {i}.mp3'))

    port, cdp = free_port(), free_port()
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
    out = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '/tmp/epic041_proof')
    os.makedirs(out, exist_ok=True)
    extra = int(os.environ.get('PROOF_EXTRA_STYLES', '0'))
    tmp, port, cdp, server, chrome = bootstrap()
    checks = []

    def check(label, ok, detail):
        checks.append((label, bool(ok), detail))
        print(f'  {"✅" if ok else "❌"} {label} : {detail}')

    try:
        import websocket

        page_url = f'http://127.0.0.1:{port}/'
        for _ in range(80):
            try:
                urllib.request.urlopen(page_url, timeout=1)
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError('serveur Flask non démarré')

        json.load(urllib.request.urlopen(f'{page_url}scan', timeout=60))
        targets = None
        for _ in range(80):
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
            with open(os.path.join(out, f'{name}.png'), 'wb') as f:
                f.write(base64.b64decode(data))
            print(f'  📸 {os.path.join(out, name)}.png')

        def click_real(x, y):
            send('Input.dispatchMouseEvent', type='mouseMoved', x=x, y=y)
            send('Input.dispatchMouseEvent', type='mousePressed', x=x, y=y,
                 button='left', clickCount=1)
            send('Input.dispatchMouseEvent', type='mouseReleased', x=x, y=y,
                 button='left', clickCount=1)

        def key_real(key, code, vk, text=None):
            send('Input.dispatchKeyEvent', type='keyDown', key=key, code=code,
                 text=text or '', unmodifiedText=text or '',
                 windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)
            send('Input.dispatchKeyEvent', type='keyUp', key=key, code=code,
                 windowsVirtualKeyCode=vk, nativeVirtualKeyCode=vk)

        def click_at(expr, label):
            """Clic RÉEL sur l'élément désigné par l'expression JS `expr`.
            Erreur si absent, hors écran (après une remise en vue — précondition,
            pas substitution), ou RECOUVERT par autre chose (le clic partirait
            sur l'élément du dessus) : deux pièges déjà rencontrés (dossier
            déplié dont le rect englobe ses enfants, slot de filtre collé)."""
            info = json.loads(js(RECT_JS.replace('__EXPR__', expr)))
            if info.get('missing'):
                raise RuntimeError(f'cible absente : {label}')
            if not info['inView']:
                js(f"({expr})?.scrollIntoView({{block: 'center'}})")
                time.sleep(0.35)
                info = json.loads(js(RECT_JS.replace('__EXPR__', expr)))
            if info['covers'] or not info['inView']:
                raise RuntimeError(
                    f'clic {label} impossible : cible à y={info["y"]} (dans la fenêtre : '
                    f'{info["inView"]}), recouverte par {info["hit"]!r}')
            click_real(info['x'], info['y'])
            return info

        def click_selector(sel):
            """Clic réel sur le premier élément qui matche `sel`."""
            return click_at(f'document.querySelector({json.dumps(sel)})', sel)

        send('Page.enable')
        send('Page.navigate', url=page_url)
        wait("document.readyState === 'complete'")
        wait("!!document.querySelector('#epars-container .file-row')")
        js("(() => {const s=document.createElement('style');s.id='freeze-anim';"
           "s.textContent='*,*::before,*::after{animation:none !important;"
           "transition:none !important;caret-color:transparent !important}';"
           "document.head.appendChild(s);})()")
        time.sleep(0.4)

        # Ligne cible : un épars du monde, choisi par son fullpath (le monde est
        # reconstruit à chaque run → on lit le chemin réel depuis le DOM).
        target = js("""(() => {
          const row = document.querySelector('#epars-container .file-row');
          return row ? JSON.stringify({path: row.dataset.focuspath, name: row.textContent.trim()}) : null;
        })()""")
        if not target:
            raise RuntimeError('aucune ligne épars')
        target = json.loads(target)
        path = target['path']
        if not os.path.isfile(path):
            raise RuntimeError(f'chemin DOM introuvable sur disque : {path}')
        print(f'  cible : {path}')
        before = tag_of(path)
        check('contrôle · état initial du fichier', before['genre'] is None and before['year'] is None,
              f'TCON={before["genre"]!r} TDRC={before["year"]!r} — rien à lire avant le clic')

        print('\n── 1 · la touche g ouvre la palette ───────────────────────')
        row_box = click_selector('#epars-container .file-row')
        time.sleep(0.3)
        focused = js("document.querySelector('#epars-container .focused')?.dataset?.focuspath ?? null")
        key_real('g', 'KeyG', 71, text='g')
        time.sleep(0.5)
        vis = json.loads(js(VISIBILITY))
        shot('1-palette')
        check('g ouvre la palette', vis.get('open') and focused == path,
              f'ligne focusée {focused!r} · palette ouverte {vis.get("open")} · '
              f'ancrée sous la ligne (y={row_box["y"]})')

        print('\n── 2 · la modale montre TOUT (styles + années) ────────────')
        check('tous les styles et toutes les années sont visibles',
              vis.get('styles', 0) >= 2 + extra and vis.get('years') == 57
              and vis.get('clippedCount') == 0
              and vis.get('span') == ['1970', '2026'],
              f"{vis.get('styles')} styles (dont {extra} ajoutés) · {vis.get('years')} années "
              f"({vis.get('span')}) · ANNÉES coupées : {vis.get('clippedCount')} "
              f"{vis.get('clipped') or ''} · boîte {vis.get('paletteBox')} / écran {vis.get('windowH')}")

        print('\n── 3 · cliquer un style écrit le TCON tout de suite ───────')
        style_id = js("document.querySelector('.sp-style')?.dataset?.style ?? null")
        if not style_id:
            raise RuntimeError('aucun bouton de style')
        click_selector(f'.sp-style[data-style="{style_id}"]')
        time.sleep(0.6)
        after_style = tag_of(path)
        status = js("document.getElementById('status-bar')?.textContent?.trim() ?? ''")
        still_open = json.loads(js(VISIBILITY)).get('open')
        shot('2-style')
        check(f'style « {style_id} » écrit dans le TCON',
              after_style['genre'] == style_id,
              f'TCON sur disque : {before["genre"]!r} → {after_style["genre"]!r} '
              f'· barre d\'état « {status[:70]} » · ouverte pour l\'année {still_open}')

        print("\n── 3b · la grille des styles reste atteignable (taxonomie chargée) ──")
        reach = json.loads(js(REACH_LAST_STYLE)) if extra else {'ok': True, 'reason': 'sans objet (taxonomie normale)'}
        if extra:
            check('dernier style atteignable en défilant', reach.get('ok'),
                  f"{vis.get('styles')} styles · grille défilante {vis.get('styleGrid', {}).get('scrollable')} "
                  f"({vis.get('styleGrid', {}).get('scrollH')}px / {vis.get('styleGrid', {}).get('clientH')}px) "
                  f"· dernier style {reach.get('last')!r} dans la palette {reach.get('box')} / {reach.get('palette')}")
            js("document.querySelector('.sp-styles').scrollTop = 0")

        print("\n── 4 · cliquer une année écrit le TDRC tout de suite ──────")
        click_selector('.sp-year[data-year="1991"]')
        time.sleep(0.7)
        after_year = tag_of(path)
        ui = js("""(() => {
          const row = [...document.querySelectorAll('#epars-container .file-row')]
            .find(r => r.dataset.focuspath === %s);
          return JSON.stringify({
            cell: row?.querySelector('td.year')?.textContent?.trim() ?? null,
            paletteOpen: !!document.querySelector('.style-palette'),
            status: document.getElementById('status-bar')?.textContent?.trim() ?? '',
          });
        })()""" % json.dumps(path))
        ui = json.loads(ui)
        shot('3-annee')
        check('année 1991 écrite dans le TDRC + UI à jour',
              after_year['year'] == '1991' and after_year['genre'] == style_id
              and ui['cell'] == '1991',
              f'TDRC sur disque : {before["year"]!r} → {after_year["year"]!r} '
              f'· TCON conservé {after_year["genre"]!r} · cellule Année « {ui["cell"]} » '
              f'· palette refermée {not ui["paletteOpen"]} · « {ui["status"][:60]} »')

        print('\n── 5 · g sur un MORCEAU déjà rangé (colonne Source Data) ──')
        # Déplier un dossier source puis viser explicitement une ligne FICHIER
        # (le toggle focus son 1er enfant : on ne devine pas, on lit le DOM).
        click_selector('#source-container .directory')
        time.sleep(0.5)
        sbox = click_selector('#source-container .file-row')
        time.sleep(0.3)
        spath = js("document.querySelector('#source-container .file-row.focused')?.dataset?.focuspath ?? null")
        if not spath or not os.path.isfile(spath):
            raise RuntimeError(f'fichier source introuvable : {spath!r}')
        before_src = tag_of(spath)
        key_real('g', 'KeyG', 71, text='g')
        time.sleep(0.5)
        vis_src = json.loads(js(VISIBILITY))
        src_title = js("document.querySelector('.sp-title')?.textContent?.trim() ?? ''")
        recap_before = js("document.getElementById('epars-status-line')?.textContent ?? ''")
        shot('4-source-data')
        check('g ouvre la palette sur le morceau de droite',
              vis_src.get('open') and 'Source Data' in src_title and spath in (js("document.querySelector('.sp-title')?.title ?? ''") or ''),
              f'morceau {os.path.basename(spath)!r} · titre « {src_title[:60]} » · '
              f'clic sur la ligne y={sbox["y"]}')

        print('\n── 6 · style + année écrits sur ce morceau, sans choix de rangement ──')
        if not vis_src.get('open'):
            # Pas de palette → rien à cliquer : on marque l'échec et on continue
            # (§7/§8 restent instructifs et le rapport reste lisible).
            check('tags du morceau rangé écrits, AUCUN choix de session', False,
                  'palette absente (§5 en échec) — aucun style/année à cliquer')
        else:
            sid_src = js("document.querySelector('.sp-style')?.dataset?.style ?? null")
            click_selector(f'.sp-style[data-style="{sid_src}"]')
            time.sleep(0.6)
            after_s_style = tag_of(spath)
            click_selector('.sp-year[data-year="1991"]')
            time.sleep(0.7)
            after_src = tag_of(spath)
            recap_after = js("document.getElementById('epars-status-line')?.textContent ?? ''")
            # Le récap épars (« 🏷 N assignés · e = aperçu ») doit être IDENTIQUE :
            # un morceau déjà rangé ne doit pas grossir la file de rangement.
            check('tags du morceau rangé écrits, AUCUN choix de session',
                  after_src['genre'] == sid_src and after_src['year'] == '1991'
                  and (recap_after or '') == (recap_before or ''),
                  f'TCON {before_src["genre"]!r} → {after_s_style["genre"]!r} · '
                  f'TDRC {before_src["year"]!r} → {after_src["year"]!r} · '
                  f'récap épars « {(recap_before or "").strip()[:28] or "(vide)" } » inchangé')

        def click_dir0():
            """Clic RÉEL sur le 1er dossier racine de la colonne droite (par index :
            pas d'échappement de sélecteur sur un data-dirpath plein de
            caractères). Ligne de nom visée, remise en vue incluse."""
            box = click_at(DIR0_EXPR, 'dossier racine 0 de la colonne droite')
            time.sleep(0.5)
            return box

        def focus_dir0(clear_epars=True):
            """Surligne le dossier racine 0 : le REPLI laisse le focus sur le
            dossier (l'ouverture le vole au 1er enfant, en rAF).
            `clear_epars=False` : garde la ligne épars surlignée (scénario §8)."""
            if clear_epars:
                js("document.querySelectorAll('#epars-container .focused').forEach(e => e.classList.remove('focused'))")
            if not js("document.querySelectorAll('#source-container .directory')[0]?.classList.contains('expanded')"):
                click_dir0()
            return click_dir0()

        print('\n── 7 · g avec seulement un DOSSIER surligné : message, pas de palette ──')
        dbox = focus_dir0()
        dfocus = js("(() => {const f=document.querySelector('#source-container .focused');"
                    "return f ? (f.classList.contains('directory') ? 'dir' : 'file') + ':' + (f.dataset.dirpath || f.dataset.focuspath) : null;})()")
        key_real('g', 'KeyG', 71, text='g')
        time.sleep(0.4)
        dir_msg = js("document.getElementById('status-bar')?.textContent?.trim() ?? ''")
        check('dossier surligné → message explicite, aucune palette',
              not js("!!document.querySelector('.style-palette')") and 'morceau' in (dir_msg or ''),
              f'focus droite {dfocus} · statut « {(dir_msg or "")[:70]} » · clic y={dbox["y"]}')

        print('\n── 8 · régression : dossier focusé à droite + ligne épars, g → la ligne épars ──')
        click_selector('#epars-container .file-row')
        time.sleep(0.3)
        epars_row = js("document.querySelector('#epars-container .focused')?.dataset?.focuspath ?? null")
        focus_dir0(clear_epars=False)  # droite = DOSSIER (activePanel=source), gauche = la ligne épars
        key_real('g', 'KeyG', 71, text='g')
        time.sleep(0.5)
        vis_r = json.loads(js(VISIBILITY))
        title_path = js("document.querySelector('.sp-title')?.title ?? null")
        check('palette ouverte sur la ligne épars malgré le panneau droit actif',
              vis_r.get('open') and title_path == epars_row,
              f'ligne épars {os.path.basename(epars_row or "")!r} · palette ouverte {vis_r.get("open")} '
              f'· titre ancré sur {os.path.basename(title_path or "(aucun)")!r} '
              f'· panneau droit actif {js("document.getElementById(\'panel-right\')?.classList.contains(\'panel-active\')")}')
        js("document.querySelector('.style-palette')?.remove()")

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
