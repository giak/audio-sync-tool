// ─── Unit tests: render/stylePalette.ts — palette « g » (couche DOM) ───────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

const { focusItemByElement, navigateFocus } = vi.hoisted(() => ({
  focusItemByElement: vi.fn(),
  navigateFocus: vi.fn(),
}));
vi.mock('../focus.js', () => ({ focusItemByElement, navigateFocus }));

import { insertStyleCell } from './styleCell.js';
import { closeStylePalette, isStylePaletteOpen, openStylePalette } from './stylePalette.js';

const ROOT = '/src/style/';
const EPARS = '/media/epars';
const A = `${EPARS}/_techno/a.mp3`; // année 1992
const B = `${EPARS}/2008_08/b.mp3`; // sans année

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

describe('render/stylePalette', () => {
  let rowA: HTMLTableRowElement;
  let rowB: HTMLTableRowElement;
  let docSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML =
      '<div id="status-text"></div><div id="epars-container"><table><tbody id="tb"></tbody></table></div>';
    state.sourceFiles = srcFiles();
    state.sourceExtraDirs = new Set();
    state.eparsFiles = {
      [EPARS]: {
        'a.mp3': { path: '_techno/a.mp3', year: '1992', duration: null, codec: null },
        'b.mp3': { path: '2008_08/b.mp3', year: null, duration: null, codec: null },
      },
    };
    state.styleChoices = new Map();
    rowA = row(A, '1992');
    rowB = row(B, null);
    document.getElementById('tb')!.append(rowA, rowB);
    docSpy = vi.fn();
    document.addEventListener('keydown', docSpy);
  });

  afterEach(() => {
    closeStylePalette();
    document.removeEventListener('keydown', docSpy);
  });

  it('ouvre un popover focusé listant les styles avec leur hotkey (t techno, a techno_acid, h hardcore, i italo_disco)', () => {
    openStylePalette([A], rowA);
    expect(isStylePaletteOpen()).toBe(true);
    expect(document.activeElement).toBe(palette());
    const labels = [...palette().querySelectorAll('.sp-style')].map(b => b.textContent);
    expect(labels).toEqual(['t techno', 'a techno_acid', 'h hardcore', 'i italo_disco']);
    expect(palette().querySelector('.sp-title')?.textContent).toBe('a.mp3');
  });

  it('lettre sur un fichier AVEC année → choix sans tranche, fermeture, focus rendu puis ligne suivante', () => {
    openStylePalette([A], rowA);
    key('a');
    expect(state.styleChoices.get(A)).toEqual({ style: 'techno_acid', tranche: null });
    expect(isStylePaletteOpen()).toBe(false);
    expect(rowA.querySelector('.style-chip')?.textContent).toBe('techno_acid');
    expect(focusItemByElement).toHaveBeenCalledWith(expect.anything(), rowA, { noHistory: true });
    expect(navigateFocus).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it('lettre sur un fichier SANS année (style daté) → étape tranche ; chiffre → tranche forcée', () => {
    openStylePalette([B], rowB);
    key('t');
    expect(isStylePaletteOpen()).toBe(true);
    expect(palette().classList.contains('tranche-step')).toBe(true);
    expect(palette().querySelector('.sp-dest')?.textContent).toContain('1 fichier sans année');
    key('3');
    expect(state.styleChoices.get(B)).toEqual({ style: 'techno', tranche: 1995 });
    expect(isStylePaletteOpen()).toBe(false);
    expect((rowB.querySelector('.style-cell') as HTMLElement).title).toBe('→ ➕ techno_1995 (sera créé)');
  });

  it('Enter à l’étape tranche → style seul (tranche null, chip pending-year)', () => {
    openStylePalette([B], rowB);
    key('t');
    key('Enter');
    expect(state.styleChoices.get(B)).toEqual({ style: 'techno', tranche: null });
    expect(rowB.querySelector('.style-chip')?.classList.contains('pending-year')).toBe(true);
  });

  it('style hors temps sur un fichier sans année → commit immédiat', () => {
    openStylePalette([B], rowB);
    key('i');
    expect(state.styleChoices.get(B)).toEqual({ style: 'italo_disco', tranche: null });
    expect(isStylePaletteOpen()).toBe(false);
  });

  it('lot : 2 cibles, tranche appliquée seulement au fichier sans année, pas de navigation', () => {
    openStylePalette([A, B], rowA);
    expect(palette().querySelector('.sp-title')?.textContent).toBe('2 fichiers');
    key('h');
    expect(isStylePaletteOpen()).toBe(true); // B n'a pas d'année
    key('2');
    expect(state.styleChoices.get(A)).toEqual({ style: 'hardcore', tranche: null });
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
  });

  it('Backspace retire le choix des cibles et ferme', () => {
    state.styleChoices = new Map([[A, { style: 'techno', tranche: null }]]);
    openStylePalette([A], rowA);
    key('Backspace');
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

  it('les touches de la palette n’atteignent jamais document (registry isolé)', () => {
    openStylePalette([B], rowB);
    for (const k of ['z', 'ArrowDown', ' ', 'F5', 't', 'Tab', '4']) key(k);
    expect(docSpy).not.toHaveBeenCalled();
    expect(state.styleChoices.get(B)).toEqual({ style: 'techno', tranche: 2000 });
  });

  it('clic sur un style = même chemin que la hotkey ; clic hors palette = fermeture', () => {
    openStylePalette([A], rowA);
    (palette().querySelector('.sp-style[data-style="hardcore"]') as HTMLButtonElement).click();
    expect(state.styleChoices.get(A)?.style).toBe('hardcore');
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
    expect(palette().querySelector('.sp-title')?.textContent).toBe('b.mp3');
  });
});
