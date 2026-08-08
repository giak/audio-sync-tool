// ─── Journal modal rendering ───────────────────────────────────────────────

import { type JournalEntry, state } from '../state.js';

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
      return `<div class="error">[${ts}] ${e.action || e.filename || '?'}</div>`;
    })
    .join('');
}
