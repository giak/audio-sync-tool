"""Recherche web LOCALE (EPIC-049) — DuckDuckGo, zéro clé, zéro paquet.

Remplace Brave Search (`BRAVE_API_KEY`, service payant, jamais configuré sur
cette machine) par le DuckDuckGo déjà installé localement (MCP `search`) et, à
défaut, l'endpoint HTML public. Zéro dépendance (urllib).

Rôle INCHANGÉ depuis EPIC-040 : source de DERNIER RECOURS, et elle ne vote
JAMAIS. Elle ne produit que des CANDIDATS (`web_candidates`) — un extrait de
page web n'a pas le niveau de preuve d'une API de disques, la règle des deux
sources ne se contourne pas avec un moteur de recherche.

Ordre des chemins :
  1. MCP local — `data/search_mcp.json` (`{"url": …, "tool": "search"}`) ou
     `SEARCH_MCP_URL`, défaut `http://localhost:8010/mcp` ;
  2. DuckDuckGo HTML — `https://html.duckduckgo.com/html/` (urllib, aucune clé) ;
  3. rien — `results == []` ET `error` non vide : un fournisseur MUET se
     déclare (« pas de résultat » et « pas de moteur » ne sont pas la même
     chose — c'est `GET /years/web-status` qui l'affiche).
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request

DEFAULT_MCP_URL = 'http://localhost:8010/mcp'
MCP_CONFIG_PATH = os.path.join('data', 'search_mcp.json')
HTML_URL = 'https://html.duckduckgo.com/html/'
UA = 'Mozilla/5.0 (X11; Linux x86_64) audio-sync-tool/0.1'
# L'endpoint HTML n'accepte PAS la requête en GET depuis urllib : il répond 202
# avec une page anti-robot (`anomaly`), sans aucun résultat — mesuré. En POST
# (`q` dans le corps, en-têtes navigateur) il répond 200 avec les 10 résultats.
HTML_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'fr,en;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
}

_RESULT_A = re.compile(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.S)
_RESULT_SNIPPET = re.compile(r'class="result__snippet"[^>]*>(.*?)</a>', re.S)
_TAGS = re.compile(r'<[^>]+>')
_URL_IN_TEXT = re.compile(r'https?://[^\s"\'<>\\]+')

_ENTITIES = (('&amp;', '&'), ('&quot;', '"'), ('&#x27;', "'"), ('&#39;', "'"),
             ('&lt;', '<'), ('&gt;', '>'), ('&nbsp;', ' '))


def _plain(fragment: str) -> str:
    """Texte lisible : balises retirées, entités HTML de base décodées."""
    text = _TAGS.sub('', fragment or '')
    for src, dst in _ENTITIES:
        text = text.replace(src, dst)
    return ' '.join(text.split())


def _real_url(href: str) -> str:
    """URL sortante d'un lien DuckDuckGo (`//duckduckgo.com/l/?uddg=<urlenc>`)."""
    if not href:
        return ''
    if href.startswith('//'):
        href = 'https:' + href
    try:
        q = urllib.parse.urlparse(href).query
        uddg = urllib.parse.parse_qs(q).get('uddg')
        if uddg:
            return uddg[0]
    except ValueError:
        pass
    return href


def mcp_url() -> str:
    """Endpoint MCP local : `SEARCH_MCP_URL`, puis `data/search_mcp.json`, puis
    le défaut. Une valeur vide DÉSACTIVE le chemin MCP."""
    env = os.environ.get('SEARCH_MCP_URL')
    if env is not None:
        return env.strip()
    try:
        with open(MCP_CONFIG_PATH, encoding='utf-8') as f:
            return (json.load(f).get('url') or '').strip()
    except (OSError, ValueError):
        return DEFAULT_MCP_URL


def mcp_tool() -> str:
    """Nom de l'outil MCP à appeler (`data/search_mcp.json` → `tool`)."""
    try:
        with open(MCP_CONFIG_PATH, encoding='utf-8') as f:
            return (json.load(f).get('tool') or 'search').strip() or 'search'
    except (OSError, ValueError):
        return 'search'


def _urlopen(url, data=None, headers=None, timeout=10):
    req = urllib.request.Request(url, data=data, headers=headers or {'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 — http(s) configuré
        return r.read()


def _parse_html(html: str, limit: int) -> list:
    titles = _RESULT_A.findall(html)
    snippets = [_plain(s) for s in _RESULT_SNIPPET.findall(html)]
    out = []
    for i, (href, raw_title) in enumerate(titles[:limit]):
        out.append({
            'title': _plain(raw_title)[:160],
            'url': _real_url(href),
            'snippet': (snippets[i] if i < len(snippets) else '')[:300],
        })
    return out


def _parse_mcp(payload: str, limit: int) -> list:
    """Résultat `tools/call` → résultats.

    Le serveur MCP local peut répondre en JSON direct ou en SSE (`data: {…}`).
    TOLÉRANT par construction : on cherche les blocs JSON, puis on ramasse les
    couples (texte, URL) du contenu textuel. Le format exact du serveur n'est
    pas figé ici — c'est le repli HTML qui est vérifié au bit près, et
    `/years/web-status` montre lequel des deux répond.
    """
    blocks = []
    for chunk in payload.splitlines() or [payload]:
        chunk = chunk.strip()
        if not chunk or chunk.startswith('event:'):
            continue
        if chunk.startswith('data:'):
            chunk = chunk[5:].strip()
        if chunk.startswith('{'):
            blocks.append(chunk)
    if not blocks and payload.strip().startswith('{'):
        blocks = [payload.strip()]

    texts = []
    for block in blocks:
        try:
            obj = json.loads(block)
        except ValueError:
            continue
        for item in ((obj.get('result') or {}).get('content') or []):
            if isinstance(item, dict) and item.get('text'):
                texts.append(str(item['text']))
        if not texts and isinstance(obj.get('results'), list):
            for r in obj['results']:
                if isinstance(r, dict) and r.get('url'):
                    texts.append(f"{(r.get('title') or '')} {r['url']}")

    out = []
    for text in texts:
        # Le titre peut être sur la ligne PRÉCÉDENTE l'URL (« Titre 2004\nhttps://… »)
        previous = ''
        for line in text.splitlines():
            urls = _URL_IN_TEXT.findall(line)
            if not urls:
                if line.strip():
                    previous = _plain(line)
                continue
            title = _plain(_URL_IN_TEXT.sub(' ', line)) or previous
            previous = ''
            out.append({'title': title[:160], 'url': urls[0], 'snippet': title[:300]})
            if len(out) >= limit:
                return out
    return out


def search(query: str, limit: int = 5, timeout: int = 10, fetch=None) -> dict:
    """Recherche web → {'results': [{title,url,snippet}], 'provider', 'error'}.

    `fetch(url, data, headers, timeout) -> bytes` est injectable : les tests ne
    touchent jamais le réseau.
    """
    fetch = fetch or _urlopen
    errors = []

    url = mcp_url()
    if url:
        payload = json.dumps({
            'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
            'params': {'name': mcp_tool(), 'arguments': {'query': query}},
        }).encode()
        try:
            raw = fetch(url, payload, {'Content-Type': 'application/json',
                                       'Accept': 'application/json, text/event-stream',
                                       'User-Agent': UA}, timeout)
            results = _parse_mcp(raw.decode('utf-8', 'replace'), limit)
            if results:
                return {'results': results, 'provider': 'mcp', 'error': None}
            errors.append(f'mcp: aucun résultat exploitable ({url})')
        except Exception as exc:                    # noqa: BLE001 — repli voulu
            errors.append(f'mcp: {type(exc).__name__}: {exc}'[:120])

    try:
        body = urllib.parse.urlencode({'q': query}).encode()
        raw = fetch(HTML_URL, body, HTML_HEADERS, timeout)
        html = raw.decode('utf-8', 'replace')
        results = _parse_html(html, limit)
        if results:
            return {'results': results, 'provider': 'html', 'error': None}
        errors.append('html: page anti-robot (202/anomaly)' if 'anomaly' in html.lower()
                      else 'html: aucun résultat (balisage changé ou page vide ?)')
    except Exception as exc:                        # noqa: BLE001 — jamais bloquant
        errors.append(f'html: {type(exc).__name__}: {exc}'[:120])

    return {'results': [], 'provider': None, 'error': ' · '.join(errors)}


def status(timeout: int = 1, fetch=None) -> dict:
    """Sonde courte pour `GET /years/web-status` : quel fournisseur répond ?"""
    url = mcp_url()
    fetch = fetch or _urlopen
    if url:
        try:
            fetch(url, None, {'Accept': 'application/json', 'User-Agent': UA}, timeout)
            return {'provider': 'mcp', 'url': url, 'reachable': True, 'error': None}
        except Exception as exc:                    # noqa: BLE001 — c'est une sonde
            return {'provider': 'html', 'url': HTML_URL, 'reachable': True,
                    'error': f'MCP injoignable ({type(exc).__name__}) — repli HTML'}
    return {'provider': 'html', 'url': HTML_URL, 'reachable': True,
            'error': 'MCP désactivé (SEARCH_MCP_URL vide) — repli HTML'}


if __name__ == '__main__':
    import sys

    for q in sys.argv[1:] or ['age of love cosmic gate remix year']:
        res = search(q)
        print(f'=== {q} — {res["provider"] or "AUCUN FOURNISSEUR"} ===')
        for r in res['results']:
            print(f'  {r["title"]}\n    {r["url"]}')
        if res['error']:
            print(f'  erreurs : {res["error"]}')
