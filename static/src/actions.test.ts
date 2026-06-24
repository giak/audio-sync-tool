// ─── Unit tests: actions.ts — config, scan, copy, init ────────────────────
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from './state.js';

const { api, revalidateFocus, setActivePanel, getBatchCopy, patchEparsFileAfterCopy,
  patchSourceFileAfterCopy, renderSource, loadRatings, closeAllModals, openModal, showError } = vi.hoisted(() => {
  // Create config DOM elements BEFORE module import so cfgSelect/cfgStatus are initialized
  document.body.innerHTML = `
    <select id="cfg-select"></select>
    <input id="cfg-name" />
    <input id="cfg-source" />
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
    showError: vi.fn(),
  };
});

vi.mock('./api.js', () => ({ api }));
vi.mock('./focus.js', () => ({ revalidateFocus, setActivePanel }));
vi.mock('./render.js', () => ({ getBatchCopy, patchEparsFileAfterCopy, patchSourceFileAfterCopy, renderSource }));
vi.mock('./ratings.js', () => ({ loadRatings }));
vi.mock('./ui.js', () => ({ closeAllModals, openModal, showError }));

import { configData, renderConfigSelect, initConfigUI, runScan, executeCopy, initApp } from './actions.js';

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

  afterAll(() => { document.body.innerHTML = ''; });
});

// ── Scan / Copy / Init tests (isolated DOM, body cleared each test) ──────
describe('actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.mockReset();  // ← clear leftover implementations (mockResolvedValue, etc.)
    document.body.innerHTML = '';
    state.sourceFiles = {};
    state.eparsFiles = {};
    state.journal = [];
    state.selectedEparsFiles = new Map();
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
