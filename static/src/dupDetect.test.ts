// ─── Tests dupDetect (EPIC-028 P0) : normalisation, matching, verdicts ────
import { describe, expect, it } from 'vitest';
import {
  compareQuality,
  DELTA_THRESHOLD_S,
  type DupFileEntry,
  detectDuplicates,
  levenshteinRatio,
  nameSimilarity,
  normalizeName,
  qualityScore,
  SIM_THRESHOLD,
  tokenSetRatio,
} from './dupDetect.js';

// ── Helpers ───────────────────────────────────────────────────────────────

type Index = Record<string, Record<string, { path: string; duration?: number | null; codec?: string | null }>>;

function epars(filename: string, duration: number, codec: string | null = 'FLAC'): Index {
  return { '/epars': { [filename]: { path: filename, duration, codec } } };
}

function source(entries: Array<{ filename: string; duration: number; codec?: string | null; dir?: string }>): Index {
  const idx: Record<string, { path: string; duration?: number | null; codec?: string | null }> = {};
  for (const e of entries) {
    idx[e.filename] = {
      path: e.dir ? `${e.dir}/${e.filename}` : e.filename,
      duration: e.duration,
      codec: e.codec ?? 'MP3 320kbps',
    };
  }
  return { '/music': idx };
}

function entry(filename: string, duration: number, codec: string | null): DupFileEntry {
  return { filename, fullPath: `/x/${filename}`, path: filename, duration, codec };
}

// ── Normalisation ─────────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('lowercases, strips accents and separators', () => {
    expect(normalizeName('Été_Indien-2024.mp3')).toBe('ete indien 2024');
  });

  it('removes extension only (not dots inside name)', () => {
    expect(normalizeName('Dr. Dre - The Next Episode.flac')).toBe('dr dre the next episode');
  });

  it('strips (Radio Edit), [HQ], (Remastered 2011) noise', () => {
    expect(normalizeName('Song Title (Radio Edit).mp3')).toBe('song title');
    expect(normalizeName('Song Title [HQ].flac')).toBe('song title');
    expect(normalizeName('Song Title (Remastered 2011).mp3')).toBe('song title');
  });

  it('strips feat./ft. tails', () => {
    expect(normalizeName('Song Title feat. Someone.mp3')).toBe('song title');
    expect(normalizeName('Song Title ft. Someone Else.mp3')).toBe('song title');
  });

  it('strips leading track numbers', () => {
    expect(normalizeName('01 - Song Title.mp3')).toBe('song title');
    expect(normalizeName('07.Song_Title.flac')).toBe('song title');
  });

  it('collapses multiple noise markers (2 passes)', () => {
    expect(normalizeName('Song (Radio Edit) (Remastered 2011) [HQ].mp3')).toBe('song');
  });
});

// ── Similarité ────────────────────────────────────────────────────────────

describe('similarity', () => {
  it('levenshteinRatio: identical = 1, empty = 1, different < 1', () => {
    expect(levenshteinRatio('abc', 'abc')).toBe(1);
    expect(levenshteinRatio('', '')).toBe(1);
    expect(levenshteinRatio('abc', 'abd')).toBeCloseTo(2 / 3, 5);
  });

  it('tokenSetRatio: order-indifferent', () => {
    expect(tokenSetRatio('daft punk one more time', 'one more time daft punk')).toBe(1);
    expect(tokenSetRatio('alpha beta', 'alpha gamma')).toBeCloseTo(1 / 3, 5);
  });

  it('nameSimilarity combines both (max)', () => {
    // Levenshtein faible (ordre inversé), token-set parfait → 1
    expect(nameSimilarity('artist title', 'title artist')).toBe(1);
  });

  it('threshold: 0.88 catches close homonyms, rejects unrelated', () => {
    expect(nameSimilarity('song title', 'song tittle')).toBeGreaterThanOrEqual(SIM_THRESHOLD);
    expect(nameSimilarity('completely different words', 'other text here now')).toBeLessThan(SIM_THRESHOLD);
  });
});

// ── Score qualité ─────────────────────────────────────────────────────────

describe('qualityScore', () => {
  it('lossless containers = 100', () => {
    expect(qualityScore('FLAC')).toBe(100);
    expect(qualityScore('WAV')).toBe(100);
    expect(qualityScore('AIFF')).toBe(100);
    expect(qualityScore('ALAC')).toBe(100);
  });

  it('bitrate tiers', () => {
    expect(qualityScore('MP3 320kbps')).toBe(80);
    expect(qualityScore('MP3 256kbps')).toBe(80);
    expect(qualityScore('MP3 192kbps')).toBe(60);
    expect(qualityScore('MP3 128kbps')).toBe(60);
    expect(qualityScore('MP3 96kbps')).toBe(40);
  });

  it('lossy without bitrate → middle tier; null → 0', () => {
    expect(qualityScore('MP3')).toBe(60);
    expect(qualityScore(null)).toBe(0);
  });
});

// ── Verdicts ──────────────────────────────────────────────────────────────

describe('compareQuality', () => {
  it('FLAC beats MP3 320 (left-better)', () => {
    expect(compareQuality(entry('a.flac', 200, 'FLAC'), entry('a.mp3', 200, 'MP3 320kbps'))).toBe('left-better');
  });

  it('MP3 beats nothing above 128 (right-better)', () => {
    expect(compareQuality(entry('a.mp3', 200, 'MP3 128kbps'), entry('a.flac', 200, 'FLAC'))).toBe('right-better');
  });

  it('equal codecs → longer duration wins (left-better)', () => {
    expect(compareQuality(entry('a.flac', 210, 'FLAC'), entry('a.flac', 200, 'FLAC'))).toBe('left-better');
  });

  it('truly equal → equal', () => {
    expect(compareQuality(entry('a.flac', 200, 'FLAC'), entry('a.flac', 200, 'FLAC'))).toBe('equal');
  });
});

// ── Détection ─────────────────────────────────────────────────────────────

describe('detectDuplicates', () => {
  it('matches a FLAC épars with its MP3 twin despite name noise', () => {
    const res = detectDuplicates(
      epars('Daft_Punk-One_More_Time (Radio Edit).flac', 200, 'FLAC'),
      source([{ filename: '01 - Daft Punk - One More Time.mp3', duration: 200, codec: 'MP3 320kbps' }]),
    );
    expect(res.matches).toHaveLength(1);
    const m = res.matches[0];
    expect(m.verdict).toBe('left-better');
    expect(m.delta).toBe(0);
    expect(res.byEparsPath.get('/epars/Daft_Punk-One_More_Time (Radio Edit).flac')).toBe(m);
  });

  it('respects ±2 s duration window (DELTA_THRESHOLD_S)', () => {
    const res = detectDuplicates(
      epars('song.flac', 200),
      source([{ filename: 'song.mp3', duration: 200 + DELTA_THRESHOLD_S }]),
    );
    expect(res.matches).toHaveLength(1);

    const tooFar = detectDuplicates(
      epars('song.flac', 200),
      source([{ filename: 'song.mp3', duration: 200 + DELTA_THRESHOLD_S + 0.5 }]),
    );
    expect(tooFar.matches).toHaveLength(0);
  });

  it('no duration → no match (both sides)', () => {
    const res = detectDuplicates(
      { '/epars': { 'song.flac': { path: 'song.flac', duration: null, codec: 'FLAC' } } },
      { '/music': { 'song.mp3': { path: 'song.mp3', duration: null, codec: 'MP3 320kbps' } } },
    );
    expect(res.matches).toHaveLength(0);
  });

  it('token-set order: Titre - Artiste vs Artiste - Titre matches', () => {
    const res = detectDuplicates(
      epars('One More Time - Daft Punk.flac', 200),
      source([{ filename: 'Daft Punk - One More Time.mp3', duration: 200 }]),
    );
    expect(res.matches).toHaveLength(1);
  });

  it('different artists named in files are NOT matched (artist disambiguates)', () => {
    // « Hurt » Johnny Cash vs Nine Inch Nails, artiste présent dans les deux
    // noms : 1 token commun sur 6 → sim ≈ 0,17, rejeté. Le nom complet
    // désambiguïse — comportement voulu (limite les faux positifs).
    const res = detectDuplicates(
      epars('Hurt - Johnny Cash.flac', 240, 'FLAC'),
      source([{ filename: 'Hurt - Nine Inch Nails.mp3', duration: 240 }]),
    );
    expect(res.matches).toHaveLength(0);
  });

  it('identical names + same duration but different artists → matched (false positive possible — human review is the compensation, P1)', () => {
    // Le vrai cas piège documenté dans la spec : noms identiques (titre seul),
    // artistes différents. Indiscernable par nom+ durée seuls — le matcher
    // les associe (contrat strict), la revue un par un tranche.
    const res = detectDuplicates(epars('Hurt.flac', 240, 'FLAC'), source([{ filename: 'Hurt.mp3', duration: 240 }]));
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].sim).toBe(1);
    expect(res.matches[0].verdict).toBe('left-better'); // FLAC(100) vs MP3 320(80)
  });

  it('multiple candidates → best sim wins, tie → smaller delta', () => {
    const res = detectDuplicates(
      epars('song.flac', 200),
      source([
        { filename: 'song (live).mp3', duration: 201 },
        { filename: 'song.mp3', duration: 200 },
      ]),
    );
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].sourceFilename).toBe('song.mp3');
    expect(res.matches[0].delta).toBe(0);
  });

  it('one épars matches at most one twin (no duplicate matches)', () => {
    const res = detectDuplicates(
      epars('song.flac', 200),
      source([
        { filename: 'song.mp3', duration: 200, dir: 'Rock' },
        { filename: 'song.mp3', duration: 200, dir: 'Pop' },
      ]),
    );
    expect(res.matches).toHaveLength(1);
  });

  it('verdict quality: FLAC épars vs MP3 320 rangé → left-better', () => {
    const res = detectDuplicates(
      epars('song.flac', 200, 'FLAC'),
      source([{ filename: 'song.mp3', duration: 200, codec: 'MP3 320kbps' }]),
    );
    expect(res.matches[0].verdict).toBe('left-better');
  });

  it('verdict quality: MP3 128 épars vs FLAC rangé → right-better', () => {
    const res = detectDuplicates(
      epars('song.mp3', 200, 'MP3 128kbps'),
      source([{ filename: 'song.flac', duration: 200, codec: 'FLAC' }]),
    );
    expect(res.matches[0].verdict).toBe('right-better');
  });
});
