// ─── Cue editor modal — wavesurfer + régions (Task 7) ─────────────────────
import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../ui.js';
import { cuesToRegions, regionToCue, hotToLabel } from '../cueModel.js';
import type { CueDTO } from '../cueModel.js';

export interface PlaylistTrackLite {
  filename: string;
  fullPath: string;
}

export interface CueEntryRef {
  filename: string;
  filesize: string;
}

let _saving = false;
let ws: WaveSurfer | null = null;
let _regions: any = null;
let _entryRef: CueEntryRef | null = null;

export async function openCueEditor(track: PlaylistTrackLite): Promise<void> {
  const status = await api<{ configured: boolean }>('/api/nml/status');
  if (!status.configured) {
    showToast('⚠️ Configurer traktor_nml_path pour éditer les cues');
    return;
  }
  const data = await api<{ ok: boolean; entries: any[]; multiple: boolean }>(
    `/api/track/match?path=${encodeURIComponent(track.fullPath)}`);
  if (!data.ok || data.entries.length === 0) {
    showToast('⚠️ Aucune piste matchée dans la collection');
    return;
  }
  const entry = data.entries[0];
  _entryRef = { filename: entry.filename, filesize: entry.filesize };
  const title = document.getElementById('cue-editor-title') as HTMLElement | null;
  if (title) title.textContent = `${entry.artist || ''} — ${entry.title || entry.filename}`;
  state.activeModal = 'cueEditor';
  const modal = document.getElementById('modal-cue-editor');
  if (modal) modal.classList.remove('hidden');
  await renderWaveform(track.fullPath, entry.cues || []);
}

async function renderWaveform(path: string, cues: CueDTO[]): Promise<void> {
  const el = document.getElementById('cue-editor-waveform') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
  ws = WaveSurfer.create({ container: el, url: `/audio?path=${encodeURIComponent(path)}` });
  ws.on('ready', () => {
    _regions = ws!.registerPlugin(Regions.create());
    for (const r of cuesToRegions(cues)) _regions.addRegion(r);
  });
}

export function destroyCueEditor(): void {
  ws?.destroy();
  ws = null;
  _regions = null;
  _entryRef = null;
}

export function onSlotClicked(slot: number): void {
  if (!ws || !_regions) return;
  const time = ws.getCurrentTime();
  for (const r of _regions.getRegions()) {
    if (r.id === slot) r.remove();
  }
  _regions.addRegion({ start: time, end: time + 0.08, id: slot, label: hotToLabel(slot), color: '#55aaff' });
}

export async function saveCues(cues: CueDTO[]): Promise<void> {
  if (!_entryRef) throw new Error('no entry');
  const payload = {
    filename: _entryRef.filename,
    filesize: _entryRef.filesize,
    cues,
  };
  const res = await api<{ ok: boolean }>('/api/track/cues', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('sauvegarde refusée');
}

export function onSaveClicked(): Promise<void> | void {
  if (!_regions || _saving) return;
  _saving = true;
  const btn = document.getElementById('cue-btn-save') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
  const cues = _regions.getRegions().map((r: any) => regionToCue(r));
  return saveCues(cues)
    .then(() => showToast('✅ sauvegardé'))
    .catch((err: unknown) => showToast(`❌ ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => { _saving = false; if (btn) btn.disabled = false; });
}