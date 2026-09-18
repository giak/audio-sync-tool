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
  hideFilterChip,
  isFileFilter,
  setFileFilter,
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

  it('tree chip : bouton 📄 fichiers avec état par défaut OFF', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    const chip = ensureFilterChip(list, { scope: 'sync-source', onChange: () => {}, tree: true });
    const btn = chip.querySelector<HTMLButtonElement>('.filter-files');
    expect(btn).not.toBeNull();
    expect(btn!.classList.contains('on')).toBe(false);
    expect(isFileFilter('sync-source')).toBe(false);
    // Sans toggle, pas de bouton (chips plats : epars, years…)
    const plain = ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    expect(plain.querySelector('.filter-files')).toBeNull();
  });

  it('tree chip : toggle ON matche aussi les fichiers (isFileFilter) + placeholder', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    const chip = ensureFilterChip(list, {
      scope: 'sync-source',
      onChange: () => {},
      tree: true,
      placeholder: 'Filtrer dossiers + fichiers…',
    });
    setFilterTerm('sync-source', 'techno');
    const btn = chip.querySelector<HTMLButtonElement>('.filter-files')!;
    const input = chip.querySelector<HTMLInputElement>('.filter-input')!;
    expect(input.placeholder).toBe('Filtrer les dossiers…');
    btn.click();
    expect(isFileFilter('sync-source')).toBe(true);
    expect(state.filters['files:sync-source']).toBe('1');
    expect(input.placeholder).toBe('Filtrer dossiers + fichiers…');
    // Toggle OFF sans terme : le state bascule mais le mode reste inactif
    btn.click();
    expect(isFileFilter('sync-source')).toBe(false);
    expect(state.filters['files:sync-source']).toBe('');
  });

  it('tree chip : idempotence préserve le bouton et re-synchronise son état', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    const chip = ensureFilterChip(list, { scope: 'sync-source', onChange: () => {}, tree: true });
    setFilterTerm('sync-source', 'techno');
    setFileFilter('sync-source', true);
    ensureFilterChip(list, { scope: 'sync-source', onChange: () => {}, tree: true });
    expect(document.querySelectorAll('.filter-chip[data-scope="sync-source"]').length).toBe(1);
    expect(chip.querySelector('.filter-files.on')).not.toBeNull();
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

  it('hideFilterChip hides all chips and keeps the memorized term', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    setFilterTerm('sync-epars', 'ab');

    hideFilterChip();

    const chip = document.querySelector<HTMLElement>('.filter-chip')!;
    expect(chip.classList.contains('hidden')).toBe(true);
    // Le terme reste mémorisé : ré-afficher restaure le filtre
    expect(getFilterTerm('sync-epars')).toBe('ab');
  });

  it('focusFilterChip re-shows a hidden chip (F7 toggle)', () => {
    const list = document.createElement('div');
    document.body.appendChild(list);
    ensureFilterChip(list, { scope: 'sync-epars', onChange: () => {} });
    hideFilterChip();
    expect(document.querySelector<HTMLElement>('.filter-chip')!.classList.contains('hidden')).toBe(true);

    expect(focusFilterChip('sync-epars')).toBe(true);

    const chip = document.querySelector<HTMLElement>('.filter-chip')!;
    expect(chip.classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(makeInput());
  });

  it('hideFilterChip(scope) hides only the given scope', () => {
    const a = document.createElement('div');
    document.body.appendChild(a);
    ensureFilterChip(a, { scope: 'sync-epars', onChange: () => {} });
    const b = document.createElement('div');
    document.body.appendChild(b);
    ensureFilterChip(b, { scope: 'sync-source', onChange: () => {} });

    hideFilterChip('sync-epars');

    expect(
      document.querySelector<HTMLElement>('.filter-chip[data-scope="sync-epars"]')!.classList.contains('hidden'),
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>('.filter-chip[data-scope="sync-source"]')!.classList.contains('hidden'),
    ).toBe(false);
  });
});
