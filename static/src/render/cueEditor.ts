// ─── Cue editor modal — wavesurfer + régions (Task 7) ─────────────────────
import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../api.js';
import { buildBeats, detectBPMFromUrl, snapToBeat } from '../beatgrid.js';
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
/** Piste courante (filename + fullPath) — re-match après ajout à la collection. */
let _trackLite: PlaylistTrackLite | null = null;
/** hotcue → DISPL_ORDER d'origine (round-trip). wavesurfer perd les metadata custom
 *  des régions, donc on garde un Map séparé peuplé au chargement des cues. */
let _displOrders = new Map<number, string>();
/** Mode dessin de loop (bouton ⟳ Loop) : activé → drag sur la waveform crée une région. */
let _loopMode = false;
let _dragCleanup: (() => void) | null = null;
/** Mode plein écran (bouton 🗖) : le contenu de la modal remplit tout l'écran. */
let _fullscreen = false;
/** Grille de beats (positions en secondes) calculée depuis le BPM — snap des cues/loops.
 *  Priorité : grille native NML (TEMPO + CUE_V2 TYPE=4/GRID), sinon BPM détecté ou saisi. */
let _grid: number[] = [];
let _bpm: number | null = null;
let _snapOn = true;
/** Boucle en cours de lecture (🔁 Play) : {start, end} ou null. */
let _loopPlay: { start: number; end: number } | null = null;

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

/** Active le slot (A–H) dont la région couvre la position courante, sinon aucun. */
function refreshLiveSlot(): void {
  if (!ws || !_regions) return;
  const t = ws.getCurrentTime();
  let liveId: number | null = null;
  for (const r of _regions.getRegions()) {
    const isCue = typeof r.id === 'number' && r.id >= 0 && r.id <= 7;
    if (isCue && t >= r.start && t <= (r.end === r.start ? r.start + 0.05 : r.end)) {
      liveId = r.id;
      break;
    }
  }
  for (const el of document.querySelectorAll<HTMLElement>('.cue-slot')) {
    const slot = Number.parseInt(el.getAttribute('data-slot') || '', 10);
    el.classList.toggle('live', slot === liveId);
  }
}

function updateLoopBtn(): void {
  const btn = document.getElementById('cue-btn-loop') as HTMLButtonElement | null;
  if (btn) btn.classList.toggle('looping', _loopMode);
}

function fullscreenBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-fullscreen') as HTMLButtonElement | null;
}

function bpmInputEl(): HTMLInputElement | null {
  return document.getElementById('cue-bpm') as HTMLInputElement | null;
}

function snapBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-snap') as HTMLButtonElement | null;
}

function loopPlayBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-loopplay') as HTMLButtonElement | null;
}

function addRowEl(): HTMLElement | null {
  return document.getElementById('cue-editor-addrow');
}

function addVolumeInput(): HTMLInputElement | null {
  return document.getElementById('cue-add-volume') as HTMLInputElement | null;
}

function addBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-add') as HTMLButtonElement | null;
}

function showAddRow(): void {
  const row = addRowEl();
  if (row) row.classList.remove('hidden');
  void prefillVolumeInput();
}

function hideAddRow(): void {
  const row = addRowEl();
  if (row) row.classList.add('hidden');
  const btn = addBtnEl();
  if (btn) btn.disabled = false;
}

/** Pré-remplit le volume depuis la config active (traktor_export_volume). */
async function prefillVolumeInput(): Promise<void> {
  const input = addVolumeInput();
  if (!input || input.value.trim()) return;
  try {
    const cfg = await api<{ active?: number; configs?: Array<{ traktor_export_volume?: string }> }>('/config');
    const profile = cfg?.configs?.[cfg.active ?? 0];
    if (profile && !input.value.trim()) input.value = profile.traktor_export_volume || 'TRAKTOR_USB';
  } catch {
    /* silencieux — le serveur applique son propre défaut */
  }
}

function updateSnapBtn(): void {
  const btn = snapBtnEl();
  if (btn) btn.classList.toggle('snap-on', _snapOn);
}

function updateLoopPlayBtn(): void {
  const btn = loopPlayBtnEl();
  if (btn) btn.classList.toggle('loop-playing', _loopPlay !== null);
}

function stopLoopPlay(): void {
  _loopPlay = null;
  updateLoopPlayBtn();
}

/** Reconstruit la grille depuis le BPM courant (phase comprise) et la durée de la piste. */
function rebuildGrid(): void {
/** Dessine les lignes de beats au-dessus de la waveform (sous les régions). */
function renderGrid(): void {
  const wave = document.getElementById('cue-editor-waveform') as HTMLElement | null;
  if (!wave) return;
  let gridEl = document.getElementById('cue-editor-grid') as HTMLElement | null;
  if (!gridEl) {
    gridEl = document.createElement('div');
    gridEl.id = 'cue-editor-grid';
    wave.appendChild(gridEl);
  }
  gridEl.innerHTML = '';
  const duration = ws?.getDuration() || 0;
  if (_grid.length === 0 || duration <= 0) return;
  for (let i = 0; i < _grid.length; i++) {
    const line = document.createElement('div');
    line.className = `cue-grid-line${i % 4 === 0 ? ' strong' : ''}`;
    line.style.left = `${(_grid[i] / duration) * 100}%`;
    gridEl.appendChild(line);
  }
}

/** Premier slot A–H libre pour un loop dessiné — les cues/loops sauvegardés
 *  doivent avoir HOTCUE 0..7 (le backend refuse le reste). */
function nextFreeSlot(): number {
  if (!_regions) return -1;
  const used = new Set<number>();
  for (const r of _regions.getRegions()) {
    if (typeof r.id === 'number' && r.id >= 0 && r.id <= 7) used.add(r.id);
  }
  for (let s = 0; s <= 7; s++) if (!used.has(s)) return s;
  return -1;
}

/** Boucle (région étendue) sous le curseur, sinon la première boucle. */
function findLoopAtCursor(): { start: number; end: number } | null {
  if (!ws || !_regions) return null;
  const t = ws.getCurrentTime();
  const loops = _regions.getRegions().filter((r: any) => r.end - r.start > 0.1);
  if (loops.length === 0) return null;
  const at = loops.find((r: any) => t >= r.start && t <= r.end);
  const r = at || loops[0];
  return { start: r.start, end: r.end };
}

/** Bascule la modal en plein écran : la waveform remplit tout l'espace
 *  (wavesurfer v7 re-rend automatiquement via son ResizeObserver, height 'auto'). */
export function toggleFullscreen(): void {
  _fullscreen = !_fullscreen;
  const modal = document.getElementById('modal-cue-editor');
  modal?.querySelector('.modal-content')?.classList.toggle('cue-fullscreen', _fullscreen);
  const btn = fullscreenBtnEl();
  if (btn) {
    btn.textContent = _fullscreen ? '🗗' : '🗖';
    btn.title = _fullscreen ? 'Réduire (plein écran)' : 'Plein écran';
  }
}

/** Bascule le snap sur la grille de beats (cues + loops). */
export function toggleSnap(): void {
  _snapOn = !_snapOn;
  updateSnapBtn();
  setStatus(
    _snapOn && _grid.length > 0 ? '🧲 Snap actif — les cues/loops se calent sur la grille.' : 'Snap désactivé.',
  );
}

/** Bascule la lecture en boucle (🔁 Play) : joue la boucle sous le curseur en continu. */
export function toggleLoopPlay(): void {
  if (!ws || !_regions) return;
  if (_loopPlay) {
    stopLoopPlay();
    ws.pause();
    return;
  }
  const loop = findLoopAtCursor();
  if (!loop) {
    setStatus('⚠️ Aucune boucle — ⟳ Loop puis glisser sur la waveform pour en dessiner une.');
    return;
  }
  // Curseur hors de la boucle (fallback sur la première) : le dire plutôt que de
  // jouer une boucle qu'on ne voit pas à l'écran.
  const t = ws.getCurrentTime();
  if (t < loop.start || t > loop.end) {
    setStatus(`⟲ Curseur hors boucle — lecture de ${formatTime(loop.start)}–${formatTime(loop.end)}.`);
  }
  _loopPlay = loop;
  updateLoopPlayBtn();
  void ws.play(loop.start, loop.end);
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
  const loop = root.querySelector<HTMLButtonElement>('#cue-btn-loop');
  if (loop && !_wired.has(loop)) {
    _wired.add(loop);
    loop.addEventListener('click', () => toggleLoopMode());
  }
  const addBtn = root.querySelector<HTMLButtonElement>('#cue-btn-add');
  if (addBtn && !_wired.has(addBtn)) {
    _wired.add(addBtn);
    addBtn.addEventListener('click', () => void onAddToCollectionClicked());
  }
  const loopPlay = root.querySelector<HTMLButtonElement>('#cue-btn-loopplay');
  if (loopPlay && !_wired.has(loopPlay)) {
    _wired.add(loopPlay);
    loopPlay.addEventListener('click', () => toggleLoopPlay());
  }
  const snap = root.querySelector<HTMLButtonElement>('#cue-btn-snap');
  if (snap && !_wired.has(snap)) {
    _wired.add(snap);
    snap.addEventListener('click', () => toggleSnap());
  }
  const bpm = root.querySelector<HTMLInputElement>('#cue-bpm');
  if (bpm && !_wired.has(bpm)) {
    _wired.add(bpm);
    bpm.addEventListener('input', () => {
      const v = parseFloat(bpm.value);
      _bpm = Number.isFinite(v) && v > 20 && v < 300 ? v : null;
  const fs = root.querySelector<HTMLButtonElement>('#cue-btn-fullscreen');
  if (fs && !_wired.has(fs)) {
    _wired.add(fs);
    fs.addEventListener('click', toggleFullscreen);
  }
}

/** Bascule le mode dessin de loop : drag sur la waveform → nouvelle région boucle. */
export function toggleLoopMode(): void {
  if (!_regions || !ws) return;
  _loopMode = !_loopMode;
  updateLoopBtn();
  if (_loopMode) {
    if (_dragCleanup) _dragCleanup();
    _dragCleanup = _regions.enableDragSelection({
      color: 'rgba(255, 170, 0, 0.35)',
      drag: false,
      resize: false,
    });
    setStatus('⟳ Mode loop : glisse sur la waveform pour dessiner une boucle.');
  } else {
    _dragCleanup?.();
    _dragCleanup = null;
    setStatus('');
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

// Échap en plein écran : SORT du plein écran au lieu de fermer la modal.
// Phase capture (toujours avant le router du registry, en bubble) → on
// stoppe la propagation pour que le registry ne ferme pas la modal.
document.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    if (state.activeModal !== 'cueEditor' || !_fullscreen || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleFullscreen();
  },
  { capture: true },
);

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
  let data: { ok: boolean; entries: any[]; multiple: boolean; error?: string };
  try {
    data = await api<{ ok: boolean; entries: any[]; multiple: boolean; error?: string }>(
      `/api/track/match?path=${encodeURIComponent(track.fullPath)}`,
    );
  } catch (err) {
    // api() lève ApiError sur 404 (fichier introuvable) / 400 (NML invalide).
    showToast(`⚠️ ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!data.ok) {
    showToast(`⚠️ ${data.error || 'fichier introuvable'}`);
    return;
  }
  _trackPath = track.fullPath;
  _trackLite = track;
  const title = document.getElementById('cue-editor-title') as HTMLElement | null;
  const saveBtn = document.getElementById('cue-btn-save') as HTMLButtonElement | null;
  // Retire le sélecteur d'homonymes d'une ouverture précédente (ses closures
  // pointeraient vers l'ancienne piste — mélange de données sinon).
  const staleSelect = document.getElementById('cue-editor-select');
  if (staleSelect) staleSelect.remove();
  if (data.entries.length === 0) {
    // Mode visualisation seule : le fichier existe mais n'est pas dans la collection.
    // Le bouton doit TOUJOURS donner accès à l'outil waveform — sauvegarde désactivée,
    // mais la piste peut être AJOUTÉE à la collection (le vrai correctif).
    if (title) title.textContent = track.filename;
    setStatus('⚠️ Piste absente de la collection Traktor — ➕ Ajoute-la pour pouvoir sauvegarder les cues.');
    _entryRef = null;
    if (saveBtn) saveBtn.disabled = true;
    showAddRow();
    state.activeModal = 'cueEditor';
    const modal = document.getElementById('modal-cue-editor');
    if (modal) modal.classList.remove('hidden');
    wireControls(document.body);
    await renderWaveform(track.fullPath, []);
    return;
  }
  await renderMatchedEntry(track, data);
}

/** Bascule en mode édition avec une entrée matchée (titre, statut, homonymes,
 *  modal, waveform). Aussi utilisé après l'ajout à la collection. */
async function renderMatchedEntry(
  track: PlaylistTrackLite,
  data: { ok: boolean; entries: any[]; multiple: boolean },
): Promise<void> {
  const saveBtn = document.getElementById('cue-btn-save') as HTMLButtonElement | null;
  if (saveBtn) saveBtn.disabled = false;
  hideAddRow();
  const stored = storedIndex(track.filename);
  const idx = stored >= 0 && stored < data.entries.length ? stored : 0;
  const entry = data.entries[idx];
  _entryRef = { filename: entry.filename, filesize: entry.filesize, entry: idx };
  const title = document.getElementById('cue-editor-title') as HTMLElement | null;
  if (title) title.textContent = `${entry.artist || ''} — ${entry.title || entry.filename}`;
  setStatus(
    `Piste éditée : ${entry.volume || '—'}${entry.dir ? ` ${entry.dir}` : ''} — ▶ pour écouter, slot A–H pour poser un cue.`,
  );
  const controls = document.getElementById('cue-editor-controls') as HTMLElement | null;
  if (data.multiple && controls) {
    const select = document.createElement('select');
    select.id = 'cue-editor-select';
    data.entries.forEach((e, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      // DIR/VOLUME discriminent les homonymes réels (audit B3).
      opt.textContent = `${e.artist || e.filename} — ${e.title || e.filename} (${e.volume || '?'}${e.dir ? ` ${e.dir}` : ''})`;
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
/** Ajoute la piste courante à la collection (mode visualisation seule) puis
 *  re-matche pour basculer en mode édition. */
export async function onAddToCollectionClicked(): Promise<void> {
  const btn = addBtnEl();
  const track = _trackLite; // capturé : la fermeture de la modal pendant la requête
  if (!btn || !_trackPath || !track) return;
  btn.disabled = true;
  setStatus('⏳ Ajout à la collection…');
  try {
    const volume = addVolumeInput()?.value.trim() || undefined;
    const res = await api<{ ok: boolean; already?: boolean; error?: string }>('/api/track/add', {
      method: 'POST',
      body: JSON.stringify({ path: _trackPath, volume }),
    });
    if (!res.ok) throw new Error(res.error || 'ajout refusé');
    const data = await api<{ ok: boolean; entries: any[]; multiple: boolean }>(
      `/api/track/match?path=${encodeURIComponent(_trackPath)}`,
    );
    if (!data.ok || data.entries.length === 0) {
      setStatus('⚠️ Entrée créée mais introuvable au re-match — recharge la page.');
      return;
    }
    // Modal fermée pendant la requête (~1,5 s) → ne pas la ré-ouvrir.
    if (!_trackLite || state.activeModal !== 'cueEditor') return;
    await renderMatchedEntry(track, data);
    showToast(res.already ? '✅ déjà dans la collection' : '✅ piste ajoutée à la collection');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`❌ ${msg}`);
    showToast(`❌ ${msg}`);
  } finally {
    btn.disabled = false;
  }
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
  // Détruit l'instance précédente (changement d'entrée homonyme) — évite fuite + chevauchement audio.
  ws?.destroy();
  ws = null;
  _regions = null;
  _dragCleanup?.();
  _dragCleanup = null;
  _loopMode = false;
  updateLoopBtn();
  stopLoopPlay();
  _grid = [];
  _bpm = null;
  updateSnapBtn();
  // DISPL_ORDER d'origine : {hotcue → displ_order} — jamais reconstruit depuis le slot (B9).
  _displOrders = new Map(cues.filter(c => c.hotcue >= 0 && c.hotcue <= 7).map(c => [c.hotcue, c.displ_order]));
  setPlayingUI(false);
  const time = timeEl();
  if (time) time.textContent = '0:00 / 0:00';
  // height: 'auto' → la waveform remplit le conteneur (200px, ou tout l'écran en plein
  // écran) ; le ResizeObserver de v7 re-rend à chaque changement de taille.
  ws = WaveSurfer.create({ container: el, url: `/audio?path=${encodeURIComponent(path)}`, height: 'auto' });
  ws.on('ready', () => {
    _regions = ws!.registerPlugin(Regions.create());
    for (const r of cuesToRegions(cues)) _regions.addRegion(r);
    // Clic-droit sur une région = suppression (audit UX).
    _regions.on('region-clicked', (region: any, ev: MouseEvent) => {
      if (ev.button === 2) {
        region.remove();
        // La boucle supprimée était en cours de lecture → couper l'audio.
        if (_loopPlay) {
          stopLoopPlay();
          ws?.pause();
        }
        refreshLiveSlot();
      }
    });
    // Loop dessiné (id string, créé par le drag) → slot A–H libre ; sinon la
    // sauvegarde écrirait HOTCUE invalide (400 backend). Snap sur la grille si active.
    _regions.on('region-created', (region: any) => {
      if (typeof region.id !== 'number') {
        const slot = nextFreeSlot();
        if (slot === -1) {
          region.remove();
          showToast("⚠️ 8 slots A–H pleins — retire un cue/loop d'abord.");
          return;
        }
        region.id = slot;
      }
      // Snap seulement si la région est APRÈS le premier beat (phase) : un cue
      // dessiné dans l'intro (avant la grille) ne doit pas sauter au beat 1.
      if (_snapOn && _grid.length > 0 && region.start >= _grid[0]) {
        const start = snapToBeat(region.start, _grid);
        const end = Math.max(start + 0.2, snapToBeat(region.end, _grid));
        region.setOptions({ start, end });
      }
      refreshLiveSlot();
    });
    updateTimeUI();
      rebuildGrid();
      void detectAndApplyBPM();
    }
  });
  ws.on('play', () => setPlayingUI(true));
  ws.on('pause', () => setPlayingUI(false));
  ws.on('finish', () => {
    setPlayingUI(false);
    // Lecture de boucle (🔁 Play) : on relance immédiatement le cycle.
    if (_loopPlay) void ws?.play(_loopPlay.start, _loopPlay.end);
  });
  ws.on('timeupdate', () => {
    updateTimeUI();
    refreshLiveSlot();
  });
  ws.on('error', (err: unknown) => {
    setPlayingUI(false);
    setStatus(`⚠️ Lecture impossible : ${err instanceof Error ? err.message : String(err)}`);
  });
}

export function destroyCueEditor(): void {
  ws?.destroy();
  ws = null;
  _regions = null;
  _dragCleanup?.();
  _dragCleanup = null;
  _loopMode = false;
  _entryRef = null;
  _trackLite = null;
  _displOrders = new Map();
  stopLoopPlay();
  hideAddRow();
  _grid = [];
  _bpm = null;
  updateSnapBtn();
  // Sort du plein écran si la modal se ferme dans cet état.
  _fullscreen = false;
  const modal = document.getElementById('modal-cue-editor');
  modal?.querySelector('.modal-content')?.classList.remove('cue-fullscreen');
  const fsBtn = fullscreenBtnEl();
  if (fsBtn) {
    fsBtn.textContent = '🗖';
    fsBtn.title = 'Plein écran';
  }
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
  refreshLiveSlot();
}

/** Supprime la région (cue/loop) couvrant la position courante — touche Suppr. */
export function deleteRegionAtCursor(): boolean {
  if (!ws || !_regions) return false;
  const t = ws.getCurrentTime();
  let target: any = null;
  for (const r of _regions.getRegions()) {
    const end = r.end === r.start ? r.start + 0.05 : r.end;
    if (t >= r.start && t <= end) {
      target = r;
      break;
    }
  }
  if (!target) return false;
  target.remove();
  // Si c'était la boucle en cours de lecture, on coupe le son immédiatement
  // (stopLoopPlay seul laisserait l'audio jouer la fin de la boucle supprimée).
  if (_loopPlay && Math.abs(_loopPlay.start - target.start) < 1e-6 && Math.abs(_loopPlay.end - target.end) < 1e-6) {
    stopLoopPlay();
    ws.pause();
  }
  refreshLiveSlot();
  return true;
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
