// V1.5 : tutoriel facultatif et rejouable (partie d'essai séparée), code couleur des cartons, caisse non exploitable
// (bug de la bêta : 1 600 encaissés pour un ticket de 1,60).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, newState, serialize, deserialize, cashError, cashDetect, cashReaction, parseCardAmount } from '../src/game.js';
import { SAVE_KEY, SETTINGS_KEY, TUTO_SAVE_KEY, TUTO_FLAG_KEY, PRODUCTS, PRODUCT_BY_ID, CASH_ERRORS, cashThresholds, SHELF_SLOTS } from '../src/data.js';
import { createSaver } from '../src/storage.js';
import { sessionPlan, startTutorial, leaveTutorial, skipTutorial, tutorialState, savedTutoStep, STEPS, STEP_BY_ID, Tutorial } from '../src/tutorial.js';
import { playBot } from '../scripts/bot.mjs';
import { versionCodeFor } from '../scripts/android-version.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
// Simule main.js : plan de session → partie → saver sur la bonne clé.
function boot(storage) {
  const plan = sessionPlan(storage);
  const g = new Game(plan.state || newState());
  const saver = createSaver(storage, plan.key, () => g.state, { fresh: plan.fresh, serializeFn: serialize });
  return { plan, g, saver };
}
// Une partie normale déjà jouée (jour 6, beaucoup de pièces).
function normalGame(storage) {
  const s = newState();
  s.day = 6; s.coins = 98765; s.level = 4; s.totals.served = 77;
  storage.setItem(SAVE_KEY, serialize(s));
  return storage.getItem(SAVE_KEY);
}
const run = (g, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) g.update(dt); };

// ------------------------------------------------------------------ tutoriel : démarrage, saut, quitter, reprendre
test('tutoriel : proposé au tout premier lancement seulement, « Passer » ne le repropose plus', () => {
  const st = memStorage();
  let { plan } = boot(st);
  assert.equal(plan.mode, 'normal');
  assert.equal(plan.offer, true, 'premier lancement : proposé');
  skipTutorial(st);
  ({ plan } = boot(st));
  assert.equal(plan.offer, false, 'passé : plus proposé');
  assert.equal(plan.key, SAVE_KEY);
});

test('tutoriel : jamais imposé à un joueur qui a déjà une partie (simple annonce, partie chargée)', () => {
  const st = memStorage();
  const before = normalGame(st);
  const { plan, g } = boot(st);
  assert.equal(plan.offer, false);
  assert.equal(plan.announce, true);
  assert.equal(plan.mode, 'normal');
  assert.equal(g.state.day, 6);
  assert.equal(st.getItem(SAVE_KEY), before);
});

test('tutoriel : partie d’essai séparée, superette-save-v1 intacte AVANT, PENDANT et APRÈS', () => {
  const st = memStorage();
  const before = normalGame(st);
  // avant : on joue un peu la partie normale puis on lance le tutoriel depuis le menu
  let { g, saver } = boot(st);
  g.state.coins = 11111;
  startTutorial(st, saver, { fresh: true });
  const atStart = st.getItem(SAVE_KEY);
  assert.equal(JSON.parse(atStart).coins, 11111, 'la dernière partie normale a été sauvegardée avant');
  // la sauvegarde de la partie normale est verrouillée (la page « cachée » au rechargement ne réécrit rien)
  g.state.coins = 1;
  assert.equal(saver.save(), false);
  assert.equal(st.getItem(SAVE_KEY), atStart);
  // pendant : la partie d'essai se charge sous sa propre clé et s'y sauvegarde
  ({ g, saver } = boot(st));
  assert.equal(g.state.tutoMode, true);
  assert.equal(g.state.day, 1);
  assert.notEqual(g.state.coins, 11111);
  g.state.coins = 22222;
  g.order({ eau: 1 });
  run(g, 3);
  saver.save();
  assert.equal(st.getItem(SAVE_KEY), atStart, 'pendant : clé normale jamais écrite');
  assert.ok(st.getItem(TUTO_SAVE_KEY), 'la partie d’essai a sa propre clé');
  assert.notEqual(TUTO_SAVE_KEY, SAVE_KEY);
  // après : on quitte, on retrouve sa partie telle quelle
  leaveTutorial(st, saver, { finished: false });
  ({ g } = boot(st));
  assert.equal(g.state.tutoMode, undefined);
  assert.equal(g.state.coins, 11111);
  assert.equal(st.getItem(SAVE_KEY), atStart, 'après : intacte');
  assert.ok(before);
});

test('tutoriel : quitter en cours puis reprendre à la même étape ; recommencer repart au début', () => {
  const st = memStorage();
  normalGame(st);
  let { g, saver } = boot(st);
  startTutorial(st, saver);
  ({ g, saver } = boot(st));
  const t = new Tutorial(g);
  t.update();
  t.confirm(); // intro → commander
  g.order({ eau: 1, pates: 1 });
  t.update();
  assert.equal(t.step.id, 'colors');
  saver.save();
  leaveTutorial(st, saver, { finished: false });
  assert.equal(savedTutoStep(st), STEP_BY_ID.colors, 'étape gardée');
  // reprendre
  ({ g, saver } = boot(st));
  assert.equal(g.state.tutoMode, undefined, 'de retour dans la partie normale');
  startTutorial(st, saver, { fresh: false });
  ({ g, saver } = boot(st));
  assert.equal(new Tutorial(g).step.id, 'colors', 'reprise à la même étape');
  // recommencer (depuis le tutoriel)
  saver.lock();
  startTutorial(st, null, { fresh: true });
  ({ g } = boot(st));
  assert.equal(new Tutorial(g).step.id, 'intro');
});

test('tutoriel : terminé → partie d’essai effacée, retour à la partie normale, rejouable', () => {
  const st = memStorage();
  normalGame(st);
  let { g, saver } = boot(st);
  startTutorial(st, saver);
  const before = st.getItem(SAVE_KEY);
  ({ g, saver } = boot(st));
  g.state.tuto.step = STEPS.length - 1;
  assert.ok(new Tutorial(g).finished);
  leaveTutorial(st, saver, { finished: true });
  assert.equal(st.getItem(TUTO_SAVE_KEY), null);
  ({ g, saver } = boot(st));
  assert.equal(g.state.day, 6);
  assert.equal(st.getItem(SAVE_KEY), before, 'fin du tutoriel : partie normale non réécrite');
  startTutorial(st, saver); // (sauvegarde la partie normale telle qu'elle est en mémoire, puis la verrouille)
  ({ g } = boot(st));
  assert.equal(g.state.tutoMode, true, 'rejouable');
});

test('tutoriel : le bouton Nouvelle partie (V1.3) marche toujours, et pas pendant le tutoriel', () => {
  const st = memStorage();
  normalGame(st);
  const { g, saver } = boot(st);
  st.setItem(SETTINGS_KEY, '{"sound":false}');
  saver.reset();
  const s = JSON.parse(st.getItem(SAVE_KEY));
  assert.equal(s.day, 1);
  assert.equal(st.getItem(SETTINGS_KEY), '{"sound":false}');
  assert.ok(g);
  // dans le menu du tutoriel, « Nouvelle partie » n'est pas proposé (il effacerait la partie d'essai, pas la vraie)
  const ui = read('src/ui.js');
  assert.match(ui, /\$\{tuto \? '' : '<div class="row"><div class="info"><b>Nouvelle partie/);
  assert.match(read('src/main.js'), /reset: \(\) => \{\s*saver\.reset\(\);\s*location\.reload\(\);/);
});

test('tutoriel : stockage indisponible → le jeu démarre quand même en partie normale', () => {
  const broken = { getItem() { throw new Error('non'); }, setItem() { throw new Error('non'); }, removeItem() { throw new Error('non'); } };
  const plan = sessionPlan(broken);
  assert.equal(plan.mode, 'normal');
  assert.doesNotThrow(() => startTutorial(broken, null));
  assert.doesNotThrow(() => leaveTutorial(broken, null));
});

// ------------------------------------------------------------------ tutoriel : contenu et parcours
test('tutoriel : étapes dans l’ordre demandé, chacune avec un objectif concret ou un bouton', () => {
  const ids = STEPS.map((s) => s.id);
  const order = ['order', 'colors', 'reserve', 'shelf', 'price', 'cash', 'card', 'summary', 'hire', 'build', 'move', 'levels', 'end'];
  let last = -1;
  for (const id of order) {
    const i = ids.indexOf(id);
    assert.ok(i > last, `${id} après l’étape précédente`);
    last = i;
  }
  for (const s of STEPS) {
    assert.ok(s.title && typeof s.text === 'function', s.id);
    assert.ok(s.button || typeof s.done === 'function', `${s.id} : objectif ou bouton`);
    assert.ok(typeof s.target === 'function', `${s.id} : cible à surligner`);
  }
});

test('tutoriel : les textes reflètent les règles réelles du code (pas de règle inventée)', () => {
  const g = new Game(tutorialState());
  const all = STEPS.map((s) => s.text(g, { sheet: null, cart: {} })).join(' ');
  assert.match(all, /30 cartons/, 'capacité de la réserve');
  assert.match(all, /3 cartons par pile/);
  assert.match(all, /18 articles/, 'capacité d’un rayon');
  assert.match(all, /7 journées/, 'contrat');
  assert.match(all, /niveau 2/i); assert.match(all, /niveau 3/i);
  assert.match(all, /0,50 pour l'Eau/, 'prix plancher de l’eau = prix d’achat unitaire (6,00 / 12)');
  assert.match(all, /virgule/);
  assert.doesNotMatch(all, /diamant/i);
});

test('tutoriel : parcours complet joué au moteur (scénario fixe, toutes les étapes réalisables)', () => {
  const g = new Game(tutorialState());
  const ui = { sheet: null, cart: {} };
  const t = new Tutorial(g);
  const tick = (secs = 0.2) => { run(g, secs); t.update(); };
  const at = (id) => assert.equal(t.step.id, id);
  // chaque étape : cible calculable sans erreur
  const checkTarget = () => assert.doesNotThrow(() => t.step.target(g, ui));
  t.update(); at('intro'); checkTarget();
  t.confirm(); tick(); at('order'); checkTarget();
  g.order({ eau: 1, pates: 1 }); tick(); at('colors'); checkTarget();
  assert.equal(t.ready(), false, 'attend la livraison');
  assert.equal(t.confirm(), false);
  tick(15); assert.equal(t.ready(), true); t.confirm(); tick(); at('reserve'); checkTarget();
  // prendre un carton puis le reposer ailleurs
  const idx = g.state.delivery.findIndex((s) => s.length);
  const d = { r: Math.floor(idx / 9) + 1, c: idx % 9 };
  g.tap(d.r, d.c); tick(4);
  assert.ok(g.player.carry);
  checkTarget();
  const free = t.step.target(g, ui).tiles[0];
  g.tap(free.r, free.c); tick(4);
  at('shelf'); checkTarget();
  // ranger les deux cartons dans le rayon de leur couleur
  for (let k = 0; k < 2; k++) {
    const tile = t.step.target(g, ui).tiles[0];
    g.tap(tile.r, tile.c); tick(4);
    assert.ok(g.player.carry, 'carton pris');
    const sh = t.step.target(g, ui).tiles[0];
    const slot = SHELF_SLOTS.find((x) => x.r === sh.r && x.c === sh.c);
    assert.equal(g.state.shelves.find((x) => x.slot === slot.id).product, g.player.carry.product, 'étagère de sa couleur');
    g.tap(sh.r, sh.c); tick(6);
  }
  at('price'); checkTarget();
  g.setPrice('eau', g.state.prices.eau - 10); tick(); at('open'); checkTarget();
  g.openStore(); tick(); at('register'); checkTarget();
  g.tap(12, 1);
  // premier client : liste imposée, paiement en espèces imposé
  for (let i = 0; i < 400 && !g.checkout; i++) tick(0.1);
  assert.ok(g.checkout, 'un client arrive à la caisse');
  at('scan'); checkTarget();
  g.checkout.items.forEach((it) => g.scan(it.i)); tick(0.1);
  assert.equal(g.checkout.step, 'cash', 'paiement en espèces imposé');
  at('cash'); checkTarget();
  let due = g.changeDue();
  for (const v of [2000, 1000, 500, 200, 100, 50, 20, 10]) while (due >= v) { g.giveChange(v); due -= v; }
  g.validateCash(); tick(); at('card'); checkTarget();
  for (let i = 0; i < 600 && !(g.checkout && g.checkout.step !== 'scan'); i++) {
    if (g.checkout) g.checkout.items.forEach((it) => g.scan(it.i));
    tick(0.1);
  }
  assert.equal(g.checkout.step, 'card', 'paiement par carte imposé');
  const total = g.checkout.total;
  for (const ch of `${Math.floor(total / 100)},${String(total % 100).padStart(2, '0')}`) g.cardKey(ch);
  g.cardKey('ok'); tick(); at('day1'); checkTarget();
  // le joueur reste à la caisse jusqu'au soir
  g.speed = 3;
  for (let i = 0; i < 20000 && g.state.phase !== 'summary'; i++) {
    const co = g.checkout;
    if (co) {
      if (co.step === 'scan') co.items.forEach((it) => g.scan(it.i));
      else if (co.step === 'exact') g.validateExact();
      else if (co.step === 'card') { for (const ch of `${Math.floor(co.total / 100)},${String(co.total % 100).padStart(2, '0')}`) g.cardKey(ch); g.cardKey('ok'); }
      else if (co.step === 'cash') { let r = g.changeDue(); for (const v of [2000, 1000, 500, 200, 100, 50, 20, 10]) while (r >= v) { g.giveChange(v); r -= v; } g.validateCash(); }
    }
    tick(0.1);
  }
  g.speed = 1;
  at('summary'); checkTarget();
  assert.ok(g.state.lastSummary.missingBy.chips >= 1, 'le client aux Chips donne une demande non satisfaite');
  assert.ok(g.state.level >= 3, 'niveau 3 atteint : magasinier débloqué');
  g.nextDay(); tick(); at('hire'); checkTarget();
  const cand = g.ensureCandidates().stocker[0];
  assert.equal(g.hire('stocker', cand.id).ok, true, 'assez de pièces pour embaucher');
  tick(); at('build'); checkTarget();
  assert.equal(g.buyShelf(g.firstFreeSlot()).ok, true, 'assez de pièces pour une étagère');
  tick(); at('move'); checkTarget();
  g.startMove();
  assert.doesNotThrow(() => t.step.target(g, ui));
  const from = g.state.shelves.find((x) => x.product === 'eau').slot;
  g.moving.from = from;
  const to = t.step.target(g, ui).tiles[0];
  assert.ok(to, 'un « + » libre est surligné');
  g.tapMove(to.r, to.c); tick();
  at('levels'); checkTarget();
  t.confirm(); tick(); at('day2'); checkTarget();
  g.openStore();
  g.speed = 3;
  for (let i = 0; i < 20000 && g.state.phase !== 'summary'; i++) tick(0.1);
  at('end');
  assert.ok(t.finished);
});

// ------------------------------------------------------------------ code couleur des cartons
test('code couleur : chaque produit a une couleur d’étiquette distincte et nommée', () => {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const p of PRODUCTS) {
    assert.match(p.tag, /^#[0-9a-f]{6}$/i, p.id);
    assert.ok(p.tagName, p.id);
  }
  // deux couleurs ne sont jamais trop proches (distance RVB pondérée)
  const dist = (a, b) => { const [r1, g1, b1] = hex(a); const [r2, g2, b2] = hex(b); return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2); };
  for (let i = 0; i < PRODUCTS.length; i++) for (let j = i + 1; j < PRODUCTS.length; j++) {
    assert.ok(dist(PRODUCTS[i].tag, PRODUCTS[j].tag) > 90, `${PRODUCTS[i].id} / ${PRODUCTS[j].id} trop proches`);
  }
  // les 6 premiers produits (niveaux 1 à 3) : des couleurs franchement différentes
  assert.equal(new Set(PRODUCTS.slice(0, 6).map((p) => p.tagName)).size, 6);
});

test('code couleur : plus de nom écrit sur les cartons, le nom reste sur l’étagère avec la même couleur', () => {
  const r3 = read('src/render3d.js');
  const r2 = read('src/render.js');
  const cartonMat = r3.slice(r3.indexOf('cartonMat(pid, face)'), r3.indexOf('cartonMesh(pid)'));
  assert.doesNotMatch(cartonMat, /fillText/, '3D : aucun texte sur la texture du carton');
  assert.match(cartonMat, /p\.tag/);
  const labels = r3.slice(r3.indexOf('  stackLabels(ctx, unit) {'), r3.indexOf('  tagDot(ctx'));
  assert.doesNotMatch(labels, /fillText|short/, '3D : plus d’étiquette de nom sur les piles');
  const drawCarton = r2.slice(r2.indexOf('  drawCarton(cx, by'), r2.indexOf('  drawShelf(sl, sh, carry) {'));
  assert.doesNotMatch(drawCarton, /p\.short/, '2D : plus de nom sur les cartons');
  assert.match(drawCarton, /p\.tag/);
  // étagère : nom + couleur du code
  assert.match(r3, /shelfSign[\s\S]*?p \? p\.short : 'libre'[\s\S]*?p \? p\.tag/);
  assert.match(r3, /setColorAt\(obj\.hi, col\.set\(p \? p\.tag/);
  assert.match(r2, /ctx\.fillStyle = p \? p\.tag : '#9aa7b0'[\s\S]*?fillText\(p\.short/);
  // le tutoriel explique le code couleur
  assert.match(STEPS[STEP_BY_ID.colors].text(), /couleur/);
});

// ------------------------------------------------------------------ caisse (bug de la bêta)
test('caisse : seuils proportionnels au ticket (exemples du chef de projet)', () => {
  assert.deepEqual(cashThresholds(160), { discreet: 20, refuse: 200 });
  assert.deepEqual(cashThresholds(3000), { discreet: 150, refuse: 1000 });
  assert.deepEqual(cashThresholds(170), { discreet: 20, refuse: 200 });
  assert.deepEqual(cashThresholds(1000), { discreet: 50, refuse: 500 });
});

test('caisse : saisie au terminal bornée, virgule ou point (1,6 = 1,60 ; jamais 16 ni 1 600)', () => {
  assert.equal(parseCardAmount('1,60'), 160);
  assert.equal(parseCardAmount('1,6'), 160);
  assert.equal(parseCardAmount('1.6'), 160);
  assert.equal(parseCardAmount('1.60'), 160);
  assert.equal(parseCardAmount('2'), 200);
  assert.equal(parseCardAmount(',5'), 50);
  assert.equal(parseCardAmount('1600'), null, '4 chiffres avant la virgule : refusé');
  assert.equal(parseCardAmount('1,605'), null);
  assert.equal(parseCardAmount(''), null);
  assert.equal(parseCardAmount('1,2,3'), null);
  // au clavier : le 4e chiffre avant la virgule est refusé, 2 décimales au plus, une seule virgule
  const g = new Game();
  g.checkout = { step: 'card', card: '', total: 160, customerId: -1, items: [] };
  for (const k of '1600') g.cardKey(k);
  assert.equal(g.checkout.card, '160');
  g.checkout.card = '';
  for (const k of ['1', ',', '6', '0', '5', ',', '.']) g.cardKey(k);
  assert.equal(g.checkout.card, '1,60');
  g.checkout.card = '';
  for (const k of ['1', '.', '6']) g.cardKey(k);
  assert.equal(g.checkout.card, '1,6', 'le point devient une virgule');
  g.checkout.card = '';
  g.cardKey(',');
  assert.equal(g.checkout.card, '0,');
});

// Passage en caisse du joueur avec un ticket donné.
function checkoutWith(price, rnd = 0.5) {
  const g = new Game();
  g.state.shelves[0] = { slot: 'A3', product: 'eau', qty: 10 };
  g.rebuild();
  g.openStore();
  g.spawnCustomer();
  const cu = g.customers[0];
  cu.basket = [{ product: 'eau', price }];
  cu.register = 1;
  g.queues.get(1).push(cu.id);
  g.startPlayerCheckout(cu);
  g.checkout.items.forEach((it) => g.scan(it.i));
  g.checkout.step = 'card';
  g.checkout.card = '';
  const realRandom = Math.random;
  Math.random = () => rnd;
  return { g, cu, restore: () => { Math.random = realRandom; } };
}
const typeCard = (g, txt) => { for (const k of txt) g.cardKey(k); return g.cardKey('ok'); };

test('caisse : ticket 1,60 et « 1600 » tapé → au plus 160 au terminal, le client refuse, pas d’argent gagné', () => {
  const { g, cu, restore } = checkoutWith(160);
  try {
    const coins = g.state.coins;
    const rep = g.state.reputation;
    const res = typeCard(g, '1600'); // le 0 de trop est refusé : « 160 » = 160 pièces
    assert.equal(res.refused, true);
    assert.equal(g.state.coins, coins, 'aucune pièce encaissée');
    assert.equal(g.state.stats.revenue, 0);
    assert.equal(g.state.stats.served, 0, 'vente annulée');
    assert.equal(g.state.shelves[0].qty, 11, 'article reposé en rayon');
    assert.equal(cu.state, 'leaving');
    assert.ok(g.state.reputation <= rep - CASH_ERRORS.refuseLoss, 'forte baisse');
    assert.ok(rep - g.state.reputation > 2, 'nettement plus que −2');
    assert.ok(g.state.distrust > 0, 'bouche-à-oreille');
  } finally { restore(); }
});

test('caisse : ticket 1,60 → 1,70 peut passer inaperçu ; 2,00 se voit toujours mais il paie ; 3,70 il refuse', () => {
  // 1,70 : 0,10 de trop (≤ 0,20) : pas remarqué avec un tirage haut
  let c = checkoutWith(160, 0.99);
  try {
    const res = typeCard(c.g, '1,70');
    assert.equal(res.noticed, false);
    assert.equal(c.g.state.stats.revenue, 170);
  } finally { c.restore(); }
  // 1,70 : remarqué avec un tirage bas
  c = checkoutWith(160, 0.01);
  try { assert.equal(typeCard(c.g, '1.7').noticed, true, 'avec le point'); } finally { c.restore(); }
  // 2,00 : 0,40 de trop (> 0,20, ≤ 2,00) → toujours remarqué, il paie, la popularité baisse
  c = checkoutWith(160, 0.99);
  try {
    const rep = c.g.state.reputation;
    const res = typeCard(c.g, '2,00');
    assert.equal(res.noticed, true);
    assert.equal(res.refused, undefined);
    assert.equal(c.g.state.stats.revenue, 200);
    assert.ok(c.g.state.reputation < rep);
  } finally { c.restore(); }
  // 3,70 : 2,10 de trop (> 2,00) → refus
  c = checkoutWith(160, 0.99);
  try {
    assert.equal(typeCard(c.g, '3,70').refused, true);
    assert.equal(c.g.state.stats.revenue, 0);
  } finally { c.restore(); }
});

test('caisse : la perte de popularité grandit avec l’écart, et le refus coûte le plus', () => {
  const loss = (due, paid) => -cashReaction(cashError(due, paid), cashDetect(cashError(due, paid), 1, () => 0)).rep;
  const a = loss(3000, 3200); // 2 pièces
  const b = loss(3000, 3600); // 6 pièces
  const c = loss(3000, 4000); // 10 pièces (dernier montant accepté)
  const d = loss(3000, 4100); // refus
  assert.ok(a < b && b < c && c < d, `${a} < ${b} < ${c} < ${d}`);
  assert.ok(cashReaction(cashError(3000, 4100), true).refused);
  assert.equal(cashReaction(cashError(3000, 4000), true).refused, undefined);
});

test('caisse : espèces, rendre beaucoup trop peu → même règle (refus) ; trop rendu reste plafonné', () => {
  let { g, restore } = checkoutWith(160, 0.99);
  try {
    Object.assign(g.checkout, { step: 'cash', paidWith: 5000, given: [] });
    g.giveChange(1000); // devait rendre 48,40 : 38,40 gardés en trop
    const res = g.validateCash();
    assert.equal(res.refused, true);
    assert.equal(g.state.stats.revenue, 0);
  } finally { restore(); }
  ({ g, restore } = checkoutWith(160, 0.99));
  try {
    Object.assign(g.checkout, { step: 'cash', paidWith: 5000, given: [] });
    for (let i = 0; i < 5; i++) g.giveChange(2000); // 100 rendus au lieu de 48,40 : cadeau énorme
    const rep = g.state.reputation;
    g.validateCash();
    assert.ok(g.state.reputation - rep <= CASH_ERRORS.gainMax + 0.3 + 1e-9, 'gain plafonné (+ le merci d’un client content)');
    assert.ok(g.state.stats.revenue < 0, 'et ça coûte des pièces');
  } finally { restore(); }
});

test('caisse : un caissier ne peut pas être exploité (refus aussi au-delà du seuil, pas de bouche-à-oreille)', () => {
  const realRandom = Math.random;
  try {
    // article à 5,00 compté deux fois sur un ticket de 5,00 → 5,00 de trop > 2,50 (50 %) : refus
    let k = 0;
    const rolls = [0, 0, 0.1, 0.99];
    Math.random = () => rolls[Math.min(k++, rolls.length - 1)];
    const g = new Game();
    g.state.staff.cashiers = [{ id: 1, name: 'Léa', level: 1, days: 3, look: 0 }];
    g.player.atRegister = null;
    const cu = { ...g.makeAgent(10, 2, { kind: 'customer' }), basket: [{ product: 'eau', price: 500 }], mood: 1, register: 1, list: [], idx: 0, path: [] };
    g.customers.push(cu);
    g.queues.get(1).push(cu.id);
    g.updateRegister(1, 10);
    assert.equal(g.state.stats.revenue, 0, 'pas d’argent');
    assert.equal(g.state.stats.angry, 1);
    assert.equal(g.state.distrust || 0, 0, 'erreur d’un employé : pas de méfiance du quartier');
  } finally {
    Math.random = realRandom;
  }
});

test('caisse : la méfiance du quartier fait perdre des clients, puis s’efface nuit après nuit', () => {
  const g = new Game();
  g.state.distrust = 10;
  assert.ok(g.trustFactor() < 1);
  const before = g.dayMultiplier();
  g.state.phase = 'summary';
  g.nextDay();
  assert.ok(g.dayMultiplier() > before, 'divisée par 2 chaque nuit');
  for (let i = 0; i < 8; i++) { g.state.phase = 'summary'; g.nextDay(); }
  assert.equal(g.state.distrust, 0);
  assert.equal(g.trustFactor(), 1);
});

test('caisse : simulation — le tricheur finit plus pauvre que le joueur honnête (6 parties de 8 jours)', () => {
  const realRandom = Math.random;
  try {
    const final = (overcharge, sd) => {
      let seed = sd * 7919;
      Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      return playBot({ days: 8, overcharge, noInvest: true }).game.state.coins;
    };
    for (let sd = 1; sd <= 6; sd++) {
      const honest = final(0, sd);
      for (const oc of [100, 500, 1000]) {
        const cheat = final(oc, sd);
        assert.ok(honest > cheat, `partie ${sd}, ${oc / 100} pièces de trop à chaque client : honnête ${honest} > tricheur ${cheat}`);
      }
    }
  } finally {
    Math.random = realRandom;
  }
});

test('migration : une partie V1.4 se charge sans méfiance ni tutoriel, clé inchangée', () => {
  const s = newState();
  delete s.distrust;
  s.day = 9;
  const g = new Game(deserialize(serialize(s)));
  assert.equal(g.state.day, 9);
  assert.equal(g.trustFactor(), 1);
  assert.equal(SAVE_KEY, 'superette-save-v1');
  assert.ok(PRODUCT_BY_ID.eau.tag);
});

test('version : 1.5.0, versionCode au-dessus de la V1.4 publiée', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.equal(v, '1.5.0');
  assert.ok(versionCodeFor(v, 1) > versionCodeFor('1.4.0', 999));
  // le build embarque les deux nouveaux fichiers du tutoriel
  assert.match(read('build.mjs'), /'tutorial'[\s\S]*'tutoui'/);
});
