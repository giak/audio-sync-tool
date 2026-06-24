// ─── Drag & drop copy helper (A9) ───────────────────────────────────────

import { state } from '../state.js';
import { setBatchCopy } from './batchCopy.js';

export function doDragCopy(filename: string, eparDir: string, destDir: string): void {
  const relPath = state.eparsFiles[eparDir]?.[filename]?.path;
  if (!relPath) {
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Fichier introuvable.';
    return;
  }
  setBatchCopy(destDir, [{ filename, eparDir, fullpath: `${eparDir}/${relPath}` }]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
}
