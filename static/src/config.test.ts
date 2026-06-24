// ─── Tests for initConfigUI / renderConfigSelect from actions.ts ────────
// Separated from actions.test.ts because config DOM elements must exist
// BEFORE the module is imported (actions.ts binds cfgSelect at module scope).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  document.body.innerHTML = `
    <select id="cfg-select"></select>
    <input id="cfg-name" value="">
    <input id="cfg-source" value="">
    <textarea id="cfg-epars"></textarea>
    <span id="config-status"></span>
    <button id="btn-add-config"></button>
    <button id="btn-del-config"></button>
    <button id="btn-save-config"></button>
  `;
});

vi.mock('./api.js', () => ({ api: vi.fn() }));
vi.mock('./ui.js', () => ({ openModal: vi.fn(), closeAllModals: vi.fn() }));
vi.mock('./render.js', () => ({
  renderJournal: vi.fn(),
  renderSource: vi.fn(),
  patchEparsFileAfterCopy: vi.fn(),
  patchSourceFileAfterCopy: vi.fn(),
}));
vi.mock('./focus.js', () => ({ setActivePanel: vi.fn(), revalidateFocus: vi.fn() }));
vi.mock('./audio.js', () => ({ togglePlay: vi.fn() }));

import { configData, initConfigUI, renderConfigSelect } from './actions.js';
import { api } from './api.js';

beforeEach(() => {
  configData.active = 0;
  configData.configs = [{ name: 'default', source_data: '/src', epars_dirs: ['/ep1'] }];
  vi.clearAllMocks();
  // Keep DOM intact, just reset form values
  (document.getElementById('cfg-name') as HTMLInputElement).value = '';
  (document.getElementById('cfg-source') as HTMLInputElement).value = '';
  (document.getElementById('cfg-epars') as HTMLTextAreaElement).value = '';
  const cfgStatus = document.getElementById('config-status');
  if (cfgStatus) cfgStatus.textContent = '';
});

describe('initConfigUI', () => {
  it('adds a new config when btn-add-config is clicked', () => {
    initConfigUI();
    document.getElementById('btn-add-config')!.click();
    expect(configData.configs).toHaveLength(2);
    expect(configData.configs[1].name).toBe('nouveau');
    expect(configData.active).toBe(1);
  });

  it('sets cfgName focus after adding config', () => {
    const cfgName = document.getElementById('cfg-name') as HTMLInputElement;
    const focusSpy = vi.spyOn(cfgName, 'focus');
    initConfigUI();
    document.getElementById('btn-add-config')!.click();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('deletes a config when btn-del-config is clicked', () => {
    configData.configs = [
      { name: 'first', source_data: '/src1', epars_dirs: [] },
      { name: 'second', source_data: '/src2', epars_dirs: [] },
    ];
    configData.active = 0;
    const select = document.getElementById('cfg-select') as HTMLSelectElement;
    select.innerHTML = '<option value="0">first</option><option value="1">second</option>';
    select.value = '1';

    initConfigUI();
    document.getElementById('btn-del-config')!.click();

    expect(configData.configs).toHaveLength(1);
    expect(configData.configs[0].name).toBe('first');
    expect(configData.active).toBe(0);
  });

  it('does not delete the last remaining config', () => {
    configData.configs = [{ name: 'only', source_data: '/src', epars_dirs: [] }];
    const select = document.getElementById('cfg-select') as HTMLSelectElement;
    select.innerHTML = '<option value="0">only</option>';
    select.value = '0';

    initConfigUI();
    document.getElementById('btn-del-config')!.click();

    expect(configData.configs).toHaveLength(1);
    expect(document.getElementById('config-status')!.textContent).toContain('Impossible de supprimer');
  });

  it('saves config when btn-save-config is clicked', async () => {
    vi.mocked(api).mockResolvedValueOnce({ ok: true });

    (document.getElementById('cfg-name') as HTMLInputElement).value = 'my config';
    (document.getElementById('cfg-source') as HTMLInputElement).value = '/home/music';
    (document.getElementById('cfg-epars') as HTMLTextAreaElement).value = '/usb\n/sdcard';

    const select = document.getElementById('cfg-select') as HTMLSelectElement;
    select.innerHTML = '<option value="0">default</option>';
    select.value = '0';

    configData.active = 0;
    configData.configs = [{ name: 'default', source_data: '', epars_dirs: [] }];

    initConfigUI();
    document.getElementById('btn-save-config')!.click();
    await new Promise(r => setTimeout(r, 0));

    expect(configData.configs[0].name).toBe('my config');
    expect(configData.configs[0].source_data).toBe('/home/music');
    expect(configData.configs[0].epars_dirs).toEqual(['/usb', '/sdcard']);
    expect(configData.active).toBe(0);
    expect(api).toHaveBeenCalledWith('/config', expect.objectContaining({ method: 'POST' }));
    expect(document.getElementById('config-status')!.textContent).toContain('✓');
  });

  it('renderConfigSelect handles empty configs gracefully', () => {
    configData.configs = [];
    expect(() => renderConfigSelect()).not.toThrow();
  });

  it('renderConfigSelect populates select options', () => {
    configData.configs = [
      { name: 'alpha', source_data: '/a', epars_dirs: [] },
      { name: 'beta', source_data: '/b', epars_dirs: [] },
    ];
    renderConfigSelect();

    const select = document.getElementById('cfg-select') as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[0].textContent).toBe('alpha');
    expect(select.options[1].textContent).toBe('beta');
  });
});
