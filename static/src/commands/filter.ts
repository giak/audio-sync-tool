// ─── Filter command: F7 or / ───────────────────────────────────────────────
import { registry } from './registry.js';
import { setActivePanel } from '../focus.js';
import { renderSource } from '../render/index.js';
import { openFilterPalette, closeFilterPalette } from '../ui.js';

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
