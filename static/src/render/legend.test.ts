// ─── Legend ↔ bindings bijection test (EPIC-031 P1) ────────────────────────
// Critère d'acceptation de l'EPIC : « Légende affichée = dérivation exacte des
// bindings labellisés ». La légende ne peut plus diverger du code :
//   1. tout binding labellisé apparaît EXACTEMENT une fois, avec sa touche ;
//   2. toute ligne générée vient d'un binding (aucune ligne orpheline) ;
//   3. les 4 sections existent, la section « États » statique reste en tête ;
//   4. la régénération est idempotente (double appel = même résultat).
// Les modules commands/* sont importés RÉELS (pas de mock registry) : c'est le
// registry complet du produit qui est projeté dans la légende.

import { beforeEach, describe, expect, it } from 'vitest';

// Registry complet = tous les modules de script.ts, l'ordre importe peu ici.
import '../commands/menu.js';
import '../commands/navigation.js';
import '../commands/audio.js';
import '../commands/copy.js';
import '../commands/filter.js';
import '../commands/rating.js';
import '../commands/playlist.js';
import '../commands/modals.js';
import '../commands/replace.js';
import '../commands/dups.js';
import { registry } from '../commands/registry.js';
import { renderKeyboardLegend } from './legend.js';

describe('légende générée ↔ bindings labellisés (bijection, EPIC-031 P1)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="legend-grid">
        <div class="legend-section" data-origin="static">
          <h4>États — page Sync</h4>
          <div class="legend-row"><span class="led-demo"></span> Nouveau — pas dans la Source Data</div>
        </div>
        <div class="legend-section"><h4>Raccourcis — Cue editor</h4><div class="legend-row"><kbd>C</kbd> Poser un cue</div></div>
      </div>
    `;
    renderKeyboardLegend();
  });

  const labeled = (): Array<{ key: string; label: string; group: string }> =>
    registry
      .list()
      .filter(b => b.label)
      .map(b => ({ key: b.key, label: b.label!, group: b.group ?? 'global' }));

  const GROUP_TITLES: Record<string, string> = {
    sync: 'Sync',
    playlist: 'Playlist',
    dups: 'Doublons',
    global: 'Transverse',
  };

  const sectionOf = (group: string): HTMLElement | null =>
    (
      Array.from(document.querySelectorAll('#legend-grid .legend-section[data-origin="bindings"]')) as HTMLElement[]
    ).find(s => s.querySelector('h4')?.textContent?.includes(GROUP_TITLES[group])) ?? null;

  it('chaque binding labellisé a EXACTEMENT une ligne DANS SA SECTION, avec sa touche', () => {
    for (const b of labeled()) {
      const rows = Array.from(sectionOf(b.group)?.querySelectorAll('.legend-row') ?? []);
      // endsWith : le label est le SUFFIXE de la ligne par construction — un
      // label préfixe d'un autre (« Seek audio −20 s » ⊂ « … (avec Shift) »)
      // ne doit pas matcher la ligne de l'autre.
      const matches = rows.filter(r => (r.textContent || '').trimEnd().endsWith(b.label));
      expect(matches.length, `ligne manquante ou dupliquée pour « ${b.label} » (${b.group})`).toBe(1);
      expect(matches[0].querySelectorAll('kbd').length, `aucun <kbd> pour ${b.key}`).toBeGreaterThan(0);
    }
  });

  it('toute ligne générée vient d’un binding labellisé (aucune ligne orpheline)', () => {
    const rows = Array.from(
      document.querySelectorAll('#legend-grid .legend-section[data-origin="bindings"] .legend-row'),
    );
    const labels = labeled().map(b => b.label);
    const unexplained = rows.filter(r => !labels.some(l => (r.textContent || '').trimEnd().endsWith(l)));
    expect(unexplained, 'lignes sans binding source').toEqual([]);
    expect(rows.length).toBe(labeled().length);
  });

  it('les 4 sections raccourcis existent, la section États statique reste en tête', () => {
    const sections = Array.from(document.querySelectorAll('#legend-grid .legend-section'));
    const titles = sections.map(s => s.querySelector('h4')?.textContent ?? '');
    expect(titles[0]).toContain('États'); // statique, préservée
    expect(titles.some(t => t.includes('Sync'))).toBe(true);
    expect(titles.some(t => t.includes('Playlist'))).toBe(true);
    expect(titles.some(t => t.includes('Doublons'))).toBe(true);
    expect(titles.some(t => t.includes('Transverse'))).toBe(true);
    // La section statique « Cue editor » (non générée) est toujours là aussi.
    expect(titles.some(t => t.includes('Cue editor'))).toBe(true);
  });

  it('régénération idempotente : double appel = même nombre de sections et de lignes', () => {
    const count = (): number => document.querySelectorAll('#legend-grid .legend-row').length;
    const before = count();
    renderKeyboardLegend();
    expect(count()).toBe(before);
    const sections = document.querySelectorAll('#legend-grid .legend-section');
    expect(sections.length).toBe(6); // États + Cue editor (statiques) + 4 générées
  });

  it('les touches modifiées portent leurs modificateurs (Ctrl+S, Shift+F10, Alt+←)', () => {
    const grid = document.getElementById('legend-grid')!.textContent ?? '';
    expect(grid).toMatch(/Ctrl \+ S/); // Ctrl+S — sauvegarde playlist
    expect(grid).toMatch(/⇧ \+ F10/); // Shift+F10 — menu contextuel
    expect(grid).toMatch(/Alt \+ ←/); // historique (FINDING 3 fixé)
    expect(grid).toMatch(/Échap/); // pile de fermeture documentée
  });
});
