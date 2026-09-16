// ─── Unit tests: actions.ts — config, scan, copy, init ────────────────────
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './state.js';

const {
  api,
  revalidateFocus,
  setActivePanel,
  getBatchCopy,
  patchEparsFileAfterCopy,
  patchSourceFileAfterCopy,
  renderSource,
  loadRatings,
  closeAllModals,
  openModal,
  promptDialog,
  showError,
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
    showError: vi.fn(),
    cfgElements: Array.from(
      document.querySelectorAll(
        '#cfg-select, #cfg-name, #cfg-source, #cfg-traktor-nml-path, #cfg-traktor-export-root, #cfg-traktor-export-volume, #cfg-epars, #config-status',
      ),
    ),
  };
});

vi.mock('./api.js', () => ({ api }));
vi.mock('./focus.js', () => ({ revalidateFocus, setActivePanel }));
vi.mock('./render.js', () => ({ getBatchCopy, patchEparsFileAfterCopy, patchSourceFileAfterCopy, renderSource }));
vi.mock('./ratings.js', () => ({ loadRatings }));
vi.mock('./ui.js', () => ({ closeAllModals, openModal, promptDialog, showError }));

import {
  configData,
  createSourceFolder,
  executeCopy,
  initApp,
  initConfigUI,
  renderConfigSelect,
  runScan,
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
      expect(openModal).toHaveBeenCalledWith('dialog');
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
      expect(openModal).toHaveBeenCalledWith('dialog');
    });

    it('performs batch copy when batch exists', () => {
      getBatchCopy.mockReturnValue({ target: '/dest', files: [{ filename: 'f.mp3', eparDir: '/epars' }] });
      setupDialog();
      state.eparsFiles = { '/epars': { 'f.mp3': { path: 'f.mp3', year: null, duration: null, codec: null } } };
      api.mockResolvedValue({ ok: true });

      executeCopy();
      expect(openModal).toHaveBeenCalledWith('dialog');
    });
  });

  // ── Init ───────────────────────────────────────────────────────────

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
      api.mockRejectedValueOnce(new Error('Connection failed'));

      await initApp();
      // Should not throw
    });
  });
});
