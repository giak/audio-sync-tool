# Source Data Navigation + F7 Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Source Data panel into a collapsible directory tree with F7 search filter and file counters.

**Architecture:** All changes are frontend-only. `renderSource()` is refactored to produce collapsed directories by default. A `Set` in `state` tracks expanded dirs. A filter string in `state` drives recursive filtering. Counters are computed during render.

**Tech Stack:** Vanilla JS (no dependencies), Flask backend unchanged.

## Global Constraints

- Zero npm dependencies; Flask (`pip install flask`) is the only external dep
- All changes in `static/script.js` and `static/style.css` only
- Éparpillé panel (left) behavior unchanged
- Copy via F5 only (no click-to-copy)
- Port 8765; Python 3.12

---

### Task 1: Collapsed directories + expand/collapse

**Files:**
- Modify: `static/script.js`
- Modify: `static/style.css`

**Interfaces:**
- Consumes: `state.sourceExpanded` (new `Set`)
- Produces: `toggleSourceDir(dirPath)`, refactored `renderSource()` + `renderSourceTree()`

- [ ] **Step 1: Add `sourceExpanded` to state**

Replace the state object's initial declaration to include `sourceExpanded`:

```javascript
const state = {
  sourceFiles: {},
  eparsFiles: {},
  journal: [],
  selectedFile: null,
  selectedEparDir: null,
  focusedPanel: null,
  focusedIndex: -1,
  eparsFileHint: null,
  sourceDirHint: null,
  sourceExpanded: new Set(),
  sourceFilter: '',
  filterActive: false
};
```

- [ ] **Step 2: Update `getItems()` for Source Data panel**

Change `getItems` to return only `.directory` when the container is the source panel:

```javascript
function getItems(container) {
  const sel = container.id === 'source-container'
    ? '.directory' : '.file-row, .directory';
  return container.querySelectorAll(sel);
}
```

- [ ] **Step 3: Write `renderSourceTree()` and refactor `renderSource()`**

Replace `renderSource()` and `renderTree()` with new versions that produce collapsed directories:

```javascript
function renderSource() {
  const container = document.getElementById('source-container');
  container.innerHTML = '';

  if (state.filterActive) {
    const filterBar = document.createElement('div');
    filterBar.id = 'source-filter-bar';
    filterBar.innerHTML = '<input id="source-filter" type="text" placeholder="Filtrer les dossiers…" spellcheck="false">';
    container.appendChild(filterBar);
  }

  if (state.filterActive && state.sourceFilter) {
    renderFilteredSource(container);
    return;
  }

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree = {};
    for (const [filename, data] of Object.entries(files)) {
      const relPath = data.path;
      const parts = relPath.split('/');
      if (parts.length === 1) {
        (tree['__root__'] = tree['__root__'] || []).push({filename, relPath, year: data.year});
      } else {
        let current = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]] = current[parts[i]] || {};
        }
        (current['__files__'] = current['__files__'] || []).push({filename, relPath, year: data.year});
      }
    }
    renderSourceTree(tree, container, dirPath);
  }
  updatePanelCounts();
}

function renderSourceTree(node, container, basePath) {
  const dirs = Object.keys(node).filter(k => k !== '__root__' && k !== '__files__').sort();
  for (const dirName of dirs) {
    const fullPath = basePath + '/' + dirName;
    const isExpanded = state.sourceExpanded.has(fullPath);
    const div = document.createElement('div');
    div.className = 'directory' + (isExpanded ? ' expanded' : '');
    div.textContent = dirName;
    div.dataset.dirpath = fullPath;
    div.onclick = (e) => { e.stopPropagation(); toggleSourceDir(fullPath); };
    container.appendChild(div);

    if (isExpanded) {
      const childContainer = document.createElement('div');
      childContainer.className = 'children';
      container.appendChild(childContainer);
      renderSourceTree(node[dirName], childContainer, fullPath);

      const allFiles = [...(node[dirName]['__root__'] || []), ...(node[dirName]['__files__'] || [])];
      for (const {filename, relPath, year} of allFiles) {
        const fullpath = fullPath + '/' + relPath;
        const row = makeFileEl(filename, relPath, 'doublon', fullpath, year);
        childContainer.appendChild(row);
      }
    }
  }
}
```

- [ ] **Step 4: Write `toggleSourceDir()`**

```javascript
function toggleSourceDir(dirPath) {
  if (state.sourceExpanded.has(dirPath)) {
    state.sourceExpanded.delete(dirPath);
  } else {
    state.sourceExpanded.add(dirPath);
  }
  renderSource();
  setTimeout(revalidateFocus, 0);
}
```

- [ ] **Step 5: Update keyboard handlers for Source Data dirs**

Change the `Enter` and `Space` handlers in the keydown listener — when focused on a Source Data directory, call `toggleSourceDir` instead of `el.click()`:

In the `Enter` branch, replace:
```javascript
} else if (type === 'dir' && state.focusedPanel === 'source') {
  el.click();
}
```
with:
```javascript
} else if (type === 'dir' && state.focusedPanel === 'source') {
  const dirPath = el.dataset.dirpath;
  if (dirPath) toggleSourceDir(dirPath);
}
```

Same change in the `Space` branch.

- [ ] **Step 6: Add `updatePanelCounts()` stub**

For now, an empty function that will be filled in Task 2:

```javascript
function updatePanelCounts() {
  // TODO: Task 2
}
```

Call it at the end of `renderSource()` and at the end of `renderEpars()`.

- [ ] **Step 7: Add CSS for expand/collapse**

Add to `static/style.css`:

```css
#source-container .directory.expanded::before { content: '📂  '; }
```

(The existing `.directory::before { content: '📁  '; }` already handles collapsed state and Éparpillé dirs — no change needed for collapsed.)

- [ ] **Step 8: Remove `selectDestination` from directory click**

In `renderTree()` (used only by Éparpillé now? No — `renderTree` is replaced by `renderSourceTree` for Source Data). The old `renderTree` function stays for the Éparpillé panel but is no longer called for Source Data. 

Actually, `renderTree` is no longer called at all — `renderSource()` now calls `renderSourceTree()` instead. The old `renderTree` function can be removed since it's dead code. But to be safe, just leave it — it won't be reached.

The key change: `div.onclick = () => selectDestination(div)` in the old `renderTree` should be removed since `renderSourceTree` uses `div.onclick = (e) => { e.stopPropagation(); toggleSourceDir(fullPath); }` instead.

- [ ] **Step 9: Verify and commit**

```bash
node -e "try { new Function(require('fs').readFileSync('static/script.js','utf8')); console.log('JS OK'); } catch(e) { console.log('JS error:', e.message); }"
rtk pytest test_app.py -v
rtk git add -A && rtk git commit -m "feat: collapsible Source Data dirs, dir-only keyboard nav"
```

---

### Task 2: File counters (per-directory + panel totals)

**Files:**
- Modify: `static/script.js`
- Modify: `static/style.css`

**Interfaces:**
- Consumes: `updatePanelCounts()` from Task 1
- Produces: dir-count spans, panel header counters

- [ ] **Step 1: Add dir-count CSS**

Already included in spec CSS section. Verify it's in `style.css`:

```css
.dir-count { font-size: 11px; color: #585b70; margin-left: 8px; font-family: monospace; }
.panel-header-count { font-size: 12px; color: #585b70; font-weight: normal; margin-left: 8px; }
```

- [ ] **Step 2: Compute per-dir file counts during tree build**

Modify `renderSourceTree()` to count files in each directory node and append a `<span class="dir-count">(n)</span>` after the directory name:

```javascript
function renderSourceTree(node, container, basePath) {
  const dirs = Object.keys(node).filter(k => k !== '__root__' && k !== '__files__').sort();
  for (const dirName of dirs) {
    const fullPath = basePath + '/' + dirName;
    const isExpanded = state.sourceExpanded.has(fullPath);
    const div = document.createElement('div');
    div.className = 'directory' + (isExpanded ? ' expanded' : '');
    div.dataset.dirpath = fullPath;
    div.onclick = (e) => { e.stopPropagation(); toggleSourceDir(fullPath); };

    // Count direct files in this dir
    const subNode = node[dirName];
    const fileCount = [...(subNode['__root__'] || []), ...(subNode['__files__'] || [])].length;
    div.textContent = dirName;
    const countSpan = document.createElement('span');
    countSpan.className = 'dir-count';
    countSpan.textContent = `(${fileCount})`;
    div.appendChild(countSpan);

    container.appendChild(div);

    if (isExpanded) {
      const childContainer = document.createElement('div');
      childContainer.className = 'children';
      container.appendChild(childContainer);
      renderSourceTree(subNode, childContainer, fullPath);

      const allFiles = [...(subNode['__root__'] || []), ...(subNode['__files__'] || [])];
      for (const {filename, relPath, year} of allFiles) {
        const fullpath = fullPath + '/' + relPath;
        const row = makeFileEl(filename, relPath, 'doublon', fullpath, year);
        childContainer.appendChild(row);
      }
    }
  }
}
```

- [ ] **Step 3: Implement `updatePanelCounts()`**

This function calculates totals for both panels and updates the `<h2>` headers:

```javascript
function updatePanelCounts() {
  // Éparpillé total
  let eparsTotal = 0;
  for (const files of Object.values(state.eparsFiles)) {
    eparsTotal += Object.keys(files).length;
  }
  const eparsHeader = document.querySelector('#panel-left h2');
  if (eparsHeader) {
    let txt = '📂 Éparpillé';
    if (eparsTotal > 0) txt += `  (${eparsTotal.toLocaleString()})`;
    eparsHeader.textContent = txt;
  }

  // Source Data total
  let sourceTotal = 0;
  for (const files of Object.values(state.sourceFiles)) {
    sourceTotal += Object.keys(files).length;
  }
  const sourceHeader = document.querySelector('#panel-right h2');
  if (sourceHeader) {
    let txt = '📂 Source Data';
    if (state.filterActive && state.sourceFilter) {
      let visibleTotal = 0;
      const visiblePaths = getVisibleDirPaths();
      for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
        for (const filename of Object.keys(files)) {
          if (isFileVisible(filename, dirPath, visiblePaths)) {
            visibleTotal++;
          }
        }
      }
      txt += `  (${visibleTotal.toLocaleString()} / ${sourceTotal.toLocaleString()})`;
    } else if (sourceTotal > 0) {
      txt += `  (${sourceTotal.toLocaleString()})`;
    }
    sourceHeader.textContent = txt;
  }
}
```

Add helper functions `getVisibleDirPaths()` and `isFileVisible()` — these can be simple stubs for now since filter isn't implemented yet:

```javascript
function getVisibleDirPaths() { return new Set(); }
function isFileVisible(filename, dirPath, visiblePaths) { return true; }
```

- [ ] **Step 4: Call `updatePanelCounts()` after scan and copy**

Ensure `updatePanelCounts()` is called:
- At the end of `renderSource()` (already done from Task 1)
- At the end of `renderEpars()` (already done from Task 1)
- After `renderAll()` in `renderAll` patch (line 260-265)

Verify the existing patch:
```javascript
const origRenderAll = renderAll;
renderAll = function() {
  origRenderAll();
  setTimeout(revalidateFocus, 0);
};
```

Add `updatePanelCounts()` call here:
```javascript
renderAll = function() {
  origRenderAll();
  updatePanelCounts();
  setTimeout(revalidateFocus, 0);
};
```

- [ ] **Step 5: Verify and commit**

```bash
node -e "try { new Function(require('fs').readFileSync('static/script.js','utf8')); console.log('JS OK'); } catch(e) { console.log('JS error:', e.message); }"
rtk pytest test_app.py -v
rtk git add -A && rtk git commit -m "feat: file counters per directory and panel totals"
```

---

### Task 3: F7 search filter

**Files:**
- Modify: `static/script.js`
- Modify: `static/style.css`

**Interfaces:**
- Consumes: `state.sourceFilter`, `state.filterActive`
- Produces: filter bar DOM, filtered render, F7/Enter/Escape handlers

- [ ] **Step 1: Add CSS for filter bar**

Verify in `style.css`:

```css
#source-filter { width: 100%; margin-bottom: 8px; padding: 4px 8px;
  background: #313244; color: #cdd6f4; border: 1px solid #45475a;
  border-radius: 4px; font-size: 13px; outline: none; }
#source-filter:focus { border-color: #89b4fa; }
#source-filter-count { font-size: 11px; color: #585b70; margin-bottom: 6px; }
```

- [ ] **Step 2: Add F7 keyboard handler**

In the keydown listener, add a new branch for F7 before the existing arrow keys:

```javascript
} else if (e.key === 'F7') {
  e.preventDefault();
  if (state.focusedPanel !== 'source') setFocusedPanel('source');
  state.filterActive = true;
  if (!state.sourceFilter) state.sourceFilter = '';
  renderSource();
  setTimeout(() => {
    const input = document.getElementById('source-filter');
    if (input) input.focus();
  }, 0);
  return;
```

Place this after the TAB handler and before the `if (!state.focusedPanel)` block.

Also add Escape handler at the end of the keydown listener (before the closing `});`):

```javascript
} else if (e.key === 'Escape' && state.filterActive) {
  state.filterActive = false;
  state.sourceFilter = '';
  state.sourceExpanded.clear();
  renderSource();
  setFocusedPanel('source');
  revalidateFocus();
```

- [ ] **Step 3: Add filter input event handler**

After `renderSource()` definition (or near the bottom of the file before the init), add:

```javascript
document.addEventListener('input', (e) => {
  if (e.target.id !== 'source-filter') return;
  state.sourceFilter = e.target.value;
  renderSource();
});
```

- [ ] **Step 4: Implement `renderFilteredSource()`**

This function walks the tree recursively, finds matching dirs, and renders only visible branches:

```javascript
function renderFilteredSource(container) {
  const term = state.sourceFilter.toLowerCase();
  if (!term) return;

  let matchCount = 0;

  for (const [dirPath, files] of Object.entries(state.sourceFiles)) {
    const tree = {};
    for (const [filename, data] of Object.entries(files)) {
      const relPath = data.path;
      const parts = relPath.split('/');
      if (parts.length === 1) {
        (tree['__root__'] = tree['__root__'] || []).push({filename, relPath, year: data.year});
      } else {
        let current = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]] = current[parts[i]] || {};
        }
        (current['__files__'] = current['__files__'] || []).push({filename, relPath, year: data.year});
      }
    }

    matchCount += renderFilteredNode(tree, container, dirPath, term);
  }

  // Show match count
  const countEl = document.createElement('div');
  countEl.id = 'source-filter-count';
  if (matchCount === 0) {
    countEl.textContent = 'Aucun dossier trouvé';
    countEl.style.color = '#fab387';
  } else {
    countEl.textContent = `${matchCount} dossier${matchCount > 1 ? 's' : ''} trouvé${matchCount > 1 ? 's' : ''}`;
  }
  container.prepend(countEl);
}

function dirNameMatches(dirName, term) {
  return dirName.toLowerCase().includes(term);
}

function anyDescendantMatches(node, term) {
  const dirs = Object.keys(node).filter(k => k !== '__root__' && k !== '__files__');
  for (const dirName of dirs) {
    if (dirNameMatches(dirName, term)) return true;
    if (anyDescendantMatches(node[dirName], term)) return true;
  }
  return false;
}

function renderFilteredNode(node, container, basePath, term) {
  let matchCount = 0;
  const dirs = Object.keys(node).filter(k => k !== '__root__' && k !== '__files__').sort();

  for (const dirName of dirs) {
    const fullPath = basePath + '/' + dirName;
    const selfMatch = dirNameMatches(dirName, term);
    const descMatch = anyDescendantMatches(node[dirName], term);

    if (!selfMatch && !descMatch) continue;

    const hasDirectFiles = (node[dirName]['__root__'] || []).length > 0 ||
      (node[dirName]['__files__'] || []).length > 0;
    const autoExpand = descMatch || (selfMatch && hasDirectFiles);

    const div = document.createElement('div');
    div.className = 'directory' + (autoExpand ? ' expanded' : '');
    div.dataset.dirpath = fullPath;
    div.onclick = (e) => { e.stopPropagation(); toggleSourceDir(fullPath); };
    div.textContent = dirName;

    const subNode = node[dirName];
    const fileCount = [...(subNode['__root__'] || []), ...(subNode['__files__'] || [])].length;
    const countSpan = document.createElement('span');
    countSpan.className = 'dir-count';
    countSpan.textContent = `(${fileCount})`;
    div.appendChild(countSpan);

    container.appendChild(div);
    matchCount++;

    if (autoExpand) {
      const childContainer = document.createElement('div');
      childContainer.className = 'children';
      container.appendChild(childContainer);
      matchCount += renderFilteredNode(subNode, childContainer, fullPath, term);

      const allFiles = [...(subNode['__root__'] || []), ...(subNode['__files__'] || [])];
      for (const {filename, relPath, year} of allFiles) {
        const fullpath = fullPath + '/' + relPath;
        const row = makeFileEl(filename, relPath, 'doublon', fullpath, year);
        childContainer.appendChild(row);
      }
    }
  }

  return matchCount;
}
```

- [ ] **Step 5: Update `toggleSourceDir` for filter mode**

When the filter is active, toggling a directory should add/remove from `sourceExpanded` but also NOT override the auto-expand that the filter does. The simplest approach: during filter mode, `sourceExpanded` is NOT used for auto-expand (the filter calculates visibility itself). When the user manually expands/collapses during a filter, it should toggle normally.

Update `toggleSourceDir`:

```javascript
function toggleSourceDir(dirPath) {
  if (state.sourceExpanded.has(dirPath)) {
    state.sourceExpanded.delete(dirPath);
  } else {
    state.sourceExpanded.add(dirPath);
  }
  renderSource();
  setTimeout(revalidateFocus, 0);
}
```

This is unchanged from Task 1 — it already works correctly. The filter render ignores `sourceExpanded` for auto-expand but respects it for manual toggle.

Wait, actually the filter renderer doesn't use `sourceExpanded` at all — it uses `autoExpand` which is based on filter matching. But when a user manually toggles a directory during a filter, we need `renderFilteredNode` to respect that toggle.

The simplest fix: merge `sourceExpanded` into the auto-expand logic during filter:

In `renderFilteredNode`, change:
```javascript
const autoExpand = descMatch || (selfMatch && hasDirectFiles);
```
to:
```javascript
const autoExpand = state.sourceExpanded.has(fullPath) || descMatch || (selfMatch && hasDirectFiles);
```

This way:
- Directories that the user manually expanded stay expanded during filter
- Matching descendant chains are auto-expanded
- Directories that match themselves are expanded only if manually toggled

- [ ] **Step 6: Handle Tab when filter input focused**

Currently the keydown listener has:
```javascript
if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
```

This prevents Tab from switching panels when the filter input is focused. Change the Tab handler to catch it before the early return:

```javascript
// TAB — switch panels (even when filter input is focused)
if (e.key === 'Tab') {
  e.preventDefault();
  // If filter input is focused, clear it before switching
  if (state.filterActive) {
    state.filterActive = false;
    state.sourceFilter = '';
    state.sourceExpanded.clear();
  }
  const next = state.focusedPanel === 'source' ? 'epars' : 'source';
  state.focusedIndex = -1;
  setFocusedPanel(next);
  renderSource();
  return;
}
```

Place this BEFORE the `if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;` line.

- [ ] **Step 7: Verify and commit**

```bash
node -e "try { new Function(require('fs').readFileSync('static/script.js','utf8')); console.log('JS OK'); } catch(e) { console.log('JS error:', e.message); }"
rtk pytest test_app.py -v
rtk git add -A && rtk git commit -m "feat: F7 search filter for Source Data dirs"
```

---

### Task 4: Handle edge cases and verify full flow

- [ ] **Step 1: Test empty states**

Verify the UI handles:
- Empty source data → no dirs shown, counters show 0
- Filter with no matches → orange "Aucun dossier trouvé"
- Single-file directories → count shows `(1)`

- [ ] **Step 2: Test keyboard flow end-to-end**

Start server: `venv/bin/python app.py`
Test:
1. Tab to Source Data → ↑↓ navigates dirs only
2. Enter on a dir → expands, shows sub-dirs (also collapsed)
3. Enter again → collapses
4. F7 → filter bar appears, focused
5. Type "rock" → dirs filtered live
6. Enter on a matching dir → expands
7. Escape → clears filter, restores collapsed view
8. Tab → switches to Éparpillé (filter cleared)

- [ ] **Step 3: Verify F5 still works**

With a file highlighted on left and a dir highlighted on right, press F5 → confirm dialog appears → copy works.

- [ ] **Step 4: Final commit**

```bash
rtk git add -A && rtk git commit -m "chore: edge cases and final polish"
```
