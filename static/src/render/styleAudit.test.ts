// ─── Unit tests: render/styleAudit.ts — alignement genre ↔ dossier (EPIC-044) ──
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../state.js';

const { api, choiceDialog, showError, showToast, setStatus } = vi.hoisted(() => ({
  api: vi.fn(),
  choiceDialog: vi.fn(() => true),
  showError: vi.fn(),
  showToast: vi.fn(),
  setStatus: vi.fn(),
}));
vi.mock('../api.js', () => ({ api }));
vi.mock('../core/feedback.js', () => ({ setStatus }));
vi.mock('../ui.js', () => ({ choiceDialog, showError, showToast }));

import {
  type AlignResult,
  alignLabels,
  alignNote,
  auditMessage,
  fetchGenreAudit,
  openGenreAudit,
  patchAlignedGenres,
  planCount,
} from './styleAudit.js';

const AUDIT = {
  ok: true,
  total: 1604,
  avec_style: 1604,
  alignes: 323,
  a_corriger: 1023,
  sans_genre: 258,
  hors_grammaire: 0,
  par_style: [
    { style: 'techno', a_corriger: 293, sans_genre: 92, total: 385 },
    { style: 'techno_acid', a_corriger: 267, sans_genre: 59, total: 326 },
    { style: 'trance', a_corriger: 112, sans_genre: 23, total: 135 },
    { style: 'hardcore', a_corriger: 85, sans_genre: 33, total: 118 },
  ],
  exemples: [{ path: '/src/techno_acid_2020/x.mp3', genre: 'Techno', style: 'techno_acid' }],
};

const ALIGN = (over: Partial<AlignResult> = {}): AlignResult => ({
  ok: true,
  mode: 'tous',
  dry_run: false,
  plan: 1281,
  written: [
    { path: '/src/style/techno_acid_1990/a.mp3', style: 'techno_acid', old: 'Techno', frame: 'TCON' },
    { path: '/src/style/techno_acid_1990/b.mp3', style: 'techno_acid', old: null, frame: 'TCON' },
  ],
  skipped: { deja: 0, non_vide: 0, absent: 0, extension: 0 },
  failed: [],
  failed_total: 0,
  by_style: { techno_acid: 2 },
  journal: 'style_apply_journal.jsonl',
  ...over,
});

const flush = () => new Promise(r => setTimeout(r, 0));

describe('render/styleAudit — textes (purs)', () => {
  it('planCount : « tous » = corriger + remplir, « vides » = les vides seuls', () => {
    expect(planCount(AUDIT, 'tous')).toBe(1281);
    expect(planCount(AUDIT, 'vides')).toBe(258);
  });

  // fr-FR : le séparateur de milliers est un espace (ordinaire, insécable ou
  // fine selon l'ICU de la plateforme) — on normalise pour comparer le NOMBRE.
  const norm = (s: string) => s.replace(/\s/g, ' ');

  it('le dialogue dit les deux nombres, la référence et les garde-fous', () => {
    const msg = norm(auditMessage(AUDIT));
    expect(msg).toContain("d'après le dernier scan");
    expect(msg).toContain('1 023');
    expect(msg).toContain('258');
    expect(msg).toContain('techno_acid_1990');
    expect(msg).toContain('Plus touchés : techno (385), techno_acid (326), trance (135).');
    expect(msg).toContain("L'année n'est pas touchée");
    expect(msg).toContain('--undo');
  });

  it('chaque bouton DIT son mode (aucun libellé vague)', () => {
    const l = alignLabels(AUDIT);
    expect(norm(l.tous)).toBe('Corriger 1 023 + remplir 258');
    expect(l.vides).toBe('Remplir seulement les 258 vides');
  });

  it('alignNote nomme les refus (non vide / absent / format) et les échecs', () => {
    const res = ALIGN({
      written: [ALIGN().written[0]],
      skipped: { deja: 4, non_vide: 3, absent: 7, extension: 11 },
      failed_total: 2,
    });
    const note = alignNote(res);
    expect(note).toContain('1 genre aligné');
    expect(note).toContain('3 déjà taggés sur le disque');
    expect(note).toContain('4 déjà au bon style');
    expect(note).toContain('7 absents du disque');
    expect(note).toContain('11 format non géré');
    expect(note).toContain('⚠ 2 échecs');
    expect(note).toContain('style_apply_journal.jsonl');
  });

  it('alignNote : variante vide (0 écrit) reste lisible', () => {
    const note = alignNote(ALIGN({ written: [], skipped: { deja: 0, non_vide: 258, absent: 0, extension: 0 } }));
    expect(note).toContain('0 genre aligné');
    expect(note).toContain('258 déjà taggés sur le disque');
  });
});

describe('render/styleAudit — état local', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    choiceDialog.mockReturnValue(true);
    state.sourceFiles = {
      '/src/style/': {
        'a.mp3': { path: 'techno_acid_1990/a.mp3', year: '1992', duration: null, codec: null, genre: 'Techno' },
        'z.mp3': { path: 'techno_acid_1990/z.mp3', year: null, duration: null, codec: null, genre: null },
      },
    };
  });

  it('patchAlignedGenres écrit le genre des rangés depuis la liste du SERVEUR', () => {
    const n = patchAlignedGenres([
      { path: '/src/style/techno_acid_1990/a.mp3', style: 'techno_acid', old: 'Techno', frame: 'TCON' },
      { path: '/src/style/techno_acid_1990/z.mp3', style: 'techno_acid', old: null, frame: 'TCON' },
    ]);
    expect(n).toBe(2);
    expect(state.sourceFiles['/src/style/']['a.mp3'].genre).toBe('techno_acid');
    expect(state.sourceFiles['/src/style/']['z.mp3'].genre).toBe('techno_acid');
  });

  it('patchAlignedGenres ignore un chemin hors des racines connues', () => {
    expect(patchAlignedGenres([{ path: '/ailleurs/x.mp3', style: 'techno', old: null, frame: null }])).toBe(0);
    expect(state.sourceFiles['/src/style/']['a.mp3'].genre).toBe('Techno');
  });
});

describe('render/styleAudit — flux (commande a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    choiceDialog.mockReturnValue(true);
    state.sourceFiles = {
      '/src/style/': {
        'a.mp3': { path: 'techno_acid_1990/a.mp3', year: '1992', duration: null, codec: null, genre: 'Techno' },
      },
    };
    api.mockImplementation(async (url: string) => {
      if (url === '/styles/audit') return AUDIT;
      if (url === '/styles/align') return ALIGN();
      throw new Error(`url inattendue ${url}`);
    });
  });

  it('ouvre le dialogue avec les deux modes, puis envoie le mode principal', async () => {
    await openGenreAudit();
    expect(api).toHaveBeenCalledWith('/styles/audit');
    expect(choiceDialog).toHaveBeenCalledTimes(1);
    const [msg, primary, secondary] = choiceDialog.mock.calls[0] as [
      string,
      { label: string; run: () => void },
      { label: string; run: () => void },
    ];
    expect(msg).toContain('contredisent leur dossier');
    expect(primary.label.replace(/\s/g, ' ')).toBe('Corriger 1 023 + remplir 258');
    expect(secondary.label).toBe('Remplir seulement les 258 vides');

    primary.run();
    await flush();
    expect(api).toHaveBeenCalledWith('/styles/align', {
      method: 'POST',
      body: JSON.stringify({ mode: 'tous' }),
    });
    expect(state.sourceFiles['/src/style/']['a.mp3'].genre).toBe('techno_acid');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('genres alignés'));
    expect(showError).not.toHaveBeenCalled();
  });

  it('la seconde action envoie le mode « vides » (conservateur)', async () => {
    await openGenreAudit();
    const secondary = (choiceDialog.mock.calls[0] as [string, { run: () => void }, { run: () => void }])[2];
    secondary.run();
    await flush();
    expect(api).toHaveBeenCalledWith('/styles/align', {
      method: 'POST',
      body: JSON.stringify({ mode: 'vides' }),
    });
  });

  it('rien à aligner : aucun dialogue, un statut qui le dit', async () => {
    api.mockImplementation(async () => ({ ...AUDIT, a_corriger: 0, sans_genre: 0 }));
    await openGenreAudit();
    expect(choiceDialog).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('Rien à aligner'));
  });

  it('des échecs d’écriture passent par showError, jamais par le toast', async () => {
    api.mockImplementation(async (url: string) =>
      url === '/styles/audit'
        ? AUDIT
        : ALIGN({ written: [], failed: [{ path: '/x.mp3', error: "relu 'Techno'" }], failed_total: 1 }),
    );
    await openGenreAudit();
    (choiceDialog.mock.calls[0] as [string, { run: () => void }])[1].run();
    await flush();
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('⚠ 1 échec'));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('template sans #dialog-alt : la perte de l’option est DITE', async () => {
    choiceDialog.mockReturnValue(false);
    await openGenreAudit();
    expect(setStatus).toHaveBeenLastCalledWith(expect.stringContaining('Template périmé'));
  });

  it('aperçu indisponible : erreur affichée, aucun dialogue', async () => {
    api.mockRejectedValue(new Error('500'));
    expect(await fetchGenreAudit()).toBeNull();
    await openGenreAudit();
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Aperçu impossible'));
    expect(choiceDialog).not.toHaveBeenCalled();
  });
});
