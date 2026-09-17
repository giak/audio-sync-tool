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
import { hideFilterChip } from '../render/filterChip.js';
import { toggleSourceDir } from '../render/sourceTree.js';
import { state } from '../state.js';
import { getFocusedExpandedDir, registry } from './registry.js';

// Tab — switch panels (Sync mode)
registry.bind({
  key: 'Tab',
  activePanel: 'epars',
  isInput: false,
  playlistMode: false,
  label: 'Panneau gauche → droite',
  group: 'sync',
  handler: () => setActivePanel('source'),
});
registry.bind({
  key: 'Tab',
  activePanel: 'source',
  isInput: false,
  playlistMode: false,
  label: 'Panneau droit → gauche',
  group: 'sync',
  handler: () => setActivePanel('epars'),
});

// ↓ Sync
registry.bind({
  key: 'ArrowDown',
  page: 'sync', // SUSPECT (EPIC-031) : sans garde page, shadowe dups ↓ (pm:false passe en dups)
  isInput: false,
  playlistMode: false,
  label: 'Naviguer vers le bas (liste focusée)',
  group: 'sync',
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
  page: 'sync', // SUSPECT (EPIC-031) : sans garde page, shadowe dups ↑ (pm:false passe en dups)
  isInput: false,
  playlistMode: false,
  label: 'Naviguer vers le haut (liste focusée)',
  group: 'sync',
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
  isInput: false,
  playlistMode: false,
  altKey: false, // FINDING 3 (EPIC-031) : sinon shadowe Alt+← (historique)
  label: 'Colonne précédente (Source Data)',
  group: 'sync',
  handler: () => {
    const container = document.getElementById('source-container');
    if (container) navigateColumn(container, -1);
  },
});

// → source (column nav)
registry.bind({
  key: 'ArrowRight',
  activePanel: 'source',
  isInput: false,
  playlistMode: false,
  altKey: false, // FINDING 3 (EPIC-031) : sinon shadowe Alt+→ (historique)
  label: 'Colonne suivante (Source Data)',
  group: 'sync',
  handler: () => {
    const container = document.getElementById('source-container');
    if (container) navigateColumn(container, 1);
  },
});

// ←→ in épars (no-op — skip when audio playing or shift held, so audio seek can match ; alt exclu pour l'historique, FINDING 3)
registry.bind({
  key: 'ArrowLeft',
  activePanel: 'epars',
  isInput: false,
  playlistMode: false,
  isAudioPlaying: false,
  shiftKey: false,
  altKey: false,
  label: 'Épars : ← sans effet (seek audio en lecture)',
  group: 'sync',
  handler: () => {},
});
registry.bind({
  key: 'ArrowRight',
  activePanel: 'epars',
  isInput: false,
  playlistMode: false,
  isAudioPlaying: false,
  shiftKey: false,
  altKey: false,
  label: 'Épars : → sans effet (seek audio en lecture)',
  group: 'sync',
  handler: () => {},
});

// Enter / Space Sync
registry.bind({
  key: 'Enter',
  isInput: false,
  playlistMode: false,
  label: 'Jouer le fichier / déplier le dossier',
  group: 'sync',
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
  isInput: false,
  playlistMode: false,
  label: 'Sélectionner le fichier (multi-copie)',
  group: 'sync',
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
  label: 'Focus le dossier parent',
  group: 'sync',
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
  label: 'Focus le fichier en cours de lecture',
  group: 'sync',
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
  label: 'Historique : revenir en arrière',
  group: 'sync',
  handler: () => navigateHistory(-1),
});
registry.bind({
  key: 'ArrowRight',
  altKey: true,
  isInput: false,
  label: 'Historique : avancer',
  group: 'sync',
  handler: () => navigateHistory(1),
});

// Filter chip (EPIC-030) — Échap, Tab, ↓ dans l'input filtre : blur + cache
// le chip (F7 le ré-affiche) et rend le focus à la liste. Le terme reste
// mémorisé par scope tant que la session vit.
// FINDING 1 (EPIC-031 P1) : garde activeModal — sous une modale, Échap doit
// fermer LA MODALE (bindings modals.ts) et non voler la fermeture pour cacher
// le filtre derrière.
registry.bind({
  key: 'Escape',
  isFilterInputFocused: true,
  activeModal: null,
  label: 'Fermer le filtre (rendre le focus à la liste)',
  group: 'sync',
  handler: () => {
    (document.activeElement as HTMLElement | null)?.blur();
    hideFilterChip();
    revalidateFocus();
  },
});
registry.bind({
  key: 'ArrowDown',
  isFilterInputFocused: true,
  label: 'Du filtre → liste Source Data',
  group: 'sync',
  handler: () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setActivePanel('source');
  },
});
registry.bind({
  key: 'Tab',
  isFilterInputFocused: true,
  label: 'Du filtre → liste épars',
  group: 'sync',
  handler: () => {
    (document.activeElement as HTMLElement | null)?.blur();
    setActivePanel('epars');
  },
});

// Échap — refermer le dossier déplié focusé (EPIC-031 P1, pilier 3 de la pile)
// Entre le filtre (ci-dessus) et le stop audio (audio.ts) : enregistré dans
// navigation.ts, importé AVANT audio.ts dans script.ts. SANS garde isAudioPlaying
// — la pile documentée met le dossier AVANT le stop audio (audio continue, un
// 2e Échap stoppe une fois le dossier replié). Conditions : sans modale, sans
// filtre focusé. Les dossiers .directory.expanded sont tous des dossiers Source
// (l'épars ne rend pas de .directory) → data-dirpath toujours présent.
registry.bind({
  key: 'Escape',
  isExpandedDirFocused: true,
  isFilterInputFocused: false,
  activeModal: null,
  label: 'Refermer le dossier déplié focusé (avant le stop audio)',
  group: 'sync',
  handler: () => {
    const dir = getFocusedExpandedDir();
    if (!dir) return;
    const dirPath = dir.dataset.dirpath ?? dir.dataset.focuspath;
    if (dirPath) toggleSourceDir(dirPath); // déplié → replie
  },
});
