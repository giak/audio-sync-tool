// ─── Copy command: F5 ──────────────────────────────────────────────────────

import { executeCopy } from '../actions.js';
import { registry } from './registry.js';

registry.bind({
  key: 'F5',
  activeModal: null,
  handler: () => executeCopy(),
});
