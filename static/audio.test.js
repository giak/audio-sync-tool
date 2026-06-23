// ─── Unit tests for audio.js ──────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set up DOM before module evaluation (audio.js calls getElementById at module scope)
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
    constructor(url) {
      this.url = url;
      this.duration = 120;
      this.currentTime = 0;
      this.paused = true;
      this.ontimeupdate = null;
      this.onloadedmetadata = null;
      this.onended = null;
      this.onerror = null;
    }
    play() {
      this.paused = false;
      return new Promise((resolve, reject) => {
        globalThis.__audioResolve = resolve;
        globalThis.__audioReject = reject;
      });
    }
    pause() {
      this.paused = true;
    }
  }
  globalThis.__MockAudio = MockAudio;
});

vi.mock('./utils.js', () => ({
  formatTime: vi.fn((s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }),
}));

beforeEach(() => {
  globalThis.Audio = globalThis.__MockAudio;
  globalThis.__audioResolve = null;
  globalThis.__audioReject = null;
  // Reset player bar to hidden
  document.getElementById('player-bar').classList.add('hidden');
  document.getElementById('player-progress-fill').style.width = '0%';
  // Remove any stray play buttons
  document.querySelectorAll('.play-btn').forEach(b => b.remove());
});

afterEach(() => {
  stopPlayer();
  delete globalThis.Audio;
});

import { stopPlayer, togglePlay, seekAudio, isAudioPlaying, initAudioUI } from './audio.js';

/** Wait for pending microtasks (e.g. .then() callbacks from play promise) */
function flush() {
  return new Promise(r => setTimeout(r, 0));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('isAudioPlaying', () => {
  it('returns falsy when no audio is playing', () => {
    // currentAudio is null → null && anything = null (falsy)
    expect(isAudioPlaying()).toBeNull();
  });

  it('returns false when audio was stopped', async () => {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);

    togglePlay('test.mp3', '/path/test.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    stopPlayer();
    expect(isAudioPlaying()).toBeNull();

    btn.remove();
  });
});

describe('togglePlay', () => {
  function makeBtn() {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);
    return btn;
  }

  it('shows the player bar when play succeeds', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(false);
    btn.remove();
  });

  it('updates button text to ⏹ on successful play', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    expect(btn.textContent).toBe('⏹');
    expect(btn.classList.contains('playing')).toBe(true);
    btn.remove();
  });

  it('stops if clicking the same playing file again', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    globalThis.__audioResolve();
    await flush();
    expect(isAudioPlaying()).toBe(true);

    togglePlay('test.mp3', '/path/test.mp3', btn);
    // stopPlayer is called synchronously inside togglePlay for same file
    expect(isAudioPlaying()).toBeNull();
    expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(true);
    expect(btn.textContent).toBe('▶');
    btn.remove();
  });

  it('resets button text on play failure', async () => {
    const btn = makeBtn();
    togglePlay('test.mp3', '/path/test.mp3', btn);
    globalThis.__audioReject(new Error('fail'));
    await flush();

    expect(btn.classList.contains('playing')).toBe(false);
    btn.remove();
  });

  it('shows truncated filename in player bar (> 30 chars)', async () => {
    const btn = makeBtn();
    const longName = 'a'.repeat(35) + '.mp3';
    togglePlay(longName, '/path/' + longName, btn);
    globalThis.__audioResolve();
    await flush();

    const filenameEl = document.getElementById('player-filename');
    expect(filenameEl.textContent.length).toBeLessThanOrEqual(30);
    expect(filenameEl.textContent).toContain('...');
    btn.remove();
  });
});

describe('stopPlayer', () => {
  it('hides the player bar', () => {
    document.getElementById('player-bar').classList.remove('hidden');
    stopPlayer();
    expect(document.getElementById('player-bar').classList.contains('hidden')).toBe(true);
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
  function makeBtn() {
    const btn = document.createElement('span');
    btn.className = 'play-btn';
    btn.textContent = '▶';
    document.body.appendChild(btn);
    return btn;
  }

  it('moves currentTime forward by the step value', async () => {
    const btn = makeBtn();
    togglePlay('seek.mp3', '/path/seek.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    seekAudio(1);
    // 20s on 120s = 16.666...%
    const pct = document.getElementById('player-progress-fill').style.width;
    expect(parseFloat(pct)).toBeCloseTo(16.67, 1);

    seekAudio(1);
    const pct2 = document.getElementById('player-progress-fill').style.width;
    expect(parseFloat(pct2)).toBeCloseTo(33.33, 1);
    btn.remove();
  });

  it('moves currentTime backward by the step value', async () => {
    const btn = makeBtn();
    togglePlay('seek2.mp3', '/path/seek2.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    seekAudio(1); // +20
    seekAudio(1); // +40
    seekAudio(-1); // +20

    const pct = document.getElementById('player-progress-fill').style.width;
    expect(parseFloat(pct)).toBeCloseTo(16.67, 1);
    btn.remove();
  });

  it('clamps at 0 (cannot go negative)', async () => {
    const btn = makeBtn();
    togglePlay('seek3.mp3', '/path/seek3.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    seekAudio(-10); // -200s → clamps to 0
    const pct = document.getElementById('player-progress-fill').style.width;
    expect(pct).toBe('0%');
    btn.remove();
  });

  it('clamps at duration (cannot exceed)', async () => {
    const btn = makeBtn();
    togglePlay('seek4.mp3', '/path/seek4.mp3', btn);
    globalThis.__audioResolve();
    await flush();

    seekAudio(10); // +200s > 120s → clamps to 120
    const pct = document.getElementById('player-progress-fill').style.width;
    expect(pct).toBe('100%');
    btn.remove();
  });
});

describe('initAudioUI', () => {
  it('wires the stop button to stopPlayer', () => {
    initAudioUI();
    expect(typeof document.getElementById('player-stop').onclick).toBe('function');
  });

  it('wires the seek buttons', () => {
    initAudioUI();
    expect(typeof document.getElementById('player-seek-bwd').onclick).toBe('function');
    expect(typeof document.getElementById('player-seek-fwd').onclick).toBe('function');
  });

  it('wires the progress bar click handler', () => {
    initAudioUI();
    expect(typeof document.getElementById('player-progress').onclick).toBe('function');
  });
});
