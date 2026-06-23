// Pure utility functions extracted from script.js for testability.

/**
 * Format seconds as m:ss display string.
 */
export function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Format duration seconds as m:ss. Returns empty string for 0 / null.
 */
export function formatDuration(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Extract the set of filenames that have been copied (status === 'copied').
 */
export function getJournalFiles(journal) {
  const set = new Set();
  for (const entry of journal) {
    if (entry.status === 'copied') set.add(entry.filename);
  }
  return set;
}

/**
 * Compute the status of a filename.
 *   'doublon' — exists in source data (regardless of journal)
 *   'traite'  — already copied (in journal) but NOT in source
 *   'nouveau' — neither
 *
 * Priority: doublon > traite > nouveau.
 * After a copy, the file appears in source data → gray (doublon),
 * which is the immediate visual feedback the user expects.
 * 'traite' only shows when a file was handled but is now missing from source.
 */
export function computeStatus(filename, sourceFiles, journal) {
  const inSource = Object.values(sourceFiles).some(idx => filename in idx);
  if (inSource) return 'doublon';
  const journaled = getJournalFiles(journal);
  if (journaled.has(filename)) return 'traite';
  return 'nouveau';
}

/**
 * Count total number of files across all epars directories.
 */
export function countAllEparsFiles(eparsFiles) {
  let total = 0;
  for (const files of Object.values(eparsFiles)) {
    total += Object.keys(files).length;
  }
  return total;
}

/**
 * Recursively check whether a directory node or any of its descendants
 * contain a name matching the filter term (case-insensitive).
 */
export function dirHasMatchingDescendant(node, term) {
  for (const [key, child] of Object.entries(node)) {
    if (key === '__files__') continue;
    if (key.toLowerCase().includes(term)) return true;
    if (dirHasMatchingDescendant(child, term)) return true;
  }
  return false;
}
