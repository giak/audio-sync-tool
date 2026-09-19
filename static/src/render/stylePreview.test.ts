// ─── Unit tests: render/stylePreview.ts — aperçu « e » (EPIC-035) ──────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DupMatch } from '../dupDetect.js';
import { state } from '../state.js';

const { copyFilesTo, confirmDialog, showToast } = vi.hoisted(() => ({
  copyFilesTo: vi.fn(),
  confirmDialog: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock('../actions.js', () => ({ copyFilesTo }));
vi.mock('../ui.js', () => ({ confirmDialog, showToast }));

import { applyRangementPlan, buildRangementPlan, formatPlan, openStylePreview } from './stylePreview.js';

const ROOT = '/src/style/';
const EPARS = '/media/epars';
const A = `${EPARS}/_techno/a.mp3`; // 1992
const B = `${EPARS}/_techno/b.mp3`; // 1993
const C = `${EPARS}/2008_08/c.mp3`; // sans année
const D = `${EPARS}/2008_08/d.mp3`; // 1996

function srcFiles() {
  const idx: Record<string, { path: string; year: string | null; duration: number | null; codec: string | null }> = {};
  for (const d of ['techno_1990', 'techno_acid_1990', 'hardcore_1995', 'italo_disco']) {
    idx[`${d}.mp3`] = { path: `${d}/${d}.mp3`, year: null, duration: null, codec: null };
  }
  return { [ROOT]: idx };
}

describe('render/stylePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML =
      '<div id="status-text"></div><div id="epars-status-line"></div><div id="epars-container"></div>';
    state.sourceFiles = srcFiles();
    state.sourceExtraDirs = new Set();
    state.eparsFiles = {
      [EPARS]: {
        'a.mp3': { path: '_techno/a.mp3', year: '1992', duration: null, codec: null },
        'b.mp3': { path: '_techno/b.mp3', year: '1993', duration: null, codec: null },
        'c.mp3': { path: '2008_08/c.mp3', year: null, duration: null, codec: null },
        'd.mp3': { path: '2008_08/d.mp3', year: '1996', duration: null, codec: null },
      },
    };
    state.dupMatches = new Map();
    state.styleChoices = new Map();
  });

  describe('buildRangementPlan', () => {
    it('groupe par dossier cible, trié par nom, avec exists', () => {
      state.styleChoices = new Map([
        [A, { style: 'techno_acid', tranche: null }],
        [B, { style: 'techno_acid', tranche: null }],
        [D, { style: 'hardcore', tranche: null }],
      ]);
      const plan = buildRangementPlan();
      expect(plan.groups.map(g => [g.dest.name, g.dest.exists, g.files.map(f => f.filename)])).toEqual([
        ['hardcore_1995', true, ['d.mp3']],
        ['techno_acid_1990', true, ['a.mp3', 'b.mp3']],
      ]);
      expect(plan.groups[1].files[0]).toEqual({ filename: 'a.mp3', eparDir: EPARS, fullpath: A });
      expect(plan.groups[0].dest.dir).toBe(`${ROOT}hardcore_1995`);
    });

    it('sans année (style daté) → noYear ; tranche forcée → groupe ; hors temps → groupe', () => {
      state.styleChoices = new Map([
        [C, { style: 'techno', tranche: null }],
        [D, { style: 'techno', tranche: 2020 }],
        [A, { style: 'italo_disco', tranche: null }],
      ]);
      const plan = buildRangementPlan();
      expect(plan.noYear).toEqual([C]);
      expect(plan.groups.map(g => [g.dest.name, g.dest.exists])).toEqual([
        ['italo_disco', true],
        ['techno_2020', false],
      ]);
    });

    it('jumeau déjà dans le dossier cible → twinInDest ; jumeau ailleurs → copié', () => {
      const twin = (src: string): DupMatch =>
        ({ eparsFullPath: '', sourceFullPath: src, eparsFilename: '', sourceFilename: '' }) as DupMatch;
      state.dupMatches = new Map([
        [A, twin(`${ROOT}techno_1990/a.mp3`)],
        [B, twin(`${ROOT}techno_acid_1990/b.mp3`)],
      ]);
      state.styleChoices = new Map([
        [A, { style: 'techno', tranche: null }],
        [B, { style: 'techno', tranche: null }],
      ]);
      const plan = buildRangementPlan();
      expect(plan.twinInDest).toEqual([A]);
      expect(plan.groups[0].files.map(f => f.fullpath)).toEqual([B]);
    });

    it('style inconnu → unknownStyle ; fichier disparu de l’index → ignoré', () => {
      state.styleChoices = new Map([
        [A, { style: 'polka', tranche: null }],
        ['/gone/x.mp3', { style: 'techno', tranche: null }],
      ]);
      const plan = buildRangementPlan();
      expect(plan.unknownStyle).toEqual([A]);
      expect(plan.groups).toEqual([]);
    });
  });

  it('formatPlan : une ligne par dossier + lignes d’exclusion', () => {
    state.styleChoices = new Map([
      [A, { style: 'techno_acid', tranche: null }],
      [B, { style: 'techno_acid', tranche: null }],
      [D, { style: 'techno', tranche: 2020 }],
      [C, { style: 'techno', tranche: null }],
    ]);
    expect(formatPlan(buildRangementPlan())).toBe(
      [
        '→ ➕ techno_2020 — 1 fichier (sera créé)', // tri par nom : '2' < 'a'
        '→ techno_acid_1990 — 2 fichiers',
        '⚠ 1 fichier sans année — ignorés (g puis chiffre pour trancher)',
      ].join('\n'),
    );
  });

  it('applyRangementPlan : copies séquentielles par dossier, choix copiés retirés, échecs conservés, toast + récap', async () => {
    state.styleChoices = new Map([
      [A, { style: 'techno_acid', tranche: null }],
      [B, { style: 'techno_acid', tranche: null }],
      [D, { style: 'hardcore', tranche: null }],
    ]);
    copyFilesTo.mockImplementation(async (dir: string, files: Array<{ fullpath: string }>) =>
      dir.endsWith('hardcore_1995') ? [] : files.map(f => f.fullpath).filter(fp => fp !== B),
    );
    const res = await applyRangementPlan(buildRangementPlan());
    expect(res).toEqual({ copied: 1, total: 3 });
    expect(copyFilesTo).toHaveBeenCalledTimes(2);
    expect(copyFilesTo.mock.calls[0][0]).toBe(`${ROOT}hardcore_1995`);
    expect(copyFilesTo.mock.calls[1][0]).toBe(`${ROOT}techno_acid_1990`);
    expect([...state.styleChoices.keys()].sort()).toEqual([B, D].sort());
    expect(showToast).toHaveBeenCalledWith('✓ 1/3 copié · 2 dossiers');
    expect(document.querySelector('#epars-status-line .s-style')?.textContent).toBe('🏷 2 assignés · e = aperçu');
  });

  describe('openStylePreview', () => {
    it('aucun choix → message, pas de dialog', () => {
      openStylePreview();
      expect(confirmDialog).not.toHaveBeenCalled();
      expect(document.getElementById('status-text')?.textContent).toContain('Aucun style');
    });

    it('choix mais rien de copiable → message explicite', () => {
      state.styleChoices = new Map([[C, { style: 'techno', tranche: null }]]);
      openStylePreview();
      expect(confirmDialog).not.toHaveBeenCalled();
      expect(document.getElementById('status-text')?.textContent).toContain('sans année');
    });

    it('plan non vide → confirmDialog(texte, apply, label avec le total) ; confirmation → copies', async () => {
      state.styleChoices = new Map([
        [A, { style: 'techno_acid', tranche: null }],
        [D, { style: 'hardcore', tranche: null }],
      ]);
      copyFilesTo.mockImplementation(async (_d: string, files: Array<{ fullpath: string }>) =>
        files.map(f => f.fullpath),
      );
      openStylePreview();
      expect(confirmDialog).toHaveBeenCalledTimes(1);
      const [msg, onConfirm, label] = confirmDialog.mock.calls[0] as [string, () => void, string];
      expect(msg).toContain('→ hardcore_1995 — 1 fichier');
      expect(label).toBe('Appliquer 2 copies');
      expect(copyFilesTo).not.toHaveBeenCalled(); // rien avant confirmation
      onConfirm();
      await new Promise(r => setTimeout(r, 0));
      expect(copyFilesTo).toHaveBeenCalledTimes(2);
      expect(state.styleChoices.size).toBe(0);
    });
  });
});
