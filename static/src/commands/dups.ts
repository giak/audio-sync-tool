// ─── Doublons page commands (EPIC-028 P2) ──────────────────────────────────
// Page scopée : ↑↓ naviguent les paires, R remplace, Échap revient en Sync.
// Bindings conditionnés à page:'dups' + activeModal:null — le confirmDialog
// (modal 'dialog') bloque tout le reste, pattern standard du routeur.

import { closeDupsMode, dupsApplyFocused, dupsMoveFocus } from '../render/dupsUI.js';
import { registry } from './registry.js';

registry.bind({
  key: 'ArrowDown',
  page: 'dups',
  activeModal: null,
  isInput: false,
  handler: () => dupsMoveFocus(1),
});

registry.bind({
  key: 'ArrowUp',
  page: 'dups',
  activeModal: null,
  isInput: false,
  handler: () => dupsMoveFocus(-1),
});

registry.bind({
  key: 'r',
  page: 'dups',
  activeModal: null,
  isInput: false,
  handler: () => dupsApplyFocused(),
});

registry.bind({
  key: 'Escape',
  page: 'dups',
  activeModal: null,
  isInput: false,
  handler: () => closeDupsMode(),
});
