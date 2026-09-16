// ─── FilterChip (EPIC-030) : barre de filtre intégrée par liste ───────────
// PERSISTANT : le chip vit dans un slot dédié (#filter-slot-<scope>) inséré
// AVANT le container de liste — jamais dans le DOM que les renders effacent
// (container.innerHTML = ''). ensureFilterChip est idempotent : les renders
// répétés ne détruisent plus l'input focusé, le focus et le caret survivent
// donc à la saisie (bug signalé : F7 → 2 caractères → focus perdu).
// La visibilité du terme EST l'état du filtre ; mémorisé par scope dans
// state.filters. F7// focus l'input (commands/filter.ts) ; ✕ efface ;
// Backspace sur champ vide sort du mode filtre.

import { type FilterSubject, foldTerm, matchesTokens } from '../filterEngine.js';
import { state } from '../state.js';

export interface FilterChipOptions {
  /** Clé de mémorisation (ex. 'sync-epars'). Unique par liste. */
  scope: string;
  placeholder?: string;
  /** Appelé (debouncé) quand le terme change — la liste se re-render. */
  onChange: () => void;
  /** Appelé quand l'input perd le focus volontairement (Backspace vide). */
  onBlur?: () => void;
}

const DEBOUNCE_MS = 150;

function slotId(scope: string): string {
  return `filter-slot-${scope}`;
}

/** Slot dédié du chip : voisin précédent du container de liste (hors du
 *  DOM effacé). Créé au besoin, replacé si le layout l'a déplacé. */
function ensureSlot(listContainer: HTMLElement, scope: string): HTMLElement {
  const id = slotId(scope);
  let slot = document.getElementById(id);
  if (!slot) {
    slot = document.createElement('div');
    slot.id = id;
  }
  const parent = listContainer.parentElement;
  if (slot.parentElement !== parent || slot.nextElementSibling !== listContainer) {
    parent?.insertBefore(slot, listContainer);
  }
  return slot;
}

/** Crée le chip UNE fois dans son slot dédié ; no-op s'il existe déjà.
 *  Les opts (closures stables : renderX, revalidateFocus) sont capturés à
 *  la création — les appels suivants ne font que garantir la présence. */
export function ensureFilterChip(listContainer: HTMLElement, opts: FilterChipOptions): HTMLElement {
  const existing = document.querySelector(`.filter-chip[data-scope="${opts.scope}"]`);
  if (existing instanceof HTMLElement) {
    // Re-synchronise la valeur si le state a changé hors de l'input
    // (jamais pendant la saisie : l'input focusé fait autorité).
    const input = existing.querySelector('.filter-input');
    const term = state.filters[opts.scope] ?? '';
    if (input instanceof HTMLInputElement && document.activeElement !== input && input.value !== term) {
      input.value = term;
      existing.classList.toggle('active', term.length > 0);
    }
    return existing;
  }

  const slot = ensureSlot(listContainer, opts.scope);
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
    // Le chip est persistant : PAS de blur — l'utilisateur enchaîne une
    // nouvelle saisie sans re-cliquer dans l'input.
  });

  slot.appendChild(chip);
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

/** Focus l'input du chip du scope ; l'AFFICHE s'il était caché (F7 toggle).
 *  Renvoie false si le chip n'existe pas (liste non rendue). */
export function focusFilterChip(scope: string): boolean {
  const chip = document.querySelector(`.filter-chip[data-scope="${scope}"]`);
  if (!(chip instanceof HTMLElement)) return false;
  chip.classList.remove('hidden');
  const input = chip.querySelector('.filter-input');
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
  return true;
}

/** Cache le chip du scope (ou tous si scope omis) — F7/Échap. Le terme reste
 *  mémorisé dans state.filters : ré-afficher restaure le filtre. */
export function hideFilterChip(scope?: string): void {
  const selector = scope ? `.filter-chip[data-scope="${scope}"]` : '.filter-chip';
  for (const chip of document.querySelectorAll(selector)) {
    (chip as HTMLElement).classList.add('hidden');
  }
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
