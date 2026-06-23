import { state } from "./state.js";
import { api } from "./api.js";
import { openModal, closeAllModals, showError } from "./ui.js";
import { renderAll, renderSource, patchEparsFileAfterCopy, patchSourceFileAfterCopy } from "./render.js";
import { setActivePanel, revalidateFocus } from "./focus.js";
let configData = { active: 0, configs: [] };
const cfgSelect = document.getElementById("cfg-select");
const cfgName = document.getElementById("cfg-name");
const cfgSource = document.getElementById("cfg-source");
const cfgEpars = document.getElementById("cfg-epars");
const cfgStatus = document.getElementById("config-status");
function renderConfigSelect() {
  if (!cfgSelect) return;
  const prev = cfgSelect.value;
  cfgSelect.innerHTML = "";
  configData.configs.forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = c.name || `config-${i}`;
    cfgSelect.appendChild(opt);
  });
  cfgSelect.value = parseInt(prev, 10) < configData.configs.length ? prev : "0";
  loadActiveConfig();
}
function loadActiveConfig() {
  const idx = parseInt(cfgSelect?.value || "0") || 0;
  const c = configData.configs[idx];
  if (c) {
    if (cfgName) cfgName.value = c.name || "";
    if (cfgSource) cfgSource.value = c.source_data || "";
    if (cfgEpars) cfgEpars.value = (c.epars_dirs || []).join("\n");
  }
}
function initConfigUI() {
  if (cfgSelect) cfgSelect.onchange = loadActiveConfig;
  const addBtn = document.getElementById("btn-add-config");
  if (addBtn) {
    addBtn.onclick = () => {
      configData.configs.push({ name: "nouveau", source_data: "", epars_dirs: [] });
      configData.active = configData.configs.length - 1;
      renderConfigSelect();
      if (cfgSelect) cfgSelect.value = String(configData.active);
      loadActiveConfig();
      if (cfgName) cfgName.focus();
    };
  }
  const delBtn = document.getElementById("btn-del-config");
  if (delBtn) {
    delBtn.onclick = () => {
      if (configData.configs.length <= 1) {
        if (cfgStatus) cfgStatus.textContent = "\u26A0\uFE0F Impossible de supprimer le dernier profil";
        return;
      }
      const idx = parseInt(cfgSelect?.value || "0") || 0;
      configData.configs.splice(idx, 1);
      configData.active = Math.min(idx, configData.configs.length - 1);
      renderConfigSelect();
    };
  }
  const saveBtn = document.getElementById("btn-save-config");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const idx = parseInt(cfgSelect?.value || "0") || 0;
      configData.configs[idx] = {
        name: (cfgName?.value || "").trim() || `config-${idx}`,
        source_data: (cfgSource?.value || "").trim(),
        epars_dirs: (cfgEpars?.value || "").split("\n").map((s) => s.trim()).filter(Boolean)
      };
      configData.active = idx;
      await api("/config", { method: "POST", body: JSON.stringify(configData) });
      if (cfgStatus) cfgStatus.textContent = "\u2713 Profil sauvegard\xE9";
      renderConfigSelect();
    };
  }
}
async function runScan() {
  const btn = document.getElementById("btn-scan");
  const progressBar = document.getElementById("scan-progress");
  const progressFill = document.getElementById("scan-progress-fill");
  const progressText = document.getElementById("scan-progress-text");
  const statusText = document.getElementById("status-text");
  if (btn) btn.disabled = true;
  if (btn) btn.classList.add("scanning");
  if (progressBar) progressBar.classList.remove("hidden");
  if (progressFill) progressFill.style.width = "0%";
  if (progressText) progressText.textContent = "\u{1F50D} Pr\xE9paration\u2026";
  if (statusText) statusText.textContent = "Scan en cours\u2026";
  let pollTimer = setInterval(async () => {
    try {
      const p = await api("/scan-progress");
      if (!p.running) {
        clearInterval(pollTimer);
        return;
      }
      const pct = p.total > 0 ? Math.round(p.current / p.total * 100) : 0;
      if (progressFill) progressFill.style.width = Math.min(pct, 100) + "%";
      if (progressText) progressText.textContent = `${p.phase || "\u2026"} : ${p.current} / ${p.total} (${pct}%)`;
      if (statusText) statusText.textContent = `\u{1F50D} Scan ${p.phase ? p.phase.toLowerCase() : "\u2026"} \u2014 ${p.current}/${p.total}`;
    } catch (_) {
    }
  }, 400);
  let scanFailed = false;
  try {
    const data = await api("/scan");
    state.sourceFiles = data.source || {};
    state.eparsFiles = data.epars || {};
    state.journal = await api("/journal");
    renderAll();
  } catch (err) {
    scanFailed = true;
    showError(`Scan \xE9chou\xE9 : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearInterval(pollTimer);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("scanning");
    }
    if (progressBar) progressBar.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
    if (!scanFailed) {
      const totalFiles = Object.values(state.sourceFiles).reduce((s, f) => s + Object.keys(f).length, 0) + Object.values(state.eparsFiles).reduce((s, f) => s + Object.keys(f).length, 0);
      if (statusText) statusText.textContent = `Scan termin\xE9 \u2014 ${totalFiles.toLocaleString("fr")} fichiers`;
    }
  }
}
function executeCopy() {
  const leftFocus = document.querySelector("#epars-container .focused .file");
  const rightFocus = document.querySelector("#source-container .focused.directory");
  const statusText = document.getElementById("status-text");
  if (!leftFocus) {
    if (statusText) statusText.textContent = "Met d'abord en surbrillance un fichier \xE0 gauche (\u2191\u2193).";
    return;
  }
  if (!rightFocus) {
    if (statusText) statusText.textContent = "Met d'abord en surbrillance un dossier \xE0 droite (Tab puis \u2191\u2193).";
    return;
  }
  if (!leftFocus.dataset.epardir) {
    if (statusText) statusText.textContent = "Ce fichier n'a pas de dossier source valide.";
    return;
  }
  const filename = leftFocus.dataset.filename || "";
  const eparDir = leftFocus.dataset.epardir;
  const relPath = state.eparsFiles[eparDir]?.[filename]?.path;
  if (!relPath) {
    if (statusText) statusText.textContent = "Fichier introuvable dans les donn\xE9es scann\xE9es.";
    return;
  }
  const fullSrc = eparDir + "/" + relPath;
  const destDir = rightFocus.dataset.dirpath || "";
  const dialogMsg = document.getElementById("dialog-msg");
  if (dialogMsg) dialogMsg.textContent = `Copier "${filename}" vers "${destDir}" ?`;
  openModal("dialog");
  const confirmBtn = document.getElementById("dialog-confirm");
  const cancelBtn = document.getElementById("dialog-cancel");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      closeAllModals();
      try {
        const res = await api("/copy", {
          method: "POST",
          body: JSON.stringify({ source_path: fullSrc, dest_dir: destDir, filename })
        });
        state.journal = await api("/journal");
        let relPathNew = filename;
        const sourceDir = Object.keys(state.sourceFiles).find((dir) => destDir === dir || destDir.startsWith(dir + "/"));
        if (sourceDir && destDir.startsWith(sourceDir)) {
          const rel = destDir.substring(sourceDir.length).replace(/^\/+/, "");
          relPathNew = rel ? rel + "/" + filename : filename;
          if (!state.sourceFiles[sourceDir]) state.sourceFiles[sourceDir] = {};
          state.sourceFiles[sourceDir][filename] = { path: relPathNew, year: res.year ?? null, duration: res.duration ?? null, codec: res.codec ?? null };
        }
        patchEparsFileAfterCopy(filename, eparDir);
        if (!patchSourceFileAfterCopy(
          destDir,
          filename,
          { path: relPathNew, year: res.year ?? null, duration: res.duration ?? null, codec: res.codec ?? null }
        )) {
          renderSource();
        }
        requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
        if (statusText) statusText.textContent = `\u2713 ${filename} copi\xE9 vers ${destDir}`;
      } catch (err) {
        showError(`\xC9chec de la copie : ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }
  if (cancelBtn) cancelBtn.onclick = () => closeAllModals();
}
async function initApp() {
  try {
    const [config, cache, journal] = await Promise.all([
      api("/config"),
      api("/load"),
      api("/journal")
    ]);
    configData = config;
    if (!configData.configs || configData.configs.length === 0) {
      configData = { active: 0, configs: [{ name: "default", source_data: "", epars_dirs: [] }] };
    }
    renderConfigSelect();
    state.journal = journal || [];
    if (cache && cache.source && Object.keys(cache.source).length > 0) {
      state.sourceFiles = cache.source || {};
      state.eparsFiles = cache.epars || {};
    }
    renderAll();
    setActivePanel("epars");
    const statusText = document.getElementById("status-text");
    if (statusText) statusText.textContent = "Pr\xEAt. Configure les dossiers puis lance Scan.";
  } catch (err) {
    console.error("Init failed:", err);
    const statusText = document.getElementById("status-text");
    if (statusText) statusText.textContent = "Erreur de connexion au serveur.";
  }
}
export {
  configData,
  executeCopy,
  initApp,
  initConfigUI,
  renderConfigSelect,
  runScan
};
