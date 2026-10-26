// Assemble le jeu en un seul fichier HTML autonome.
//  - dist/index.html    : page complète (GitHub Pages + APK), avec manifeste et service worker
//  - dist/artifact.html : même jeu, sans <head>, pour l'aperçu dans Claude
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
// Usage : node build.mjs [commit]   (par défaut $GITHUB_SHA, sinon « local »)

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const order = ['data', 'rewards', 'layout', 'game', 'storage', 'update', 'tutorial', 'render', 'render3d', 'audio', 'tap', 'ads', 'shop', 'ui', 'tutoui', 'main'];
let code = '';
for (const name of order) {
  let src = readFileSync(new URL(`./src/${name}.js`, import.meta.url), 'utf8');
  src = src.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  src = src.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  src = src.replace(/^export\s+(?=(const|let|function|class|async))/gm, '');
  code += `\n// ---- ${name}.js\n${src}`;
}
// Version affichée dans le jeu : « 1.3.0+abc1234 » (commit court, comme FRONTIÈRES: ARKEN).
const commit = String(process.argv[2] || process.env.GITHUB_SHA || 'local').slice(0, 7);
const BUILD = `${pkg.version}+${commit}`;
code = code.replace(/__VERSION__/g, pkg.version).replace(/__BUILD__/g, BUILD);
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
// updateViaCache: 'none' + update() à chaque retour dans l'appli : le téléphone vérifie sw.js sans passer par
// son cache, donc un ancien service worker (ex. celui de la V1.0) est remplacé dès la publication suivante.
const sw = `<script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); })).catch(() => {}));</script>`;

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
cpSync(new URL('./public/', import.meta.url), new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), `${head}${body}${sw}</body></html>`);
writeFileSync(new URL('./dist/artifact.html', import.meta.url), body);
// V1.3 : version publiée (lue par le jeu pour proposer la mise à jour) et service worker tamponné :
// son contenu change à chaque publication, le téléphone installe donc le nouveau et vide l'ancien cache.
writeFileSync(new URL('./dist/version.txt', import.meta.url), `${BUILD}\n`);
const swUrl = new URL('./dist/sw.js', import.meta.url);
const swSrc = readFileSync(swUrl, 'utf8');
if (!swSrc.includes('__VERSION__')) throw new Error('public/sw.js doit contenir __VERSION__');
writeFileSync(swUrl, swSrc.replace(/__VERSION__/g, BUILD));
console.log(`dist/index.html : ${((head.length + body.length) / 1024).toFixed(0)} Ko · version ${BUILD}`);
