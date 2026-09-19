// ─── Éparpillé panel rendering ────────────────────────────────────────────

import { foldTerm, matchesTokens } from '../filterEngine.js';
import { focusItemByElement, revalidateFocus, setActivePanel } from '../focus.js';
import { type EparsSelection, state } from '../state.js';
import { computeStatus, countAllEparsFiles, type FileStatus } from '../utils.js';
import { makeFileEl, makeFileTable } from './fileRow.js';
import { ensureFilterChip, getFilterTerm, updateFilterCount } from './filterChip.js';
import { startSourceRatingEdit } from './ratingEdit.js';
import { insertStyleCell, updateStyleRecap } from './styleCell.js';

// ── File selection logic ─────────────────────────────────────────────────

function getItemsForSelection(container: HTMLElement): NodeListOf<Element> {
  return container.querySelectorAll('.file.nouveau');
}

function selectEparsFile(
  el: HTMLElement,
  filename: string,
  eparDir: string,
  opts?: { ctrl?: boolean; shift?: boolean },
): void {
  const row = el.closest('.file-row') as HTMLElement | null;
  const container = document.getElementById('epars-container');
  const fullpath = el.dataset.fullpath || '';
  const key = `${eparDir}/${filename}`;

  if (opts?.ctrl) {
    if (state.selectedEparsFiles.has(key)) {
      const next = new Map(state.selectedEparsFiles);
      next.delete(key);
      state.selectedEparsFiles = next;
      el.classList.remove('selected');
    } else {
      state.selectedEparsFiles = new Map([...state.selectedEparsFiles, [key, { filename, eparDir, fullpath }]]);
      el.classList.add('selected');
    }
    if (container) {
      const items = getItemsForSelection(container);
      state.lastSelectedEparsIndex = Array.from(items).indexOf(el);
    }
  } else if (opts?.shift && state.lastSelectedEparsIndex !== null && container) {
    const items = getItemsForSelection(container);
    const currentIdx = Array.from(items).indexOf(el);
    const start = Math.min(state.lastSelectedEparsIndex, currentIdx);
    const end = Math.max(state.lastSelectedEparsIndex, currentIdx);
    state.selectedEparsFiles = new Map();
    for (const f of document.querySelectorAll('#epars-container .file.selected')) f.classList.remove('selected');
    const nextMap = new Map<string, EparsSelection>();
    for (let i = start; i <= end; i++) {
      const item = items[i] as HTMLElement | null;
      const fl = item?.querySelector('.file.nouveau') as HTMLElement | null;
      if (fl) {
        const fn = fl.dataset.filename || '';
        const ed = fl.dataset.epardir || '';
        const fp = fl.dataset.fullpath || '';
        nextMap.set(`${ed}/${fn}`, { filename: fn, eparDir: ed, fullpath: fp });
        fl.classList.add('selected');
      }
    }
    state.selectedEparsFiles = nextMap;
    state.lastSelectedEparsIndex = currentIdx;
  } else {
    state.selectedEparsFiles = new Map();
    for (const f of document.querySelectorAll('#epars-container .file.selected')) f.classList.remove('selected');
    state.selectedEparsFiles = new Map([...state.selectedEparsFiles, [key, { filename, eparDir, fullpath }]]);
    el.classList.add('selected');
    if (container) {
      const items = getItemsForSelection(container);
      state.lastSelectedEparsIndex = Array.from(items).indexOf(el);
    }
  }

  const count = state.selectedEparsFiles.size;
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent =
      count > 1 ? `${count} fichiers sélectionnés. Tab → F5 pour copier.` : 'Appuie sur Tab → F5 pour copier.';
  }
  setActivePanel('epars');
  if (row && container) focusItemByElement(container, row);
}

// ── Render ───────────────────────────────────────────────────────────────

export function renderEpars(): void {
  const container = document.getElementById('epars-container');
  if (!container) return;
  const savedScrollTop = container.scrollTop;
  container.innerHTML = '';

  // EPIC-030 : chip de filtre persistant (slot dédié hors du DOM effacé,
  // mémorisé scope 'sync-epars') — la saisie survit aux re-renders.
  ensureFilterChip(container, {
    scope: 'sync-epars',
    placeholder: 'Filtrer nom, année, codec…',
    onChange: renderEpars,
    onBlur: () => revalidateFocus(),
  });
  const eparsTerm = foldTerm(getFilterTerm('sync-epars'));
  const eparsActive = eparsTerm.length > 0;

  const totalFiles = countAllEparsFiles(state.eparsFiles);
  const dupCount = state.dupMatches.size;
  const headerCount = document.getElementById('epars-header-count');
  if (headerCount) {
    const base = totalFiles > 0 ? totalFiles.toLocaleString('fr') : '';
    const dupPart = dupCount > 0 ? ` · ${dupCount.toLocaleString('fr')} ↔` : '';
    headerCount.textContent = base ? `(${base}${dupPart})` : '';
  }

  let countNouveau = 0,
    countDoublon = 0,
    countTraite = 0;

  // État vide (EPIC-014) : guidance visuelle quand aucun dossier épars n'est configuré.
  if (Object.keys(state.eparsFiles).length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-empty';
    empty.textContent = 'Aucun dossier épars configuré — ⚙️ Config → Dossiers puis 🔄 Scan.';
    container.appendChild(empty);
  }

  for (const [dirPath, files] of Object.entries(state.eparsFiles)) {
    const dirDiv = document.createElement('div');
    dirDiv.className = 'directory';
    dirDiv.dataset.focuspath = `epars-dir:${dirPath}`;
    const shortName = dirPath.split('/').filter(Boolean).pop() || dirPath;
    dirDiv.textContent = shortName;
    dirDiv.title = dirPath;
    container.appendChild(dirDiv);

    const fileList = document.createElement('div');
    fileList.className = 'children';
    container.appendChild(fileList);

    const sorted = Object.entries(files).sort((a, b) => a[0].localeCompare(b[0]));
    // EPIC-035 : 7ᵉ colonne « Style » (épars seulement) — cellule insérée ci-dessous.
    const fileTable = makeFileTable(false, true);
    const tbody = fileTable.querySelector('tbody');
    for (const [filename, data] of sorted) {
      const relPath = data.path;
      const fullpath = `${dirPath}/${relPath}`;
      if (
        eparsActive &&
        !matchesTokens(eparsTerm, {
          name: filename,
          year: data.year ?? null,
          codec: data.codec ?? null,
          path: relPath,
          genre: data.genre ?? null,
        })
      )
        continue;
      const status = computeStatus(filename, state.sourceFiles, state.journal as any);
      if (status === 'nouveau') countNouveau++;
      else if (status === 'doublon') countDoublon++;
      else if (status === 'traite') countTraite++;

      const row = makeFileEl(
        filename,
        relPath,
        status as FileStatus,
        fullpath,
        data.year,
        data.duration,
        data.codec,
        selectEparsFile,
        startSourceRatingEdit,
      );
      insertStyleCell(row, fullpath, data);
      const label2 = row.querySelector('.file') as HTMLElement;
      if (label2) {
        label2.dataset.epardir = dirPath;
        label2.onclick = (e: MouseEvent) => {
          selectEparsFile(label2, filename, dirPath, { ctrl: e.ctrlKey, shift: e.shiftKey });
        };
      }
      tbody?.appendChild(row);
    }
    if (tbody?.childElementCount) {
      fileList.appendChild(fileTable);
    }
    // Masquer le groupe de dossier épars si le filtre ne garde rien dedans
    if (eparsActive && !tbody?.childElementCount) {
      dirDiv.classList.add('hidden');
      fileList.classList.add('hidden');
    }
  }

  // Compteur du chip : matchés / total (recalcul léger après filtrage)
  if (eparsActive) {
    let matched = 0;
    for (const files of Object.values(state.eparsFiles)) {
      for (const [filename, data] of Object.entries(files)) {
        if (
          matchesTokens(eparsTerm, {
            name: filename,
            year: data.year ?? null,
            codec: data.codec ?? null,
            path: data.path,
            genre: data.genre ?? null,
          })
        )
          matched++;
      }
    }
    updateFilterCount('sync-epars', matched, countAllEparsFiles(state.eparsFiles));
    if (matched === 0) {
      const empty = document.createElement('div');
      empty.className = 'panel-empty';
      empty.textContent = 'Aucun fichier ne matche ce filtre.';
      container.appendChild(empty);
    }
  }

  const statusLine = document.getElementById('epars-status-line');
  if (statusLine) {
    const dupPart =
      dupCount > 0
        ? `\n      <span class="s-dupfuzzy">↔ ${dupCount.toLocaleString('fr')} homonyme${dupCount > 1 ? 's' : ''}</span>`
        : '';
    statusLine.innerHTML = `
      <span class="s-traite">✓ ${countTraite.toLocaleString('fr')} traité</span>
      <span class="s-reste">● ${countNouveau.toLocaleString('fr')} reste</span>
      <span class="s-doublon">○ ${countDoublon.toLocaleString('fr')} doublon</span>${dupPart}
    `;
    updateStyleRecap(); // EPIC-035 : « 🏷 N assignés » après reconstruction de la ligne
  }

  requestAnimationFrame(() => {
    container.scrollTop = savedScrollTop;
  });
}
