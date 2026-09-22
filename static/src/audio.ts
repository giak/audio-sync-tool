// ─── Audio player + player bar UI ──────────────────────────────────────────
// SINGLETON STRICT (EPIC-038) : une seule lecture à la fois, quel que soit le
// point d'entrée (épars, arbre source, playlist, cartes Années/Doublons, menus)
// et le rythme des clics. Deux garanties :
//   1. `currentAudio` est la référence maître, assignée SYNCHRONEMENT (avant
//      `play()`) — l'ancien élément est libéré tout de suite (pause + src vide
//      + handlers détachés), donc l'audio précédent meurt AVANT le nouveau ;
//   2. `playSeq` (génération de lecture) : les callbacks d'une promesse périmée
//      (résolution tardive d'un `.play()`, `onended`/`onerror` d'un élément
//      remplacé) ne touchent plus ni la barre, ni les marques, ni l'état.
// Régression d'origine : `currentAudio` n'était assigné qu'à la résolution de
// `play()` et le callback de succès ne mettait en pause AUCUN élément → deux
// `<audio>` jouaient vraiment quand deux clics se croisaient pendant le
// chargement (R présenté : clic dans une colonne puis l'autre).

import { setStatus } from './core/feedback.js';
import { emit } from './state.js';
import { formatTime } from './utils.js';

let currentAudio: HTMLAudioElement | null = null;
let _playerFilename = '';
let playerFullpath = '';
/** Génération de lecture : incrémentée à chaque `togglePlay`/`stopPlayer`.
 *  Un callback ne s'applique que si sa génération est encore la courante. */
let playSeq = 0;

const playerBar = document.getElementById('player-bar') as HTMLElement | null;
const playerFilenameEl = document.getElementById('player-filename') as HTMLElement | null;
const playerProgressFill = document.getElementById('player-progress-fill') as HTMLElement | null;
const playerTime = document.getElementById('player-time') as HTMLElement | null;
const playerStep = document.getElementById('player-step') as HTMLInputElement | null;

function updatePlayerUI(): void {
  if (!currentAudio?.duration) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100;
  if (playerProgressFill) playerProgressFill.style.width = `${pct}%`;
  if (playerTime) {
    playerTime.textContent = `${formatTime(currentAudio.currentTime)} / ${formatTime(currentAudio.duration)}`;
  }
}

/** Retire TOUTES les marques de lecture (boutons ⏹ des tableaux, des cartes
 *  Années/Doublons et du panneau playlist — tous portent `.play-btn` — et glow
 *  `.led-playing`). Un seul point de nettoyage pour les 5 points d'entrée. */
function clearPlayingMarks(): void {
  document.querySelectorAll('.play-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.textContent = '▶';
  });
  for (const el of document.querySelectorAll('.led-playing')) el.classList.remove('led-playing');
}

/** Libère un élément audio : handlers détachés, pause, source vidée (le serveur
 *  streame `/audio` — `pause()` seul laissait une connexion vivante). */
function releaseAudio(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.ontimeupdate = null;
  el.onloadedmetadata = null;
  el.onended = null;
  el.onerror = null;
  el.pause();
  el.src = '';
}

export function stopPlayer(): void {
  playSeq++;
  releaseAudio(currentAudio);
  currentAudio = null;
  playerFullpath = '';
  if (playerBar) playerBar.classList.add('hidden');
  clearPlayingMarks();
  emit('audio:changed');
}

function showPlayer(filename: string, fullpath: string): void {
  _playerFilename = filename;
  playerFullpath = fullpath;
  if (playerFilenameEl) {
    playerFilenameEl.textContent = filename.length > 30 ? `${filename.slice(0, 27)}...` : filename;
  }
  if (playerTime) playerTime.textContent = '0:00 / 0:00';
  if (playerProgressFill) playerProgressFill.style.width = '0%';
  if (playerBar) playerBar.classList.remove('hidden');
}

export function togglePlay(filename: string, fullpath: string, btn: HTMLElement): void {
  // Même fichier — en lecture OU en cours de chargement (EPIC-038 : avant, ce
  // cas relançait un 2ᵉ élément tant que le `.play()` n'avait pas résolu).
  if (currentAudio && fullpath === playerFullpath) {
    stopPlayer();
    return;
  }

  playSeq++;
  const seq = playSeq;
  releaseAudio(currentAudio); // l'ancien meurt AVANT le nouveau (jamais deux flux)
  currentAudio = null;
  clearPlayingMarks();

  const audio = new Audio(`/audio?path=${encodeURIComponent(fullpath)}`);
  audio.volume = 1.0;
  // Référence maître SYNCHRONE : tout clic suivant voit immédiatement ce fichier.
  currentAudio = audio;
  playerFullpath = fullpath;

  const isCurrent = (): boolean => seq === playSeq && currentAudio === audio;

  audio.ontimeupdate = () => {
    if (isCurrent()) updatePlayerUI();
  };
  audio.onloadedmetadata = () => {
    if (isCurrent()) updatePlayerUI();
  };
  audio.onended = () => {
    if (!isCurrent()) return;
    releaseAudio(audio);
    currentAudio = null;
    playerFullpath = '';
    if (playerBar) playerBar.classList.add('hidden');
    clearPlayingMarks();
    emit('audio:changed');
  };
  audio.onerror = () => {
    if (!isCurrent()) return;
    releaseAudio(audio);
    currentAudio = null;
    playerFullpath = '';
    btn.classList.remove('playing');
    btn.textContent = '▶';
    if (playerBar) playerBar.classList.add('hidden');
    clearPlayingMarks();
    emit('audio:changed');
  };

  audio
    .play()
    .then(() => {
      if (!isCurrent()) return; // promesse périmée : aucun effet (EPIC-038)
      clearPlayingMarks();
      btn.classList.add('playing');
      btn.textContent = '⏹';
      showPlayer(filename, fullpath);
      const row = btn.closest('.file-row');
      if (row) {
        const fileSpan = row.querySelector('.file');
        if (fileSpan) fileSpan.classList.add('led-playing');
      }
      emit('audio:changed');
    })
    .catch((err: unknown) => {
      if (!isCurrent()) return;
      releaseAudio(audio);
      currentAudio = null;
      playerFullpath = '';
      btn.classList.remove('playing');
      btn.textContent = '▶';
      if (playerBar) playerBar.classList.add('hidden');
      clearPlayingMarks();
      console.error('Audio play failed:', err instanceof Error ? err.message : String(err));
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? "🔇 Son bloqué — clique d'abord sur la page pour débloquer l'audio."
          : `🔇 Erreur lecture : ${err instanceof Error ? err.message : String(err)}`;
      setStatus(msg);
    });
}

export function seekAudio(delta: number): void {
  if (!currentAudio?.duration) return;
  const step = playerStep ? parseInt(playerStep.value, 10) || 20 : 20;
  currentAudio.currentTime = Math.max(0, Math.min(currentAudio.duration, currentAudio.currentTime + delta * step));
  updatePlayerUI();
}

export function isAudioPlaying(): boolean | null {
  const val = currentAudio && !currentAudio.paused;
  return val as boolean | null;
}

/** Chemin en lecture (ou null) — les pages à cartes re-rendues (Années,
 * Doublons) ré-marquent leur bouton ▶ après chaque render. */
export function playingPath(): string | null {
  return currentAudio ? playerFullpath : null;
}

export function initAudioUI(): void {
  const stopBtn = document.getElementById('player-stop');
  if (stopBtn) stopBtn.onclick = stopPlayer;

  const progressEl = document.getElementById('player-progress');
  if (progressEl) {
    progressEl.onclick = (e: MouseEvent) => {
      if (!currentAudio?.duration) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      currentAudio.currentTime = ((e.clientX - rect.left) / rect.width) * currentAudio.duration;
      updatePlayerUI();
    };
  }

  const bwdBtn = document.getElementById('player-seek-bwd');
  if (bwdBtn) bwdBtn.onclick = () => seekAudio(-1);
  const fwdBtn = document.getElementById('player-seek-fwd');
  if (fwdBtn) fwdBtn.onclick = () => seekAudio(1);
}
