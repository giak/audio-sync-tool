// ─── Audio commands: seek, stop, play ──────────────────────────────────────

import { seekAudio, stopPlayer } from '../audio.js';
import { registry } from './registry.js';

// ←→ — seek audio when playing (jamais dans un input : le caret d'abord)
registry.bind({
  key: 'ArrowLeft',
  isInput: false,
  isAudioPlaying: true,
  shiftKey: false,
  handler: () => seekAudio(-1),
});
registry.bind({
  key: 'ArrowRight',
  isInput: false,
  isAudioPlaying: true,
  shiftKey: false,
  handler: () => seekAudio(1),
});

// Shift+←→ — seek audio
registry.bind({
  key: 'ArrowLeft',
  isInput: false,
  shiftKey: true,
  isAudioPlaying: true,
  handler: () => seekAudio(-1),
});
registry.bind({
  key: 'ArrowRight',
  isInput: false,
  shiftKey: true,
  isAudioPlaying: true,
  handler: () => seekAudio(1),
});

// Échap — stop audio
registry.bind({
  key: 'Escape',
  activeModal: null,
  isAudioPlaying: true,
  handler: () => stopPlayer(),
});
