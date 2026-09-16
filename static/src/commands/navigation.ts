// ─── Navigation commands: ↑↓ ←→ Tab Backspace Enter Space ────────────────

import {
  focusItemByElement,
  getFocusedItem,
  getItems,
  navigateColumn,
  navigateFocus,
  navigateHistory,
  revalidateFocus,
  setActivePanel,
} from '../focus.js';
import { state } from '../state.js';
import { registry } from './registry.js';

// Tab — switch panels (Sync mode)
registry.bind({
  key: 'Tab',
  activePanel: 'epars',
  playlistMode: false,
  handler: () => setActivePanel('source'),
});
registry.bind({
  key: 'Tab',
  activePanel: 'source',
  playlistMode: false,
  handler: () => setActivePanel('epars'),
});

// ↓ Sync
registry.bind({
  key: 'ArrowDown',
  playlistMode: false,
  handler: () => {
    const container =
      state.activePanel === 'source'
        ? document.getElementById('source-container')
        : document.getElementById('epars-container');
    if (container && getItems(container).length > 0) navigateFocus(container, 1);
  },
});

// ↑ Sync
registry.bind({
  key: 'ArrowUp',
  playlistMode: false,
  handler: () => {
    const container =
      state.activePanel === 'source'
        ? document.getElementById('source-container')
        : document.getElementById('epars-container');
    if (container && getItems(container).length > 0) navigateFocus(container, -1);
  },
});

// ← source (column nav)
registry.bind({
  key: 'ArrowLeft',
  activePanel: 'source',
  playlistMode: false,
  handler: () => {
    const container = document.getElementById('source-container');
    if (container) navigateColumn(container, -1);
  },
});

// → source (column nav)
registry.bind({
  key: 'ArrowRight',
  activePanel: 'source',
  playlistMode: false,
  handler: () => {
    const container = document.getElementById('source-container');
    if (container) navigateColumn(container, 1);
  },
});

// ←→ in épars (no-op — skip when audio playing or shift held, so audio seek can match)
registry.bind({
  key: 'ArrowLeft',
  activePanel: 'epars',
  playlistMode: false,
  isAudioPlaying: false,
  shiftKey: false,
  handler: () => {},
});
registry.bind({
  key: 'ArrowRight',
  activePanel: 'epars',
  playlistMode: false,
  isAudioPlaying: false,
  shiftKey: false,
  handler: () => {},
});

// Enter / Space Sync
registry.bind({
  key: 'Enter',
  playlistMode: false,
  handler: () => {
    const container =
      state.activePanel === 'source'
        ? document.getElementById('source-container')
        : document.getElementById('epars-container');
    if (!container) return;
    const el = getFocusedItem(container) as HTMLElement | null;
    if (!el) return;
    if (el.classList.contains('file-row')) {
      (el.querySelector('.play-btn') as HTMLElement | null)?.click();
    } else if (el.classList.contains('directory') && state.activePanel === 'source') {
      el.click();
    }
  },
});

registry.bind({
  key: ' ',
  playlistMode: false,
  handler: () => {
    const container =
      state.activePanel === 'source'
        ? document.getElementById('source-container')
        : document.getElementById('epars-container');
    if (!container) return;
    const el = getFocusedItem(container) as HTMLElement | null;
    if (!el) return;
    if (el.classList.contains('file-row') && state.activePanel === 'epars') {
      (el.querySelector('.file.nouveau') as HTMLElement | null)?.click();
    } else if (el.classList.contains('directory') && state.activePanel === 'source') {
      el.click();
    }
  },
});

// Backspace — focuser le dossier parent (Sync only)
registry.bind({
  key: 'Backspace',
  isInput: false,
  activeModal: null,
  playlistMode: false,
  handler: () => {
    const container =
      state.activePanel === 'source'
        ? document.getElementById('source-container')
        : document.getElementById('epars-container');
    const focused = container?.querySelector('.focused') as HTMLElement | null;
    if (focused) {
      const parentChildren = focused.closest('.children') as HTMLElement | null;
      if (parentChildren) {
        let parentDir = parentChildren.closest('.directory') as HTMLElement | null;
        if (!parentDir) {
          const sibling = parentChildren.previousElementSibling as HTMLElement | null;
          if (sibling?.classList.contains('directory')) parentDir = sibling;
        }
        if (parentDir && container) focusItemByElement(container, parentDir);
      }
    }
  },
});

// Ctrl+L — focus le fichier en cours de lecture
registry.bind({
  key: 'l',
  ctrlKey: true,
  isInput: false,
  handler: () => {
    const playingRow = document.querySelector('.led-playing')?.closest('.file-row') as HTMLElement | null;
    if (playingRow) {
      const container = playingRow.closest(
        '#epars-container, #source-container, #playlist-source-container',
      ) as HTMLElement | null;
      if (container) {
        focusItemByElement(container, playingRow);
        playingRow.scrollIntoView({ block: 'center' });
        if (container.id === 'epars-container') setActivePanel('epars');
        else setActivePanel('source');
      }
    }
  },
});

// Alt+←/→ — navigation history
registry.bind({
  key: 'ArrowLeft',
  altKey: true,
  isInput: false,
  handler: () => navigateHistory(-1),
});
registry.bind({
  key: 'ArrowRight',
  altKey: true,
  isInput: false,
  handler: () => navigateHistory(1),
});

// Filter chip (EPIC-030) — Échap, Tab, ↓ dans l'input filtre : blur → la
// liste reprend le focus (le terme est conservé, mémorisé par scope)
registry.bind({
  key: 'Escape',
  isFilterInputFocused: true,
  handler: () => {
    (document.activeElement as HTMLElement | null)?.blur();
    revalidateFocus();
  },
});
registry.bind({
  key: 'ArrowDown',
  isFilterInputFocused: true,
  handler: () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setActivePanel('source');
  },
});
registry.bind({
  key: 'Tab',
  isFilterInputFocused: true,
  handler: () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setActivePanel('epars');
  },
});
