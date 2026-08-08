// ─── Tests: beatgrid.ts — buildBeats / snapToBeat / detectTempoFromOnsets ──
import { describe, expect, it } from 'vitest';
import { beatInterval, buildBeats, detectTempoFromOnsets, snapToBeat } from './beatgrid.js';

describe('beatgrid/buildBeats', () => {
  it('espace les beats selon le BPM (120 → 0.5s)', () => {
    expect(beatInterval(120)).toBeCloseTo(0.5);
    expect(beatInterval(100)).toBeCloseTo(0.6);
  });

  it('construit une grille de 0 à duration', () => {
    const beats = buildBeats(120, 2);
    expect(beats[0]).toBe(0);
    expect(beats).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it('renvoie [] si BPM ou durée invalides', () => {
    expect(buildBeats(0, 10)).toEqual([]);
    expect(buildBeats(120, -1)).toEqual([]);
    expect(buildBeats(Number.NaN, 10)).toEqual([]);
  });
});

describe('beatgrid/snapToBeat', () => {
  const beats = buildBeats(120, 2); // [0, 0.5, 1, 1.5, 2]

  it('snap au beat le plus proche', () => {
    expect(snapToBeat(0.26, beats)).toBeCloseTo(0.5);
    expect(snapToBeat(0.24, beats)).toBeCloseTo(0);
    expect(snapToBeat(1.48, beats)).toBeCloseTo(1.5);
  });

  it('borne aux extrémités', () => {
    expect(snapToBeat(-3, beats)).toBeCloseTo(0);
    expect(snapToBeat(99, beats)).toBeCloseTo(2);
  });

  it('laisse la position inchangée sans grille', () => {
    expect(snapToBeat(0.33, [])).toBeCloseTo(0.33);
  });
});

describe('beatgrid/detectTempoFromOnsets', () => {
  it("détecte le tempo d'une enveloppe périodique (lag 50 frames @ 100fps → 120 BPM)", () => {
    // Pics d'énergie tous les 50 frames = 0.5s → 120 BPM.
    const onsets: number[] = [];
    for (let i = 0; i < 4000; i++) onsets.push(i % 50 === 0 ? 1 : 0);
    expect(detectTempoFromOnsets(onsets, 100)).toBeCloseTo(120, 0);
  });

  it("détecte le tempo réel hors bornes via l'harmonique (60 BPM, borné 70-180 → 120)", () => {
    const onsets: number[] = [];
    for (let i = 0; i < 4000; i++) onsets.push(i % 100 === 0 ? 1 : 0);
    const bpm = detectTempoFromOnsets(onsets, 100, 70, 180);
    // 60 BPM est hors bornes : on trouve l'harmonique à 120.
    expect(bpm).toBeCloseTo(120, 0);
  });

  it('renvoie 0 sur un signal plat', () => {
    expect(detectTempoFromOnsets(new Array(200).fill(0.01), 100)).toBe(0);
    expect(detectTempoFromOnsets([], 100)).toBe(0);
  });
});
