// ─── Business operations: scan, copy, config, init ───────────────────────

import { api } from './api.js';
import { revalidateFocus, setActivePanel } from './focus.js';
import { patchEparsFileAfterCopy, patchSourceFileAfterCopy, renderAll, renderSource } from './render.js';
import { state } from './state.js';
import { closeAllModals, openModal, showError } from './ui.js';

// ── Config types ───────────────────────────────────────────────────────────

interface ConfigEntry {
  name: string;
  source_data: string;
  epars_dirs: string[];
}

interface ConfigData {
  active: number;
  configs: ConfigEntry[];
}

// ── Config ────────────────────────────────────────────────────────────────
export let configData: ConfigData = { active: 0, configs: [] as ConfigEntry[] };

const cfgSelect = document.getElementById('cfg-select') as HTMLSelectElement | null;
const cfgName = document.getElementById('cfg-name') as HTMLInputElement | null;
const cfgSource = document.getElementById('cfg-source') as HTMLInputElement | null;
const cfgEpars = document.getElementById('cfg-epars') as HTMLTextAreaElement | null;
const cfgStatus = document.getElementById('config-status') as HTMLElement | null;

export function renderConfigSelect(): void {
  if (!cfgSelect) return;
  const prev = cfgSelect.value;
  cfgSelect.innerHTML = '';
  configData.configs.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = c.name || `config-${i}`;
    cfgSelect.appendChild(opt);
  });
  cfgSelect.value = parseInt(prev, 10) < configData.configs.length ? prev : '0';
  loadActiveConfig();
}

function loadActiveConfig(): void {
  const idx = parseInt(cfgSelect?.value || '0', 10) || 0;
  const c = configData.configs[idx];
  if (c) {
    if (cfgName) cfgName.value = c.name || '';
    if (cfgSource) cfgSource.value = c.source_data || '';
    if (cfgEpars) cfgEpars.value = (c.epars_dirs || []).join('\n');
  }
}

export function initConfigUI(): void {
  if (cfgSelect) cfgSelect.onchange = loadActiveConfig;

  const addBtn = document.getElementById('btn-add-config');
  if (addBtn) {
    addBtn.onclick = () => {
      configData.configs.push({ name: 'nouveau', source_data: '', epars_dirs: [] });
      configData.active = configData.configs.length - 1;
      renderConfigSelect();
      if (cfgSelect) cfgSelect.value = String(configData.active);
      loadActiveConfig();
      if (cfgName) cfgName.focus();
    };
  }

  const delBtn = document.getElementById('btn-del-config');
  if (delBtn) {
    delBtn.onclick = () => {
      if (configData.configs.length <= 1) {
        if (cfgStatus) cfgStatus.textContent = '⚠️ Impossible de supprimer le dernier profil';
        return;
      }
      const idx = parseInt(cfgSelect?.value || '0', 10) || 0;
      configData.configs.splice(idx, 1);
      configData.active = Math.min(idx, configData.configs.length - 1);
      renderConfigSelect();
    };
  }

  const saveBtn = document.getElementById('btn-save-config');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const idx = parseInt(cfgSelect?.value || '0', 10) || 0;
      configData.configs[idx] = {
        name: (cfgName?.value || '').trim() || `config-${idx}`,
        source_data: (cfgSource?.value || '').trim(),
        epars_dirs: (cfgEpars?.value || '')
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean),
      };
      configData.active = idx;
      await api('/config', { method: 'POST', body: JSON.stringify(configData) });
      if (cfgStatus) cfgStatus.textContent = '✓ Profil sauvegardé';
      renderConfigSelect();
    };
  }
}

// ── Scan ──────────────────────────────────────────────────────────────────
export async function runScan(): Promise<void> {
  const btn = document.getElementById('btn-scan') as HTMLButtonElement | null;
  const progressBar = document.getElementById('scan-progress') as HTMLElement | null;
  const progressFill = document.getElementById('scan-progress-fill') as HTMLElement | null;
  const progressText = document.getElementById('scan-progress-text') as HTMLElement | null;
  const statusText = document.getElementById('status-text') as HTMLElement | null;

  if (btn) btn.disabled = true;
  if (btn) btn.classList.add('scanning');
  if (progressBar) progressBar.classList.remove('hidden');
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '🔍 Préparation…';
  if (statusText) statusText.textContent = 'Scan en cours…';

  // Poll progress every 400ms
  const pollTimer = setInterval(async () => {
    try {
      const p = await api<{ running: boolean; total: number; current: number; phase?: string }>('/scan-progress');
      if (!p.running) {
        clearInterval(pollTimer);
        return;
      }
      const pct = p.total > 0 ? Math.round((p.current / p.total) * 100) : 0;
      if (progressFill) progressFill.style.width = `${Math.min(pct, 100)}%`;
      if (progressText) progressText.textContent = `${p.phase || '…'} : ${p.current} / ${p.total} (${pct}%)`;
      if (statusText)
        statusText.textContent = `🔍 Scan ${p.phase ? p.phase.toLowerCase() : '…'} — ${p.current}/${p.total}`;
    } catch (_) {
      /* ignore polling errors */
    }
  }, 400);

  let scanFailed = false;
  try {
    const data = await api<{ source: Record<string, unknown>; epars: Record<string, unknown> }>('/scan');
    state.sourceFiles = (data.source || {}) as typeof state.sourceFiles;
    state.eparsFiles = (data.epars || {}) as typeof state.eparsFiles;
    state.journal = await api<Array<Record<string, unknown>>>('/journal');
    renderAll();
  } catch (err) {
    scanFailed = true;
    showError(`Scan échoué : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearInterval(pollTimer);
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('scanning');
    }
    if (progressBar) progressBar.classList.add('hidden');
    if (progressFill) progressFill.style.width = '0%';

    if (!scanFailed) {
      const totalFiles =
        Object.values(state.sourceFiles).reduce((s, f) => s + Object.keys(f).length, 0) +
        Object.values(state.eparsFiles).reduce((s, f) => s + Object.keys(f).length, 0);
      if (statusText) statusText.textContent = `Scan terminé — ${totalFiles.toLocaleString('fr')} fichiers`;
    }
  }
}

// ── Copy (F5) ─────────────────────────────────────────────────────────────
export function executeCopy(): void {
  const leftFocus = document.querySelector('#epars-container .focused .file') as HTMLElement | null;
  const rightFocus = document.querySelector('#source-container .focused.directory') as HTMLElement | null;
  const statusText = document.getElementById('status-text');

  if (!leftFocus) {
    if (statusText) statusText.textContent = "Met d'abord en surbrillance un fichier à gauche (↑↓).";
    return;
  }
  if (!rightFocus) {
    if (statusText) statusText.textContent = "Met d'abord en surbrillance un dossier à droite (Tab puis ↑↓).";
    return;
  }
  if (!leftFocus.dataset.epardir) {
    if (statusText) statusText.textContent = "Ce fichier n'a pas de dossier source valide.";
    return;
  }
  const filename = leftFocus.dataset.filename || '';
  const eparDir = leftFocus.dataset.epardir;
  const relPath = state.eparsFiles[eparDir]?.[filename]?.path;
  if (!relPath) {
    if (statusText) statusText.textContent = 'Fichier introuvable dans les données scannées.';
    return;
  }
  const fullSrc = `${eparDir}/${relPath}`;
  const destDir = rightFocus.dataset.dirpath || '';

  const dialogMsg = document.getElementById('dialog-msg');
  if (dialogMsg) dialogMsg.textContent = `Copier "${filename}" vers "${destDir}" ?`;
  openModal('dialog');

  const confirmBtn = document.getElementById('dialog-confirm');
  const cancelBtn = document.getElementById('dialog-cancel');

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      closeAllModals();
      try {
        const res = await api<{ ok: boolean; year?: string | null; duration?: number | null; codec?: string | null }>(
          '/copy',
          {
            method: 'POST',
            body: JSON.stringify({ source_path: fullSrc, dest_dir: destDir, filename }),
          },
        );
        state.journal = await api('/journal');
        // Compute the relative path for both state update and DOM patch
        let relPathNew = filename;
        const sourceDir = Object.keys(state.sourceFiles).find(dir => destDir === dir || destDir.startsWith(`${dir}/`));
        if (sourceDir && destDir.startsWith(sourceDir)) {
          const rel = destDir.substring(sourceDir.length).replace(/^\/+/, '');
          relPathNew = rel ? `${rel}/${filename}` : filename;
          if (!state.sourceFiles[sourceDir]) state.sourceFiles[sourceDir] = {};
          state.sourceFiles[sourceDir][filename] = {
            path: relPathNew,
            year: res.year ?? null,
            duration: res.duration ?? null,
            codec: res.codec ?? null,
          };
        }
        // Patch DOM without full rebuild — huge perf win on large libraries
        patchEparsFileAfterCopy(filename, eparDir);
        if (
          !patchSourceFileAfterCopy(destDir, filename, {
            path: relPathNew,
            year: res.year ?? null,
            duration: res.duration ?? null,
            codec: res.codec ?? null,
          })
        ) {
          renderSource();
        }
        requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
        if (statusText) statusText.textContent = `✓ ${filename} copié vers ${destDir}`;
      } catch (err) {
        showError(`Échec de la copie : ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }

  if (cancelBtn) cancelBtn.onclick = () => closeAllModals();
}

// ── Init ──────────────────────────────────────────────────────────────────
export async function initApp(): Promise<void> {
  try {
    const [config, cache, journal] = await Promise.all([
      api<ConfigData>('/config'),
      api<{ source?: Record<string, unknown>; epars?: Record<string, unknown> }>('/load'),
      api<Array<Record<string, unknown>>>('/journal'),
    ]);

    configData = config;
    if (!configData.configs || configData.configs.length === 0) {
      configData = { active: 0, configs: [{ name: 'default', source_data: '', epars_dirs: [] }] };
    }
    renderConfigSelect();

    state.journal = (journal || []) as typeof state.journal;
    if (cache?.source && Object.keys(cache.source).length > 0) {
      state.sourceFiles = (cache.source || {}) as typeof state.sourceFiles;
      state.eparsFiles = (cache.epars || {}) as typeof state.eparsFiles;
    }

    renderAll();
    setActivePanel('epars');
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Prêt. Configure les dossiers puis lance Scan.';
  } catch (err) {
    console.error('Init failed:', err);
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Erreur de connexion au serveur.';
  }
}
