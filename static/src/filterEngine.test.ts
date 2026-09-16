// ─── Unit tests: filterEngine.ts — matcher tokens partagé ─────────────────

import { describe, expect, it } from 'vitest';
import { foldTerm, matchesTokens, subjectFromName } from './filterEngine.js';

describe('filterEngine', () => {
  describe('foldTerm', () => {
    it('folds case and accents, trims', () => {
      expect(foldTerm('  ÉTÉ ')).toBe('ete');
      expect(foldTerm('Café')).toBe('cafe');
    });
  });

  describe('matchesTokens', () => {
    const song = { name: 'Artist - Title (Radio Edit).mp3', year: '2023', codec: 'MP3 320kbps' };

    it('matches simple substring (folded)', () => {
      expect(matchesTokens(foldTerm('title'), song)).toBe(true);
      expect(matchesTokens(foldTerm('TITLE'), song)).toBe(true);
      expect(matchesTokens(foldTerm('étrange'), { name: 'Etrange', year: null, codec: null })).toBe(true);
    });

    it('requires ALL tokens (AND)', () => {
      expect(matchesTokens(foldTerm('artist 2023'), song)).toBe(true);
      expect(matchesTokens(foldTerm('artist 1999'), song)).toBe(false);
    });

    it('matches year (numérique)', () => {
      expect(matchesTokens(foldTerm('2023'), song)).toBe(true);
      expect(matchesTokens(foldTerm('202'), song)).toBe(true); // substring voulu
      expect(matchesTokens(foldTerm('1998'), song)).toBe(false);
    });

    it('matches codec', () => {
      expect(matchesTokens(foldTerm('flac'), { name: 'song', year: null, codec: 'FLAC' })).toBe(true);
      expect(matchesTokens(foldTerm('320'), { name: 'song', year: null, codec: 'MP3 320kbps' })).toBe(true);
      expect(matchesTokens(foldTerm('wav'), { name: 'song', year: null, codec: 'MP3 320kbps' })).toBe(false);
    });

    it('empty term matches everything', () => {
      expect(matchesTokens('', song)).toBe(true);
      expect(matchesTokens('   ', song)).toBe(true);
    });

    it('subjectFromName gives name-only subject', () => {
      expect(matchesTokens(foldTerm('rock'), subjectFromName('Rock Classics'))).toBe(true);
      expect(matchesTokens(foldTerm('jazz'), subjectFromName('Rock Classics'))).toBe(false);
    });
  });
});
