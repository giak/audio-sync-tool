import { state } from "./state.js";
import { stopPlayer, seekAudio, isAudioPlaying, initAudioUI } from "./audio.js";
import { setActivePanel, navigateFocus, navigateColumn, getFocusedItem, getItems, revalidateFocus } from "./focus.js";
import { openModal, closeAllModals, openFilterPalette, closeFilterPalette, initFilterPalette, showError } from "./ui.js";
import { renderSource, renderJournal, renderPlaylistPanel, renderPlaylistSource, renderPlaylistManager, patchPlaylistSourceFile } from "./render.js";
import { initConfigUI, runScan, executeCopy, initApp } from "./actions.js";
import { loadPlaylists, createNewPlaylist, savePlaylist, exportPlaylist, addTrack, removeTrack, reorderTrack, getPendingTracks, getActivePlaylistName, setPendingTracks } from "./playlist.js";
function togglePlaylistFocus() {
  const newFocus = state.playlistFocus === "source" ? "sidebar" : "source";
  state.playlistFocus = newFocus;
  const sourceEl = document.getElementById("playlist-source");
  const sidebarEl = document.getElementById("playlist-sidebar");
  if (newFocus === "sidebar") {
    sourceEl?.classList.remove("panel-active");
    sidebarEl?.classList.add("panel-active");
  } else {
    sidebarEl?.classList.remove("panel-active");
    sourceEl?.classList.add("panel-active");
  }
}
function toggleTrackInPlaylist() {
  const container = document.getElementById("playlist-source-container");
  if (!container) return;
  const focused = container.querySelector(".focused");
  if (!focused || !focused.classList.contains("file-row")) return;
  const label = focused.querySelector(".file");
  const filename = label?.textContent || "";
  const fullPath = label?.dataset?.fullpath || "";
  if (!fullPath) return;
  const activeName = getActivePlaylistName();
  const track = {
    filename,
    fullPath,
    relPath: fullPath,
    year: focused.querySelector(".year")?.textContent || null,
    duration: parseInt(focused.dataset.durationSeconds || "", 10) || null,
    codec: focused.querySelector(".codec")?.textContent || null
  };
  const added = addTrack(activeName, track);
  if (added) {
    label?.classList.add("in-playlist");
    showToast(`\u2795 ${filename} ajout\xE9`);
  } else {
    removeTrack(activeName, fullPath);
    label?.classList.remove("in-playlist");
    showToast(`\u2796 ${filename} retir\xE9`);
  }
  renderPlaylistPanel();
}
async function saveCurrentPlaylist() {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  if (tracks.length === 0) {
    showToast("\u26A0\uFE0F Playlist vide, rien \xE0 sauvegarder");
    return;
  }
  try {
    await savePlaylist(name, tracks);
    showToast(`\u{1F4BE} Playlist "${name}" sauvegard\xE9e (${tracks.length} morceaux)`);
  } catch (err) {
    showError(`\xC9chec de la sauvegarde : ${err instanceof Error ? err.message : String(err)}`);
  }
}
async function showExportModal() {
  const name = getActivePlaylistName();
  const tracks = getPendingTracks(name);
  if (tracks.length === 0) {
    showToast("\u26A0\uFE0F Playlist vide, rien \xE0 exporter");
    return;
  }
  const savedPl = state.playlists.find((p) => p.name === name);
  let existingWarning = "";
  if (savedPl?.exported && savedPl.exportedDir) {
    existingWarning = " (\u26A0\uFE0F l'export pr\xE9c\xE9dent sera \xE9cras\xE9)";
  }
  const dialogMsg = document.getElementById("dialog-msg");
  const confirmBtn = document.getElementById("dialog-confirm");
  const cancelBtn = document.getElementById("dialog-cancel");
  if (dialogMsg) {
    dialogMsg.innerHTML = `
      Exporter la playlist <strong>"${escapeHtml(name)}"</strong> ?<br>
      ${tracks.length} morceau${tracks.length > 1 ? "x" : ""}${existingWarning}
    `;
  }
  if (confirmBtn) confirmBtn.textContent = "\u{1F4E6} Exporter";
  if (cancelBtn) cancelBtn.textContent = "Annuler";
  openModal("dialog");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      closeAllModals();
      await savePlaylist(name, tracks);
      const res = await exportPlaylist(name);
      if (res.ok) {
        showToast(`\u{1F4E6} Playlist "${name}" export\xE9e \u2014 ${String(res.count)} morceaux dans ${String(res.dir)}`);
        if (res.fallback === "copy") {
          showToast(`\u26A0\uFE0F ${String(res.warning || "Copie physique utilis\xE9e")}`);
        }
      } else if (res.missing) {
        showToast(`\u274C Fichiers manquants : ${String(res.missing.join(", "))}`);
      } else {
        showToast(`\u274C Erreur : ${String(res.error || "Export \xE9chou\xE9")}`);
      }
    };
  }
  if (cancelBtn) cancelBtn.onclick = closeAllModals;
}
function moveTrackInPlaylist(direction) {
  const name = getActivePlaylistName();
  const focused = document.querySelector("#playlist-tracks .focused");
  if (!focused) return;
  const parent = focused.parentNode;
  if (!parent) return;
  const items = Array.from(parent.children);
  const index = items.indexOf(focused);
  if (index === -1) return;
  reorderTrack(name, index, index + direction);
  renderPlaylistPanel();
}
function showToast(msg) {
  const el = document.getElementById("status-text");
  if (!el) return;
  el.textContent = msg;
  clearTimeout(el._toastTimer);
  el._toastTimer = setTimeout(() => {
    if (state.playlistMode) {
      el.textContent = "\u{1F3B5} Mode Playlist \u2014 Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.";
    }
  }, 3e3);
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
async function enterPlaylistMode() {
  await loadPlaylists();
  state.playlistMode = true;
  state.playlistFocus = "source";
  document.getElementById("main-panels")?.classList.add("hidden");
  document.getElementById("playlist-layout")?.classList.remove("hidden");
  if (state.playlists.length === 0 && Object.keys(state.pendingPlaylists).length === 0) {
    createNewPlaylist("playlist-1");
    state.activePlaylistIndex = 0;
  } else if (state.playlists.length > 0) {
    for (const pl of state.playlists) {
      if (!state.pendingPlaylists[pl.name]) {
        setPendingTracks(pl.name, [...pl.tracks]);
      }
    }
    state.activePlaylistIndex = 0;
  }
  renderPlaylistSource();
  renderPlaylistPanel();
  document.getElementById("playlist-source")?.classList.add("panel-active");
  const statusText = document.getElementById("status-text");
  if (statusText) statusText.textContent = "\u{1F3B5} Mode Playlist \u2014 Espace pour ajouter/retirer, Ctrl+S pour sauvegarder.";
}
async function exitPlaylistMode() {
  const savePromises = [];
  for (const [name, tracks] of Object.entries(state.pendingPlaylists)) {
    if (tracks.length > 0) {
      savePromises.push(savePlaylist(name, tracks));
    }
  }
  await Promise.all(savePromises);
  state.playlistMode = false;
  document.getElementById("playlist-layout")?.classList.add("hidden");
  document.getElementById("main-panels")?.classList.remove("hidden");
  const statusText = document.getElementById("status-text");
  if (statusText) statusText.textContent = "Pr\xEAt.";
}
document.addEventListener("keydown", (e) => {
  if (state.activeModal === "dialog") {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAllModals();
    }
    return;
  }
  if (state.activeModal) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAllModals();
    }
    return;
  }
  if (state.filterActive && document.activeElement?.id === "source-filter") {
    if (e.key === "Escape") {
      e.preventDefault();
      closeFilterPalette(renderSource);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      closeFilterPalette(renderSource);
      setActivePanel("source");
    } else if (e.key === "Tab") {
      e.preventDefault();
      closeFilterPalette(renderSource);
      setActivePanel("epars");
    }
    return;
  }
  const target = e.target;
  const isInput = target ? ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) : false;
  if (state.playlistMode) {
    if (e.key === "Escape") {
      e.preventDefault();
      exitPlaylistMode();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      togglePlaylistFocus();
      return;
    }
    if (e.key === " " && !isInput) {
      e.preventDefault();
      if (state.playlistFocus === "source") {
        toggleTrackInPlaylist();
      }
      return;
    }
    if ((e.key === "F7" || e.key === "/") && !isInput) {
      e.preventDefault();
      openFilterPalette((_p) => {
      }, renderPlaylistSource);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !isInput && state.playlistFocus === "sidebar") {
      e.preventDefault();
      const focused = document.querySelector("#playlist-tracks .focused");
      if (focused) {
        const removeBtn = focused.querySelector(".pl-track-remove");
        if (removeBtn) {
          const fullPath = removeBtn.dataset.fullpath || "";
          removeBtn.click();
          patchPlaylistSourceFile(fullPath, true);
        }
      }
      return;
    }
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      saveCurrentPlaylist();
      return;
    }
    if (e.ctrlKey && e.key === "e") {
      e.preventDefault();
      showExportModal();
      return;
    }
    if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !isInput) {
      e.preventDefault();
      moveTrackInPlaylist(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !isInput) {
      e.preventDefault();
      if (state.playlistFocus === "source") {
        const container2 = document.getElementById("playlist-source-container");
        if (container2) navigateFocus(container2, e.key === "ArrowDown" ? 1 : -1);
      } else if (state.playlistFocus === "sidebar") {
        const tracks = document.querySelectorAll("#playlist-tracks .pl-track");
        if (tracks.length === 0) return;
        const current = document.querySelector("#playlist-tracks .focused");
        let idx = 0;
        if (current) {
          idx = Array.from(tracks).indexOf(current);
          if (idx === -1) idx = 0;
        }
        tracks.forEach((t) => t.classList.remove("focused"));
        const newIdx = Math.max(0, Math.min(tracks.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)));
        tracks[newIdx].classList.add("focused");
        tracks[newIdx].scrollIntoView({ block: "nearest" });
      }
      return;
    }
    if (e.key === "Enter" && !isInput && state.playlistFocus === "source") {
      e.preventDefault();
      const container2 = document.getElementById("playlist-source-container");
      if (!container2) return;
      const focused = getFocusedItem(container2);
      if (focused?.classList.contains("file-row")) {
        focused.querySelector(".play-btn")?.click();
      } else if (focused?.classList.contains("directory")) {
        focused.click();
      }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (isAudioPlaying()) {
        seekAudio(e.key === "ArrowRight" ? 1 : -1);
      }
      e.preventDefault();
      return;
    }
  }
  if (e.key === "F5") {
    e.preventDefault();
    executeCopy();
    return;
  }
  if (e.key === "F7" || e.key === "/" && !isInput) {
    e.preventDefault();
    openFilterPalette(setActivePanel, renderSource);
    return;
  }
  if (e.key === "Escape") {
    if (state.filterActive) {
      e.preventDefault();
      closeFilterPalette(renderSource);
      return;
    }
    if (isAudioPlaying()) {
      e.preventDefault();
      stopPlayer();
      return;
    }
    return;
  }
  if (isInput) return;
  if (isAudioPlaying() && e.shiftKey) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekAudio(-1);
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      seekAudio(1);
      return;
    }
  }
  if (e.key === "Tab") {
    e.preventDefault();
    setActivePanel(state.activePanel === "source" ? "epars" : "source");
    return;
  }
  const container = state.activePanel === "source" ? document.getElementById("source-container") : document.getElementById("epars-container");
  if (!container) return;
  const items = getItems(container);
  if (items.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    navigateFocus(container, 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    navigateFocus(container, -1);
  } else if (e.key === "ArrowLeft" && state.activePanel === "source") {
    e.preventDefault();
    navigateColumn(container, -1);
  } else if (e.key === "ArrowRight" && state.activePanel === "source") {
    e.preventDefault();
    navigateColumn(container, 1);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
  } else if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const el = getFocusedItem(container);
    if (!el) return;
    if (el.classList.contains("file-row")) {
      if (e.key === "Enter") {
        el.querySelector(".play-btn")?.click();
      } else if (e.key === " " && state.activePanel === "epars") {
        el.querySelector(".file.nouveau")?.click();
      }
    } else if (el.classList.contains("directory") && state.activePanel === "source") {
      el.click();
    }
  }
});
document.getElementById("btn-config").onclick = () => openModal("config");
document.getElementById("btn-legend").onclick = () => openModal("legend");
document.getElementById("btn-journal").onclick = () => {
  renderJournal();
  openModal("journal");
};
document.getElementById("btn-scan").onclick = runScan;
document.getElementById("pl-manage").onclick = () => {
  renderPlaylistManager();
  openModal("playlists");
};
document.getElementById("btn-playlist").onclick = async () => {
  if (state.playlistMode) {
    exitPlaylistMode();
  } else {
    await enterPlaylistMode();
  }
};
document.getElementById("panel-left").onclick = () => setActivePanel("epars");
document.getElementById("panel-right").onclick = () => setActivePanel("source");
document.addEventListener("click", (e) => {
  const target = e.target;
  if (target?.classList.contains("modal-backdrop")) closeAllModals();
  if (target?.classList.contains("modal-close")) closeAllModals();
});
initFilterPalette(() => {
  renderSource();
  revalidateFocus();
});
initAudioUI();
initConfigUI();
initApp();
