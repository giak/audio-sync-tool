import { state } from "./state.js";
import { revalidateFocus } from "./focus.js";
function openModal(name) {
  state.activeModal = name;
  document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  const el = document.getElementById("modal-" + name);
  if (el) el.classList.remove("hidden");
  setTimeout(() => {
    const focusable = el?.querySelector("button, input, select, textarea, [tabindex]");
    if (focusable) focusable.focus();
  }, 50);
}
function closeAllModals() {
  state.activeModal = null;
  document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  revalidateFocus();
}
const filterInput = document.getElementById("source-filter");
let filterDebounceTimer = null;
function initFilterPalette(onFilterChange) {
  if (!filterInput) return;
  filterInput.addEventListener("input", () => {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
      state.sourceFilter = filterInput.value;
      state.filterActive = !!state.sourceFilter;
      if (!state.filterActive) state.sourceExpanded.clear();
      onFilterChange();
    }, 150);
  });
}
function openFilterPalette(setActivePanel, renderSource) {
  setActivePanel("source");
  state.filterActive = true;
  state.sourceFilter = "";
  if (filterInput) {
    filterInput.value = "";
    filterInput.focus();
  }
  const countEl = document.getElementById("source-filter-count");
  if (countEl) countEl.textContent = "";
  document.getElementById("filter-palette")?.classList.remove("hidden");
  renderSource();
}
function closeFilterPalette(renderSource) {
  state.filterActive = false;
  state.sourceFilter = "";
  state.sourceExpanded.clear();
  if (filterInput) filterInput.value = "";
  document.getElementById("filter-palette")?.classList.add("hidden");
  renderSource();
  revalidateFocus();
}
function showError(msg) {
  const el = document.getElementById("status-text");
  if (!el) return;
  el.textContent = `\u26A0\uFE0F ${msg}`;
  el.style.color = "var(--led-red)";
  clearTimeout(el._errorTimer);
  el._errorTimer = setTimeout(() => {
    el.style.color = "";
    el.textContent = state.playlistMode ? "\u{1F3B5} Mode Playlist \u2014 Espace pour ajouter/retirer, Ctrl+S pour sauvegarder." : "Pr\xEAt.";
  }, 5e3);
}
export {
  closeAllModals,
  closeFilterPalette,
  initFilterPalette,
  openFilterPalette,
  openModal,
  showError
};
