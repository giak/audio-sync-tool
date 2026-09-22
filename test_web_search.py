#!/usr/bin/env python3
"""Tests de scripts/web_search.py (EPIC-049) — sans réseau (transport injecté).

Le fournisseur remplace Brave Search (payant, jamais configuré) par le
DuckDuckGo LOCAL : MCP `search` s'il écoute, sinon l'endpoint HTML. Les deux
chemins sont testés avec une `fetch` injectée ; l'extrait HTML est un EXTRAIT
RÉEL de la réponse de `html.duckduckgo.com` (POST, mesuré le 2026-09-22) — c'est
le repli vérifié au bit près, le format MCP n'étant pas figé ici.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts'))
import web_search as ws  # noqa: E402

# Extrait réel (balisage observé) : deux résultats, dont un lien de redirection
# DuckDuckGo (`//duckduckgo.com/l/?uddg=…`) qu'il faut décoder.
HTML = '''
<div class="result results_links results_links_deep web-result">
 <h2 class="result__title">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.discogs.com%2Frelease%2F284991-Age-Of-Love&amp;rut=abc">Age Of Love - The Age Of Love (2004, CD) - Discogs</a>
 </h2>
 <div class="result__extras"><span class="result__icon"><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.discogs.com%2Frelease%2F284991-Age-Of-Love&amp;rut=abc">x</a></span></div>
 <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.discogs.com%2F">Age Of Love - The Age Of Love (CD, Album) 2004 &amp; more</a>
</div>
<div class="result results_links results_links_deep web-result">
 <h2 class="result__title">
  <a rel="nofollow" class="result__a" href="https://www.1001tracklists.com/track/2ssfzpb5/x.html">Age Of Love - The Age Of Love (Cosmic Gate Remix)</a>
 </h2>
 <a class="result__snippet" href="#"><span class="result__snippet">Remix released <b>2004</b></span></a>
</div>
'''


def test_parse_html_decode_les_liens_et_les_snippets():
    out = ws._parse_html(HTML, 5)
    assert [r['title'] for r in out] == [
        'Age Of Love - The Age Of Love (2004, CD) - Discogs',
        'Age Of Love - The Age Of Love (Cosmic Gate Remix)',
    ]
    # URL de redirection décodée (uddg), et URL directe conservée
    assert out[0]['url'] == 'https://www.discogs.com/release/284991-Age-Of-Love'
    assert out[1]['url'] == 'https://www.1001tracklists.com/track/2ssfzpb5/x.html'
    # entité HTML décodée, balises retirées, année lisible
    assert '2004' in out[0]['snippet'] and '&amp;' not in out[0]['snippet']
    assert out[1]['snippet'] == 'Remix released 2004'


def test_repli_html_quand_le_mcp_est_injoignable(monkeypatch):
    """MCP injoignable → HTML (POST), et le provider RÉPOND 'html'."""
    calls = []

    def fetch(url, data=None, headers=None, timeout=10):
        calls.append((url, data))
        if 'localhost' in url:
            raise OSError('Connection refused')
        return HTML.encode()

    res = ws.search('age of love', fetch=fetch)
    assert res['provider'] == 'html'
    assert len(res['results']) == 2
    # La requête HTML part en POST (le GET d'urllib reçoit la page anti-robot 202)
    assert calls[-1][1] is not None and b'q=age+of+love' in calls[-1][1]


def test_mcp_local_repond_en_premier(monkeypatch):
    """MCP joignable → ses résultats sont utilisés, sans repli HTML."""
    body = json.dumps({'result': {'content': [
        {'type': 'text', 'text': 'Age Of Love (Cosmic Gate Mix) 2004\nhttps://www.beatport.com/track/x'}]}})

    def fetch(url, data=None, headers=None, timeout=10):
        if 'localhost' in url:
            assert b'tools/call' in data
            return body.encode()
        raise AssertionError('le repli HTML ne doit pas être utilisé')

    res = ws.search('age of love', fetch=fetch)
    assert res['provider'] == 'mcp'
    assert res['results'][0]['url'] == 'https://www.beatport.com/track/x'
    assert '2004' in res['results'][0]['title']


def test_aucun_fournisseur_rend_la_raison(monkeypatch):
    """Les deux chemins KO → [] + error non vide (jamais un silence)."""

    def fetch(url, data=None, headers=None, timeout=10):
        raise OSError('boum')

    res = ws.search('x', fetch=fetch)
    assert res == {'results': [], 'provider': None,
                   'error': res['error']}
    assert 'mcp' in res['error'] and 'html' in res['error']


def test_mcp_desactive_explicitement(monkeypatch):
    monkeypatch.setenv('SEARCH_MCP_URL', '')
    assert ws.mcp_url() == ''


def test_status_sonde_le_mcp_puis_annonce_le_repli(monkeypatch):
    monkeypatch.setenv('SEARCH_MCP_URL', 'http://localhost:8010/mcp')

    def ok(url, data=None, headers=None, timeout=1):
        return b'{}'

    assert ws.status(fetch=ok)['provider'] == 'mcp'

    def ko(url, data=None, headers=None, timeout=1):
        raise OSError('refused')

    st = ws.status(fetch=ko)
    assert st['provider'] == 'html' and st['reachable'] is True
    assert 'repli HTML' in st['error']
