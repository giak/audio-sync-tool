// ─── Copy command: F5 ──────────────────────────────────────────────────────
// page:'sync' (EPIC-031 P1, SUSPECT confirmé par la matrice) : le F5 de copy.ts
// shadowait le R de la page Doublons (enregistré après lui). F5 est un outil
// de copie sync — en playlist, Espace/Ctrl+S/E couvrent l'usage.

import { executeCopy } from '../actions.js';
import { registry } from './registry.js';

registry.bind({
  key: 'F5',
  page: 'sync',
  isInput: false,
  activeModal: null,
  label: 'Copier la sélection → dossier focusé',
  group: 'sync',
  handler: () => executeCopy(),
});
