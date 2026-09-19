// ─── Unit tests: commands/style.ts — g key binding (EPIC-035) ──────────────
// Module à effet de bord : registry.bind() à l'import. registry et la palette
// sont mockés pour capturer le binding ; state est le vrai module.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { bind, openStylePalette } = vi.hoisted(() => ({
  bind: vi.fn(),
  openStylePalette: vi.fn(),
}));

vi.mock('./registry.js', () => ({ registry: { bind } }));
vi.mock('../render/stylePalette.js', () => ({ openStylePalette }));

import { state } from '../state.js';
import './style.js';

let binding: Record<string, unknown> & { handler: () => void };
let bindCount = 0;

beforeAll(() => {
  // Capturé AVANT le clearAllMocks du beforeEach (registry.bind s'exécute à l'import).
  bindCount = bind.mock.calls.length;
  binding = bind.mock.calls[0][0] as typeof binding;
});

beforeEach(() => {
  vi.clearAllMocks();
  state.selectedEparsFiles = new Map();
  document.body.innerHTML = `
    <div id="status-text"></div>
    <div id="epars-container"><table><tbody>
      <tr class="file-row" data-focuspath="/e/a.mp3"><td class="file"></td></tr>
      <tr class="file-row focused" data-focuspath="/e/b.mp3"><td class="file"></td></tr>
      <tr class="file-row" data-focuspath="/e/c.mp3"><td class="file"></td></tr>
    </tbody></table></div>`;
});

afterAll(() => {
  document.body.innerHTML = '';
});

describe('style command (g)', () => {
  it('un seul binding : g, page sync, panneau épars, hors input/modale/menu, labellisé pour la légende', () => {
    expect(bindCount).toBe(1);
    expect(binding.key).toBe('g');
    expect(binding.page).toBe('sync');
    expect(binding.activePanel).toBe('epars');
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
    document.querySelector('.focused')?.classList.remove('focused');
    binding.handler();
    expect(openStylePalette).not.toHaveBeenCalled();
    expect(document.getElementById('status-text')?.textContent).toContain('surbrillance');
  });

  it('focus sur un dossier épars (pas une ligne fichier) → pas de cible', () => {
    document.querySelector('.focused')?.classList.remove('focused');
    const dir = document.createElement('div');
    dir.className = 'directory focused';
    document.getElementById('epars-container')!.prepend(dir);
    binding.handler();
    expect(openStylePalette).not.toHaveBeenCalled();
  });
});
