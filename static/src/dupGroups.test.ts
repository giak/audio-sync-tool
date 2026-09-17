// ─── Unit tests: dupGroups.ts — clusterisation + arbitrage qualité ────────

import { describe, expect, it } from 'vitest';
import { buildVersionGroups } from './dupGroups.js';

describe('buildVersionGroups', () => {
  it('ignores isolated files (no group of 1)', () => {
    const g = buildVersionGroups(
      { '/e': { 'unique.flac': { path: 'unique.flac', duration: 100, codec: 'FLAC' } } },
      { '/s': { 'other.mp3': { path: 'other.mp3', duration: 500, codec: 'MP3 320kbps' } } },
    );
    expect(g).toEqual([]);
  });

  it('clusters an epars FLAC with a source MP3 twin (duration ±2 + name)', () => {
    const g = buildVersionGroups(
      { '/e': { 'song.flac': { path: 'song.flac', duration: 200, codec: 'FLAC' } } },
      { '/s': { 'song.mp3': { path: 'song.mp3', duration: 200, codec: 'MP3 320kbps' } } },
    );
    expect(g.length).toBe(1);
    expect(g[0].members.length).toBe(2);
    expect(g[0].winner.filename).toBe('song.flac'); // FLAC(100) > MP3 320(80)
    expect(g[0].winnerNeedsCopy).toBe(true);
    expect(g[0].copyTargetDir).toBe('/s');
    expect(g[0].losers.map(l => l.filename)).toEqual(['song.mp3']);
  });

  it('clusters transitively: 3 versions across sides form ONE group', () => {
    const g = buildVersionGroups(
      {
        '/e': {
          'track.flac': { path: 'track.flac', duration: 200, codec: 'FLAC' },
          'track (radio edit).mp3': { path: 'track (radio edit).mp3', duration: 201, codec: 'MP3 128kbps' },
        },
      },
      { '/s': { 'track.mp3': { path: 'track.mp3', duration: 200, codec: 'MP3 320kbps' } } },
    );
    expect(g.length).toBe(1);
    expect(g[0].members.length).toBe(3);
    expect(g[0].winner.filename).toBe('track.flac');
    // losers (EPIC-032) = candidats trash : rangés de même enregistrement.
    // L'épars radio edit non gagnant n'y figure plus — décision utilisateur.
    expect(g[0].losers.map(l => l.side)).toEqual(['source']);
  });

  it('clusters two source files with no epars (dedup côté rangé)', () => {
    const g = buildVersionGroups(
      { '/e': {} },
      {
        '/s': {
          'a.mp3': { path: 'a.mp3', duration: 200, codec: 'MP3 320kbps' },
          'a.flac': { path: 'a.flac', duration: 200, codec: 'FLAC' },
        },
      },
    );
    expect(g.length).toBe(1);
    expect(g[0].winner.filename).toBe('a.flac');
    expect(g[0].winnerNeedsCopy).toBe(false);
    expect(g[0].copyTargetDir).toBeNull();
    expect(g[0].losers.length).toBe(1);
  });

  it('does NOT cluster different songs (name dissimilar, same duration)', () => {
    const g = buildVersionGroups(
      { '/e': { 'alpha.flac': { path: 'alpha.flac', duration: 200, codec: 'FLAC' } } },
      { '/s': { 'omega.mp3': { path: 'omega.mp3', duration: 200, codec: 'MP3 320kbps' } } },
    );
    expect(g).toEqual([]);
  });

  it('does NOT cluster same name with far-apart durations (> 2 s)', () => {
    const g = buildVersionGroups(
      { '/e': { 'song.flac': { path: 'song.flac', duration: 200, codec: 'FLAC' } } },
      { '/s': { 'song.mp3': { path: 'song.mp3', duration: 240, codec: 'MP3 320kbps' } } },
    );
    expect(g).toEqual([]);
  });

  it('normalizes names: noise tokens and separators do not block clustering', () => {
    const g = buildVersionGroups(
      {
        '/e': { '01 - artist_title (HQ).flac': { path: '01 - artist_title (HQ).flac', duration: 200, codec: 'FLAC' } },
      },
      { '/s': { 'artist - title.mp3': { path: 'artist - title.mp3', duration: 200, codec: 'MP3 320kbps' } } },
    );
    expect(g.length).toBe(1);
  });

  it('reunites VERSIONS of one song across durations (EPIC-032, Energy Flash réel)', () => {
    const g = buildVersionGroups(
      {
        '/e': {
          '02 - Joey Beltram - Energy Flash.mp3': {
            path: '02 - Joey Beltram - Energy Flash.mp3',
            duration: 285,
            codec: 'MP3 320kbps',
          },
          "joey beltram - classics - 01 - energy flash (from 'beltram vol1').mp3": {
            path: "joey beltram - classics - 01 - energy flash (from 'beltram vol1').mp3",
            duration: 351,
            codec: 'MP3 320kbps',
          },
        },
      },
      {
        '/s': {
          '0602-joey_beltram-energy_flash.flac': {
            path: '0602-joey_beltram-energy_flash.flac',
            duration: 349,
            codec: 'FLAC',
          },
          '101_joey_beltram_-_energy_flash.flac': {
            path: '101_joey_beltram_-_energy_flash.flac',
            duration: 353,
            codec: 'FLAC',
          },
          '11_joey_beltram_-_energy_flash.flac': {
            path: '11_joey_beltram_-_energy_flash.flac',
            duration: 352,
            codec: 'FLAC',
          },
        },
      },
    );
    // Les 5 « Energy Flash » (durées 285→353, noms très différents) = UN groupe.
    expect(g.length).toBe(1);
    expect(g[0].members.length).toBe(5);
    // Versions hors cohorte du gagnant (353) : la radio 285 s (Δ68) et le rip
    // 349 s (Δ4) — le classics 351 s (Δ2) reste « même enregistrement ».
    expect(g[0].members.filter(m => !m.sameRecording).length).toBe(2);
  });

  it('arbitrage limited to winning cohort : version jamais gagnante ni perdante', () => {
    const g = buildVersionGroups(
      {
        '/e': {
          // version radio (285 s) — même morceau, autre enregistrement
          '02 - Joey Beltram - Energy Flash.mp3': {
            path: '02 - Joey Beltram - Energy Flash.mp3',
            duration: 285,
            codec: 'FLAC',
          },
        },
      },
      {
        '/s': {
          // cohorte confirmée (v1) : jumeaux 352/353 — gagnant 353 (FLAC, durée max)
          '11_joey_beltram_-_energy_flash.flac': {
            path: '11_joey_beltram_-_energy_flash.flac',
            duration: 352,
            codec: 'FLAC',
          },
          '101_joey_beltram_-_energy_flash.flac': {
            path: '101_joey_beltram_-_energy_flash.flac',
            duration: 353,
            codec: 'FLAC',
          },
        },
      },
    );
    expect(g.length).toBe(1);
    const members = g[0].members;
    expect(members.length).toBe(3);
    // Le gagnant vient de la cohorte confirmée {352, 353}, pas du FLAC radio isolé.
    expect(g[0].winner.duration).toBe(353);
    // Le perdant rangé est le jumeau de durée, PAS la version radio.
    expect(g[0].losers.map(l => l.duration)).toEqual([352]);
    // sameRecording : la version radio est exclue de la cohorte gagnante.
    const radio = members.find(m => m.duration === 285)!;
    expect(radio.sameRecording).toBe(false);
    expect(g[0].winner.sameRecording).toBe(true);
  });

  it('does NOT cluster same title from different artists (garde artiste)', () => {
    const g = buildVersionGroups(
      {
        '/e': {
          '01 - alpha - energy flash.mp3': {
            path: '01 - alpha - energy flash.mp3',
            duration: 200,
            codec: 'MP3 320kbps',
          },
        },
      },
      {
        '/s': {
          '02 - omega - energy flash.mp3': {
            path: '02 - omega - energy flash.mp3',
            duration: 200,
            codec: 'MP3 320kbps',
          },
        },
      },
    );
    expect(g).toEqual([]);
  });

  it('does NOT cluster weak-token-only names across durations (vinylrips a1/b1)', () => {
    const g = buildVersionGroups(
      { '/e': { 'a1 untitled.mp3': { path: 'a1 untitled.mp3', duration: 200, codec: 'MP3 320kbps' } } },
      { '/s': { 'b1 untitled (mix).mp3': { path: 'b1 untitled (mix).mp3', duration: 500, codec: 'MP3 320kbps' } } },
    );
    expect(g).toEqual([]);
  });

  it('sorts groups deterministically by key', () => {
    const mk = (dir: string, name: string, dur: number) => ({
      [dir]: { [name]: { path: name, duration: dur, codec: 'FLAC' } },
    });
    const g = buildVersionGroups(
      { ...mk('/e2', 'zz.flac', 100), ...mk('/e1', 'aa.flac', 100) },
      { ...mk('/s2', 'zz.mp3', 100), ...mk('/s1', 'aa.mp3', 100) },
    );
    expect(g.map(x => x.key)).toEqual([...g.map(x => x.key)].sort());
    expect(g.length).toBe(2);
  });
});
