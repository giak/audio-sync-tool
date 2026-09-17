// ─── Unit tests: render/yearsUI.ts — vue Années (EPIC-033 T2/T4) ──────────
// api.js mocké (fetch de /years/preview) ; router.js RÉEL (exclusivité des
// pages) ; scrollIntoView stubé (pattern connu dupsUI.test.ts).

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('../api.js', () => ({ api }));

import { state } from '../state.js';
import { closeYearsMode, openYearsMode, renderYears, yearsMoveFocus } from './yearsUI.js';

const FIXTURE = {
  files_no_year: 6,
  certaines: [
    { path: '/m/a.mp3', filename: 'a.mp3', artist: 'foo', title: 'bar',
      status: 'found', source: 'musicbrainz', year: '1990', years: ['1990'] },
    { path: '/m/a2.mp3', filename: 'a2.mp3', artist: 'foo', title: 'bar',
      status: 'found', source: 'deezer', year: '1990', years: ['1990'] },
  ],
  a_revue: [
    { path: '/m/b.mp3', filename: 'b.mp3', artist: 'baz', title: 'qux',
      status: 'ambiguous', source: 'musicbrainz', year: null,
      years: ['2002', '2003'] },
    { path: '/m/c.mp3', filename: 'c.mp3', artist: 'naems', title: 'follow me',
      status: 'lax', source: 'itunes', year: '2024', years: ['2024'] },
  ],
  introuvables: 2,
};

function setupDom(): void {
  document.body.innerHTML = `
    <div id="main-panels"></div>
    <div id="playlist-layout" class="hidden"></div>
    <div id="dups-layout" class="hidden"></div>
    <div id="years-layout" class="hidden">
      <h2>📅 Années <span id="years-count"></span></h2>
      <div id="years-list"></div>
    </div>
    <div id="page-nav">
      <button id="page-sync" class="page-btn active">📦 Sync</button>
      <button id="page-playlist" class="page-btn">🎵 Playlist</button>
      <button id="page-dups" class="page-btn">↔ Doublons</button>
      <button id="page-years" class="page-btn">📅 Années</button>
    </div>
    <div id="status-text"></div>
  `;
  Element.prototype.scrollIntoView = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDom();
  state.page = 'sync';
  api.mockResolvedValue(JSON.parse(JSON.stringify(FIXTURE)));
});

afterAll(() => {
  document.body.innerHTML = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('yearsUI (EPIC-033 T2/T4)', () => {
  it('open : 4e page exclusive + compteur de vagues', async () => {
    await openYearsMode();
    expect(document.getElementById('years-layout')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('main-panels')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('page-years')!.classList.contains('active')).toBe(true);
    expect(document.getElementById('years-count')!.textContent).toContain('2 certaines');
  });

  it('certaines dédupliquées par clé (2 fichiers → 1 carte)', async () => {
    await openYearsMode();
    const cert = document.querySelectorAll('.years-card:not(.years-review)');
    expect(cert.length).toBe(1);
    expect(cert[0].textContent).toContain('2 fichiers');
  });

  it('à revue : ambigu → un bouton par candidate ; lax → accepter/rejeter', async () => {
    await openYearsMode();
    const cards = document.querySelectorAll('.years-card.years-review');
    expect(cards.length).toBe(2);
    const cands = cards[0].querySelectorAll('.years-btn:not(.years-reject)');
    expect(cands.length).toBe(2); // 2002, 2003
    expect(cands[0].textContent).toBe('2002');
    const lax = cards[1].querySelector('.years-btn:not(.years-reject)');
    expect(lax!.textContent).toContain('2024');
  });

  it('choix d\u2019année : session locale, marque .chosen, pas de fetch écriture', async () => {
    await openYearsMode();
    const cands = document.querySelectorAll('.years-card.years-review')[0]
      .querySelectorAll('.years-btn:not(.years-reject)');
    (cands[1] as HTMLElement).click();           // choisir 2003
    const chosen = document.querySelector('.years-btn.chosen');
    expect(chosen!.textContent).toBe('2003');
    // Aucun appel d'écriture : api n'est appelé que pour /years/preview.
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('rejet : la carte est masquée pour la session', async () => {
    await openYearsMode();
    (document.querySelector('.years-card.years-review .years-reject') as HTMLElement).click();
    const cards = document.querySelectorAll('.years-card.years-review');
    expect(cards.length).toBe(1); // la seconde reste
  });

  it('erreur API : message, pas de crash', async () => {
    api.mockRejectedValue(new Error('HTTP 500'));
    await openYearsMode();
    expect(document.querySelector('.years-empty')!.textContent).toContain('Chargement impossible');
  });

  it('yearsMoveFocus : borné au nombre de cartes à revue', async () => {
    await openYearsMode();
    yearsMoveFocus(5);                       // borne haute
    expect(document.querySelectorAll('.years-card.years-review.focused').length).toBe(1);
    yearsMoveFocus(-9);                      // borne basse
    renderYears();
    expect(document.querySelector('.years-card.years-review.focused')).toBeNull();
  });

  it('close : retour page sync exclusive', async () => {
    await openYearsMode();
    closeYearsMode();
    expect(state.page).toBe('sync');
    expect(document.getElementById('years-layout')!.classList.contains('hidden')).toBe(true);
  });
});
