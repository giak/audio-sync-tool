import { describe, expect, it } from 'vitest';
import { hotToLabel, labelToHot, cuesToRegions, regionToCue } from './cueModel.js';

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
});