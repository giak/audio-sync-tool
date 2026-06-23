import { formatTime } from "./utils.js";
let currentAudio = null;
let playerFilename = "";
let playerFullpath = "";
const playerBar = document.getElementById("player-bar");
const playerFilenameEl = document.getElementById("player-filename");
const playerProgressFill = document.getElementById("player-progress-fill");
const playerTime = document.getElementById("player-time");
const playerStep = document.getElementById("player-step");
function updatePlayerUI() {
  if (!currentAudio || !currentAudio.duration) return;
  const pct = currentAudio.currentTime / currentAudio.duration * 100;
  if (playerProgressFill) playerProgressFill.style.width = pct + "%";
  if (playerTime) {
    playerTime.textContent = `${formatTime(currentAudio.currentTime)} / ${formatTime(currentAudio.duration)}`;
  }
}
function stopPlayer() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (playerBar) playerBar.classList.add("hidden");
  document.querySelectorAll(".play-btn.playing").forEach((b) => {
    b.classList.remove("playing");
    b.textContent = "\u25B6";
  });
  document.querySelectorAll(".led-playing").forEach((l) => l.classList.remove("led-playing"));
}
function showPlayer(filename, fullpath) {
  playerFilename = filename;
  playerFullpath = fullpath;
  if (playerFilenameEl) {
    playerFilenameEl.textContent = filename.length > 30 ? filename.slice(0, 27) + "..." : filename;
  }
  if (playerTime) playerTime.textContent = "0:00 / 0:00";
  if (playerProgressFill) playerProgressFill.style.width = "0%";
  if (playerBar) playerBar.classList.remove("hidden");
}
function togglePlay(filename, fullpath, btn) {
  if (currentAudio && !currentAudio.paused) {
    if (fullpath === playerFullpath) {
      stopPlayer();
      return;
    }
    currentAudio.pause();
    currentAudio = null;
    document.querySelectorAll(".play-btn.playing").forEach((b) => {
      b.classList.remove("playing");
      b.textContent = "\u25B6";
    });
    document.querySelectorAll(".led-playing").forEach((l) => l.classList.remove("led-playing"));
  }
  const audio = new Audio("/audio?path=" + encodeURIComponent(fullpath));
  let started = false;
  audio.ontimeupdate = () => {
    if (!started && audio.duration) started = true;
    updatePlayerUI();
  };
  audio.onloadedmetadata = () => {
    updatePlayerUI();
  };
  audio.onended = () => {
    if (currentAudio === audio) {
      document.querySelectorAll(".play-btn.playing").forEach((b) => {
        b.classList.remove("playing");
        b.textContent = "\u25B6";
      });
      currentAudio = null;
      if (playerBar) playerBar.classList.add("hidden");
    }
  };
  audio.onerror = () => {
    btn.classList.remove("playing");
    btn.textContent = "\u25B6";
    if (currentAudio === audio) {
      currentAudio = null;
      if (playerBar) playerBar.classList.add("hidden");
    }
  };
  audio.play().then(() => {
    currentAudio = audio;
    document.querySelectorAll(".play-btn.playing").forEach((b) => {
      b.classList.remove("playing");
      b.textContent = "\u25B6";
    });
    document.querySelectorAll(".led-playing").forEach((l) => l.classList.remove("led-playing"));
    btn.classList.add("playing");
    btn.textContent = "\u23F9";
    showPlayer(filename, fullpath);
    const row = btn.closest(".file-row");
    if (row) {
      const fileSpan = row.querySelector(".file");
      if (fileSpan) fileSpan.classList.add("led-playing");
    }
  }).catch(() => {
    btn.classList.remove("playing");
    btn.textContent = "\u25B6";
    if (playerBar) playerBar.classList.add("hidden");
  });
}
function seekAudio(delta) {
  if (!currentAudio || !currentAudio.duration) return;
  const step = playerStep ? parseInt(playerStep.value) || 20 : 20;
  currentAudio.currentTime = Math.max(0, Math.min(currentAudio.duration, currentAudio.currentTime + delta * step));
  updatePlayerUI();
}
function isAudioPlaying() {
  const val = currentAudio && !currentAudio.paused;
  return val;
}
function initAudioUI() {
  const stopBtn = document.getElementById("player-stop");
  if (stopBtn) stopBtn.onclick = stopPlayer;
  const progressEl = document.getElementById("player-progress");
  if (progressEl) {
    progressEl.onclick = (e) => {
      if (!currentAudio || !currentAudio.duration) return;
      const rect = e.target.getBoundingClientRect();
      currentAudio.currentTime = (e.clientX - rect.left) / rect.width * currentAudio.duration;
      updatePlayerUI();
    };
  }
  const bwdBtn = document.getElementById("player-seek-bwd");
  if (bwdBtn) bwdBtn.onclick = () => seekAudio(-1);
  const fwdBtn = document.getElementById("player-seek-fwd");
  if (fwdBtn) fwdBtn.onclick = () => seekAudio(1);
}
export {
  initAudioUI,
  isAudioPlaying,
  seekAudio,
  stopPlayer,
  togglePlay
};
