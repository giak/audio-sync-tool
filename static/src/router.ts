// ─── Page router (EPIC-028) : une seule source de vérité pour la nav ──────
// state.page = 'sync' | 'playlist' | 'dups' | 'years' — layouts mutuellement
// exclusifs, boutons .active exclusifs. playlistMode est dérivé
// (page === 'playlist'). Extrait de script.ts pour être importable par les
// modules de vue sans effets de bord.

import { setStatus } from './core/feedback.js';
import { state } from './state.js';

export type Page = 'sync' | 'playlist' | 'dups' | 'years';

const PAGE_LAYOUTS: Record<Page, string[]> = {
  sync: ['main-panels'],
  playlist: ['playlist-layout'],
  dups: ['dups-layout'],
  years: ['years-layout'],
};

export function goPage(page: Page): void {
  state.page = page;
  state.playlistMode = page === 'playlist';

  // Layouts : un seul visible
  for (const [name, ids] of Object.entries(PAGE_LAYOUTS)) {
    for (const id of ids) {
      document.getElementById(id)?.classList.toggle('hidden', name !== page);
    }
  }
  // Boutons nav : un seul .active
  for (const name of Object.keys(PAGE_LAYOUTS) as Page[]) {
    document.getElementById(`page-${name}`)?.classList.toggle('active', name === page);
  }

  if (page === 'sync') setStatus('Prêt.');
}
