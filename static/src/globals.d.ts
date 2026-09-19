// EPIC-036 P3 : les imports CSS (ex. `import '../styles/pages/index.css'` dans
// script.ts) sont résolus par esbuild, qui bundle le tout en
// static/dist/script.css — cette déclaration fait taire le typecheck.
declare module '*.css';
