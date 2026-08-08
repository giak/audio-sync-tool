// ─── Cue editor modal — scaffold (Task 6) ─────────────────────────────────
import { api } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';

export interface PlaylistTrackLite {
  filename: string;
  fullPath: string;
}

export async function openCueEditor(track: PlaylistTrackLite): Promise<void> {
  const status = await api<{ configured: boolean }>('/api/nml/status');
  if (!status.configured) {
    showToast('⚠️ Configurer traktor_nml_path pour éditer les cues');
    return;
  }
  state.activeModal = 'cueEditor';
  const modal = document.getElementById('modal-cue-editor');
  if (modal) modal.classList.remove('hidden');
}

export function destroyCueEditor(): void {
  // Task 7 : détruit wavesurfer ici. Scaffold : ne fait rien.
}