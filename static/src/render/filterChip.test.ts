// ─── Tests filterChip (EPIC-030) ──────────────────────────────────────────
// Focus du bug signalé : F7 → saisie → le re-render détruit/recrée le chip →
// le focus tombait sur body. La restauration focus+caret doit le préserver.

import { beforeEach, describe, expect, it } from 'vitest';
import { state } from '../state.js';
import { createFilterChip, focusFilterChip, getFilterTerm, setFilterTerm, updateFilterCount } from './filterChip.js';

function makeInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('.filter-chip .filter-input')!;
}

describe('filterChip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    state.filters = {};
  });

  it('creates the chip with input, count and clear button', () => {
    const chip = createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    expect(chip.dataset.scope).toBe('sync-epars');
    expect(chip.querySelector('.filter-input')).not.toBeNull();
    expect(chip.querySelector('.filter-count')).not.toBeNull();
    expect(chip.querySelector('.filter-clear')).not.toBeNull();
  });

  it('pre-fills the input from the memorized scope term', () => {
    setFilterTerm('sync-epars', 'ab');
    const chip = createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    const input = chip.querySelector('.filter-input') as HTMLInputElement;
    expect(input.value).toBe('ab');
    expect(chip.classList.contains('active')).toBe(true);
  });

  it('setFilterTerm / getFilterTerm roundtrip', () => {
    expect(getFilterTerm('sync-epars')).toBe('');
    setFilterTerm('sync-epars', 'flac');
    expect(getFilterTerm('sync-epars')).toBe('flac');
    setFilterTerm('sync-epars', '');
    expect(getFilterTerm('sync-epars')).toBe('');
  });

  it('updateFilterCount writes matched/total when filter active and counts differ', () => {
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    setFilterTerm('sync-epars', 'x');
    updateFilterCount('sync-epars', 12, 1430);
    const count = document.querySelector('.filter-chip .filter-count')!;
    expect(count.textContent).toBe('12/1\u202f430');
  });

  it('updateFilterCount is empty when no filter', () => {
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    updateFilterCount('sync-epars', 12, 1430);
    const count = document.querySelector('.filter-chip .filter-count')!;
    expect(count.textContent).toBe('');
  });

  it('focusFilterChip focuses the scope input', () => {
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    expect(focusFilterChip('sync-epars')).toBe(true);
    expect(document.activeElement).toBe(makeInput());
    expect(focusFilterChip('nope')).toBe(false);
  });

  it('keeps focus and caret when the chip is recreated (re-render bug)', () => {
    // 1er render : chip + focus utilisateur
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    const input1 = makeInput();
    input1.focus();
    input1.value = 'ab';
    input1.setSelectionRange(2, 2);
    input1.dispatchEvent(new Event('input', { bubbles: true }));

    // 2e render : le debounce a déjà commité le terme (flux réel :
    // setFilterTerm → onChange → render → innerHTML=''), le chip est recréé
    // — focus + caret doivent être restaurés
    setFilterTerm('sync-epars', 'ab');
    document.body.innerHTML = '';
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    const input2 = makeInput();
    expect(input2.value).toBe('ab');
    expect(document.activeElement).toBe(input2);
    expect(input2.selectionStart).toBe(2);
  });

  it('clears focusedScope on explicit blur (no ghost restore)', () => {
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    const input = makeInput();
    input.focus();
    input.blur();
    document.body.innerHTML = '';
    createFilterChip(document.body, { scope: 'sync-epars', onChange: () => {} });
    // Pas de restauration : le focus reste sur body
    expect(document.activeElement).toBe(document.body);
  });
});
