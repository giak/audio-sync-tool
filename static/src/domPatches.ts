// ─── Targeted DOM patches after copy operations ──────────────────────────
// Phase 5: extracted from render.ts to decouple actions.ts from the full
// render module. actions.ts only needs these two functions, not renderAll,
// renderSource, or any other render sub-modules.

import { stopPlayer, togglePlay } from './audio.js';
import { focusItemByElement, setActivePanel } from './focus.js';
import { getRating } from './ratings.js';
import { state, type TreeNode } from './state.js';
import { computeStatus, countAllEparsFiles, formatDuration } from './utils.js';

export function patchEparsFileAfterCopy(filename: string, eparDir: string): void {
  const fileSpan = document.querySelector(
    `#epars-container .file[data-filename="${CSS.escape(filename)}"][data-epardir="${CSS.escape(eparDir)}"]`,
  ) as HTMLElement | null;
  if (!fileSpan) return;

  const newStatus = computeStatus(filename, state.sourceFiles, state.journal);
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
  let countNouveau = 0,
    countDoublon = 0,
    countTraite = 0;
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
  let ancestorInfo: { node: TreeNode; baseDir: string } | undefined;
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

  let node: TreeNode = ancestorInfo.node;
  let currentPath = curr;

  for (const part of missingParts) {
    if (!node[part]) node[part] = {};
    node = node[part] as TreeNode;
    currentPath += `/${part}`;
    state.sourceNodeMap = new Map([...state.sourceNodeMap, [currentPath, { node, baseDir: ancestorInfo.baseDir }]]);
  }

  const entries =
    (node.__files__ as Array<{
      filename: string;
      relPath: string;
      year: string | null;
      duration: number | null;
      codec: string | null;
      baseDir: string;
    }>) || [];
  if (!node.__files__) node.__files__ = entries;
  entries.push({
    filename,
    relPath: fileData.path,
    year: fileData.year,
    duration: fileData.duration,
    codec: fileData.codec,
    baseDir: ancestorInfo.baseDir,
  });

  let totalSource = 0;
  for (const files of Object.values(state.sourceFiles)) totalSource += Object.keys(files).length;
  const headerCount = document.getElementById('source-header-count');
  if (!state.filterActive) {
    if (headerCount) headerCount.textContent = totalSource > 0 ? `(${totalSource.toLocaleString('fr')})` : '';
  } else if (headerCount) {
    const currentMatches = headerCount.textContent?.match(/[\d\s]+(?= \/)/);
    const filtered = currentMatches ? parseInt(currentMatches[0].replace(/\s/g, ''), 10) : totalSource;
    headerCount.textContent = `(${filtered.toLocaleString('fr')} / ${totalSource.toLocaleString('fr')})`;
  }

  const dirEl = document.querySelector(
    `#source-container .directory[data-dirpath="${CSS.escape(destDir)}"]`,
  ) as HTMLElement | null;
  if (dirEl) {
    let countBadge = dirEl.querySelector('.dir-count') as HTMLElement | null;
    const totalFiles = entries.length;
    if (countBadge) {
      countBadge.textContent = `(${totalFiles})`;
    } else if (totalFiles > 0) {
      countBadge = document.createElement('span');
      countBadge.className = 'dir-count';
      countBadge.textContent = `(${totalFiles})`;
      dirEl.appendChild(countBadge);
    }

    const children = dirEl.querySelector('.children');
    if (children) {
      const newRow = document.createElement('div');
      newRow.className = 'file-row';
      newRow.dataset.focuspath = `${destDir}/${filename}`;

      const playBtn = document.createElement('span');
      playBtn.className = 'play-btn';
      playBtn.textContent = '▶';
      playBtn.title = 'Écouter';
      playBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        togglePlay(filename, `${destDir}/${filename}`, playBtn);
      };
      newRow.appendChild(playBtn);

      const label = document.createElement('span');
      label.className = 'file doublon led-doublon';
      label.textContent = filename;
      label.dataset.filename = filename;
      label.dataset.fullpath = `${destDir}/${filename}`;
      newRow.appendChild(label);

      if (fileData.year) {
        const s = document.createElement('span');
        s.className = 'year';
        s.textContent = fileData.year;
        newRow.appendChild(s);
      }
      if (fileData.codec) {
        const s = document.createElement('span');
        s.className = 'codec';
        s.textContent = fileData.codec;
        newRow.appendChild(s);
      }
      newRow.dataset.durationSeconds = fileData.duration ? String(fileData.duration) : '';
      if (fileData.duration) {
        const s = document.createElement('span');
        s.className = 'duration';
        s.textContent = formatDuration(fileData.duration);
        newRow.appendChild(s);
      }

      const ratingVal = getRating(`${destDir}/${filename}`);
      const ratingSpan = document.createElement('span');
      ratingSpan.className = 'file-rating';
      ratingSpan.dataset.fullpath = `${destDir}/${filename}`;
      if (ratingVal !== undefined) ratingSpan.textContent = String(ratingVal);
      newRow.appendChild(ratingSpan);

      newRow.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        if ((e.target as HTMLElement).closest('.play-btn')) return;
        const cont = newRow.closest(
          '#epars-container, #source-container, #playlist-source-container',
        ) as HTMLElement | null;
        if (!cont) return;
        focusItemByElement(cont, newRow);
        if (cont.id !== 'playlist-source-container') setActivePanel(cont.id === 'epars-container' ? 'epars' : 'source');
        if (newRow.querySelector('.led-playing')) stopPlayer();
      };

      newRow.draggable = true;
      newRow.ondragstart = (e: DragEvent) => {
        const fl = newRow.querySelector('.file') as HTMLElement | null;
        e.dataTransfer?.setData(
          'application/x-epars-copy',
          JSON.stringify({ filename: fl?.dataset?.filename || '', eparDir: fl?.dataset?.epardir || '' }),
        );
        newRow.classList.add('dragging-source');
      };
      newRow.ondragend = () => newRow.classList.remove('dragging-source');

      let inserted = false;
      const rows = children.querySelectorAll('.file-row');
      for (const row of rows) {
        const existing = (row.querySelector('.file') as HTMLElement | null)?.textContent || '';
        if (filename.localeCompare(existing) < 0) {
          children.insertBefore(newRow, row);
          inserted = true;
          break;
        }
      }
      if (!inserted) children.appendChild(newRow);
    }
  }

  return true;
}
