// ─── Unit tests: render/stylePalette.ts — palette « g » (couche DOM) ───────
// EPIC-041 : le style ET l'année s'écrivent dans le tag TOUT DE SUITE
// (POST /styles/apply, /years/apply) et le popover montre les deux listes
// complètes (styles + années), sans étape cachée.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

const { focusItemByElement, navigateFocus } = vi.hoisted(() => ({
  focusItemByElement: vi.fn(),
  navigateFocus: vi.fn(),
}));
vi.mock('../focus.js', () => ({ focusItemByElement, navigateFocus }));

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../api.js', () => ({ api }));

import type { DupMatch } from '../dupDetect.js';
import { insertSourceStyleCell, insertStyleCell } from './styleCell.js';
import {
  alignStyleToFolder,
  closeStylePalette,
  isStylePaletteOpen,
  openStylePalette,
  YEAR_MAX,
  YEAR_MIN,
} from './stylePalette.js';

const ROOT = '/src/style/';
const EPARS = '/media/epars';
const A = `${EPARS}/_techno/a.mp3`; // année 1992
const B = `${EPARS}/2008_08/b.mp3`; // sans année
// Morceau DÉJÀ RANGÉ (Source Data) : tagué, jamais planifié — et son année de
// tag est fausse (cas réel : Phantasia « Inner Light » taggué 2024, sorti 1991).
// Convention de l'app : la racine est jointe TELLE QUELLE (`sourceTree`),
// slash final inclus → le fullpath porte un double slash.
const S = `${ROOT}/techno_1990/techno_1990-0.mp3`;
// Jumeau rangé de A (EPIC-028) — la forme réelle du chemin (double slash).
const TWIN = S;

function srcFiles() {
  const idx: Record<string, { path: string; year: string | null; duration: number | null; codec: string | null }> = {};
  const folders: Array<[string, number]> = [
    ['techno_1990', 5],
    ['techno_acid_1990', 3],
    ['hardcore_1995', 2],
    ['italo_disco', 1],
  ];
  for (const [d, n] of folders) {
    for (let i = 0; i < n; i++)
      idx[`${d}-${i}.mp3`] = { path: `${d}/${d}-${i}.mp3`, year: null, duration: null, codec: null };
  }
  return { [ROOT]: idx };
}

function row(fullpath: string, year: string | null): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'file-row';
  tr.dataset.focuspath = fullpath;
  for (const cls of ['play-btn', 'file', 'file-rating', 'year', 'codec', 'duration']) {
    const td = document.createElement('td');
    td.className = cls;
    if (cls === 'year') td.textContent = year ?? '';
    tr.appendChild(td);
  }
  insertStyleCell(tr, fullpath, { year });
  return tr;
}

function key(k: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  palette().dispatchEvent(ev);
  return ev;
}
function palette(): HTMLElement {
  return document.querySelector('.style-palette') as HTMLElement;
}
function lastCall(url: string) {
  return api.mock.calls.filter(c => c[0] === url).pop();
}

describe('render/stylePalette', () => {
  let rowA: HTMLTableRowElement;
  let rowB: HTMLTableRowElement;
  let rowS: HTMLTableRowElement;
  let docSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    api.mockImplementation((_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const targets: string[] = body.targets;
      return Promise.resolve({
        ok: true,
        written: targets.length,
        count: targets.length,
        results: targets.map(p => ({ path: p, ok: true })),
        style: body.style,
        year: body.year,
      });
    });
    document.body.innerHTML =
      '<div id="status-text"></div><div id="epars-status-line"></div>' +
      '<div id="epars-container"><table><tbody id="tb"></tbody></table></div>' +
      '<div id="source-container"><table><tbody id="tbs"></tbody></table></div>';
    state.sourceFiles = srcFiles();
    state.sourceFiles[ROOT]['techno_1990-0.mp3'].year = '2024'; // année fausse à corriger
    state.sourceExtraDirs = new Set();
    state.eparsFiles = {
      [EPARS]: {
        'a.mp3': { path: '_techno/a.mp3', year: '1992', duration: null, codec: null, genre: null },
        'b.mp3': { path: '2008_08/b.mp3', year: null, duration: null, codec: null, genre: null },
      },
    };
    state.styleChoices = new Map();
    rowA = row(A, '1992');
    rowB = row(B, null);
    rowS = row(S, '2024');
    document.getElementById('tb')!.append(rowA, rowB);
    document.getElementById('tbs')!.append(rowS);
    docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
  });

  afterEach(() => {
    closeStylePalette();
    document.removeEventListener('keydown', docSpy);
  });

  it('montre TOUT : tous les styles (nom + volume) ET toute la plage d’années', () => {
    openStylePalette([A], rowA);
    const labels = [...palette().querySelectorAll('.sp-style')].map(
      b => (b.querySelector('.sp-style-name') as HTMLElement).textContent,
    );
    expect(labels).toEqual(['techno', 'techno_acid', 'hardcore', 'italo_disco']);
    // EPIC-047 : plus de pavé de touche dans un bouton cliquable — le raccourci
    // reste actif, il vit dans le title (« touche t »).
    expect(palette().querySelector('.sp-style kbd')).toBeNull();
    expect(palette().querySelector('.sp-style')?.getAttribute('title')).toContain('touche t');
    const years = [...palette().querySelectorAll('.sp-year')].map(b => b.textContent);
    expect(years.length).toBe(YEAR_MAX - YEAR_MIN + 1);
    expect(years[0]).toBe(String(YEAR_MIN));
    expect(years.at(-1)).toBe(String(YEAR_MAX));
    // l'année du tag est repérée, le titre rappelle genre + année
    expect(palette().querySelector('.sp-year.current')?.textContent).toBe('1992');
    expect(palette().querySelector('.sp-title')?.textContent).toContain('année 1992');
  });

  it('style choisi → écriture IMMÉDIATE du tag (POST /styles/apply) puis rangement résolu', async () => {
    openStylePalette([A], rowA);
    key('a');
    expect(lastCall('/styles/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [A], style: 'techno_acid' }));
    await vi.waitFor(() => expect(palette()).toBeNull()); // fermé (année connue)
    expect(state.styleChoices.get(A)).toEqual({ style: 'techno_acid', tranche: 1990 });
    expect(state.eparsFiles[EPARS]['a.mp3'].genre).toBe('techno_acid');
    // le chip passe en « écrit » (✓) grâce à la mise à jour locale du genre
    expect(rowA.querySelector('.style-chip')?.textContent).toContain('✓ techno_acid');
    expect(navigateFocus).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('fichier SANS année : reste ouvert et le dit, sans bloquer le style', async () => {
    openStylePalette([B], rowB);
    key('t');
    await vi.waitFor(() => expect(palette()?.querySelector('.sp-dest')?.textContent).toContain('sans année'));
    expect(isStylePaletteOpen()).toBe(true);
    expect(palette().querySelector('.sp-years')?.classList.contains('needs-year')).toBe(true);
    expect(state.eparsFiles[EPARS]['b.mp3'].genre).toBe('techno');
  });

  it('année tapée (4 chiffres + Entrée) → écriture IMMÉDIATE + tranche déduite', async () => {
    openStylePalette([B], rowB);
    key('t');
    await vi.waitFor(() => expect(lastCall('/styles/apply')).toBeTruthy());
    key('1');
    key('9');
    key('9');
    key('1');
    expect(palette().querySelector('.sp-year.pending')?.textContent).toBe('1991');
    key('Enter');
    expect(lastCall('/years/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [B], year: '1991' }));
    await vi.waitFor(() => expect(palette()).toBeNull());
    // état local mis à jour : année écrite, tranche 1990 (palier), destination résolue
    expect(state.eparsFiles[EPARS]['b.mp3'].year).toBe('1991');
    expect(state.styleChoices.get(B)).toEqual({ style: 'techno', tranche: 1990 });
    expect(rowB.querySelector('td.year')?.textContent).toBe('1991');
    // tag écrit → la cellule passe au chip « écrit » (✓) et la destination est résolue
    expect((rowB.querySelector('.style-cell') as HTMLElement).title).toBe('→ techno_1990 · écrit dans le tag');
    expect(rowB.querySelector('.style-chip')?.textContent).toContain('✓ techno');
  });

  it('clic sur une année = même chemin que la saisie (et corrige une année fausse)', async () => {
    openStylePalette([A], rowA);
    (palette().querySelector('.sp-year[data-year="1991"]') as HTMLButtonElement).click();
    expect(lastCall('/years/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [A], year: '1991' }));
    await vi.waitFor(() => expect(state.eparsFiles[EPARS]['a.mp3'].year).toBe('1991'));
    expect(api.mock.calls.some(c => c[0] === '/styles/apply')).toBe(false); // aucun style demandé
  });

  it('échec d’écriture : signalé, le rangement n’est pas annulé', async () => {
    api.mockResolvedValueOnce({
      ok: false,
      written: 0,
      count: 1,
      results: [{ path: A, ok: false, error: 'hors des racines configurées' }],
    });
    openStylePalette([A], rowA);
    key('h');
    await vi.waitFor(() => expect(document.getElementById('status-text')?.textContent).toContain('hors des racines'));
    expect(state.styleChoices.get(A)?.style).toBe('hardcore');
  });

  it('lot : 2 cibles, tranche déduite des années écrites, pas de navigation', async () => {
    openStylePalette([A, B], rowA);
    expect(palette().querySelector('.sp-title')?.textContent).toBe('2 fichiers');
    key('h');
    await vi.waitFor(() => expect(palette()?.querySelector('.sp-dest')?.textContent).toContain('sans année'));
    key('1');
    key('9');
    key('9');
    key('0');
    key('Enter');
    await vi.waitFor(() => expect(palette()).toBeNull());
    expect(state.styleChoices.get(A)).toEqual({ style: 'hardcore', tranche: 1990 });
    expect(state.styleChoices.get(B)).toEqual({ style: 'hardcore', tranche: 1990 });
    expect(navigateFocus).not.toHaveBeenCalled();
  });

  it('Échap ferme sans rien écrire ; lettre inconnue ne ferme pas', () => {
    openStylePalette([A], rowA);
    key('z');
    expect(isStylePaletteOpen()).toBe(true);
    key('Escape');
    expect(isStylePaletteOpen()).toBe(false);
    expect(state.styleChoices.size).toBe(0);
    expect(api).not.toHaveBeenCalled();
  });

  it('Backspace efface la saisie d’année puis retire le choix de rangement', async () => {
    state.styleChoices = new Map([[A, { style: 'techno', tranche: null }]]);
    openStylePalette([A], rowA);
    key('1');
    key('9');
    key('Backspace'); // '19' → '1'
    expect(isStylePaletteOpen()).toBe(true); // la saisie est effacée, pas le choix
    key('Backspace'); // '1' → ''
    expect(state.styleChoices.has(A)).toBe(true);
    key('Backspace'); // buffer vide → retire le choix de rangement
    expect(state.styleChoices.has(A)).toBe(false);
    expect(isStylePaletteOpen()).toBe(false);
  });

  it('le défaut navigateur est annulé palette ouverte (F5 = rechargement !, Espace = scroll, Tab) sauf avec modificateur', () => {
    openStylePalette([A], rowA);
    for (const k of ['F5', ' ', 'Tab', 'ArrowDown', 'z']) {
      expect(key(k).defaultPrevented, k).toBe(true);
      expect(isStylePaletteOpen(), k).toBe(true);
    }
    const ctrlL = new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true, cancelable: true });
    palette().dispatchEvent(ctrlL);
    expect(ctrlL.defaultPrevented).toBe(false); // Ctrl+L, F12… restent au navigateur
    expect(docSpy).not.toHaveBeenCalled();
  });

  it('les touches de la palette n’atteignent jamais document (registry isolé)', async () => {
    openStylePalette([B], rowB);
    for (const k of ['z', 'ArrowDown', ' ', 'F5', 't', 'Tab']) key(k);
    expect(docSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(state.styleChoices.get(B)?.style).toBe('techno'));
  });

  it('clic sur un style = même chemin que la hotkey ; clic hors palette = fermeture', async () => {
    openStylePalette([A], rowA);
    (palette().querySelector('.sp-style[data-style="hardcore"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(api.mock.calls.some(c => c[0] === '/styles/apply')).toBe(true));
    openStylePalette([A], rowA);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(isStylePaletteOpen()).toBe(false);
  });

  it('sans taxonomie (aucune racine scannée) → message, rien d’ouvert', () => {
    state.sourceFiles = {};
    openStylePalette([A], rowA);
    expect(isStylePaletteOpen()).toBe(false);
    expect(document.getElementById('status-text')?.textContent).toContain('scan');
  });

  it('réouverture remplace la palette précédente (jamais deux popovers)', () => {
    openStylePalette([A], rowA);
    openStylePalette([B], rowB);
    expect(document.querySelectorAll('.style-palette').length).toBe(1);
    expect(palette().querySelector('.sp-title')?.textContent).toContain('b.mp3');
  });

  // ── EPIC-041 : cibles Source Data (morceau déjà rangé) ──────────────────

  it('morceau DÉJÀ RANGÉ : titre « Source Data », année du tag repérée, style écrit SANS choix de rangement', async () => {
    openStylePalette([S], rowS);
    expect(palette().querySelector('.sp-title')?.textContent).toContain('Source Data ·');
    expect(palette().querySelector('.sp-year.current')?.textContent).toBe('2024');
    key('t');
    expect(lastCall('/styles/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [S], style: 'techno' }));
    // le tag est écrit ; AUCUN choix de session (rien à planifier : déjà rangé)
    await vi.waitFor(() => expect(palette()).toBeNull());
    expect(state.styleChoices.size).toBe(0);
    expect(state.sourceFiles[ROOT]['techno_1990-0.mp3'].genre).toBe('techno');
  });

  it('morceau DÉJÀ RANGÉ : année corrigée dans le tag ET dans l’index source (cellule mise à jour)', async () => {
    openStylePalette([S], rowS);
    (palette().querySelector('.sp-year[data-year="1991"]') as HTMLButtonElement).click();
    expect(lastCall('/years/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [S], year: '1991' }));
    await vi.waitFor(() => expect(state.sourceFiles[ROOT]['techno_1990-0.mp3'].year).toBe('1991'));
    expect(rowS.querySelector('td.year')?.textContent).toBe('1991');
    expect(state.styleChoices.size).toBe(0);
    expect(api.mock.calls.some(c => c[0] === '/styles/apply')).toBe(false);
  });

  it('P2 : Entrée sur une suggestion unique accepte le style (écrit le tag)', async () => {
    openStylePalette([A], rowA);
    const hint = palette().querySelector('.sp-dest')?.textContent ?? '';
    expect(hint).toContain('techno');
    expect(hint).toContain('Entrée = accepter');
    key('Enter');
    expect(lastCall('/styles/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [A], style: 'techno' }));
    await vi.waitFor(() => expect(palette()).toBeNull());
    expect(state.styleChoices.get(A)).toEqual({ style: 'techno', tranche: 1990 });
  });

  // ── EPIC-050 : `g` sur un RANGÉ = alignement sur le dossier, sans palette ──

  it('alignStyleToFolder : écrit le style du dossier, marque la cellule ✓ et annonce l’annulation', async () => {
    // La ligne Source Data porte la cellule DÉDIÉE (`.source-style-cell`), celle
    // dont la référence est le dossier — c'est elle que l'utilisateur regardait
    // quand il disait « ça ne met toujours pas à jour ».
    const cellRow = row(S, '2024');
    cellRow.querySelector('.style-cell')?.remove();
    insertSourceStyleCell(cellRow, S, { year: '2024', genre: 'house' });
    document.getElementById('tbs')!.append(cellRow);
    const chip = () => cellRow.querySelector('.source-style-cell .style-chip');
    expect(chip()?.textContent).toContain('≠'); // disque ≠ dossier

    await alignStyleToFolder(S, 'techno');
    expect(lastCall('/styles/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [S], style: 'techno' }));
    expect(state.sourceFiles[ROOT]['techno_1990-0.mp3'].genre).toBe('techno');
    expect(chip()?.className).toContain('written');
    expect(chip()?.textContent).toContain('✓ techno');
    expect(document.getElementById('status-text')?.textContent).toContain('apply_styles.py --undo');
    expect(state.styleChoices.size).toBe(0); // rien à planifier : déjà rangé
  });

  // ── EPIC-051 P3 : `g` écrit la PAIRE complète (épars + jumeau rangé) ─────

  function twinOf(epars: string, source: string): DupMatch {
    return { eparsFullPath: epars, sourceFullPath: source, eparsFilename: '', sourceFilename: '' } as DupMatch;
  }

  it('P3 : g sur un épars avec jumeau rangé → le jumeau reçoit le MÊME style (une requête, deux tags)', async () => {
    state.dupMatches = new Map([[A, twinOf(A, TWIN)]]);
    openStylePalette([A], rowA);
    key('h'); // hardcore
    // les DEUX fullpaths partent dans la même requête (extension client, D3)
    expect(lastCall('/styles/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [A, TWIN], style: 'hardcore' }));
    await vi.waitFor(() => expect(palette()).toBeNull());
    // les deux index portent le genre — le morceau n'a pas deux tags
    expect(state.eparsFiles[EPARS]['a.mp3'].genre).toBe('hardcore');
    expect(state.sourceFiles[ROOT]['techno_1990-0.mp3'].genre).toBe('hardcore');
  });

  it('P3 : la divergence créée chez le jumeau reste VISIBLE (chip ≠, corrigeable par a)', async () => {
    state.dupMatches = new Map([[A, twinOf(A, TWIN)]]);
    // le jumeau est affiché avec sa cellule Source dédiée (référence = dossier)
    const cellRow = row(S, '2024');
    cellRow.querySelector('.style-cell')?.remove();
    insertSourceStyleCell(cellRow, S, { year: '2024', genre: null });
    document.getElementById('tbs')!.append(cellRow);
    openStylePalette([A], rowA);
    key('h'); // hardcore ≠ dossier techno_1990
    await vi.waitFor(() => expect(state.sourceFiles[ROOT]['techno_1990-0.mp3'].genre).toBe('hardcore'));
    // le chip du jumeau montre la divergence (dossier : techno · tag : hardcore)
    const chip = cellRow.querySelector('.source-style-cell .style-chip');
    expect(chip?.textContent).toBe('techno ≠');
    expect((chip?.parentElement as HTMLElement)?.title).toContain('hardcore');
  });

  it('P3 : g sur un RANGÉ ne s’étend pas (alignement sur le dossier, pas de propagation inverse)', async () => {
    state.dupMatches = new Map([[S, twinOf(A, S)]]);
    openStylePalette([S], rowS);
    key('t');
    expect(lastCall('/styles/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [S], style: 'techno' }));
    await vi.waitFor(() => expect(palette()).toBeNull());
    expect(state.eparsFiles[EPARS]['a.mp3'].genre).toBeNull(); // l'épars n'est pas touché
  });

  it('P3 : l’année suit la même extension de paire (un morceau a une année, pas deux)', async () => {
    state.dupMatches = new Map([[A, twinOf(A, TWIN)]]);
    openStylePalette([A], rowA);
    (palette().querySelector('.sp-year[data-year="1991"]') as HTMLButtonElement).click();
    expect(lastCall('/years/apply')?.[1]?.body).toBe(JSON.stringify({ targets: [A, TWIN], year: '1991' }));
    await vi.waitFor(() => expect(state.eparsFiles[EPARS]['a.mp3'].year).toBe('1991'));
    expect(state.sourceFiles[ROOT]['techno_1990-0.mp3'].year).toBe('1991');
  });

  it('P3 : jumeau absent du disque → signalé, le tag de l’épars reste écrit et le rangement suit', async () => {
    state.dupMatches = new Map([[A, twinOf(A, '/gone/x.mp3')]]);
    api.mockResolvedValueOnce({
      ok: false,
      written: 1,
      count: 2,
      results: [
        { path: A, ok: true },
        { path: '/gone/x.mp3', ok: false, error: 'fichier absent' },
      ],
    });
    openStylePalette([A], rowA);
    key('h');
    await vi.waitFor(() => expect(document.getElementById('status-text')?.textContent).toContain('fichier absent'));
    expect(state.eparsFiles[EPARS]['a.mp3'].genre).toBe('hardcore');
    expect(state.styleChoices.get(A)?.style).toBe('hardcore'); // D3 : l'échec d'un côté n'annule pas l'autre
  });

  it('alignStyleToFolder : échec du serveur → rien de marqué, le statut le dit', async () => {
    const cellRow = row(S, '2024');
    cellRow.querySelector('.style-cell')?.remove();
    insertSourceStyleCell(cellRow, S, { year: '2024', genre: 'house' });
    document.getElementById('tbs')!.append(cellRow);

    api.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, written: 0, count: 1, results: [{ path: S, ok: false, error: 'fichier absent' }] }),
    );
    await alignStyleToFolder(S, 'techno');
    expect(document.getElementById('status-text')?.textContent).toContain('fichier absent');
    expect(cellRow.querySelector('.source-style-cell .style-chip')?.className).not.toContain('written');
  });
});
