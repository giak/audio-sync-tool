// ─── Modal commands: Échap ──────────────────────────────────────────────────
import { registry } from './registry.js';
import { closeAllModals, closeContextMenu } from '../ui.js';

// Échap — modales ouvertes
registry.bind({ key: 'Escape', activeModal: 'dialog', handler: () => closeAllModals() });
registry.bind({ key: 'Escape', activeModal: 'config', handler: () => closeAllModals() });
registry.bind({ key: 'Escape', activeModal: 'legend', handler: () => closeAllModals() });
registry.bind({ key: 'Escape', activeModal: 'journal', handler: () => closeAllModals() });
registry.bind({ key: 'Escape', activeModal: 'playlists', handler: () => closeAllModals() });
registry.bind({ key: 'Escape', activeModal: 'cueEditor', handler: () => closeAllModals() });

// Échap — close context menu (global fallback, only when no modal and audio not playing)
registry.bind({ key: 'Escape', activeModal: null, filterActive: false, isAudioPlaying: false, handler: () => closeContextMenu() });
