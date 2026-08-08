// ─── Tests: render/cueEditor.ts — scaffold + wavesurfer (mock) ────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApi = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    activeModal: null as string | null,
    listeners,
    setModal(v: string | null) {
      this.activeModal = v;
      for (const fn of listeners.activeModal ?? []) fn();
    },
  };
});
const mockWSCreate = vi.hoisted(() => vi.fn());
const mockRegionsCreate = vi.hoisted(() => vi.fn());

vi.mock('../api.js', () => ({ api: mockApi }));
vi.mock('../state.js', () => ({ state: mockState }));
vi.mock('../ui.js', () => ({ showToast: vi.fn() }));
vi.mock('wavesurfer.js', () => ({ default: { create: mockWSCreate } }));
vi.mock('wavesurfer.js/dist/plugins/regions.js', () => ({ default: { create: mockRegionsCreate } }));

import { openCueEditor } from './cueEditor.js';

function makeWS(overrides: Record<string, unknown> = {}) {
  const regions = { addRegion: vi.fn(), getRegions: vi.fn(() => []) };
  return {
    on: vi.fn(),
    registerPlugin: vi.fn(() => regions),
    destroy: vi.fn(),
    getCurrentTime: vi.fn(() => 25),
    regions,
    ...overrides,
  };
}

describe('render/cueEditor scaffold', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="modal-cue-editor" class="modal hidden">
        <div id="cue-editor-title"></div>
        <div id="cue-editor-status"></div>
        <div id="cue-editor-waveform"></div>
      </div>
    `;
    mockApi.mockReset();
    mockWSCreate.mockReset();
    mockWSCreate.mockReturnValue(makeWS());
  });

  afterEach(() => {
    mockState.activeModal = null;
  });

  it("n'ouvre pas la modal quand le NML n'est pas configuré", async () => {
    mockApi.mockResolvedValue({ configured: false });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(mockState.activeModal).toBeNull();
    const modal = document.getElementById('modal-cue-editor');
    expect(modal!.classList.contains('hidden')).toBe(true);
  });

  it("ouvre la modal quand configuré", async () => {
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({ ok: true, multiple: false, entries: [
        { filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] },
      ] });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(mockState.activeModal).toBe('cueEditor');
    expect(mockApi).toHaveBeenCalledWith('/api/nml/status');
  });
});

describe('render/cueEditor wavesurfer', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="modal-cue-editor" class="modal hidden">
        <div id="cue-editor-title"></div>
        <div id="cue-editor-status"></div>
        <div id="cue-editor-waveform"><span>placeholder</span></div>
      </div>
    `;
    mockApi.mockReset();
    mockWSCreate.mockReset();
    mockRegionsCreate.mockReset();
  });

  it("crée un WaveSurfer avec l'URL audio et le plugin Regions sur ready", async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockRegionsCreate.mockReturnValue({});
    mockApi.mockResolvedValueOnce({ configured: true });
    mockApi.mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{
        filename: 'a.mp3', filesize: '5243', artist: 'X', title: 'Y',
        cues: [{ type: '0', start: 5, len: 0, hotcue: 2, name: 'n.n.', displ_order: '0' }],
      }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });

    const opts = mockWSCreate.mock.calls[0][0] as { url: string };
    expect(opts.url).toContain('/audio?path=%2Fx%2Fa.mp3');
    const onCalls = ws.on.mock.calls as Array<[string, () => void]>;
    const readyCb = onCalls.find(([evt]) => evt === 'ready')?.[1];
    expect(readyCb).toBeDefined();
    readyCb!();
    expect(ws.registerPlugin).toHaveBeenCalled();
  });
});
describe('render/cueEditor sélecteur homonymes', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="modal-cue-editor" class="modal hidden">
        <div id="cue-editor-title"></div>
        <div id="cue-editor-status"></div>
        <div id="cue-editor-waveform"></div>
        <div id="cue-editor-controls"></div>
      </div>
    `;
    mockApi.mockReset();
    mockWSCreate.mockReset();
    mockWSCreate.mockReturnValue(makeWS());
  });

  it("affiche un sélecteur quand multiple matchs", async () => {
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({
        ok: true, multiple: true,
        entries: [
          { filename: 'track.mp3', filesize: '1', artist: 'Native Instruments', title: 'Native', cues: [] },
          { filename: 'track.mp3', filesize: '2', artist: 'Autre', title: 'Autre', cues: [] },
        ],
      });
    await openCueEditor({ filename: 'track.mp3', fullPath: '/x/track.mp3' });
    const select = document.getElementById('cue-editor-select') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(select!.options.length).toBe(2);
    expect(select!.options[0].textContent).toContain('Native');
  });
});
