// V1.7 : contrôle en Chrome mobile simulé (Playwright) du bug bloquant du jour 3 — « Préparer le jour N » coupé
// hors écran. Charge une partie au bilan du jour 3 très chargé (objectifs, 6 demandes ratées, erreurs de caisse,
// fin de contrat, intérimaire), à 390×844 puis 360×640, vérifie que le bouton est visible et touchable, le touche
// (et ferme la fausse pub imposée si elle s'affiche) et vérifie que le jour 4 démarre.
// Usage : node build.mjs && node scripts/check-bilan.mjs [dossier de captures]
// Playwright n'est PAS une dépendance du jeu : on le cherche dans PLAYWRIGHT_PATH ou l'installation globale.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { serialize, cents } from '../src/game.js';
import { playBot } from './bot.mjs';

export async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright'];
  try { tries.push(join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright', 'index.mjs')); } catch (e) { /* rien */ }
  for (const t of tries.filter(Boolean)) {
    try { return await import(existsSync(t) ? pathToFileURL(t).href : t); } catch (e) { /* suivant */ }
  }
  return null;
}

// Partie au bilan du jour 3, comme la capture de Jack du 28/10 (gros achat de stock, caissier 1★).
export function heavySummarySave() {
  const g = playBot({ days: 2 }).game;
  const s = g.state;
  s.level = Math.max(s.level, 3);
  s.coins += cents(150);
  const m = { id: g.newStaffId(), name: 'Léa', level: 1, look: 0, days: 1 };
  g.addToRoster('cashier', m, 'embauche');
  g.putUnderContract('cashier', m);
  s.temps.stocker = { day: s.day, kind: 'stocker', member: { id: g.newStaffId(), name: 'Hugo', level: 3, look: 1 }, replaces: null, onDuty: true };
  g.syncStaff();
  g.order({ eau: 6, pates: 6, chips: 4 });
  g.planDay();
  g.openStore();
  for (let i = 0; i < 20000 && s.phase !== 'summary'; i++) g.update(0.05);
  const sum = s.lastSummary;
  sum.missing = 6;
  sum.missingBy = { eau: 3, chips: 2, pates: 1 };
  sum.staffErrors = Math.max(3, sum.staffErrors || 0);
  sum.staffErrBy = { Léa: { level: 1, n: sum.staffErrors } };
  sum.rep = { prix: 0.2, service: 1.7, cadeau: 0.3, caissier: -2.3, choix: 0.6, personnel: -0.1 };
  sum.angry = Math.max(1, sum.angry);
  if (!sum.staffEnding.includes('Léa')) sum.staffEnding.push('Léa');
  sum.tempLeft = 'Hugo';
  return serialize(s);
}

export async function checkBilan({ dist = new URL('../dist/', import.meta.url).pathname, shots = null, sizes = [[390, 844, 3], [360, 640, 2.75]] } = {}) {
  const pw = await loadPlaywright();
  if (!pw) return { skipped: 'Playwright introuvable' };
  const save = heavySummarySave();
  const srv = createServer((q, r) => {
    let p = join(dist, decodeURIComponent(q.url.split('?')[0]));
    if (p.endsWith('/')) p += 'index.html';
    if (!existsSync(p)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': extname(p) === '.html' ? 'text/html' : 'application/octet-stream' });
    r.end(readFileSync(p));
  }).listen(0);
  let browser;
  try {
    // WebGL logiciel (SwiftShader) : la vraie 3D tourne aussi sans carte graphique.
    const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
    browser = await pw.chromium.launch({ channel: 'chrome', args }).catch(() => pw.chromium.launch({ args }));
  } catch (e) {
    srv.close();
    return { skipped: `navigateur indisponible : ${e.message.split('\n')[0]}` };
  }
  const out = [];
  try {
    for (const [w, h, dpr] of sizes) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
      await ctx.addInitScript((sv) => {
        if (sessionStorage.getItem('v17-init')) return;
        sessionStorage.setItem('v17-init', '1');
        localStorage.setItem('superette-save-v1', sv);
        localStorage.setItem('superette-tuto-v1', JSON.stringify({ seen: true, mode: 'normal' }));
      }, save);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://localhost:${srv.address().port}/index.html`);
      await page.waitForSelector('#modalCard [data-a="next"]', { timeout: 15000 });
      await page.waitForTimeout(2000); // fin de l'animation d'ouverture (lente au premier rendu 3D)
      if (shots) await page.screenshot({ path: join(shots, `bilan-${w}x${h}.png`) });
      const vis = await page.evaluate(() => {
        const b = document.querySelector('#modalCard [data-a="next"]');
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const card = document.querySelector('#modalCard').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, vh: innerHeight, hit: !!el && (el === b || b.contains(el)), cardTop: card.top, cardBottom: card.bottom, text: b.textContent };
      });
      await page.tap('#modalCard [data-a="next"]', { timeout: 10000 });
      await page.waitForTimeout(500);
      if (await page.$('#fakeAd')) {
        await page.waitForTimeout(3300);
        await page.tap('#fakeAd .fa-close');
        await page.waitForTimeout(500);
      }
      const after = await page.evaluate(() => ({ day: window.__game.state.day, phase: window.__game.state.phase }));
      out.push({ size: `${w}x${h}`, ...vis, after, errors });
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  return { results: out };
}

if (process.argv[1] && process.argv[1].endsWith('check-bilan.mjs')) {
  const r = await checkBilan({ shots: process.argv[2] || null });
  console.log(JSON.stringify(r, null, 1));
}
