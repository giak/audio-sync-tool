// ─── Targeted DOM patches after copy (avoids full rebuild) ────────────────
// Phase 5: extracted from render.ts into its own module.

import { state } from './state.js';
import { makeFileEl } from './render/fileRow.js';
import { computeStatus, countAllEparsFiles } from './utils.js';

export function patchEparsFileAfterCopy(filename: string, eparDir: string): void {
  const fileSpan = document.querySelector(
    `#epars-container .file[data-filename="${CSS.escape(filename)}"][data-epardir="${CSS.escape(eparDir)}"]`,
  ) as HTMLElement | null;
  if (!fileSpan) return;

  const newStatus = computeStatus(filename, state.sourceFiles, state.journal as any);
  fileSpan.className = fileSpan.className
    .replace(/\bled-(nouveau|doublon|traite)\b/g, '')
    .replace(/\b(nouveau|doublon|traite)\b/g, '')
    .trim();
  fileSpan.classList.add(newStatus, `led-${newStatus}`);

  if (newStatus !== 'nouveau') {
    fileSpan.onclick = null;
    fileSpan.classList.remove('selected');
  }

  const allFileSpans = document.querySelectorAll('#epars-container .file');
  let countNouveau = 0, countDoublon = 0, countTraite = 0;
  for (const fs of allFileSpans) {
    if (fs.classList.contains('nouveau')) countNouveau++;
    else if (fs.classList.contains('doublon')) countDoublon++;
    else if (fs.classList.contains('traite')) countTraite++;
  }
  const statusLine = document.getElementById('epars-status-line');
  if (statusLine) {
    statusLine.innerHTML = `
      <span class="s-traite">✓ ${countTraite.toLocaleString('fr')} traité</span>
      <span class="s-reste">● ${countNouveau.toLocaleString('fr')} reste</span>
      <span class="s-doublon">○ ${countDoublon.toLocaleString('fr')} doublon</span>
    `;
  }

  const totalFiles = countAllEparsFiles(state.eparsFiles);
  const headerCount = document.getElementById('epars-header-count');
  if (headerCount) headerCount.textContent = totalFiles > 0 ? `(${totalFiles.toLocaleString('fr')})` : '';
}

export function patchSourceFileAfterCopy(
  destDir: string,
  filename: string,
  fileData: { path: string; year: string | null; duration: number | null; codec: string | null },
): boolean {
  let curr = destDir;
  let ancestorInfo: { node: Record<string, unknown>; baseDir: string } | undefined;
  const missingParts: string[] = [];

  while (curr) {
    ancestorInfo = state.sourceNodeMap.get(curr);
    if (ancestorInfo) break;
    const slashIdx = curr.lastIndexOf('/');
    if (slashIdx === -1) break;
    missingParts.unshift(curr.substring(slashIdx + 1));
    curr = curr.substring(0, slashIdx);
  }

  if (!ancestorInfo) return false;

  let node: Record<string, unknown> = ancestorInfo.node;
  let currentPath = curr;

  for (const part of missingParts) {
    if (!(part in node)) (node as Record<string, unknown>)[part] = {};
    node = (node as Record<string, unknown>)[part] as Record<string, unknown>;
    currentPath += `/${part}`;
    state.sourceNodeMap = new Map([...state.sourceNodeMap, [currentPath, { node, baseDir: ancestorInfo.baseDir }]]);
  }

  const files = (node.__files__ || []) as Array<{
    filename: string; relPath: string; year: string | null; duration: number | null; codec: string | null; baseDir: string;
  }>;
  files.push({
    filename, relPath: fileData.path, year: fileData.year, duration: fileData.duration, codec: fileData.codec, baseDir: ancestorInfo.baseDir,
  });
  node.__files__ = files;

  let totalSource = 0;
  for (const f of Object.values(state.sourceFiles)) totalSource += Object.keys(f).length;
  const headerCount = document.getElementById('source-header-count');
  if (!state.filterActive) {
    if (headerCount) headerCount.textContent = totalSource > 0 ? `(${totalSource.toLocaleString('fr')})` : '';
  } else if (headerCount) {
    const m = headerCount.textContent?.match(/[\d\s]+(?= \/)/);
    const filtered = m ? parseInt(m[0].replace(/\s/g, ''), 10) : totalSource;
    headerCount.textContent = `(${filtered.toLocaleString('fr')} / ${totalSource.toLocaleString('fr')})`;
  }

  const dirEl = document.querySelector(`#source-container .directory[data-dirpath="${CSS.escape(destDir)}"]`) as HTMLElement | null;
  if (dirEl) {
    let badge = dirEl.querySelector('.dir-count') as HTMLElement | null;
    const total = files.length;
    if (badge) {
      badge.textContent = `(${total})`;
    } else if (total > 0) {
      badge = document.createElement('span');
      badge.className = 'dir-count';
      badge.textContent = `(${total})`;
      dirEl.appendChild(badge);
    }

    const children = dirEl.querySelector('.children');
    if (children) {
      const newRow = makeFileEl(filename, fileData.path, 'doublon', `${destDir}/${filename}`, fileData.year, fileData.duration, fileData.codec);
      let inserted = false;
      for (const row of children.querySelectorAll('.file-row')) {
        const ex = (row.querySelector('.file') as HTMLElement | null)?.textContent || '';
        if (filename.localeCompare(ex) < 0) { children.insertBefore(newRow, row); inserted = true; break; }
      }
      if (!inserted) children.appendChild(newRow);
    }
  }

  return true;
}

export function patchPlaylistSourceFile(fullPath: string, remove: boolean): void {
  const label = document.querySelector(`#playlist-source-container .file[data-fullpath="${CSS.escape(fullPath)}"]`);
  if (!label) return;
  if (remove) label.classList.remove('in-playlist');
  else label.classList.add('in-playlist');
}
