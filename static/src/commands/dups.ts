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
  label: 'Naviguer vers le bas (paires de doublons)',
  group: 'dups',
  handler: () => dupsMoveFocus(1),
});

registry.bind({
  key: 'ArrowUp',
  page: 'dups',
  activeModal: null,
  isInput: false,
  label: 'Naviguer vers le haut (paires de doublons)',
  group: 'dups',
  handler: () => dupsMoveFocus(-1),
});

registry.bind({
  key: 'r',
  page: 'dups',
  activeModal: null,
  isInput: false,
  label: 'Appliquer le plan de rangement (perdants → _trash)',
  group: 'dups',
  handler: () => dupsApplyFocused(),
});

registry.bind({
  key: 'Escape',
  page: 'dups',
  activeModal: null,
  isInput: false,
  label: 'Revenir en page Sync',
  group: 'dups',
  handler: () => closeDupsMode(),
});
