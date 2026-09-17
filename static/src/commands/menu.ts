// ─── Context-menu keyboard commands (EPIC-031 P1) ─────────────────────────
// Shift+F10 : ouvre le menu contextuel de l'élément focusé (avant F10 : il
// n'est pas un F-outil, il est le menu clavier natif — grammaire EPIC-031).
// Une fois ouvert, le focus DOM reste sur l'élément sous-jacent : la sur-
// brillance est un état CSS du menu (.ctx-highlight), ↑↓ naviguent, Enter
// active (défaut : premier item), Échap ferme. Échap-menu est le PREMIER
// pilier de la pile de fermeture (avant modales et stop audio) : il doit
// gagner dans tout contexte où un menu est ouvert — y compris audio en
// lecture ou input focusé, d'où l'ABSENCE de garde isInput/isAudioPlaying.

import { activateContextMenuItem, closeContextMenu, moveContextMenuHighlight } from '../ui.js';
import { registry } from './registry.js';

/** Ouvre le menu contextuel standard de l'élément focusé (même contenu que le
 *  clic droit) : le listener contextmenu des rows/dossiers construit le menu
 *  depuis e.clientX/Y — on dispatche un MouseEvent synthétique aux mêmes
 *  coordonnées réelles. Le handler du listener appelle preventDefault() (pas
 *  de menu natif), si bien qu'un élément SANS listener contextmenu produit un
 *  événement non annulé : on ne montre rien dans ce cas (l'utilisateur voit
 *  que l'élément n'a pas de menu, plutôt qu'un menu vide ou déplacé). */
function openContextMenuOnFocused(): void {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const e = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
  });
  target.dispatchEvent(e);
  if (!e.defaultPrevented) return; // pas de menu contextuel sur cet élément
}

// Shift+F10 — ouvrir le menu clavier de l'élément focusé
registry.bind({
  key: 'F10',
  shiftKey: true,
  isContextMenuOpen: false,
  label: 'Ouvrir le menu contextuel de l’élément focusé',
  group: 'global',
  handler: openContextMenuOnFocused,
});

// ↓ / ↑ — déplacer la surbrillance quand le menu est ouvert (passent AVANT
// toute navigation de liste : le menu, comme une modale, isole le clavier)
registry.bind({
  key: 'ArrowDown',
  isContextMenuOpen: true,
  label: 'Menu contextuel : item suivant',
  group: 'global',
  handler: () => moveContextMenuHighlight(1),
});
registry.bind({
  key: 'ArrowUp',
  isContextMenuOpen: true,
  label: 'Menu contextuel : item précédent',
  group: 'global',
  handler: () => moveContextMenuHighlight(-1),
});

// Enter — activer l'item surligné
registry.bind({
  key: 'Enter',
  isContextMenuOpen: true,
  label: 'Menu contextuel : valider l’item surligné',
  group: 'global',
  handler: () => activateContextMenuItem(),
});

// Échap — fermer le menu : PREMIER pilier de la pile de fermeture
// (menu → modale → filtre → dossier déplié → stop audio). Enregistré dans le
// module menu.ts, importé AVANT modals.ts/audio.ts dans script.ts.
registry.bind({
  key: 'Escape',
  isContextMenuOpen: true,
  label: 'Fermer le menu contextuel',
  group: 'global',
  handler: () => closeContextMenu(),
});
