import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _clearMatchCache, getMatchStatus, matchBadgeHtml, matchBadgeParts } from './matchStatus.js';

function mockFetchResponse(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      json: async () => body,
    }),
  );
}

describe('matchStatus — badge match NML (EPIC-016)', () => {
  beforeEach(() => {
    _clearMatchCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matched quand une seule entrée NML', async () => {
    mockFetchResponse(200, { ok: true, entries: [{ filename: 'a.mp3' }], multiple: false });
    expect(await getMatchStatus('/p/a.mp3')).toBe('matched');
  });

  it('multiple quand plusieurs entrées homonymes', async () => {
    mockFetchResponse(200, { ok: true, entries: [{}, {}], multiple: true });
    expect(await getMatchStatus('/p/b.mp3')).toBe('multiple');
  });

  it('missing quand aucune entrée (piste absente de la collection)', async () => {
    mockFetchResponse(200, { ok: true, entries: [], multiple: false });
    expect(await getMatchStatus('/p/c.mp3')).toBe('missing');
  });

  it('error quand le serveur répond autre chose que ok (404/400)', async () => {
    mockFetchResponse(404, { error: 'fichier introuvable' });
    expect(await getMatchStatus('/p/d.mp3')).toBe('error');
  });

  it('error quand le fetch échoue (réseau)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await getMatchStatus('/p/e.mp3')).toBe('error');
  });

  it('cache : un seul fetch par fullPath', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, entries: [{}] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await getMatchStatus('/p/cache.mp3');
    await getMatchStatus('/p/cache.mp3');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('appels CONCURRENTS pour le même fullPath : un seul fetch (cache de promesses)', async () => {
    let resolveFetch: (v: unknown) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise(r => {
          resolveFetch = r;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const p1 = getMatchStatus('/p/race.mp3');
    const p2 = getMatchStatus('/p/race.mp3');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch!({ ok: true, json: async () => ({ ok: true, entries: [{}] }) });
    expect(await p1).toBe('matched');
    expect(await p2).toBe('matched');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('matchBadgeHtml : textes et classes par statut', () => {
    expect(matchBadgeHtml(undefined)).toContain('pl-match-loading');
    expect(matchBadgeHtml('matched')).toContain('pl-match-ok');
    expect(matchBadgeHtml('matched')).toContain('NML');
    expect(matchBadgeHtml('multiple')).toContain('pl-match-multi');
    expect(matchBadgeHtml('missing')).toContain('pl-match-missing');
    expect(matchBadgeHtml('missing')).toContain('non importé');
    expect(matchBadgeHtml('error')).toContain('pl-match-error');
  });

  it('matchBadgeParts : classe + texte + infobulle par statut', () => {
    expect(matchBadgeParts(undefined).cls).toBe('pl-match-loading');
    expect(matchBadgeParts(undefined).text).toBe('…');
    expect(matchBadgeParts('matched').cls).toBe('pl-match-ok');
    expect(matchBadgeParts('matched').text).toBe('✓ NML');
    expect(matchBadgeParts('multiple').cls).toBe('pl-match-multi');
    expect(matchBadgeParts('missing').text).toContain('non importé');
    expect(matchBadgeParts('error').cls).toBe('pl-match-error');
  });
});
