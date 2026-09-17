// ─── Business operations: scan, copy, config, init ───────────────────────

import { api } from './api.js';
import { patchEparsFileAfterCopy, patchSourceFileAfterCopy } from './domPatches.js';
import { detectDuplicates } from './dupDetect.js';
import { durationCompatible, type VersionGroup } from './dupGroups.js';
import { revalidateFocus, setActivePanel } from './focus.js';
import { loadRatings } from './ratings.js';
import { getBatchCopy } from './render.js';
import { type FileIndex, state } from './state.js';
import { closeAllModals, confirmDialog, openModal, promptDialog, showError } from './ui.js';

// ── Config types ───────────────────────────────────────────────────────────

interface ConfigEntry {
  name: string;
  source_data: string;
  epars_dirs: string[];
  traktor_nml_path?: string;
  traktor_export_root?: string;
  traktor_export_volume?: string;
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
const cfgTraktorNmlPath = document.getElementById('cfg-traktor-nml-path') as HTMLInputElement | null;
const cfgTraktorExportRoot = document.getElementById('cfg-traktor-export-root') as HTMLInputElement | null;
const cfgTraktorExportVolume = document.getElementById('cfg-traktor-export-volume') as HTMLInputElement | null;
const cfgEpars = document.getElementById('cfg-epars') as HTMLTextAreaElement | null;
const cfgStatus = document.getElementById('config-status') as HTMLElement | null;

export function renderConfigSelect(): void {
  if (!cfgSelect) return;
  cfgSelect.innerHTML = '';
  configData.configs.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = c.name || `config-${i}`;
    cfgSelect.appendChild(opt);
  });
  cfgSelect.value = configData.active < configData.configs.length ? String(configData.active) : '0';
  loadActiveConfig();
}

function loadActiveConfig(): void {
  const idx = parseInt(cfgSelect?.value || '0', 10) || 0;
  const c = configData.configs[idx];
  if (c) {
    if (cfgName) cfgName.value = c.name || '';
    if (cfgSource) cfgSource.value = c.source_data || '';
    if (cfgTraktorNmlPath) cfgTraktorNmlPath.value = c.traktor_nml_path || '';
    if (cfgTraktorExportRoot) cfgTraktorExportRoot.value = c.traktor_export_root || '';
    if (cfgTraktorExportVolume) cfgTraktorExportVolume.value = c.traktor_export_volume || 'TRAKTOR_USB';
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
        ...configData.configs[idx],
        name: (cfgName?.value || '').trim() || `config-${idx}`,
        source_data: (cfgSource?.value || '').trim(),
        traktor_nml_path: (cfgTraktorNmlPath?.value || '').trim(),
        traktor_export_root: (cfgTraktorExportRoot?.value || '').trim(),
        traktor_export_volume: (cfgTraktorExportVolume?.value || 'TRAKTOR_USB').trim() || 'TRAKTOR_USB',
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
    const data = await api<{
      source: Record<string, FileIndex>;
      epars: Record<string, FileIndex>;
      extra_dirs?: string[];
    }>('/scan');
    state.sourceFiles = (data.source || {}) as typeof state.sourceFiles;
    state.eparsFiles = (data.epars || {}) as typeof state.eparsFiles;
    state.sourceExtraDirs = new Set(data.extra_dirs || []);
    state.journal = await api<typeof state.journal>('/journal');
    refreshDupMatches();
    // EventEmitter auto-renders panels via subscriptions
    // Double-RAF restores focus after EventEmitter's deferred render
    requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
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

// ── DupMatches (EPIC-028 P0) ──────────────────────────────────────────────
/** Recalcule la Map doublons depuis l'index courant. Appelé après scan et
 *  après copy (mutation de l'index DOM-patch). */
export function refreshDupMatches(): void {
  state.dupMatches = detectDuplicates(state.eparsFiles, state.sourceFiles).byEparsPath;
}

// ── Copy (F5) ─────────────────────────────────────────────────────────────
export function executeCopy(): void {
  const statusText = document.getElementById('status-text');

  // ── Batch copy (A8/A9) : multi-select or drag-drop ──────────────────
  const batch = getBatchCopy();
  if (batch.target && batch.files.length > 0) {
    const destDir = batch.target;
    const files = batch.files;
    const dialogMsg = document.getElementById('dialog-msg');
    if (dialogMsg) {
      dialogMsg.textContent =
        files.length === 1
          ? `Copier "${files[0].filename}" vers "${destDir}" ?`
          : `Copier ${files.length} fichiers vers "${destDir}" ?`;
    }
    openModal('dialog');
    const confirmBtn = document.getElementById('dialog-confirm');
    const cancelBtn = document.getElementById('dialog-cancel');
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        closeAllModals();
        let copied = 0;
        for (const f of files) {
          const relPath = state.eparsFiles[f.eparDir]?.[f.filename]?.path;
          if (!relPath) continue;
          const fullSrc = `${f.eparDir}/${relPath}`;
          try {
            const res = await api<{
              ok: boolean;
              year?: string | null;
              duration?: number | null;
              codec?: string | null;
            }>('/copy', {
              method: 'POST',
              body: JSON.stringify({ source_path: fullSrc, dest_dir: destDir, filename: f.filename }),
            });
            if (!res.ok) continue;
            copied++;
            let relPathNew = f.filename;
            const sourceDir = Object.keys(state.sourceFiles).find(
              dir => destDir === dir || destDir.startsWith(`${dir}/`),
            );
            if (sourceDir && destDir.startsWith(sourceDir)) {
              const rel = destDir.substring(sourceDir.length).replace(/^\/+/, '');
              relPathNew = rel ? `${rel}/${f.filename}` : f.filename;
              if (!state.sourceFiles[sourceDir]) state.sourceFiles[sourceDir] = {};
              state.sourceFiles[sourceDir][f.filename] = {
                path: relPathNew,
                year: res.year ?? null,
                duration: res.duration ?? null,
                codec: res.codec ?? null,
              };
            }
            patchEparsFileAfterCopy(f.filename, f.eparDir);
            patchSourceFileAfterCopy(destDir, f.filename, {
              path: relPathNew,
              year: res.year ?? null,
              duration: res.duration ?? null,
              codec: res.codec ?? null,
            });
          } catch (_) {
            /* continue */
          }
        }
        // Trigger EventEmitter for nested sourceFiles mutations
        state.sourceFiles = { ...state.sourceFiles };
        state.journal = await api('/journal');
        state.selectedEparsFiles = new Map();
        requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
        if (statusText)
          statusText.textContent = `✓ ${copied}/${files.length} fichier${files.length > 1 ? 's' : ''} copié${files.length > 1 ? 's' : ''} vers ${destDir}`;
      };
    }
    if (cancelBtn) cancelBtn.onclick = () => closeAllModals();
    return;
  }

  // ── Single-file copy (original F5 flow) ───────────────────────────
  const leftFocus = document.querySelector('#epars-container .focused .file') as HTMLElement | null;
  // Dossier cible : focus direct sur un dossier OU sur une ligne fichier d'un
  // dossier déplié (navigation Tab/↑↓) → le dossier parent sert de destination.
  const rightFocused = document.querySelector('#source-container .focused') as HTMLElement | null;
  const rightFocus = rightFocused?.classList.contains('directory')
    ? rightFocused
    : (rightFocused?.closest('.directory') as HTMLElement | null);

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
        patchEparsFileAfterCopy(filename, eparDir);
        patchSourceFileAfterCopy(destDir, filename, {
          path: relPathNew,
          year: res.year ?? null,
          duration: res.duration ?? null,
          codec: res.codec ?? null,
        });
        // Trigger EventEmitter for nested sourceFiles mutations
        state.sourceFiles = { ...state.sourceFiles };
        refreshDupMatches(); // l'index droit vient de muter → la Map peut être périmée
        state.selectedEparsFiles = new Map();
        requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
        if (statusText) statusText.textContent = `✓ ${filename} copié vers ${destDir}`;
      } catch (err) {
        showError(`Échec de la copie : ${err instanceof Error ? err.message : String(err)}`);
      }
    };
  }
  if (cancelBtn) cancelBtn.onclick = () => closeAllModals();
}

// ── Replace (EPIC-028 P1bis) : FLAC gagne, l'ancien part au _trash ────────

/** Remplace le fichier rangé par son jumeau épars : copie du gauche vers le
 *  dossier du jumeau droit, puis déplacement de l'ancien droit vers
 *  `<source_root>/_trash/<date>/`. Jamais d'effacement physique. Le move n'a
 *  lieu QUE si la copie a réussi — rien n'est perdu en cas d'échec. */
export async function executeReplace(eparsFullPath: string): Promise<void> {
  const statusText = document.getElementById('status-text');
  const match = state.dupMatches.get(eparsFullPath);
  if (!match) {
    if (statusText) statusText.textContent = 'Aucun jumeau rangé à remplacer pour ce fichier.';
    return;
  }

  // Découpage : dupMatches ne stocke que le path complet.
  const eparDir = Object.keys(state.eparsFiles).find(d => eparsFullPath.startsWith(`${d}/`));
  const sourceRoot = Object.keys(state.sourceFiles).find(d => match.sourceFullPath.startsWith(`${d}/`));
  if (!eparDir || !sourceRoot) {
    if (statusText) statusText.textContent = 'Chemin introuvable dans les données scannées.';
    return;
  }
  const eparsFilename = match.eparsFilename;
  const sourceDir = match.sourceFullPath.substring(0, match.sourceFullPath.lastIndexOf('/'));
  const sourceFilename = match.sourceFilename;
  const trashDir = `${sourceRoot}/_trash/${new Date().toISOString().slice(0, 10)}`;

  // La confirmation est à callback : la promesse du flux réel est capturée ici
  // pour que executeReplace() reste awaitable (tests, enchaînements clavier).
  let inflight: Promise<void> = Promise.resolve();

  confirmDialog(
    `Remplacer "${sourceFilename}" (rangé) par "${eparsFilename}" (épars) ?\n` +
      `L'ancien fichier sera déplacé vers _trash (jamais effacé).`,
    () => {
      state.replaceBusy = true; // anti double-exécution (double-clic sur confirmer)
      inflight = (async () => {
        try {
          // 1. Copier le nouveau fichier dans le dossier du jumeau
          await api('/copy', {
            method: 'POST',
            body: JSON.stringify({
              source_path: eparsFullPath,
              dest_dir: sourceDir,
              filename: eparsFilename,
            }),
          });
          // 2. Déplacer l'ancien rangé vers le trash — seulement si la copie a réussi
          await api('/move', {
            method: 'POST',
            body: JSON.stringify({ source_path: match.sourceFullPath, dest_dir: trashDir }),
          });

          // 3. State : retrait de l'ancien, ajout du nouveau dans sourceFiles
          const rel = sourceDir === sourceRoot ? '' : `${sourceDir.substring(sourceRoot.length + 1)}/`;
          delete state.sourceFiles[sourceRoot][sourceFilename];
          state.sourceFiles[sourceRoot][eparsFilename] = {
            ...(state.eparsFiles[eparDir]?.[eparsFilename] ?? {
              path: `${rel}${eparsFilename}`,
              year: null,
              duration: null,
              codec: null,
            }),
          };
          state.sourceFiles = { ...state.sourceFiles }; // EventEmitter → renderSource
          // 4. Épars : marquer traité (même sémantique qu'après copie)
          patchEparsFileAfterCopy(eparsFilename, eparDir);
          state.selectedEparsFiles = new Map();
          refreshDupMatches(); // l'ancien jumeau n'existe plus → la Map change
          if (statusText) {
            statusText.textContent = `✓ ${sourceFilename} remplacé par ${eparsFilename} (ancien → _trash)`;
          }
        } catch (err) {
          showError(`Échec du remplacement : ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          state.replaceBusy = false;
          requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
        }
      })();
    },
    'Remplacer',
  );

  await inflight;
}

// ── Create folder (bouton ➕ du panneau Source Data) ──────────────────────

/** Ouvre le prompt « nom du dossier », POST /mkdir, met à jour l'état local
 *  (EventEmitter → re-render). Le dossier est créé à la racine de Source Data,
 *  au même niveau que les autres. */
export async function createSourceFolder(): Promise<void> {
  const sourceDir = Object.keys(state.sourceFiles)[0] || null;
  if (!sourceDir) {
    showError("Configure d'abord le dossier Source Data (⚙️ Config) puis lance Scan.");
    return;
  }
  promptDialog(
    'Nom du nouveau dossier (à la racine de Source Data) :',
    '',
    async name => {
      try {
        const res = await api<{ ok: boolean; path: string }>('/mkdir', {
          method: 'POST',
          body: JSON.stringify({ root: sourceDir, name }),
        });
        if (!res.ok) {
          showError('Création refusée par le serveur.');
          return;
        }
        const next = new Set(state.sourceExtraDirs);
        next.add(res.path);
        state.sourceExtraDirs = next; // EventEmitter → re-render
        const statusText = document.getElementById('status-text');
        if (statusText) statusText.textContent = `✓ Dossier "${name}" créé à la racine de Source Data.`;
        requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
      } catch (err) {
        showError(`Échec de la création : ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    'Créer',
  );
}

// ── Groupe de versions (EPIC-028 v2) : appliquer le plan d'arbitrage ─────

/** Applique le plan d'un groupe : gagnant épars → copié vers le dossier du
 *  meilleur rangé, PUIS tous les rangés perdants → _trash/<date>. Jamais
 *  d'effacement : si une copie échoue, aucun move n'a lieu (garde globale).
 *  Les épars perdants restent en place (décision utilisateur). overridePath
 *  désigne un autre survivant choisi par l'utilisateur. */
export async function applyGroupPlan(group: VersionGroup, overridePath: string | null): Promise<void> {
  const statusText = document.getElementById('status-text');
  let finalWinner = group.winner;
  if (overridePath) {
    const alt = group.members.find(m => m.fullPath === overridePath);
    if (alt) finalWinner = alt;
  }
  // EPIC-032 : seuls les rangés de MÊME ENREGISTREMENT (durée ±2 s du gagnant
  // désigné) vont au trash — les autres versions du morceau (mix, album,
  // radio…) sont hors de portée de l'arbitrage, même en override.
  const losers = group.members.filter(
    m => m.fullPath !== finalWinner.fullPath && m.side === 'source' && durationCompatible(m, finalWinner),
  );
  if (losers.length === 0) {
    if (statusText) statusText.textContent = 'Rien à déplacer : le gagnant choisi est déjà le seul exemplaire rangé.';
    return;
  }
  const sourceRoot = Object.keys(state.sourceFiles).find(d => losers[0].fullPath.startsWith(`${d}/`));
  if (!sourceRoot) {
    showError('Dossier source introuvable pour le plan de groupe.');
    return;
  }
  const trashDir = `${sourceRoot}/_trash/${new Date().toISOString().slice(0, 10)}`;

  state.replaceBusy = true;
  try {
    // 1. Gagnant épars → copier vers la cible (dossier du meilleur rangé)
    if (finalWinner.side === 'epars') {
      await api('/copy', {
        method: 'POST',
        body: JSON.stringify({
          source_path: finalWinner.fullPath,
          dest_dir: group.copyTargetDir ?? sourceRoot,
          filename: finalWinner.filename,
        }),
      });
    }
    // 2. Rangés perdants → trash (collisions suffixées côté serveur)
    for (const loser of losers) {
      await api('/move', {
        method: 'POST',
        body: JSON.stringify({ source_path: loser.fullPath, dest_dir: trashDir }),
      });
    }
    // 3. State : retirer les perdants de sourceFiles
    for (const loser of losers) {
      const root = Object.keys(state.sourceFiles).find(d => loser.fullPath.startsWith(`${d}/`));
      if (root) delete state.sourceFiles[root][loser.filename];
    }
    state.sourceFiles = { ...state.sourceFiles }; // EventEmitter → re-render
    refreshDupMatches();
    if (statusText) {
      statusText.textContent = `✓ ${finalWinner.filename} conservé — ${losers.length} exemplaire(s) → _trash`;
    }
  } catch (err) {
    showError(`Échec du plan de groupe : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    state.replaceBusy = false;
    requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
  }
}

// ── Init ──────────────────────────────────────────────────────────────────
export async function initApp(): Promise<void> {
  try {
    const [config, cache, journal] = await Promise.all([
      api<ConfigData>('/config'),
      api<{ source?: Record<string, FileIndex>; epars?: Record<string, FileIndex>; extra_dirs?: string[] }>('/load'),
      api<typeof state.journal>('/journal'),
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
    // Dossiers racine vides (➕) — toujours, même sans cache de scan.
    state.sourceExtraDirs = new Set(cache?.extra_dirs || []);
    // Doublons fuzzy (EPIC-028) : le cache vient de peupler les deux index —
    // sans ça, aucun marqueur ambre après un simple rechargement de page.
    refreshDupMatches();

    loadRatings().catch(() => {
      /* ratings are optional */
    });

    // EventEmitter auto-renders panels via subscriptions
    // Focus restoration after EventEmitter's deferred render
    requestAnimationFrame(() => requestAnimationFrame(revalidateFocus));
    setActivePanel('epars');
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Prêt. Configure les dossiers puis lance Scan.';
  } catch (err) {
    console.error('Init failed:', err);
    const statusText = document.getElementById('status-text');
    if (statusText) statusText.textContent = 'Erreur de connexion au serveur.';
  }
}
