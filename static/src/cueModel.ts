// ─── Cue model — mapping pur cues JSON ↔ régions wavesurfer (sans DOM) ─────

export interface CueDTO {
  type: string;
  /** L'API renvoie les positions NML en chaînes ("60.125000") — l'UI les convertit en nombres. */
  start: number | string;
  len: number | string;
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
  return (
    cues
      .filter(c => (c.type === '0' || c.type === '5') && c.hotcue >= 0 && c.hotcue <= 7)
      .map(c => {
        // Number() : le backend renvoie des chaînes NML — évite la concaténation (régression B2).
        const start = Number(c.start);
        const len = Number(c.len);
        return {
          start,
          end: c.type === '5' && len > 0 ? start + len : start + 0.08,
          id: c.hotcue,
          color: c.color || (c.type === '5' ? '#ffaa00' : '#55aaff'),
        };
      })
      // Ignore les positions non numériques (NML corrompu) — NaN casserait wavesurfer.
      .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end))
  );
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
