// ─── Tests: render/cueEditor.ts — scaffold (modal open/close) ────────────
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

vi.mock('../api.js', () => ({ api: mockApi }));
vi.mock('../state.js', () => ({ state: mockState }));
vi.mock('../ui.js', () => ({ showToast: vi.fn() }));

import { openCueEditor } from './cueEditor.js';

describe('render/cueEditor scaffold', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="modal-cue-editor" class="modal hidden">
        <div id="cue-editor-title"></div>
        <div id="cue-editor-status"></div>
      </div>
    `;
    mockApi.mockReset();
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
    mockApi.mockResolvedValue({ configured: true });
    await openCueEditor({ filename: 'a.mp3', fullPath: '/x/a.mp3' });
    expect(mockState.activeModal).toBe('cueEditor');
    expect(mockApi).toHaveBeenCalledWith('/api/nml/status');
  });
});