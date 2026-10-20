// Assemble le jeu en un seul fichier HTML autonome.
//  - dist/index.html    : page complète (GitHub Pages + APK), avec manifeste et service worker
//  - dist/artifact.html : même jeu, sans <head>, pour l'aperçu dans Claude
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const order = ['data', 'layout', 'game', 'render', 'render3d', 'audio', 'tap', 'ui', 'main'];
let code = '';
for (const name of order) {
  let src = readFileSync(new URL(`./src/${name}.js`, import.meta.url), 'utf8');
  src = src.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  src = src.replace(/^export\s+(?=(const|let|function|class|async))/gm, '');
  code += `\n// ---- ${name}.js\n${src}`;
}
code = code.replace(/__VERSION__/g, pkg.version);
const bundle = `(() => {\n'use strict';\n${code}\n})();`;
// three.min.js r160 commence par un avertissement suivi d'une virgule : on le neutralise.
const three = readFileSync(new URL('./vendor/three.min.js', import.meta.url), 'utf8').replace(/^console\.warn\([^\n]*\),\n/, 'void 0,\n');
const body = readFileSync(new URL('./template.html', import.meta.url), 'utf8').replace('/*THREE*/', () => three).replace('/*BUNDLE*/', () => bundle);

const head = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f5c5a">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
</head><body>`;
const sw = `<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>`;

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
cpSync(new URL('./public/', import.meta.url), new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), `${head}${body}${sw}</body></html>`);
writeFileSync(new URL('./dist/artifact.html', import.meta.url), body);
console.log(`dist/index.html : ${((head.length + body.length) / 1024).toFixed(0)} Ko · version ${pkg.version}`);
