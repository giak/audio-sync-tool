// ─── Cue editor modal — wavesurfer + régions (Task 7) ─────────────────────
import WaveSurfer from 'wavesurfer.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../api.js';
import { computeBassBand } from '../bassband.js';
import { _clearMatchCache } from '../matchStatus.js';
import { beatInterval, buildBeats, detectBPMFromUrl, snapToBeat } from '../beatgrid.js';
import type { CueDTO } from '../cueModel.js';
import { cuesToRegions, hotToLabel, regionToCue } from '../cueModel.js';
import { emit, on, state } from '../state.js';
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
/** Phase de la grille (position du premier beat en secondes) — calage réel, pas t=0. */
let _phase = 0;
/** Source de la grille : nml (native) | detected (client) | manual (saisie). */
let _gridSource: 'nml' | 'detected' | 'manual' | null = null;
let _snapOn = true;
/** Boucle en cours de lecture (🔁 Play) : {start, end} ou null. */
let _loopPlay: { start: number; end: number } | null = null;
/** Mode « poser le beat 1 » (EPIC-009) : le prochain clic sur la waveform fixe la phase. */
let _beat1Mode = false;
/** Confiance de l'analyse serveur (EPIC-010, 0..1) — affichée dans le badge « auto · % ». */
let _confidence: number | null = null;
/** Analyse serveur en cours (bouton 🔍 Analyser) — évite le double clic. */
let _analyzing = false;
/** Bande d'énergie basse 40-150 Hz (EPIC-012) — barres 0..1 pour valider le calage à l'œil.
 *  Calculée côté client depuis le buffer décodé de wavesurfer (zéro réseau, best-effort). */
let _bassBand: number[] = [];

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

function bpmBadgeEl(): HTMLElement | null {
  return document.getElementById('cue-bpm-badge');
}

/** Badge de source de la grille : NML (native) / auto (détecté) / manuel.
 *  EPIC-010 : la confiance de l'analyse serveur (0..1) est ajoutée au badge « auto ». */
function updateBpmBadge(): void {
  const el = bpmBadgeEl();
  if (!el) return;
  const labels: Record<string, string> = { nml: 'NML', detected: 'auto', manual: 'manuel' };
  const src = _gridSource && _bpm !== null ? _gridSource : null;
  let txt = src ? labels[src] : '';
  if (src === 'detected' && _confidence !== null && _confidence > 0) {
    txt += ` · ${Math.round(_confidence * 100)} %`;
  }
  el.textContent = txt;
  el.classList.toggle('hidden', !src);
  el.classList.toggle('src-nml', src === 'nml');
  el.classList.toggle('src-detected', src === 'detected');
  el.classList.toggle('src-manual', src === 'manual');
  updateWriteGridBtn();
}

/** Applique une grille native NML (TEMPO + TYPE=4/GRID) : BPM + phase réels.
 *  Garde de plausibilité : les collections réelles contiennent des BPM aberrants
 *  (1.0, 17178) — on les ignore plutôt que de produire une grille absurde.
 *  Renvoie false si la grille est absente/invalide → l'appelant bascule sur le
 *  cache serveur / la détection (EPIC-009 : cascade NML → cache → détection). */
function applyNativeGrid(grid?: { bpm?: number | null; phase?: number | null } | null): boolean {
  if (!grid || typeof grid.bpm !== 'number' || !Number.isFinite(grid.bpm)) return false;
  if (grid.bpm <= 20 || grid.bpm >= 400) return false;
  _bpm = grid.bpm;
  _phase = typeof grid.phase === 'number' && Number.isFinite(grid.phase) ? grid.phase : 0;
  _gridSource = 'nml';
  const input = bpmInputEl();
  if (input) input.value = String(grid.bpm);
  rebuildGrid();
  updateBpmBadge();
  return true;
}

function snapBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-snap') as HTMLButtonElement | null;
}

function beat1BtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-beat1') as HTMLButtonElement | null;
}

function analyzeBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-analyze') as HTMLButtonElement | null;
}

function writeGridBtnEl(): HTMLButtonElement | null {
  return document.getElementById('cue-btn-writegrid') as HTMLButtonElement | null;
}

/** Bouton 💾 Grille (EPIC-011) : actif seulement en mode édition (ENTRY résolu,
 *  pas en visualisation seule) AVEC un BPM calé. Centralisé dans updateBpmBadge
 *  (appelé à chaque changement de grille/source) — un seul point de vérité. */
function updateWriteGridBtn(): void {
  const btn = writeGridBtnEl();
  if (!btn) return;
  btn.disabled = !(_entryRef && _bpm !== null);
}

function updateBeat1Btn(): void {
  const btn = beat1BtnEl();
  if (btn) btn.classList.toggle('beat1-on', _beat1Mode);
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
  _grid = _bpm && ws ? buildBeats(_bpm, ws.getDuration() || 0, _phase) : [];
  renderGrid();
}

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
  // Espacement entre barres en % du conteneur : en dessous, les numéros se
  // chevaucheraient → on ne les affiche que si lisible (EPIC-012).
  // _bpm est non nul ici : _grid n'est peuplé que depuis un BPM valide.
  const barWidthPct = ((4 * beatInterval(_bpm!)) / duration) * 100;
  const showBarNums = barWidthPct >= 1.5;
  for (let i = 0; i < _grid.length; i++) {
    const line = document.createElement('div');
    line.className = `cue-grid-line${i % 4 === 0 ? ' strong' : ''}`;
    line.style.left = `${(_grid[i] / duration) * 100}%`;
    if (i % 4 === 0 && showBarNums) {
      const num = document.createElement('span');
      num.className = 'cue-bar-num';
      num.textContent = String(i / 4 + 1);
      line.appendChild(num);
    }
    gridEl.appendChild(line);
  }
}

/** Bande d'énergie basse (EPIC-012) : calcule et affiche les barres 0..1 sous la
 *  waveform, depuis le buffer décodé de wavesurfer. Best-effort : un buffer
 *  indisponible (mock, échec de décodage) laisse la bande vide sans erreur. */
function loadBassBand(): void {
  try {
    const buf = ws?.getDecodedData();
    if (!buf) return;
    const ch = buf.getChannelData(0);
    _bassBand = computeBassBand(ch, buf.sampleRate);
  } catch {
    _bassBand = [];
  }
  renderBassBand();
}

/** Dessine la bande basse sous la waveform (24px, sous la grille, pointer-events none). */
function renderBassBand(): void {
  const wave = document.getElementById('cue-editor-waveform') as HTMLElement | null;
  if (!wave) return;
  if (_bassBand.length === 0) {
    // Aucune donnée (buffer indisponible/trop court) : pas de bande, ni vide ni fantôme.
    document.getElementById('cue-editor-bassband')?.remove();
    return;
  }
  let bandEl = document.getElementById('cue-editor-bassband') as HTMLElement | null;
  if (!bandEl) {
    bandEl = document.createElement('div');
    bandEl.id = 'cue-editor-bassband';
    wave.appendChild(bandEl);
  }
  bandEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const v of _bassBand) {
    const bar = document.createElement('i');
    bar.className = 'bass-bar';
    bar.style.height = `${Math.max(2, Math.round(v * 100))}%`;
    frag.appendChild(bar);
  }
  bandEl.appendChild(frag);
}

/** Persiste la grille courante {bpm, phase, source} dans le cache serveur
 *  (EPIC-009) — survit à la fermeture, réutilisée à la prochaine ouverture.
 *  Best-effort : un échec de cache ne bloque jamais l'édition. */
function saveGridToCache(): void {
  if (!_trackPath || _bpm === null || _gridSource === null) return;
  void Promise.resolve(
    api('/api/beatgrid', {
      method: 'PUT',
      body: JSON.stringify({ path: _trackPath, bpm: _bpm, phase: _phase, source: _gridSource }),
    }),
  ).catch(() => {});
}

/** Nudge de phase : décale la grille d'un quart de beat (EPIC-009).
 *  Toute correction manuelle marque la grille « manuel » (badge). */
export function nudgePhase(dir: -1 | 1): void {
  if (_bpm === null || !ws) {
    setStatus("⚠️ Saisis un BPM d'abord pour caler la grille.");
    return;
  }
  const quarter = beatInterval(_bpm) / 4;
  _phase = Math.max(0, _phase + dir * quarter);
  _gridSource = 'manual';
  rebuildGrid();
  updateBpmBadge();
  saveGridToCache();
  setStatus(`🎛 Calage ${dir < 0 ? 'reculé' : 'avancé'} d'un quart de beat — beat 1 à ${_phase.toFixed(2)} s.`);
}

/** Bascule le mode « poser le beat 1 » : le prochain clic sur la waveform
 *  (événement click wavesurfer, relativeX 0..1) fixe _phase. */
export function toggleBeat1Mode(): void {
  _beat1Mode = !_beat1Mode;
  updateBeat1Btn();
  setStatus(_beat1Mode ? '◎ Clique sur la waveform pour poser le beat 1 ici.' : '');
}

/** Écriture de la grille dans la collection (EPIC-011) : POST /api/track/grid.
 *  Disponible uniquement en mode édition (ENTRY résolu) AVEC un BPM calé.
 *  Après écriture, la grille est native NML (badge NML) et Traktor l'affichera. */
export async function writeGridToCollection(): Promise<void> {
  if (!_entryRef || _bpm === null) {
    setStatus("⚠️ Calcule ou saisis un BPM d'abord pour écrire la grille.");
    return;
  }
  const btn = writeGridBtnEl();
  if (btn) {
    btn.disabled = true;
    btn.classList.add('writing');
  }
  setStatus('⏳ Écriture de la grille dans la collection…');
  try {
    const res = await api<{ ok: boolean; error?: string }>('/api/track/grid', {
      method: 'POST',
      body: JSON.stringify({
        filename: _entryRef.filename,
        filesize: _entryRef.filesize,
        entry: _entryRef.entry,
        bpm: _bpm,
        phase: _phase,
        quality: 100,
      }),
    });
    if (!res.ok) throw new Error(res.error || 'écriture refusée');
    // La grille est désormais NATIVE dans le NML : le badge bascule sur NML.
    _gridSource = 'nml';
    updateBpmBadge();
    setStatus(
      `✅ Grille écrite dans la collection — ${_bpm} BPM, beat 1 à ${_phase.toFixed(2)} s. Traktor l'affichera au prochain scan.`,
    );
  } catch (err) {
    setStatus(`❌ Écriture impossible : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('writing');
    }
  }
}

/** Analyse serveur basse/kick (EPIC-010) : POST /api/track/analyze → {bpm, phase,
 *  confidence}. Le serveur PERSISTE le résultat dans le cache beatgrid (source
 *  'detected') — pas de PUT local (le PUT n'enverrait pas la confidence).
 *  Une grille native NML ou une correction MANUELLE active ne sont jamais
 *  remplacées (cascade EPIC-009 : native > manuel > analyse > détection client). */
export async function analyzeOnServer(): Promise<void> {
  if (_analyzing || !_trackPath || !ws) return;
  if (_gridSource === 'nml' || _gridSource === 'manual') {
    setStatus(
      _gridSource === 'nml'
        ? "🎛 Grille native Traktor déjà active — l'analyse n'est pas nécessaire."
        : "🎛 Grille manuelle active — efface le BPM saisi pour relancer l'analyse serveur.",
    );
    return;
  }
  _analyzing = true;
  const btn = analyzeBtnEl();
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳';
  }
  setStatus('⏳ Analyse basse/phase sur le serveur…');
  try {
    const res = await api<{
      ok: boolean;
      bpm?: number | null;
      phase?: number | null;
      confidence?: number | null;
      notice?: string;
      error?: string;
    }>('/api/track/analyze', {
      method: 'POST',
      body: JSON.stringify({ path: _trackPath }),
    });
    if (!res.ok || typeof res.bpm !== 'number' || !Number.isFinite(res.bpm)) {
      setStatus(res.notice || res.error || '⚠️ Analyse impossible — saisis le BPM manuellement.');
      return;
    }
    _bpm = res.bpm;
    _phase = typeof res.phase === 'number' && Number.isFinite(res.phase) ? res.phase : 0;
    _confidence = typeof res.confidence === 'number' && Number.isFinite(res.confidence) ? res.confidence : null;
    _gridSource = 'detected';
    const input = bpmInputEl();
    if (input) input.value = String(res.bpm);
    rebuildGrid();
    updateBpmBadge();
    const pct = _confidence !== null ? ` — confiance ${Math.round(_confidence * 100)} %` : '';
    setStatus(`🎛 Analyse serveur : ${res.bpm} BPM, beat 1 à ${_phase.toFixed(2)} s${pct}. Snap calé sur la basse.`);
  } catch (err) {
    setStatus(`❌ Analyse impossible : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    _analyzing = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔍 Analyser';
    }
  }
}

/** Cascade grille : NML (native, appliquée au ready) → cache serveur → détection client.
 *  Règles :
 *  - Le cache « manual » (correction explicite de l'utilisateur) PRIME sur la grille native.
 *  - Le cache « detected » ne remplace JAMAIS une grille déjà appliquée (native ou saisie).
 *  - Grille native aberrante (garde 20–400 rejetée au ready) → le cache s'applique quand même. */
async function loadCachedGrid(): Promise<void> {
  if (!_trackPath || !ws) return;
  let data: { bpm?: number; phase?: number; source?: string; confidence?: number } | undefined;
  try {
    data = await api<{ bpm?: number; phase?: number; source?: string; confidence?: number }>(
      `/api/beatgrid?path=${encodeURIComponent(_trackPath)}`,
    );
  } catch {
    if (_bpm === null) void detectAndApplyBPM(); // cache indisponible → on détecte
    return;
  }
  if (typeof data?.bpm !== 'number' || !Number.isFinite(data.bpm)) {
    if (_bpm === null) void detectAndApplyBPM(); // cache vide/périmé → détection client
    return;
  }
  const isManual = data.source === 'manual';
  // Une grille déjà appliquée (native/saisie) n'est écrasée que par une correction manuelle.
  if (_bpm !== null && !isManual) return;
  if (!ws) return;
  if (data.bpm <= 20 || data.bpm >= 400) {
    if (_bpm === null) void detectAndApplyBPM();
    return;
  }
  _bpm = data.bpm;
  _phase = typeof data.phase === 'number' && Number.isFinite(data.phase) && data.phase >= 0 ? data.phase : 0;
  _gridSource =
    data.source === 'nml' || data.source === 'detected' || data.source === 'manual' ? data.source : 'detected';
  _confidence = typeof data.confidence === 'number' && Number.isFinite(data.confidence) ? data.confidence : null;
  const input = bpmInputEl();
  if (input) input.value = String(data.bpm);
  rebuildGrid();
  updateBpmBadge();
  const pct =
    _gridSource === 'detected' && _confidence !== null ? ` (confiance ${Math.round(_confidence * 100)} %)` : '';
  setStatus(
    `🎛 Grille chargée du cache (${_gridSource === 'manual' ? 'manuel' : _gridSource === 'nml' ? 'NML' : 'détectée'})${pct} — ${_bpm} BPM.`,
  );
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

/** Détection BPM best-effort sur l'audio. Ignorée si une grille (native ou saisie) existe. */
async function detectAndApplyBPM(): Promise<void> {
  if (_bpm !== null || _gridSource === 'manual') return;
  const bpm = await detectBPMFromUrl(`/audio?path=${encodeURIComponent(_trackPath)}`);
  if (!bpm || _bpm !== null || !ws) return;
  _bpm = bpm;
  _gridSource = 'detected';
  const input = bpmInputEl();
  if (input) input.value = String(bpm);
  rebuildGrid();
  updateBpmBadge();
  saveGridToCache();
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
      _bpm = Number.isFinite(v) && v > 20 && v < 400 ? v : null; // même borne que la native/le backend
      _gridSource = _bpm !== null ? 'manual' : null;
      _phase = 0;
      rebuildGrid();
      updateBpmBadge();
      saveGridToCache();
    });
  }
  const nudgeBwd = root.querySelector<HTMLButtonElement>('#cue-btn-nudge-bwd');
  if (nudgeBwd && !_wired.has(nudgeBwd)) {
    _wired.add(nudgeBwd);
    nudgeBwd.addEventListener('click', () => nudgePhase(-1));
  }
  const nudgeFwd = root.querySelector<HTMLButtonElement>('#cue-btn-nudge-fwd');
  if (nudgeFwd && !_wired.has(nudgeFwd)) {
    _wired.add(nudgeFwd);
    nudgeFwd.addEventListener('click', () => nudgePhase(1));
  }
  const beat1 = root.querySelector<HTMLButtonElement>('#cue-btn-beat1');
  if (beat1 && !_wired.has(beat1)) {
    _wired.add(beat1);
    beat1.addEventListener('click', () => toggleBeat1Mode());
  }
  const analyze = root.querySelector<HTMLButtonElement>('#cue-btn-analyze');
  if (analyze && !_wired.has(analyze)) {
    _wired.add(analyze);
    analyze.addEventListener('click', () => void analyzeOnServer());
  }
  const writeGrid = root.querySelector<HTMLButtonElement>('#cue-btn-writegrid');
  if (writeGrid && !_wired.has(writeGrid)) {
    _wired.add(writeGrid);
    writeGrid.addEventListener('click', () => void writeGridToCollection());
  }
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
  await renderWaveform(track.fullPath, entry.cues || [], entry.grid);
}

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
    // La piste est maintenant dans la collection → badges playlist rafraîchis
    // (cache vidé + re-render conditionnel si le layout playlist est visible).
    _clearMatchCache();
    emit('eparsPlaylist:changed');
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
  await renderWaveform(_trackPath, entry.cues || [], entry.grid);
}

export async function renderWaveform(
  path: string,
  cues: CueDTO[],
  grid?: { bpm?: number | null; phase?: number | null } | null,
): Promise<void> {
  const el = document.getElementById('cue-editor-waveform') as HTMLElement | null;
  if (!el) return;
  el.innerHTML = '';
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
  _phase = 0;
  _gridSource = null;
  _confidence = null;
  _analyzing = false;
  _beat1Mode = false;
  updateBeat1Btn();
  updateSnapBtn();
  updateBpmBadge();
  const analyzeBtn = analyzeBtnEl();
  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '🔍 Analyser';
  }
  _bassBand = [];
  const bandEl = document.getElementById('cue-editor-bassband');
  if (bandEl) bandEl.innerHTML = '';
  const bpmInput = bpmInputEl();
  if (bpmInput) bpmInput.value = '';
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
    // Clic (mode « poser le beat 1 ») : wavesurfer émet (relativeX, relativeY) 0..1.
    ws!.on('click', (relX: number, _relY: unknown) => {
      if (!_beat1Mode || !ws) return;
      if (_bpm === null) {
        setStatus("⚠️ Saisis un BPM d'abord pour poser le beat 1.");
        toggleBeat1Mode();
        return;
      }
      const t = relX * (ws.getDuration() || 0);
      if (!Number.isFinite(t) || t < 0) return;
      _phase = t;
      _gridSource = 'manual';
      rebuildGrid();
      updateBpmBadge();
      saveGridToCache();
      toggleBeat1Mode(); // sort du mode une fois le beat posé
      setStatus(`◎ Beat 1 posé à ${formatTime(t)} — grille calée.`);
    });
    // Cascade EPIC-009 : la grille native est appliquée d'abord, puis le cache
    // serveur est consulté (une correction manuelle prime sur la native ; une
    // grille native aberrante ne bloque pas le cache/détection).
    if (grid && typeof grid.bpm === 'number') {
      const applied = applyNativeGrid(grid);
      if (applied) {
        setStatus(
          `🎛 Grille native Traktor — ${grid.bpm} BPM${_phase > 0 ? `, beat 1 à ${_phase.toFixed(2)}s` : ''}. Snap calé sur le rythme.`,
        );
      }
    } else {
      rebuildGrid();
    }
    void loadCachedGrid();
    // Bande d'énergie basse (EPIC-012) : calcul O(n) différé (setTimeout 0) pour
    // ne pas bloquer le rendu initial sur les longues pistes ; best-effort.
    setTimeout(() => loadBassBand(), 0);
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
  _phase = 0;
  _gridSource = null;
  _confidence = null;
  _analyzing = false;
  _beat1Mode = false;
  updateBeat1Btn();
  updateSnapBtn();
  updateBpmBadge();
  const analyzeBtn = analyzeBtnEl();
  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '🔍 Analyser';
  }
  _bassBand = [];
  const bandEl = document.getElementById('cue-editor-bassband');
  if (bandEl) bandEl.innerHTML = '';
  const bpmInput = bpmInputEl();
  if (bpmInput) bpmInput.value = '';
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
