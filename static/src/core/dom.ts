// ─── core/dom.ts — helpers DOM partagés (EPIC-036) ─────────────────────
// Remplace le pattern « wipe-and-rebuild » dupliqué : save du scrollTop,
// wipe du conteneur, reconstruction, restore du scroll. Le save/restore
// dupliqué ×3 modules (epars, source, playlist) est le vrai gain — plus
// aucune page ne peut oublier le restore (étude §3.1).

/** Prépare le conteneur pour un re-render : sauvegarde le scrollTop, wipe le
 *  DOM, renvoie la fonction de restauration. Usage :
 *  `const restore = beginRender(container); …build… ; restore(container);`
 *  Le restore est no-op si le conteneur a été retiré du DOM entre-temps. */
export function beginRender(container: HTMLElement): (el: HTMLElement) => void {
  const saved = container.scrollTop;
  container.innerHTML = '';
  return (el: HTMLElement) => {
    requestAnimationFrame(() => {
      el.scrollTop = saved;
    });
  };
}

/** Ajoute le bandeau d'état vide standard (EPIC-014 : guidance visuelle au
 *  lieu d'un panneau muet). Remplace les 5 créations identiques
 *  `div.panel-empty` (epars ×2, source ×2, playlist-source). */
export function appendPanelEmpty(container: HTMLElement, message: string): void {
  const empty = document.createElement('div');
  empty.className = 'panel-empty';
  empty.textContent = message;
  container.appendChild(empty);
}
