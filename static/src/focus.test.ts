// ─── Unit tests for focus.ts ────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  focusItemByElement,
  focusItemByPath,
  getFocusedItem,
  getItems,
  initTwinHint,
  navigateColumn,
  navigateFocus,
  revalidateFocus,
  setActivePanel,
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

  it('returns directory + file-row for source container', () => {
    const container = document.getElementById('source-container') as HTMLElement;
    const items = getItems(container);
    expect(items.length).toBe(5); // 4 directories + 1 file-row in expanded Techno
    const dirs = [...items].filter(el => el.classList.contains('directory'));
    const files = [...items].filter(el => el.classList.contains('file-row'));
    expect(dirs.length).toBe(4);
    expect(files.length).toBe(1);
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

  it('writes the path of the CONTAINER panel, not the active panel', () => {
    // Clic dans le panneau NON actif : le path doit aller au bon panneau,
    // sinon le Tab suivant restaure un path pollué et remonte en tête de liste.
    state.activePanel = 'epars';
    const source = document.getElementById('source-container') as HTMLElement;
    focusItemByElement(source, source.querySelector('[data-focuspath="/src/Jazz"]')!);
    expect(state.sourceFocusPath).toBe('/src/Jazz');
    expect(state.eparsFocusPath).toBeNull();

    state.activePanel = 'source';
    const epars = document.getElementById('epars-container') as HTMLElement;
    focusItemByElement(epars, epars.querySelector('[data-focuspath="/media/usb/track.flac"]')!);
    expect(state.eparsFocusPath).toBe('/media/usb/track.flac');
    expect(state.sourceFocusPath).toBe('/src/Jazz');
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

    // Mock getBoundingClientRect: 2-column layout (5 items after C3)
    // File-row in expanded Techno is placed far down to avoid interfering
    const rects: Array<Partial<DOMRect>> = [
      { left: 10, top: 10, width: 200, height: 20 },
      { left: 300, top: 10, width: 200, height: 20 },
      { left: 10, top: 40, width: 200, height: 60 },
      { left: 300, top: 110, width: 200, height: 20 },
      { left: 30, top: 999, width: 180, height: 18 },
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
      { left: 30, top: 999, width: 180, height: 18 },
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

// ── Twin-hint (EPIC-028 P1) ───────────────────────────────────────────────

describe('twin-hint', () => {
  function resetDup(): void {
    state.dupMatches = new Map();
  }

  beforeEach(() => resetDup());

  it('focus épars matché → .twin-hint sur le jumeau rendu à droite', () => {
    state.dupMatches = new Map([
      [
        '/media/usb/song.mp3',
        {
          eparsFullPath: '/media/usb/song.mp3',
          sourceFullPath: '/src/Techno/beat.mp3',
          eparsFilename: 'song.mp3',
          sourceFilename: 'beat.mp3',
          sim: 0.9,
          delta: 0,
          verdict: 'left-better',
        },
      ],
    ]);
    const container = document.getElementById('epars-container') as HTMLElement;
    const row = container.querySelector('[data-focuspath="/media/usb/song.mp3"]') as HTMLElement;

    focusItemByElement(container, row);

    const twin = document.querySelector('#source-container .twin-hint') as HTMLElement;
    expect(twin).not.toBeNull();
    expect(twin.dataset.focuspath).toBe('/src/Techno/beat.mp3');
    // Le focus reste à gauche — le hint ne vole pas le focus
    expect(getFocusedItem(container)?.getAttribute('data-focuspath')).toBe('/media/usb/song.mp3');
  });

  it("focus épars non matché → pas de .twin-hint (et cleanup de l'ancien)", () => {
    const container = document.getElementById('epars-container') as HTMLElement;
    const matched = container.querySelector('[data-focuspath="/media/usb/song.mp3"]') as HTMLElement;
    const unmatched = container.querySelector('[data-focuspath="/media/usb/track.flac"]') as HTMLElement;

    // Simuler un hint résiduel puis naviguer vers un non-matché
    const twinRow = document.querySelector('#source-container [data-focuspath="/src/Techno/beat.mp3"]') as HTMLElement;
    twinRow.classList.add('twin-hint');

    focusItemByElement(container, unmatched);

    expect(document.querySelector('#source-container .twin-hint')).toBeNull();
    void matched;
  });

  it('jumeau non rendu (dossier replié) → hint sur le dossier conteneur le plus profond rendu', () => {
    state.dupMatches = new Map([
      [
        '/media/usb/song.mp3',
        {
          eparsFullPath: '/media/usb/song.mp3',
          sourceFullPath: '/src/Techno/sub/deep.mp3',
          eparsFilename: 'song.mp3',
          sourceFilename: 'deep.mp3',
          sim: 0.9,
          delta: 0,
          verdict: 'equal',
        },
      ],
    ]);
    // /src/Techno rendu, /src/Techno/sub absent du DOM (replié) — ajouter un
    // dossier parent plus court pour vérifier que le PLUS PROFOND gagne.
    const src = document.getElementById('source-container') as HTMLElement;
    src.innerHTML =
      '<div class="directory" data-focuspath="/src"></div>' +
      '<div class="directory" data-focuspath="/src/Techno"></div>';
    const container = document.getElementById('epars-container') as HTMLElement;
    const row = container.querySelector('[data-focuspath="/media/usb/song.mp3"]') as HTMLElement;

    focusItemByElement(container, row);

    const hinted = document.querySelector('#source-container .twin-hint') as HTMLElement;
    expect(hinted).not.toBeNull();
    expect(hinted.dataset.focuspath).toBe('/src/Techno');
  });

  it("jumeau et conteneurs absents du DOM → pas de .twin-hint, pas d'erreur", () => {
    state.dupMatches = new Map([
      [
        '/media/usb/song.mp3',
        {
          eparsFullPath: '/media/usb/song.mp3',
          sourceFullPath: '/src/House/hidden.mp3',
          eparsFilename: 'song.mp3',
          sourceFilename: 'hidden.mp3',
          sim: 0.9,
          delta: 0,
          verdict: 'equal',
        },
      ],
    ]);
    const container = document.getElementById('epars-container') as HTMLElement;
    const row = container.querySelector('[data-focuspath="/media/usb/song.mp3"]') as HTMLElement;

    expect(() => focusItemByElement(container, row)).not.toThrow();
    expect(document.querySelector('#source-container .twin-hint')).toBeNull();
  });

  it('Tab vers la source → cleanup du .twin-hint', () => {
    const twinRow = document.querySelector('#source-container [data-focuspath="/src/Techno/beat.mp3"]') as HTMLElement;
    twinRow.classList.add('twin-hint');

    setActivePanel('source');

    expect(document.querySelector('#source-container .twin-hint')).toBeNull();
  });

  it('initTwinHint : event eparsFocusPath:changed → hint sur le jumeau', async () => {
    state.dupMatches = new Map([
      [
        '/media/usb/lost.wav',
        {
          eparsFullPath: '/media/usb/lost.wav',
          sourceFullPath: '/src/Techno/beat.mp3',
          eparsFilename: 'lost.wav',
          sourceFilename: 'beat.mp3',
          sim: 0.88,
          delta: 1,
          verdict: 'right-better',
        },
      ],
    ]);
    initTwinHint();

    state.eparsFocusPath = '/media/usb/lost.wav'; // Proxy → emit eparsFocusPath:changed
    // emit est batché via requestAnimationFrame (jsdom : setTimeout ~16 ms)
    await new Promise(res => setTimeout(res, 30));

    expect(document.querySelector('#source-container .twin-hint')).not.toBeNull();
  });
});
