// ─── Unit tests: commands/menu.ts + real context-menu keyboard UX (P1) ─────
// 1. Bindings : Shift+F10 ouvre, ↓/↑/Enter pilotent la surbrillance, Échap
//    ferme — capturés via registry mocké (pattern modals.test.ts).
// 2. Interaction RÉELLE : via le VRAI ui.js (vi.importActual — le mock ne doit
//    pas masquer le DOM réel du menu), showContextMenu + moveContextMenu-
//    Highlight + activateContextMenuItem + isContextMenuOpen (pattern ui.test.ts).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── 1. Capture des bindings (registry mocké, ui mocké) ────────────────────

const { bind } = vi.hoisted(() => ({ bind: vi.fn() }));

vi.mock('./registry.js', () => ({
  registry: { bind },
}));

const { moveContextMenuHighlight, activateContextMenuItem, closeContextMenu, isContextMenuOpen } = vi.hoisted(() => ({
  moveContextMenuHighlight: vi.fn(),
  activateContextMenuItem: vi.fn(),
  closeContextMenu: vi.fn(),
  isContextMenuOpen: vi.fn(() => false),
}));

vi.mock('../ui.js', () => ({
  moveContextMenuHighlight,
  activateContextMenuItem,
  closeContextMenu,
  isContextMenuOpen,
}));

import './menu.js';

let f10Binding: Record<string, unknown>;
let downBinding: Record<string, unknown>;
let upBinding: Record<string, unknown>;
let enterBinding: Record<string, unknown>;
let escapeBinding: Record<string, unknown>;

beforeAll(() => {
  const calls = bind.mock.calls.map((args: unknown[]) => args[0] as Record<string, unknown>);
  f10Binding = calls.find(b => b.key === 'F10')!;
  downBinding = calls.find(b => b.key === 'ArrowDown')!;
  upBinding = calls.find(b => b.key === 'ArrowUp')!;
  enterBinding = calls.find(b => b.key === 'Enter')!;
  escapeBinding = calls.find(b => b.key === 'Escape')!;
});

describe('commands/menu — bindings', () => {
  beforeEach(() => vi.clearAllMocks());
  afterAll(() => vi.restoreAllMocks());

  it('Shift+F10 dispatche contextmenu sur l’élément focusé (coordonnées réelles)', () => {
    expect(f10Binding.key).toBe('F10');
    expect(f10Binding.shiftKey).toBe(true);
    expect(f10Binding.isContextMenuOpen).toBe(false);
    expect(f10Binding.label).toBeTruthy();

    document.body.innerHTML = '<div id="row" class="file-row" tabindex="0">Fichier</div>';
    const row = document.getElementById('row')!;
    row.focus();
    expect(document.activeElement).toBe(row); // tabindex requis dans jsdom
    const seen: MouseEvent[] = [];
    row.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
      seen.push(e as MouseEvent);
    });
    (f10Binding.handler as () => void)();
    expect(seen.length).toBe(1);
    expect(seen[0].target).toBe(row);
    // jsdom : getBoundingClientRect = 0 partout → coordonnées finies (0) — le
    // centrage réel est vérifié visuellement, on fige seulement le contrat.
    expect(Number.isFinite(seen[0].clientX)).toBe(true);
    expect(seen[0].defaultPrevented).toBe(true);
  });

  it('Shift+F10 sans listener contextmenu → event non annulé, aucun menu affiché', () => {
    document.body.innerHTML = '<div id="plain" tabindex="0">Texte</div>';
    const plain = document.getElementById('plain')!;
    plain.focus();
    const seen: MouseEvent[] = [];
    document.addEventListener('contextmenu', e => seen.push(e as MouseEvent), { once: true });
    (f10Binding.handler as () => void)();
    expect(seen.length).toBe(1);
    expect(seen[0].defaultPrevented).toBe(false); // → le handler n'ouvre rien
  });

  it('ArrowDown délègue à moveContextMenuHighlight(1)', () => {
    expect(downBinding.isContextMenuOpen).toBe(true);
    (downBinding.handler as () => void)();
    expect(moveContextMenuHighlight).toHaveBeenCalledWith(1);
  });

  it('ArrowUp délègue à moveContextMenuHighlight(-1)', () => {
    (upBinding.handler as () => void)();
    expect(moveContextMenuHighlight).toHaveBeenCalledWith(-1);
  });

  it('Enter délègue à activateContextMenuItem', () => {
    (enterBinding.handler as () => void)();
    expect(activateContextMenuItem).toHaveBeenCalledTimes(1);
  });

  it('Échap ferme le menu — PREMIER pilier de la pile (menu.ts importé en 1ᵉʳ)', () => {
    expect(escapeBinding.isContextMenuOpen).toBe(true);
    (escapeBinding.handler as () => void)();
    expect(closeContextMenu).toHaveBeenCalledTimes(1);
  });
});

// ── 2. Interaction réelle : le VRAI ui.js sur un vrai DOM ─────────────────

interface RealUI {
  showContextMenu: (
    x: number,
    y: number,
    items: Array<{ label: string; action: () => void; danger?: boolean }>,
  ) => void;
  closeContextMenu: () => void;
  isContextMenuOpen: () => boolean;
  moveContextMenuHighlight: (delta: number) => void;
  activateContextMenuItem: () => void;
}

describe('menu contextuel — interaction réelle (ui.js non mocké)', () => {
  let realUI: RealUI;

  beforeAll(async () => {
    realUI = await vi.importActual<RealUI>('../ui.js');
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('showContextMenu rend N items, isContextMenuOpen suit l’état', () => {
    realUI.showContextMenu(10, 10, [
      { label: '▶ Jouer', action: () => {} },
      { label: 'Cues', action: () => {} },
    ]);
    expect(document.querySelectorAll('.ctx-item').length).toBe(2);
    expect(realUI.isContextMenuOpen()).toBe(true);
    realUI.closeContextMenu();
    expect(realUI.isContextMenuOpen()).toBe(false);
  });

  it('↑↓ bouclent la surbrillance sans voler le focus DOM', () => {
    realUI.showContextMenu(10, 10, [
      { label: 'A', action: () => {} },
      { label: 'B', action: () => {} },
      { label: 'C', action: () => {} },
    ]);
    const items = Array.from(document.querySelectorAll('.ctx-item')) as HTMLElement[];
    const activeBefore = document.activeElement;
    // Sans surbrillance initiale (index -1) : le 1ᵉʳ ↓ surligne l'item 0.
    realUI.moveContextMenuHighlight(1);
    expect(items[0].classList.contains('ctx-highlight')).toBe(true);
    realUI.moveContextMenuHighlight(1);
    expect(items[1].classList.contains('ctx-highlight')).toBe(true);
    realUI.moveContextMenuHighlight(1);
    expect(items[2].classList.contains('ctx-highlight')).toBe(true);
    realUI.moveContextMenuHighlight(1); // boucle → item 0
    expect(items[0].classList.contains('ctx-highlight')).toBe(true);
    realUI.moveContextMenuHighlight(-1); // boucle arrière → item 2
    expect(items[2].classList.contains('ctx-highlight')).toBe(true);
    expect(document.activeElement).toBe(activeBefore);
  });

  it('Enter active l’item surligné (défaut : premier) puis ferme le menu', () => {
    const actions = [vi.fn(), vi.fn(), vi.fn()];
    realUI.showContextMenu(10, 10, [
      { label: 'A', action: actions[0] },
      { label: 'B', action: actions[1] },
      { label: 'C', action: actions[2] },
    ]);
    realUI.activateContextMenuItem(); // pas de surbrillance → premier item
    expect(actions[0]).toHaveBeenCalledTimes(1);
    expect(actions[1]).not.toHaveBeenCalled();
    expect(realUI.isContextMenuOpen()).toBe(false);

    realUI.showContextMenu(10, 10, [
      { label: 'A', action: actions[0] },
      { label: 'B', action: actions[1] },
    ]);
    realUI.moveContextMenuHighlight(1); // -1 → 0 (A)
    realUI.moveContextMenuHighlight(1); // 0 → 1 (B)
    realUI.activateContextMenuItem();
    expect(actions[1]).toHaveBeenCalledTimes(1);
    expect(realUI.isContextMenuOpen()).toBe(false);
  });
});
