// ─── Unit tests: commands/style.ts — g key binding (EPIC-035/041) ─────────
// Module à effet de bord : registry.bind() à l'import. registry et la palette
// sont mockés pour capturer le binding ; state est le vrai module.
// EPIC-041 : `g` est scope-aware — il agit sur le MORCEAU surligné de la
// colonne qui porte le focus (Éparpillé ou Source Data), plus sur le seul
// panneau épars (avant, un clic dans la colonne droite rendait `g` muet).
// EPIC-044 : troisième binding, `a` — alignement du genre des rangés sur leur
// dossier (aperçu → confirmation → écriture).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { bind, openGenreAudit, openStylePalette, openStylePreview } = vi.hoisted(() => ({
  bind: vi.fn(),
  openGenreAudit: vi.fn(),
  openStylePalette: vi.fn(),
  openStylePreview: vi.fn(),
}));

vi.mock('./registry.js', () => ({ registry: { bind } }));
vi.mock('../render/stylePalette.js', () => ({ openStylePalette }));
vi.mock('../render/stylePreview.js', () => ({ openStylePreview }));
vi.mock('../render/styleAudit.js', () => ({ openGenreAudit }));

import { state } from '../state.js';
import './style.js';

type Binding = Record<string, unknown> & { handler: () => void };
let binding: Binding;
let bindingE: Binding;
let bindingA: Binding;
let bindCount = 0;

beforeAll(() => {
  // Capturé AVANT le clearAllMocks du beforeEach (registry.bind s'exécute à l'import).
  bindCount = bind.mock.calls.length;
  binding = bind.mock.calls[0][0] as Binding;
  bindingE = bind.mock.calls[1][0] as Binding;
  bindingA = bind.mock.calls[2][0] as Binding;
});

beforeEach(() => {
  vi.clearAllMocks();
  state.selectedEparsFiles = new Map();
  state.activePanel = 'epars';
  document.body.innerHTML = `
    <div id="status-text"></div>
    <div id="epars-container"><table><tbody>
      <tr class="file-row" data-focuspath="/e/a.mp3"><td class="file"></td></tr>
      <tr class="file-row focused" data-focuspath="/e/b.mp3"><td class="file"></td></tr>
      <tr class="file-row" data-focuspath="/e/c.mp3"><td class="file"></td></tr>
    </tbody></table></div>
    <div id="source-container"><div class="directory focused" data-focuspath="/s/techno_1990">techno_1990</div>
      <table><tbody>
        <tr class="file-row" data-focuspath="/s/techno_1990/x.mp3"><td class="file"></td></tr>
      </tbody></table></div>`;
});

afterAll(() => {
  document.body.innerHTML = '';
});

describe('style command (g)', () => {
  it('trois bindings : g, e et a (page sync), hors input/modale/menu, labellisés', () => {
    expect(bindCount).toBe(3);
    expect(bindingA.key).toBe('a');
    expect(bindingA.page).toBe('sync');
    expect(bindingA.isInput).toBe(false);
    expect(bindingA.activeModal).toBeNull();
    expect(bindingA.label).toContain('Aligner');
    expect(bindingE.key).toBe('e');
    expect(bindingE.page).toBe('sync');
    expect(bindingE.isInput).toBe(false);
    expect(bindingE.activeModal).toBeNull();
    expect(bindingE.ctrlKey).toBeUndefined(); // Ctrl+e playlist reste distinct par playlistMode/page
    expect(typeof bindingE.label).toBe('string');
    expect(binding.key).toBe('g');
    expect(binding.page).toBe('sync');
    // EPIC-041 : plus de garde activePanel — le panneau gagnant est résolu
    // par le handler (un clic dans la colonne droite ne rend plus `g` muet).
    expect(binding.activePanel).toBeUndefined();
    expect(binding.isInput).toBe(false);
    expect(binding.activeModal).toBeNull();
    expect(binding.isContextMenuOpen).toBe(false);
    expect(typeof binding.label).toBe('string');
    expect(binding.group).toBe('sync');
  });

  it('sans sélection → cible = ligne focusée, ancre = cette ligne', () => {
    binding.handler();
    const rowB = document.querySelector('[data-focuspath="/e/b.mp3"]');
    expect(openStylePalette).toHaveBeenCalledWith(['/e/b.mp3'], rowB);
  });

  it('avec sélection → cibles = la sélection (lot), ancre = la ligne focusée si elle en fait partie', () => {
    state.selectedEparsFiles = new Map([
      ['/e/a.mp3', { filename: 'a.mp3', eparDir: '/e', fullpath: '/e/a.mp3' }],
      ['/e/b.mp3', { filename: 'b.mp3', eparDir: '/e', fullpath: '/e/b.mp3' }],
    ]);
    binding.handler();
    const rowB = document.querySelector('[data-focuspath="/e/b.mp3"]');
    expect(openStylePalette).toHaveBeenCalledWith(['/e/a.mp3', '/e/b.mp3'], rowB);
  });

  it('sélection ne contenant pas la ligne focusée → ancre = première ligne sélectionnée visible', () => {
    state.selectedEparsFiles = new Map([['/e/c.mp3', { filename: 'c.mp3', eparDir: '/e', fullpath: '/e/c.mp3' }]]);
    binding.handler();
    const rowC = document.querySelector('[data-focuspath="/e/c.mp3"]');
    expect(openStylePalette).toHaveBeenCalledWith(['/e/c.mp3'], rowC);
  });

  it('ni focus ni sélection → message barre d’état, palette non ouverte', () => {
    for (const el of document.querySelectorAll('.focused')) el.classList.remove('focused');
    binding.handler();
    expect(openStylePalette).not.toHaveBeenCalled();
    expect(document.getElementById('status-text')?.textContent).toContain('Aucun morceau surligné');
  });

  it('e → openStylePreview', () => {
    bindingE.handler();
    expect(openStylePreview).toHaveBeenCalledTimes(1);
  });

  it('a → openGenreAudit (aperçu avant écriture, EPIC-044)', () => {
    bindingA.handler();
    expect(openGenreAudit).toHaveBeenCalledTimes(1);
    expect(openStylePalette).not.toHaveBeenCalled();
  });

  it('focus sur un dossier épars (pas une ligne fichier) → pas de cible, message honnête', () => {
    document.querySelector('.focused')?.classList.remove('focused');
    const dir = document.createElement('div');
    dir.className = 'directory focused';
    document.getElementById('epars-container')!.prepend(dir);
    binding.handler();
    expect(openStylePalette).not.toHaveBeenCalled();
    expect(document.getElementById('status-text')?.textContent).toContain('morceau');
  });

  // ── EPIC-041 : le scope suit le MORCEAU surligné, pas `state.activePanel` ──

  it('panneau actif = source mais ligne épars surlignée → palette sur la ligne épars', () => {
    // Régression mesurée en live : cliquer la colonne droite puis `g` sur une
    // ligne épars ne faisait RIEN (binding gaté sur activePanel).
    state.activePanel = 'source';
    document.querySelector('#source-container .directory')?.classList.remove('focused');
    binding.handler();
    const rowB = document.querySelector('[data-focuspath="/e/b.mp3"]');
    expect(openStylePalette).toHaveBeenCalledWith(['/e/b.mp3'], rowB);
  });

  it('morceau surligné dans Source Data → cible = ce morceau (tag immédiat)', () => {
    document.querySelector('#source-container .directory')?.classList.remove('focused');
    const row = document.querySelector('[data-focuspath="/s/techno_1990/x.mp3"]');
    row!.classList.add('focused');
    state.activePanel = 'source';
    binding.handler();
    expect(openStylePalette).toHaveBeenCalledWith(['/s/techno_1990/x.mp3'], row);
  });

  it('dossier surligné à droite + ligne épars surlignée → le fichier l’emporte sur le dossier', () => {
    state.activePanel = 'source';
    binding.handler(); // .directory.focused à droite, .file-row.focused à gauche
    const rowB = document.querySelector('[data-focuspath="/e/b.mp3"]');
    expect(openStylePalette).toHaveBeenCalledWith(['/e/b.mp3'], rowB);
  });

  it('sélection épars + morceau Source Data surligné → la cible est le morceau source', () => {
    state.selectedEparsFiles = new Map([['/e/a.mp3', { filename: 'a.mp3', eparDir: '/e', fullpath: '/e/a.mp3' }]]);
    document.querySelector('#source-container .directory')?.classList.remove('focused');
    const row = document.querySelector('[data-focuspath="/s/techno_1990/x.mp3"]');
    row!.classList.add('focused');
    state.activePanel = 'source';
    binding.handler();
    expect(openStylePalette).toHaveBeenCalledWith(['/s/techno_1990/x.mp3'], row);
  });
});
