// ─── Modal commands: Échap, ? ───────────────────────────────────────────────
// FINDING 2 (EPIC-031 P1) : l'ancien fallback « Échap → closeContextMenu »
// sans garde isInput fermait le menu quand l'utilisateur éditait dans un
// input. Le remplacement conscient vit dans menu.ts (Échap + isContextMenuOpen)
// — un menu ouvert est désormais un ÉTAT testé par la matrice, plus un
// closeContextMenu() à l'aveugle.

import { closeAllModals, openModal } from '../ui.js';
import { registry } from './registry.js';

// Échap — modales ouvertes
registry.bind({
  key: 'Escape',
  activeModal: 'dialog',
  label: 'Fermer la modale',
  group: 'global',
  handler: () => closeAllModals(),
});
registry.bind({
  key: 'Escape',
  activeModal: 'config',
  label: 'Fermer la config',
  group: 'global',
  handler: () => closeAllModals(),
});
registry.bind({
  key: 'Escape',
  activeModal: 'legend',
  label: 'Fermer la légende',
  group: 'global',
  handler: () => closeAllModals(),
});
registry.bind({
  key: 'Escape',
  activeModal: 'journal',
  label: 'Fermer le journal',
  group: 'global',
  handler: () => closeAllModals(),
});
registry.bind({
  key: 'Escape',
  activeModal: 'playlists',
  label: 'Fermer le gestionnaire de playlists',
  group: 'global',
  handler: () => closeAllModals(),
});
registry.bind({
  key: 'Escape',
  activeModal: 'cueEditor',
  label: 'Fermer l’éditeur de cues',
  group: 'global',
  handler: () => closeAllModals(),
});

// ? — ouvrir la légende (EPIC-031 P1 : découvrabilité). '?' est produit avec
// Shift sur AZERTY/QWERTY — on matche le caractère e.key, pas le geste, donc
// pas de garde shiftKey.
registry.bind({
  key: '?',
  isInput: false,
  activeModal: null,
  isContextMenuOpen: false,
  label: 'Ouvrir la légende (raccourcis & états)',
  group: 'global',
  handler: () => openModal('legend'),
});
