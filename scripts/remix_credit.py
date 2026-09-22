#!/usr/bin/env python3
"""Crédit de remix d'un titre (EPIC-048) — module PUR, sans réseau.

Le cas fondateur : `age of love - the age of love (cosmic gate mix)(tasnoise).mp3`
n'a pas d'année dans son tag et le moteur concluait **1990** — l'année de
l'ORIGINAL — pour un remix de 2000. Cause structurelle : `artist_title()`
supprime les segments parenthésés et `NOISE` efface `mix`/`remix`/`edit`/… avant
la recherche, donc la version de remix devient INVISIBLE au lieu d'être
VÉRIFIÉE.

Ce module rend le crédit visible. Il ne DÉCIDE rien : c'est le moteur qui exige
ensuite que la source matchée nomme le remixeur (« un remix se prouve,
l'original se suppose »).

Règles :
  · on parcourt les segments parenthésés/crochetés, puis la forme collée en fin
    de titre (`… Marco V Remix`) ;
  · un segment dont tous les mots sont des mots de VERSION (`extended`,
    `original`, `radio`, `club`, `edit`, `version`, `instrumental`, `vocal`,
    `dub`, `remaster`, `single`, `promo`…) ou des chiffres ne nomme PERSONNE :
    un « Extended Mix » n'est pas un remix d'artiste ;
  · le PREMIER segment qui nomme quelqu'un est le crédit — `(cosmic gate mix)`
    avant `(tasnoise)`, qui est un tag de rip et ne nomme personne ;
  · les mots vides (`mix`, `the`, `for`, `feat`, `vs`…) sont retirés des TOKENS
    du crédit, mais ils ne suffisent pas à en faire un.
"""

from __future__ import annotations

import re
import unicodedata

# Mots qui décrivent une VERSION, jamais un remixeur (liste explicite : sans
# elle, la moitié du corpus passerait pour un remix et rien ne serait écrit).
VERSION_WORDS = frozenset("""
    mix remix remixes rmx edit edits version versions extended ext original
    radio club instrumental vocal vocals dub dubs remaster remastered mastered
    album single double triple vinyl cd lp ep pt part disc disk side vol volume
    promo promotional repress reissue digital deluxe bonus vinylrip rip
    bootleg vip rework refix mashup flip reprise cover live acoustic
    special edition collector limited white label sampler compilation
    feat featuring ft with and the a an of for to in on at de la les des du
    vs versus pres out up down into over back again all one two three
    first second last new old
""".split())

# Mots de version COLLÉS en fin de titre (« … Marco V Remix »), hors parenthèses.
_TAIL_RX = re.compile(
    r'(?P<credit>[^\-–—()\[\]]{2,60}?)\s+'
    r'(?:remix|rmx|rework|refix|edit|bootleg|vip|mashup|flip)\s*$',
    re.I)
_GROUP_RX = re.compile(r'\(([^)]*)\)|\[([^\]]*)\]')
_EXT = re.compile(r'\.(mp3|flac|wav|m4a|mp4|aiff?|ogg|wma)$', re.I)
_TRACK_NO = re.compile(r'^\s*(?:\(\d{1,3}\)\s*)?\d{1,3}[\s._-]+')
# Artiste entre crochets en tête (`[The Age Of Love] - The Age Of Love (Jam &
# Spoon Radio Mix)`) : c'est la forme que `artist_title()` reconnaît déjà, un
# segment d'ARTISTE — jamais un crédit de remix.
_HEAD_BRACKET = re.compile(r'^\s*\[[^\]]*\]')
_POSSESSIVE = re.compile(r"['\u2019]s$")
_SEPARATORS = re.compile(r"[\s._\-–—&+,/'\u2019\"]+")


def _fold(text: str) -> str:
    """Minuscules sans accents (même normalisation que le moteur)."""
    return ''.join(c for c in unicodedata.normalize('NFD', (text or '').lower())
                   if unicodedata.category(c) != 'Mn')


def _tokens(segment: str) -> list:
    """Tokens significatifs d'un segment : mots vides, chiffres et lettres
    isolées retirés (`marco v remix` → ['marco'])."""
    out = []
    for raw in _SEPARATORS.split(_fold(segment)):
        tok = _POSSESSIVE.sub('', raw.strip("'\"’`"))
        if not tok or tok.isdigit() or len(tok) < 2:
            continue
        if tok in VERSION_WORDS:
            continue
        out.append(tok)
    return out


def remix_credit(name: str) -> dict:
    """`{kind, tokens, label}` — kind = 'remix' si un remixeur est nommé.

    `tokens` = ses mots significatifs (ce que la source matchée devra contenir) ;
    `label` = le segment tel qu'écrit, pour l'afficher en revue. Le crédit vient
    du PREMIER segment qui nomme quelqu'un : `(cosmic gate mix)(tasnoise)` →
    `{'kind': 'remix', 'tokens': ['cosmic', 'gate'], 'label': 'cosmic gate mix'}`.
    """
    base = _EXT.sub('', _TRACK_NO.sub('', str(name or '')))
    base = _HEAD_BRACKET.sub('', base)     # artiste entre crochets, pas un crédit
    original = {'kind': 'original', 'tokens': [], 'label': ''}

    # 1. segments parenthésés / crochetés, dans l'ordre d'écriture
    for m in _GROUP_RX.finditer(base):
        segment = m.group(1) if m.group(1) is not None else m.group(2)
        tokens = _tokens(segment)
        if tokens:
            return {'kind': 'remix', 'tokens': tokens, 'label': segment.strip()}

    # 2. forme collée en fin de titre, hors parenthèses : `… Marco V Remix`.
    #    Le crédit ne doit pas être un simple rappel du TITRE (`Age Of Love -
    #    Age Of Love Remix` : « Age Of Love » n'est personne) — ses tokens
    #    doivent apporter au moins un mot absent du reste du nom.
    tail = _TAIL_RX.search(base)
    if tail:
        full = tail.group(0)
        segment = tail.group('credit').split(' - ')[-1].strip()
        tokens = _tokens(segment)
        work = set(_tokens(base.replace(full, ' ')))
        if tokens and any(tok not in work for tok in tokens):
            return {'kind': 'remix', 'tokens': tokens, 'label': segment}

    return original


def is_remix(name: str) -> bool:
    return remix_credit(name)['kind'] == 'remix'


def names_remixer(tokens, text) -> bool:
    """Vrai si `text` (titre d'un enregistrement matché) contient TOUS les tokens
    du remixeur — la garde d'EPIC-048 : une source ne compte que si elle nomme
    celui dont elle prétend dater la version."""
    if not tokens:
        return True
    folded = _fold(text)
    return all(tok in folded for tok in tokens)


if __name__ == '__main__':
    import sys

    for arg in sys.argv[1:] or ['age of love - the age of love (cosmic gate mix)(tasnoise).mp3']:
        print(f'{arg}\n  → {remix_credit(arg)}')
