// ─── Rating command: N (notation inline) ──────────────────────────────────

import { startRatingEdit, startSourceRatingEdit } from '../render/index.js';
import { registry } from './registry.js';

// N — sidebar (playlist mode)
registry.bind({
  key: 'n',
  playlistMode: true,
  playlistFocus: 'sidebar',
  isInput: false,
  activeModal: null,
  label: 'Noter le morceau (0-100)',
  group: 'playlist',
  handler: () => startRatingEdit(),
});

// N — source tree (playlist mode)
registry.bind({
  key: 'n',
  playlistMode: true,
  playlistFocus: 'source',
  isInput: false,
  activeModal: null,
  page: 'playlist',
  label: 'Noter le fichier source (0-100)',
  group: 'playlist',
  handler: () => startSourceRatingEdit(),
});
