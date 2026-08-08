// ─── Cue editor modal — wavesurfer + régions (Task 7) ─────────────────────
import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../api.js';
import type { CueDTO } from '../cueModel.js';
import { cuesToRegions, hotToLabel, regionToCue } from '../cueModel.js';
import { on, state } from '../state.js';
import { showToast } from '../ui.js';
import { formatTime } from '../utils.js';

export interface PlaylistTrackLite {
  filename: string;
  fullPath: string;
}

export interface CueEntryRef {
  filename: string;
  filesize: string;
  /** Index de l'entrée choisie dans la liste /api/track/match — désambiguïsation multi-match. */
  entry: number;
}

let _saving = false;
let ws: WaveSurfer | null = null;
let _regions: any = null;
let _entryRef: CueEntryRef | null = null;
let _trackPath = '';
/** hotcue → DISPL_ORDER d'origine (round-trip). wavesurfer perd les metadata custom
 *  des régions, donc on garde un Map séparé peuplé au chargement des cues. */
let _displOrders = new Map<number, string>();

const _wired = new WeakSet<Element>();

// ── Transport (play/pause + temps courant) ─────────────────────────────────

function playBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-play') as HTMLButtonElement | null;
}

function timeEl(): HTMLElement | null {
  return document.getElementById('cue-editor-time') as HTMLElement | null;
}

function setPlayingUI(playing: boolean): void {
  const btn = playBtnEl();
  if (!btn) return;
  btn.textContent = playing ? '⏸' : '▶';
  btn.classList.toggle('playing', playing);
}

function updateTimeUI(): void {
  if (!ws) return;
  const el = timeEl();
  if (!el) return;
  const dur = ws.getDuration() || 0;
  el.textContent = `${formatTime(ws.getCurrentTime())} / ${formatTime(dur)}`;
}

function statusEl(): HTMLElement | null {
  return document.getElementById('cue-editor-status');
}

function setStatus(msg: string): void {
  const el = statusEl();
  if (el) el.textContent = msg;
}

export function wireControls(root: HTMLElement = document.body): void {
  for (const el of root.querySelectorAll<HTMLElement>('.cue-slot')) {
    if (_wired.has(el)) continue;
    _wired.add(el);
    const slot = Number.parseInt(el.getAttribute('data-slot') || '', 10);
    el.addEventListener('click', () => onSlotClicked(slot));
  }
  const btn = root.querySelector<HTMLButtonElement>('#cue-btn-save');
  if (btn && !_wired.has(btn)) {
    _wired.add(btn);
    btn.addEventListener('click', () => void onSaveClicked());
  }
  const play = root.querySelector<HTMLButtonElement>('#cue-btn-play');
  if (play && !_wired.has(play)) {
    _wired.add(play);
    play.addEventListener('click', () => {
      // ▶ coupe aussi la lecture en boucle en cours.
      if (_loopPlay) stopLoopPlay();
      ws?.playPause();
    });
  }
}

on('activeModal:changed', () => {
  if (state.activeModal !== 'cueEditor') destroyCueEditor();
});

// Transport clavier quand la modal cueEditor est ouverte : le registry global
// (script.ts) bloque les touches hors Échap dès qu'une modale est ouverte.
function onModalKeydown(e: KeyboardEvent): void {
  if (state.activeModal !== 'cueEditor') return;
  const t = e.target as HTMLElement | null;
  // BUTTON exclu : Espace sur un bouton focusé déclenche déjà son click natif (double toggle sinon).
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON'))
    return;
  if (e.key === ' ') {
    e.preventDefault();
    ws?.playPause();
  } else if (e.key === 'ArrowLeft' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (ws) ws.setTime(Math.max(0, ws.getCurrentTime() - 5));
  } else if (e.key === 'ArrowRight' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    if (ws) ws.setTime(Math.min(ws.getDuration(), ws.getCurrentTime() + 5));
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    deleteRegionAtCursor();
  }
}
document.addEventListener('keydown', onModalKeydown);

function storedIndex(filename: string): number {
  const raw = localStorage.getItem(`cue/sel:${filename}`);
  const i = raw === null ? -1 : Number.parseInt(raw, 10);
  return Number.isNaN(i) ? -1 : i;
}

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
  _trackPath = track.fullPath;
  const stored = storedIndex(track.filename);
  const idx = stored >= 0 && stored < data.entries.length ? stored : 0;
  const entry = data.entries[idx];
  _entryRef = { filename: entry.filename, filesize: entry.filesize };
  const title = document.getElementById('cue-editor-title') as HTMLElement | null;
  if (title) title.textContent = `${entry.artist || ''} — ${entry.title || entry.filename}`;
  const controls = document.getElementById('cue-editor-controls') as HTMLElement | null;
  const existing = document.getElementById('cue-editor-select');
  if (existing) existing.remove();
  if (data.multiple && controls) {
    const select = document.createElement('select');
    select.id = 'cue-editor-select';
    data.entries.forEach((e, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${e.artist || e.filename} — ${e.title || e.filename}`;
      if (i === idx) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = () => {
      const i = Number.parseInt(select.value, 10);
      localStorage.setItem(`cue/sel:${track.filename}`, String(i));
      renderEntry(i, data.entries);
    };
    controls.prepend(select);
  }
  state.activeModal = 'cueEditor';
  const modal = document.getElementById('modal-cue-editor');
  if (modal) modal.classList.remove('hidden');
  wireControls(document.body);
  await renderWaveform(track.fullPath, entry.cues || []);
}

async function renderEntry(idx: number, entries: any[]): Promise<void> {
  const valid = idx >= 0 && idx < entries.length;
  const entry = valid ? entries[idx] : entries[0];
  if (!entry) return;
  _entryRef = { filename: entry.filename, filesize: entry.filesize, entry: valid ? idx : 0 };
  const title = document.getElementById('cue-editor-title') as HTMLElement | null;
  if (title) title.textContent = `${entry.artist || ''} — ${entry.title || entry.filename}`;
  await renderWaveform(_trackPath, entry.cues || []);
}

export async function renderWaveform(path: string, cues: CueDTO[]): Promise<void> {
  const el = document.getElementById('cue-editor-waveform') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
  ws = WaveSurfer.create({ container: el, url: `/audio?path=${encodeURIComponent(path)}` });
  // DISPL_ORDER d'origine : {hotcue → displ_order} — jamais reconstruit depuis le slot (B9).
  _displOrders = new Map(cues.filter(c => c.hotcue >= 0 && c.hotcue <= 7).map(c => [c.hotcue, c.displ_order]));
  setPlayingUI(false);
  const time = timeEl();
  if (time) time.textContent = '0:00 / 0:00';
  ws.on('ready', () => {
    _regions = ws!.registerPlugin(Regions.create());
    for (const r of cuesToRegions(cues)) _regions.addRegion(r);
    updateTimeUI();
  ws.on('play', () => setPlayingUI(true));
  ws.on('pause', () => setPlayingUI(false));
  ws.on('timeupdate', () => {
    updateTimeUI();
  ws.on('error', (err: unknown) => {
    setPlayingUI(false);
    setStatus(`⚠️ Lecture impossible : ${err instanceof Error ? err.message : String(err)}`);
  });
}

export function destroyCueEditor(): void {
  ws?.destroy();
  ws = null;
  _regions = null;
  _entryRef = null;
  _displOrders = new Map();
  setPlayingUI(false);
  setStatus('');
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
    entry: _entryRef.entry,
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
  // DISPL_ORDER : les régions wavesurfer ne portent pas la metadata — on restitue
  // l'ordre d'origine depuis le Map ; pour les nouveaux cues, ordre chronologique
  // (position triée par start) et non l'index de slot (B9).
  const regions: Array<{ r: any; known: string | undefined }> = _regions
    .getRegions()
    .map((r: any) => ({ r, known: _displOrders.get(r.id) }));
  let next =
    regions.reduce((m: number, x: { known: string | undefined }): number => {
      const v = x.known === undefined ? m : Math.max(m, Number.parseInt(x.known, 10) || 0);
      return v;
    }, -1) + 1;
  const cues = [...regions]
    .sort((a, b) => a.r.start - b.r.start)
    .map(({ r, known }) => regionToCue(r, known ?? String(next++)));
  return saveCues(cues)
    .then(() => showToast('✅ sauvegardé'))
    .catch((err: unknown) => showToast(`❌ ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => {
      _saving = false;
      if (btn) btn.disabled = false;
    });
}
