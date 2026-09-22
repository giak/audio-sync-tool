// ─── Années page commands (EPIC-033 T2/T4, P2 : e = export) ─────────────
// Page scopée : ↑↓ naviguent les cartes à revue, e exporte les choix,
// Échap revient en Sync. Les choix d'année/rejet se font au clic (pas de
// raccourci : décision à éviter en aveugle), pattern dups.ts.

import { closeYearsMode, exportChoices, yearsMoveFocus } from '../render/yearsUI.js';
import { registry } from './registry.js';

registry.bind({
  key: 'ArrowDown',
  legendFamily: 'nav-annees',
  legendFamilyTitle: true,
  page: 'years',
  activeModal: null,
  isInput: false,
  label: 'Naviguer dans les années',
  group: 'years',
  handler: () => yearsMoveFocus(1),
});

registry.bind({
  key: 'ArrowUp',
  legendFamily: 'nav-annees',
  page: 'years',
  activeModal: null,
  isInput: false,
  label: 'Naviguer dans les années',
  group: 'years',
  handler: () => yearsMoveFocus(-1),
});

registry.bind({
  key: 'e',
  page: 'years',
  activeModal: null,
  isInput: false,
  label: 'Exporter les choix (apply_years)',
  group: 'years',
  handler: () => exportChoices(),
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
