// ─── Unit tests: musicKey.ts — clé musicale (EPIC-032) ────────────────────
// Cas réels validés par prototype sur data/cache.json (voir EPIC-032).

import { describe, expect, it } from 'vitest';
import { artistsCompatible, keyTokens, musicKey } from './musicKey.js';

describe('musicKey', () => {
  it("extrait artiste et titre d'un nom standard (numéro de piste retiré)", () => {
    expect(musicKey('02 - Joey Beltram - Energy Flash.mp3')).toEqual({
      artist: 'joey beltram',
      title: 'energy flash',
    });
  });

  it('retire album médian et parenthèses inconnues (cas réel classics/beltram vol1)', () => {
    const k = musicKey("joey beltram - classics - 01 - energy flash (from 'beltram vol1' energy flash 1990).mp3");
    expect(k).toEqual({ artist: 'joey beltram', title: 'energy flash' });
  });

  it('décolle les collages underscore/numéro (artiste indisponible, titre complet)', () => {
    expect(musicKey('0602-joey_beltram-energy_flash.flac')).toEqual({
      artist: null,
      title: 'joey beltram energy flash',
    });
    expect(musicKey('101_joey_beltram_-_energy_flash.flac')).toEqual({
      artist: null,
      title: 'joey beltram energy flash',
    });
  });

  it('les mentions de mix/version sont du bruit de titre (clé musicale)', () => {
    expect(musicKey('artist - track (Club Mix).mp3').title).toBe('track');
    expect(musicKey('artist - track (Original Mix).mp3').title).toBe('track');
    expect(musicKey('artist - track (feat. someone).mp3').title).toBe('track');
  });

  it('les accents ne séparent pas (éparpillés ↔ epars)', () => {
    expect(musicKey('04 - lucinée - avec le temps.flac').title).toBe('avec le temps');
    expect(musicKey('04 - lucinee - avec_le_temps.flac').title).toBe('avec le temps');
  });

  it('keyTokens exclut les tokens faibles (vinylrips)', () => {
    expect(keyTokens('a1 untitled energy flash')).toEqual(['energy', 'flash']);
  });

  it('artistsCompatible : absent = compatible, sinon inclusion requise (alias)', () => {
    expect(artistsCompatible(null, 'drax')).toBe(true);
    expect(artistsCompatible('drax', 'thomas p heckmann a k a drax')).toBe(true);
    expect(artistsCompatible('drax', 'alpha')).toBe(false);
  });
});
