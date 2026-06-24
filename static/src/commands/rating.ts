// ─── Rating command: N (notation inline) ──────────────────────────────────
import { registry } from './registry.js';
import { startRatingEdit, startSourceRatingEdit } from '../render/index.js';
import { state } from '../state.js';

// N — sidebar (playlist mode)
registry.bind({
  key: 'n',
  playlistMode: true,
  playlistFocus: 'sidebar',
  isInput: false,
  activeModal: null,
  handler: () => startRatingEdit(),
});

// N — source tree (playlist mode)
registry.bind({
  key: 'n',
  playlistMode: true,
  playlistFocus: 'source',
  isInput: false,
  activeModal: null,
  handler: () => startSourceRatingEdit(),
});
