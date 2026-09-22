// ─── Legend « ❓ Raccourcis & Légende » (EPIC-031 P1, refondue EPIC-042) ────
// Les sections de RACCOURCIS sont GÉNÉRÉES depuis les bindings labellisés du
// registry (bind({..., label, group})) : la légende ne peut plus diverger du
// code — ajouter un raccourci = un seul endroit. legend.test.ts verrouille la
// bijection (tout binding labellisé apparaît, aucune ligne orpheline).
//
// EPIC-042 — lisibilité, après mesure (harnais `scripts/measure_legend.py`) :
//   · la grille 4×N étirait chaque section à la hauteur de la plus haute
//     (2 385 px d'espace mort, 52 libellés sur 89 renvoyés à la ligne) ;
//     → 4 COLONNES explicites, sections affectées pour équilibrer, jamais
//       étirées ;
//   · l'abscisse des libellés dépendait de la largeur des touches de CHAQUE
//     ligne (grille `max-content 1fr` par ligne) → désalignement ;
//     → la section est une grille à 2 pistes (`max-content 1fr`) et chaque
//       ligne s'y aligne en `subgrid` : une seule abscisse par section ;
//   · 8 lignes « Échap — fermer X » décrivaient la même touche ;
//     → FAMILLES (`legendFamily`) : une ligne par famille, les touches côte à
//       côte, le texte du binding marqué `legendFamilyTitle` ;
//   · un seul marqueur en tête de ligne (touche, pastille ou badge), une seule
//     échelle typographique.
//
// Restent STATIQUES (HTML) : la section « États & pastilles » (elle décrit des
// couleurs du DOM, pas des touches) et la section « Cue editor » (ses touches
// vivent dans un sous-système à listeners propres, hors registry). legend.ts
// les DÉPLACE dans leur colonne et les préserve telles quelles.
//
// CONTRAT NON DESTRUCTIF (régression live 2026-09-22) : une section du HTML qui
// n'est pas reconnue n'est JAMAIS effacée. Le serveur a servi un template
// compilé AVANT ce commit (donc sans `data-legend-section`) avec ce bundle ;
// les statiques n'étant pas reconnues, un `replaceChildren` sec les vidait — la
// modale affichait « États & pastilles » et « Cue editor » vides. Une statique
// est donc (1) reconnue par `data-legend-section`, (2) à défaut ADOPTÉE par son
// titre (versions antérieures), (3) sinon CONSERVÉE en queue de grille.

import { registry } from '../commands/registry.js';

export type LegendSectionId = 'etats' | 'sync' | 'playlist' | 'dups' | 'years' | 'global' | 'cue';

interface SectionDef {
  id: LegendSectionId;
  title: string;
}

/** Sections de la feuille, dans l'ordre de lecture. PAS de table de colonnes :
 *  la feuille est un flux multi-colonnes (`columns: 320px`, CSS) qui choisit
 *  lui-même son nombre de colonnes selon la largeur disponible et équilibre les
 *  hauteurs. Une table écrite à la main (4 colonnes figées) donnait 3 colonnes
 *  en haut et une 4ᵉ **orpheline** pleine largeur à 1 366 px (mesuré), et une
 *  colonne de 285 px coupe les libellés. Le flux les regroupe comme la table le
 *  faisait à 1 600 px ([États+Doublons], [Sync], [Playlist+Années],
 *  [Transverse+Cue editor]) et se rééquilibre autrement quand ça ne tient pas. */
export const LEGEND_SECTIONS: ReadonlyArray<SectionDef> = [
  { id: 'etats', title: 'États & pastilles' },
  { id: 'dups', title: 'Doublons' },
  { id: 'sync', title: 'Sync' },
  { id: 'playlist', title: 'Playlist' },
  { id: 'years', title: 'Années' },
  { id: 'global', title: 'Transverse' },
  { id: 'cue', title: 'Cue editor' },
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

/** Touches d'un binding, en chips `<kbd>` (modificateurs puis touche). */
function kbdHtml(b: { key: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string {
  const parts: string[] = [];
  if (b.ctrlKey) parts.push('<kbd>Ctrl</kbd>');
  if (b.altKey) parts.push('<kbd>Alt</kbd>');
  if (b.shiftKey) parts.push('<kbd>⇧</kbd>');
  parts.push(`<kbd>${KEY_NAMES[b.key] ?? b.key.toUpperCase()}</kbd>`);
  return parts.join('<span class="legend-plus">+</span>');
}

interface LegendRow {
  keys: string[];
  text: string;
}

/** Projection des bindings labellisés en lignes de légende, section par
 *  section : chaque binding donne une ligne, sauf ceux d'une même
 *  `legendFamily` qui sont GROUPÉS sur la ligne de leur `legendFamilyTitle`. */
export function legendRows(): Map<LegendSectionId, LegendRow[]> {
  const out = new Map<LegendSectionId, LegendRow[]>();
  const families = new Map<string, LegendRow>();
  for (const b of registry.list()) {
    if (!b.label) continue;
    const section = (b.group ?? 'global') as LegendSectionId;
    const rows = out.get(section) ?? [];
    out.set(section, rows);
    if (!b.legendFamily) {
      rows.push({ keys: [kbdHtml(b)], text: b.label });
      continue;
    }
    const familyKey = `${section}|${b.legendFamily}`;
    let row = families.get(familyKey);
    if (!row) {
      row = { keys: [], text: b.legendFamilyTitle ? b.label : '' };
      families.set(familyKey, row);
      rows.push(row);
    }
    // Chips DÉDOUBLONNÉS : « 8×Échap » doit s'afficher « Échap » (les familles
    // regroupent justement des bindings qui partagent la même touche).
    const chip = kbdHtml(b);
    if (!row.keys.includes(chip)) row.keys.push(chip);
    if (b.legendFamilyTitle) {
      // Le titre peut être enregistré après des membres : la ligne reste à la
      // place de son PREMIER membre (ordre de tabulation stable).
      row.text = b.label;
    }
  }
  for (const rows of out.values()) {
    for (const row of rows) if (!row.text) row.text = row.keys.length > 1 ? 'Sans titre' : '';
  }
  return out;
}

function renderRows(rows: LegendRow[]): string {
  return rows
    .map(r => {
      const mark = `<span class="legend-mark">${r.keys.join('')}</span>`;
      return `<div class="legend-row">${mark}<span class="legend-text">${r.text}</span></div>`;
    })
    .join('');
}

/** Titres des sections statiques des versions ANTÉRIEURES du template : une
 *  section non annotée mais reconnaissable est adoptée — le HTML d'une autre
 *  version ne doit jamais coûter une section (cf. contrat non destructif). */
const STATIC_TITLES: ReadonlyArray<[LegendSectionId, RegExp]> = [
  ['etats', /^états/i],
  ['cue', /cue editor/i],
];

/** Écrit (ou réécrit) les colonnes de #legend-grid. Idempotent : chaque appel
 *  reconstruit les colonnes, y REPLACE les sections statiques (États, Cue
 *  editor) — le HTML reste leur source de vérité — et régénère les sections de
 *  raccourcis depuis les bindings. Aucune section inconnue n'est effacée. */
export function renderKeyboardLegend(): void {
  const grid = document.getElementById('legend-grid');
  if (!grid) return;

  // Détachées AVANT reconstruction : statiques replacées, inconnues conservées.
  const statics = new Map<LegendSectionId, HTMLElement>();
  const leftovers: HTMLElement[] = [];
  for (const el of Array.from(grid.querySelectorAll<HTMLElement>('.legend-section'))) {
    el.remove();
    if (el.dataset.origin === 'bindings') continue; // régénérée depuis le registry
    const declared = el.dataset.legendSection as LegendSectionId | undefined;
    if (declared) {
      statics.set(declared, el);
      continue;
    }
    const title = el.querySelector('h4')?.textContent ?? '';
    const adopted = STATIC_TITLES.find(([, pattern]) => pattern.test(title))?.[0];
    if (adopted && !statics.has(adopted)) {
      el.dataset.legendSection = adopted;
      statics.set(adopted, el);
      continue;
    }
    leftovers.push(el);
  }

  const rows = legendRows();
  const sections: HTMLElement[] = [];
  for (const def of LEGEND_SECTIONS) {
    const existing = statics.get(def.id);
    if (existing) {
      sections.push(existing);
      continue;
    }
    const section = document.createElement('div');
    section.className = 'legend-section';
    section.dataset.legendSection = def.id;
    section.dataset.origin = 'bindings';
    section.innerHTML = `<h4>${def.title}</h4>${renderRows(rows.get(def.id) ?? [])}`;
    sections.push(section);
  }

  // Une section non reconnue est CONSERVÉE (visible) plutôt qu'effacée : mieux
  // vaut une feuille imparfaite qu'une légende muette sur un de ses états.
  if (leftovers.length) {
    console.warn(
      `légende : ${leftovers.length} section(s) non reconnue(s) conservée(s) en fin de grille — template et bundle de versions différentes ?`,
    );
    sections.push(...leftovers);
  }
  grid.replaceChildren(...sections);
}
