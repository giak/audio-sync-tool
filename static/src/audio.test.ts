// ─── Unit tests for audio.ts ──────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Set up DOM before module evaluation (audio.ts calls getElementById at module scope)
vi.hoisted(() => {
  document.body.innerHTML = `
    <div id="player-bar" class="hidden">
      <span id="player-filename"></span>
      <span id="player-time">0:00 / 0:00</span>
      <div id="player-progress"><div id="player-progress-fill" style="width:0%"></div></div>
      <button id="player-stop"></button>
      <button id="player-seek-bwd"></button>
      <button id="player-seek-fwd"></button>
      <input id="player-step" value="20">
    </div>
  `;

  // Mock Audio will be set up per-test via globalThis
  class MockAudio {
    url: string;
    duration = 120;
    currentTime = 0;
    paused = true;
    ontimeupdate: (() => void) | null = null;
    onloadedmetadata: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
      this.url = url;
      (globalThis as any).__lastMockAudio = this;
    }

    play() {
      this.paused = false;
      return new Promise<void>((resolve, reject) => {
        (globalThis as any).__audioResolve = resolve;
        (globalThis as any).__audioReject = reject;
      });
    }

    pause() {
      this.paused = true;
    }
  }
  (globalThis as any).__MockAudio = MockAudio;
});

vi.mock('./utils.js', () => ({
  formatTime: vi.fn((s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }),
}));

// Partially mock state.js to spy on emit() while keeping real state
vi.mock('./state.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, emit: vi.fn() };
});

beforeEach(() => {
  (globalThis as any).Audio = (globalThis as any).__MockAudio;
  (globalThis as any).__audioResolve = null;
  (globalThis as any).__audioReject = null;
  // Reset player bar to hidden
  document.getElementById('player-bar')!.classList.add('hidden');
  document.getElementById('player-progress-fill')!.style.width = '0%';
  // Remove any stray play buttons
  for (const el of document.querySelectorAll('.play-btn')) el.remove();
});

afterEach(() => {
  stopPlayer();
  delete (globalThis as any).Audio;
});

import { emit } from './state.js';
import { initAudioUI, isAudioPlaying, seekAudio, stopPlayer, togglePlay } from './audio.js';

/** Wait for pending microtasks (e.g. .then() callbacks from play promise) */
function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('isAudioPlaying', () => {
  it('returns falsy when no audio is playing', () => {
    expect(isAudioPlaying()).toBeNull();
  });

  it('returns false when audio was stopped', async () => {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);

    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    stopPlayer();
    expect(isAudioPlaying()).toBeNull();

    btn.remove();
  });
});

describe('togglePlay', () => {
  function makeBtn(): HTMLElement {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);
    return btn;
  }

  it('shows the player bar when play succeeds', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(false);
    btn.remove();
  });

  it('updates button text to ⏹ on successful play', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    expect(btn.textContent).toBe('⏹');
    expect(btn.classList.contains('playing')).toBe(true);
    btn.remove();
  });

  it('stops if clicking the same playing file again', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();
    expect(isAudioPlaying()).toBe(true);

    togglePlay('test.mp3', '/path/test.mp3', btn);
    expect(isAudioPlaying()).toBeNull();
    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(true);
    expect(btn.textContent).toBe('▶');
    btn.remove();
  });

  it('resets button text on play failure', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioReject(new Error('fail'));
    await flush();

    expect(btn.classList.contains('playing')).toBe(false);
    btn.remove();
  });

  it('shows truncated filename in player bar (> 30 chars)', async () => {
    const btn = makeBtn();
    const longName = `${'a'.repeat(35)}.mp3`;
    togglePlay(longName, `/path/${longName}`, btn);
    (globalThis as any).__audioResolve();
    await flush();

    const filenameEl = document.getElementById('player-filename')!;
    expect(filenameEl.textContent!.length).toBeLessThanOrEqual(30);
    expect(filenameEl.textContent).toContain('...');
    btn.remove();
  });
});

describe('audio:changed event', () => {
  it('stopPlayer emits audio:changed', () => {
    stopPlayer();
    expect(emit).toHaveBeenCalledWith('audio:changed');
  });

  it('togglePlay emits audio:changed on successful play', async () => {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);

    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    // Emitted from the .then() success callback (no previous audio)
    expect(emit).toHaveBeenCalledWith('audio:changed');
    btn.remove();
  });

  it('togglePlay emits audio:changed when stopping same file', async () => {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);

    togglePlay('test.mp3', '/path/test.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();
    vi.clearAllMocks();

    // Second click on same file → stopPlayer → emits audio:changed
    togglePlay('test.mp3', '/path/test.mp3', btn);
    expect(emit).toHaveBeenCalledWith('audio:changed');
    btn.remove();
  });

  it('onended callback emits audio:changed', async () => {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);

    togglePlay('end.mp3', '/path/end.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    const mockAudioInstance = (globalThis as any).__lastMockAudio;
    expect(mockAudioInstance?.onended).toBeDefined();
    vi.clearAllMocks();
    mockAudioInstance!.onended!();
    expect(emit).toHaveBeenCalledWith('audio:changed');
    btn.remove();
  });

  it('onerror callback emits audio:changed', async () => {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);

    togglePlay('err.mp3', '/path/err.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    const mockAudioInstance = (globalThis as any).__lastMockAudio;
    expect(mockAudioInstance?.onerror).toBeDefined();
    vi.clearAllMocks();
    mockAudioInstance!.onerror!();
    expect(emit).toHaveBeenCalledWith('audio:changed');
    btn.remove();
  });
});

describe('stopPlayer', () => {
  it('hides the player bar', () => {
    document.getElementById('player-bar')!.classList.remove('hidden');
    stopPlayer();
    expect(document.getElementById('player-bar')!.classList.contains('hidden')).toBe(true);
  });

  it('resets all playing buttons', () => {
    const btn1 = document.createElement('span');
    btn1.className = 'play-btn playing';
    btn1.textContent = '⏹';
    document.body.appendChild(btn1);

    stopPlayer();
    expect(btn1.textContent).toBe('▶');
    expect(btn1.classList.contains('playing')).toBe(false);
    btn1.remove();
  });

  it('removes led-playing class from file spans', () => {
    const span = document.createElement('span');
    span.className = 'file led-playing';
    document.body.appendChild(span);
    stopPlayer();
    expect(span.classList.contains('led-playing')).toBe(false);
    span.remove();
  });
});

describe('seekAudio', () => {
  function makeBtn(): HTMLElement {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);
    return btn;
  }

  it('moves currentTime forward by the step value', async () => {
    const btn = makeBtn();
    togglePlay('seek.mp3', '/path/seek.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    seekAudio(1);
    const pct = document.getElementById('player-progress-fill')!.style.width;
    expect(parseFloat(pct)).toBeCloseTo(16.67, 1);

    seekAudio(1);
    const pct2 = document.getElementById('player-progress-fill')!.style.width;
    expect(parseFloat(pct2)).toBeCloseTo(33.33, 1);
    btn.remove();
  });

  it('moves currentTime backward by the step value', async () => {
    const btn = makeBtn();
    togglePlay('seek2.mp3', '/path/seek2.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    seekAudio(1);
    seekAudio(1);
    seekAudio(-1);

    const pct = document.getElementById('player-progress-fill')!.style.width;
    expect(parseFloat(pct)).toBeCloseTo(16.67, 1);
    btn.remove();
  });

  it('clamps at 0 (cannot go negative)', async () => {
    const btn = makeBtn();
    togglePlay('seek3.mp3', '/path/seek3.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    seekAudio(-10);
    const pct = document.getElementById('player-progress-fill')!.style.width;
    expect(pct).toBe('0%');
    btn.remove();
  });

  it('clamps at duration (cannot exceed)', async () => {
    const btn = makeBtn();
    togglePlay('seek4.mp3', '/path/seek4.mp3', btn);
    (globalThis as any).__audioResolve();
    await flush();

    seekAudio(10);
    const pct = document.getElementById('player-progress-fill')!.style.width;
    expect(pct).toBe('100%');
    btn.remove();
  });
});

describe('initAudioUI', () => {
  it('wires the stop button to stopPlayer', () => {
    initAudioUI();
    expect(typeof document.getElementById('player-stop')!.onclick).toBe('function');
  });

  it('wires the seek buttons', () => {
    initAudioUI();
    expect(typeof document.getElementById('player-seek-bwd')!.onclick).toBe('function');
    expect(typeof document.getElementById('player-seek-fwd')!.onclick).toBe('function');
  });

  it('wires the progress bar click handler', () => {
    initAudioUI();
    expect(typeof document.getElementById('player-progress')!.onclick).toBe('function');
  });
});
