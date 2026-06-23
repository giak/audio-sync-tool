// ─── Unit tests for focus.ts ────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getItems,
  focusItemByPath,
  getFocusedItem,
  focusItemByElement,
  navigateFocus,
  navigateColumn,
  setActivePanel,
  revalidateFocus,
} from './focus.js';
import { state } from './state.js';

// Helper: create a fixture DOM with epars and source containers
function setupDOM(): void {
  document.body.innerHTML = `
    <div id="panel-left" class="panel"></div>
    <div id="panel-right" class="panel"></div>
    <div id="epars-container">
      <div class="directory" data-focuspath="epars-dir:/media/usb"></div>
      <div class="children">
        <div class="file-row" data-focuspath="/media/usb/song.mp3">
          <span class="file nouveau led-nouveau" data-filename="song.mp3" data-epardir="/media/usb">song.mp3</span>
        </div>
        <div class="file-row" data-focuspath="/media/usb/track.flac">
          <span class="file doublon led-doublon" data-filename="track.flac" data-epardir="/media/usb">track.flac</span>
        </div>
        <div class="file-row" data-focuspath="/media/usb/lost.wav">
          <span class="file traite led-traite" data-filename="lost.wav" data-epardir="/media/usb">lost.wav</span>
        </div>
      </div>
    </div>
    <div id="source-container">
      <div class="directory" data-dirpath="/src/Rock" data-focuspath="/src/Rock"></div>
      <div class="directory" data-dirpath="/src/Jazz" data-focuspath="/src/Jazz"></div>
      <div class="directory expanded" data-dirpath="/src/Techno" data-focuspath="/src/Techno">
        <div class="children">
          <div class="file-row" data-focuspath="/src/Techno/beat.mp3">
            <span class="file doublon" data-filename="beat.mp3">beat.mp3</span>
          </div>
        </div>
      </div>
      <div class="directory" data-dirpath="/src/Ambient" data-focuspath="/src/Ambient"></div>
    </div>
    <div id="status-text"></div>
  `;

  // Reset state
  state.activePanel = 'epars';
  state.eparsFocusPath = null;
  state.sourceFocusPath = null;
}

// Mock scrollIntoView (not implemented in jsdom)
beforeEach(() => {
  (Element.prototype as any).scrollIntoView = vi.fn();
  setupDOM();
});

describe('getItems', () => {
  it('returns file-row + directory for epars container', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    expect(items.length).toBe(4); // 1 directory + 3 file-rows
    expect(items[0].classList.contains('directory')).toBe(true);
    expect(items[1].classList.contains('file-row')).toBe(true);
  });

  it('returns only directory for source container', () => {
    const container = document.getElementById('source-container') as HTMLElement;
    const items = getItems(container);
    expect(items.length).toBe(4); // 4 directories
    expect([...items].every(el => el.classList.contains('directory'))).toBe(true);
  });
});

describe('focusItemByPath', () => {
  it('focuses item by data-focuspath', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    focusItemByPath(container, '/media/usb/track.flac');
    const focused = getFocusedItem(container) as HTMLElement;
    expect(focused).not.toBeNull();
    expect(focused.dataset.focuspath).toBe('/media/usb/track.flac');
  });

  it('falls back to first item when path not found', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    focusItemByPath(container, '/nonexistent/path.mp3');
    const focused = getFocusedItem(container) as HTMLElement;
    expect(focused).not.toBeNull();
    expect(focused).toBe(getItems(container)[0]);
  });

  it('focuses first item when path is null', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    focusItemByPath(container, null);
    const focused = getFocusedItem(container) as HTMLElement;
    expect(focused).not.toBeNull();
    expect(focused).toBe(getItems(container)[0]);
  });

  it('handles empty container gracefully', () => {
    const empty = document.createElement('div');
    empty.id = 'source-container';
    document.body.appendChild(empty);
    expect(() => focusItemByPath(empty, '/any')).not.toThrow();
  });
});

describe('focusItemByElement', () => {
  it('focuses a specific element and sets focus path in state', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    const el = items[2]; // track.flac
    focusItemByElement(container, el);
    expect(el.classList.contains('focused')).toBe(true);
    expect(state.eparsFocusPath).toBe('/media/usb/track.flac');
  });

  it('clears previous focus', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    focusItemByElement(container, items[1]);
    focusItemByElement(container, items[2]);
    expect(items[1].classList.contains('focused')).toBe(false);
    expect(items[2].classList.contains('focused')).toBe(true);
  });

  it('sets focusPath to null when element has no data-focuspath', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const div = document.createElement('div');
    div.className = 'file-row';
    container.appendChild(div);
    focusItemByElement(container, div);
    expect(state.eparsFocusPath).toBeNull();
  });
});

describe('navigateFocus', () => {
  it('moves focus down', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    focusItemByElement(container, items[1]); // song.mp3
    navigateFocus(container, 1);
    const focused = getFocusedItem(container);
    expect(focused).toBe(items[2]); // track.flac
  });

  it('moves focus up', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    focusItemByElement(container, items[2]); // track.flac
    navigateFocus(container, -1);
    const focused = getFocusedItem(container);
    expect(focused).toBe(items[1]); // song.mp3
  });

  it('stays at last item when navigating down from last (clamped)', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    focusItemByElement(container, items[items.length - 1]);
    navigateFocus(container, 1);
    const focused = getFocusedItem(container);
    expect(focused).toBe(items[items.length - 1]);
  });

  it('stays at first item when navigating up from first (clamped)', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const items = getItems(container);
    focusItemByElement(container, items[0]);
    navigateFocus(container, -1);
    const focused = getFocusedItem(container);
    expect(focused).toBe(items[0]);
  });

  it('focuses first item when nothing focused (ArrowDown)', () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    navigateFocus(container, 1);
    const focused = getFocusedItem(container);
    expect(focused).toBe(getItems(container)[0]);
  });

  it('handles empty container', () => {
    const empty = document.createElement('div');
    empty.id = 'source-container';
    document.body.appendChild(empty);
    expect(() => navigateFocus(empty, 1)).not.toThrow();
  });
});

describe('navigateColumn', () => {
  it('navigates right to closest column', () => {
    const container = document.getElementById('source-container') as HTMLElement;
    const items = getItems(container);

    // Mock getBoundingClientRect: 2-column layout
    const rects: Array<Partial<DOMRect>> = [
      { left: 10, top: 10, width: 200, height: 20 },
      { left: 300, top: 10, width: 200, height: 20 },
      { left: 10, top: 40, width: 200, height: 60 },
      { left: 300, top: 110, width: 200, height: 20 },
    ];
    [...items].forEach((el, i) => {
      (el as HTMLElement).getBoundingClientRect = vi.fn(() => rects[i] as DOMRect);
    });

    focusItemByElement(container, items[0]); // Rock (col 1)
    navigateColumn(container, 1); // right
    expect(getFocusedItem(container)).toBe(items[1]); // Jazz (col 2, same row)
  });

  it('navigates left to closest column', () => {
    const container = document.getElementById('source-container') as HTMLElement;
    const items = getItems(container);

    const rects: Array<Partial<DOMRect>> = [
      { left: 10, top: 10, width: 200, height: 20 },
      { left: 300, top: 10, width: 200, height: 20 },
      { left: 10, top: 40, width: 200, height: 60 },
      { left: 300, top: 110, width: 200, height: 20 },
    ];
    [...items].forEach((el, i) => {
      (el as HTMLElement).getBoundingClientRect = vi.fn(() => rects[i] as DOMRect);
    });

    focusItemByElement(container, items[1]); // Jazz (col 2)
    navigateColumn(container, -1); // left
    expect(getFocusedItem(container)).toBe(items[0]); // Rock (col 1)
  });

  it('returns early when nothing focused', () => {
    const container = document.getElementById('source-container') as HTMLElement;
    expect(() => navigateColumn(container, 1)).not.toThrow();
  });
});

describe('setActivePanel', () => {
  it('switches to source panel', () => {
    setActivePanel('source');
    expect(state.activePanel).toBe('source');
    const panel = document.getElementById('panel-right') as HTMLElement;
    expect(panel.classList.contains('panel-active')).toBe(true);
  });

  it('focuses first item in new panel', () => {
    setActivePanel('source');
    const focused = getFocusedItem(document.getElementById('source-container') as HTMLElement);
    expect(focused).not.toBeNull();
    expect(focused!.classList.contains('directory')).toBe(true);
  });
});

describe('revalidateFocus', () => {
  it('refocuses current path', () => {
    state.activePanel = 'epars';
    state.eparsFocusPath = '/media/usb/track.flac';
    revalidateFocus();
    const focused = getFocusedItem(document.getElementById('epars-container') as HTMLElement) as HTMLElement;
    expect(focused.dataset.focuspath).toBe('/media/usb/track.flac');
  });
});
