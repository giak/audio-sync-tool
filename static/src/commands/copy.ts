// ─── Copy command: F5 ──────────────────────────────────────────────────────
import { registry } from './registry.js';
import { executeCopy } from '../actions.js';

registry.bind({
  key: 'F5',
  activeModal: null,
  handler: () => executeCopy(),
});
