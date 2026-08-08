// ─── File row DOM factory ──────────────────────────────────────────────────
// Returns an HTMLDivElement with play, focus, rate, and context menu handlers.

import { stopPlayer, togglePlay } from '../audio.js';
import { focusItemByElement, setActivePanel } from '../focus.js';
import { getRating } from '../ratings.js';
import { showContextMenu } from '../ui.js';
import { type FileStatus, formatDuration } from '../utils.js';

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
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'file-row';
  row.dataset.focuspath = fullpath;

  const playBtn = document.createElement('span');
  playBtn.className = 'play-btn';
  playBtn.textContent = '▶';
  playBtn.title = 'Écouter';
  playBtn.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    togglePlay(filename, fullpath, playBtn);
  };
  row.appendChild(playBtn);

  const label = document.createElement('span');
  label.className = `file ${status} led-${status}`;
  label.textContent = filename;
  label.dataset.filename = filename;
  label.dataset.fullpath = fullpath;
  row.appendChild(label);

  if (year) {
    const span = document.createElement('span');
    span.className = 'year';
    span.textContent = year;
    row.appendChild(span);
  }
  if (codec) {
    const span = document.createElement('span');
    span.className = 'codec';
    span.textContent = codec;
    row.appendChild(span);
  }
  row.dataset.durationSeconds = duration ? String(duration) : '';
  if (duration) {
    const span = document.createElement('span');
    span.className = 'duration';
    span.textContent = formatDuration(duration);
    row.appendChild(span);
  }

  // Rating display
  const ratingVal = getRating(fullpath);
  const ratingSpan = document.createElement('span');
  ratingSpan.className = 'file-rating';
  ratingSpan.dataset.fullpath = fullpath;
  if (ratingVal !== undefined) {
    ratingSpan.textContent = String(ratingVal);
  }
  ratingSpan.onclick = (e: MouseEvent) => {
    e.stopPropagation();
    const cont = row.closest('#epars-container, #source-container, #playlist-source-container') as HTMLElement | null;
    if (!cont) return;
    for (const el of cont.querySelectorAll('.focused')) el.classList.remove('focused');
    row.classList.add('focused');
    if (cont.id === 'playlist-source-container' && startSourceRatingEditFn) {
      startSourceRatingEditFn();
    }
  };
  row.appendChild(ratingSpan);

  // Cue editor access (source trees only — éparpillé ne passe pas onCueEditFn)
  if (onCueEditFn) {
    const cueBtn = document.createElement('button');
    cueBtn.className = 'cue-btn';
    cueBtn.textContent = 'Cues';
    cueBtn.title = 'Éditeur cues / loops (waveform)';
    cueBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      onCueEditFn(filename, fullpath);
    };
    row.appendChild(cueBtn);
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
