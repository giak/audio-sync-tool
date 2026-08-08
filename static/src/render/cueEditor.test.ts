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
      // Fidèle à ui.ts closeAllModals : la fermeture masque la modal (DOM).
      const modal = document.getElementById('modal-cue-editor');
      if (modal) modal.classList.toggle('hidden', v !== 'cueEditor');
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
import {
  analyzeOnServer,
  deleteRegionAtCursor,
  onSaveClicked,
  openCueEditor,
  toggleFullscreen,
  writeGridToCollection,
} from './cueEditor.js';

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
  getDecodedData: ReturnType<typeof vi.fn>;
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
    // EPIC-012 : bande basse calculée depuis le buffer décodé. Par défaut null
    // (aucun décodage) → la bande reste vide sans erreur (best-effort).
    getDecodedData: vi.fn(() => null),
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
      <div id="cue-editor-addrow" class="hidden">
        <label>Volume Traktor : <input type="text" id="cue-add-volume" placeholder="TRAKTOR_USB"></label>
        <button id="cue-btn-add">➕ Ajouter à la collection</button>
      </div>
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
        <button id="cue-btn-loop">⟳ Loop</button>
        <button id="cue-btn-loopplay">🔁 Play</button>
        <button id="cue-btn-nudge-bwd">← 1/4</button>
        <label class="cue-bpm">BPM <input id="cue-bpm" type="number" placeholder="auto"></label>
        <button id="cue-btn-nudge-fwd">→ 1/4</button>
        <span id="cue-bpm-badge" class="cue-bpm-badge hidden"></span>
        <button id="cue-btn-beat1">◎ Beat 1</button>
        <button id="cue-btn-analyze">🔍 Analyser</button>
        <button id="cue-btn-writegrid">💾 Grille</button>
        <button id="cue-btn-snap">🧲 Snap</button>
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
    mockWSCreate.mockReturnValue(makeWS());
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(mockState.activeModal).toBe('cueEditor');
    expect(mockApi).toHaveBeenCalledWith('/api/nml/status');
  });

  it('ouvre quand même la modal en visualisation seule si la piste est absente de la collection', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(mockState.activeModal).toBe('cueEditor');
    const modal = document.getElementById('modal-cue-editor');
    expect(modal!.classList.contains('hidden')).toBe(false);
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('absente de la collection');
    const saveBtn = document.getElementById('cue-btn-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    // La ligne « Ajouter à la collection » est visible en mode visualisation seule.
    const addRow = document.getElementById('cue-editor-addrow') as HTMLElement;
    expect(addRow.classList.contains('hidden')).toBe(false);
    // La waveform est quand même créée (lecture possible) — sans cues.
    const opts = mockWSCreate.mock.calls[0][0] as { url: string };
    expect(opts.url).toContain('/audio?path=%2Fx%2Fa.mp3');
  });

  it('ré-active le bouton save après une ouverture en visualisation seule', async () => {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({ ok: true, multiple: false, entries: [] });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const saveBtn = document.getElementById('cue-btn-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    // Ensuite une piste matchée → save ré-activé.
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(saveBtn.disabled).toBe(false);
  });

  it("retire le sélecteur d'homonymes périmé en mode visualisation seule", async () => {
    mockWSCreate.mockReturnValue(makeWS());
    // 1) Ouverture multi-match → sélecteur créé.
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: true,
      entries: [
        { filename: 't.mp3', filesize: '1', artist: 'A1', title: 'T1', cues: [] },
        { filename: 't.mp3', filesize: '2', artist: 'A2', title: 'T2', cues: [] },
      ],
    });
    await openCueEditor({ filename: 't.mp3', fullPath: '/x/t.mp3' });
    expect(document.getElementById('cue-editor-select')).not.toBeNull();
    // 2) Ouverture suivante : piste absente de la collection → le sélecteur est retiré.
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({ ok: true, multiple: false, entries: [] });
    await openCueEditor({ filename: 'b.mp3', fullPath: '/x/b.mp3' });
    expect(document.getElementById('cue-editor-select')).toBeNull();
  });

  it('affiche un toast quand le match échoue côté serveur (fichier introuvable)', async () => {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi.mockResolvedValueOnce({ configured: true });
    mockApi.mockRejectedValueOnce(new Error('fichier introuvable'));
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(mockState.activeModal).toBeNull();
    expect(showToast).toHaveBeenCalledWith('⚠️ fichier introuvable');
  });
});

describe('render/cueEditor wavesurfer', () => {
  beforeEach(resetMocks);

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

describe('render/cueEditor UX (loop, suppression, live slot)', () => {
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

  it("le bouton ⟳ Loop active/désactive la drag-sélection et l'état visuel", async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const btn = document.getElementById('cue-btn-loop') as HTMLButtonElement;
    btn.click();
    expect(ws.regions.enableDragSelection).toHaveBeenCalled();
    expect(btn.classList.contains('looping')).toBe(true);
    btn.click();
    expect(btn.classList.contains('looping')).toBe(false);
  });

  it('la touche Suppr retire le cue sous le curseur', async () => {
    const ws = openSingle();
    ws.getCurrentTime.mockReturnValue(12);
    const region = { id: 2, start: 10, end: 14, remove: vi.fn() };
    ws.regions.getRegions = vi.fn(() => [region]);
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(region.remove).toHaveBeenCalled();
    expect(deleteRegionAtCursor()).toBe(true);
  });

  it('Suppr ne fait rien quand aucune région ne couvre le curseur', async () => {
    const ws = openSingle();
    ws.getCurrentTime.mockReturnValue(50);
    const region = { id: 2, start: 10, end: 14, remove: vi.fn() };
    ws.regions.getRegions = vi.fn(() => [region]);
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    expect(deleteRegionAtCursor()).toBe(false);
    expect(region.remove).not.toHaveBeenCalled();
  });

  it('le clic-droit sur une région la supprime', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const region = { id: 3, start: 5, end: 5.08, remove: vi.fn() };
    const clicked = (ws.regions.on.mock.calls as Array<[string, (...a: unknown[]) => void]>).find(
      ([evt]) => evt === 'region-clicked',
    )?.[1];
    expect(clicked).toBeDefined();
    clicked!(region, { button: 2 } as MouseEvent);
    expect(region.remove).toHaveBeenCalled();
  });

  it(".cue-slot.live s'active quand la lecture traverse la région (timeupdate)", async () => {
    const ws = openSingle();
    ws.getCurrentTime.mockReturnValue(11);
    ws.regions.getRegions = vi.fn(() => [{ id: 2, start: 10, end: 14 }]);
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const slots = Array.from(document.querySelectorAll('.cue-slot')) as HTMLElement[];
    expect(slots.find(s => s.getAttribute('data-slot') === '2')!.classList.contains('live')).toBe(false);
    ws.emit('timeupdate');
    expect(slots.find(s => s.getAttribute('data-slot') === '2')!.classList.contains('live')).toBe(true);
    expect(slots.find(s => s.getAttribute('data-slot') === '0')!.classList.contains('live')).toBe(false);
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

describe('render/cueEditor beatgrid (snap + BPM)', () => {
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

  function regionCreatedCb(ws: MockWS): (...a: unknown[]) => void {
    const cb = (ws.regions.on.mock.calls as Array<[string, (...a: unknown[]) => void]>).find(
      ([evt]) => evt === 'region-created',
    )?.[1];
    expect(cb).toBeDefined();
    return cb!;
  }

  it('un loop dessiné reçoit un slot A–H libre (fix sauvegarde 400)', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const region = { id: 'region-abc', start: 10, end: 14, setOptions: vi.fn(), remove: vi.fn() };
    regionCreatedCb(ws)(region);
    expect(region.id).toBe(0); // premier slot libre
    expect(region.remove).not.toHaveBeenCalled();
  });

  it('le snap cale les bords du loop sur la grille (BPM saisi)', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120';
    bpm.dispatchEvent(new Event('input')); // grille 0..100s par pas de 0.5s
    const region = { id: 'region-abc', start: 10.26, end: 14.3, setOptions: vi.fn(), remove: vi.fn() };
    regionCreatedCb(ws)(region);
    expect(region.id).toBe(0);
    expect(region.setOptions).toHaveBeenCalledWith({ start: 10.5, end: 14.5 });
  });

  it('le champ BPM redessine la grille de beats', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120';
    bpm.dispatchEvent(new Event('input'));
    const grid = document.getElementById('cue-editor-grid');
    expect(grid).not.toBeNull();
    // 0..100s à 120 BPM → 201 lignes.
    expect(grid!.querySelectorAll('.cue-grid-line').length).toBe(201);
  });

  it('la saisie manuelle du BPM marque la grille « manuel » (badge)', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.classList.contains('hidden')).toBe(true);
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '124';
    bpm.dispatchEvent(new Event('input'));
    expect(badge.textContent).toBe('manuel');
    expect(badge.classList.contains('src-manual')).toBe(true);
  });

  it('une grille native NML (grid) pré-remplit le BPM et affiche le badge NML', async () => {
    const ws = makeWS();
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
          cues: [],
          grid: { bpm: 133, phase: 55.387418, quality: 100 },
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('133'); // pas besoin de détection client
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('NML');
    expect(badge.classList.contains('src-nml')).toBe(true);
    expect(badge.classList.contains('hidden')).toBe(false);
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('Grille native Traktor');
  });

  it('la grille native applique la PHASE (beat 1 ≠ 0) au rendu', async () => {
    const ws = makeWS();
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
          cues: [],
          grid: { bpm: 120, phase: 0.5, quality: 100 },
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const grid = document.getElementById('cue-editor-grid');
    const lines = grid!.querySelectorAll('.cue-grid-line');
    // 0.5..100s par pas de 0.5s → 200 lignes (pas 201 : le beat 0 est décalé).
    expect(lines.length).toBe(200);
    const first = lines[0] as HTMLElement;
    expect(first.style.left).toBe('0.5%'); // premier beat à 0.5s / 100s
    // Snap décalé APRÈS le beat 1 : 10.26s → beat 10.5, 14.3 → 14.5.
    const region = { id: 'region-abc', start: 10.26, end: 14.3, setOptions: vi.fn(), remove: vi.fn() };
    regionCreatedCb(ws)(region);
    expect(region.setOptions).toHaveBeenCalledWith({ start: 10.5, end: 14.5 });
  });

  it('pas de snap avant le premier beat (phase > 0 : intro non griddée)', async () => {
    const ws = makeWS();
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
          cues: [],
          grid: { bpm: 120, phase: 30, quality: 100 }, // beat 1 à 30s
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    // Un cue dessiné à 10s (dans l'intro) ne doit PAS sauter à 30s.
    const region = { id: 'region-abc', start: 10, end: 14, setOptions: vi.fn(), remove: vi.fn() };
    regionCreatedCb(ws)(region);
    expect(region.setOptions).not.toHaveBeenCalled();
  });

  it('une grille native au BPM aberrant est ignorée (garde 20–400)', async () => {
    const ws = makeWS();
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
          cues: [],
          grid: { bpm: 1.0, phase: 0, quality: 100 }, // valeur pourrie de la collection
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe(''); // pas appliquée
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.classList.contains('hidden')).toBe(true);
    // Pas de grille fantôme : aucune ligne de beat.
    expect(document.getElementById('cue-editor-grid')).toBeNull();
  });

  it('fermer la modal réinitialise la grille et le badge', async () => {
    const ws = makeWS();
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
          cues: [],
          grid: { bpm: 133, phase: 55, quality: 100 },
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.classList.contains('hidden')).toBe(false);
    mockState.setModal(null); // fermeture → destroyCueEditor
    expect(badge.classList.contains('hidden')).toBe(true);
    expect(badge.textContent).toBe('');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('');
  });

  it("🧲 Snap bascule l'état actif du bouton", async () => {
    openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const btn = document.getElementById('cue-btn-snap') as HTMLButtonElement;
    const wasOn = btn.classList.contains('snap-on');
    btn.click();
    expect(btn.classList.contains('snap-on')).toBe(!wasOn);
    btn.click();
    expect(btn.classList.contains('snap-on')).toBe(wasOn);
  });
});

describe('render/cueEditor lecture de boucle (🔁 Play)', () => {
  beforeEach(resetMocks);

  function openWithLoop(): MockWS {
    const ws = makeWS();
    ws.getCurrentTime.mockReturnValue(12);
    ws.regions.getRegions = vi.fn(() => [{ id: 0, start: 10, end: 14, remove: vi.fn() }]);
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    return ws;
  }

  it('🔁 Play joue la boucle sous le curseur et la relance à la fin du cycle', async () => {
    const ws = openWithLoop();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const btn = document.getElementById('cue-btn-loopplay') as HTMLButtonElement;
    btn.click();
    expect(ws.play).toHaveBeenCalledWith(10, 14);
    expect(btn.classList.contains('loop-playing')).toBe(true);
    ws.emit('finish'); // fin de cycle → relance immédiate
    expect(ws.play).toHaveBeenCalledTimes(2);
    btn.click(); // arrêt
    expect(ws.pause).toHaveBeenCalled();
    expect(btn.classList.contains('loop-playing')).toBe(false);
  });

  it('🔁 Play sans boucle → message et aucune lecture', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const btn = document.getElementById('cue-btn-loopplay') as HTMLButtonElement;
    btn.click();
    expect(ws.play).not.toHaveBeenCalled();
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('Aucune boucle');
  });

  it('le bouton ▶ coupe la lecture de boucle', async () => {
    const ws = openWithLoop();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const lpBtn = document.getElementById('cue-btn-loopplay') as HTMLButtonElement;
    lpBtn.click();
    expect(lpBtn.classList.contains('loop-playing')).toBe(true);
    (document.getElementById('cue-btn-play') as HTMLButtonElement).click();
    expect(ws.playPause).toHaveBeenCalled();
    expect(lpBtn.classList.contains('loop-playing')).toBe(false);
  });

  it('Suppr sur la boucle en lecture coupe le son (pause)', async () => {
    const ws = openWithLoop();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const lpBtn = document.getElementById('cue-btn-loopplay') as HTMLButtonElement;
    lpBtn.click();
    expect(lpBtn.classList.contains('loop-playing')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(lpBtn.classList.contains('loop-playing')).toBe(false);
    expect(ws.pause).toHaveBeenCalled(); // l'audio ne doit pas finir la boucle supprimée
  });

  it('clic-droit sur la boucle en lecture coupe le son (pause)', async () => {
    const ws = openWithLoop();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    (document.getElementById('cue-btn-loopplay') as HTMLButtonElement).click();
    const region = { id: 0, start: 10, end: 14, remove: vi.fn() };
    const clicked = (ws.regions.on.mock.calls as Array<[string, (...a: unknown[]) => void]>).find(
      ([evt]) => evt === 'region-clicked',
    )?.[1];
    clicked!(region, { button: 2 } as MouseEvent);
    expect(ws.pause).toHaveBeenCalled();
    expect(region.remove).toHaveBeenCalled();
  });

  it('curseur hors boucle → message explicite et lecture de la boucle trouvée', async () => {
    const ws = makeWS();
    ws.getCurrentTime.mockReturnValue(50); // loin de la boucle 10-14s
    ws.regions.getRegions = vi.fn(() => [{ id: 0, start: 10, end: 14, remove: vi.fn() }]);
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    (document.getElementById('cue-btn-loopplay') as HTMLButtonElement).click();
    expect(ws.play).toHaveBeenCalledWith(10, 14);
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('hors boucle');
  });
});

describe('render/cueEditor ajout à la collection (POST /api/track/add)', () => {
  beforeEach(resetMocks);

  function openReadOnly(): Promise<void> {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({ ok: true, multiple: false, entries: [] });
    return openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
  }

  const flush = () => new Promise(r => setTimeout(r, 0));

  it('le bouton Ajouter POST /api/track/add puis bascule en mode édition', async () => {
    await openReadOnly();
    const addRow = document.getElementById('cue-editor-addrow') as HTMLElement;
    const saveBtn = document.getElementById('cue-btn-save') as HTMLButtonElement;
    expect(addRow.classList.contains('hidden')).toBe(false);
    expect(saveBtn.disabled).toBe(true);
    // POST add puis re-match → édition active
    mockApi
      .mockResolvedValueOnce({
        ok: true,
        already: false,
        entry: { filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', dir: '/:D:/:', volume: 'D:' },
      })
      .mockResolvedValueOnce({
        ok: true,
        multiple: false,
        entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
      });
    (document.getElementById('cue-btn-add') as HTMLButtonElement).click();
    await flush();
    const addCall = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/add');
    expect(addCall).toBeDefined();
    const body = JSON.parse((addCall[1] as { body: string }).body);
    expect(body.path).toBe('/x/a.mp3');
    expect(saveBtn.disabled).toBe(false); // sauvegarde ré-activée
    expect(addRow.classList.contains('hidden')).toBe(true); // ligne retirée
    expect(document.getElementById('cue-editor-title')!.textContent).toContain('X');
    expect(showToast).toHaveBeenCalledWith('✅ piste ajoutée à la collection');
  });

  it('le volume saisi est envoyé au POST', async () => {
    await openReadOnly();
    const input = document.getElementById('cue-add-volume') as HTMLInputElement;
    input.value = 'D:';
    mockApi.mockResolvedValueOnce({ ok: true, already: false, entry: {} }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    (document.getElementById('cue-btn-add') as HTMLButtonElement).click();
    await flush();
    const addCall = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/add');
    const body = JSON.parse((addCall[1] as { body: string }).body);
    expect(body.volume).toBe('D:');
  });

  it('pré-remplit le volume depuis la config active', async () => {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({ ok: true, multiple: false, entries: [] })
      .mockResolvedValueOnce({ active: 0, configs: [{ traktor_export_volume: 'D:' }] });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    await flush();
    const input = document.getElementById('cue-add-volume') as HTMLInputElement;
    expect(input.value).toBe('D:');
  });

  it("toast d'erreur et bouton ré-activé si l'ajout échoue", async () => {
    await openReadOnly();
    mockApi.mockRejectedValueOnce(new Error('NML non configuré'));
    const btn = document.getElementById('cue-btn-add') as HTMLButtonElement;
    btn.click();
    await flush();
    expect(showToast).toHaveBeenCalledWith('❌ NML non configuré');
    expect(btn.disabled).toBe(false);
  });

  it("déjà présent → pas d'erreur, mode édition direct (already)", async () => {
    await openReadOnly();
    mockApi.mockResolvedValueOnce({ ok: true, already: true, entry: { filename: 'a.mp3' } }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    (document.getElementById('cue-btn-add') as HTMLButtonElement).click();
    await flush();
    expect(showToast).toHaveBeenCalledWith('✅ déjà dans la collection');
    const saveBtn = document.getElementById('cue-btn-save') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("fermer la modal réinitialise la ligne d'ajout", async () => {
    await openReadOnly();
    const addRow = document.getElementById('cue-editor-addrow') as HTMLElement;
    expect(addRow.classList.contains('hidden')).toBe(false);
    mockState.setModal(null); // fermeture → destroyCueEditor
    expect(addRow.classList.contains('hidden')).toBe(true);
  });

  it("fermer la modal pendant l'ajout ne la ré-ouvre pas (race)", async () => {
    await openReadOnly();
    let release: (v: unknown) => void = () => {};
    const gate = new Promise(r => {
      release = r;
    });
    mockApi.mockImplementationOnce(() => gate as Promise<unknown>); // POST en attente
    mockApi.mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    (document.getElementById('cue-btn-add') as HTMLButtonElement).click();
    mockState.setModal(null); // l'utilisateur ferme pendant la requête (~1,5 s)
    release({ ok: true, already: false, entry: {} });
    await flush();
    const modal = document.getElementById('modal-cue-editor');
    expect(modal!.classList.contains('hidden')).toBe(true); // toujours fermée
    expect(mockState.activeModal).toBeNull();
  });
});

describe('render/cueEditor phase manuelle + cache (EPIC-009)', () => {
  beforeEach(resetMocks);

  function openNoGrid(): MockWS {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    return ws;
  }

  function gridLines(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.cue-grid-line')) as HTMLElement[];
  }

  function beatgridPutCalls(): Array<{ path: string; bpm: number; phase: number; source: string }> {
    return mockApi.mock.calls
      .filter(([u]: [string]) => u === '/api/beatgrid')
      .map(([_u, opts]) => JSON.parse((opts as { body: string }).body));
  }

  it("→ 1/4 décale la grille d'un quart de beat et marque « manuel »", async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120'; // beat = 0.5 s → 1/4 = 0.125 s
    bpm.dispatchEvent(new Event('input'));
    expect(gridLines()[0].style.left).toBe('0%');
    (document.getElementById('cue-btn-nudge-fwd') as HTMLButtonElement).click();
    const lines = gridLines();
    expect(lines[0].style.left).toBe('0.125%'); // premier beat à 0.125 s / 100 s
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('manuel');
    expect(badge.classList.contains('src-manual')).toBe(true);
    // Le snap suit la grille décalée : un loop à 10.26 → beat 10.125 (pas 10.5).
    const region = { id: 'region-abc', start: 10.26, end: 14.3, setOptions: vi.fn(), remove: vi.fn() };
    const created = (ws.regions.on.mock.calls as Array<[string, (...a: unknown[]) => void]>).find(
      ([evt]) => evt === 'region-created',
    )?.[1];
    created!(region);
    expect(region.setOptions).toHaveBeenCalledWith({ start: 10.125, end: 14.125 });
    // Persistance : PUT /api/beatgrid avec la phase corrigée.
    const puts = beatgridPutCalls();
    expect(puts.length).toBeGreaterThan(0);
    expect(puts[puts.length - 1]).toMatchObject({ path: '/x/a.mp3', bpm: 120, source: 'manual' });
    expect(puts[puts.length - 1].phase).toBeCloseTo(0.125, 5);
  });

  it('← 1/4 recule la phase (et reste borné à 0)', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120';
    bpm.dispatchEvent(new Event('input'));
    (document.getElementById('cue-btn-nudge-fwd') as HTMLButtonElement).click();
    (document.getElementById('cue-btn-nudge-bwd') as HTMLButtonElement).click();
    expect(gridLines()[0].style.left).toBe('0%');
    // Encore en arrière : reste à 0 (pas de phase négative).
    (document.getElementById('cue-btn-nudge-bwd') as HTMLButtonElement).click();
    expect(gridLines()[0].style.left).toBe('0%');
  });

  it('nudge sans BPM → message explicite, grille inchangée', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    (document.getElementById('cue-btn-nudge-fwd') as HTMLButtonElement).click();
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('BPM');
    expect(gridLines().length).toBe(0); // pas de grille → rien à décaler
  });

  it('« poser le beat 1 » : clic sur la waveform fixe la phase (relativeX → secondes)', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120';
    bpm.dispatchEvent(new Event('input'));
    const btn = document.getElementById('cue-btn-beat1') as HTMLButtonElement;
    btn.click();
    expect(btn.classList.contains('beat1-on')).toBe(true);
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('poser le beat 1');
    // wavesurfer émet click(relativeX, relativeY) : 0.42 × 100 s = 42 s.
    ws.emit('click', 0.42, 0.5);
    expect(btn.classList.contains('beat1-on')).toBe(false); // sort du mode
    expect(gridLines()[0].style.left).toBe('42%');
    expect(status!.textContent).toContain('Beat 1 posé à 0:42');
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('manuel');
    const puts = beatgridPutCalls();
    expect(puts[puts.length - 1].phase).toBeCloseTo(42, 5);
  });

  it('clic hors mode beat 1 → seek normal, phase inchangée', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120';
    bpm.dispatchEvent(new Event('input'));
    ws.emit('click', 0.9, 0.5); // clic simple, mode beat 1 désactivé
    expect(gridLines()[0].style.left).toBe('0%'); // phase inchangée
  });

  it('charge la grille depuis le cache serveur (cascade NML → cache → détection)', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({
        ok: true,
        multiple: false,
        entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
      })
      .mockResolvedValueOnce({ bpm: 124, phase: 2.5, source: 'manual' }); // cache hit
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0)); // laisse le fetch du cache se résoudre
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('124'); // appliqué depuis le cache, pas de détection
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('manuel');
    expect(gridLines()[0].style.left).toBe('2.5%'); // phase 2.5 s / 100 s
  });

  it('cache vide → détection client (fallback, aucune grille appliquée)', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({
        ok: true,
        multiple: false,
        entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
      })
      .mockResolvedValueOnce({}); // cache miss
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0));
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe(''); // pas de grille (détection échoue en test)
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.classList.contains('hidden')).toBe(true);
  });

  it('la saisie manuelle du BPM persiste dans le cache (source manual)', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '128';
    bpm.dispatchEvent(new Event('input'));
    const puts = beatgridPutCalls();
    expect(puts[puts.length - 1]).toMatchObject({ path: '/x/a.mp3', bpm: 128, phase: 0, source: 'manual' });
  });

  it('une grille native aberrante (BPM hors bornes) ne bloque pas le cache (cascade)', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({
        ok: true,
        multiple: false,
        entries: [
          {
            filename: 'a.mp3',
            filesize: '1',
            artist: 'X',
            title: 'Y',
            cues: [],
            grid: { bpm: 1.0, phase: 0, quality: 100 }, // valeur pourrie de la collection
          },
        ],
      })
      .mockResolvedValueOnce({ bpm: 124, phase: 0, source: 'manual' }); // correction persistée
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0));
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('124'); // le cache s'applique malgré la grille native pourrie
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('manuel');
  });

  it('une correction manuelle en cache prime sur la grille native NML', async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({
        ok: true,
        multiple: false,
        entries: [
          {
            filename: 'a.mp3',
            filesize: '1',
            artist: 'X',
            title: 'Y',
            cues: [],
            grid: { bpm: 133, phase: 55, quality: 100 }, // native correcte
          },
        ],
      })
      .mockResolvedValueOnce({ bpm: 134, phase: 1.5, source: 'manual' }); // l'utilisateur a corrigé
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0));
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('134'); // correction manuelle appliquée, pas la native
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('manuel');
    expect(gridLines()[0].style.left).toBe('1.5%');
  });

  it("une grille native correcte n'est jamais remplacée par un cache détecté", async () => {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi
      .mockResolvedValueOnce({ configured: true })
      .mockResolvedValueOnce({
        ok: true,
        multiple: false,
        entries: [
          {
            filename: 'a.mp3',
            filesize: '1',
            artist: 'X',
            title: 'Y',
            cues: [],
            grid: { bpm: 133, phase: 55, quality: 100 },
          },
        ],
      })
      .mockResolvedValueOnce({ bpm: 128, phase: 0, source: 'detected' }); // détection plus ancienne
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0));
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('133'); // la native reste prioritaire
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('NML');
  });
});

describe('render/cueEditor analyse serveur kick/phase (EPIC-010)', () => {
  beforeEach(resetMocks);

  function openNoGrid(): MockWS {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    return ws;
  }

  const flush = () => new Promise(r => setTimeout(r, 0));

  it('le bouton 🔍 Analyser POST /api/track/analyze et applique BPM + phase + confiance', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush(); // cache miss ({} par défaut) → détection échoue silencieusement
    const btn = document.getElementById('cue-btn-analyze') as HTMLButtonElement;
    mockApi.mockResolvedValueOnce({ ok: true, bpm: 126, phase: 2.25, confidence: 0.87 });
    btn.click();
    expect(btn.disabled).toBe(true); // état ⏳ pendant le calcul
    expect(btn.textContent).toBe('⏳');
    await flush();
    const call = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/analyze');
    expect(call).toBeDefined();
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.path).toBe('/x/a.mp3');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('🔍 Analyser');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('126');
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('auto · 87 %'); // badge + confiance (EPIC-010)
    expect(badge.classList.contains('src-detected')).toBe(true);
    const lines = Array.from(document.querySelectorAll('.cue-grid-line')) as HTMLElement[];
    expect(lines[0].style.left).toBe('2.25%'); // phase 2.25 s / 100 s
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('126 BPM');
  });

  it("n'écrase pas une grille native NML active (cascade native > analyse)", async () => {
    const ws = makeWS();
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
          cues: [],
          grid: { bpm: 133, phase: 55, quality: 100 }, // native correcte
        },
      ],
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush();
    const btn = document.getElementById('cue-btn-analyze') as HTMLButtonElement;
    mockApi.mockResolvedValueOnce({ ok: true, bpm: 128, phase: 0, confidence: 0.9 });
    btn.click();
    await flush();
    const analyzeCall = mockApi.mock.calls.filter(([u]: [string]) => u === '/api/track/analyze');
    expect(analyzeCall.length).toBe(0); // pas de requête : la native prime
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('133');
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('NML');
  });

  it("n'écrase pas une grille manuelle active (cascade manual > analyse)", async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush();
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '127'; // saisie manuelle → grille « manuel »
    bpm.dispatchEvent(new Event('input'));
    const btn = document.getElementById('cue-btn-analyze') as HTMLButtonElement;
    mockApi.mockResolvedValueOnce({ ok: true, bpm: 128, phase: 0, confidence: 0.9 });
    btn.click();
    await flush();
    const analyzeCall = mockApi.mock.calls.filter(([u]: [string]) => u === '/api/track/analyze');
    expect(analyzeCall.length).toBe(0); // la correction manuelle prime
    expect(bpm.value).toBe('127'); // inchangé
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('Grille manuelle active');
  });

  it('échec analyse (bpm null) → message notice, aucune grille appliquée', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush();
    mockApi.mockResolvedValueOnce({
      ok: true,
      bpm: null,
      phase: null,
      confidence: 0,
      notice: 'Aucun tempo fiable détecté — saisis le BPM manuellement.',
    });
    (document.getElementById('cue-btn-analyze') as HTMLButtonElement).click();
    await flush();
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('Aucun tempo fiable');
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('');
  });

  it('erreur API (403/404) → message, bouton ré-activé', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush();
    const btn = document.getElementById('cue-btn-analyze') as HTMLButtonElement;
    mockApi.mockRejectedValueOnce(new Error('chemin hors des dossiers autorisés'));
    btn.click();
    await flush();
    expect(btn.disabled).toBe(false);
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('chemin hors des dossiers autorisés');
  });

  it('double clic → une seule requête /api/track/analyze', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush();
    const btn = document.getElementById('cue-btn-analyze') as HTMLButtonElement;
    mockApi.mockResolvedValueOnce({ ok: true, bpm: 126, phase: 0, confidence: 0.8 });
    btn.click();
    btn.click(); // pendant que _analyzing est vrai / bouton disabled
    await flush();
    const calls = mockApi.mock.calls.filter(([u]: [string]) => u === '/api/track/analyze');
    expect(calls.length).toBe(1);
  });

  it("fermer la modal réinitialise l'état d'analyse (bouton ré-armé)", async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const btn = document.getElementById('cue-btn-analyze') as HTMLButtonElement;
    mockApi.mockResolvedValueOnce({ ok: true, bpm: 126, phase: 0, confidence: 0.8 });
    btn.click();
    await flush();
    mockState.setModal(null); // fermeture → destroyCueEditor
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('🔍 Analyser');
  });

  it('analyseOnServer exportée fonctionne directement (bouton absent)', async () => {
    const ws = openNoGrid();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await flush();
    mockApi.mockResolvedValueOnce({ ok: true, bpm: 130, phase: 0.5, confidence: 0.6 });
    await analyzeOnServer();
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    expect(bpm.value).toBe('130');
    expect((document.getElementById('cue-bpm-badge') as HTMLElement).textContent).toBe('auto · 60 %');
  });
});

describe('render/cueEditor écriture grille NML (EPIC-011)', () => {
  beforeEach(resetMocks);

  const flush = () => new Promise(r => setTimeout(r, 0));

  function openMatched(): MockWS {
    const ws = makeWS();
    mockWSCreate.mockReturnValue(ws);
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [{ filename: 'a.mp3', filesize: '1', artist: 'X', title: 'Y', cues: [] }],
    });
    return ws;
  }

  it('💾 Grille est désactivé sans BPM (et en visualisation seule)', async () => {
    openMatched();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const btn = document.getElementById('cue-btn-writegrid') as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // pas de BPM encore
    // Saisie manuelle du BPM → activé (ENTRY résolu + BPM présent).
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '124';
    bpm.dispatchEvent(new Event('input'));
    expect(btn.disabled).toBe(false);
  });

  it('💾 Grille POST /api/track/grid avec filename/filesize/entry/bpm/phase', async () => {
    openMatched();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '126.5';
    bpm.dispatchEvent(new Event('input'));
    (document.getElementById('cue-btn-nudge-fwd') as HTMLButtonElement).click(); // phase 0.125
    const btn = document.getElementById('cue-btn-writegrid') as HTMLButtonElement;
    mockApi.mockResolvedValueOnce({ ok: true });
    btn.click();
    expect(btn.disabled).toBe(true); // état ⏳ pendant l'écriture
    await flush();
    expect(btn.disabled).toBe(false);
    const call = mockApi.mock.calls.find(([u]: [string]) => u === '/api/track/grid');
    expect(call).toBeDefined();
    const body = JSON.parse((call[1] as { body: string }).body);
    expect(body.filename).toBe('a.mp3');
    expect(body.filesize).toBe('1');
    expect(body.entry).toBe(0);
    expect(body.bpm).toBe(126.5);
    expect(body.phase).toBeCloseTo(60 / 126.5 / 4, 5); // 1/4 de beat à 126,5 BPM
    // Après écriture : la grille devient native → badge NML.
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('NML');
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('Grille écrite');
  });

  it("💾 Grille désactivé en visualisation seule (pas d'ENTRY)", async () => {
    mockWSCreate.mockReturnValue(makeWS());
    mockApi.mockResolvedValueOnce({ configured: true }).mockResolvedValueOnce({
      ok: true,
      multiple: false,
      entries: [], // piste absente de la collection → _entryRef = null
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '124';
    bpm.dispatchEvent(new Event('input'));
    const btn = document.getElementById('cue-btn-writegrid') as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // jamais d'ENTRY à modifier → bouton inactif
    btn.click(); // un bouton disabled ne déclenche rien (comportement natif)
    await flush();
    const calls = mockApi.mock.calls.filter(([u]: [string]) => u === '/api/track/grid');
    expect(calls.length).toBe(0); // aucun POST possible sans ENTRY
  });

  it("échec d'écriture → message, bouton ré-armé", async () => {
    openMatched();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '124';
    bpm.dispatchEvent(new Event('input'));
    const btn = document.getElementById('cue-btn-writegrid') as HTMLButtonElement;
    mockApi.mockRejectedValueOnce(new Error('ENTRY introuvable'));
    btn.click();
    await flush();
    expect(btn.disabled).toBe(false);
    const status = document.getElementById('cue-editor-status');
    expect(status!.textContent).toContain('ENTRY introuvable');
  });

  it('writeGridToCollection exportée (appel direct) fonctionne sans bouton', async () => {
    openMatched();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '128';
    bpm.dispatchEvent(new Event('input'));
    mockApi.mockResolvedValueOnce({ ok: true });
    await writeGridToCollection();
    const badge = document.getElementById('cue-bpm-badge') as HTMLElement;
    expect(badge.textContent).toBe('NML');
  });
});

describe('render/cueEditor bande basse + numéros de barre (EPIC-012)', () => {
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

  function fakeBuffer(seconds = 8, sr = 44100): { sampleRate: number; getChannelData: () => Float32Array } {
    const n = seconds * sr;
    // Signal : kicks périodiques à 60 Hz toutes les 0.5 s (énergie non nulle).
    const data = new Float32Array(n);
    for (let t = 0; t < seconds; t += 0.5) {
      const start = Math.round(t * sr);
      for (let i = 0; i < sr * 0.05; i++) {
        data[start + i] = 0.8 * Math.sin((2 * Math.PI * 60 * i) / sr);
      }
    }
    return { sampleRate: sr, getChannelData: () => data };
  }

  it('rend la bande basse au ready quand le buffer décodé est disponible', async () => {
    const ws = openSingle();
    (ws.getDecodedData as ReturnType<typeof vi.fn>).mockReturnValue(fakeBuffer());
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0)); // bande calculée en setTimeout(0)
    const band = document.getElementById('cue-editor-bassband');
    expect(band).not.toBeNull();
    const bars = band!.querySelectorAll('.bass-bar');
    expect(bars.length).toBe(160); // barCount par défaut
    const heights = Array.from(bars).map(b => (b as HTMLElement).style.height);
    expect(heights.some(h => h !== '2%')).toBe(true); // au moins une barre énergétique
  });

  it('pas de bande (ni erreur) quand le buffer décodé est indisponible', async () => {
    const ws = openSingle(); // getDecodedData → null par défaut
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    const band = document.getElementById('cue-editor-bassband');
    expect(band).toBeNull(); // jamais créé : best-effort silencieux
  });

  it('un buffer trop court ne casse rien', async () => {
    const ws = openSingle();
    (ws.getDecodedData as ReturnType<typeof vi.fn>).mockReturnValue({
      sampleRate: 44100,
      getChannelData: () => new Float32Array(1000),
    });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    expect(document.getElementById('cue-editor-bassband')).toBeNull();
  });

  it('numéros de barre sur les lignes fortes (tous les 4 beats)', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    // 100 s à 120 BPM → 201 beats, barres de 2 s → espacement 2 % ≥ 1.5 % → numéros affichés.
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '120';
    bpm.dispatchEvent(new Event('input'));
    const grid = document.getElementById('cue-editor-grid');
    const lines = grid!.querySelectorAll('.cue-grid-line');
    expect(lines.length).toBe(201);
    const strong = grid!.querySelectorAll('.cue-grid-line.strong');
    expect(strong.length).toBe(51); // 0,4,8,…200
    const nums = grid!.querySelectorAll('.cue-bar-num');
    expect(nums.length).toBe(51);
    expect(nums[0].textContent).toBe('1');
    expect(nums[1].textContent).toBe('2');
    expect(nums[50].textContent).toBe('51');
    // Premier numéro calé à 0 % (phase 0) — aligné sur la grille.
    expect((strong[0] as HTMLElement).style.left).toBe('0%');
  });

  it('pas de numéros quand les barres sont trop serrées (illisible)', async () => {
    const ws = openSingle();
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    // 100 s à 300 BPM → barres de 0.8 s → 0.8 % < 1.5 % → pas de numéros.
    const bpm = document.getElementById('cue-bpm') as HTMLInputElement;
    bpm.value = '300';
    bpm.dispatchEvent(new Event('input'));
    const grid = document.getElementById('cue-editor-grid');
    expect(grid!.querySelectorAll('.cue-bar-num').length).toBe(0);
    expect(grid!.querySelectorAll('.cue-grid-line.strong').length).toBeGreaterThan(0);
  });

  it('fermer la modal vide la bande (reset lifecycle)', async () => {
    const ws = openSingle();
    (ws.getDecodedData as ReturnType<typeof vi.fn>).mockReturnValue(fakeBuffer());
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    ws.emit('ready');
    await new Promise(r => setTimeout(r, 0)); // bande calculée en setTimeout(0)
    const band = document.getElementById('cue-editor-bassband');
    expect(band!.querySelectorAll('.bass-bar').length).toBe(160);
    mockState.setModal(null); // fermeture → destroyCueEditor
    expect(band!.querySelectorAll('.bass-bar').length).toBe(0);
  });
});
