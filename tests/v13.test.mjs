// V1.3 : bêta qui se met à jour toute seule, version visible, « Nouvelle partie » qui marche,
// en-tête qui ne passe plus sous la barre du téléphone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Game, newState, serialize, deserialize } from '../src/game.js';
import { SAVE_KEY, SETTINGS_KEY } from '../src/data.js';
import { createSaver } from '../src/storage.js';
import { isNewerBuild, updateAction, fetchLatestVersion, parseBuild } from '../src/update.js';
import { versionCodeFor } from '../scripts/android-version.js';
import { betaConfig, BETA_URL } from '../scripts/apk-beta-config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// Construit le jeu dans un dossier temporaire (sans toucher au dist/ du dépôt).
function buildInTemp(commit) {
  const dir = mkdtempSync(join(tmpdir(), 'superette-v13-'));
  for (const f of ['build.mjs', 'package.json', 'template.html']) cpSync(join(root, f), join(dir, f));
  for (const d of ['src', 'public', 'vendor']) cpSync(join(root, d), join(dir, d), { recursive: true });
  execFileSync('node', ['build.mjs', commit], { cwd: dir, env: { ...process.env, GITHUB_SHA: '' } });
  return dir;
}

// ------------------------------------------------------------------ Problème 1 : mise à jour
test('version : comparaison numéro + commit', () => {
  assert.deepEqual(parseBuild('1.3.0+abc1234'), { nums: [1, 3, 0], sha: 'abc1234' });
  assert.equal(isNewerBuild('1.3.0+abc1234', '1.2.0+fff0000'), true, 'numéro plus grand');
  assert.equal(isNewerBuild('1.3.0+bbb2222', '1.3.0+abc1234'), true, 'même numéro, nouveau commit');
  assert.equal(isNewerBuild('1.3.0+abc1234', '1.3.0+abc1234'), false, 'identique');
  assert.equal(isNewerBuild('1.2.0+abc1234', '1.3.0+fff0000'), false, 'plus ancienne');
  assert.equal(isNewerBuild('', '1.3.0+abc1234'), false, 'hors ligne');
  assert.equal(isNewerBuild('<html>404</html>', '1.3.0+abc1234'), false, 'réponse invalide');
  assert.equal(isNewerBuild('1.4.0+abc1234', '1.3.0+local'), false, 'jamais en développement local');
});

test('mise à jour : rechargement au lancement une seule fois par version, sinon bandeau', () => {
  const cur = '1.3.0+aaaaaaa';
  assert.equal(updateAction('1.3.1+bbbbbbb', cur, { atLaunch: true, triedVersion: null }), 'reload');
  assert.equal(updateAction('1.3.1+bbbbbbb', cur, { atLaunch: true, triedVersion: '1.3.1+bbbbbbb' }), 'banner', 'pas de boucle');
  assert.equal(updateAction('1.3.1+bbbbbbb', cur, { atLaunch: false, triedVersion: null }), 'banner', 'partie en cours non coupée');
  assert.equal(updateAction(cur, cur, { atLaunch: true, triedVersion: null }), 'none');
});

test('mise à jour : version.txt lue sans cache, silencieuse en cas d’erreur', async () => {
  let opts = null;
  let asked = '';
  const ok = await fetchLatestVersion(async (u, o) => { asked = u; opts = o; return { ok: true, text: async () => '1.3.0+abc1234\n' }; });
  assert.equal(ok, '1.3.0+abc1234');
  assert.equal(opts.cache, 'no-store');
  assert.match(asked, /^version\.txt\?t=\d+$/, 'chemin relatif (même site que le jeu)');
  assert.equal(await fetchLatestVersion(async () => { throw new Error('hors ligne'); }), '');
  assert.equal(await fetchLatestVersion(async () => ({ ok: false })), '');
});

test('build : version « numéro+commit » dans le jeu, version.txt et service worker tamponnés', () => {
  const dir = buildInTemp('1234567abcdef');
  try {
    const { version } = JSON.parse(read('package.json'));
    const expected = `${version}+1234567`;
    assert.equal(readFileSync(join(dir, 'dist/version.txt'), 'utf8').trim(), expected);
    const html = readFileSync(join(dir, 'dist/index.html'), 'utf8');
    assert.ok(html.includes(`'${expected}'`), 'version embarquée dans le jeu');
    assert.ok(!html.includes('__BUILD__') && !html.includes('__VERSION__'));
    const sw = readFileSync(join(dir, 'dist/sw.js'), 'utf8');
    assert.ok(sw.includes(`const VERSION = '${expected}'`), 'cache nommé par version+commit');
    assert.match(html, /updateViaCache: 'none'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('service worker : réseau d’abord (plus de cache d’abord qui bloquait la V1.0)', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /const VERSION = '__VERSION__'/, 'plus de nom de cache figé');
  assert.match(sw, /cache: 'no-store'/);
  const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  assert.ok(fetchHandler.indexOf('await fetch(') < fetchHandler.indexOf('cache.match('), 'le réseau passe avant le cache');
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
});

test('service worker : en ligne la nouvelle page, hors ligne la copie en cache', async () => {
  const handlers = {};
  const store = new Map();
  const cache = { put: async (k, r) => store.set(String(k.url || k), r), match: async (k) => store.get(String(k.url || k)) || null, addAll: async () => {} };
  let online = true;
  let page = 'V1.3';
  const ctx = {
    self: { addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: 'https://x.io' }, registration: { scope: 'https://x.io/Sup-rette-/' }, skipWaiting: () => {}, clients: { claim: () => {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => { if (!online) throw new Error('hors ligne'); return { ok: true, type: 'basic', body: page, clone() { return { ...this }; } }; },
    Request: class { constructor(u, o) { this.url = u; Object.assign(this, o); } },
    URL, Response: { error: () => ({ error: true }) }
  };
  new Function(...Object.keys(ctx), read('public/sw.js'))(...Object.values(ctx));
  const nav = async () => {
    let p; const waits = [];
    handlers.fetch({ request: { method: 'GET', url: 'https://x.io/Sup-rette-/', mode: 'navigate' }, respondWith: (x) => { p = x; }, waitUntil: (w) => waits.push(w) });
    const r = await p; await Promise.all(waits); return r;
  };
  assert.equal((await nav()).body, 'V1.3');
  page = 'V1.4';
  assert.equal((await nav()).body, 'V1.4', 'nouvelle version dès le lancement suivant');
  online = false;
  assert.equal((await nav()).body, 'V1.4', 'hors ligne : dernière version gardée');
  online = true;
  let pv; const w = [];
  handlers.fetch({ request: { method: 'GET', url: 'https://x.io/Sup-rette-/version.txt?t=1', mode: 'cors' }, respondWith: (x) => { pv = x; }, waitUntil: (x) => w.push(x) });
  await pv; await Promise.all(w);
  assert.ok(![...store.keys()].some((k) => k.includes('version.txt')), 'version.txt jamais mis en cache');
});

test('APK : versionCode toujours croissant, y compris en passant de 1.2 à 1.3', () => {
  assert.ok(versionCodeFor('1.3.0', 6) > versionCodeFor('1.2.0', 5), 'V1.3 > V1.2 publiée (10200005)');
  assert.ok(versionCodeFor('1.3.0', 7) > versionCodeFor('1.3.0', 6));
  assert.ok(versionCodeFor('1.3.0', 1) > versionCodeFor('1.2.0', 999), 'monter la version repart plus haut');
  // depuis la V1.4 : la version publiée monte toujours (1.4.0 > 1.3.0)
  const v = JSON.parse(read('package.json')).version;
  assert.ok(versionCodeFor(v, 1) > versionCodeFor('1.3.0', 999), `version ${v}`);
});

test('APK : chargé depuis le site, tag « beta » déplacé à chaque publication', () => {
  const cfg = betaConfig(JSON.parse(read('capacitor.config.json')));
  assert.equal(cfg.server.url, BETA_URL);
  assert.equal(cfg.server.errorPath, 'offline.html');
  assert.equal(cfg.server.androidScheme, 'https');
  assert.equal(JSON.parse(read('capacitor.config.json')).server.url, undefined, 'config du dépôt embarquée');
  const wf = read('.github/workflows/android-apk.yml');
  assert.match(wf, /git\/refs\/tags\/beta/);
  assert.match(wf, /branches: \[main, 'mission\/\*\*'\]/);
  assert.match(wf, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(wf, /dist\/version\.txt/);
  assert.match(read('.github/workflows/deploy.yml'), /version\.txt/);
});

// ------------------------------------------------------------------ Problème 2 : nouvelle partie
test('nouvelle partie : l’ancienne partie n’est plus jamais réécrite (bug du rechargement)', () => {
  const storage = memStorage();
  const g = new Game();
  g.state.day = 17; g.state.coins = 99999; g.state.level = 6; g.state.reputation = 80;
  const saver = createSaver(storage, SAVE_KEY, () => g.state, { fresh: newState, serializeFn: serialize });
  saver.save();
  storage.setItem(SETTINGS_KEY, JSON.stringify({ sound: false, haptics: false }));
  saver.reset();
  // Le rechargement déclenche « page cachée » → save() : c’est ce qui ressuscitait l’ancienne partie.
  assert.equal(saver.save(), false);
  const reloaded = deserialize(storage.getItem(SAVE_KEY));
  assert.equal(reloaded.day, 1);
  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_KEY)), { sound: false, haptics: false }, 'réglages gardés');
});

test('nouvelle partie : tout est remis à zéro (jour, argent, stock, étagères, personnel, popularité, niveau, objectifs)', () => {
  const storage = memStorage();
  const g = new Game();
  const s = g.state;
  s.day = 12; s.coins = 123456; s.level = 9; s.xp = 400; s.reputation = 90; s.tutorial = 4;
  s.zones = ['A', 'B']; s.registers = [1, 2];
  s.shelves = [{ slot: 'A1', product: 'eau', qty: 12 }];
  s.delivery[0] = [{ product: 'pates', qty: 12 }];
  s.pending = [{ product: 'chips', at: 3 }];
  s.staff = { cashiers: [{ id: 1, name: 'Léa', level: 2, days: 3, look: 0 }], stocker: { id: 2, name: 'Momo', level: 3, days: 2, look: 1 } };
  s.goals = { day: 12, list: [] }; s.event = 'marche';
  s.totals = { revenue: 9999, served: 500, days: 11 };
  const saver = createSaver(storage, SAVE_KEY, () => g.state, { fresh: newState, serializeFn: serialize });
  saver.save();
  saver.reset();
  assert.deepEqual(deserialize(storage.getItem(SAVE_KEY)), deserialize(serialize(newState())));
});

test('nouvelle partie : stockage plein ou bloqué → la sauvegarde est au moins effacée', () => {
  const storage = memStorage();
  storage.setItem(SAVE_KEY, serialize({ ...newState(), day: 9 }));
  const failing = { ...storage, setItem: () => { throw new Error('plein'); }, removeItem: (k) => storage.removeItem(k) };
  const saver = createSaver(failing, SAVE_KEY, () => newState(), { fresh: newState, serializeFn: serialize });
  saver.reset();
  assert.equal(storage.getItem(SAVE_KEY), null);
});

test('nouvelle partie : le menu demande une confirmation, puis appelle le vrai effacement', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /this\.modals = \[\{ kind: 'reset' \}/, 'ouverte en priorité');
  assert.match(ui, /data-a="resetYes"/);
  assert.match(ui, /data-a="cancel"/);
  assert.match(ui, /resetYes'\) \{[\s\S]*?this\.hooks\.reset\(\)/);
  const main = read('src/main.js');
  assert.match(main, /reset: \(\) => \{\s*saver\.reset\(\);\s*location\.reload\(\);/);
  assert.match(main, /if \(noted\) \{/, 'pas de rechargement si la tentative ne peut pas être notée (anti-boucle)');
  assert.doesNotMatch(main, /localStorage\.setItem\(SAVE_KEY/, 'toutes les sauvegardes passent par le saver verrouillable');
});

// ------------------------------------------------------------------ Problème 3 : barre du téléphone
test('écran : l’en-tête descend sous la barre d’état, la barre du bas au-dessus de la navigation', () => {
  const t = read('template.html');
  assert.match(t, /--sat: max\(env\(safe-area-inset-top, 0px\), var\(--safe-area-inset-top, 0px\)\)/);
  assert.match(t, /\.hud \{[^}]*padding-top: calc\(8px \+ var\(--sat\)\)/);
  assert.match(t, /\.bar \{[^}]*calc\(8px \+ var\(--sab\)\)/);
  assert.match(read('build.mjs'), /viewport-fit=cover/);
  const cap = JSON.parse(read('capacitor.config.json'));
  assert.equal(cap.plugins.SystemBars.insetsHandling, 'css');
  assert.equal(cap.plugins.SystemBars.style, 'DARK', 'icônes claires sur l’en-tête sarcelle');
});

test('offline.html et version.txt publiés avec le jeu', () => {
  const dir = buildInTemp('abcdef0');
  try {
    assert.ok(existsSync(join(dir, 'dist/offline.html')));
    assert.ok(existsSync(join(dir, 'dist/version.txt')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('APK : l’ancien service worker est effacé une fois après chaque nouvel APK, sauvegarde gardée', () => {
  const java = read('scripts/natif/MainActivity.java');
  const { appId } = JSON.parse(read('capacitor.config.json'));
  assert.match(java, new RegExp(`^package ${appId.replace(/\./g, '\\.')};`, 'm'));
  assert.match(java, /extends BridgeActivity/);
  assert.match(java, /purgeServiceWorkerAfterUpdate\(\);\s*super\.onCreate/, 'avant le démarrage de la WebView');
  assert.match(java, /Service Worker/);
  assert.doesNotMatch(java, /Local Storage|deleteAllData|clearCache/, 'la partie n’est jamais effacée');
  assert.match(read('scripts/android-prepare.mjs'), /scripts\/natif\/MainActivity\.java/);
});
