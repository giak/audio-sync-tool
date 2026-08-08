// ─── Filter command: F7 or / ───────────────────────────────────────────────

import { setActivePanel } from '../focus.js';
import { renderSource } from '../render/index.js';
import { openFilterPalette } from '../ui.js';
import { registry } from './registry.js';

registry.bind({
  key: 'F7',
  activeModal: null,
  handler: () => openFilterPalette(setActivePanel, renderSource),
});

registry.bind({
  key: '/',
  isInput: false,
  activeModal: null,
  handler: () => openFilterPalette(setActivePanel, renderSource),
});
