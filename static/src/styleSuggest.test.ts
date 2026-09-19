// ─── Unit tests: styleSuggest.ts ─────────────────────────────────────────
import { describe, expect, it } from 'vitest';
import { GENRE_ALIASES, pathSegments, SEGMENT_ALIASES, suggestStyle } from './styleSuggest.js';
import type { Taxonomy } from './styles.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

const ROOT = '/src/style/';

function tax(...styles: string[]): Taxonomy {
  const map = new Map<string, { id: string; root: string; timeless: boolean; folders: Set<string>; count: number }>();
  for (const id of styles) {
    map.set(id, { id, root: id.split('_')[0], timeless: false, folders: new Set([`${id}_1990`]), count: 10 });
  }
  return { root: ROOT, styles: map };
}

const SI: Record<string, string[]> = {
  'daft punk': ['techno', 'techno_acid'],
  'richie hawtin': ['techno', 'techno_hard'],
};

// ── pathSegments ──────────────────────────────────────────────────────────

describe('pathSegments', () => {
  it('extrait les segments du plus profond au plus superficiel', () => {
    expect(pathSegments('_schranz/track.mp3')).toEqual(['schranz']);
  });
  it('plusieurs niveaux', () => {
    expect(pathSegments('_techno/acid techno/track.mp3')).toEqual(['acid techno', 'techno']);
  });
  it('fichier à la racine (pas de segment dossier)', () => {
    expect(pathSegments('track.mp3')).toEqual([]);
  });
  it('segment avec _ leading est normalisé', () => {
    expect(pathSegments('_hardcore/track.mp3')).toEqual(['hardcore']);
  });
});

// ── suggestStyle ──────────────────────────────────────────────────────────

describe('suggestStyle', () => {
  const taxo = tax(
    'techno',
    'techno_acid',
    'techno_hard',
    'hardcore',
    'trance',
    'drumbass',
    'ambient',
    'italo_disco',
    'electro_clash',
    'house',
    'new_beat',
  );

  it('segment de chemin aliasé → suggestion forte', () => {
    const r = suggestStyle('_schranz/track.mp3', null, null, SI, [], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('techno_hard');
    expect(r!.confidence).toBeGreaterThan(0.3);
  });

  it('segment non aliasé → pas de suggestion seule (score < seuil)', () => {
    // "diverse" n'est pas dans SEGMENT_ALIASES
    const r = suggestStyle('diverse/track.mp3', null, null, SI, [], taxo);
    expect(r).toBeNull();
  });

  it('artiste connu dans sourceIndex (unambiguous) → suggestion', () => {
    const si: Record<string, string[]> = { 'r x': ['techno'] };
    const r = suggestStyle('track.mp3', null, 'R X', si, [], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('techno');
    expect(r!.confidence).toBeGreaterThan(0.25);
  });

  it('artiste connu avec split 50/50 → ex aequo → null', () => {
    const r = suggestStyle('track.mp3', null, 'Daft Punk', SI, [], taxo);
    expect(r).toBeNull(); // techno 50% = techno_acid 50%
  });

  it('session history → signal faible mais présent', () => {
    const r = suggestStyle('track.mp3', null, null, SI, ['techno', 'techno', 'techno', 'techno'], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('techno');
  });

  it('genre ID3 aliasé seul → en dessous du seuil (0.15/1.25 = 0.12)', () => {
    const r = suggestStyle('track.mp3', 'Acid', null, SI, [], taxo);
    expect(r).toBeNull(); // 0.15/1.25 = 0.12 < 0.30
  });

  it('genre ID3 aliasé + session → suggestion', () => {
    const r = suggestStyle('track.mp3', 'Acid', null, SI, ['techno_acid', 'techno_acid', 'techno_acid'], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('techno_acid');
  });

  it('genre non aliasé → ignoré', () => {
    const r = suggestStyle('track.mp3', 'Electronic', null, SI, [], taxo);
    // "electronic" n'est pas dans GENRE_ALIASES → pas de signal genre
    expect(r).toBeNull();
  });

  it('ex æquo (deux styles au même score) → null', () => {
    // Source index avec 50/50 entre deux styles
    const si50: Record<string, string[]> = { artist: ['techno', 'hardcore'] };
    const r = suggestStyle('track.mp3', null, 'artist', si50, [], taxo);
    // artiste donne 0.40/2 = 0.20 par style → ex æquo
    expect(r).toBeNull();
  });

  it('combine plusieurs signaux', () => {
    const r = suggestStyle('_schranz/track.mp3', 'Acid', 'Richie Hawtin', SI, ['techno_hard', 'techno_hard'], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('techno_hard');
    expect(r!.confidence).toBeGreaterThan(0.5);
  });

  it('taxonomie vide → null', () => {
    const r = suggestStyle('_schranz/track.mp3', null, null, SI, [], tax('nonexistent'));
    // non-existent n'est pas dans SEGMENT_ALIASES
    // Schranz → techno_hard, mais techno_hard n'est pas dans la taxonomie
    // genre is null → no contribution
    // So this should be null since the alias 'techno_hard' is not in the empty-ish taxonomy
    expect(r).toBeNull();
  });

  it('style aliasé pas dans la taxonomie → ignoré (pas de score)', () => {
    const smallTax = tax('techno', 'hardcore');
    // schranz → techno_hard, mais techno_hard n'est pas dans smallTax
    const r = suggestStyle('_schranz/track.mp3', null, null, SI, [], smallTax);
    expect(r).toBeNull();
  });

  it('segment "goa" → trance', () => {
    const r = suggestStyle('goa/trance trip/track.mp3', null, null, SI, [], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('trance');
  });

  it('plusieurs segments, le plus profond aliasé gagne', () => {
    // _techno/acid techno/track.mp3 → "acid techno" (profond) gagne sur "techno"
    const r = suggestStyle('_techno/acid techno/track.mp3', null, null, SI, [], taxo);
    expect(r).not.toBeNull();
    expect(r!.style).toBe('techno_acid');
  });
});

// ── Constantes ────────────────────────────────────────────────────────────

describe('GENRE_ALIASES et SEGMENT_ALIASES', () => {
  it('tous les styles pointés existent dans la taxonomie de référence', () => {
    const taxo = tax(
      'techno',
      'techno_acid',
      'techno_hard',
      'hardcore',
      'trance',
      'drumbass',
      'ambient',
      'italo_disco',
      'electro_clash',
      'house',
      'new_beat',
    );
    const allStyles = new Set(taxo.styles.keys());
    for (const s of Object.values(GENRE_ALIASES)) {
      expect(allStyles.has(s), `GENRE_ALIASES pointe vers ${s} absent`).toBe(true);
    }
    for (const s of Object.values(SEGMENT_ALIASES)) {
      expect(allStyles.has(s), `SEGMENT_ALIASES pointe vers ${s} absent`).toBe(true);
    }
  });
});
