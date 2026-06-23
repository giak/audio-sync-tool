// ─── Audio player + player bar UI ──────────────────────────────────────────
import { formatTime } from './utils.js';

let currentAudio = null;
let playerFilename = '';
let playerFullpath = '';

const playerBar = document.getElementById('player-bar');
const playerFilenameEl = document.getElementById('player-filename');
const playerProgressFill = document.getElementById('player-progress-fill');
const playerTime = document.getElementById('player-time');
const playerStep = document.getElementById('player-step');

function updatePlayerUI() {
  if (!currentAudio || !currentAudio.duration) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100;
  playerProgressFill.style.width = pct + '%';
  playerTime.textContent = `${formatTime(currentAudio.currentTime)} / ${formatTime(currentAudio.duration)}`;
}

export function stopPlayer() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  playerBar.classList.add('hidden');
  document.querySelectorAll('.play-btn.playing').forEach(b => {
    b.classList.remove('playing'); b.textContent = '▶';
  });
  document.querySelectorAll('.led-playing').forEach(l => l.classList.remove('led-playing'));
}

function showPlayer(filename, fullpath) {
  playerFilename = filename;
  playerFullpath = fullpath;
  playerFilenameEl.textContent = filename.length > 30 ? filename.slice(0, 27) + '...' : filename;
  playerTime.textContent = '0:00 / 0:00';
  playerProgressFill.style.width = '0%';
  playerBar.classList.remove('hidden');
}

export function togglePlay(filename, fullpath, btn) {
  if (currentAudio && !currentAudio.paused) {
    if (fullpath === playerFullpath) { stopPlayer(); return; }
    currentAudio.pause();
    currentAudio = null;
    document.querySelectorAll('.play-btn.playing').forEach(b => {
      b.classList.remove('playing'); b.textContent = '▶';
    });
    document.querySelectorAll('.led-playing').forEach(l => l.classList.remove('led-playing'));
  }
  const audio = new Audio('/audio?path=' + encodeURIComponent(fullpath));
  let started = false;

  audio.ontimeupdate = () => {
    if (!started && audio.duration) started = true;
    updatePlayerUI();
  };
  audio.onloadedmetadata = () => { updatePlayerUI(); };
  audio.onended = () => {
    if (currentAudio === audio) {
      document.querySelectorAll('.play-btn.playing').forEach(b => {
        b.classList.remove('playing'); b.textContent = '▶';
      });
      currentAudio = null;
      playerBar.classList.add('hidden');
    }
  };
  audio.onerror = () => {
    btn.classList.remove('playing'); btn.textContent = '▶';
    if (currentAudio === audio) { currentAudio = null; playerBar.classList.add('hidden'); }
  };

  audio.play().then(() => {
    currentAudio = audio;
    document.querySelectorAll('.play-btn.playing').forEach(b => {
      b.classList.remove('playing'); b.textContent = '▶';
    });
    document.querySelectorAll('.led-playing').forEach(l => l.classList.remove('led-playing'));
    btn.classList.add('playing'); btn.textContent = '⏹';
    showPlayer(filename, fullpath);
    const row = btn.closest('.file-row');
    if (row) {
      const fileSpan = row.querySelector('.file');
      if (fileSpan) fileSpan.classList.add('led-playing');
    }
  }).catch(() => {
    btn.classList.remove('playing'); btn.textContent = '▶';
    playerBar.classList.add('hidden');
  });
}

export function seekAudio(delta) {
  if (!currentAudio || !currentAudio.duration) return;
  const step = parseInt(playerStep.value) || 20;
  currentAudio.currentTime = Math.max(0, Math.min(currentAudio.duration, currentAudio.currentTime + delta * step));
  updatePlayerUI();
}

export function isAudioPlaying() {
  return currentAudio && !currentAudio.paused;
}

export function initAudioUI() {
  document.getElementById('player-stop').onclick = stopPlayer;
  document.getElementById('player-progress').onclick = (e) => {
    if (!currentAudio || !currentAudio.duration) return;
    const rect = e.target.getBoundingClientRect();
    currentAudio.currentTime = ((e.clientX - rect.left) / rect.width) * currentAudio.duration;
    updatePlayerUI();
  };
  document.getElementById('player-seek-bwd').onclick = () => seekAudio(-1);
  document.getElementById('player-seek-fwd').onclick = () => seekAudio(1);
}
