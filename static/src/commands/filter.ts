// ─── Filter command (EPIC-030) : F7 = toggle de la zone de filtre, / = ouvrir ─
// F7 : caché → ouvre + focus ; déjà focus → ferme (blur + hide) ; sinon focus.
// /  : ouvre + focus seulement (depuis un autre input aussi — pas de isInput :
//      taper « / » dans un autre input filtre le chip courant, convention vim).
// Échap dans l'input ferme aussi (navigation.ts). Le terme reste mémorisé par
// scope tant que la session vit — ré-afficher restaure le filtre.

import { setActivePanel } from '../focus.js';
// EPIC-037 P4 : `currentFilterScope` vit dans filterChip.ts (couche liste) — le
// clavier (F7/`/` ici, ↓/Tab dans navigation.ts) partage la même table
// scope → liste, sans dépendance navigation → filter (ordre du registry intact).
import { currentFilterScope, focusFilterChip, hideFilterChip } from '../render/filterChip.js';
import { state as st } from '../state.js';
import { registry } from './registry.js';

/** Marque le panneau actif SANS passer par setActivePanel quand il l'est déjà
 *  (EPIC-037 P3) : setActivePanel re-focus la liste et la scrolle
 *  (scrollIntoView) — c'est ce qui faisait sauter la colonne à chaque F7. */
function ensurePanelActiveMarker(): void {
  const panelId = st.activePanel === 'source' ? 'panel-right' : 'panel-left';
  if (!document.getElementById(panelId)?.classList.contains('panel-active')) {
    setActivePanel(st.activePanel);
  }
}

function focusCurrentChip(): void {
  // Page sync : la colonne focusée détermine le scope (le panel actif suit le focus)
  if (!st.playlistMode && st.page === 'sync') {
    ensurePanelActiveMarker();
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
  return (
    document.activeElement instanceof HTMLInputElement && document.activeElement.classList.contains('filter-input')
  );
}

registry.bind({
  key: 'F7',
  activeModal: null,
  label: 'Afficher / masquer le filtre',
  group: 'sync',
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
  label: 'Ouvrir le filtre partout',
  group: 'sync',
  handler: focusCurrentChip,
});
