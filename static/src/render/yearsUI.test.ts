// ─── Unit tests: render/yearsUI.ts — vue Années (EPIC-033 T2/T4) ──────────
// api.js mocké (fetch de /years/preview) ; router.js RÉEL (exclusivité des
// pages) ; scrollIntoView stubé (pattern connu dupsUI.test.ts).

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { api, togglePlay, playingPath } = vi.hoisted(() => ({
  api: vi.fn(),
  togglePlay: vi.fn(),
  playingPath: vi.fn<[], string | null>(() => null),
}));

vi.mock('../api.js', () => ({ api }));
vi.mock('../audio.js', () => ({
  togglePlay,
  playingPath,
  stopPlayer: vi.fn(),
  seekAudio: vi.fn(),
  isAudioPlaying: vi.fn(() => false),
  initAudioUI: vi.fn(),
}));

import { state } from '../state.js';
import { setFilterTerm } from './filterChip.js';
import { closeYearsMode, exportChoices, openYearsMode, renderYears, yearsMoveFocus } from './yearsUI.js';

const FIXTURE = {
  files_no_year: 6,
  certaines: [
    {
      path: '/m/a.mp3',
      filename: 'a.mp3',
      artist: 'foo',
      title: 'bar',
      status: 'found',
      source: 'musicbrainz',
      year: '1990',
      years: ['1990'],
    },
    {
      path: '/m/a2.mp3',
      filename: 'a2.mp3',
      artist: 'foo',
      title: 'bar',
      status: 'found',
      source: 'deezer',
      year: '1990',
      years: ['1990'],
    },
  ],
  a_revue: [
    {
      path: '/m/b.mp3',
      filename: 'b.mp3',
      artist: 'baz',
      title: 'qux',
      status: 'ambiguous',
      source: 'musicbrainz',
      year: null,
      years: ['2002', '2003'],
    },
    {
      path: '/m/c.mp3',
      filename: 'c.mp3',
      artist: 'naems',
      title: 'follow me',
      status: 'lax',
      source: 'itunes',
      year: '2024',
      years: ['2024'],
    },
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
    const cands = document
      .querySelectorAll('.years-card.years-review')[0]
      .querySelectorAll('.years-btn:not(.years-reject)');
    (cands[1] as HTMLElement).click(); // choisir 2003
    const chosen = document.querySelector('.years-btn.chosen');
    expect(chosen!.textContent).toBe('2003');
    // Aucun appel d'écriture : preview + reprise des choix (2 GET), jamais de POST.
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls.every(([, o]) => (o as RequestInit | undefined)?.method !== 'POST')).toBe(true);
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
    yearsMoveFocus(5); // borne haute
    expect(document.querySelectorAll('.years-card.years-review.focused').length).toBe(1);
    yearsMoveFocus(-9); // borne basse
    renderYears();
    // clamp bas : le focus revient sur la première carte visible
    const focused = document.querySelector('.years-card.years-review.focused') as HTMLElement;
    expect(focused.dataset.index).toBe('0');
  });

  it('close : retour page sync exclusive', async () => {
    await openYearsMode();
    closeYearsMode();
    expect(state.page).toBe('sync');
    expect(document.getElementById('years-layout')!.classList.contains('hidden')).toBe(true);
  });
});

/** Mock review GET → {} (session vierge) : la map de choix persiste entre
 * tests (module-level), la reprise la vide à chaque openYearsMode. */
function mockFreshSession(): void {
  api.mockImplementation((url: string) =>
    url === '/years/review' ? Promise.resolve({}) : Promise.resolve(JSON.parse(JSON.stringify(FIXTURE))),
  );
}

describe('yearsUI export (EPIC-033 P2)', () => {
  it('export : POST des choix (année + rejets) vers /years/review', async () => {
    mockFreshSession();
    await openYearsMode();
    // choisir 2003 sur la 1re carte, rejeter la 2e
    const cands = document
      .querySelectorAll('.years-card.years-review')[0]
      .querySelectorAll('.years-btn:not(.years-reject)');
    (cands[1] as HTMLElement).click();
    (document.querySelectorAll('.years-card.years-review')[1].querySelector('.years-reject') as HTMLElement).click();
    api.mockResolvedValue({ ok: true, count: 2 });
    const n = await exportChoices();
    expect(n).toBe(2);
    const [url, opts] = api.mock.calls[2]; // [0] preview, [1] reprise GET, [2] POST
    expect(url).toBe('/years/review');
    expect((opts as RequestInit).method).toBe('POST');
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.choices).toEqual({ 'baz\tqux': '2003', 'naems\tfollow me': null });
    expect(document.getElementById('status-text')!.textContent).toContain('2 choix exportés');
  });

  it('export sans choix : aucun appel, message', async () => {
    mockFreshSession();
    await openYearsMode();
    const n = await exportChoices();
    expect(n).toBe(0);
    expect(api.mock.calls.every(([, o]) => (o as RequestInit | undefined)?.method !== 'POST')).toBe(true);
    expect(document.getElementById('status-text')!.textContent).toContain('Aucun choix');
  });

  it("export échoué : statut d'erreur, pas de crash", async () => {
    mockFreshSession();
    await openYearsMode();
    (document.querySelector('.years-card.years-review .years-btn') as HTMLElement).click();
    api.mockRejectedValue(new Error('HTTP 500'));
    const n = await exportChoices();
    expect(n).toBe(-1);
    expect(document.getElementById('status-text')!.textContent).toContain('Export impossible');
  });

  it('reprise : les choix persistés marquent .chosen au rendu', async () => {
    api.mockImplementation((url: string) =>
      url === '/years/review'
        ? Promise.resolve({ 'baz\tqux': '2002', 'naems\tfollow me': null })
        : Promise.resolve(JSON.parse(JSON.stringify(FIXTURE))),
    );
    await openYearsMode();
    const chosen = document.querySelector('.years-btn.chosen');
    expect(chosen!.textContent).toBe('2002');
    // carte rejetée masquée à la reprise
    const cards = document.querySelectorAll('.years-card.years-review');
    expect(cards.length).toBe(1);
  });

  it("champ année libre : appliqué à la carte focusée à l'export (override)", async () => {
    mockFreshSession();
    await openYearsMode();
    (document.querySelectorAll('.years-card.years-review')[1] as HTMLElement).click();
    // clic = focus la carte lax (focusIndex = 1)
    const input = document.getElementById('years-year-input') as HTMLInputElement;
    input.value = '1999';
    input.dispatchEvent(new Event('input'));
    api.mockResolvedValue({ ok: true, count: 1 });
    await exportChoices();
    const body = JSON.parse((api.mock.calls[2][1] as { body: string }).body); // POST
    expect(body.choices['naems\tfollow me']).toBe('1999');
    expect(input.value).toBe(''); // champ vidé après usage
  });

  it("champ année sans focus : ignoré à l'export", async () => {
    mockFreshSession();
    await openYearsMode();
    const input = document.getElementById('years-year-input') as HTMLInputElement;
    input.value = '1999';
    input.dispatchEvent(new Event('input'));
    await exportChoices();
    expect(api.mock.calls.every(([, o]) => (o as RequestInit | undefined)?.method !== 'POST')).toBe(true); // rien à exporter, pas de POST
  });
});

describe('yearsUI filtre (EPIC-030 : chip F7/` sur la page Années)', () => {
  /** Pose un terme de filtre : state (source de vérité) + valeur de l'input.
   * (Le chemin « event input → debounce 150 ms → setFilterTerm » est couvert
   * par filterChip.test.ts — ici on teste le pipeline de rendu years.) */
  function typeFilter(term: string): void {
    setFilterTerm('years', term);
    const input = document.querySelector('.filter-chip[data-scope="years"] .filter-input') as HTMLInputElement;
    if (input) input.value = term;
    renderYears();
  }

  it('chip créé dans son slot, persistant à travers les re-renders', async () => {
    await openYearsMode();
    const chip = document.querySelector('.filter-chip[data-scope="years"]');
    expect(chip).not.toBeNull();
    // slot voisin précédent de la liste (hors DOM effacé)
    const slot = document.getElementById('filter-slot-years');
    expect(slot?.contains(chip as Node)).toBe(true);
    expect(slot?.nextElementSibling?.id).toBe('years-list');
    // re-render : le chip SURVIT (même nœud)
    renderYears();
    expect(document.querySelector('.filter-chip[data-scope="years"]')).toBe(chip);
  });

  it('terme appliqué : cartes certaines ET à revue filtrées, compteur affiché', async () => {
    mockFreshSession();
    await openYearsMode();
    typeFilter('foo');
    const cert = document.querySelectorAll('.years-card:not(.years-review)');
    const rev = document.querySelectorAll('.years-card.years-review');
    expect(cert.length).toBe(1); // foo — bar seulement
    expect(rev.length).toBe(0); // baz qux et naems follow me exclus
    const count = document.querySelector('.filter-chip[data-scope="years"] .filter-count');
    expect(count!.textContent).toBe('1/3'); // 1 certaine (dédupliquée) + 2 à revue
  });

  it('terme sans match : listes vides, compteur 0/N', async () => {
    mockFreshSession();
    await openYearsMode();
    typeFilter('inexistant');
    expect(document.querySelectorAll('.years-card').length).toBe(0);
    const count = document.querySelector('.filter-chip[data-scope="years"] .filter-count');
    expect(count!.textContent).toBe('0/3');
  });

  it('✕ efface et restaure la liste complète', async () => {
    mockFreshSession();
    await openYearsMode();
    typeFilter('baz');
    expect(document.querySelectorAll('.years-card.years-review').length).toBe(1);
    (document.querySelector('.filter-chip[data-scope="years"] .filter-clear') as HTMLElement).click();
    renderYears();
    expect(document.querySelectorAll('.years-card.years-review').length).toBe(2);
  });

  it('terme mémorisé dans state.filters : openYearsMode restaure le filtre', async () => {
    mockFreshSession();
    setFilterTerm('years', 'baz');
    await openYearsMode();
    const chipInput = document.querySelector('.filter-chip[data-scope="years"] .filter-input') as HTMLInputElement;
    expect(chipInput.value).toBe('baz');
    expect(document.querySelectorAll('.years-card.years-review').length).toBe(1);
    setFilterTerm('years', ''); // nettoyage inter-tests (state module-level)
  });

  it('yearsMoveFocus navigue dans l\u2019ordre VISIBLE (saute les hors-filtre)', async () => {
    mockFreshSession();
    await openYearsMode();
    // FIXTURE a_revue : [0]=baz qux (ambigu), [1]=naems follow me (lax)
    typeFilter('naems');
    yearsMoveFocus(1); // hors liste filtrée → entre par le début
    expect(document.querySelector('.years-card.years-review.focused')?.getAttribute('data-index')).toBe('1');
    yearsMoveFocus(-3); // clamp bas → reste sur la seule visible
    expect(document.querySelector('.years-card.years-review.focused')?.getAttribute('data-index')).toBe('1');
    setFilterTerm('years', '');
  });

  it('terme appliqué puis effacé : les rejetés restent masqués (2 mécanismes indépendants)', async () => {
    mockFreshSession();
    await openYearsMode();
    (document.querySelector('.years-card.years-review .years-reject') as HTMLElement).click();
    typeFilter('zzz');
    (document.querySelector('.filter-chip[data-scope="years"] .filter-clear') as HTMLElement).click();
    renderYears();
    expect(document.querySelectorAll('.years-card.years-review').length).toBe(1); // rejet toujours masqué
  });
});

describe('yearsUI player audio', () => {
  it('chaque carte (certaine + à revue) a un bouton ▶ vers togglePlay(path)', async () => {
    playingPath.mockReturnValue(null);
    await openYearsMode();
    const plays = document.querySelectorAll('.years-play');
    expect(plays.length).toBe(3); // 1 carte certaine dédupliquée + 2 cartes à revue (ambigu + lax)
    // la carte à revue porte le path du premier fichier de la clé
    const revBtn = document.querySelector('.years-card.years-review .years-play') as HTMLButtonElement;
    expect(revBtn.dataset.path).toBe('/m/b.mp3');
    // clic → togglePlay(filename, path, btn), sans focus de carte
    revBtn.click();
    expect(togglePlay).toHaveBeenCalledTimes(1);
    const [fn, path, btn] = togglePlay.mock.calls[0];
    expect(path).toBe('/m/b.mp3');
    expect(btn).toBe(revBtn);
    expect(fn).toMatch(/\.mp3$/);
  });

  it("bouton re-marqué ⏹ après re-render si c'est ce chemin qui joue", async () => {
    playingPath.mockReturnValue('/m/c.mp3');
    await openYearsMode();
    const btn = document.querySelector('.years-play[data-path="/m/c.mp3"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('playing')).toBe(true);
    expect(btn.textContent).toBe('⏹');
  });
});
