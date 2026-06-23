function formatTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function formatDuration(sec) {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function getJournalFiles(journal) {
  const set = /* @__PURE__ */ new Set();
  for (const entry of journal) {
    if (entry.status === "copied") set.add(entry.filename);
  }
  return set;
}
function computeStatus(filename, sourceFiles, journal) {
  const inSource = Object.values(sourceFiles).some((idx) => filename in idx);
  if (inSource) return "doublon";
  const journaled = getJournalFiles(journal);
  if (journaled.has(filename)) return "traite";
  return "nouveau";
}
function countAllEparsFiles(eparsFiles) {
  let total = 0;
  for (const files of Object.values(eparsFiles)) {
    total += Object.keys(files).length;
  }
  return total;
}
function dirHasMatchingDescendant(node, term) {
  for (const [key, child] of Object.entries(node)) {
    if (key === "__files__") continue;
    if (key.toLowerCase().includes(term)) return true;
    if (dirHasMatchingDescendant(child, term)) return true;
  }
  return false;
}
export {
  computeStatus,
  countAllEparsFiles,
  dirHasMatchingDescendant,
  formatDuration,
  formatTime,
  getJournalFiles
};
