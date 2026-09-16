// ─── Filter command: F7 or / → focus le chip de la liste focusée (EPIC-030) ─

import { setActivePanel } from '../focus.js';
import { focusFilterChip } from '../render/filterChip.js';
import { state as st } from '../state.js';
import { registry } from './registry.js';

/** Scope du chip à focus selon la page et la liste focusée. */
function currentFilterScope(): string {
  if (st.page === 'dups') return 'dups';
  if (st.playlistMode) return st.playlistFocus === 'sidebar' ? 'playlist-tracks' : 'playlist-source';
  return st.activePanel === 'source' ? 'sync-source' : 'sync-epars';
}

function focusCurrentChip(): void {
  // Page sync : la colonne focusée détermine le scope (le panel actif suit le focus)
  if (!st.playlistMode && st.page === 'sync') {
    setActivePanel(st.activePanel);
  }
  focusFilterChip(currentFilterScope());
}

registry.bind({
  key: 'F7',
  activeModal: null,
  handler: focusCurrentChip,
});

registry.bind({
  key: '/',
  isInput: false,
  activeModal: null,
  handler: focusCurrentChip,
});
