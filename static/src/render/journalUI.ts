// ─── Journal modal rendering ───────────────────────────────────────────────

import { api } from '../api.js';
import { type JournalEntry, state } from '../state.js';
import { showToast } from '../ui.js';

export function renderJournal(): void {
  const container = document.getElementById('journal-content');
  if (!container) return;
  if (!state.journal || state.journal.length === 0) {
    container.innerHTML = '<div style="color:#585b70">Aucune opération enregistrée.</div>';
    return;
  }
  container.innerHTML = [...state.journal]
    .reverse()
    .map((e: JournalEntry) => {
      const ts = ((e.timestamp as string) || '').slice(0, 19).replace('T', ' ');
      if (e.status === 'copied') return `<div class="copied">[${ts}] 📋 ${e.filename} → ${e.destination}</div>`;
      if (e.status === 'scan') return `<div class="scanned">[${ts}] 🔍 ${e.action} — ${e.details}</div>`;
      if (e.status === 'config') return `<div class="configured">[${ts}] ⚙️ ${e.action} — ${e.details}</div>`;
      if (e.status === 'collection') return `<div class="configured">[${ts}] 📚 ${e.action} — ${e.details}</div>`;
      return `<div class="error">[${ts}] ${e.action || e.filename || '?'}</div>`;
    })
    .join('');
}

/** Vide le journal (EPIC-013) : confirmation + DELETE /journal + re-render. */
export async function clearJournal(): Promise<void> {
  const btn = document.getElementById('journal-clear') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  try {
    const res = await api<{ ok: boolean; error?: string }>('/journal', { method: 'DELETE' });
    if (!res.ok) throw new Error(res.error || 'vidage refusé');
    state.journal = [];
    showToast('🗑 Journal vidé');
  } catch (err) {
    showToast(`❌ ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (btn) btn.disabled = false;
    renderJournal();
  }
}
