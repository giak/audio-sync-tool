// Audit des classes CSS mortes (Phase 0, doc refactoring 2026-09-19).
// RAPPORT SEUL : aucune suppression automatique — chaque candidat doit être
// vérifié à la main (le grep avait donné 66 candidates dont 8/8 faux positifs).
// Méthode : PurgeCSS purge en mémoire ; diff des classes présentes dans le
// CSS avant/après purge = classes jamais référencées dans le contenu.
// EPIC-036 P3 : le CSS vit en couches dans static/styles/ (source) — l'audit
// porte sur les sources, pas sur le bundle dist/script.css.
import { readFile } from 'node:fs/promises';
import { PurgeCSS } from 'purgecss';

const STYLE = [
  'static/styles/tokens.css',
  'static/styles/base.css',
  'static/styles/components.css',
  'static/styles/pages/index.css',
  'static/styles/pages/sync.css',
  'static/styles/pages/sync-main.css',
  'static/styles/pages/dups.css',
  'static/styles/pages/years.css',
  'static/styles/pages/playlist.css',
  'static/styles/pages/overlays.css',
  'static/styles/pages/cue-editor.css',
];

const original = (await Promise.all(STYLE.map(f => readFile(f, 'utf8')))).join('\n');
const results = await new PurgeCSS().purge({
  content: ['static/src/**/*.ts', 'templates/index.html'],
  css: STYLE,
  output: false,
});
// PurgeCSS renvoie UN résultat par fichier CSS — concaténer les sorties purgées
// avant d'extraire les classes (sinon on ne voit que le 1er fichier).

function classes(css) {
  return new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1]));
}

const before = classes(original);
const after = classes(results.map(r => r.css).join('\n'));
const unused = [...before].filter(c => !after.has(c)).sort();

if (unused.length === 0) {
  console.log('Aucune classe morte détectée.');
} else {
  console.log(`${unused.length} classes de ${before.size} non référencées dans le contenu :\n`);
  for (const c of unused) console.log(`  .${c}`);
}
