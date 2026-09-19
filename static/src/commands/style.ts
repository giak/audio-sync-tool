// ─── Style command: g (EPIC-035) ───────────────────────────────────────────
// `g` (genre) ouvre la palette de style sur la SÉLECTION épars (Espace /
// Ctrl-clic) si elle n'est pas vide, sinon sur la ligne focusée. Un seul
// binding : le chord (lettre → chiffre de tranche) vit dans le keydown de la
// palette elle-même (couche DOM, stopPropagation) — rien d'autre n'entre dans
// le registry, la matrice EPIC-031 gagne juste cette cellule.
// Importé EN DERNIER dans script.ts : les index des bindings existants ne
// bougent pas.

import { openStylePalette } from '../render/stylePalette.js';
import { openStylePreview } from '../render/stylePreview.js';
import { state } from '../state.js';
import { registry } from './registry.js';

export function openPaletteOnFocus(): void {
  const container = document.getElementById('epars-container');
  const focused = container?.querySelector('.focused') as HTMLElement | null;
  const focusedRow = focused?.closest('.file-row') as HTMLElement | null;
  const selected = [...state.selectedEparsFiles.values()].map(s => s.fullpath).filter(Boolean);
  const targets = selected.length > 0 ? selected : focusedRow?.dataset.focuspath ? [focusedRow.dataset.focuspath] : [];
  if (targets.length === 0) {
    const statusText = document.getElementById('status-text');
    if (statusText)
      statusText.textContent = "Met d'abord en surbrillance un fichier épars (↑↓) ou sélectionne-en (Espace).";
    return;
  }
  // Ancre : la ligne focusée si elle fait partie des cibles, sinon la première cible visible.
  let anchor = focusedRow && targets.includes(focusedRow.dataset.focuspath ?? '') ? focusedRow : null;
  if (!anchor && container) {
    for (const row of container.querySelectorAll<HTMLElement>('.file-row')) {
      if (targets.includes(row.dataset.focuspath ?? '')) {
        anchor = row;
        break;
      }
    }
  }
  openStylePalette(targets, anchor ?? focusedRow ?? container ?? document.body);
}

registry.bind({
  key: 'g',
  page: 'sync',
  activePanel: 'epars',
  isInput: false,
  activeModal: null,
  isContextMenuOpen: false,
  label: 'Poser un style (palette : lettre, puis chiffre de tranche si année manquante)',
  group: 'sync',
  handler: openPaletteOnFocus,
});

// e — aperçu du rangement (plan groupé par dossier cible → confirmation →
// copies). Libre en page sync (vérifié : `e` = page years, Ctrl+e = playlist).
registry.bind({
  key: 'e',
  page: 'sync',
  isInput: false,
  activeModal: null,
  isContextMenuOpen: false,
  label: 'Aperçu du rangement par style (copies par dossier cible)',
  group: 'sync',
  handler: () => openStylePreview(),
});
