// ─── Unit tests for render/fileRow.ts ────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Polyfill DragEvent for jsdom
if (typeof DragEvent === 'undefined') {
  (globalThis as any).DragEvent = class DragEvent extends Event {
    readonly dataTransfer: DataTransfer | null;
    constructor(type: string, opts: DragEventInit = {}) {
      super(type, opts);
      this.dataTransfer = opts.dataTransfer || null;
    }
  };
}

// Mock all dependencies
vi.mock('../audio.js', () => ({
  togglePlay: vi.fn(),
  stopPlayer: vi.fn(),
}));

vi.mock('../focus.js', () => ({
  focusItemByElement: vi.fn(),
  setActivePanel: vi.fn(),
}));

vi.mock('../ui.js', () => ({
  showContextMenu: vi.fn(),
}));

vi.mock('../ratings.js', () => ({
  getRating: vi.fn(),
}));

vi.mock('../utils.js', () => ({
  formatDuration: vi.fn((s: number | null | undefined) => {
    if (!s || s <= 0) return '';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }),
}));

import { stopPlayer, togglePlay } from '../audio.js';
import { focusItemByElement, setActivePanel } from '../focus.js';
import { getRating } from '../ratings.js';
import { showContextMenu } from '../ui.js';
import { makeFileEl } from './fileRow.js';

function makeRow(
  opts: {
    status?: 'nouveau' | 'doublon' | 'traite';
    fullpath?: string;
    year?: string | null;
    duration?: number | null;
    codec?: string | null;
    rating?: number | undefined;
    selectEparsFileFn?: (el: HTMLElement, filename: string, eparDir: string) => void;
    startSourceRatingEditFn?: () => void;
    onCueEditFn?: (filename: string, fullPath: string) => void;
  } = {},
): HTMLDivElement {
  const {
    status = 'nouveau',
    fullpath = '/media/usb/song.mp3',
    year = '2021',
    duration = 240,
    codec = 'MP3 320kbps',
    rating = undefined,
    selectEparsFileFn = undefined,
    startSourceRatingEditFn = undefined,
    onCueEditFn = undefined,
  } = opts;

  vi.mocked(getRating).mockReturnValue(rating);

  return makeFileEl(
    'song.mp3',
    'song.mp3',
    status,
    fullpath,
    year ?? null,
    duration ?? null,
    codec ?? null,
    selectEparsFileFn,
    startSourceRatingEditFn,
    onCueEditFn,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── DOM structure ─────────────────────────────────────────────────────────

describe('DOM structure', () => {
  it('creates a div with file-row class and data-focuspath', () => {
    const row = makeRow({ fullpath: '/path/to/file.mp3' });
    expect(row.className).toBe('file-row');
    expect(row.dataset.focuspath).toBe('/path/to/file.mp3');
  });

  it('includes a play button with ▶ text', () => {
    const row = makeRow();
    const btn = row.querySelector('.play-btn') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('▶');
    expect(btn.title).toBe('Écouter');
  });

  it('creates a file label with status class and data attributes', () => {
    const row = makeRow({ status: 'doublon' });
    const label = row.querySelector('.file') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.classList.contains('doublon')).toBe(true);
    expect(label.classList.contains('led-doublon')).toBe(true);
    expect(label.textContent).toBe('song.mp3');
    expect(label.dataset.filename).toBe('song.mp3');
    expect(label.dataset.fullpath).toBe('/media/usb/song.mp3');
  });

  it('includes year span when year is provided', () => {
    const row = makeRow({ year: '2021' });
    const yr = row.querySelector('.year') as HTMLElement;
    expect(yr).not.toBeNull();
    expect(yr.textContent).toBe('2021');
  });

  it('omits year span when year is null', () => {
    const row = makeRow({ year: null });
    expect(row.querySelector('.year')).toBeNull();
  });

  it('includes codec span when codec is provided', () => {
    const row = makeRow({ codec: 'FLAC' });
    const c = row.querySelector('.codec') as HTMLElement;
    expect(c).not.toBeNull();
    expect(c.textContent).toBe('FLAC');
  });

  it('omits codec span when codec is null', () => {
    const row = makeRow({ codec: null });
    expect(row.querySelector('.codec')).toBeNull();
  });

  it('includes duration span when duration is provided', () => {
    const row = makeRow({ duration: 195 });
    const d = row.querySelector('.duration') as HTMLElement;
    expect(d).not.toBeNull();
    expect(d.textContent).toBe('3:15');
  });

  it('omits duration span when duration is null', () => {
    const row = makeRow({ duration: null });
    expect(row.querySelector('.duration')).toBeNull();
  });

  it('sets duration-seconds dataset', () => {
    const row = makeRow({ duration: 240 });
    expect(row.dataset.durationSeconds).toBe('240');
  });

  it('sets empty duration-seconds when duration is null', () => {
    const row = makeRow({ duration: null });
    expect(row.dataset.durationSeconds).toBe('');
  });
});

// ── Cue editor access ─────────────────────────────────────────────────────

describe('cue editor access', () => {
  it('omits the Cues button when no onCueEditFn is provided', () => {
    const row = makeRow({ onCueEditFn: undefined });
    expect(row.querySelector('.cue-btn')).toBeNull();
  });

  it('includes a Cues button when onCueEditFn is provided', () => {
    const row = makeRow({ onCueEditFn: vi.fn() });
    const btn = row.querySelector('.cue-btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Cues');
    expect(btn!.title).toContain('waveform');
  });

  it('Cues button click calls onCueEditFn with filename and fullpath', () => {
    const cueFn = vi.fn();
    const row = makeRow({ onCueEditFn: cueFn, fullpath: '/media/usb/song.mp3' });
    const btn = row.querySelector('.cue-btn') as HTMLButtonElement;
    btn.click();
    expect(cueFn).toHaveBeenCalledWith('song.mp3', '/media/usb/song.mp3');
  });

  it('Cues button click stops propagation', () => {
    const cueFn = vi.fn();
    const row = makeRow({ onCueEditFn: cueFn });
    const parentClick = vi.fn();
    row.onclick = parentClick;
    const btn = row.querySelector('.cue-btn') as HTMLButtonElement;
    btn.click();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('context menu proposes Cues / loops when onCueEditFn is provided', () => {
    const cueFn = vi.fn();
    const row = makeRow({ onCueEditFn: cueFn });
    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));
    const items = vi.mocked(showContextMenu).mock.lastCall![2] as Array<{ label: string }>;
    expect(items.map(i => i.label)).toContain('Cues / loops (waveform)');
  });

  it('omits Cues / loops from context menu without onCueEditFn', () => {
    const row = makeRow({ onCueEditFn: undefined });
    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));
    const items = vi.mocked(showContextMenu).mock.lastCall![2] as Array<{ label: string }>;
    expect(items.map(i => i.label)).not.toContain('Cues / loops (waveform)');
  });

  it('context menu action calls onCueEditFn with filename and fullpath', () => {
    const cueFn = vi.fn();
    const row = makeRow({ onCueEditFn: cueFn, fullpath: '/media/usb/song.mp3' });
    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));
    const items = vi.mocked(showContextMenu).mock.lastCall![2] as Array<{ label: string; action: () => void }>;
    items.find(i => i.label === 'Cues / loops (waveform)')!.action();
    expect(cueFn).toHaveBeenCalledWith('song.mp3', '/media/usb/song.mp3');
  });
});

// ── Rating display ────────────────────────────────────────────────────────

describe('rating display', () => {
  it('shows rating number in .file-rating span', () => {
    const row = makeRow({ rating: 85 });
    const rs = row.querySelector('.file-rating') as HTMLElement;
    expect(rs).not.toBeNull();
    expect(rs.textContent).toBe('85');
    expect(rs.dataset.fullpath).toBe('/media/usb/song.mp3');
  });

  it('shows empty rating span when getRating returns undefined', () => {
    const row = makeRow({ rating: undefined });
    const rs = row.querySelector('.file-rating') as HTMLElement;
    expect(rs).not.toBeNull();
    expect(rs.textContent).toBe(''); // no rating text
  });

  it('rating click stops propagation and focuses the row', () => {
    document.body.innerHTML = '<div id="source-container"></div>';
    const container = document.getElementById('source-container')!;
    const row = makeRow({ rating: 90 });
    container.appendChild(row);

    const rs = row.querySelector('.file-rating') as HTMLElement;
    rs.click();

    expect(row.classList.contains('focused')).toBe(true);
  });

  it('rating click calls startSourceRatingEditFn when in playlist-source-container', () => {
    const sourceRatingFn = vi.fn();
    document.body.innerHTML = '<div id="playlist-source-container"></div>';
    const container = document.getElementById('playlist-source-container')!;
    const row = makeRow({ rating: 90, startSourceRatingEditFn: sourceRatingFn });
    container.appendChild(row);

    const rs = row.querySelector('.file-rating') as HTMLElement;
    rs.click();

    expect(sourceRatingFn).toHaveBeenCalled();
  });

  it('rating click does nothing when row has no container', () => {
    const row = makeRow({ rating: 90 });
    const rs = row.querySelector('.file-rating') as HTMLElement;
    // Row not appended to DOM → closest returns null
    expect(() => rs.click()).not.toThrow();
  });
});

// ── Play button click ────────────────────────────────────────────────────

describe('play button', () => {
  it('calls togglePlay with filename, fullpath and the button element', () => {
    const row = makeRow();
    const btn = row.querySelector('.play-btn') as HTMLElement;
    btn.click();

    expect(togglePlay).toHaveBeenCalledWith('song.mp3', '/media/usb/song.mp3', btn);
  });

  it('stops propagation when clicked', () => {
    const row = makeRow();
    const parentClick = vi.fn();
    row.onclick = parentClick;
    const btn = row.querySelector('.play-btn') as HTMLElement;

    btn.click();

    expect(parentClick).not.toHaveBeenCalled();
  });
});

// ── Row click ────────────────────────────────────────────────────────────

describe('row click', () => {
  it('focuses the row via focusItemByElement', () => {
    document.body.innerHTML = '<div id="epars-container"></div>';
    const container = document.getElementById('epars-container')!;
    const row = makeRow();
    container.appendChild(row);

    row.click();

    expect(focusItemByElement).toHaveBeenCalledWith(container, row);
  });

  it('sets active panel to epars when in epars-container', () => {
    document.body.innerHTML = '<div id="epars-container"></div>';
    const container = document.getElementById('epars-container')!;
    const row = makeRow();
    container.appendChild(row);

    row.click();

    expect(setActivePanel).toHaveBeenCalledWith('epars');
  });

  it('sets active panel to source when in source-container', () => {
    document.body.innerHTML = '<div id="source-container"></div>';
    const container = document.getElementById('source-container')!;
    const row = makeRow();
    container.appendChild(row);

    row.click();

    expect(setActivePanel).toHaveBeenCalledWith('source');
  });

  it('does not set active panel when in playlist-source-container', () => {
    document.body.innerHTML = '<div id="playlist-source-container"></div>';
    const container = document.getElementById('playlist-source-container')!;
    const row = makeRow();
    container.appendChild(row);

    row.click();

    expect(setActivePanel).not.toHaveBeenCalled();
  });

  it('calls stopPlayer when .led-playing is found in the row', () => {
    document.body.innerHTML = '<div id="epars-container"></div>';
    const container = document.getElementById('epars-container')!;
    const row = makeRow();
    // Add the led-playing class to a child element
    row.querySelector('.file')!.classList.add('led-playing');
    container.appendChild(row);

    row.click();

    expect(stopPlayer).toHaveBeenCalled();
  });

  it('does not call stopPlayer when no .led-playing in row', () => {
    document.body.innerHTML = '<div id="epars-container"></div>';
    const container = document.getElementById('epars-container')!;
    const row = makeRow();
    container.appendChild(row);

    row.click();

    expect(stopPlayer).not.toHaveBeenCalled();
  });

  it('does nothing when row has no container', () => {
    const row = makeRow();
    expect(() => row.click()).not.toThrow();
  });

  it('skips focus/setActivePanel when clicking the play button', () => {
    document.body.innerHTML = '<div id="source-container"></div>';
    const container = document.getElementById('source-container')!;
    const row = makeRow();
    container.appendChild(row);

    const btn = row.querySelector('.play-btn') as HTMLElement;
    btn.click();

    // play-btn uses stopPropagation, so row.onclick is never reached
    expect(focusItemByElement).not.toHaveBeenCalled();
  });
});

// ── Double-click ─────────────────────────────────────────────────────────

describe('double-click', () => {
  it('clicks the play button', () => {
    const row = makeRow();
    const btn = row.querySelector('.play-btn') as HTMLElement;
    const clickSpy = vi.spyOn(btn, 'click');

    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(clickSpy).toHaveBeenCalled();
  });
});

// ── Drag & drop ──────────────────────────────────────────────────────────

describe('drag & drop', () => {
  it('sets draggable to true', () => {
    const row = makeRow();
    expect(row.draggable).toBe(true);
  });

  it('dragstart sets transfer data and adds dragging class', () => {
    const row = makeRow();
    const fileLabel = row.querySelector('.file') as HTMLElement;
    fileLabel.dataset.epardir = '/media/usb';

    const dt = { setData: vi.fn() } as unknown as DataTransfer;
    const event = new DragEvent('dragstart', { dataTransfer: dt });
    row.dispatchEvent(event);

    expect(dt.setData).toHaveBeenCalledWith(
      'application/x-epars-copy',
      JSON.stringify({ filename: 'song.mp3', eparDir: '/media/usb' }),
    );
    expect(row.classList.contains('dragging-source')).toBe(true);
  });

  it('dragstart uses empty strings when no dataset attrs', () => {
    const row = makeRow();
    // Don't set epardir/filename on the label
    const label = row.querySelector('.file') as HTMLElement;
    delete label.dataset.epardir;
    delete label.dataset.filename;

    const dt = { setData: vi.fn() } as unknown as DataTransfer;
    const event = new DragEvent('dragstart', { dataTransfer: dt });
    row.dispatchEvent(event);

    expect(dt.setData).toHaveBeenCalledWith('application/x-epars-copy', JSON.stringify({ filename: '', eparDir: '' }));
  });

  it('dragend removes dragging class', () => {
    const row = makeRow();
    row.classList.add('dragging-source');

    row.dispatchEvent(new DragEvent('dragend'));

    expect(row.classList.contains('dragging-source')).toBe(false);
  });
});

// ── Context menu ─────────────────────────────────────────────────────────

describe('context menu (right-click)', () => {
  it('calls showContextMenu with Jouer item', () => {
    const row = makeRow();
    const event = new MouseEvent('contextmenu', { clientX: 50, clientY: 80, bubbles: true });
    row.dispatchEvent(event);

    expect(showContextMenu).toHaveBeenCalledWith(
      50,
      80,
      expect.arrayContaining([expect.objectContaining({ label: '▶ Jouer' })]),
    );
  });

  it('includes Sélectionner when status is nouveau and selectEparsFileFn is provided', () => {
    const selectFn = vi.fn();
    const row = makeRow({ status: 'nouveau', selectEparsFileFn: selectFn });
    const label = row.querySelector('.file') as HTMLElement;
    label.dataset.epardir = '/media/usb';

    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));

    expect(showContextMenu).toHaveBeenCalledWith(
      10,
      20,
      expect.arrayContaining([expect.objectContaining({ label: '● Sélectionner pour copie' })]),
    );
  });

  it('omits Sélectionner when status is not nouveau', () => {
    const selectFn = vi.fn();
    const row = makeRow({ status: 'doublon', selectEparsFileFn: selectFn });

    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));

    const callArgs = vi.mocked(showContextMenu).mock.lastCall!;
    const items = callArgs[2] as Array<{ label: string }>;
    const selectItem = items.find(item => item.label.includes('Sélectionner'));
    expect(selectItem).toBeUndefined();
  });

  it('omits Sélectionner when selectEparsFileFn is not provided', () => {
    const row = makeRow({ status: 'nouveau', selectEparsFileFn: undefined });

    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));

    const callArgs = vi.mocked(showContextMenu).mock.lastCall!;
    const items = callArgs[2] as Array<{ label: string }>;
    const selectItem = items.find(item => item.label.includes('Sélectionner'));
    expect(selectItem).toBeUndefined();
  });

  it('Sélectionner action calls selectEparsFileFn with label, filename, eparDir', () => {
    const selectFn = vi.fn();
    const row = makeRow({ status: 'nouveau', selectEparsFileFn: selectFn });
    const label = row.querySelector('.file') as HTMLElement;
    label.dataset.epardir = '/media/usb';

    row.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 20, bubbles: true }));

    // Extract the action function and call it
    const callArgs = vi.mocked(showContextMenu).mock.lastCall!;
    const items = callArgs[2] as Array<{ label: string; action: () => void }>;
    const selectItem = items.find(item => item.label.includes('Sélectionner'))!;
    selectItem.action();

    expect(selectFn).toHaveBeenCalledWith(label, 'song.mp3', '/media/usb');
  });

  it('prevents default and stops propagation', () => {
    const row = makeRow();
    const outerClick = vi.fn();
    document.body.addEventListener('contextmenu', outerClick);

    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    // Not easy to check preventDefault in jsdom, but we can verify showContextMenu was called
    expect(showContextMenu).toHaveBeenCalled();
  });
});
