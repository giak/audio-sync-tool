import { describe, expect, it } from 'vitest';
import { byCountThenId, fmtCount, plural } from './format.js';

describe('fmtCount', () => {
  it('formate les milliers à la fr-FR', () => {
    // Node ICU : séparateur = espace fine insécable (U+202F) — identique aux
    // 27 sites `toLocaleString('fr')` existants, même runtime.
    expect(fmtCount(1234)).toBe('1\u202f234');
  });

  it('laisse les petits nombres inchangés', () => {
    expect(fmtCount(7)).toBe('7');
    expect(fmtCount(0)).toBe('0');
  });
});

describe('plural', () => {
  it('met au pluriel au-delà de 1', () => {
    expect(plural(3, 'fichier')).toBe('3 fichiers');
  });

  it('laisse le singulier à 1', () => {
    expect(plural(1, 'dossier')).toBe('1 dossier');
  });

  it("singulier à 0 (comportement des sites d'origine, non-régression)", () => {
    expect(plural(0, 'homonyme')).toBe('0 homonyme');
  });

  it('accepte un pluriel irrégulier', () => {
    expect(plural(2, 'copie', 'copies')).toBe('2 copies');
  });
});

describe('byCountThenId', () => {
  it('trie par volume décroissant', () => {
    const a = { count: 10, id: 'z' };
    const b = { count: 5, id: 'a' };
    expect(byCountThenId(a, b)).toBeLessThanOrEqual(-1);
    expect(byCountThenId(b, a)).toBeGreaterThanOrEqual(1);
  });

  it('départage par id alpha sur égalité de volume', () => {
    const a = { count: 10, id: 'acid' };
    const b = { count: 10, id: 'techno' };
    expect(byCountThenId(a, b)).toBeLessThanOrEqual(-1);
    expect(byCountThenId(b, a)).toBeGreaterThanOrEqual(1);
  });

  it('renvoie 0 pour des éléments identiques', () => {
    expect(byCountThenId({ count: 3, id: 'x' }, { count: 3, id: 'x' })).toBe(0);
  });
});
