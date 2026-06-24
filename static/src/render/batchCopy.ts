// ─── Batch copy state (shared with actions.ts via getBatchCopy) ────────────

let _batchCopyTarget: string | null = null;
let _batchCopyFiles: Array<{ filename: string; eparDir: string; fullpath: string }> = [];

export function getBatchCopy(): {
  target: string | null;
  files: Array<{ filename: string; eparDir: string; fullpath: string }>;
} {
  const result = { target: _batchCopyTarget, files: _batchCopyFiles };
  _batchCopyTarget = null;
  _batchCopyFiles = [];
  return result;
}

export function setBatchCopy(target: string, files: Array<{ filename: string; eparDir: string; fullpath: string }>): void {
  _batchCopyTarget = target;
  _batchCopyFiles = files;
}
