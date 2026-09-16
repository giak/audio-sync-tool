// ─── Tests filterChip persistant (EPIC-030) ───────────────────────────────
// Le bug signalé : F7 → saisie → au 2ᵉ caractère le re-render détruisait le
// chip (vivant DANS le container effacé) → blur implicite en Chrome réel →
// focus perdu. Le chip est maintenant PERSISTANT dans un slot dédié : les
// renders ne le touchent plus, focus et caret survivent naturellement.

import { beforeEach, describe, expect, it } from 'vitest';
import { state } from '../state.js';
import {
  ensureFilterChip,
  focusFilterChip,
  getFilterTerm,
  setFilterTerm,
  updateFilterCount,
} from './filterChip.js';

function makeInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('.filter-chip .filter-input')!;
}

/** Simule un re-render réel : le container de liste est effacé et rempli,
 *  le chip (hors container) ne doit pas bouger. */
function rerenderList(list: HTMLElement): void {
  list.innerHTML = '';
  list.appendChild(document.createElement('div'));
}

describe('filterChip (persistant)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    state.filters = {};
  });

  it('creates the chip with input, count and clear button', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    const chip = ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    expect(chip.dataset.scope).toBe('sync-epars');
    expect(chip.querySelector('.filter-input')).not.toBeNull();
    expect(chip.querySelector('.filter-count')).not.toBeNull();
    expect(chip.querySelector('.filter-clear')).not.toBeNull();
  });

  it('mounts the chip in a dedicated slot BEFORE the list container (not inside it)', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    const chip = document.querySelector<HTMLElement>('.filter-chip')!;
    // Le chip n'est PAS descendant du container de liste
    expect(list.contains(chip)).toBe(false);
    // Il est dans le slot voisin précédent
    expect(chip.parentElement?.id).toBe('filter-slot-sync-epars');
    expect(chip.parentElement?.nextElementSibling).toBe(list);
  });

  it('pre-fills the input from the memorized scope term', () => {
    setFilterTerm('sync-epars', 'ab');
    const list = document.createElement('div');
    document.body.appendChild(list);
    const chip = ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    const input = chip.querySelector('.filter-input') as HTMLInputElement;
    expect(input.value).toBe('ab');
    expect(chip.classList.contains('active')).toBe(true);
  });

  it('is idempotent: repeated calls never duplicate the chip', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    expect(document.querySelectorAll('.filter-chip[data-scope="sync-epars"]').length).toBe(1);
  });

  it('focus and caret SURVIVE list re-renders (the reported bug)', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });

    // Utilisateur focus + tape 2 caractères
    const input = makeInput();
    input.focus();
    input.value = 'ab';
    input.setSelectionRange(2, 2);

    // Le debounce a commité → render → container.innerHTML = ''
    setFilterTerm('sync-epars', 'ab');
    rerenderList(list);

    // Chrome réel : la destruction de l'input focusé émettait un blur →
    // focus perdu. Persistant : le MÊME input garde focus + caret.
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
  });

  it('keeps one instance across re-renders and re-syncs value if changed externally', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    rerenderList(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    expect(document.querySelectorAll('.filter-chip[data-scope="sync-epars"]').length).toBe(1);

    // State changé hors de l'input (ex. clear programmé) + input non focusé
    setFilterTerm('sync-epars', 'zzz');
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    expect(makeInput().value).toBe('zzz');
  });

  it('clear button empties the term and KEEPS focus on the input', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    const chip = ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    const input = makeInput();
    input.focus();
    setFilterTerm('sync-epars', 'ab');

    (chip.querySelector('.filter-clear') as HTMLButtonElement).click();

    expect(getFilterTerm('sync-epars')).toBe('');
    expect(input.value).toBe('');
    expect(chip.classList.contains('active')).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('empty Backspace blurs the input and fires onBlur', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    let blurred = false;
    ensureFilterChip(list, {
      scope: 'sync-epars',
      onChange: () => {},
      onBlur: () => {
        blurred = true;
      },
    });
    const input = makeInput();
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    expect(blurred).toBe(true);
    expect(document.activeElement).not.toBe(input);
  });

  it('setFilterTerm / getFilterTerm roundtrip', () => {
    expect(getFilterTerm('sync-epars')).toBe('');
    setFilterTerm('sync-epars', 'flac');
    expect(getFilterTerm('sync-epars')).toBe('flac');
    setFilterTerm('sync-epars', '');
    expect(getFilterTerm('sync-epars')).toBe('');
  });

  it('updateFilterCount writes matched/total when filter active and counts differ', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    setFilterTerm('sync-epars', 'x');
    updateFilterCount('sync-epars', 12, 1430);
    const count = document.querySelector('.filter-chip .filter-count')!;
    expect(count.textContent).toBe('12/1\u202f430');
  });

  it('updateFilterCount is empty when no filter', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    updateFilterCount('sync-epars', 12, 1430);
    const count = document.querySelector('.filter-chip .filter-count')!;
    expect(count.textContent).toBe('');
  });

  it('focusFilterChip focuses the scope input', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    expect(focusFilterChip('sync-epars')).toBe(true);
    expect(document.activeElement).toBe(makeInput());
    expect(focusFilterChip('nope')).toBe(false);
  });
});
