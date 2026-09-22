// ─── Replace command: R (EPIC-028 P1bis) ───────────────────────────────────
// Remplace le fichier rangé par son jumeau épars (qualité supérieure ou
// égale) — l'ancien rangé part dans _trash, jamais effacé.

import { executeReplace } from '../actions.js';
import { state } from '../state.js';
import { registry } from './registry.js';

registry.bind({
  key: 'r',
  page: 'sync',
  activeModal: null,
  isInput: false,
  label: 'Remplacer l’homonyme rangé',
  group: 'sync',
  handler: () => {
    const el = document.querySelector('#epars-container .focused .file') as HTMLElement | null;
    const fullpath = el?.dataset.fullpath;
    if (!fullpath || !state.dupMatches.has(fullpath)) return; // pas un doublon → no-op
    void executeReplace(fullpath);
  },
});
