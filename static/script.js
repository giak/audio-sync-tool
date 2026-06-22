const state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  selectedFile: null,
  selectedEparDir: null,
  focusedPanel: null,
  focusedIndex: -1
};

// --- Audio player ---
let currentAudio = null;
let playerFilename = '';
let playerFullpath = '';

const playerBar = document.getElementById('player-bar');
const playerStop = document.getElementById('player-stop');
const playerFilenameEl = document.getElementById('player-filename');
const playerProgress = document.getElementById('player-progress');
const playerProgressFill = document.getElementById('player-progress-fill');
const playerTime = document.getElementById('player-time');
const playerSeekBwd = document.getElementById('player-seek-bwd');
const playerSeekFwd = document.getElementById('player-seek-fwd');
const playerStep = document.getElementById('player-step');

function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function updatePlayerUI() {
  if (!currentAudio || !currentAudio.duration) return;
  const pct = (currentAudio.currentTime / currentAudio.duration) * 100;
  playerProgressFill.style.width = pct + '%';
  playerTime.textContent = `${formatTime(currentAudio.currentTime)} / ${formatTime(currentAudio.duration)}`;
}

function stopPlayer() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  playerBar.classList.add('hidden');
  document.querySelectorAll('.play-btn.playing').forEach(b => {
    b.classList.remove('playing');
    b.textContent = '▶';
  });
}

function showPlayer(filename, fullpath) {
  playerFilename = filename;
  playerFullpath = fullpath;
  playerFilenameEl.textContent = filename.length > 30 ? filename.slice(0, 27) + '...' : filename;
  playerTime.textContent = '0:00 / 0:00';
  playerProgressFill.style.width = '0%';
  playerBar.classList.remove('hidden');
}

function togglePlay(filename, fullpath, btn) {
  if (currentAudio && !currentAudio.paused) {
    if (fullpath === playerFullpath) {
      stopPlayer();
      return;
    }
    currentAudio.pause();
    currentAudio = null;
    document.querySelectorAll('.play-btn.playing').forEach(b => {
      b.classList.remove('playing');
      b.textContent = '▶';
    });
  }
  const audio = new Audio('/audio?path=' + encodeURIComponent(fullpath));
  let started = false;

  audio.ontimeupdate = () => {
    if (!started && audio.duration) {
      started = true;
    }
    updatePlayerUI();
  };

  audio.onloadedmetadata = () => {
    updatePlayerUI();
  };

  audio.onended = () => {
    if (currentAudio === audio) {
      document.querySelectorAll('.play-btn.playing').forEach(b => {
        b.classList.remove('playing');
        b.textContent = '▶';
      });
      currentAudio = null;
      playerBar.classList.add('hidden');
    }
  };

  audio.onerror = () => {
    btn.classList.remove('playing');
    btn.textContent = '▶';
    if (currentAudio === audio) {
      currentAudio = null;
      playerBar.classList.add('hidden');
    }
  };

  audio.play().then(() => {
    currentAudio = audio;
    document.querySelectorAll('.play-btn.playing').forEach(b => {
      b.classList.remove('playing');
      b.textContent = '▶';
    });
    btn.classList.add('playing');
    btn.textContent = '⏹';
    showPlayer(filename, fullpath);
  }).catch(() => {
    btn.classList.remove('playing');
    btn.textContent = '▶';
    playerBar.classList.add('hidden');
  });
}

playerStop.onclick = stopPlayer;

playerProgress.onclick = (e) => {
  if (!currentAudio || !currentAudio.duration) return;
  const rect = playerProgress.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  currentAudio.currentTime = pct * currentAudio.duration;
  updatePlayerUI();
};

function seekWithSteps(delta) {
  if (!currentAudio || !currentAudio.duration) return;
  const step = parseInt(playerStep.value) || 20;
  currentAudio.currentTime = Math.max(0, Math.min(currentAudio.duration, currentAudio.currentTime + delta * step));
  updatePlayerUI();
}

playerSeekBwd.onclick = () => seekWithSteps(-1);
playerSeekFwd.onclick = () => seekWithSteps(1);

// --- Keyboard navigation ---
function getFocusedPanel() {
  if (state.focusedPanel === 'source') return document.getElementById('source-container');
  return document.getElementById('epars-container');
}

function focusFileRow(container, idx) {
  const rows = container.querySelectorAll('.file-row');
  if (idx < 0) idx = 0;
  if (idx >= rows.length) idx = rows.length - 1;
  state.focusedIndex = idx;
  container.querySelectorAll('.file-row.focused').forEach(r => r.classList.remove('focused'));
  if (rows[idx]) {
    rows[idx].classList.add('focused');
    rows[idx].scrollIntoView({ block: 'nearest' });
  }
}

function getPlayBtn(row) {
  return row.querySelector('.play-btn');
}

document.getElementById('panel-left').onclick = () => {
  state.focusedPanel = 'epars';
  const rows = getFocusedPanel().querySelectorAll('.file-row');
  if (state.focusedIndex < 0 && rows.length > 0) focusFileRow(getFocusedPanel(), 0);
};

document.getElementById('panel-right').onclick = () => {
  state.focusedPanel = 'source';
  const rows = getFocusedPanel().querySelectorAll('.file-row');
  if (state.focusedIndex < 0 && rows.length > 0) focusFileRow(getFocusedPanel(), 0);
};

// On re-render, restore focus
function revalidateFocus() {
  if (!state.focusedPanel) return;
  const container = getFocusedPanel();
  const rows = container.querySelectorAll('.file-row');
  if (rows.length === 0) { state.focusedIndex = -1; return; }
  if (state.focusedIndex >= rows.length) state.focusedIndex = rows.length - 1;
  if (state.focusedIndex >= 0) focusFileRow(container, state.focusedIndex);
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Audio seek (only when playing)
  if (currentAudio && !currentAudio.paused) {
    if (e.key === 'ArrowLeft') { seekWithSteps(-1); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { seekWithSteps(1); e.preventDefault(); return; }
  }

  // File list navigation (when not playing, or always)
  if (!state.focusedPanel) state.focusedPanel = 'epars';
  const container = getFocusedPanel();
  const rows = container.querySelectorAll('.file-row');
  if (rows.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = Math.min(state.focusedIndex + 1, rows.length - 1);
    if (state.focusedIndex < 0) focusFileRow(container, 0);
    else focusFileRow(container, next);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.focusedIndex < 0) focusFileRow(container, rows.length - 1);
    else focusFileRow(container, Math.max(0, state.focusedIndex - 1));
  } else if (e.key === 'Enter') {
    if (state.focusedIndex < 0) return;
    const row = rows[state.focusedIndex];
    const btn = getPlayBtn(row);
    if (btn) btn.click();
  }
});

// Patch renderAll to revalidate focus after re-render
const origRenderAll = renderAll;
renderAll = function() {
  origRenderAll();
  setTimeout(revalidateFocus, 0);
};

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

// Config
const configPanel = document.getElementById('config-panel');
const cfgSelect = document.getElementById('cfg-select');
const cfgName = document.getElementById('cfg-name');
const cfgSource = document.getElementById('cfg-source');
const cfgEpars = document.getElementById('cfg-epars');
const cfgStatus = document.getElementById('config-status');

let configData = { active: 0, configs: [] };

document.getElementById('btn-config').onclick = () => {
  configPanel.classList.toggle('hidden');
};

function renderConfigSelect() {
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
  await api('/config', {
    method: 'POST',
    body: JSON.stringify(configData)
  });
  cfgStatus.textContent = '✓ Profil sauvegardé';
  renderConfigSelect();
};

async function loadConfig() {
  configData = await api('/config');
  if (configData.configs && configData.configs.length > 0) {
    renderConfigSelect();
  } else {
    configData = { active: 0, configs: [{ name: 'default', source_data: '', epars_dirs: [] }] };
    renderConfigSelect();
  }
}

// Scan
document.getElementById('btn-scan').onclick = async () => {
  document.getElementById('status-text').textContent = 'Scan en cours...';
  const data = await api('/scan');
  state.sourceFiles = data.source || {};
  state.eparsFiles = data.epars || {};
  state.journal = await api('/journal');
  renderAll();
  document.getElementById('status-text').textContent = 'Scan terminé. Clique un fichier ● puis un dossier destination.';
};

// Journal toggle
document.getElementById('btn-journal').onclick = () => {
  document.getElementById('journal-panel').classList.toggle('hidden');
  renderJournal();
};

function renderJournal() {
  const container = document.getElementById('journal-content');
  if (state.journal.length === 0) {
    container.innerHTML = '<div style="color:#585b70">Aucune opération enregistrée.</div>';
    return;
  }
  container.innerHTML = [...state.journal].reverse().map(e => {
    const cls = e.status === 'copied' ? 'copied' : 'error';
    return `<div class="${cls}">[${e.timestamp.slice(0,19)}] ${e.filename} → ${e.destination}</div>`;
  }).join('');
}

function getJournalFiles() {
  const set = new Set();
  for (const entry of state.journal) {
    if (entry.status === 'copied') set.add(entry.filename);
  }
  return set;
}

function computeStatus(filename) {
  const inSource = Object.values(state.sourceFiles).some(idx => filename in idx);
  const journaled = getJournalFiles();
  if (journaled.has(filename)) return 'traite';
  if (inSource) return 'doublon';
  return 'nouveau';
}

// Rendering
function renderAll() {
  renderEpars();
  renderSource();
  renderJournal();
}

function makeFileEl(filename, relPath, status, fullpath) {
  const row = document.createElement('div');
  row.className = 'file-row';

  const playBtn = document.createElement('span');
  playBtn.className = 'play-btn';
  playBtn.textContent = '▶';
  playBtn.title = 'Écouter';
  playBtn.onclick = (e) => {
    e.stopPropagation();
    togglePlay(filename, fullpath, playBtn);
  };

  const label = document.createElement('span');
  label.className = `file ${status}`;
  label.textContent = filename;
  label.dataset.filename = filename;
  label.dataset.fullpath = fullpath;

  row.appendChild(playBtn);
  row.appendChild(label);
  return row;
}

function renderEpars() {
  const container = document.getElementById('epars-container');
  container.innerHTML = '';
  for (const [dirPath, files] of Object.entries(state.eparsFiles)) {
    const dirDiv = document.createElement('div');
    dirDiv.className = 'directory';
    const shortName = dirPath.split('/').filter(Boolean).pop() || dirPath;
    dirDiv.textContent = shortName;
    dirDiv.title = dirPath;
    container.appendChild(dirDiv);

    const fileList = document.createElement('div');
    fileList.className = 'children';
    container.appendChild(fileList);

    const sorted = Object.entries(files).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [filename, relPath] of sorted) {
      const fullpath = dirPath + '/' + relPath;
      const status = computeStatus(filename);
      const row = makeFileEl(filename, relPath, status, fullpath);

      if (status === 'nouveau') {
        const label = row.querySelector('.file');
        label.onclick = () => selectFile(label, filename, dirPath);
      }

      fileList.appendChild(row);
    }
  }
}

function renderSource() {
  const container = document.getElementById('source-container');
  container.innerHTML = '';
  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree = {};
    for (const [filename, relPath] of Object.entries(files)) {
      const parts = relPath.split('/');
      if (parts.length === 1) {
        (tree['__root__'] = tree['__root__'] || []).push({filename, relPath});
      } else {
        let current = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]] = current[parts[i]] || {};
        }
        (current['__files__'] = current['__files__'] || []).push({filename, relPath});
      }
    }
    renderTree(tree, container, dirPath);
  }
}

function renderTree(node, container, basePath) {
  const dirs = Object.keys(node).filter(k => k !== '__root__' && k !== '__files__').sort();
  for (const dirName of dirs) {
    const div = document.createElement('div');
    div.className = 'directory';
    div.textContent = dirName;
    div.dataset.dirpath = basePath + '/' + dirName;
    div.onclick = () => selectDestination(div);
    container.appendChild(div);

    const childContainer = document.createElement('div');
    childContainer.className = 'children';
    container.appendChild(childContainer);
    renderTree(node[dirName], childContainer, basePath + '/' + dirName);
  }

  const allFiles = [...(node['__root__'] || []), ...(node['__files__'] || [])];
  for (const {filename, relPath} of allFiles) {
    const fullpath = basePath + '/' + relPath;
    const row = makeFileEl(filename, relPath, 'doublon', fullpath);
    container.appendChild(row);
  }
}

function selectFile(el, filename, eparDir) {
  document.querySelectorAll('.file.selected').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedFile = filename;
  state.selectedEparDir = eparDir;
  document.getElementById('selected-info').textContent = `Sélectionné : ${filename}`;
  document.getElementById('selected-info').classList.remove('hidden');
  document.getElementById('status-text').textContent = 'Clique un dossier dans le panneau Source Data pour copier.';
}

async function selectDestination(el) {
  if (!state.selectedFile || !state.selectedEparDir) {
    document.getElementById('status-text').textContent = 'Sélectionne d\'abord un fichier ● dans le panneau gauche.';
    return;
  }
  const destDir = el.dataset.dirpath;
  const srcPath = state.eparsFiles[state.selectedEparDir][state.selectedFile];

  const fullSrc = state.selectedEparDir + '/' + srcPath;

  // Confirm dialog
  document.getElementById('dialog-msg').textContent =
    `Copier "${state.selectedFile}" vers "${destDir}" ?`;
  document.getElementById('confirm-dialog').classList.remove('hidden');

  document.getElementById('dialog-confirm').onclick = async () => {
    document.getElementById('confirm-dialog').classList.add('hidden');
    const res = await api('/copy', {
      method: 'POST',
      body: JSON.stringify({
        source_path: fullSrc,
        dest_dir: destDir,
        filename: state.selectedFile
      })
    });
    if (res.ok) {
      state.journal = await api('/journal');
      renderAll();
      document.getElementById('status-text').textContent =
        `✓ ${state.selectedFile} copié vers ${destDir}`;
      state.selectedFile = null;
      state.selectedEparDir = null;
      document.getElementById('selected-info').classList.add('hidden');
    } else {
      document.getElementById('status-text').textContent = `✗ Erreur : ${res.error}`;
    }
  };

  document.getElementById('dialog-cancel').onclick = () => {
    document.getElementById('confirm-dialog').classList.add('hidden');
  };
}

// Init
loadConfig();

// Auto-scan if config already has paths
setTimeout(async () => {
  const active = configData.configs[configData.active];
  if (active && (active.source_data || (active.epars_dirs && active.epars_dirs.length > 0))) {
    document.getElementById('btn-scan').click();
  }
}, 300);
