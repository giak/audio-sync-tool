// ─── Tests: bassband.ts — bande d'énergie basse 40-150 Hz (EPIC-012) ───────
import { describe, expect, it } from 'vitest';
import { computeBassBand } from './bassband.js';

const SR = 44100;

/** Génère un signal mono : sinus pur + petites harmoniques (kick-like) ou silences. */
function synth(seconds: number, freqHz: number | null, amp = 0.8): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = freqHz === null ? 0 : amp * Math.sin((2 * Math.PI * freqHz * i) / SR);
  }
  return out;
}

describe('computeBassBand', () => {
  it('retourne [] pour un signal trop court (< 1 s)', () => {
    expect(computeBassBand(new Float32Array(1000), SR)).toEqual([]);
    expect(computeBassBand(new Float32Array(SR - 1), SR)).toEqual([]);
  });

  it('retourne un signal plat (tous à 0) pour le silence', () => {
    const band = computeBassBand(synth(5, null), SR, 80);
    expect(band).toHaveLength(80);
    expect(band.every(v => v === 0)).toBe(true);
  });

  it('détecte un kick à 60 Hz (bande pleine, normalisée 0..1)', () => {
    const band = computeBassBand(synth(5, 60), SR, 80);
    expect(band).toHaveLength(80);
    const max = Math.max(...band);
    expect(max).toBeCloseTo(1, 5); // normalisé par le max
    expect(band.filter(v => v > 0.5).length).toBeGreaterThan(0); // pas de trou
  });

  it('atténue fortement les hautes fréquences (8 kHz — hats/voix hors bande)', () => {
    const kick = computeBassBand(synth(5, 60), SR, 80);
    const hat = computeBassBand(synth(5, 8000), SR, 80);
    // Le hat traverse le passe-bas de décimation + le biquad 40-150 Hz :
    // son énergie résiduelle doit rester très en dessous du kick.
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(hat)).toBeLessThan(mean(kick) * 0.3);
  });

  it('respecte le barCount demandé (défaut 160)', () => {
    expect(computeBassBand(synth(10, 60), SR)).toHaveLength(160);
    expect(computeBassBand(synth(10, 60), SR, 50)).toHaveLength(50);
  });

  it('la position d’un pic reflète le temps : impulsions à t=2s → barre haute vers 20 %', () => {
    // Signal : courtes impulsions basses toutes les 0.5 s à partir de 2 s.
    const n = SR * 8;
    const s = new Float32Array(n);
    for (let t = 2; t < 8; t += 0.5) {
      const start = Math.round(t * SR);
      for (let i = 0; i < SR * 0.1; i++) {
        s[start + i] = 0.8 * Math.sin((2 * Math.PI * 60 * i) / SR);
      }
    }
    const band = computeBassBand(s, SR, 80); // 80 barres → 0.1 s/barre
    // Barres couvrant [2s, 2.5s] → index 20..25 environ ; avant 2 s → ~0.
    const pre = band.slice(0, 15).reduce((a, v) => a + v, 0);
    const around = band.slice(18, 28).reduce((a, v) => a + v, 0);
    expect(around).toBeGreaterThan(pre);
  });
});
