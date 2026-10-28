// V1.7 : retours de bêta de Jack du 28/10/2026. Un test par bug corrigé :
//  1) bilan du jour 3 : « Préparer le jour N » coupé hors écran, impossible de continuer ;
//  2) image floue (qualité baissée pour de bon pendant le chargement, résolution plafonnée) ;
//  3) bilan, popularité et objectifs pas assez clairs ni justes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, newState, serialize, deserialize, cents, GOAL_KINDS } from '../src/game.js';
import { CASHIER_LEVELS, SETTINGS_KEY, SAVE_KEY } from '../src/data.js';
import { QUALITY_STEPS, QUALITY, renderPixelRatio, qualityStep } from '../src/render3d.js';
import { settings, QUALITY_MODES } from '../src/audio.js';
import { POP_GROUPS, popTip, popTotal, goalProgress, summaryHeadline } from '../src/ui.js';
import { rewardStatus } from '../src/rewards.js';
import { playBot } from '../scripts/bot.mjs';
import { checkBilan } from '../scripts/check-bilan.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const run = (g, secs, dt = 0.05) => { for (let t = 0; t < secs && g.state.phase !== 'summary'; t += dt) g.update(dt); };
const css = read('template.html');

// ------------------------------------------------------------------ 1. bug bloquant du bilan
test('bug 1 : toute fenêtre est limitée à la hauteur visible (zones sûres comprises) et défile à l’intérieur', () => {
  const modal = css.match(/#modal \{[^}]*\}/)[0];
  assert.match(modal, /padding-top: calc\(10px \+ var\(--sat\)\)/);
  assert.match(modal, /padding-bottom: calc\(10px \+ var\(--sab\)\)/);
  assert.match(css, /--mc-max: calc\(100dvh - var\(--sat\) - var\(--sab\) - 20px\)/);
  assert.match(css, /--mc-max: calc\(100vh - var\(--sat\) - var\(--sab\) - 20px\)/, 'repli pour les vieilles WebView');
  const card = css.match(/#modalCard \{[^}]*\}/)[0];
  assert.match(card, /max-height: var\(--mc-max\)/);
  assert.match(card, /overflow-y: auto/);
  // tutoriel : la fenêtre descend sous la bulle, mais reste dans l'écran
  assert.match(css, /#modal\.tt-room #modalCard \{[^}]*max-height:[^}]*--ttroom/);
  // coffre : l'animation reste coupée sur les côtés, mais le contenu défile si besoin
  assert.match(css, /#modalCard\.chest-card-modal \{[^}]*overflow-x: hidden; overflow-y: auto/);
});

test('bug 1 : au bilan, « Préparer le jour N » est dans un pied fixe, hors de la zone qui défile', () => {
  assert.match(css, /#modalCard\.has-foot \{[^}]*display: flex; flex-direction: column;[^}]*overflow: hidden/);
  assert.match(css, /#modalCard\.has-foot \.mc-scroll \{[^}]*flex: 1 1 auto; min-height: 0; overflow-y: auto/);
  assert.match(css, /#modalCard\.has-foot \.mc-foot \{[^}]*flex: none/);
  const ui = read('src/ui.js');
  assert.match(ui, /card\.classList\.toggle\('has-foot', m\.kind === 'summary'\)/);
  const html = ui.slice(ui.indexOf('  summaryHtml(d) {'), ui.indexOf('  doubleHtml(d) {'));
  const foot = html.indexOf('<div class="mc-foot">');
  assert.ok(foot > html.lastIndexOf('</div>\n      <div class="mc-foot">') - 1 && foot > 0);
  assert.ok(html.indexOf('data-a="next"') > foot, 'le bouton est dans le pied');
  assert.equal((html.match(/data-a="next"/g) || []).length, 1);
});

test('bug 1 : bilan très chargé → le jour suivant démarre (moteur), même après rechargement au bilan', () => {
  const r = playBot({ days: 3, cashierStars: 1 });
  const g = r.game; // le robot a déjà fait nextDay() : on rejoue un jour jusqu'au bilan
  g.openStore();
  run(g, 900);
  assert.equal(g.state.phase, 'summary');
  const day = g.state.day;
  const again = new Game(deserialize(serialize(g.state)));
  assert.equal(again.state.phase, 'summary');
  again.nextDay();
  assert.equal(again.state.day, day + 1);
  assert.equal(again.state.phase, 'prep');
});

test('bug 1 : Chrome mobile simulé 390×844 et 360×640, bilan chargé → bouton visible, touché, jour 4', { timeout: 240000 }, async (t) => {
  if (!existsDist()) return t.skip('dist/index.html absent : lancer node build.mjs');
  const r = await checkBilan();
  if (r.skipped) return t.skip(r.skipped);
  assert.equal(r.results.length, 2);
  for (const x of r.results) {
    assert.ok(x.top >= 0 && x.bottom <= x.vh, `${x.size} : bouton dans l’écran (${x.top}–${x.bottom} / ${x.vh})`);
    assert.ok(x.cardBottom <= x.vh && x.cardTop >= 0, `${x.size} : fenêtre dans l’écran`);
    assert.ok(x.hit, `${x.size} : rien ne recouvre le bouton`);
    assert.match(x.text, /Préparer le jour 4/);
    assert.deepEqual(x.after, { day: 4, phase: 'prep' }, `${x.size} : le jour 4 démarre`);
    assert.deepEqual(x.errors, []);
  }
});
function existsDist() {
  try { return read('dist/index.html').length > 1000; } catch (e) { return false; }
}

test('bug 1 : partie automatique sur 7 jours, sans aucun blocage', () => {
  const r = playBot({ days: 7, chests: true });
  assert.equal(r.dayStats.length, 7);
  assert.equal(r.game.state.day, 8);
  for (const d of r.dayStats) assert.ok(Number.isFinite(d.profit) && Number.isFinite(d.cash) && Number.isFinite(d.stockDelta));
});

// ------------------------------------------------------------------ 2. image floue
test('bug 2 : résolution jamais sous 2 (ou celle de l’écran) en Auto et Haute, à tous les paliers', () => {
  for (const dev of [1, 1.5, 2, 2.75, 3, 3.5]) {
    for (let lv = 0; lv < QUALITY_STEPS.length + 2; lv++) {
      const v = renderPixelRatio(dev, 'auto', lv);
      assert.ok(v >= Math.min(2, dev) && v <= dev, `auto ×${dev} palier ${lv} → ${v}`);
    }
    assert.equal(renderPixelRatio(dev, 'high', 9), Math.min(dev, 3));
  }
  // Xiaomi (×2,75) : pleine résolution au départ ; « Économe » seulement si on le choisit
  assert.equal(renderPixelRatio(2.75, 'auto', 0), 2.75);
  assert.equal(renderPixelRatio(2.75, 'eco'), 1.25);
  assert.doesNotMatch(read('src/render3d.js'), /this\.lowQuality \? 1\.25 : 2/, 'ancien plafond à 2 / 1,25 retiré');
});

test('bug 2 : la qualité auto ignore la chauffe, ne baisse que si c’est lent durablement, et remonte', () => {
  assert.ok(QUALITY.warmup >= 3 && QUALITY.window >= 2 && QUALITY.need >= 2);
  const p = { slow: 0, fast: 0 };
  assert.equal(qualityStep(0, 20, p), 0, 'une mesure lente ne suffit pas');
  assert.equal(qualityStep(0, 40, p), 0, 'remise à zéro par une mesure correcte');
  assert.equal(qualityStep(0, 20, p), 0);
  assert.equal(qualityStep(0, 20, p), 1, 'lent deux fois de suite : un cran');
  // ombres allégées d'abord, résolution en dernier
  assert.ok(QUALITY_STEPS[1].shadowMap < QUALITY_STEPS[0].shadowMap && QUALITY_STEPS[1].maxDpr === QUALITY_STEPS[0].maxDpr);
  let lv = 1;
  for (let i = 0; i < 40; i++) lv = qualityStep(lv, 5, p);
  assert.equal(lv, QUALITY_STEPS.length - 2, 'l’Auto ne descend jamais au palier « Économe »');
  assert.equal(qualityStep(lv, 58, p), lv);
  assert.equal(qualityStep(lv, 58, p), lv - 1, 'fluide à nouveau : on remonte');
  // dans le rendu : chauffe ignorée, la mesure ne démarre qu'après QUALITY.warmup secondes
  const src = read('src/render3d.js');
  assert.match(src, /if \(p\.warm < QUALITY\.warmup\) \{ p\.warm \+= dt; return; \}/);
});

test('bug 2 : réglage « Qualité d’image : Auto / Haute / Économe » dans le menu, nouvelle clé des réglages', () => {
  assert.deepEqual(QUALITY_MODES, ['auto', 'high', 'eco']);
  assert.ok(QUALITY_MODES.includes(settings.quality)); // défaut « Haute » depuis la V1.7.1
  const ui = read('src/ui.js');
  assert.match(ui, /<b>Qualité d’image<\/b>/);
  assert.match(ui, /data-a="quality"/);
  assert.match(ui, /case 'quality':[\s\S]*?this\.hooks\.saveSettings\(\)/);
  const main = read('src/main.js');
  assert.match(main, /settings, savedQuality\(st\)/); // V1.7.1 : lecture via savedQuality()
  // clés inchangées
  assert.equal(SETTINGS_KEY, 'superette-settings-v1');
  assert.equal(SAVE_KEY, 'superette-save-v1');
  for (const k of ['sound', 'haptics', 'simAds']) assert.ok(k in settings);
});

test('bug 2 : icônes et textures dessinées à la résolution de l’écran, plus de petites images agrandies', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /const d = Math\.min\(3, Math\.max\(2, \(typeof window !== 'undefined' && window\.devicePixelRatio\) \|\| 2\)\)/);
  const r3 = read('src/render3d.js');
  assert.match(r3, /canvasTex\(w, h, draw, k = 1\)/);
  assert.match(r3, /c\.scale\(kk, kk\)/);
  assert.equal((r3.match(/iconCanvas\(p, 256\)/g) || []).length, 2, 'icônes des cartons en 256 px');
  assert.match(r3, /sun\.shadow\.mapSize\.set\(2048, 2048\)/);
  assert.match(r3, /this\.overlay\.width = Math\.round\(this\.w \* Math\.min\(3, window\.devicePixelRatio \|\| 1\)\)/, 'calque des textes à la résolution réelle');
  assert.match(read('src/render.js'), /this\.dpr = Math\.min\(settings\.quality === 'eco' \? 2 : 3, window\.devicePixelRatio \|\| 1\)/);
});

// ------------------------------------------------------------------ 3. bilan, popularité, objectifs
function dayWith({ buy = {}, cashier = 0 } = {}) {
  const s = newState();
  s.day = 3; s.level = 3; s.coins = cents(400);
  s.shelves[0] = { slot: s.shelves[0].slot, product: 'eau', qty: 18 };
  s.shelves[1] = { slot: s.shelves[1].slot, product: 'pates', qty: 18 };
  const g = new Game(s);
  if (cashier) {
    const m = { id: g.newStaffId(), name: 'Léa', level: cashier, look: 0, days: 3 };
    g.addToRoster('cashier', m, 'embauche'); g.putUnderContract('cashier', m); g.syncStaff();
  }
  if (Object.keys(buy).length) assert.ok(g.order(buy).ok);
  g.openStore();
  run(g, 900);
  return g;
}

test('bug 3 : bilan — argent de la journée et stock gardé séparés, résultat réel = cash + stock', () => {
  const g = dayWith({ buy: { eau: 5, pates: 5, chips: 4 }, cashier: 1 });
  const d = g.state.lastSummary;
  assert.equal(d.cash, d.revenue - d.spent - d.charges + d.goalCoins, 'argent de la journée');
  assert.equal(d.profit, d.cash + d.stockDelta);
  assert.ok(d.stockDelta > 0, 'acheter du stock = de la marchandise gardée, pas une perte');
  assert.ok(d.cash < d.profit);
  // le résultat réel ne dépend pas de la quantité achetée : même journée, acheter plus = même résultat
  assert.equal(d.stockValue, g.stockValue());
  const h = summaryHeadline(d);
  assert.equal(h.cls, 'inv', 'Journée d’investissement');
  assert.match(h.text, /investissement/);
  assert.match(summaryHeadline({ cash: 3000, stockDelta: 0, profit: 3000, revenue: 5000, charges: 1700 }).text, /Belle journée/);
  const ui = read('src/ui.js');
  assert.match(ui, /Argent de la journée/);
  assert.match(ui, /Stock gardé pour demain/);
  assert.match(ui, /Résultat réel/);
});

test('bug 3 : le « Bilan doublé » double le résultat réel (stock compris) : acheter du stock ne l’exploite pas', () => {
  // résultat réel = ventes − coût d'achat des articles vendus − loyer + primes, quoi qu'on achète
  const a = dayWith({});
  const d = a.state.lastSummary;
  const expected = d.revenue - a.state.stats.cogs - d.charges + d.goalCoins;
  assert.ok(Math.abs(d.profit - expected) <= 2, `${d.profit} ≈ ${expected}`);
  // journée de Jack : −129,90 de trésorerie mais du stock gardé → bénéfice positif, doublable
  const g = dayWith({ buy: { eau: 6, pates: 6, chips: 6 }, cashier: 1 });
  const sum = g.state.lastSummary;
  assert.ok(sum.cash < 0);
  const st = rewardStatus(g.state, 'double');
  assert.equal(st.ok, sum.profit > 0);
  if (st.ok) {
    const coins = g.state.coins;
    const r = g.claimReward('double', { now: 0 });
    assert.equal(r.bonus, sum.profit);
    assert.equal(g.state.coins - coins, sum.profit);
    assert.ok(r.bonus < cents(60), 'jamais le prix du stock acheté');
  }
});

test('bug 3 : popularité — total du jour, 5 groupes courts, explication de la plus grosse baisse', () => {
  const rep = { prix: 0.2, service: 1.7, cadeau: 0.3, caissier: -2.3, choix: 0.6, personnel: -0.1 };
  assert.equal(Math.round(popTotal(rep) * 10) / 10, 0.4);
  assert.deepEqual(POP_GROUPS.map((x) => x.id), ['prix', 'clients', 'caisse', 'rayons', 'equipe']);
  for (const g of POP_GROUPS) assert.ok(g.label.length <= 12, `libellé court : ${g.label}`);
  const causes = POP_GROUPS.flatMap((x) => x.causes);
  for (const k of ['prix', 'service', 'attente', 'vide', 'cadeau', 'arnaque', 'caissier', 'choix', 'personnel']) assert.ok(causes.includes(k), k);
  const tip = popTip(rep, { staffErrBy: { Léa: { level: 1, n: 4 } } });
  assert.match(tip, /Ta caissière Léa 1★ s’est trompée 4 fois/);
  assert.match(tip, /mieux notée fait moins d’erreurs/);
  assert.match(popTip({ caissier: -0.6 }, { staffErrBy: { Hugo: { level: 2, n: 1 } } }), /Ton caissier Hugo 2★/);
  assert.match(popTip({ attente: -3.2 }), /fâchés d’attendre/);
  assert.equal(popTip({ service: 2 }), null, 'rien de négatif : pas d’explication');
  const ui = read('src/ui.js');
  assert.match(ui, /Popularité : \$\{fmt1\(popDay\)\} aujourd’hui →/);
  // les erreurs d'un caissier sont rangées à part, celles du joueur restent « arnaque »
  assert.match(read('src/game.js'), /re\.why === 'arnaque' && who === 'cashier' \? 'caissier' : re\.why/);
});

test('bug 3 : objectif de popularité adapté à l’équipe en poste, sans compter les erreurs du caissier', () => {
  const at = (cashier) => {
    const s = newState(); s.day = 3; s.level = 3; s.reputation = 27;
    const g = new Game(s);
    if (cashier) { const m = { id: g.newStaffId(), name: 'Léa', level: cashier, look: 0, days: 3 }; g.addToRoster('cashier', m, 'embauche'); g.putUnderContract('cashier', m); g.syncStaff(); }
    g.state.event = null; // même journée (pas de jour de marché d'un côté et de pluie de l'autre)
    return g.goalTargets().pop;
  };
  assert.ok(at(1) < at(5), `1★ ${at(1)} < 5★ ${at(5)}`);
  assert.ok(at(1) <= 1.5, `jour 3, popularité 27 %, caissier 1★ : ${at(1)} (avant : 2)`);
  // le cas de Jack : +0,4 au total dont −2,3 d'erreurs remarquées du caissier → objectif réussi (+2,7 ≥ cible)
  const st = { rep: { prix: 0.2, service: 1.7, cadeau: 0.3, caissier: -2.3, choix: 0.6, personnel: -0.1 } };
  assert.equal(GOAL_KINDS.pop.value(st), 2.7);
  assert.ok(GOAL_KINDS.pop.value(st) >= at(1));
  // les erreurs du joueur, elles, comptent
  assert.equal(GOAL_KINDS.pop.value({ rep: { service: 1, arnaque: -2 } }), 0);
});

test('bug 3 : objectif de ventes calé sur le stock disponible et réajusté jusqu’à l’ouverture, puis figé', () => {
  const s = newState(); s.day = 3; s.level = 3; s.coins = cents(300);
  s.shelves[0] = { slot: s.shelves[0].slot, product: 'eau', qty: 10 };
  const g = new Game(s);
  g.state.goals = { day: 3, list: [{ kind: 'sell', target: 99, reward: 200, auto: true }, { kind: 'perfect', target: 2, reward: 200, auto: true }, { kind: 'serve', target: 99, reward: 200, auto: true }] };
  const st0 = g.goalsStatus();
  assert.ok(st0[0].target <= Math.floor(10 * 0.75), `10 articles en stock → au plus 7 à vendre (${st0[0].target})`);
  g.order({ eau: 4, pates: 4 });
  const st1 = g.goalsStatus();
  assert.ok(st1[0].target > st0[0].target, 'stock commandé → objectif réajusté');
  // embauche d'un caissier sur la seule caisse : « monnaie juste » devient impossible → remplacé
  const m = { id: g.newStaffId(), name: 'Léa', level: 1, look: 0, days: 3 };
  g.addToRoster('cashier', m, 'embauche'); g.putUnderContract('cashier', m); g.syncStaff();
  g.openStore();
  const kinds = g.state.goals.list.map((x) => x.kind);
  assert.ok(!kinds.includes('perfect'));
  assert.equal(new Set(kinds).size, 3);
  const frozen = g.state.goals.list.map((x) => x.target).join();
  g.state.shelves[0].qty = 0;
  g.goalsStatus();
  assert.equal(g.state.goals.list.map((x) => x.target).join(), frozen, 'figé une fois le magasin ouvert');
});

test('bug 3 : progression affichée (27/29) dans le bilan et pendant la journée', () => {
  assert.equal(goalProgress({ kind: 'sell', value: 27, target: 29 }), '27/29');
  assert.equal(goalProgress({ kind: 'pop', value: 0.4, target: 1.3 }), '+0,4 / +1,3');
  assert.equal(goalProgress({ kind: 'stock', max: true, value: 1, target: 2 }), '1 (max 2)');
  assert.equal(goalProgress({ kind: 'calm', max: true, value: 0, target: 0 }), '0');
  const ui = read('src/ui.js');
  assert.match(ui, /<small>\$\{goalProgress\(x\)\}<\/small>/, 'au bilan');
  assert.match(ui, /class="gcur">\$\{curTxt\}/, 'sur le bouton 🎯 pendant la journée');
  assert.match(ui, /Réussi · \$\{goalProgress\(x\)\}/, 'dans le panneau des objectifs');
});

test('bug 3 : simulation — joueur correct avec un caissier 1★ : au moins 2 objectifs sur 3 en moyenne', { timeout: 240000 }, () => {
  let done = 0;
  let n = 0;
  for (let i = 0; i < 6; i++) {
    playBot({ days: 9, cashierStars: 1, onDay: (g) => {
      const d = g.state.lastSummary;
      if (!d.goals.length) return;
      n++;
      done += d.goals.filter((x) => x.done).length;
    } });
  }
  const avg = done / n;
  assert.ok(n >= 40, `${n} journées avec objectifs`);
  assert.ok(avg >= 2, `${avg.toFixed(2)} objectifs réussis sur 3 en moyenne`);
});

test('bug 3 : lisible à 360 px — libellés courts, montants jamais coupés, popularité en 2 colonnes', () => {
  assert.match(css, /\.sum-row b \{ white-space: nowrap; \}/);
  assert.match(css, /\.sum-pop \.poprows \{[^}]*grid-template-columns: 1fr 1fr/);
  assert.match(css, /\.sumgoals span \{ display: grid; grid-template-columns: 1\.2em 1fr auto;/);
  assert.ok(GOAL_KINDS.stock.short(2).length <= 24);
  assert.ok(GOAL_KINDS.pop.short(1.3).length <= 24);
  assert.ok(GOAL_KINDS.perfect.short(3).length <= 24);
});

test('version 1.7.0 et cahier des charges à jour', () => {
  const [a, b, c] = JSON.parse(read('package.json')).version.split('.').map(Number);
  assert.ok(a > 1 || (a === 1 && (b > 7 || (b === 7 && c >= 0))), 'au moins 1.7.0');
  const doc = read('docs/CAHIER-DES-CHARGES.md');
  assert.match(doc, /### V1\.7/);
  assert.match(doc, /## Prochaine version \(V1\.8\)/);
  assert.match(doc, /Concurrents/);
  // partie V1.6 au bilan : elle se recharge et l'ancien bilan (sans stock) s'affiche encore
  const s = newState(); s.phase = 'summary';
  s.lastSummary = { day: 1, revenue: 100, spent: 0, charges: 50, profit: 50, goals: [], goalCoins: 0, rep: {}, staffEnding: [], sold: 1, served: 1, angry: 0, missing: 0 };
  const g = new Game(deserialize(serialize(s)));
  assert.equal(g.state.lastSummary.profit, 50);
  assert.equal(summaryHeadline(g.state.lastSummary).cls, 'good');
});
