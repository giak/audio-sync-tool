import { describe, expect, it } from 'vitest';
import { cuesToRegions, hotToLabel, labelToHot, regionToCue } from './cueModel.js';

describe('cueModel', () => {
  it('mappe hotcue ≤7 → A..H', () => {
    expect(hotToLabel(0)).toBe('A');
    expect(hotToLabel(7)).toBe('H');
    expect(labelToHot('A')).toBe(0);
    expect(labelToHot('H')).toBe(7);
  });
  it('filtre les cues TYPE=4 / HOTCUE négatif', () => {
    const cues = [
      { type: '0', start: 5, len: 0, hotcue: 2, name: '', displ_order: '0' },
      { type: '4', start: 1, len: 0, hotcue: -1, name: '', displ_order: '0' },
      { type: '5', start: 10, len: 4, hotcue: 0, name: '', displ_order: '1' },
    ];
    const regs = cuesToRegions(cues);
    expect(regs).toHaveLength(2);
  });
  it('conserve le hotcue comme id de région (round-trip)', () => {
    const cues = [
      { type: '0', start: 5, len: 0, hotcue: 2, name: '', displ_order: '0' },
      { type: '5', start: 10, len: 4, hotcue: 3, name: '', displ_order: '1' },
    ];
    const regs = cuesToRegions(cues);
    expect(regs[0].id).toBe(2);
    expect(regs[1].id).toBe(3);
    const rt = regs.map(r => regionToCue(r));
    expect(rt[0].hotcue).toBe(2);
    expect(rt[1].hotcue).toBe(3);
    expect(rt[0].type).toBe('0');
    expect(rt[1].type).toBe('5');
  });
  it('transforme une région cue en CueDTO TYPE=0', () => {
    const cue = regionToCue({ start: 5, end: 5.08, id: 2, color: '#55aaff' });
    expect(cue.type).toBe('0');
    expect(cue.start).toBe(5);
    expect(cue.hotcue).toBe(2);
  });
  it('transforme une région longue (loop) en CueDTO TYPE=5 avec len', () => {
    const cue = regionToCue({ start: 10, end: 14, id: 0 });
    expect(cue.type).toBe('5');
    expect(cue.len).toBe(4);
  });
  it("normalise les start/len chaînes de l'API en nombres (régression B2)", () => {
    const regs = cuesToRegions([
      { type: '0', start: '60.125000', len: '0.000000', hotcue: 0, name: '', displ_order: '0' },
      { type: '5', start: '10.000000', len: '4.000000', hotcue: 1, name: '', displ_order: '1' },
    ]);
    expect(regs[0].start).toBe(60.125);
    expect(regs[0].end).toBeCloseTo(60.205, 3); // 60.125 + 0.08 (pas de concaténation)
    expect(regs[1].start).toBe(10);
    expect(regs[1].end).toBe(14); // 10 + 4
  });
  it('ignore les cues aux positions non numériques (NaN)', () => {
    const regs = cuesToRegions([
      { type: '0', start: 'abc', len: '0', hotcue: 0, name: '', displ_order: '0' },
      { type: '0', start: '5', len: '0', hotcue: 1, name: '', displ_order: '1' },
    ]);
    expect(regs).toHaveLength(1);
    expect(regs[0].id).toBe(1);
  });
  it('préserve DISPL_ORDER au round-trip quand il est fourni (B9)', () => {
    const rt = regionToCue({ start: 5, end: 5.08, id: 3 }, '7');
    expect(rt.displ_order).toBe('7');
  });
  it('ne reconstruit plus DISPL_ORDER depuis HOTCUE pour un nouveau cue (B9)', () => {
    // Avant la correction : displ_order = String(r.id) = '3' (violation de la décision).
    const rt = regionToCue({ start: 5, end: 5.08, id: 3 });
    expect(rt.displ_order).toBe('0');
    expect(rt.displ_order).not.toBe('3');
  });
});
