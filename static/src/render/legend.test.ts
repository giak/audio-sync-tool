// ─── Legend ↔ bindings bijection test (EPIC-031 P1, contrat EPIC-042) ──────
// Critère d'acceptation : « Légende affichée = dérivation exacte des bindings
// labellisés ». La légende ne peut plus diverger du code :
//   1. la touche de CHAQUE binding labellisé est affichée dans SA section
//      (comparaison de la séquence de chips, pas du texte : un binding peut
//      partager sa touche avec un autre) ;
//   2. toute ligne affichée a un texte qui est le label d'un binding — aucune
//      ligne orpheline, et aucun texte dupliqué dans une section ;
//   3. les FAMILLES (`legendFamily`) regroupent N bindings sur UNE ligne :
//      une seule porte le titre (vérifié), les autres n'apportent que leur
//      touche, dédoublonnée ;
//   4. les sections et la régénération idempotente (double appel = identique).
// Les modules commands/* sont importés RÉELS (pas de mock registry) : c'est le
// registry complet du produit qui est projeté dans la légende. Un module non
// importé ici = des bindings absents de la légende testée → l'importer rend le
// test plus fort, jamais moins.

import { beforeEach, describe, expect, it } from 'vitest';

// Registry complet = tous les modules de script.ts, l'ordre importe peu ici.
import '../commands/audio.js';
import '../commands/copy.js';
import '../commands/dups.js';
import '../commands/filter.js';
import '../commands/menu.js';
import '../commands/modals.js';
import '../commands/navigation.js';
import '../commands/playlist.js';
import '../commands/rating.js';
import '../commands/replace.js';
import '../commands/style.js';
import '../commands/years.js';
import { type CommandBinding, registry } from '../commands/registry.js';
import { renderKeyboardLegend } from './legend.js';

/** Titre de section attendu par groupe de binding. */
const GROUP_TITLES: Record<string, string> = {
  etats: 'États',
  sync: 'Sync',
  playlist: 'Playlist',
  dups: 'Doublons',
  years: 'Années',
  global: 'Transverse',
  cue: 'Cue editor',
};

/** Noms de touches de legend.ts (miroir du rendu — le test lit le DOM). */
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
};

interface Chip {
  mods: string[];
  key: string;
}

const chipOf = (b: CommandBinding): Chip => ({
  mods: [b.ctrlKey ? 'Ctrl' : null, b.altKey ? 'Alt' : null, b.shiftKey ? '⇧' : null].filter(
    (m): m is string => m !== null,
  ),
  key: KEY_NAMES[b.key] ?? b.key.toUpperCase(),
});

/** Chips d'un marqueur tel qu'affiché : les `<kbd>` séparés par « + » forment
 *  UN chip (modificateurs + touche) ; deux `<kbd>` adjacents = deux chips
 *  (familles : touches alternatives). */
function chipsOfMark(mark: Element): Chip[] {
  const chips: Chip[] = [];
  for (const node of Array.from(mark.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    if (el.matches('.legend-plus')) continue;
    if (!el.matches('kbd')) continue;
    const previousIsPlus = el.previousElementSibling?.matches('.legend-plus') ?? false;
    if (chips.length === 0 || !previousIsPlus) chips.push({ mods: [], key: '' });
    const current = chips[chips.length - 1];
    const text = el.textContent ?? '';
    if (current.key === '') {
      current.key = text;
    } else {
      current.mods.push(current.key);
      current.key = text;
    }
  }
  return chips;
}

const sameChip = (a: Chip, b: Chip): boolean =>
  a.key === b.key && a.mods.length === b.mods.length && a.mods.every((m, i) => m === b.mods[i]);

const rowText = (row: Element): string =>
  (row.querySelector('.legend-text')?.textContent ?? row.textContent ?? '').trim();

describe('légende générée ↔ bindings labellisés (bijection, EPIC-042)', () => {
  const labeled = (): CommandBinding[] => registry.list().filter(b => b.label);

  const bindingsSection = (group: string): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('#legend-grid .legend-section[data-origin="bindings"]')).filter(
      s => (s.querySelector('h4')?.textContent ?? '').includes(GROUP_TITLES[group] ?? '\u0000'),
    );

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="legend-grid">
        <div class="legend-section" data-legend-section="etats"><h4>États — page Sync</h4>
          <div class="legend-row"><span class="legend-mark"><span class="led-demo"></span></span><span class="legend-text">Nouveau — hors Source Data</span></div>
        </div>
        <div class="legend-section" data-legend-section="cue"><h4>Cue editor</h4>
          <div class="legend-row"><span class="legend-mark"><kbd>C</kbd></span><span class="legend-text">Poser un cue</span></div>
        </div>
      </div>
    `;
    renderKeyboardLegend();
  });

  it('la touche de chaque binding labellisé est affichée dans SA section', () => {
    for (const b of labeled()) {
      const sections = bindingsSection(b.group ?? 'global');
      expect(sections.length, `section « ${b.group} » introuvable`).toBe(1);
      const chips = sections[0].querySelectorAll('.legend-row').length
        ? Array.from(sections[0].querySelectorAll('.legend-row')).flatMap(r =>
            Array.from(r.querySelectorAll('.legend-mark')).flatMap(m => chipsOfMark(m)),
          )
        : [];
      const want = chipOf(b);
      expect(
        chips.some(c => sameChip(c, want)),
        `touche de « ${b.label} » (${want.mods.join('+')}${want.mods.length ? '+' : ''}${want.key}) absente de la section ${b.group}`,
      ).toBe(true);
    }
  });

  it('chaque ligne affichée a un texte de binding, et aucun texte dupliqué dans une section', () => {
    for (const section of document.querySelectorAll<HTMLElement>('.legend-section[data-origin="bindings"]')) {
      const labels = labeled().map(b => b.label!);
      const texts = Array.from(section.querySelectorAll('.legend-row')).map(rowText);
      const unexplained = texts.filter(t => !labels.includes(t));
      expect(unexplained, `lignes sans binding source (section ${section.dataset.legendSection})`).toEqual([]);
      expect(new Set(texts).size, `textes dupliqués dans ${section.dataset.legendSection}`).toBe(texts.length);
    }
  });

  it('les familles sont fusionnées : une ligne par famille, exactement un titre', () => {
    const families = new Map<string, CommandBinding[]>();
    for (const b of labeled()) {
      if (!b.legendFamily) continue;
      const key = `${b.group ?? 'global'}|${b.legendFamily}`;
      families.set(key, [...(families.get(key) ?? []), b]);
    }
    expect(families.size).toBeGreaterThan(0);
    for (const [key, members] of families) {
      expect(members.length, `famille ${key} réduite à un seul binding (fusion inutile)`).toBeGreaterThan(1);
      expect(
        members.filter(m => m.legendFamilyTitle).length,
        `famille ${key} : il faut EXACTEMENT un legendFamilyTitle`,
      ).toBe(1);
      const [group, name] = key.split('|');
      const section = bindingsSection(group)[0];
      const title = members.find(m => m.legendFamilyTitle)!.label!;
      const row = Array.from(section.querySelectorAll('.legend-row')).find(r => rowText(r) === title);
      expect(row, `ligne de la famille ${name} absente`).toBeTruthy();
      // Le dédoublonnage des touches est le point de la fusion (8× Échap → 1).
      const chips = Array.from(row!.querySelectorAll('.legend-mark')).flatMap(m => chipsOfMark(m));
      expect(new Set(chips.map(c => `${c.mods.join('+')}|${c.key}`)).size, `touches dupliquées dans ${name}`).toBe(
        chips.length,
      );
    }
  });

  it('le nombre de lignes = bindings labellisés − bindings fusionnés', () => {
    const all = labeled();
    const merged = all.filter(b => {
      if (!b.legendFamily) return false;
      const family = all.filter(
        o => (o.group ?? 'global') === (b.group ?? 'global') && o.legendFamily === b.legendFamily,
      );
      return family.length > 1 && !b.legendFamilyTitle;
    }).length;
    const rows = document.querySelectorAll('#legend-grid .legend-section[data-origin="bindings"] .legend-row').length;
    expect(rows).toBe(all.length - merged);
  });

  it('les 7 sections existent, les statiques restent en place', () => {
    const titles = Array.from(document.querySelectorAll('#legend-grid .legend-section')).map(
      s => s.querySelector('h4')?.textContent ?? '',
    );
    expect(titles[0]).toContain('États'); // statique, en tête de la 1re colonne
    expect(titles.some(t => t.includes('Cue editor'))).toBe(true); // statique
    for (const title of Object.values(GROUP_TITLES)) {
      expect(
        titles.some(t => t.includes(title)),
        `section ${title} absente`,
      ).toBe(true);
    }
  });

  it('un template d’une autre version ne fait pas disparaître les sections statiques', () => {
    // RÉGRESSION constatée en live (2026-09-22) : le serveur a servi l'ancien
    // HTML (template compilé par Flask avant le commit, donc sans
    // `data-legend-section`) avec le nouveau bundle ; les sections statiques
    // n'étaient donc pas reconnues et `replaceChildren` les EFFAÇAIT — la
    // modale affichait « États & pastilles » et « Cue editor » VIDES.
    // Contrat : aucune section du HTML n'est perdue, quelle que soit la version.
    document.body.innerHTML = `
      <div id="legend-grid">
        <div class="legend-section"><h4>États — page Sync</h4>
          <div class="legend-row"><span class="led-demo led-demo-selectionne"></span> Sélectionné (multi-copie, Espace)</div>
        </div>
        <div class="legend-section"><h4>Raccourcis — Cue editor</h4>
          <div class="legend-row"><kbd>C</kbd> Poser un cue au curseur</div>
        </div>
        <div class="legend-section"><h4>Section d’une autre version</h4>
          <div class="legend-row"><kbd>Z</kbd> Contenu non reconnu</div>
        </div>
      </div>`;

    renderKeyboardLegend();

    const text = document.getElementById('legend-grid')!.textContent ?? '';
    expect(text, 'section « États » perdue').toContain('Sélectionné (multi-copie, Espace)');
    expect(text, 'section « Cue editor » perdue').toContain('Poser un cue au curseur');
    expect(text, 'section inconnue effacée').toContain('Contenu non reconnu');
    // Adoptée par son titre : elle est reconnue comme la section États.
    const etats = Array.from(document.querySelectorAll<HTMLElement>('.legend-section')).find(s =>
      (s.querySelector('h4')?.textContent ?? '').includes('États'),
    )!;
    expect(etats.dataset.legendSection).toBe('etats');
  });

  it('régénération idempotente : double appel = mêmes sections et lignes', () => {
    const count = (): number => document.querySelectorAll('#legend-grid .legend-row').length;
    const before = count();
    renderKeyboardLegend();
    expect(count()).toBe(before);
    expect(document.querySelectorAll('#legend-grid .legend-section').length).toBe(7);
  });

  it('les touches modifiées portent leurs modificateurs (Ctrl+S, Shift+F10, Alt+←)', () => {
    const grid = document.getElementById('legend-grid')!.textContent ?? '';
    expect(grid).toMatch(/Ctrl ?\+ ?S/); // Ctrl+S — sauvegarde playlist
    expect(grid).toMatch(/⇧ ?\+ ?F10/); // Shift+F10 — menu contextuel
    expect(grid).toMatch(/Alt ?\+ ?←/); // historique (FINDING 3 fixé)
    expect(grid).toMatch(/Échap/); // pile de fermeture documentée
  });
});
