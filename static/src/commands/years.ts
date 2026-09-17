// ─── Années page commands (EPIC-033 T2/T4) ─────────────────────────────────
// Page scopée : ↑↓ naviguent les cartes à revue, Échap revient en Sync.
// Les choix d'année/rejet se font au clic (pas de raccourci : décision à
// éviter en aveugle), pattern dups.ts.

import { closeYearsMode, yearsMoveFocus } from '../render/yearsUI.js';
import { registry } from './registry.js';

registry.bind({
  key: 'ArrowDown',
  page: 'years',
  activeModal: null,
  isInput: false,
  label: 'Naviguer vers le bas (années à revue)',
  group: 'years',
  handler: () => yearsMoveFocus(1),
});

registry.bind({
  key: 'ArrowUp',
  page: 'years',
  activeModal: null,
  isInput: false,
  label: 'Naviguer vers le haut (années à revue)',
  group: 'years',
  handler: () => yearsMoveFocus(-1),
});

registry.bind({
  key: 'Escape',
  page: 'years',
  activeModal: null,
  isInput: false,
  label: 'Revenir en page Sync',
  group: 'years',
  handler: () => closeYearsMode(),
});
