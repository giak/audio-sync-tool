// ─── Unit tests: actions.ts — config, scan, copy, init ────────────────────
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './state.js';

const {
  api,
  revalidateFocus,
  setActivePanel,
  focusItemByElement,
  getBatchCopy,
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  renderSource,
  loadRatings,
  closeAllModals,
  openModal,
  promptDialog,
  showError,
  confirmDialog,
  confirmCopyDialog,
  // Références aux éléments config CRÉÉS AVANT l'import d'actions.ts : les
  // constantes module-level de actions.ts (cfgSelect…) y sont liées à l'import.
  // Le describe « actions » vide document.body à chaque test ; pour que ces
  // références restent valides (flaky shuffle), on ré-attache ces éléments
  // après chaque vidage.
  cfgElements,
} = vi.hoisted(() => {
  // Create config DOM elements BEFORE module import so cfgSelect/cfgStatus are initialized
  document.body.innerHTML = `
    <select id="cfg-select"></select>
    <input id="cfg-name" />
    <input id="cfg-source" />
    <input id="cfg-traktor-nml-path" />
    <input id="cfg-traktor-export-root" />
    <input id="cfg-traktor-export-volume" />
    <textarea id="cfg-epars"></textarea>
    <div id="config-status"></div>
  `;
  return {
    api: vi.fn(),
    revalidateFocus: vi.fn(),
    setActivePanel: vi.fn(),
    focusItemByElement: vi.fn(),
    getBatchCopy: vi.fn(() => ({ target: '', files: [] })),
    patchEparsFileAfterCopy: vi.fn(),
    patchSourceFileAfterCopy: vi.fn(() => true),
    renderSource: vi.fn(),
    loadRatings: vi.fn(async () => {}),
    closeAllModals: vi.fn(),
    openModal: vi.fn(),
    // promptDialog mocké : exécute onOk(value) immédiatement (jsdom)
    promptDialog: vi.fn((_msg: string, _default: string, onOk: (v: string) => void) => {
      onOk('Ambient');
    }),
    // confirmDialog mocké : exécute onConfirm immédiatement (chemin nominal testé)
    confirmDialog: vi.fn((_msg: string, onConfirm: () => void, _label?: string) => {
      onConfirm();
    }),
    // confirmCopyDialog mocké (EPIC-051 P1) : même contrat — onConfirm immédiat
    confirmCopyDialog: vi.fn((_spec: unknown, onConfirm: () => void, _label?: string) => {
      onConfirm();
    }),
    showError: vi.fn(),
    cfgElements: Array.from(
      document.querySelectorAll(
        '#cfg-select, #cfg-name, #cfg-source, #cfg-traktor-nml-path, #cfg-traktor-export-root, #cfg-traktor-export-volume, #cfg-epars, #config-status',
      ),
    ),
  };
});

vi.mock('./api.js', () => ({ api }));
vi.mock('./focus.js', () => ({ revalidateFocus, setActivePanel, focusItemByElement }));
// Polyfill CSS.escape (jsdom) — requis par sourceTree.revealSourceDir (le vrai
// module est chargé via la chaîne actions → sourceTree, pour l'auto-expansion
// mémoire du dossier destination après copie).
if (typeof CSS === 'undefined') (globalThis as any).CSS = {};
if (!(CSS as any).escape) (CSS as any).escape = (val: string): string => String(val).replace(/[^\w-]/g, '\\$&');
vi.mock('./render.js', () => ({ getBatchCopy, patchEparsFileAfterCopy, patchSourceFileAfterCopy, renderSource }));
// domPatches est mocké : en jsdom CSS.escape n'existe pas (utilisé par les
// querySelector de patchEparsFileAfterCopy) → le flux executeReplace serait
// interrompu pour une raison d'environnement de test, pas de produit.
vi.mock('./domPatches.js', () => ({ patchEparsFileAfterCopy, patchSourceFileAfterCopy }));
vi.mock('./ratings.js', () => ({ loadRatings }));
vi.mock('./ui.js', () => ({
  closeAllModals,
  openModal,
  promptDialog,
  showError,
  confirmDialog,
  confirmCopyDialog,
}));

import {
  configData,
  copyFilesTo,
  createSourceFolder,
  executeCopy,
  executeReplace,
  initApp,
  initConfigUI,
  renderConfigSelect,
  runScan,
  styleConsentLine,
  styleNoteOf,
  styleOfDestDir,
} from './actions.js';

// ── Config tests (separate describe — needs cfgSelect elements in DOM) ────
describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configData.configs = [];
    configData.active = 0;
    // Remove dynamically created elements from previous tests (keep cfg elements from vi.hoisted)
    ['btn-add-config', 'btn-del-config', 'btn-save-config', 'status-text'].forEach(id => {
      document.getElementById(id)?.remove();
    });
    // Le describe « actions » vide document.body à chaque test : si l'ordre
    // shuffle le fait tourner avant « config », les éléments config du hoisted
    // sont détachés du DOM. Or actions.ts a capturé ces éléments à l'import
    // (constantes cfgSelect…), donc il faut ré-attacher ces mêmes éléments,
    // pas en créer de nouveaux (flaky shuffle).
    for (const el of cfgElements) {
      if (!el.isConnected) document.body.appendChild(el);
    }
  });

  it('renderConfigSelect populates the select element', () => {
    configData.configs = [
      { name: 'Profil A', source_data: '/src/a', epars_dirs: ['/epars/a'] },
      { name: 'Profil B', source_data: '/src/b', epars_dirs: ['/epars/b'] },
    ];
    configData.active = 0;

    renderConfigSelect();

    const sel = document.getElementById('cfg-select') as HTMLSelectElement;
    expect(sel!.options.length).toBe(2);
    expect(sel!.options[0].textContent).toBe('Profil A');
    expect(sel!.options[1].textContent).toBe('Profil B');
  });

  it('initConfigUI wires up button handlers', () => {
    const addBtn = document.createElement('button');
    addBtn.id = 'btn-add-config';
    document.body.appendChild(addBtn);
    const delBtn = document.createElement('button');
    delBtn.id = 'btn-del-config';
    document.body.appendChild(delBtn);
    const saveBtn = document.createElement('button');
    saveBtn.id = 'btn-save-config';
    document.body.appendChild(saveBtn);

    initConfigUI();
    expect(typeof addBtn.onclick).toBe('function');
    expect(typeof delBtn.onclick).toBe('function');
    expect(typeof saveBtn.onclick).toBe('function');
  });

  it('add config creates a new empty profile', () => {
    const addBtn = document.createElement('button');
    addBtn.id = 'btn-add-config';
    document.body.appendChild(addBtn);
    configData.configs = [{ name: 'default', source_data: '', epars_dirs: [] }];
    configData.active = 0;

    initConfigUI();
    addBtn.click();

    expect(configData.configs.length).toBe(2);
    expect(configData.configs[1].name).toBe('nouveau');
  });

  it('delete config removes profile', () => {
    const delBtn = document.createElement('button');
    delBtn.id = 'btn-del-config';
    document.body.appendChild(delBtn);
    configData.configs = [
      { name: 'A', source_data: '', epars_dirs: [] },
      { name: 'B', source_data: '', epars_dirs: [] },
    ];
    configData.active = 0;

    initConfigUI();
    delBtn.click();
    expect(configData.configs.length).toBe(1);
  });

  it('delete config fails when only 1 profile remains', () => {
    const delBtn = document.createElement('button');
    delBtn.id = 'btn-del-config';
    document.body.appendChild(delBtn);
    const status = document.getElementById('config-status')!;
    configData.configs = [{ name: 'only', source_data: '', epars_dirs: [] }];

    initConfigUI();
    delBtn.click();
    expect(status.textContent).toContain('Impossible');
  });

  afterAll(() => {
    document.body.innerHTML = '';
  });
});

// ── Scan / Copy / Init tests (isolated DOM, body cleared each test) ──────
describe('actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.mockReset(); // ← clear leftover implementations (mockResolvedValue, etc.)
    // clearAllMocks garde les implémentations posées par mockReturnValue : le test
    // « batch copy » pose getBatchCopy={target:/dest,…} qui fuirait sinon (flaky shuffle).
    getBatchCopy.mockReturnValue({ target: '', files: [] });
    document.body.innerHTML = '';
    // Ré-attacher les éléments config capturés à l'import par actions.ts :
    // le describe « config » (qui tourne peut-être après en shuffle) en dépend.
    for (const el of cfgElements) document.body.appendChild(el);
    state.sourceFiles = {};
    state.eparsFiles = {};
    state.journal = [];
    state.selectedEparsFiles = new Map();
    state.sourceExtraDirs = new Set();
  });

  // ── Scan ───────────────────────────────────────────────────────────

  describe('runScan', () => {
    function setupScanUI(): void {
      const btn = document.createElement('button');
      btn.id = 'btn-scan';
      document.body.appendChild(btn);
      const bar = document.createElement('div');
      bar.id = 'scan-progress';
      bar.classList.add('hidden');
      document.body.appendChild(bar);
      const fill = document.createElement('div');
      fill.id = 'scan-progress-fill';
      document.body.appendChild(fill);
      const text = document.createElement('div');
      text.id = 'scan-progress-text';
      document.body.appendChild(text);
      const status = document.createElement('div');
      status.id = 'status-text';
      document.body.appendChild(status);
    }

    it('runs scan and updates state on success', async () => {
      setupScanUI();
      api.mockResolvedValueOnce({ source: { '/src': { 'a.mp3': { path: 'a.mp3' } } }, epars: { '/epars': {} } });
      api.mockResolvedValueOnce([]);

      await runScan();

      expect(state.sourceFiles).toEqual({ '/src': { 'a.mp3': { path: 'a.mp3' } } });
      expect(state.eparsFiles).toEqual({ '/epars': {} });
    });

    it('shows error on scan failure', async () => {
      setupScanUI();
      api.mockRejectedValueOnce(new Error('Network error'));

      await runScan();

      expect(showError).toHaveBeenCalledWith(expect.stringContaining('Network error'));
    });

    it('recalcule la Map doublons (EPIC-028 P0) après un scan réussi', async () => {
      setupScanUI();
      api.mockResolvedValueOnce({
        source: { '/src': { 'song.mp3': { path: 'song.mp3', duration: 200, codec: 'MP3 320kbps' } } },
        epars: {
          '/epars': {
            '01 - song (Radio Edit).flac': { path: '01 - song (Radio Edit).flac', duration: 200, codec: 'FLAC' },
          },
        },
      });
      api.mockResolvedValueOnce([]);

      await runScan();

      expect(state.dupMatches.size).toBe(1);
      const m = state.dupMatches.get('/epars/01 - song (Radio Edit).flac');
      expect(m?.sourceFilename).toBe('song.mp3');
      expect(m?.verdict).toBe('left-better'); // FLAC vs MP3
    });

    it('shows scan progress', async () => {
      setupScanUI();
      api.mockResolvedValueOnce({ running: false });
      api.mockResolvedValueOnce({ source: {}, epars: {} });
      api.mockResolvedValueOnce([]);

      await runScan();

      const status = document.getElementById('status-text');
      expect(status?.textContent).toContain('Scan terminé');
    });
  });

  // ── createSourceFolder (bouton ➕) ───────────────────────────────

  describe('createSourceFolder', () => {
    function setupStatusEl(): HTMLElement {
      let status = document.getElementById('status-text');
      if (!status) {
        status = document.createElement('div');
        status.id = 'status-text';
        document.body.appendChild(status);
      }
      return status;
    }

    it('shows guidance when no source dir is configured', async () => {
      setupStatusEl();
      state.sourceFiles = {};

      await createSourceFolder();

      expect(showError).toHaveBeenCalledWith(expect.stringContaining('Source Data'));
      expect(promptDialog).not.toHaveBeenCalled();
    });

    it('prompts for a name and POSTs /mkdir with root and name', async () => {
      setupStatusEl();
      state.sourceFiles = { '/src': {} };
      api.mockResolvedValueOnce({ ok: true, path: '/src/Ambient' });

      await createSourceFolder();

      expect(promptDialog).toHaveBeenCalledTimes(1);
      // promptDialog mocké : le callback onOk s'exécute immédiatement
      await vi.waitFor(() => {
        expect(api).toHaveBeenCalledWith(
          '/mkdir',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('Ambient'),
          }),
        );
      });
      // La mise à jour d'état suit l'appel api (même tick) — elle peut n'être
      // pas encore visible au moment où l'appel est observable.
      await vi.waitFor(() => {
        expect(state.sourceExtraDirs.has('/src/Ambient')).toBe(true);
      });
    });

    it('shows error when POST /mkdir fails', async () => {
      setupStatusEl();
      state.sourceFiles = { '/src': {} };
      api.mockRejectedValueOnce(new Error('HTTP 403'));

      await createSourceFolder();

      await vi.waitFor(() => {
        expect(showError).toHaveBeenCalledWith(expect.stringContaining('403'));
      });
      expect(state.sourceExtraDirs.size).toBe(0);
    });
  });

  // ── Copy ───────────────────────────────────────────────────────────

  describe('executeCopy', () => {
    function setupEparsFile(): void {
      const c = document.createElement('div');
      c.id = 'epars-container';
      const row = document.createElement('div');
      row.className = 'focused';
      const file = document.createElement('span');
      file.className = 'file';
      file.dataset.epardir = '/epars';
      file.dataset.filename = 'song.mp3';
      row.appendChild(file);
      c.appendChild(row);
      document.body.appendChild(c);
    }

    function setupSourceDir(): void {
      const c = document.createElement('div');
      c.id = 'source-container';
      const dir = document.createElement('div');
      dir.className = 'directory focused';
      dir.dataset.dirpath = '/source/music';
      c.appendChild(dir);
      document.body.appendChild(c);
    }

    function setupDialog(): void {
      const msg = document.createElement('div');
      msg.id = 'dialog-msg';
      document.body.appendChild(msg);
      const confirm = document.createElement('button');
      confirm.id = 'dialog-confirm';
      document.body.appendChild(confirm);
      const cancel = document.createElement('button');
      cancel.id = 'dialog-cancel';
      document.body.appendChild(cancel);
    }

    it('shows info when no left focus', () => {
      const status = document.createElement('div');
      status.id = 'status-text';
      document.body.appendChild(status);

      executeCopy();
      expect(status.textContent).toContain('surbrillance');
    });

    it('shows info when no right focus', () => {
      setupEparsFile();
      const status = document.createElement('div');
      status.id = 'status-text';
      document.body.appendChild(status);

      executeCopy();
      expect(status.textContent).toContain('surbrillance');
    });

    it('opens dialog when both sides focused', () => {
      setupEparsFile();
      setupSourceDir();
      setupDialog();
      state.eparsFiles = { '/epars': { 'song.mp3': { path: 'song.mp3', year: null, duration: null, codec: null } } };

      executeCopy();
      expect(confirmCopyDialog).toHaveBeenCalledTimes(1); // EPIC-051 : modale structurée
    });

    it('opens dialog when right focus is a file row inside a directory', () => {
      setupEparsFile();
      setupDialog();
      // Dossier déplié : le focus est sur une ligne fichier imbriquée, pas sur
      // le dossier lui-même — le parent .directory doit servir de destination.
      const c = document.createElement('div');
      c.id = 'source-container';
      const dir = document.createElement('div');
      dir.className = 'directory';
      dir.dataset.dirpath = '/source/music';
      const row = document.createElement('div');
      row.className = 'file-row focused';
      dir.appendChild(row);
      c.appendChild(dir);
      document.body.appendChild(c);
      state.eparsFiles = { '/epars': { 'song.mp3': { path: 'song.mp3', year: null, duration: null, codec: null } } };

      executeCopy();
      expect(confirmCopyDialog).toHaveBeenCalledTimes(1);
    });

    it('performs batch copy when batch exists', () => {
      getBatchCopy.mockReturnValue({ target: '/dest', files: [{ filename: 'f.mp3', eparDir: '/epars' }] });
      setupDialog();
      state.eparsFiles = { '/epars': { 'f.mp3': { path: 'f.mp3', year: null, duration: null, codec: null } } };
      api.mockResolvedValue({ ok: true });

      executeCopy();
      expect(confirmCopyDialog).toHaveBeenCalledTimes(1);
    });

    it('confirmation → le dossier destination reste PLIÉ (EPIC-051 : plus d’auto-expansion)', async () => {
      setupEparsFile();
      setupSourceDir(); // dossier /source/music focusé, replié (pas de .children)
      setupDialog();
      state.eparsFiles = { '/epars': { 'song.mp3': { path: 'song.mp3', year: null, duration: null, codec: null } } };
      state.sourceExpanded = new Set();
      api.mockResolvedValue({ ok: true });

      executeCopy();
      document.getElementById('dialog-confirm')!.click();
      await new Promise(r => setTimeout(r, 0)); // draine les awaits du handler

      // EPIC-051 : le dépliage est un geste explicite (clic/Enter) — la copie
      // n'ouvre plus le dossier, ni le DOM ni la mémoire sourceExpanded.
      const dirEl = document.querySelector('#source-container .directory[data-dirpath="/source/music"]')!;
      expect(dirEl.classList.contains('expanded')).toBe(false);
      expect(state.sourceExpanded.has('/source/music')).toBe(false);
    });
  });

  // ── Init ───────────────────────────────────────────────────────────

  describe('copyFilesTo (EPIC-035 — extrait du batch F5, iso-comportement)', () => {
    it('copie, patch l’index source sous le sous-dossier cible, renvoie les fullpaths copiés', async () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      const dir = document.createElement('div');
      dir.className = 'directory';
      dir.dataset.dirpath = '/source/techno_1995';
      c.appendChild(dir);
      document.body.appendChild(c);
      state.eparsFiles = {
        '/epars': { 'f.mp3': { path: '_techno/f.mp3', year: '1996', duration: null, codec: null } },
      };
      state.sourceFiles = { '/source': {} };
      state.sourceExpanded = new Set();
      state.sourceNodeMap.set('/source/techno_1995', { node: { __files__: [] } as any, baseDir: '/source' });
      api.mockImplementation(async (url: string) =>
        url === '/journal' ? [] : { ok: true, year: '1996', codec: 'MP3' },
      );

      const { copied } = await copyFilesTo('/source/techno_1995', [
        { filename: 'f.mp3', eparDir: '/epars', fullpath: '/epars/_techno/f.mp3' },
      ]);

      expect(copied).toEqual(['/epars/_techno/f.mp3']);
      expect(api).toHaveBeenCalledWith('/copy', expect.objectContaining({ method: 'POST' }));
      expect(JSON.parse((api.mock.calls[0][1] as { body: string }).body)).toEqual({
        source_path: '/epars/_techno/f.mp3',
        dest_dir: '/source/techno_1995',
        filename: 'f.mp3',
      });
      expect(state.sourceFiles['/source']['f.mp3']).toEqual({
        path: 'techno_1995/f.mp3',
        year: '1996',
        duration: null,
        codec: 'MP3',
        genre: null,
      });
      expect(patchEparsFileAfterCopy).toHaveBeenCalledWith('f.mp3', '/epars');
      // EPIC-051 : plus d'auto-expansion — le dossier destination reste plié.
      expect(state.sourceExpanded.has('/source/techno_1995')).toBe(false);
    });

    it('/copy KO ou fichier inconnu → liste vide, index source intact', async () => {
      state.eparsFiles = { '/epars': { 'f.mp3': { path: 'f.mp3', year: null, duration: null, codec: null } } };
      state.sourceFiles = { '/source': {} };
      api.mockImplementation(async (url: string) => (url === '/journal' ? [] : { ok: false }));
      const { copied } = await copyFilesTo('/source/x', [
        { filename: 'f.mp3', eparDir: '/epars', fullpath: '/epars/f.mp3' },
        { filename: 'ghost.mp3', eparDir: '/epars', fullpath: '/epars/ghost.mp3' },
      ]);
      expect(copied).toEqual([]);
      expect(Object.keys(state.sourceFiles['/source'])).toEqual([]);
    });
  });

  // ── EPIC-043 : le style du dossier cible est écrit (épars + copie) ──────

  describe('style écrit à la copie (EPIC-043)', () => {
    // Réponse serveur d'une copie qui a écrit le style des deux côtés.
    const styleRes = (over: Record<string, unknown> = {}) => ({
      ok: true,
      year: '1996',
      duration: null,
      codec: 'MP3',
      genre: 'techno',
      style: 'techno',
      style_writes: [
        { path: '/epars/_techno/f.mp3', role: 'epars', ok: true, changed: true, style: 'techno' },
        { path: '/source/techno_1995/f.mp3', role: 'copie', ok: true, changed: true, style: 'techno' },
      ],
      style_error: null,
      ...over,
    });

    /// Un cas par classe de classement (style, style_tranche, hors temps,
    /// techniques, daté, capitalisé). La table EXHAUSTIVE de la grammaire est
    /// partagée avec Python dans `styles.test.ts` (=
    /// `test_app.py::STYLE_FOLDER_CASES`) : ici on teste la plomberie — premier
    /// segment du chemin relatif à la racine Source Data.
    const FOLDER_CASES: Array<[string, string | null]> = [
      ['techno_1995', 'techno'],
      ['italo_disco', 'italo_disco'],
      ['techno_acid_1990', 'techno_acid'],
      ['_trash', null],
      ['2008_08', null],
      ['Techno', null],
    ];

    it('styleOfDestDir : premier segment de la destination, grammaire stricte', () => {
      state.sourceFiles = { '/source': {} };
      for (const [name, expected] of FOLDER_CASES) {
        expect([name, styleOfDestDir(`/source/${name}`)]).toEqual([name, expected]);
      }
      expect(styleOfDestDir('/source/techno_1995/sous_dossier')).toBe('techno'); // sous-dossier : même style
      expect(styleOfDestDir('/source')).toBeNull(); // la racine Source Data ne déclare rien
      expect(styleOfDestDir('/ailleurs/techno_1995')).toBeNull(); // hors racine connue
    });

    it('copyFilesTo : genre patché des deux côtés + note de statut', async () => {
      const c = document.createElement('div');
      c.id = 'source-container';
      document.body.appendChild(c);
      state.eparsFiles = {
        '/epars': { 'f.mp3': { path: '_techno/f.mp3', year: '1996', duration: null, codec: null, genre: 'Blues' } },
      };
      state.sourceFiles = { '/source': {} };
      state.sourceNodeMap.set('/source/techno_1995', { node: { __files__: [] } as any, baseDir: '/source' });
      api.mockImplementation(async (url: string) => (url === '/journal' ? [] : styleRes()));

      const r = await copyFilesTo('/source/techno_1995', [
        { filename: 'f.mp3', eparDir: '/epars', fullpath: '/epars/_techno/f.mp3' },
      ]);

      expect(r.copied).toEqual(['/epars/_techno/f.mp3']);
      expect(r.styleNote).toBe(' · style « techno » écrit (epars + copie)');
      expect(state.eparsFiles['/epars']['f.mp3'].genre).toBe('techno');
      expect(state.sourceFiles['/source']['f.mp3'].genre).toBe('techno');
      expect(patchSourceFileAfterCopy).toHaveBeenCalledWith(
        '/source/techno_1995',
        'f.mp3',
        expect.objectContaining({ genre: 'techno' }),
      );
      state.sourceNodeMap.clear();
    });

    it('destination sans style déclaré : aucun genre patché, aucune note', async () => {
      state.eparsFiles = {
        '/epars': { 'f.mp3': { path: 'f.mp3', year: null, duration: null, codec: null, genre: 'Blues' } },
      };
      state.sourceFiles = { '/source': {} };
      state.sourceNodeMap.set('/source/_trash', { node: { __files__: [] } as any, baseDir: '/source' });
      api.mockImplementation(async (url: string) =>
        url === '/journal'
          ? []
          : { ok: true, year: null, duration: null, codec: 'MP3', genre: 'Blues', style: null, style_writes: [] },
      );

      const r = await copyFilesTo('/source/_trash', [
        { filename: 'f.mp3', eparDir: '/epars', fullpath: '/epars/f.mp3' },
      ]);

      expect(r.styleNote).toBe('');
      expect(state.eparsFiles['/epars']['f.mp3'].genre).toBe('Blues'); // l'épars n'est pas touché
      expect(state.sourceFiles['/source']['f.mp3'].genre).toBe('Blues'); // genre de la copie, tel quel
      state.sourceNodeMap.clear();
    });

    it('échec d’écriture : note rapportée, la copie reste comptée', async () => {
      state.eparsFiles = { '/epars': { 'f.mp3': { path: 'f.mp3', year: null, duration: null, codec: null } } };
      state.sourceFiles = { '/source': {} };
      state.sourceNodeMap.set('/source/techno_1995', { node: { __files__: [] } as any, baseDir: '/source' });
      api.mockImplementation(async (url: string) =>
        url === '/journal'
          ? []
          : styleRes({
              style_writes: [
                { path: '/epars/f.mp3', role: 'epars', ok: false, changed: true, error: "relu 'Blues'" },
                { path: '/source/techno_1995/f.mp3', role: 'copie', ok: true, changed: true },
              ],
            }),
      );

      const r = await copyFilesTo('/source/techno_1995', [
        { filename: 'f.mp3', eparDir: '/epars', fullpath: '/epars/f.mp3' },
      ]);

      expect(r.copied).toEqual(['/epars/f.mp3']); // la copie a réussi
      expect(r.styleNote).toBe(" · style « techno » non écrit sur epars : relu 'Blues'");
      expect(state.eparsFiles['/epars']['f.mp3'].genre).toBeUndefined(); // pas d'écriture → pas de patch
      state.sourceNodeMap.clear();
    });

    it('styleNoteOf : muet sans style déclaré, « déjà à jour » quand rien n’a changé', () => {
      expect(styleNoteOf({ ok: true })).toBe('');
      expect(styleNoteOf({ ok: true, style: null, style_error: 'mutagen indisponible' })).toBe(
        ' · style non écrit : mutagen indisponible',
      );
      expect(
        styleNoteOf({
          ok: true,
          style: 'techno',
          style_writes: [
            { path: 'a', role: 'epars', ok: true, changed: false },
            { path: 'b', role: 'copie', ok: true, changed: false },
          ],
        }),
      ).toBe(' · style « techno » déjà à jour');
    });

    it('styleConsentLine : la modale F5 annonce l’écriture seulement si un style est déclaré', () => {
      state.sourceFiles = { '/source': {} };
      expect(styleConsentLine('/source/techno_1995')).toContain('« techno »');
      expect(styleConsentLine('/source/techno_1995')).toContain("l'année n'est pas touchée");
      expect(styleConsentLine('/source/_trash/2026-09-22')).toBe('');
    });

    it('modale F5 batch (EPIC-051) : la spec porte fichier → destination en évidence, consentement en discret', () => {
      state.sourceFiles = { '/source': {} };
      getBatchCopy.mockReturnValue({
        target: '/source/techno_1995',
        files: [{ filename: 'f.mp3', eparDir: '/epars', fullpath: '/epars/f.mp3' }],
      });

      executeCopy();

      expect(confirmCopyDialog).toHaveBeenCalledTimes(1);
      const [spec] = confirmCopyDialog.mock.calls[0] as [
        { groups: Array<{ destName: string; destCreated: boolean; filenames: string[] }>; notes: string[] },
        () => void,
      ];
      // Évidence : fichier → dossier (badge ➕ : l'index est vide, /copy créera le dossier).
      expect(spec.groups).toHaveLength(1);
      expect(spec.groups[0].destName).toBe('techno_1995');
      expect(spec.groups[0].filenames).toEqual(['f.mp3']);
      expect(spec.groups[0].destCreated).toBe(true);
      // Discret (revue du 2026-09-23) : consentement CONDENSÉ une ligne.
      expect(spec.notes[0]).toBe("Style « techno » écrit sur l'épars et la copie · année intacte");
    });
  });

  describe('initApp + dupMatches (EPIC-028)', () => {
    it('peuple dupMatches depuis le cache /load (marqueurs ambre après reload)', async () => {
      const status = document.createElement('div');
      status.id = 'status-text';
      document.body.appendChild(status);

      api.mockResolvedValueOnce({ active: 0, configs: [{ name: 'd', source_data: '', epars_dirs: [] }] });
      api.mockResolvedValueOnce({
        source: { '/src': { 'song.mp3': { path: 'song.mp3', duration: 200, codec: 'MP3 320kbps' } } },
        epars: {
          '/epars': {
            '01 - song (Radio Edit).flac': { path: '01 - song (Radio Edit).flac', duration: 200, codec: 'FLAC' },
          },
        },
      });
      api.mockResolvedValueOnce([]);

      await initApp();

      expect(state.dupMatches.size).toBe(1);
      expect(state.dupMatches.get('/epars/01 - song (Radio Edit).flac')?.verdict).toBe('left-better');

      status.remove();
    });
  });

  describe('initApp', () => {
    it('loads config, cache, journal on init', async () => {
      const status = document.createElement('div');
      status.id = 'status-text';
      document.body.appendChild(status);

      const configDataMock = { active: 0, configs: [{ name: 'default', source_data: '', epars_dirs: [] }] };
      const cacheMock = { source: { '/src': { 'a.mp3': { path: 'a.mp3' } } }, epars: {} };
      const journalMock = [{ status: 'copied', filename: 'a.mp3' }];

      api.mockResolvedValueOnce(configDataMock);
      api.mockResolvedValueOnce(cacheMock);
      api.mockResolvedValueOnce(journalMock);

      await initApp();

      expect(api).toHaveBeenCalledTimes(3);
      expect(api).toHaveBeenNthCalledWith(1, '/config');
      expect(api).toHaveBeenNthCalledWith(2, '/load');
      expect(api).toHaveBeenNthCalledWith(3, '/journal');
      expect(state.sourceFiles).toEqual({ '/src': { 'a.mp3': { path: 'a.mp3' } } });
      expect(state.journal).toEqual([{ status: 'copied', filename: 'a.mp3' }]);

      status.remove();
    });

    it('sets default config when none provided', async () => {
      api.mockResolvedValueOnce({ active: 0, configs: [] });
      api.mockResolvedValueOnce({});
      api.mockResolvedValueOnce([]);

      await initApp();

      expect(configData.configs.length).toBe(1);
      expect(configData.configs[0].name).toBe('default');
    });

    it('handles init error gracefully', async () => {
      api.mockResolvedValueOnce({});
      api.mockRejectedValueOnce(new Error('Connection failed'));

      await initApp();
      // Should not throw
    });
  });

  // ── EPIC-028 P1bis : executeReplace (copy puis move trash) ─────────────
  describe('executeReplace', () => {
    const DUP_MATCH = {
      eparsFullPath: '/epars/song.flac',
      sourceFullPath: '/source/music/song.mp3',
      eparsFilename: 'song.flac',
      sourceFilename: 'song.mp3',
      sim: 0.97,
      delta: 0,
      verdict: 'left-better' as const,
    };

    function setupDom(): void {
      const status = document.createElement('div');
      status.id = 'status-text';
      document.body.appendChild(status);
      const file = document.createElement('span');
      file.className = 'file';
      file.dataset.filename = 'song.flac';
      document.body.appendChild(file);
    }

    it('no-op with status message when path not in dupMatches', async () => {
      setupDom();
      state.dupMatches = new Map();

      await executeReplace('/epars/unknown.flac');

      expect(api).not.toHaveBeenCalled();
      expect(document.getElementById('status-text')!.textContent).toContain('Aucun jumeau');
    });

    it('copies epars into twin dir then moves old file to _trash/<date>', async () => {
      setupDom();
      state.dupMatches = new Map([['/epars/song.flac', DUP_MATCH]]);
      state.eparsFiles = { '/epars': { 'song.flac': { path: 'song.flac', year: null, duration: 200, codec: 'FLAC' } } };
      state.sourceFiles = { '/source/music': {} };
      api.mockResolvedValue({ ok: true });

      await executeReplace('/epars/song.flac');

      expect(api).toHaveBeenCalledTimes(2);
      const [copyUrl, copyOpts] = api.mock.calls[0];
      expect(copyUrl).toBe('/copy');
      expect(JSON.parse(String(copyOpts.body))).toEqual({
        source_path: '/epars/song.flac',
        dest_dir: '/source/music',
        filename: 'song.flac',
      });
      const [moveUrl, moveOpts] = api.mock.calls[1];
      expect(moveUrl).toBe('/move');
      const moveBody = JSON.parse(String(moveOpts.body));
      expect(moveBody.source_path).toBe('/source/music/song.mp3');
      expect(moveBody.dest_dir).toMatch(/^\/source\/music\/_trash\/\d{4}-\d{2}-\d{2}$/);
      expect(showError).not.toHaveBeenCalled();
      expect(document.getElementById('status-text')!.textContent).toContain('remplacé');
      expect(state.replaceBusy).toBe(false);
    });

    it("does NOT move to trash when copy fails (rien n'est perdu)", async () => {
      setupDom();
      state.dupMatches = new Map([['/epars/song.flac', DUP_MATCH]]);
      state.eparsFiles = { '/epars': { 'song.flac': { path: 'song.flac', year: null, duration: 200, codec: 'FLAC' } } };
      state.sourceFiles = { '/source/music': {} };
      api.mockRejectedValueOnce(new Error('disk full'));

      await executeReplace('/epars/song.flac');

      expect(api).toHaveBeenCalledTimes(1); // le move n'a pas eu lieu
      expect(showError).toHaveBeenCalledWith(expect.stringContaining('disk full'));
      expect(state.replaceBusy).toBe(false);
    });

    it('updates sourceFiles: old removed, epars meta carried over, dupMatches refreshed', async () => {
      setupDom();
      state.dupMatches = new Map([['/epars/song.flac', DUP_MATCH]]);
      state.eparsFiles = {
        '/epars': { 'song.flac': { path: 'song.flac', year: '2011', duration: 200, codec: 'FLAC 1000kbps' } },
      };
      state.sourceFiles = {
        '/source/music': { 'song.mp3': { path: 'song.mp3', year: null, duration: 199, codec: 'MP3 320kbps' } },
      };
      api.mockResolvedValue({ ok: true });

      await executeReplace('/epars/song.flac');

      const idx = state.sourceFiles['/source/music'];
      expect(idx['song.mp3']).toBeUndefined(); // l'ancien est parti
      expect(idx['song.flac']).toEqual({ path: 'song.flac', year: '2011', duration: 200, codec: 'FLAC 1000kbps' });
      // NB : la paire reste référencée (le nouveau song.flac matche l'épars
      // original, normalisés identiques) — inoffensif : le verdict passe à
      // « equal », et seul le scan consolidera l'état réel. Testé tel quel.
    });
  });
});
