// ─── Cue model — mapping pur cues JSON ↔ régions wavesurfer (sans DOM) ─────

export interface CueDTO {
  type: string;
  start: number;
  len: number;
  hotcue: number;
  name: string;
  displ_order: string;
  color?: string;
}

export function hotToLabel(h: number): string {
  return String.fromCharCode(65 + h).slice(0, 1); // A=0 .. H=7
}

export function labelToHot(l: string): number {
  return l.charCodeAt(0) - 65;
}

export function cuesToRegions(cues: CueDTO[]): Array<{ start: number; end: number; id: number; color?: string }> {
  return cues
    .filter(c => (c.type === '0' || c.type === '5') && c.hotcue >= 0 && c.hotcue <= 7)
    .map(c => ({
      start: c.start,
      end: c.type === '5' && c.len > 0 ? c.start + c.len : c.start + 0.08,
      id: c.hotcue,
      color: c.color || (c.type === '5' ? '#ffaa00' : '#55aaff'),
    }));
}

export function regionToCue(r: { start: number; end: number; id: number; color?: string }): CueDTO {
  const isLoop = r.end - r.start > 0.1;
  return {
    type: isLoop ? '5' : '0',
    start: r.start,
    len: isLoop ? Number((r.end - r.start).toFixed(6)) : 0,
    hotcue: r.id,
    name: 'n.n.',
    displ_order: String(r.id),
    color: r.color,
  };
}