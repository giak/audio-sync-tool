// ─── Generated keyboard legend (EPIC-031 P1) ───────────────────────────────
// Les sections « Raccourcis » de #modal-legend sont GÉNÉRÉES depuis les
// bindings labellisés du registry (bind({..., label, group})) : la légende ne
// peut plus diverger du code — ajouter un raccourci = un seul endroit. Le test
// bijection (legend.test.ts) garantit que tout binding labellisé apparaît et
// que toute ligne générée vient d'un binding.
//
// Restent statiques (HTML) : la section « États » (LED/badges — décrit les
// couleurs du DOM, pas les touches) et la section « Cue editor » (ses touches
// vivent dans un sous-système à listeners propres, hors registry).

import { registry } from '../commands/registry.js';

const GROUPS: Array<{ id: 'sync' | 'playlist' | 'dups' | 'global'; title: string }> = [
  { id: 'sync', title: 'Raccourcis — page Sync' },
  { id: 'playlist', title: 'Raccourcis — page Playlist' },
  { id: 'dups', title: 'Raccourcis — page Doublons' },
  { id: 'global', title: 'Transverse — audio, modales & menus' },
];

const KEY_NAMES: Record<string, string> = {
  ' ': 'Espace',
  Escape: 'Échap',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Entrée',
  Tab: 'Tab',
  Delete: 'Suppr',
  Backspace: '⌫',
  F5: 'F5',
  F7: 'F7',
  F10: 'F10',
};

/** Élément <kbd> de la ligne : modificateurs puis touche lisible. */
function kbdHtml(key: string, b: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string {
  const parts: string[] = [];
  if (b.ctrlKey) parts.push('<kbd>Ctrl</kbd>');
  if (b.altKey) parts.push('<kbd>Alt</kbd>');
  if (b.shiftKey) parts.push('<kbd>⇧</kbd>');
  parts.push(`<kbd>${KEY_NAMES[key] ?? key.toUpperCase()}</kbd>`);
  return parts.join(' + ');
}

/** Écrit (ou réécrit) les sections « Raccourcis » de #legend-grid depuis les
 *  bindings labellisés. Idempotent : les sections générées portent
 *  data-origin="bindings" et remplacent leurs homologues à chaque exécution ;
 *  toute autre section (États, Cue editor) est préservée telle quelle. */
export function renderKeyboardLegend(): void {
  const grid = document.getElementById('legend-grid');
  if (!grid) return;

  const grouped = new Map<string, string[]>();
  for (const b of registry.list()) {
    if (!b.label) continue; // binding non labellisé → invisible en légende
    const rows = grouped.get(b.group ?? 'global') ?? [];
    rows.push(`<div class="legend-row">${kbdHtml(b.key, b)} ${b.label}</div>`);
    grouped.set(b.group ?? 'global', rows);
  }

  for (const el of Array.from(grid.querySelectorAll('.legend-section[data-origin="bindings"]'))) {
    el.remove();
  }

  const anchor = grid.querySelector('.legend-section'); // première section (États)
  const frag = document.createDocumentFragment();
  for (const g of GROUPS) {
    const section = document.createElement('div');
    section.className = 'legend-section';
    section.dataset.origin = 'bindings';
    const rows = grouped.get(g.id) ?? [];
    section.innerHTML = `<h4>${g.title}</h4>${rows.join('')}`;
    frag.appendChild(section);
  }
  if (anchor) anchor.after(frag);
  else grid.appendChild(frag);
}
