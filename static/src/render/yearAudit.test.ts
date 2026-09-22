// ─── Unit tests: render/yearAudit.ts — revue des années DÉJÀ écrites ───────
// api.js mocké (GET /years/audit + POST /years/audit/review) et ui.js mocké :
// c'est le dialogue de confirmation du lot qu'on veut voir (texte + action),
// pas son rendu DOM (couvert par ui.test.ts).

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { api, choiceDialog, setStatus } = vi.hoisted(() => ({
  api: vi.fn(),
  choiceDialog: vi.fn(() => true),
  setStatus: vi.fn(),
}));
vi.mock('../api.js', () => ({ api }));
vi.mock('../audio.js', () => ({
  togglePlay: vi.fn(),
  playingPath: vi.fn(() => null),
  stopPlayer: vi.fn(),
  seekAudio: vi.fn(),
  isAudioPlaying: vi.fn(() => false),
  initAudioUI: vi.fn(),
}));
vi.mock('../core/feedback.js', () => ({ setStatus }));
vi.mock('../ui.js', () => ({ choiceDialog }));

import {
  auditSummary,
  batchMessage,
  evidenceLine,
  pendings,
  reasonsLine,
  refreshYearAudit,
  renderYearAudit,
  resetYearAudit,
  resultMessage,
  submitDecisions,
  type YearAuditData,
  type YearAuditItem,
} from './yearAudit.js';

// Formes RÉELLES de data/year_audit.json : `sources` = {source: année} et
// `evidence` = fiches de sortie en OBJETS (artist/title/album/release_date) —
// un fixture en chaînes avait laissé passer un `[object Object]` à l'écran.
const item = (over: Partial<YearAuditItem> = {}): YearAuditItem => ({
  path: '/src/1991/Inner Light.mp3',
  filename: 'Inner Light.mp3',
  applied: '2024',
  proposed: '1991',
  candidates: ['1991'],
  reason: 'une source « première sortie » dit 1991',
  variant: 'album',
  sources: { deezer: '2024', discogs: '1991' },
  evidence: [
    { artist: 'Phantasia', title: 'Inner Light', album: 'Inner Light', release_date: '1991-09-01' },
    { artist: 'Phantasia', title: 'Inner Light (Remaster)', release_date: '2024-01-01' },
  ],
  decision: null,
  ...over,
});

const AUDIT = (over: Partial<YearAuditData> = {}): YearAuditData => ({
  ok: true,
  files: 408,
  counts: { contredit: 2, a_revoir: 1, non_verifie: 339, confirme: 23, corriger: 0, garder: 0 },
  raisons: {
    'une seule source « édition » parle': 226,
    'aucune source ne parle': 100,
    'candidats sans corroboration': 13,
  },
  contredit: [
    item(),
    item({ path: '/src/1993/Other.mp3', filename: 'Other.mp3', proposed: '1992', candidates: ['1992'] }),
  ],
  a_revoir: [
    item({ path: '/src/1999/Doute.mp3', filename: 'Doute.mp3', proposed: null, candidates: ['1999', '2001'] }),
  ],
  non_verifie: [item({ path: '/x/1.mp3', filename: '1.mp3' })],
  confirme: [],
  ...over,
});

let list: HTMLElement;

function setupDom(): void {
  document.body.innerHTML = '<div id="years-list"></div><div id="status-text"></div>';
  list = document.getElementById('years-list') as HTMLElement;
  Element.prototype.scrollIntoView = vi.fn();
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDom();
  resetYearAudit();
  api.mockResolvedValue(AUDIT());
});

afterAll(() => {
  document.body.innerHTML = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('yearAudit — textes (purs)', () => {
  it('pendings : les items DÉCIDÉS sortent de la file', () => {
    const a = AUDIT();
    a.contredit[1].decision = { decision: 'garder' };
    a.a_revoir[0].decision = { decision: 'corriger', year: '1999' };
    expect(pendings(a).map(i => i.filename)).toEqual(['Inner Light.mp3']);
  });

  it('le bandeau dit l’état de la revue, compteurs et restants', () => {
    const line = auditSummary(AUDIT()).replace(/\s/g, ' ');
    expect(line).toContain('408 auditées');
    expect(line).toContain('2 contredites');
    expect(line).toContain('339 non vérifiées');
    expect(line).toContain('3 à trancher');
    const done = AUDIT();
    done.contredit = [];
    done.a_revoir = [];
    expect(auditSummary(done)).toContain('tout est tranché');
  });

  it('la ligne « pourquoi » met en forme sources et fiches (jamais [object Object])', () => {
    const line = evidenceLine(item());
    expect(line).not.toContain('[object Object]');
    expect(line).toContain('discogs 1991 · deezer 2024'); // trié par année
    expect(line).toContain('Phantasia — Inner Light · album « Inner Light », 1991-09-01');
    expect(evidenceLine(item({ sources: {}, evidence: [] }))).toBe('');
  });

  it('les non vérifiés sont des CLASSES (226 / 100 / 13), pas 339 lignes', () => {
    const line = reasonsLine(AUDIT()).replace(/\s/g, ' ');
    expect(line).toContain('339 sans verdict');
    expect(line).toContain('226 une seule source');
    expect(line).toContain('100 aucune source');
    // ordre décroissant : la classe la plus fréquente d'abord
    expect(line.indexOf('226')).toBeLessThan(line.indexOf('100'));
  });

  it('le lot annonce ce qu’il écrit, et le garde-fou d’annulation', () => {
    const items = AUDIT().contredit;
    const msg = batchMessage(items, 'corriger');
    expect(msg).toContain('Écrire 2 année(s) corrigée(s) ?');
    expect(msg).toContain('Inner Light.mp3 2024 → 1991');
    expect(msg).toContain('apply_years.py --undo restaure');
    const keep = batchMessage(items, 'garder');
    expect(keep).toContain('Garder 2 cas ?');
    expect(keep).toContain('Aucun tag n’est touché');
  });

  it('le crédit d’écriture nomme les corrections ET les refus', () => {
    const msg = resultMessage({
      ok: true,
      written: [{ path: '/a.mp3', old: '2024', year: '1991' }],
      kept: ['/b.mp3'],
      deja: [],
      failed: [{ path: '/c.mp3', error: 'fichier absent' }],
      reviewed: 3,
    });
    expect(msg).toContain('1 année(s) corrigée(s)');
    expect(msg).toContain('1 gardée(s)');
    expect(msg).toContain('1 refusée(s) — fichier absent');
    expect(msg).toContain('apply_years.py --undo restaure');
  });
});

describe('yearAudit — rendu dans la vue Années', () => {
  it('chaque item montre ce qui est écrit, la proposition et les candidates', async () => {
    await refreshYearAudit();
    renderYearAudit(list, () => {});
    const rows = list.querySelectorAll('.years-card.years-audit');
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('.years-badge')!.textContent).toBe('écrit 2024 → 1991');
    expect(rows[0].querySelector('.years-reason')!.textContent).toContain('discogs 1991 · deezer 2024');
    expect(rows[0].querySelector('.years-fix')!.textContent).toBe('✓ Corriger → 1991');
    // « à revoir » : pas de proposition, mais les candidates de l'audit
    const doute = rows[2].querySelectorAll('.years-btn');
    expect(rows[2].querySelector('.years-badge')!.textContent).toContain('à revoir');
    expect([...doute].map(b => b.textContent)).toEqual(['1999', '2001', '✓ Garder']);
  });

  it('un item déjà décidé n’est pas re-proposé', async () => {
    api.mockResolvedValue(
      AUDIT({
        contredit: [item({ decision: { decision: 'garder' } }), item({ path: '/b.mp3', filename: 'b.mp3' })],
        a_revoir: [],
      }),
    );
    await refreshYearAudit();
    renderYearAudit(list, () => {});
    expect(list.querySelectorAll('.years-card.years-audit').length).toBe(1);
    expect(list.querySelector('.years-audit')!.textContent).toContain('b.mp3');
  });

  it('cliquer « Corriger » envoie LA décision et relit l’audit', async () => {
    const onChange = vi.fn();
    await refreshYearAudit();
    api.mockClear();
    api.mockResolvedValue({
      ok: true,
      written: [{ path: '/src/1991/Inner Light.mp3' }],
      kept: [],
      deja: [],
      failed: [],
      reviewed: 1,
    });
    renderYearAudit(list, onChange);
    (list.querySelector('.years-fix') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0));
    const [url, opts] = api.mock.calls[0];
    expect(url).toBe('/years/audit/review');
    expect(JSON.parse((opts as { body: string }).body)).toEqual({
      decisions: [{ path: '/src/1991/Inner Light.mp3', action: 'corriger', year: '1991' }],
    });
    expect(String(setStatus.mock.calls[0][0])).toContain('1 année(s) corrigée(s)');
    // le serveur est relu (jamais de re-dérivation locale) et la page se redessine
    expect(api.mock.calls[1][0]).toBe('/years/audit');
    expect(onChange).toHaveBeenCalled();
  });

  it('une candidate de l’audit est écrivable (le moteur n’a pas toujours raison)', async () => {
    await refreshYearAudit();
    api.mockClear();
    api.mockResolvedValue({ ok: true, written: [{ path: '/b.mp3' }], kept: [], deja: [], failed: [], reviewed: 1 });
    renderYearAudit(list, () => {});
    // 1re ligne : la candidate « 1991 » EST la proposition → rien à cliquer ;
    // on prend la 3e ligne (« à revoir », candidates 1999/2001).
    const rows = list.querySelectorAll('.years-card.years-audit');
    (rows[2].querySelectorAll('.years-btn')[1] as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0));
    expect(JSON.parse((api.mock.calls[0][1] as { body: string }).body)).toEqual({
      decisions: [{ path: '/src/1999/Doute.mp3', action: 'corriger', year: '2001' }],
    });
  });

  it('« Garder » ne demande aucun dialogue et ne touche à rien', async () => {
    await refreshYearAudit();
    api.mockClear();
    api.mockResolvedValue({
      ok: true,
      written: [],
      kept: ['/src/1991/Inner Light.mp3'],
      deja: [],
      failed: [],
      reviewed: 1,
    });
    renderYearAudit(list, () => {});
    // le « Garder » d'une LIGNE (le premier .years-keep du DOM est celui du lot)
    (list.querySelector('.years-card.years-audit .years-keep') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0));
    expect(choiceDialog).not.toHaveBeenCalled();
    expect(JSON.parse((api.mock.calls[0][1] as { body: string }).body)).toEqual({
      decisions: [{ path: '/src/1991/Inner Light.mp3', action: 'garder' }],
    });
    expect(String(setStatus.mock.calls[0][0])).toContain('1 gardée(s)');
  });

  it('le lot entier passe par le dialogue de confirmation', async () => {
    await refreshYearAudit();
    renderYearAudit(list, () => {});
    const batch = list.querySelectorAll('.years-cands')[0].querySelectorAll('.years-btn');
    expect([...batch].map(b => b.textContent)).toEqual(['✓ Corriger les 2 proposées', '✓ Garder les 3']);
    (batch[0] as HTMLElement).click();
    expect(choiceDialog).toHaveBeenCalledTimes(1);
    expect(choiceDialog.mock.calls[0][0]).toContain('Écrire 2 année(s) corrigée(s) ?'); // le message d'abord
    api.mockClear();
    api.mockResolvedValue({
      ok: true,
      written: [{ path: '/a' }, { path: '/b' }],
      kept: [],
      deja: [],
      failed: [],
      reviewed: 2,
    });
    (choiceDialog.mock.calls[0][1] as { run: () => void }).run();
    await new Promise(r => setTimeout(r, 0));
    const decisions = JSON.parse((api.mock.calls[0][1] as { body: string }).body).decisions;
    expect(decisions).toEqual([
      { path: '/src/1991/Inner Light.mp3', action: 'corriger', year: '1991' },
      { path: '/src/1993/Other.mp3', action: 'corriger', year: '1992' },
    ]);
  });

  it('« Garder les N » sort TOUTE la file (y compris les sans-proposition)', async () => {
    await refreshYearAudit();
    renderYearAudit(list, () => {});
    (list.querySelectorAll('.years-cands')[0].querySelectorAll('.years-btn')[1] as HTMLElement).click();
    api.mockClear();
    api.mockResolvedValue({ ok: true, written: [], kept: ['/a', '/b', '/c'], deja: [], failed: [], reviewed: 3 });
    (choiceDialog.mock.calls[0][1] as { run: () => void }).run();
    await new Promise(r => setTimeout(r, 0));
    expect(JSON.parse((api.mock.calls[0][1] as { body: string }).body).decisions).toEqual([
      { path: '/src/1991/Inner Light.mp3', action: 'garder' },
      { path: '/src/1993/Other.mp3', action: 'garder' },
      { path: '/src/1999/Doute.mp3', action: 'garder' },
    ]);
  });

  it('tout est tranché : plus de lot ni de lignes, mais un mot sur l’état', async () => {
    api.mockResolvedValue(
      AUDIT({
        contredit: [],
        a_revoir: [],
        counts: { contredit: 0, a_revoir: 0, non_verifie: 339, confirme: 23, corriger: 38, garder: 8 },
      }),
    );
    await refreshYearAudit();
    renderYearAudit(list, () => {});
    expect(list.querySelectorAll('.years-card.years-audit').length).toBe(0);
    expect(list.querySelector('.years-empty')!.textContent).toContain('38 corrigée(s), 8 gardée(s)');
    // les non vérifiés restent expliqués : c'est la raison d'être de la section
    expect(list.textContent).toContain('339 sans verdict');
  });

  it('écriture refusée : le statut dit pourquoi, la page ne se redessine pas', async () => {
    const onChange = vi.fn();
    await refreshYearAudit();
    renderYearAudit(list, onChange);
    api.mockRejectedValue(new Error('HTTP 500'));
    (list.querySelector('.years-fix') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0));
    expect(String(setStatus.mock.calls.at(-1)![0])).toContain('Revue impossible');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pas d’audit : la section n’existe pas (vue Années inchangée)', async () => {
    // route absente (process pas redémarré) ou fichier pas encore produit
    api.mockRejectedValue(new Error('404'));
    await refreshYearAudit();
    expect(await submitDecisions([])).toBeNull();
    expect(setStatus).toHaveBeenCalled();
    resetYearAudit();
    renderYearAudit(list, () => {});
    expect(list.innerHTML).toBe('');
  });

  it('corps inattendu : traité comme absent (une page ne casse pas)', async () => {
    api.mockResolvedValue({ ok: true, files: 3 } as unknown as YearAuditData);
    await refreshYearAudit();
    renderYearAudit(list, () => {});
    expect(list.innerHTML).toBe('');
  });
});
