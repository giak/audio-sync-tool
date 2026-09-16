// ─── Filter command (EPIC-030) : F7 = toggle de la zone de filtre, / = ouvrir ─
// F7 : caché → ouvre + focus ; déjà focus → ferme (blur + hide) ; sinon focus.
// /  : ouvre + focus seulement (depuis un autre input aussi — pas de isInput :
//      taper « / » dans un autre input filtre le chip courant, convention vim).
// Échap dans l'input ferme aussi (navigation.ts). Le terme reste mémorisé par
// scope tant que la session vit — ré-afficher restaure le filtre.

import { setActivePanel } from '../focus.js';
import { focusFilterChip, hideFilterChip } from '../render/filterChip.js';
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

function closeCurrentChip(): void {
  const input = document.activeElement;
  if (input instanceof HTMLElement) input.blur();
  hideFilterChip();
}

/** L'élément focusé est-il l'input d'un chip filtre ? */
function filterInputFocused(): boolean {
  return document.activeElement instanceof HTMLInputElement && document.activeElement.classList.contains('filter-input');
}

registry.bind({
  key: 'F7',
  activeModal: null,
  handler: () => {
    // Déjà dans l'input filtre → F7 referme (toggle)
    if (filterInputFocused()) {
      closeCurrentChip();
      return;
    }
    focusCurrentChip();
  },
});

registry.bind({
  key: '/',
  handler: focusCurrentChip,
});
