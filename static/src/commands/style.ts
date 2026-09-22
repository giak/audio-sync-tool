// ─── Style command: g (EPIC-035, scope-aware EPIC-041) ─────────────────────
// `g` (genre) ouvre la palette sur le MORCEAU surligné — celui de la liste qui
// porte le focus, colonne Éparpillé **ou** Source Data. La palette écrit alors
// le style et l'année dans les tags du fichier, tout de suite (EPIC-041).
//
// Avant EPIC-041, le binding exigeait `activePanel: 'epars'` : cliquer une
// seule fois dans la colonne droite (ce qu'on fait en permanence pour
// vérifier un doublon) rendait `g` MUET — pas même un message (constaté en
// live headless : `g` sur une ligne épars, panneau actif = source → aucune
// palette, aucun statut).
//
// Priorité des cibles (déterministe, documentée dans la spec) :
//   1. une ligne FICHIER focusée l'emporte sur un dossier focusé ;
//   2. à égalité, le panneau ACTIF l'emporte ;
//   3. la sélection multiple (Espace) ne s'applique qu'en travaillant côté
//      épars — elle est épars-only par construction : si le morceau focusé
//      vient de Source Data, c'est LUI la cible (l'année/le style d'un
//      morceau déjà rangé se corrige sans toucher à un lot de rangement).
//
// Importé EN DERNIER dans script.ts : les index des bindings existants ne
// bougent pas.

import { setStatus } from '../core/feedback.js';
import { openGenreAudit } from '../render/styleAudit.js';
import { openStylePalette } from '../render/stylePalette.js';
import { openStylePreview } from '../render/stylePreview.js';
import { state } from '../state.js';
import { registry } from './registry.js';

/** Colonnes de la page Sync : conteneur DOM ↔ panneau logique. */
const LISTS = [
  { id: 'epars-container', panel: 'epars' },
  { id: 'source-container', panel: 'source' },
] as const;

interface FocusedItem {
  el: HTMLElement;
  container: HTMLElement;
  panel: 'epars' | 'source';
  isFile: boolean;
}

/** Élément surligné (`.focused`) de chaque colonne, avec son panneau. */
function focusedItems(): FocusedItem[] {
  const out: FocusedItem[] = [];
  for (const { id, panel } of LISTS) {
    const container = document.getElementById(id);
    const el = container?.querySelector<HTMLElement>('.focused');
    if (!container || !el) continue;
    out.push({ el, container, panel, isFile: el.classList.contains('file-row') });
  }
  return out;
}

/** Morceau surligné à qui s'applique `g` (null si rien, ou seulement un
 *  dossier). Règle 1+2 : fichier > dossier, panneau actif en arbitre. */
function focusedFile(): FocusedItem | null {
  const files = focusedItems().filter(c => c.isFile);
  if (files.length === 0) return null;
  return files.find(c => c.panel === state.activePanel) ?? files[0];
}

/** Ligne épars surlignée (ancre pour la sélection multiple). */
function focusedEparsRow(): HTMLElement | null {
  const container = document.getElementById('epars-container');
  const focused = container?.querySelector('.focused') as HTMLElement | null;
  return (focused?.closest('.file-row') as HTMLElement | null) ?? null;
}

export function openPaletteOnFocus(): void {
  const item = focusedFile();
  // Sélection multiple : épars-only, et seulement si on travaille côté épars
  // (règle 3 — un fichier Source Data surligné reprend la main).
  const selected = [...state.selectedEparsFiles.values()].map(s => s.fullpath).filter(Boolean);
  if (selected.length > 0 && (item === null || item.panel === 'epars')) {
    const focusedRow = focusedEparsRow();
    const container = document.getElementById('epars-container');
    // Ancre : la ligne focusée si elle fait partie des cibles, sinon la
    // première cible visible.
    let anchor = focusedRow && selected.includes(focusedRow.dataset.focuspath ?? '') ? focusedRow : null;
    if (!anchor && container) {
      for (const row of container.querySelectorAll<HTMLElement>('.file-row')) {
        if (selected.includes(row.dataset.focuspath ?? '')) {
          anchor = row;
          break;
        }
      }
    }
    openStylePalette(selected, anchor ?? focusedRow ?? container ?? document.body);
    return;
  }

  if (!item) {
    setStatus(
      focusedItems().length > 0
        ? "g s'applique à un morceau : déplie le dossier (→) puis surligne une ligne (↑↓)."
        : 'Aucun morceau surligné — surligne une ligne (↑↓ ou clic), colonne Éparpillé ou Source Data.',
    );
    return;
  }
  const fullpath = item.el.dataset.focuspath;
  if (!fullpath) {
    setStatus('Ligne sans chemin de fichier — impossible de taguer.');
    return;
  }
  openStylePalette([fullpath], item.el);
}

registry.bind({
  key: 'g',
  page: 'sync',
  isInput: false,
  activeModal: null,
  isContextMenuOpen: false,
  label: 'Poser un style et une année',
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
  label: 'Aperçu du rangement par style',
  group: 'sync',
  handler: () => openStylePreview(),
});

// a — aligner le genre des fichiers RANGÉS sur leur dossier (EPIC-044). Aperçu
// avant écriture, deux modes au choix, journal partagé. Libre en page sync
// (vérifié : aucune touche `a`/`A` dans les 13 modules de commandes).
registry.bind({
  key: 'a',
  page: 'sync',
  isInput: false,
  activeModal: null,
  isContextMenuOpen: false,
  // Libellé COURT : à 4 colonnes (écran ≥ 1 850 px) la section Sync ne fait que
  // 416 px de large et un libellé long le renvoie à la ligne — la légende est
  // mesurée (scripts/measure_legend.py, vérification B), pas estimée.
  label: 'Aligner les genres des rangés',
  group: 'sync',
  handler: () => void openGenreAudit(),
});
