#!/usr/bin/env node
/**
 * Build: bundles static/src/script.ts → static/dist/script.js (single file).
 *
 * Usage:
 *   node build.js          — production build (sourcemap: linked)
 *   node build.js --watch  — watch mode for development (sourcemap: inline)
 *
 * No more manual entry point lists. No more bust-cache.py.
 * esbuild follows all imports from script.ts automatically.
 */
import * as esbuild from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';

const isWatch = process.argv.includes('--watch');

await rm('static/dist', { recursive: true, force: true });
await mkdir('static/dist', { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ['static/src/script.ts'],
  bundle: true,
  outfile: 'static/dist/script.js',
  format: 'esm',
  sourcemap: isWatch ? 'inline' : 'linked',
  target: 'es2022',
  minify: !isWatch,  // production build = minifié, watch = lisible
  logLevel: 'info',
});

if (isWatch) {
  await ctx.watch();
  console.log('👀 Watching static/src/ for changes...');
  console.log('   (Ctrl+C to stop)');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('✅ Build complete: static/dist/script.js');
}
