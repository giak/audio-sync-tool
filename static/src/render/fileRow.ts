// ─── File row DOM factory ──────────────────────────────────────────────────
// Retourne un <tr class="file-row"> avec 7 <td> ALWAYS présents (le tableau,
// table-layout: fixed + colgroup, garantit l'alignement en colonnes même quand
// année / codec / durée sont vides). Les cellules conditionnelles du milieu
// décaleraient les colonnes suivantes — d'où les cellules toujours rendues.

import { stopPlayer, togglePlay } from '../audio.js';
import { focusItemByElement, setActivePanel } from '../focus.js';
import { getRating } from '../ratings.js';
import { showContextMenu } from '../ui.js';
import { type FileStatus, formatDuration } from '../utils.js';

// Table vide (colgroup 7 colonnes fixes + tbody) : chaque dossier expandé de
// la source / éparpillé reçoit SA table — les lignes partagent les colonnes.
export function makeFileTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'file-table';
  const colgroup = document.createElement('colgroup');
  for (let i = 0; i < 7; i++) colgroup.appendChild(document.createElement('col'));
  table.appendChild(colgroup);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  return table;
}

export function makeFileEl(
  filename: string,
  _relPath: string,
  status: FileStatus,
  fullpath: string,
  year: string | null,
  duration: number | null,
  codec: string | null,
  selectEparsFileFn?: (el: HTMLElement, filename: string, eparDir: string) => void,
  startSourceRatingEditFn?: () => void,
  onCueEditFn?: (filename: string, fullPath: string) => void,
): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.className = 'file-row';
  row.dataset.focuspath = fullpath;

  const playTd = document.createElement('td');
  playTd.className = 'play-btn';
  playTd.textContent = '▶';
  playTd.title = 'Écouter';
  playTd.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    togglePlay(filename, fullpath, playTd);
  };
  row.appendChild(playTd);

  const label = document.createElement('td');
  label.className = `file ${status} led-${status}`;
  label.textContent = filename;
  label.dataset.filename = filename;
  label.dataset.fullpath = fullpath;
  row.appendChild(label);

  const ratingVal = getRating(fullpath);
  const ratingTd = document.createElement('td');
  ratingTd.className = 'file-rating';
  ratingTd.dataset.fullpath = fullpath;
  if (ratingVal !== undefined) {
    ratingTd.textContent = String(ratingVal);
  }
  ratingTd.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    const cont = row.closest('#epars-container, #source-container, #playlist-source-container') as HTMLElement | null;
    if (!cont) return;
    for (const el of cont.querySelectorAll('.focused')) el.classList.remove('focused');
    row.classList.add('focused');
    if (cont.id === 'playlist-source-container' && startSourceRatingEditFn) {
      startSourceRatingEditFn();
    }
  };
  row.appendChild(ratingTd);

  const yearTd = document.createElement('td');
  yearTd.className = 'year';
  yearTd.textContent = year ?? '';
  row.appendChild(yearTd);

  const codecTd = document.createElement('td');
  codecTd.className = 'codec';
  codecTd.textContent = codec ?? '';
  row.appendChild(codecTd);

  row.dataset.durationSeconds = duration ? String(duration) : '';
  const durTd = document.createElement('td');
  durTd.className = 'duration';
  durTd.textContent = duration ? formatDuration(duration) : '';
  row.appendChild(durTd);

  // Cue editor access (source trees only — éparpillé ne passe pas onCueEditFn).
  // Cellule de queue : son absence ne décale rien (le colgroup fixe les colonnes).
  if (onCueEditFn) {
    const cueTd = document.createElement('td');
    cueTd.className = 'cue-cell';
    const btn = document.createElement('button');
    btn.className = 'cue-btn';
    btn.textContent = 'Cues';
    btn.title = 'Éditeur cues / loops (waveform)';
    btn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      onCueEditFn(filename, fullpath);
    };
    cueTd.appendChild(btn);
    row.appendChild(cueTd);
  }

  // Click-to-focus
  row.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('.play-btn')) return;
    const container = row.closest(
      '#epars-container, #source-container, #playlist-source-container',
    ) as HTMLElement | null;
    if (!container) return;
    focusItemByElement(container, row);
    if (container.id !== 'playlist-source-container') {
      setActivePanel(container.id === 'epars-container' ? 'epars' : 'source');
    }
    if (row.querySelector('.led-playing')) {
      stopPlayer();
    }
  };

  // Double-clic → play
  row.ondblclick = () => {
    (row.querySelector('.play-btn') as HTMLElement | null)?.click();
  };

  // Drag & drop: éparpillé → source
  row.draggable = true;
  row.ondragstart = (e: DragEvent) => {
    const fileLabel = row.querySelector('.file') as HTMLElement | null;
    const eparDir = fileLabel?.dataset?.epardir || '';
    const fname = fileLabel?.dataset?.filename || '';
    e.dataTransfer?.setData('application/x-epars-copy', JSON.stringify({ filename: fname, eparDir }));
    row.classList.add('dragging-source');
  };
  row.ondragend = () => row.classList.remove('dragging-source');

  // Context menu
  row.oncontextmenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fileLabel = row.querySelector('.file') as HTMLElement | null;
    const isNouveau = fileLabel?.classList.contains('nouveau');
    const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
      { label: '▶ Jouer', action: () => (row.querySelector('.play-btn') as HTMLElement)?.click() },
    ];
    if (isNouveau && fileLabel && selectEparsFileFn) {
      const fname = fileLabel.dataset.filename || '';
      const eparDir = fileLabel.dataset.epardir || '';
      items.push({
        label: '● Sélectionner pour copie',
        action: () => selectEparsFileFn(fileLabel, fname, eparDir),
      });
    }
    if (onCueEditFn) {
      items.push({
        label: 'Cues / loops (waveform)',
        action: () => onCueEditFn(filename, fullpath),
      });
    }
    showContextMenu(e.clientX, e.clientY, items);
  };

  return row;
}
