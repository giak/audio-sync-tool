// ─── Unit tests: render/styleCell.ts — cellule Style des lignes épars ──────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';
import { currentTaxonomy, destinationLabel, insertStyleCell, refreshStyleCell } from './styleCell.js';

// jsdom n'a pas scrollIntoView → stub sur Element.prototype (pattern connu, cf. dupsUI.test).
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = vi.fn();

const ROOT = '/src/style/';
const EPARS = '/media/epars';

function srcFiles() {
  const idx: Record<string, { path: string; year: string | null; duration: number | null; codec: string | null }> = {};
  for (const d of ['techno_1990', 'techno_acid_1990', 'techno_acid_2020', 'italo_disco', 'techno_percu_2005']) {
    idx[`${d}.mp3`] = { path: `${d}/${d}.mp3`, year: null, duration: null, codec: null };
  }
  return { [ROOT]: idx };
}

function makeRow(fullpath: string): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'file-row';
  tr.dataset.focuspath = fullpath;
  for (const cls of ['play-btn', 'file', 'file-rating', 'year', 'codec', 'duration']) {
    const td = document.createElement('td');
    td.className = cls;
    tr.appendChild(td);
  }
  return tr;
}

describe('render/styleCell', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="epars-container"><table><tbody id="tb"></tbody></table></div>';
    state.sourceFiles = srcFiles();
    state.sourceExtraDirs = new Set();
    state.eparsFiles = {
      [EPARS]: {
        'a.mp3': { path: '_techno/a.mp3', year: '1992', duration: null, codec: null },
        'b.mp3': { path: '2008_08/b.mp3', year: null, duration: null, codec: null },
      },
    };
    state.styleChoices = new Map();
  });

  it('insère td.style-cell juste avant .codec, vide sans choix', () => {
    const row = makeRow(`${EPARS}/_techno/a.mp3`);
    const td = insertStyleCell(row, `${EPARS}/_techno/a.mp3`, { year: '1992' });
    expect(td.nextElementSibling?.classList.contains('codec')).toBe(true);
    expect(td.previousElementSibling?.classList.contains('year')).toBe(true);
    expect(td.textContent).toBe('');
    expect(td.title).toBe('');
    expect(row.children.length).toBe(7);
  });

  it('avec choix : chip « chosen » + destination existante en tooltip', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    state.styleChoices = new Map([[fp, { style: 'techno_acid', tranche: null }]]);
    const td = insertStyleCell(makeRow(fp), fp, { year: '1992' });
    const chip = td.querySelector('.style-chip') as HTMLElement;
    expect(chip.classList.contains('chosen')).toBe(true);
    expect(chip.textContent).toBe('techno_acid');
    expect(td.title).toBe('→ techno_acid_1990');
  });

  it('style daté sans année → pending-year + tooltip explicite', () => {
    const fp = `${EPARS}/2008_08/b.mp3`;
    state.styleChoices = new Map([[fp, { style: 'techno_acid', tranche: null }]]);
    const td = insertStyleCell(makeRow(fp), fp, { year: null });
    expect(td.querySelector('.style-chip')?.classList.contains('pending-year')).toBe(true);
    expect(td.title).toContain('année manquante');
  });

  it('tranche forcée → destination calculée dessus ; dossier inexistant → ➕ sera créé', () => {
    const fp = `${EPARS}/2008_08/b.mp3`;
    state.styleChoices = new Map([[fp, { style: 'techno_percu', tranche: 2010 }]]);
    expect(destinationLabel(fp, { year: null })).toBe('→ ➕ techno_percu_2010 (sera créé)');
  });

  it('style hors temps → destination sans tranche même sans année', () => {
    const fp = `${EPARS}/2008_08/b.mp3`;
    state.styleChoices = new Map([[fp, { style: 'italo_disco', tranche: null }]]);
    expect(destinationLabel(fp, { year: null })).toBe('→ italo_disco');
  });

  it('style absent des dossiers actuels → tooltip honnête, pas d’exception', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    state.styleChoices = new Map([[fp, { style: 'polka', tranche: null }]]);
    expect(destinationLabel(fp, { year: '1992' })).toContain('style inconnu');
  });

  it('refreshStyleCell met à jour la cellule affichée en place (lecture de l’année via eparsFiles)', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    const row = makeRow(fp);
    insertStyleCell(row, fp, { year: '1992' });
    document.getElementById('tb')!.appendChild(row);
    expect(row.querySelector('.style-cell')!.textContent).toBe('');
    state.styleChoices = new Map([[fp, { style: 'techno', tranche: null }]]);
    refreshStyleCell(fp);
    expect(row.querySelector('.style-chip')?.textContent).toBe('techno');
    expect((row.querySelector('.style-cell') as HTMLElement).title).toBe('→ techno_1990');
    state.styleChoices = new Map();
    refreshStyleCell(fp);
    expect(row.querySelector('.style-chip')).toBeNull();
  });

  it('clic sur la cellule → ouvre la palette pour ce fichier (souris = même chemin que g)', async () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    const row = makeRow(fp);
    const td = insertStyleCell(row, fp, { year: '1992' });
    document.getElementById('tb')!.appendChild(row);
    td.click();
    const m = await import('./stylePalette.js');
    await new Promise(r => setTimeout(r, 0));
    expect(m.isStylePaletteOpen()).toBe(true);
    expect(document.querySelector('.style-palette .sp-title')?.textContent).toBe('a.mp3');
    m.closeStylePalette();
  });

  it('refreshStyleCell : ligne non affichée → no-op', () => {
    expect(() => refreshStyleCell('/nowhere/x.mp3')).not.toThrow();
  });

  it('currentTaxonomy est mémoïsée sur l’identité de sourceFiles et se recalcule après réaffectation', () => {
    const t1 = currentTaxonomy();
    expect(t1).toBe(currentTaxonomy());
    state.sourceFiles = { ...state.sourceFiles };
    expect(currentTaxonomy()).not.toBe(t1);
    expect(currentTaxonomy()!.styles.size).toBe(4);
  });
});
