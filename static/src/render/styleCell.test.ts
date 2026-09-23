// ─── Unit tests: render/styleCell.ts — cellule Style des lignes épars ──────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';
import {
  currentTaxonomy,
  destinationLabel,
  insertSourceStyleCell,
  insertStyleCell,
  refreshSourceStyleCells,
  refreshStyleCell,
  sourceStyleOf,
} from './styleCell.js';

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

  it('insère td.style-cell juste avant .codec ; sans choix : suggestion ou vide', () => {
    const row = makeRow(`${EPARS}/_techno/a.mp3`);
    const td = insertStyleCell(row, `${EPARS}/_techno/a.mp3`, { year: '1992' });
    expect(td.nextElementSibling?.classList.contains('codec')).toBe(true);
    expect(td.previousElementSibling?.classList.contains('year')).toBe(true);
    // _techno → segment 'techno' aliasé → suggestion 'techno' (confiance > seuil)
    const chip = td.querySelector('.style-chip');
    expect(chip).not.toBeNull();
    expect(chip?.classList.contains('suggested')).toBe(true);
    expect(chip?.textContent).toBe('techno');
    expect(row.children.length).toBe(7);
  });

  it('fichier sans segment aliasé → cellule vide sans choix', () => {
    const row = makeRow(`${EPARS}/diverse/a.mp3`);
    const td = insertStyleCell(row, `${EPARS}/diverse/a.mp3`, { year: '1992' });
    expect(td.textContent).toBe('');
    expect(td.title).toBe('');
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

  it('P3 : genre du scan == style choisi → chip « écrit » (✓ vert)', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    state.styleChoices = new Map([[fp, { style: 'techno_acid', tranche: null }]]);
    const td = insertStyleCell(makeRow(fp), fp, { year: '1992', genre: 'techno_acid' });
    const chip = td.querySelector('.style-chip') as HTMLElement;
    expect(chip.classList.contains('written')).toBe(true);
    expect(chip.textContent).toBe('✓ techno_acid');
    expect(td.title).toContain('écrit dans le tag');
  });

  it('P3 : genre différent du style → pas « écrit » (chosen normal)', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    state.styleChoices = new Map([[fp, { style: 'techno_acid', tranche: null }]]);
    const td = insertStyleCell(makeRow(fp), fp, { year: '1992', genre: 'Blues' });
    const chip = td.querySelector('.style-chip') as HTMLElement;
    expect(chip.classList.contains('written')).toBe(false);
    expect(chip.textContent).toBe('techno_acid');
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

  it('refreshStyleCell met à jour la cellule affichée en place', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    const row = makeRow(fp);
    insertStyleCell(row, fp, { year: '1992' });
    document.getElementById('tb')!.appendChild(row);
    // _techno → suggestion 'techno' (segment aliasé)
    expect(row.querySelector('.style-chip.suggested')?.textContent).toBe('techno');
    state.styleChoices = new Map([[fp, { style: 'techno', tranche: null }]]);
    refreshStyleCell(fp);
    expect(row.querySelector('.style-chip.chosen')?.textContent).toBe('techno');
    expect((row.querySelector('.style-cell') as HTMLElement).title).toBe('→ techno_1990');
    state.styleChoices = new Map();
    refreshStyleCell(fp);
    // Retiré le choix → retour à la suggestion (_techno → 'techno')
    expect(row.querySelector('.style-chip.suggested')?.textContent).toBe('techno');
  });

  // ── EPIC-051 P3 (D4) : chip NEUTRE — le genre écrit reste visible sans choix ──

  it('P3 : genre écrit sans choix de session → chip neutre (le réel, pas la suggestion)', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    const td = insertStyleCell(makeRow(fp), fp, { year: '1992', genre: 'hardcore' });
    const chip = td.querySelector('.style-chip') as HTMLElement;
    expect(chip.classList.contains('written-neutral')).toBe(true);
    expect(chip.textContent).toBe('hardcore');
    expect(td.title).toBe('écrit dans le tag : hardcore');
  });

  it('P3 : après retrait du choix (aperçu e) le chip neutre remplace le « choisi » — le tag ne disparaît plus', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    const row = makeRow(fp);
    insertStyleCell(row, fp, { year: '1992', genre: null });
    document.getElementById('tb')!.appendChild(row);
    state.styleChoices = new Map([[fp, { style: 'techno', tranche: null }]]);
    refreshStyleCell(fp);
    expect(row.querySelector('.style-chip.chosen')?.textContent).toBe('techno');
    // l'aperçu `e` retire le choix au moment où le tag vient d'être écrit :
    state.styleChoices = new Map();
    state.eparsFiles[EPARS]['a.mp3'].genre = 'techno';
    refreshStyleCell(fp);
    const chip = row.querySelector('.style-chip') as HTMLElement;
    expect(chip.classList.contains('written-neutral')).toBe(true);
    expect(chip.textContent).toBe('techno');
  });

  it('P3 : sans choix ni genre → suggestion (comportement inchangé)', () => {
    const fp = `${EPARS}/_techno/a.mp3`;
    const td = insertStyleCell(makeRow(fp), fp, { year: '1992' });
    expect(td.querySelector('.style-chip.suggested')).not.toBeNull();
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
    // EPIC-041 : le titre rappelle aussi le genre et l'année du tag (on voit tout)
    expect(document.querySelector('.style-palette .sp-title')?.textContent).toBe('a.mp3 — genre « — » · année 1992');
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

// ── EPIC-046 : cellule Style des lignes SOURCE DATA ──────────────────────
// Signalement vérifié : la copie écrivait bien le tag des DEUX côtés (journal
// + relecture mutagen), mais la colonne Source Data n'avait aucune case où le
// lire — et `g` sur un rangé n'avait donc rien à montrer.
describe('render/styleCell — colonne Style de Source Data (EPIC-046)', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="source-container"><table class="file-table has-style"><tbody id="tbs"></tbody></table></div>';
    state.sourceFiles = {
      [ROOT]: {
        'a.mp3': { path: 'techno_acid_1990/a.mp3', year: '1990', duration: null, codec: null, genre: 'techno_acid' },
        'b.mp3': { path: 'techno_acid_1990/b.mp3', year: '1990', duration: null, codec: null, genre: 'Techno' },
        'c.mp3': { path: 'hors_grammaire/c.mp3', year: null, duration: null, codec: null, genre: null },
      },
    };
  });

  it('déclare le style par le DOSSIER (1ᵉʳ segment relatif à la racine)', () => {
    expect(sourceStyleOf(`${ROOT}techno_acid_1990/a.mp3`)).toBe('techno_acid');
    expect(sourceStyleOf(`${ROOT}_trash/a.mp3`)).toBeNull();
    expect(sourceStyleOf(`${ROOT}2008_08/a.mp3`)).toBeNull();
    expect(sourceStyleOf('/ailleurs/a.mp3')).toBeNull();
  });

  it('trois états, un mot : accord ✓, divergence ≠, tag vide ?', () => {
    const mk = (name: string) => {
      const tr = makeRow(`${ROOT}techno_acid_1990/${name}`);
      for (const cls of ['play-btn', 'file', 'file-rating', 'year', 'codec', 'duration']) {
        if (!tr.querySelector(`.${cls}`)) {
          const td = document.createElement('td');
          td.className = cls;
          tr.appendChild(td);
        }
      }
      document.getElementById('tbs')!.appendChild(tr);
      return tr;
    };
    const entry = (name: string) => ({ year: '1990', genre: state.sourceFiles[ROOT][name].genre });

    const ok = mk('a.mp3');
    insertSourceStyleCell(ok, `${ROOT}techno_acid_1990/a.mp3`, entry('a.mp3'));
    expect(ok.querySelector('.style-chip')?.textContent).toBe('✓ techno_acid');
    expect(ok.querySelector('.style-chip')?.classList.contains('written')).toBe(true);

    const diff = mk('b.mp3');
    insertSourceStyleCell(diff, `${ROOT}techno_acid_1990/b.mp3`, entry('b.mp3'));
    const chipDiff = diff.querySelector('.style-chip');
    expect(chipDiff?.textContent).toBe('techno_acid ≠');
    expect(chipDiff?.classList.contains('divergent')).toBe(true);
    expect((chipDiff?.parentElement as HTMLElement).title).toContain('tag : Techno');

    const empty = mk('a.mp3');
    insertSourceStyleCell(empty, `${ROOT}techno_acid_1990/a.mp3`, { year: '1990', genre: null });
    expect(empty.querySelector('.style-chip')?.textContent).toBe('techno_acid ?');
    expect(empty.querySelector('.style-chip')?.classList.contains('missing')).toBe(true);
  });

  it('dossier hors grammaire → colonne vide (aucune cible inventée)', () => {
    const tr = makeRow(`${ROOT}2008_08/c.mp3`);
    insertSourceStyleCell(tr, `${ROOT}2008_08/c.mp3`, { year: null, genre: null });
    expect(tr.querySelector('.style-chip')).toBeNull();
  });

  it('refreshSourceStyleCells patche la ligne après une écriture (g sur un rangé)', () => {
    const tr = makeRow(`${ROOT}techno_acid_1990/b.mp3`);
    document.getElementById('tbs')!.appendChild(tr);
    insertSourceStyleCell(tr, `${ROOT}techno_acid_1990/b.mp3`, { year: '1990', genre: 'Techno' });
    expect(tr.querySelector('.style-chip')?.textContent).toBe('techno_acid ≠');
    // le tag vient d'être écrit dans l'index (setGenreLocally) → la cellule doit suivre
    state.sourceFiles[ROOT]['b.mp3'].genre = 'techno_acid';
    refreshSourceStyleCells([`${ROOT}techno_acid_1990/b.mp3`]);
    expect(tr.querySelector('.style-chip')?.textContent).toBe('✓ techno_acid');
  });

  // ── EPIC-050 : la FORME RÉELLE du chemin (racine avec slash final) ────────
  // La config réelle porte `source_data = …/select/style/` : le chemin joint est
  // `…/style//techno_acid_1990/a.mp3`. Avant le pliage des slashes, la fonction
  // rendait null sur cette forme — donc AUCUNE cellule Style et aucun alignement
  // `g` chez l'utilisateur, alors que le bac à sable (racine sans slash) marchait.

  it('racine avec slash final : le double slash ne casse ni la cellule ni le style', () => {
    expect(sourceStyleOf('/src/style//techno_acid_1990/a.mp3')).toBe('techno_acid');
    expect(sourceStyleOf('/src/style//2008_08/a.mp3')).toBeNull();
    const tr = makeRow('/src/style//techno_acid_1990/a.mp3');
    insertSourceStyleCell(tr, '/src/style//techno_acid_1990/a.mp3', { year: '1990', genre: 'techno_acid' });
    expect(tr.querySelector('.style-chip')?.textContent).toBe('✓ techno_acid');
  });
});
