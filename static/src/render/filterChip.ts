// ─── FilterChip (EPIC-030) : barre de filtre intégrée par liste ───────────
// Toujours présente au-dessus de sa liste (compacte si filtre vide) — la
// visibilité du terme EST l'état du filtre. F7// focus l'input (routing
// commands/filter.ts) ; ✕ vide ; Backspace sur champ vide sort du mode filtre.
// Le terme est mémorisé par scope dans state.filters (décision session).

import { type FilterSubject, foldTerm, matchesTokens } from '../filterEngine.js';
import { state } from '../state.js';

export interface FilterChipOptions {
  /** Clé de mémorisation (ex. 'sync-epars'). */
  scope: string;
  placeholder?: string;
  /** Appelé (debouncé) quand le terme change — la liste se re-render. */
  onChange: () => void;
  /** Appelé quand l'input perd le focus sans bouton (blur naturel). */
  onBlur?: () => void;
}

const DEBOUNCE_MS = 150;

/** Scope dont l'input a le focus — les renders détruisent/recréent le chip
 *  (container.innerHTML = ''), ce qui tue l'élément focusé sans blur. On
 *  mémorise avant destruction pour restaurer focus + caret à la recréation. */
let focusedScope: string | null = null;
let focusedCaret: number | null = null;

function trackFocus(input: HTMLInputElement, scope: string): void {
  input.addEventListener('focus', () => {
    focusedScope = scope;
  });
  input.addEventListener('blur', () => {
    if (focusedScope === scope) {
      focusedScope = null;
      focusedCaret = null;
    }
  });
  input.addEventListener('input', () => {
    if (focusedScope === scope) focusedCaret = input.selectionStart;
  });
}

/** Restaure le focus du chip si son scope était focusé avant un re-render. */
function restoreFocus(input: HTMLInputElement, scope: string): void {
  if (focusedScope !== scope) return;
  focusedScope = null;
  input.focus({ preventScroll: true });
  const pos = focusedCaret ?? input.value.length;
  try {
    input.setSelectionRange(pos, pos);
  } catch (_) {
    /* type=text : toujours settable */
  }
  focusedCaret = null;
}

/** Crée le chip et l'attache à parent (premier enfant). Renvoie l'élément. */
export function createFilterChip(parent: HTMLElement, opts: FilterChipOptions): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'filter-chip';
  chip.dataset.scope = opts.scope;
  chip.innerHTML = `
    <span class="filter-icon">🔍</span>
    <input class="filter-input" placeholder="${opts.placeholder ?? 'Filtrer…'}" spellcheck="false" autocomplete="off">
    <span class="filter-count"></span>
    <button class="filter-clear" title="Effacer le filtre">✕</button>
  `;
  const input = chip.querySelector('.filter-input') as HTMLInputElement;
  const clearBtn = chip.querySelector('.filter-clear') as HTMLButtonElement;
  const countEl = chip.querySelector('.filter-count') as HTMLElement;

  input.value = state.filters[opts.scope] ?? '';
  chip.classList.toggle('active', input.value.length > 0);
  trackFocus(input, opts.scope);

  let timer: ReturnType<typeof setTimeout> | null = null;
  input.addEventListener('input', () => {
    clearTimeout(timer!);
    timer = setTimeout(() => {
      setFilterTerm(opts.scope, input.value);
      chip.classList.toggle('active', input.value.length > 0);
      opts.onChange();
    }, DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Backspace' && input.value === '') {
      // Champ vide + Backspace → sortir du mode filtre (focus → liste)
      e.preventDefault();
      input.blur();
      opts.onBlur?.();
    }
  });
  clearBtn.addEventListener('click', () => {
    clearTimeout(timer!);
    setFilterTerm(opts.scope, '');
    input.value = '';
    chip.classList.remove('active');
    countEl.textContent = '';
    opts.onChange();
    input.blur();
    opts.onBlur?.();
  });

  parent.prepend(chip);
  // Après insertion : focus() sur un élément hors du DOM est ignoré
  restoreFocus(input, opts.scope);
  return chip;
}

/** Terme du scope (source de vérité state.filters), plié. */
export function getFilterTerm(scope: string): string {
  return state.filters[scope] ?? '';
}

/** Écrit le terme du scope dans le state (source de vérité). */
export function setFilterTerm(scope: string, term: string): void {
  state.filters = { ...state.filters, [scope]: term };
}

/** Le scope a-t-il un filtre actif ? */
export function isFilterActive(scope: string): boolean {
  return getFilterTerm(scope).length > 0;
}

/** Focus l'input du chip du scope demandé (routing F7//), s'il existe. */
export function focusFilterChip(scope: string): boolean {
  const chip = document.querySelector(`.filter-chip[data-scope="${scope}"] .filter-input`);
  if (chip instanceof HTMLInputElement) {
    chip.focus();
    chip.select();
    return true;
  }
  return false;
}

/** Met à jour le compteur « matchés/total » du chip du scope. */
export function updateFilterCount(scope: string, matched: number, total: number): void {
  const chip = document.querySelector(`.filter-chip[data-scope="${scope}"]`);
  if (!(chip instanceof HTMLElement)) return;
  const countEl = chip.querySelector('.filter-count');
  if (!(countEl instanceof HTMLElement)) return;
  if (isFilterActive(scope) && matched !== total) {
    countEl.textContent = `${matched.toLocaleString('fr')}/${total.toLocaleString('fr')}`;
  } else {
    countEl.textContent = '';
  }
}

/** Test de match d'un sujet contre le terme actif d'un scope (utilitaires render). */
export function subjectMatches(scope: string, subject: FilterSubject): boolean {
  const term = getFilterTerm(scope);
  return term === '' || matchesTokens(foldTerm(term), subject);
}
