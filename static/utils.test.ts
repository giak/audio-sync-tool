import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDuration,
  getJournalFiles,
  computeStatus,
  countAllEparsFiles,
  dirHasMatchingDescendant,
  type JournalEntry,
} from './utils.js';

describe('formatTime', () => {
  it('formats 0 as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatTime(65)).toBe('1:05');
  });

  it('formats 3661 seconds as 61:01', () => {
    expect(formatTime(3661)).toBe('61:01');
  });

  it('returns 0:00 for negative values', () => {
    expect(formatTime(-5)).toBe('0:00');
  });

  it('returns 0:00 for NaN', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('returns 0:00 for Infinity', () => {
    expect(formatTime(Infinity)).toBe('0:00');
  });
});

describe('formatDuration', () => {
  it('formats 65 seconds as 1:05', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('returns empty string for 0', () => {
    expect(formatDuration(0)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(formatDuration(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDuration(undefined)).toBe('');
  });

  it('returns empty string for negative values', () => {
    expect(formatDuration(-1)).toBe('');
  });

  it('formats 3661 seconds as 61:01', () => {
    expect(formatDuration(3661)).toBe('61:01');
  });

  it('handles float seconds', () => {
    expect(formatDuration(65.7)).toBe('1:05');
  });
});

describe('getJournalFiles', () => {
  it('returns an empty set for an empty journal', () => {
    const result = getJournalFiles([]);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it('collects filenames with status copied', () => {
    const journal: JournalEntry[] = [
      { filename: 'a.mp3', status: 'copied' },
      { filename: 'b.mp3', status: 'copied' },
      { filename: 'c.mp3', status: 'error' },
    ];
    const result = getJournalFiles(journal);
    expect(result.has('a.mp3')).toBe(true);
    expect(result.has('b.mp3')).toBe(true);
    expect(result.has('c.mp3')).toBe(false);
  });

  it('ignores entries without the copied status', () => {
    const journal: JournalEntry[] = [
      { filename: 'x.mp3', status: 'pending' },
      { filename: 'y.mp3', status: 'failed' },
    ];
    const result = getJournalFiles(journal);
    expect(result.size).toBe(0);
  });
});

describe('computeStatus', () => {
  const sourceFiles = {
    '/music': {
      'a.mp3': { path: 'a.mp3' },
      'b.mp3': { path: 'sub/b.mp3' },
    },
  };

  it('returns nouveau for a completely new file', () => {
    const status = computeStatus('z.mp3', sourceFiles, []);
    expect(status).toBe('nouveau');
  });

  it('returns doublon for a file in source but not journal', () => {
    const status = computeStatus('a.mp3', sourceFiles, []);
    expect(status).toBe('doublon');
  });

  it('returns traite for a file in journal but not in source', () => {
    const journal: JournalEntry[] = [{ filename: 'x.mp3', status: 'copied' }];
    const status = computeStatus('x.mp3', sourceFiles, journal);
    expect(status).toBe('traite');
  });

  it('prioritises doublon over traite — file in both source and journal', () => {
    const journal: JournalEntry[] = [{ filename: 'b.mp3', status: 'copied' }];
    const status = computeStatus('b.mp3', sourceFiles, journal);
    expect(status).toBe('doublon');
  });

  it('returns traite for a file in journal but not in source', () => {
    const journal: JournalEntry[] = [{ filename: 'only_journal.mp3', status: 'copied' }];
    const status = computeStatus('only_journal.mp3', sourceFiles, journal);
    expect(status).toBe('traite');
  });

  it('returns nouveau for empty sourceFiles', () => {
    const status = computeStatus('new.mp3', {}, []);
    expect(status).toBe('nouveau');
  });

  it('does not mark as traite for non-copied journal entries', () => {
    const journal: JournalEntry[] = [{ filename: 'c.mp3', status: 'error' }];
    const status = computeStatus('c.mp3', sourceFiles, journal);
    expect(status).toBe('nouveau');
  });
});

describe('countAllEparsFiles', () => {
  it('returns 0 for empty input', () => {
    expect(countAllEparsFiles({})).toBe(0);
  });

  it('counts files across multiple directories', () => {
    const eparsFiles = {
      '/dir1': { 'a.mp3': {}, 'b.mp3': {} },
      '/dir2': { 'c.mp3': {} },
    };
    expect(countAllEparsFiles(eparsFiles)).toBe(3);
  });
});

describe('dirHasMatchingDescendant', () => {
  it('returns false for an empty node', () => {
    expect(dirHasMatchingDescendant({} as any, 'test')).toBe(false);
  });

  it('matches a direct child directory name', () => {
    const node = { jazz: { __files__: [] } };
    expect(dirHasMatchingDescendant(node as any, 'jaz')).toBe(true);
  });

  it('matches a nested descendant directory', () => {
    const node = {
      music: {
        jazz: {
          __files__: [],
        },
      },
    };
    expect(dirHasMatchingDescendant(node as any, 'jaz')).toBe(true);
  });

  it('is case-insensitive', () => {
    const node = { Jazz: { __files__: [] } };
    expect(dirHasMatchingDescendant(node as any, 'jaz')).toBe(true);
  });

  it('returns false when no name matches', () => {
    const node = {
      rock: { __files__: [] },
      pop: { __files__: [] },
    };
    expect(dirHasMatchingDescendant(node as any, 'jaz')).toBe(false);
  });

  it('skips __files__ keys', () => {
    const node = { __files__: [{ filename: 'jazzy.mp3' }] };
    expect(dirHasMatchingDescendant(node as any, 'jaz')).toBe(false);
  });
});
