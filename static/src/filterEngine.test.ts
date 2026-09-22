// ─── Unit tests: filterEngine.ts — matcher tokens partagé ─────────────────

import { describe, expect, it } from 'vitest';
import { foldTerm, isYearLike, matchesTokens, subjectFromName } from './filterEngine.js';

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

    it('matche le chemin relatif quand il est fourni (EPIC-035 : sous-dossier épars)', () => {
      const inSub = { name: 'a.mp3', year: null, codec: null, path: '_schranz/a.mp3' };
      expect(matchesTokens(foldTerm('schranz'), inSub)).toBe(true);
      expect(matchesTokens(foldTerm('_schranz'), inSub)).toBe(true);
      // Sans path : comportement historique (nom seul) — non-régression côté source
      expect(matchesTokens(foldTerm('schranz'), { name: 'a.mp3', year: null, codec: null })).toBe(false);
      // AND mixte chemin + année
      expect(matchesTokens(foldTerm('schranz 1995'), { ...inSub, year: '1995' })).toBe(true);
      expect(matchesTokens(foldTerm('schranz 1995'), inSub)).toBe(false);
    });

    it('subjectFromName gives name-only subject', () => {
      expect(matchesTokens(foldTerm('rock'), subjectFromName('Rock Classics'))).toBe(true);
      expect(matchesTokens(foldTerm('jazz'), subjectFromName('Rock Classics'))).toBe(false);
    });
  });

  // ─── EPIC-037 P1 : le token année ne matche plus le sous-dossier daté ───
  describe('année honnête (EPIC-037)', () => {
    const inDatedFolder = {
      name: 'track.mp3',
      year: '1993',
      codec: 'MP3 320kbps',
      path: '2020_02_25/mix/track.mp3',
    };

    it('isYearLike reconnaît 19xx/20xx seulement', () => {
      expect(isYearLike('2020')).toBe(true);
      expect(isYearLike('1993')).toBe(true);
      expect(isYearLike('202')).toBe(false);
      expect(isYearLike('2020_02')).toBe(false);
      expect(isYearLike('0000')).toBe(false);
      expect(isYearLike('2999')).toBe(false);
    });

    it('ne matche plus le sous-dossier daté quand le fichier a une autre année', () => {
      expect(matchesTokens(foldTerm('2020'), inDatedFolder)).toBe(false);
    });

    it('matche l’année exacte du fichier', () => {
      expect(matchesTokens(foldTerm('1993'), inDatedFolder)).toBe(true);
      expect(matchesTokens(foldTerm('2020'), { ...inDatedFolder, year: '2020' })).toBe(true);
    });

    it('matche le sous-dossier daté si le fichier n’a PAS d’année', () => {
      expect(matchesTokens(foldTerm('2020'), { ...inDatedFolder, year: null })).toBe(true);
    });

    it('le nom de fichier reste souverain (texte explicite)', () => {
      const live = { name: 'Live 2020.mp3', year: '2019', codec: null, path: 'x/Live 2020.mp3' };
      expect(matchesTokens(foldTerm('2020'), live)).toBe(true);
    });

    it('échappatoire : un préfixe non year-like continue de chercher le dossier', () => {
      expect(matchesTokens(foldTerm('2020_02'), inDatedFolder)).toBe(true);
    });

    it('AND mixte : année exacte + texte', () => {
      const s = { name: '_schranz/x.mp3', year: '1995', codec: null, path: '_schranz/x.mp3' };
      expect(matchesTokens(foldTerm('schranz 1995'), s)).toBe(true);
      expect(matchesTokens(foldTerm('schranz 2020'), s)).toBe(false);
    });

    it('non-régression : les tokens non year-like gardent le haystack complet', () => {
      expect(matchesTokens(foldTerm('mix'), inDatedFolder)).toBe(true); // sous-dossier
      expect(matchesTokens(foldTerm('2020_02_25'), inDatedFolder)).toBe(true); // sous-dossier daté, préfixe
      expect(matchesTokens(foldTerm('320'), inDatedFolder)).toBe(true); // codec
      expect(matchesTokens(foldTerm('1993 mp3'), inDatedFolder)).toBe(true); // AND année exacte + codec
      // Un fichier taggé d'une année ne se repêche PAS par son sous-dossier.
      expect(matchesTokens(foldTerm('2020'), { ...inDatedFolder, year: 'x' })).toBe(false);
    });
  });
});
