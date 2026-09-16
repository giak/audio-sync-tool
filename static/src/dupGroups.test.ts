// ─── Unit tests: dupGroups.ts — clusterisation + arbitrage qualité ────────

import { describe, expect, it } from 'vitest';
import { buildVersionGroups } from './dupGroups.js';

const E = (duration: number, codec: string) => ({ path: 'x', duration, codec });
// Les helpers ci-dessous évitent la répétition des littéraux d'index.

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
    // losers bruts = tous les non-gagnants ; applyGroupPlan ne déplace que
    // les RANGÉS (les épars perdants restent en place, décision utilisateur).
    expect(g[0].losers.map(l => l.side).sort()).toEqual(['epars', 'source']);
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
