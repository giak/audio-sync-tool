// ─── Unit tests: render/copyDialog.ts — modale copie structurée (EPIC-051) ──
// Le rendu s'appuie sur le vrai ui.ts (openModal/closeAllModals réels) pour
// couvrir le chemin intégral : renderCopyDialog → #dialog-msg → focus trap.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Set up DOM before module evaluation (ui.ts uses getElementById at module scope)
vi.hoisted(() => {
  document.body.innerHTML = `
    <div id="modal-dialog" class="modal hidden">
      <div class="modal-content">
        <span class="modal-close">✕</span>
        <p id="dialog-msg"></p>
        <input id="dialog-input" class="dialog-input hidden" type="text">
        <button id="dialog-confirm">Copier</button>
        <button id="dialog-alt" class="hidden"></button>
        <button id="dialog-cancel">Annuler</button>
      </div>
    </div>
    <div id="toast-container"></div>
    <div id="status-text"></div>
    <div id="source-container"></div>
  `;
});

const mockState = vi.hoisted(() => ({
  activeModal: null as string | null,
  filterActive: false as boolean,
  sourceFilter: '' as string,
  sourceExpanded: new Set<string>(),
}));

vi.mock('../state.js', () => ({ state: mockState }));
vi.mock('../focus.js', () => ({ revalidateFocus: vi.fn() }));

import { closeAllModals, confirmCopyDialog } from '../ui.js';
import {
  buildCopyDialogSpec,
  type CopyDialogSpec,
  copyDialogFallbackText,
  evidenceLine,
  renderCopyDialog,
} from './copyDialog.js';

beforeEach(() => {
  vi.clearAllMocks();
  closeAllModals();
  document.getElementById('dialog-msg')!.innerHTML = '';
  mockState.activeModal = null;
});

describe('evidenceLine', () => {
  it('un fichier → « fichier.mp3 → dossier »', () => {
    expect(evidenceLine({ destName: 'techno_hard_2005', destCreated: false, filenames: ['fichier.mp3'] })).toBe(
      'fichier.mp3 → techno_hard_2005',
    );
  });

  it('dossier créé → badge ➕', () => {
    expect(evidenceLine({ destName: 'nouveau', destCreated: true, filenames: ['fichier.mp3'] })).toBe(
      'fichier.mp3 → nouveau ➕',
    );
  });

  it('plusieurs fichiers → compteur (la liste reste au tooltip)', () => {
    expect(evidenceLine({ destName: 'techno', destCreated: false, filenames: ['a.mp3', 'b.mp3', 'c.mp3'] })).toBe(
      '3 fichiers → techno',
    );
  });
});

describe('buildCopyDialogSpec', () => {
  it('consentement style + exclusions → notes discrètes, dans cet ordre', () => {
    const spec = buildCopyDialogSpec([{ destName: 'techno', destCreated: false, filenames: ['f.mp3'] }], {
      styleConsent: 'consentement',
      exclusions: ['⚠ 1 fichier sans année — ignoré'],
    });
    expect(spec.notes).toEqual(['consentement', '⚠ 1 fichier sans année — ignoré']);
    expect(spec.summary).toBeUndefined(); // unité : pas de compteur
  });

  it('multi-fichiers ou multi-dossiers → summary « n fichiers → m dossiers »', () => {
    const one = buildCopyDialogSpec([{ destName: 'd', destCreated: false, filenames: ['a.mp3', 'b.mp3'] }]);
    expect(one.summary).toBe('2 fichiers → 1 dossier');
    const multi = buildCopyDialogSpec([
      { destName: 'd1', destCreated: false, filenames: ['a.mp3'] },
      { destName: 'd2', destCreated: true, filenames: ['b.mp3'] },
    ]);
    expect(multi.summary).toBe('2 fichiers → 2 dossiers');
  });
});

describe('renderCopyDialog (DOM réel via confirmCopyDialog de ui.ts)', () => {
  function render(spec: CopyDialogSpec): HTMLElement {
    renderCopyDialog(spec);
    return document.getElementById('dialog-msg')!;
  }

  it('une ligne .copy-evidence-line par groupe, STRUCTURÉE (revue du 2026-09-23)', () => {
    const msg = render({
      groups: [{ destName: 'Rock', destCreated: false, filenames: ['new-track.mp3'], destDir: '/home/music/Rock' }],
      notes: [],
    });
    const lines = msg.querySelectorAll('.copy-evidence-line');
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('new-track.mp3 → Rock');
    expect(lines[0].getAttribute('title')).toBe('/home/music/Rock');
    // la lisibilité au premier coup d'œil est portée par les spans :
    expect(lines[0].querySelector('.copy-file')?.textContent).toBe('new-track.mp3');
    expect(lines[0].querySelector('.copy-arrow')?.textContent).toBe(' → ');
    expect(lines[0].querySelector('.copy-dest')?.textContent).toBe('Rock');
    expect(lines[0].querySelector('.copy-badge')).toBeNull(); // dossier existant : pas de badge
  });

  it('badge « ➕ sera créé » sur destination nouvelle ; compteur en multi', () => {
    const msg = render({
      groups: [
        { destName: 'nouveau', destCreated: true, filenames: ['a.mp3'] },
        { destName: 'Rock', destCreated: false, filenames: ['a.mp3', 'b.mp3'] },
      ],
      notes: [],
    });
    const lines = msg.querySelectorAll('.copy-evidence-line');
    expect(lines[0].querySelector('.copy-badge')?.textContent).toBe('➕ sera créé');
    expect(lines[1].querySelector('.copy-file')?.textContent).toBe('2 fichiers');
  });

  it('notes → .copy-note discrètes, texte intégral au tooltip (une ligne affichée)', () => {
    const msg = render({
      groups: [{ destName: 'Rock', destCreated: false, filenames: ['a.mp3', 'b.mp3'] }],
      notes: ['le style sera écrit…', '⚠ 1 exclu'],
      summary: '2 fichiers → 1 dossier',
    });
    expect([...msg.querySelectorAll('.copy-note')].map(n => n.textContent)).toEqual([
      'le style sera écrit…',
      '⚠ 1 exclu',
    ]);
    expect([...msg.querySelectorAll('.copy-note')].map(n => n.getAttribute('title'))).toEqual([
      'le style sera écrit…',
      '⚠ 1 exclu',
    ]);
    expect(msg.querySelector('.copy-summary')!.textContent).toBe('2 fichiers → 1 dossier');
  });

  it('pas de notes/summary → pas de blocs vides (le DOM ne ment pas)', () => {
    const msg = render({ groups: [{ destName: 'Rock', destCreated: false, filenames: ['a.mp3'] }], notes: [] });
    expect(msg.querySelector('.copy-notes')).toBeNull();
    expect(msg.querySelector('.copy-summary')).toBeNull();
  });

  it('re-rendu remplace le contenu précédent (pas d’empilement)', () => {
    render({ groups: [{ destName: 'A', destCreated: false, filenames: ['1.mp3'] }], notes: [] });
    render({ groups: [{ destName: 'B', destCreated: false, filenames: ['2.mp3'] }], notes: [] });
    const msg = document.getElementById('dialog-msg')!;
    expect(msg.querySelectorAll('.copy-evidence-line')).toHaveLength(1);
    expect(msg.querySelector('.copy-evidence-line')!.textContent).toBe('2.mp3 → B');
  });
});

describe('largeur de la modale copie (régression du 2026-09-23)', () => {
  it('confirmCopyDialog élargit #modal-dialog (modal-copy) puis closeAllModals le retire', () => {
    const content = document.querySelector('#modal-dialog .modal-content') as HTMLElement;
    confirmCopyDialog(
      { groups: [{ destName: 'Rock', destCreated: false, filenames: ['a.mp3'] }], notes: [] },
      () => {},
    );
    expect(content.classList.contains('modal-copy')).toBe(true); // la ligne 17px tient
    closeAllModals();
    expect(content.classList.contains('modal-copy')).toBe(false); // les autres dialogues gardent modal-sm
  });
});

describe('copyDialogFallbackText', () => {
  it('texte brut complet : évidence + notes (leçon EPIC-042 : rien ne disparaît sans bruit)', () => {
    const spec = buildCopyDialogSpec(
      [{ destName: 'techno', destCreated: true, filenames: ['a.mp3'], destDir: '/src/techno' }],
      { styleConsent: 'consentement' },
    );
    // Unité (1 fichier → 1 dossier) : pas de summary — absent à l'unité (D1).
    expect(copyDialogFallbackText(spec).split('\n')).toEqual(['a.mp3 → techno ➕', 'consentement']);
  });
});
