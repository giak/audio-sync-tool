// ─── Tests: render/cueEditor.ts — scaffold + wavesurfer (mock) ────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockApi = vi.hoisted(() => vi.fn());
const mockState = vi.hoisted(() => {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    activeModal: null as string | null,
    listeners,
    on(event: string, fn: () => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return () => {};
    },
    setModal(v: string | null) {
      this.activeModal = v;
      for (const fn of listeners['activeModal:changed'] ?? []) fn();
    },
  };
});
const mockWSCreate = vi.hoisted(() => vi.fn());
const mockRegionsCreate = vi.hoisted(() => vi.fn());

vi.mock('../api.js', () => ({ api: mockApi }));
vi.mock('../state.js', () => ({ state: mockState, on: mockState.on.bind(mockState) }));
vi.mock('../ui.js', () => ({ showToast: vi.fn() }));
vi.mock('wavesurfer.js', () => ({ default: { create: mockWSCreate } }));
vi.mock('wavesurfer.js/dist/plugins/regions.js', () => ({ default: { create: mockRegionsCreate } }));

import { showToast } from '../ui.js';
import { deleteRegionAtCursor, onSaveClicked, openCueEditor, toggleFullscreen } from './cueEditor.js';

interface MockWS {
  on: ReturnType<typeof vi.fn>;
  emit: (evt: string, ...args: unknown[]) => void;
  registerPlugin: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  getCurrentTime: ReturnType<typeof vi.fn>;
  getDuration: ReturnType<typeof vi.fn>;
  setTime: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  playPause: ReturnType<typeof vi.fn>;
  regions: {
    addRegion: ReturnType<typeof vi.fn>;
    getRegions: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    emit: (evt: string, ...args: unknown[]) => void;
    enableDragSelection: ReturnType<typeof vi.fn>;
  };
}

function makeWS(overrides: Record<string, unknown> = {}): MockWS {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  const regionsListeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  const regions = {
    addRegion: vi.fn(),
    getRegions: vi.fn(() => []),
    remove: vi.fn(),
    on: vi.fn((evt: string, cb: (...a: unknown[]) => void) => {
      if (!regionsListeners[evt]) regionsListeners[evt] = [];
      regionsListeners[evt].push(cb);
    }),
    emit: (evt: string, ...args: unknown[]) => {
      for (const cb of regionsListeners[evt] || []) cb(...args);
    },
    enableDragSelection: vi.fn(() => vi.fn()),
  };
  const ws: MockWS = {
    on: vi.fn((evt: string, cb: (...a: unknown[]) => void) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(cb);
    }),
    emit: (evt: string, ...args: unknown[]) => {
      for (const cb of listeners[evt] || []) cb(...args);
    },
    registerPlugin: vi.fn(() => regions),
    destroy: vi.fn(),
    getCurrentTime: vi.fn(() => 25),
    getDuration: vi.fn(() => 100),
    setTime: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    playPause: vi.fn(),
    regions,
    ...overrides,
  };
  return ws;
}

const MODAL_HTML = `
  <div id="modal-cue-editor" class="modal hidden">
    <div class="modal-content modal-lg">
      <div class="modal-header">
        <h3>Éditeur — <span id="cue-editor-title"></span></h3>
        <div class="modal-header-actions">
          <button id="cue-btn-fullscreen" title="Plein écran">🗖</button>
        </div>
      </div>
      <div id="cue-editor-status"></div>
      <div id="cue-editor-waveform"></div>
      <div id="cue-editor-controls">
        <span class="cue-slot" data-slot="0">A</span>
        <span class="cue-slot" data-slot="1">B</span>
        <span class="cue-slot" data-slot="2">C</span>
        <span class="cue-slot" data-slot="3">D</span>
        <span class="cue-slot" data-slot="4">E</span>
        <span class="cue-slot" data-slot="5">F</span>
        <span class="cue-slot" data-slot="6">G</span>
        <span class="cue-slot" data-slot="7">H</span>
        <button id="cue-btn-save">💾</button>
      </div>
      <div id="cue-editor-transport">
        <button id="cue-btn-play">▶</button>
        <span id="cue-editor-time">0:00 / 0:00</span>
      </div>
    </div>
  </div>
`;

function resetMocks(): void {
  document.body.innerHTML = MODAL_HTML;
  mockApi.mockReset();
  mockWSCreate.mockReset();
  mockRegionsCreate.mockReset();
  mockState.activeModal = null;
}

describe('render/cueEditor scaffold', () => {
  beforeEach(resetMocks);
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

  it('ouvre la modal quand configuré', async () => {
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
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
      entries: [
        {
          filename: 'a.mp3',
          filesize: '5243',
          artist: 'X',
          title: 'Y',
          cues: [{ type: '0', start: 5, len: 0, hotcue: 2, name: 'n.n.', displ_order: '0' }],
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });

    const opts = mockWSCreate.mock.calls[0][0] as { url: string; height: string };
    expect(opts.url).toContain('/audio?path=%2Fx%2Fa.mp3');
    expect(opts.height).toBe('auto'); // la waveform remplit le conteneur (plein écran)
    const onCalls = ws.on.mock.calls as Array<[string, () => void]>;
    const readyCb = onCalls.find(([evt]) => evt === 'ready')?.[1];
    expect(readyCb).toBeDefined();
    readyCb!();
    expect(ws.registerPlugin).toHaveBeenCalled();
  });
});

describe('render/cueEditor sélecteur homonymes', () => {
  beforeEach(resetMocks);

  it('affiche un sélecteur quand multiple matchs', async () => {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: true,
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

  it('désactive le bouton save pendant le POST et envoie entry:0', async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise(r => {
      release = r;
    });
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    mockApi.mockImplementationOnce(() => gate as Promise<unknown>);
    const btn = document.getElementById('cue-btn-save') as HTMLButtonElement;
    const p = onSaveClicked();
    expect(btn.disabled).toBe(true);
    release({ ok: true });
    await p;
    expect(btn.disabled).toBe(false);
    expect(mockApi).toHaveBeenCalledWith('/api/track/cues', expect.objectContaining({ method: 'POST' }));
    const call = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/cues');
    expect(call).toBeDefined();
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.entry).toBe(0);
  });

  it("envoie l'index de l'entrée choisie au POST (multi-match, B3)", async () => {
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: true,
      entries: [
        { filename: 't.mp3', filesize: '1', artist: 'A1', title: 'T1', cues: [] },
        { filename: 't.mp3', filesize: '1', artist: 'A2', title: 'T2', cues: [] },
      ],
    });
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    await openCueEditor({ filename: 't.mp3', fullPath: '/x/t.mp3' });
    ws.emit('ready');
    const select = document.getElementById('cue-editor-select') as HTMLSelectElement;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    ws.emit('ready'); // le 2e renderWaveform a réinitialisé _regions
    mockApi.mockResolvedValueOnce({ ok: true });
    await onSaveClicked();
    const call = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/cues');
    expect(call).toBeDefined();
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.entry).toBe(1);
    expect(body.filename).toBe('t.mp3');
  });

  it('préserve DISPL_ORDER des cues existants au round-trip (B9)', async () => {
    const ws = makeWS();
    // Les régions chargées à partir des cues : hotcue 2 → displ_order 7, hotcue 3 → 2.
    ws.regions.getRegions = vi.fn(() => [
      { id: 2, start: 5, end: 5.08 },
      { id: 3, start: 10, end: 10.08 },
    ]);
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [
        {
          filename: 'a.mp3',
          filesize: '1',
          artist: 'X',
          title: 'Y',
          cues: [
            { type: '0', start: 5, len: 0, hotcue: 2, name: 'n.n.', displ_order: '7' },
            { type: '0', start: 10, len: 0, hotcue: 3, name: 'n.n.', displ_order: '2' },
          ],
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    mockApi.mockResolvedValueOnce({ ok: true });
    await onSaveClicked();
    const call = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/cues');
    expect(call).toBeDefined();
    const body = JSON.parse((call[1] as { body: string }).body);
    const orders = new Map(body.cues.map((c: { hotcue: number; displ_order: string }) => [c.hotcue, c.displ_order]));
    expect(orders.get(2)).toBe('7');
    expect(orders.get(3)).toBe('2');
  });

  it("attribue un ordre chronologique aux nouveaux cues, pas l'index de slot (B9)", async () => {
    const ws = makeWS();
    ws.regions.getRegions = vi.fn(() => [
      { id: 7, start: 60, end: 60.08 }, // slot H posé à 60s
      { id: 0, start: 10, end: 10.08 }, // slot A posé à 10s
    ]);
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    mockApi.mockResolvedValueOnce({ ok: true });
    await onSaveClicked();
    const call = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/cues');
    const body = JSON.parse((call[1] as { body: string }).body);
    // Tri par start : slot A (10s) avant slot H (60s) — ordre chronologique, PAS hotcue.
    expect(body.cues[0].hotcue).toBe(0);
    expect(body.cues[0].displ_order).toBe('0');
    expect(body.cues[1].hotcue).toBe(7);
    expect(body.cues[1].displ_order).toBe('1');
  });
});

describe('render/cueEditor transport (play/pause + temps, B4)', () => {
  beforeEach(resetMocks);

  function openSingle(): MockWS {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    return ws;
  }

  it('le bouton ▶ déclenche playPause et reflète les événements play/pause', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const btn = document.getElementById('cue-btn-play') as HTMLButtonElement;
    btn.click();
    expect(ws.playPause).toHaveBeenCalled();
    ws.emit('play');
    expect(btn.textContent).toBe('⏸');
    ws.emit('pause');
    expect(btn.textContent).toBe('▶');
  });

  it('Espace (clavier) déclenche playPause quand la modal est ouverte', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(ws.playPause).toHaveBeenCalled();
  });

  it('Espace sur un bouton focusé ne déclenche pas playPause (pas de double toggle)', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const btn = document.getElementById('cue-btn-save') as HTMLButtonElement;
    btn.focus();
    // L'événement part du bouton focusé et remonte jusqu'à document (target = bouton).
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(ws.playPause).not.toHaveBeenCalled();
  });

  it('Espace est ignoré hors de la modal cueEditor', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    mockState.setModal(null);
    ws.playPause.mockClear();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(ws.playPause).not.toHaveBeenCalled();
  });

  it("timeupdate met à jour l'affichage du temps", async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    ws.emit('timeupdate');
    const el = document.getElementById('cue-editor-time');
    expect(el!.textContent).toBe('0:25 / 1:40');
  });

  it('←/→ seek de ±5s dans la modal', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(ws.setTime).toHaveBeenCalledWith(30);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(ws.setTime).toHaveBeenLastCalledWith(20);
  });
});

  it("affiche le volume/DIR dans le sélecteur d'homonymes", async () => {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: true,
      entries: [
        { filename: 't.mp3', filesize: '1', artist: 'A1', title: 'T1', volume: 'C:', dir: '/:Music/:' },
        { filename: 't.mp3', filesize: '2', artist: 'A2', title: 'T2', volume: 'D:', dir: '/:Autre/:' },
      ],
    });
    await openCueEditor({ filename: 't.mp3', fullPath: '/x/t.mp3' });
    const select = document.getElementById('cue-editor-select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options[0].textContent).toContain('C:');
    expect(select.options[0].textContent).toContain('/:Music/:');
    expect(select.options[1].textContent).toContain('D:');
  });
});

describe('render/cueEditor lifecycle', () => {
  beforeEach(resetMocks);

  it('détruit wavesurfer quand activeModal quitte cueEditor', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    mockState.setModal(null);
    expect(ws.destroy).toHaveBeenCalled();
  });

  it("détruit l'instance précédente lors d'un re-render (homonymes)", async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: true,
      entries: [
        { filename: 't.mp3', filesize: '1', artist: 'A1', title: 'T1', cues: [] },
        { filename: 't.mp3', filesize: '1', artist: 'A2', title: 'T2', cues: [] },
      ],
    });
    await openCueEditor({ filename: 't.mp3', fullPath: '/x/t.mp3' });
    ws.destroy.mockClear();
    const select = document.getElementById('cue-editor-select') as HTMLSelectElement;
    select.value = '1';
    select.dispatchEvent(new Event('change'));
    expect(ws.destroy).toHaveBeenCalled();
  });
});

describe('render/cueEditor plein écran', () => {
  beforeEach(resetMocks);

  function openSingle(): MockWS {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    return ws;
  }

  it("le bouton 🗖 bascule la classe cue-fullscreen et l'état du bouton", async () => {
    openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const content = document.querySelector('.modal-content') as HTMLElement;
    const btn = document.getElementById('cue-btn-fullscreen') as HTMLButtonElement;
    expect(content.classList.contains('cue-fullscreen')).toBe(false);
    btn.click();
    expect(content.classList.contains('cue-fullscreen')).toBe(true);
    expect(btn.textContent).toBe('🗗');
    expect(btn.title).toContain('Réduire');
    btn.click();
    expect(content.classList.contains('cue-fullscreen')).toBe(false);
    expect(btn.textContent).toBe('🗖');
  });

  it("toggleFullscreen en double appel revient à l'état initial", async () => {
    openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const content = document.querySelector('.modal-content') as HTMLElement;
    // État initial propre (pas de fuite d'un test précédent).
    expect(content.classList.contains('cue-fullscreen')).toBe(false);
    toggleFullscreen();
    expect(content.classList.contains('cue-fullscreen')).toBe(true);
    toggleFullscreen();
    expect(content.classList.contains('cue-fullscreen')).toBe(false);
  });

  it('Échap en plein écran sort du plein écran sans fermer la modal', async () => {
    openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const content = document.querySelector('.modal-content') as HTMLElement;
    (document.getElementById('cue-btn-fullscreen') as HTMLButtonElement).click();
    expect(content.classList.contains('cue-fullscreen')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(content.classList.contains('cue-fullscreen')).toBe(false);
    expect(mockState.activeModal).toBe('cueEditor'); // la modal reste ouverte
  });

  it('la fermeture de la modal sort du plein écran et réinitialise le bouton', async () => {
    openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const content = document.querySelector('.modal-content') as HTMLElement;
    const btn = document.getElementById('cue-btn-fullscreen') as HTMLButtonElement;
    btn.click();
    expect(content.classList.contains('cue-fullscreen')).toBe(true);
    mockState.setModal(null); // fermeture → destroyCueEditor
    expect(content.classList.contains('cue-fullscreen')).toBe(false);
    expect(btn.textContent).toBe('🗖');
    expect(btn.title).toBe('Plein écran');
  });
});

});
