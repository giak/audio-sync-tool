// ─── Unit tests for ui.ts ────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set up DOM before module evaluation (ui.ts uses getElementById at module scope)
vi.hoisted(() => {
  document.body.innerHTML = `
    <div id="modal-config" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <button id="btn-save-config">Sauvegarder</button>
      </div>
    </div>
    <div id="modal-legend" class="modal hidden">
      <div class="modal-content">
        <button id="btn-close-legend">Fermer</button>
      </div>
    </div>
    <div id="modal-dialog" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <p id="dialog-msg"></p>
        <input id="dialog-input" class="dialog-input hidden" type="text">
        <button id="dialog-confirm">OK</button>
        <button id="dialog-cancel">Annuler</button>
      </div>
    </div>
    <div id="toast-container"></div>
    <div id="modal-playlists" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <div id="pl-manager-content"></div>
      </div>
    </div>
    <div id="modal-journal" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <div id="journal-content"></div>
      </div>
    </div>
    <div id="filter-palette" class="hidden">
      <input id="source-filter" type="text" placeholder="Filtrer...">
      <span id="source-filter-count"></span>
    </div>
    <div id="source-container"></div>
    <div id="status-text"></div>
  `;
});

const mockState = vi.hoisted(() => ({
  activeModal: null as string | null,
  filterActive: false as boolean,
  sourceFilter: '' as string,
  sourceExpanded: new Set<string>(),
}));

vi.mock('./state.js', () => ({
  state: mockState,
}));

import { revalidateFocus } from './focus.js';
import { closeAllModals, confirmDialog, openModal, promptDialog, showToast } from './ui.js';

// Mock revalidateFocus
vi.mock('./focus.js', () => ({
  revalidateFocus: vi.fn(),
}));

beforeEach(() => {
  mockState.activeModal = null;
  mockState.filterActive = false;
  mockState.sourceFilter = '';
  (mockState.sourceExpanded as Set<string>).clear();
  vi.clearAllMocks();
  // Hide all modals
  for (const el of document.querySelectorAll('.modal')) el.classList.add('hidden');
  document.getElementById('filter-palette')!.classList.add('hidden');
  (document.getElementById('source-filter') as HTMLInputElement).value = '';
});

describe('openModal', () => {
  it('sets activeModal to the given name', () => {
    openModal('config');
    expect(mockState.activeModal).toBe('config');
  });

  it('shows the correct modal element', () => {
    expect(document.getElementById('modal-config')!.classList.contains('hidden')).toBe(true);

    openModal('config');
    expect(document.getElementById('modal-config')!.classList.contains('hidden')).toBe(false);
  });

  it('hides all modals before showing the target one', () => {
    openModal('config');
    expect(document.getElementById('modal-config')!.classList.contains('hidden')).toBe(false);

    openModal('dialog');
    expect(document.getElementById('modal-config')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('modal-dialog')!.classList.contains('hidden')).toBe(false);
  });
});

describe('closeAllModals', () => {
  it('sets activeModal to null', () => {
    mockState.activeModal = 'config';
    closeAllModals();
    expect(mockState.activeModal).toBeNull();
  });

  it('hides all modal elements', () => {
    openModal('config');
    openModal('dialog');

    closeAllModals();
    document.querySelectorAll('.modal').forEach(m => {
      expect(m.classList.contains('hidden')).toBe(true);
    });
  });

  it('revalidates focus after closing', () => {
    closeAllModals();
    expect(revalidateFocus).toHaveBeenCalled();
  });
});

describe('accessibilité (EPIC-014)', () => {
  it('openModal pose role=dialog + aria-modal + aria-label', () => {
    openModal('config');
    const modal = document.getElementById('modal-config')!;
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-label')).toBeTruthy();
    expect(modal.querySelector('.modal-close')!.getAttribute('aria-label')).toBe('Fermer');
  });

  it('closeAllModals retire aria-modal', () => {
    openModal('config');
    closeAllModals();
    expect(document.getElementById('modal-config')!.hasAttribute('aria-modal')).toBe(false);
  });

  it('Tab confiné dans la modale (focus trap) : le dernier focusable boucle', () => {
    mockState.activeModal = 'config';
    const modal = document.getElementById('modal-config')!;
    modal.classList.remove('hidden');
    const saveBtn = document.getElementById('btn-save-config')!;
    saveBtn.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    // Unique focusable : Tab depuis lui → boucle sur lui (ne sort jamais).
    expect(document.activeElement).toBe(saveBtn);
    mockState.activeModal = null;
  });

  it('Tab hors modale ne fait rien (aucune modal ouverte)', () => {
    mockState.activeModal = null;
    const el = document.createElement('button');
    el.textContent = 'dehors';
    document.body.appendChild(el);
    el.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    // Le trapFocus retourne immédiatement (pas de modal) → pas de preventDefault,
    // le focus reste sur l'élément (le déplacement Tab natif est hors scope jsdom).
    expect(document.activeElement).toBe(el);
    el.remove();
  });
});

describe('dialog custom (EPIC-014)', () => {
  it('confirmDialog : message + onConfirm sur confirm, fermeture sur cancel', () => {
    const onConfirm = vi.fn();
    confirmDialog('Supprimer ?', onConfirm, 'Supprimer');
    expect(mockState.activeModal).toBe('dialog');
    expect(document.getElementById('dialog-msg')!.textContent).toBe('Supprimer ?');
    expect(document.getElementById('dialog-confirm')!.textContent).toBe('Supprimer');
    (document.getElementById('dialog-confirm') as HTMLButtonElement).click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mockState.activeModal).toBeNull();
  });

  it('promptDialog : pré-remplit, Enter valide, value passée à onOk', () => {
    const onOk = vi.fn();
    promptDialog('Nom :', 'playlist-1', onOk, 'Créer');
    const input = document.getElementById('dialog-input') as HTMLInputElement;
    expect(input.classList.contains('hidden')).toBe(false);
    expect(input.value).toBe('playlist-1');
    input.value = 'ma-liste';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onOk).toHaveBeenCalledWith('ma-liste');
    expect(mockState.activeModal).toBeNull();
  });

  it("confirmDialog : le focus va sur le bouton visible (pas l'input caché)", () => {
    vi.useFakeTimers();
    confirmDialog('Confirmer ?', vi.fn());
    vi.advanceTimersByTime(60);
    expect(document.activeElement).toBe(document.getElementById('dialog-confirm'));
    vi.useRealTimers();
  });

  it("promptDialog : le focus va sur l'input visible", () => {
    vi.useFakeTimers();
    promptDialog('Nom :', 'x', vi.fn());
    vi.advanceTimersByTime(60);
    expect(document.activeElement).toBe(document.getElementById('dialog-input'));
    vi.useRealTimers();
  });

  it('promptDialog : valeur vide → onOk non appelé', () => {
    const onOk = vi.fn();
    promptDialog('Nom :', '', onOk);
    const input = document.getElementById('dialog-input') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onOk).not.toHaveBeenCalled();
  });
});

describe('toast (EPIC-014)', () => {
  it('showToast crée un toast dans #toast-container et le retire après 3 s', () => {
    vi.useFakeTimers();
    showToast('hello');
    const container = document.getElementById('toast-container')!;
    expect(container.textContent).toContain('hello');
    vi.advanceTimersByTime(3001);
    expect(container.textContent).toBe('');
    vi.useRealTimers();
  });

  it("showToast n'écrase pas la barre d'état", () => {
    const status = document.getElementById('status-text')!;
    status.textContent = 'Prêt.';
    showToast('copié');
    expect(status.textContent).toBe('Prêt.');
  });
});
