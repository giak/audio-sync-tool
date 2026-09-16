// ─── Doublons mode commands (EPIC-028 P2) ──────────────────────────────────
// Modal interactive : ↑↓ naviguent les paires, R remplace, Échap ferme
// (bindings conditionnés à activeModal:'dups' — le routeur bloque le reste,
// pattern cueEditor ; la fermeture passe par closeAllModals standard).

import { closeDupsMode, dupsMoveFocus, dupsReplaceFocused } from '../render/dupsUI.js';
import { closeAllModals } from '../ui.js';
import { registry } from './registry.js';

registry.bind({
  key: 'ArrowDown',
  activeModal: 'dups',
  handler: () => dupsMoveFocus(1),
});

registry.bind({
  key: 'ArrowUp',
  activeModal: 'dups',
  handler: () => dupsMoveFocus(-1),
});

registry.bind({
  key: 'r',
  activeModal: 'dups',
  handler: () => dupsReplaceFocused(),
});

registry.bind({
  key: 'Escape',
  activeModal: 'dups',
  handler: () => {
    closeAllModals();
    closeDupsMode(); // restaure le focus sync (revalidateFocus différé)
  },
});
