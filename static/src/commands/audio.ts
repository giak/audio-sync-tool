// ─── Audio commands: seek, stop, play ──────────────────────────────────────
// page:'sync' (EPIC-031 P1, SUSPECT confirmé par la matrice) : sans cette
// garde, ←→/Échap-audio matchaient AUSSI en page Doublons et shadowaient les
// bindings dups (enregistrés en dernier). Le seek/stop reste disponible en
// playlist via isAudioPlaying (la garde sync épargne la page playlist).

import { seekAudio, stopPlayer } from '../audio.js';
import { registry } from './registry.js';

// ←→ — seek audio when playing (jamais dans un input : le caret d'abord)
registry.bind({
  key: 'ArrowLeft',
  page: 'sync',
  isInput: false,
  isAudioPlaying: true,
  shiftKey: false,
  label: 'Seek audio −20 s',
  group: 'global',
  handler: () => seekAudio(-1),
});
registry.bind({
  key: 'ArrowRight',
  page: 'sync',
  isInput: false,
  isAudioPlaying: true,
  shiftKey: false,
  label: 'Seek audio +20 s',
  group: 'global',
  handler: () => seekAudio(1),
});

// Shift+←→ — seek audio
registry.bind({
  key: 'ArrowLeft',
  page: 'sync',
  isInput: false,
  shiftKey: true,
  isAudioPlaying: true,
  label: 'Seek audio −20 s (avec Shift)',
  group: 'global',
  handler: () => seekAudio(-1),
});
registry.bind({
  key: 'ArrowRight',
  page: 'sync',
  isInput: false,
  shiftKey: true,
  isAudioPlaying: true,
  label: 'Seek audio +20 s (avec Shift)',
  group: 'global',
  handler: () => seekAudio(1),
});

// Échap — stop audio : DERNIER pilier de la pile de fermeture (EPIC-031 P1),
// enregistré après menu.ts (Échap-menu) et navigation.ts (Échap-dossier) dans
// script.ts — le stop audio ne gagne plus qu'en dernier recours, en page sync.
registry.bind({
  key: 'Escape',
  page: 'sync',
  activeModal: null,
  isAudioPlaying: true,
  label: 'Stopper la lecture (dernier recours après menu/filtre/dossier)',
  group: 'global',
  handler: () => stopPlayer(),
});
