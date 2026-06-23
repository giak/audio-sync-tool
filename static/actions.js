// ─── Business operations: scan, copy, config, init ───────────────────────
import { state } from './state.js';
import { api } from './api.js';
import { openModal, closeAllModals } from './ui.js';
import { renderAll, renderSource, patchEparsFileAfterCopy, patchSourceFileAfterCopy } from './render.js';
import { setActivePanel, revalidateFocus } from './focus.js';

// ── Config ────────────────────────────────────────────────────────────────
export let configData = { active: 0, configs: [] };

const cfgSelect = document.getElementById('cfg-select');
const cfgName = document.getElementById('cfg-name');
const cfgSource = document.getElementById('cfg-source');
const cfgEpars = document.getElementById('cfg-epars');
const cfgStatus = document.getElementById('config-status');

export function renderConfigSelect() {
  if (!cfgSelect) return;
  const prev = cfgSelect.value;
  cfgSelect.innerHTML = '';
  configData.configs.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = c.name || `config-${i}`;
    cfgSelect.appendChild(opt);
  });
  cfgSelect.value = prev < configData.configs.length ? prev : '0';
  loadActiveConfig();
}

function loadActiveConfig() {
  const idx = parseInt(cfgSelect.value) || 0;
  const c = configData.configs[idx];
  if (c) {
    cfgName.value = c.name || '';
    cfgSource.value = c.source_data || '';
    cfgEpars.value = (c.epars_dirs || []).join('\n');
  }
}

export function initConfigUI() {
  cfgSelect.onchange = loadActiveConfig;
  document.getElementById('btn-add-config').onclick = () => {
    configData.configs.push({ name: 'nouveau', source_data: '', epars_dirs: [] });
    configData.active = configData.configs.length - 1;
    renderConfigSelect();
    cfgSelect.value = configData.active;
    loadActiveConfig();
    cfgName.focus();
  };
  document.getElementById('btn-del-config').onclick = () => {
    if (configData.configs.length <= 1) {
      cfgStatus.textContent = '⚠️ Impossible de supprimer le dernier profil';
      return;
    }
    const idx = parseInt(cfgSelect.value);
    configData.configs.splice(idx, 1);
    configData.active = Math.min(idx, configData.configs.length - 1);
    renderConfigSelect();
  };
  document.getElementById('btn-save-config').onclick = async () => {
    const idx = parseInt(cfgSelect.value) || 0;
    configData.configs[idx] = {
      name: cfgName.value.trim() || `config-${idx}`,
      source_data: cfgSource.value.trim(),
      epars_dirs: cfgEpars.value.split('\n').map(s => s.trim()).filter(Boolean)
    };
    configData.active = idx;
    await api('/config', { method: 'POST', body: JSON.stringify(configData) });
    cfgStatus.textContent = '✓ Profil sauvegardé';
    renderConfigSelect();
  };
}

// ── Scan ──────────────────────────────────────────────────────────────────
export async function runScan() {
  document.getElementById('status-text').textContent = 'Scan en cours…';
  const data = await api('/scan');
  state.sourceFiles = data.source || {};
  state.eparsFiles = data.epars || {};
  state.journal = await api('/journal');
  renderAll();
  document.getElementById('status-text').textContent = 'Scan terminé.';
}

// ── Copy (F5) ─────────────────────────────────────────────────────────────
export function executeCopy() {
  const leftFocus = document.querySelector('#epars-container .focused .file');
  const rightFocus = document.querySelector('#source-container .focused.directory');
  if (!leftFocus) {
    document.getElementById('status-text').textContent = 'Met d\'abord en surbrillance un fichier à gauche (↑↓).';
    return;
  }
  if (!rightFocus) {
    document.getElementById('status-text').textContent = 'Met d\'abord en surbrillance un dossier à droite (Tab puis ↑↓).';
    return;
  }
  if (!leftFocus.dataset.epardir) {
    document.getElementById('status-text').textContent = 'Ce fichier n\'a pas de dossier source valide.';
    return;
  }
  const filename = leftFocus.dataset.filename;
  const eparDir = leftFocus.dataset.epardir;
  const relPath = state.eparsFiles[eparDir]?.[filename]?.path;
  if (!relPath) {
    document.getElementById('status-text').textContent = 'Fichier introuvable dans les données scannées.';
    return;
  }
  const fullSrc = eparDir + '/' + relPath;
  const destDir = rightFocus.dataset.dirpath;

  document.getElementById('dialog-msg').textContent = `Copier "${filename}" vers "${destDir}" ?`;
  openModal('dialog');

  document.getElementById('dialog-confirm').onclick = async () => {
    closeAllModals();
    const res = await api('/copy', {
      method: 'POST',
      body: JSON.stringify({ source_path: fullSrc, dest_dir: destDir, filename: filename })
    });
    if (res.ok) {
      state.journal = await api('/journal');
      // Compute the relative path for both state update and DOM patch
      let relPathNew = filename;
      const sourceDir = Object.keys(state.sourceFiles).find(dir => destDir === dir || destDir.startsWith(dir + '/'));
      if (sourceDir && destDir.startsWith(sourceDir)) {
        const rel = destDir.substring(sourceDir.length).replace(/^\/+/, '');
        relPathNew = rel ? rel + '/' + filename : filename;
        if (!state.sourceFiles[sourceDir]) state.sourceFiles[sourceDir] = {};
        state.sourceFiles[sourceDir][filename] = { path: relPathNew, year: res.year, duration: res.duration, codec: res.codec };
      }
      // Patch DOM without full rebuild — huge perf win on large libraries
      patchEparsFileAfterCopy(filename, eparDir);
      if (!patchSourceFileAfterCopy(destDir, filename,
        { path: relPathNew, year: res.year, duration: res.duration, codec: res.codec })) {
        renderSource();
      }
      requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
      document.getElementById('status-text').textContent = `✓ ${filename} copié vers ${destDir}`;
    } else {
      document.getElementById('status-text').textContent = `✗ Erreur : ${res.error}`;
    }
  };
  document.getElementById('dialog-cancel').onclick = () => closeAllModals();
}

// ── Init ──────────────────────────────────────────────────────────────────
export async function initApp() {
  try {
    const [config, cache, journal] = await Promise.all([
      api('/config'),
      api('/load'),
      api('/journal')
    ]);

    configData = config;
    if (!configData.configs || configData.configs.length === 0) {
      configData = { active: 0, configs: [{ name: 'default', source_data: '', epars_dirs: [] }] };
    }
    renderConfigSelect();

    state.journal = journal || [];
    if (cache && cache.source && Object.keys(cache.source).length > 0) {
      state.sourceFiles = cache.source || {};
      state.eparsFiles = cache.epars || {};
    }

    renderAll();
    setActivePanel('epars');
    document.getElementById('status-text').textContent = 'Prêt. Configure les dossiers puis lance Scan.';
  } catch (err) {
    console.error('Init failed:', err);
    document.getElementById('status-text').textContent = 'Erreur de connexion au serveur.';
  }
}
