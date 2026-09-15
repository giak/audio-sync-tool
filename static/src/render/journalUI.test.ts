// ─── Tests: render/journalUI.ts — rendu + vidage du journal (EPIC-013) ────
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApi = vi.hoisted(() => vi.fn());

vi.mock('../api.js', () => ({ api: mockApi }));
vi.mock('../ui.js', () => ({ showToast: vi.fn() }));

import { state } from '../state.js';
import { showToast } from '../ui.js';
import { clearJournal, renderJournal } from './journalUI.js';

const JOURNAL_HTML = `
  <div id="modal-journal">
    <div class="modal-header">
      <button id="journal-clear">🗑 Vider</button>
    </div>
    <div id="journal-content"></div>
  </div>
`;

beforeEach(() => {
  document.body.innerHTML = JOURNAL_HTML;
  mockApi.mockReset();
  state.journal = [];
});

describe('render/journalUI', () => {
  it('rend le journal (plus récent en premier)', () => {
    // Ordre append du backend : le plus récent en DERNIER ; renderJournal reverse.
    state.journal = [
      { timestamp: '2026-08-08T09:00:00', action: 'Copie', filename: 'a.mp3', destination: '/d', status: 'copied' },
      { timestamp: '2026-08-08T10:00:00', action: 'Scan terminé', details: '5 fichiers', status: 'scan' },
    ];
    renderJournal();
    const html = document.getElementById('journal-content')!.textContent!;
    const scanIdx = html.indexOf('Scan terminé');
    const copyIdx = html.indexOf('a.mp3'); // statut 'copied' → filename
    expect(scanIdx).toBeGreaterThan(-1);
    expect(copyIdx).toBeGreaterThan(-1);
    expect(scanIdx).toBeLessThan(copyIdx); // 10h (récent) rendu avant 09h
  });

  it('affiche un placeholder si le journal est vide', () => {
    renderJournal();
    expect(document.getElementById('journal-content')!.textContent).toContain('Aucune opération');
  });

  it('clearJournal : DELETE /journal + re-render vide', async () => {
    state.journal = [{ timestamp: 't', action: 'a', details: '', status: 'scan' }];
    mockApi.mockResolvedValueOnce({ ok: true });
    await clearJournal();
    expect(mockApi).toHaveBeenCalledWith('/journal', { method: 'DELETE' });
    expect(state.journal).toEqual([]);
    expect(document.getElementById('journal-content')!.textContent).toContain('Aucune opération');
    expect(showToast).toHaveBeenCalledWith('🗑 Journal vidé');
  });

  it('clearJournal : erreur → toast, bouton ré-armé, contenu conservé', async () => {
    state.journal = [{ timestamp: 't', action: 'a', details: '', status: 'scan' }];
    mockApi.mockRejectedValueOnce(new Error('refusé'));
    await clearJournal();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('refusé'));
    expect(state.journal).toHaveLength(1); // rien n'a été vidé
    const btn = document.getElementById('journal-clear') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
