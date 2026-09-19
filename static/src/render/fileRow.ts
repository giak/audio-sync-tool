// ─── File row DOM factory ──────────────────────────────────────────────────
// Retourne un <tr class="file-row"> en colonnes FIXES (le tableau,
// table-layout: fixed + colgroup, garantit l'alignement en colonnes même quand
// année / codec / durée sont vides). Les cellules conditionnelles du milieu
// décaleraient les colonnes suivantes — d'où les cellules toujours rendues.
// « Cues » : partout sauf sur l'épars (page Sync, panneau gauche) — d'où une
// 7ᵉ colonne optionnelle : l'épars n'en rend pas, donc la durée (6ᵉ) est la
// dernière colonne et reste collée au bord droit.

import { stopPlayer, togglePlay } from '../audio.js';
import { focusItemByElement, setActivePanel } from '../focus.js';
import { getRating } from '../ratings.js';
import { state } from '../state.js';
import { showContextMenu } from '../ui.js';
import { type FileStatus, formatDuration, twinUnderFilteredDir } from '../utils.js';
import { getFilterTerm, isFileFilter } from './filterChip.js';

// Table vide (colgroup fixe + tbody) : chaque dossier expandé de la source /
// éparpillé reçoit SA table — les lignes partagent les colonnes.
// withCuesCol=true pour tout l'arbre source / playlists (7 colonnes, bouton
// Cues collé à droite) ; false pour l'épars (6 colonnes, durée collée à droite).
// withStyleCol=true (EPIC-035, épars seulement) : 7ᵉ colonne « Style » insérée
// entre année et codec par l'appelant (styleCell.ts) — classe `has-style`
// pour les largeurs dédiées du colgroup.
export function makeFileTable(withCuesCol: boolean, withStyleCol = false): HTMLTableElement {
  const table = document.createElement('table');
  table.className = withStyleCol ? 'file-table has-style' : 'file-table';
  const colgroup = document.createElement('colgroup');
  const cols = (withCuesCol ? 7 : 6) + (withStyleCol ? 1 : 0);
  for (let i = 0; i < cols; i++) colgroup.appendChild(document.createElement('col'));
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

  // Doublon fuzzy (EPIC-028 P1) : 4e état visuel — la ligne épars matche
  // (seuils stricts) à un jumeau rangé. Le gris (doublon) reste réservé au
  // nom EXACT. Le verdict qualifie le match pour juger d'un coup d'œil.
  const dupMatch = state.dupMatches.get(fullpath);
  if (dupMatch) {
    row.classList.add('dup-fuzzy');
    label.title = `↔ ${dupMatch.sourceFilename} — ${dupMatch.verdict === 'left-better' ? 'CE fichier gagne (qualité)' : dupMatch.verdict === 'equal' ? 'qualité équivalente' : 'le fichier rangé est de meilleure qualité'} · sim ${Math.round(dupMatch.sim * 100)} % · Δ${dupMatch.delta.toFixed(1)} s\nR ou double-clic = remplacer (l'ancien → _trash)`;
    row.ondblclick = (e: MouseEvent) => {
      e.preventDefault();
      void import('../actions.js').then(m => m.executeReplace(fullpath));
    };
    // Pastille « déjà rangé » : le jumeau existe DEJA dans le dossier visé par
    // le filtre source actif (épars sélectionné, cible à droite) — le rangement
    // créerait un doublon. Sémantique identique à l'arbre (dossiers, ou fichiers
    // en mode 📄) : ce que la pastille annonce est réellement consultable.
    if (selectEparsFileFn) {
      const seg = twinUnderFilteredDir(
        dupMatch.sourceFullPath,
        getFilterTerm('sync-source'),
        isFileFilter('sync-source'),
        state.sourceFiles,
      );
      if (seg) {
        row.classList.add('dup-ranged');
        label.title = `${label.title}\n⤷ déjà rangé : ${seg}${seg.includes(dupMatch.sourceFilename) ? '' : ` (${dupMatch.sourceFilename})`}`;
      }
    }
  }

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
