// Pure utility functions extracted from script.js for testability.

import type { FileIndex, JournalEntry, SourceFiles } from './state.js';

interface TreeNode {
  [key: string]: TreeNode | Array<unknown> | undefined;
  __files__?: Array<unknown>;
}

/**
 * Format seconds as m:ss display string.
 */
export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Format duration seconds as m:ss. Returns empty string for 0 / null.
 */
export function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Extract the set of filenames that have been copied (status === 'copied').
 */
export function getJournalFiles(journal: JournalEntry[]): Set<string> {
  const set = new Set<string>();
  for (const entry of journal) {
    if (entry.status === 'copied' && entry.filename) set.add(entry.filename);
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
export type FileStatus = 'nouveau' | 'doublon' | 'traite';

export function computeStatus(filename: string, sourceFiles: SourceFiles, journal: JournalEntry[]): FileStatus {
  const inSource = Object.values(sourceFiles).some(idx => filename in idx);
  if (inSource) return 'doublon';
  const journaled = getJournalFiles(journal);
  if (journaled.has(filename)) return 'traite';
  return 'nouveau';
}

/**
 * Count total number of files across all epars directories.
 */
export function countAllEparsFiles(eparsFiles: Record<string, Record<string, { path: string }>>): number {
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
export function dirHasMatchingDescendant(node: TreeNode, term: string): boolean {
  for (const [key, child] of Object.entries(node)) {
    if (key === '__files__') continue;
    if (key.toLowerCase().includes(term)) return true;
    if (dirHasMatchingDescendant(child as TreeNode, term)) return true;
  }
  return false;
}

/** Un fichier du nœud (ou d'un sous-dossier) matche-t-il le terme ? —
 *  complément « 📄 fichiers » du filtre à deux niveaux des arbres : étend la
 *  visibilité et l'auto-expansion aux dossiers contenant le fichier cherché. */
export function dirHasMatchingFile(node: TreeNode, term: string): boolean {
  for (const f of (node.__files__ as Array<{ filename: string }> | undefined) ?? []) {
    if (f.filename.toLowerCase().includes(term)) return true;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === '__files__') continue;
    if (dirHasMatchingFile(child as TreeNode, term)) return true;
  }
  return false;
}

/** Segment « déjà rangé » à afficher sur l'épars, ou null — le jumeau rangé
 *  (dupMatches, EPIC-028) n'est signalé que s'il est CONSULTABLE à droite sous
 *  le filtre sync-source actif : son dossier matche le terme (sémantique
 *  identique à l'arbre : sous-chaîne insensible à la casse sur les noms de
 *  dossiers), ou son nom de fichier en mode 📄 fichiers (auto-expansion).
 *  Sans filtre → null : la pastille n'a de sens qu'en contexte de rangement. */
export function twinUnderFilteredDir(
  sourceFullPath: string,
  term: string,
  filesMode: boolean,
  sourceFiles: Record<string, FileIndex>,
): string | null {
  const t = term.trim().toLowerCase();
  if (!t) return null;
  const root = Object.keys(sourceFiles).find(r => sourceFullPath.startsWith(`${r}/`));
  if (!root) return null;
  const segments = sourceFullPath
    .slice(root.length + 1)
    .split('/')
    .filter(Boolean);
  const filename = segments.pop();
  if (!filename) return null;
  const dir = segments.join('/');
  if (filesMode && filename.toLowerCase().includes(t)) return dir ? `${dir}/${filename}` : filename;
  return dir.toLowerCase().includes(t) ? dir : null;
}
