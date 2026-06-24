// ─── Audio commands: seek, stop, play ──────────────────────────────────────
import { registry } from './registry.js';
import { seekAudio, stopPlayer } from '../audio.js';

// ←→ — seek audio when playing
registry.bind({
  key: 'ArrowLeft',
  isAudioPlaying: true,
  shiftKey: false,
  handler: () => seekAudio(-1),
});
registry.bind({
  key: 'ArrowRight',
  isAudioPlaying: true,
  shiftKey: false,
  handler: () => seekAudio(1),
});

// Shift+←→ — seek audio
registry.bind({
  key: 'ArrowLeft',
  shiftKey: true,
  isAudioPlaying: true,
  handler: () => seekAudio(-1),
});
registry.bind({
  key: 'ArrowRight',
  shiftKey: true,
  isAudioPlaying: true,
  handler: () => seekAudio(1),
});

// Échap — stop audio
registry.bind({
  key: 'Escape',
  filterActive: false,
  activeModal: null,
  isAudioPlaying: true,
  handler: () => stopPlayer(),
});
