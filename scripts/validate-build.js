#!/usr/bin/env node
/**
 * Post-build validation: checks that the bundled script.js is valid and
 * contains the expected exports. Run after build.js.
 *
 * Catches regressions like:
 *   - Missing/broken output file
 *   - Syntax errors in the bundle
 *   - Missing key exports (module not included in bundle)
 */
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(__dirname, '..', 'static', 'dist', 'script.js');

let errors = 0;

function fail(msg) {
  console.error(`  ❌ ${msg}`);
  errors++;
}

function ok(msg) {
  console.log(`  ✅ ${msg}`);
}

// 1. File exists and has reasonable size
try {
  const st = await stat(bundlePath);
  ok(`script.js exists (${(st.size / 1024).toFixed(0)} KB)`);
  if (st.size < 5000) {
    fail(`script.js is too small (${st.size} bytes) — likely an empty/broken build`);
  }
} catch {
  fail(`script.js not found at ${bundlePath}`);
  process.exit(1);
}

// 2. File is not empty and parses as valid JavaScript
const src = await readFile(bundlePath, 'utf-8');
if (src.trim().length === 0) {
  fail('script.js is empty — build produced no output');
  process.exit(1);
}
try {
  // Use Node's built-in parser (not eval — safe static parse)
  new Function(src);
  ok('script.js parses as valid JavaScript');
} catch (e) {
  fail(`script.js has syntax errors: ${e.message}`);
}

// 3. Key module signatures are present (string literals → survivent à la minification)
// Chaque module critique laisse une trace textuelle unique dans le bundle.
const moduleSignatures = [
  // eparsUI.ts → renderEpars()
  { label: 'renderEpars (éparpillé)', sig: 'epars-container' },
  // sourceTree.ts → renderSource()
  { label: 'renderSource (source data)', sig: 'source-container' },
  // actions.ts → executeCopy()
  { label: 'executeCopy (F5)', sig: '"F5"' },
  // actions.ts → runScan()
  { label: 'runScan (scan button)', sig: 'btn-scan' },
  // actions.ts → initApp()
  { label: 'initApp (API /load)', sig: '"/load"' },
  // playlistUI.ts → renderPlaylistPanel()
  { label: 'renderPlaylistPanel', sig: 'playlist-panel' },
];
for (const { label, sig } of moduleSignatures) {
  if (src.includes(sig)) {
    ok(`✅ "${sig}" — ${label}`);
  } else {
    fail(`"${sig}" NOT found — ${label} may be missing`);
  }
}

console.log(errors === 0 ? '\n✅ Build validation passed.' : `\n❌ Build validation failed with ${errors} error(s).`);
process.exit(errors === 0 ? 0 : 1);
