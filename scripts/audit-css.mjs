// Audit des classes CSS mortes (Phase 0, doc refactoring 2026-09-19).
// RAPPORT SEUL : aucune suppression automatique — chaque candidat doit être
// vérifié à la main (le grep avait donné 66 candidates dont 8/8 faux positifs).
// Méthode : PurgeCSS purge en mémoire ; diff des classes présentes dans
// style.css avant/après purge = classes jamais référencées dans le contenu.
import { readFile } from 'node:fs/promises';
import { PurgeCSS } from 'purgecss';

const STYLE = 'static/style.css';

const original = await readFile(STYLE, 'utf8');
const [res] = await new PurgeCSS().purge({
  content: ['static/src/**/*.ts', 'templates/index.html'],
  css: [STYLE],
  output: false,
});

function classes(css) {
  return new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m => m[1]));
}

const before = classes(original);
const after = classes(res.css);
const unused = [...before].filter(c => !after.has(c)).sort();

if (unused.length === 0) {
  console.log('Aucune classe morte détectée.');
} else {
  console.log(`${unused.length} classes de ${before.size} non référencées dans le contenu :\n`);
  for (const c of unused) console.log(`  .${c}`);
}
