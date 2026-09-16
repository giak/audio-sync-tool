// ─── Doublons mode (EPIC-028 P2) : vue dédiée des paires épars ↔ rangés ───
// Pattern : modal interactive façon cueEditor — ouverte depuis la nav
// (« ↔ Doublons »), ↑↓ pour naviguer, R pour remplacer (executeReplace
// réutilisé tel quel), Échap pour fermer. Le focus sync est restauré à la
// fermeture via revalidateFocus().

import { executeReplace, refreshDupMatches } from '../actions.js';
import type { DupMatch } from '../dupDetect.js';
import { revalidateFocus } from '../focus.js';
import { on, state } from '../state.js';
import { closeAllModals, openModal } from '../ui.js';

let focusIndex = -1;

// ── Helpers qualité (mêmes paliers que dupDetect, affichage fr) ──────────

/** Codec du fichier épars, résolu depuis state.eparsFiles (pas stocké dans
 *  DupMatch — la Map ne porte que ce que le matching utilise). */
function eparsCodec(fullPath: string, filename: string): string | null {
  for (const [dir, files] of Object.entries(state.eparsFiles)) {
    if (fullPath.startsWith(`${dir}/`)) return files[filename]?.codec ?? null;
  }
  return null;
}

function sourceCodec(fullPath: string, filename: string): string | null {
  for (const [dir, files] of Object.entries(state.sourceFiles)) {
    if (fullPath.startsWith(`${dir}/`)) return files[filename]?.codec ?? null;
  }
  return null;
}

function qualityLabel(m: DupMatch): string {
  const lc = eparsCodec(m.eparsFullPath, m.eparsFilename);
  const rc = sourceCodec(m.sourceFullPath, m.sourceFilename);
  if (m.verdict === 'left-better') return `✅ épars gagne (${lc ?? '?'} vs ${rc ?? '?'})`;
  if (m.verdict === 'equal') return `≈ qualité équivalente (${lc ?? '?'})`;
  return `⚠️ rangé meilleur (${rc ?? '?'} vs ${lc ?? '?'})`;
}

function rowContent(m: DupMatch): string {
  const esc = (s: string): string => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };
  return (
    `<td class="dup-left" title="${esc(m.eparsFullPath)}">${esc(m.eparsFilename)}</td>` +
    `<td class="dup-verdict ${m.verdict}">${esc(qualityLabel(m))}</td>` +
    `<td class="dup-right" title="${esc(m.sourceFullPath)}">${esc(m.sourceFilename)}</td>` +
    `<td class="dup-meta">sim ${Math.round(m.sim * 100)} % · Δ${m.delta.toFixed(1)} s</td>`
  );
}

// ── Render ────────────────────────────────────────────────────────────────

export function renderDups(): void {
  const list = document.getElementById('dups-list');
  if (!list) return;
  list.innerHTML = '';
  // Le focus module-level peut être hors bornes après un changement de la Map
  // (re-render suite à un remplacement) — on le ramène dans le tableau.
  if (focusIndex >= state.dupMatches.size) focusIndex = state.dupMatches.size - 1;

  const matches = [...state.dupMatches.values()];
  const count = document.getElementById('dups-count');
  if (count) {
    count.textContent = matches.length > 0 ? `(${matches.length.toLocaleString('fr')} paires)` : '';
  }
  if (matches.length === 0) {
    list.innerHTML = '<p class="dups-empty">Aucun doublon potentiel — lance un scan si ce n\'est pas attendu.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'dups-table';
  table.innerHTML = '<thead><tr><th>Fichier épars</th><th>Verdict</th><th>Jumeau rangé</th><th>Score</th></tr></thead>';
  const tbody = document.createElement('tbody');
  matches.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.className = `dup-row${i === focusIndex ? ' focused' : ''}`;
    tr.dataset.index = String(i);
    tr.innerHTML = rowContent(m);
    tr.onclick = (): void => {
      focusIndex = i;
      paintFocus();
      void executeReplace(m.eparsFullPath);
    };
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  list.appendChild(table);
}

function paintFocus(): void {
  const list = document.getElementById('dups-list');
  if (!list) return;
  list.querySelectorAll('.dup-row.focused').forEach(el => {
    el.classList.remove('focused');
  });
  const target = list.querySelector(`.dup-row[data-index="${focusIndex}"]`);
  if (target) {
    target.classList.add('focused');
    target.scrollIntoView({ block: 'nearest' });
  }
}

// ── Open / close (pattern Playlist : layout page, PAS une modal-overlay) ──
// openModal('dups') ne sert qu'à poser state.activeModal='dups' → isolation
// clavier par le routeur (bindings ↑↓/R/Échap de commands/dups.ts). Aucun
// élément #modal-dups n'existe : openModal ne trouve rien à afficher, la
// visibilité du layout est gérée ici comme enterPlaylistMode le fait.

export function openDupsMode(): void {
  refreshDupMatches(); // fraîcheur : recalcule depuis l'état courant
  focusIndex = -1;
  renderDups();
  document.getElementById('main-panels')?.classList.add('hidden');
  document.getElementById('dups-layout')?.classList.remove('hidden');
  openModal('dups');
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = '↔ Vue Doublons — ↑↓ naviguer, R remplacer, Échap pour revenir.';
  }
}

export function closeDupsMode(): void {
  if (state.activeModal === 'dups') closeAllModals();
  document.getElementById('dups-layout')?.classList.add('hidden');
  document.getElementById('main-panels')?.classList.remove('hidden');
  requestAnimationFrame(() => revalidateFocus());
}

export function dupsMoveFocus(delta: number): void {
  const total = state.dupMatches.size;
  if (total === 0) return;
  focusIndex = Math.min(Math.max(focusIndex + delta, 0), total - 1);
  paintFocus();
}

export function dupsReplaceFocused(): void {
  if (focusIndex < 0) return;
  const matches = [...state.dupMatches.values()];
  const m = matches[focusIndex];
  if (!m) return;
  void executeReplace(m.eparsFullPath);
}

// ── Events ───────────────────────────────────────────────────────────────

// Remplacement fait depuis la vue → re-render pour refléter le nouveau verdict.
on('sourceFiles:changed', () => {
  if (state.activeModal === 'dups') renderDups();
});
