import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, newState, serialize, deserialize, cents } from '../src/game.js';
import { SHELF_SLOTS, REGISTERS, DELIVERY_SPOTS, DOOR, ZONES } from '../src/data.js';
import { buildBlocked, findPath } from '../src/layout.js';
import { playBot } from '../scripts/bot.mjs';

test('magasin complet : chaque accès reste atteignable depuis la porte', () => {
  const s = newState();
  s.zones = ZONES.map((z) => z.id);
  s.registers = REGISTERS.map((r) => r.id);
  s.shelves = SHELF_SLOTS.map((sl) => ({ slot: sl.id, product: null, qty: 0 }));
  const blocked = buildBlocked(s);
  const targets = [
    ...SHELF_SLOTS.map((sl) => ({ r: sl.r + 1, c: sl.c })),
    ...DELIVERY_SPOTS.map((d) => ({ r: d.r, c: d.c })),
    ...REGISTERS.flatMap((r) => [r.staff, r.pay, ...r.queue])
  ];
  for (const t of targets) assert.ok(findPath(blocked, DOOR.r, DOOR.c, t.r, t.c), `case ${t.r},${t.c} inaccessible`);
});

test('commande : refuse sans pièces ou sans place, débite sinon', () => {
  const g = new Game();
  assert.equal(g.order({ eau: 100 }).ok, false);
  const before = g.state.coins;
  const r = g.order({ eau: 2 });
  assert.ok(r.ok);
  assert.equal(g.state.coins, before - cents(12));
  for (let i = 0; i < 300; i++) g.update(0.05);
  assert.equal(g.deliveryCount(), 2);
});

test('rendu de monnaie : trop rendu = perte, juste = recette complète', () => {
  const g = new Game();
  g.state.shelves[0] = { slot: 'A3', product: 'eau', qty: 10 };
  g.rebuild();
  g.openStore();
  // client fictif à la caisse
  g.spawnCustomer();
  const cu = g.customers[0];
  cu.basket = [{ product: 'eau', price: 100 }, { product: 'eau', price: 100 }];
  cu.register = 1;
  g.queues.get(1).push(cu.id);
  g.startPlayerCheckout(cu);
  g.checkout.items.forEach((it) => g.scan(it.i));
  const co = g.checkout;
  co.step = 'cash';
  co.paidWith = 500;
  co.given = [];
  const coins = g.state.coins;
  g.giveChange(200);
  g.giveChange(200);
  const res = g.validateCash();
  assert.ok(res.ok);
  assert.equal(res.excess, 100);
  assert.equal(g.state.coins - coins, 100); // 5,00 reçus − 4,00 rendus
});

test('sauvegarde : aller-retour sans perte', () => {
  const g = new Game();
  g.order({ chips: 1 });
  const s2 = deserialize(serialize(g.state));
  assert.deepEqual(s2, JSON.parse(serialize(g.state)));
});

test('robot : 20 journées sans blocage ni pièces négatives durables', () => {
  const r = playBot({ days: 20 });
  assert.equal(r.dayStats.length, 20);
  assert.ok(r.game.state.level >= 5, `niveau ${r.game.state.level}`);
  assert.ok(r.dayStats.slice(-5).every((d) => d.coins > 0));
});

test('migration : sauvegarde V0.1 → V1 (employés, prix sous le plancher)', () => {
  const old = JSON.parse(serialize(newState()));
  old.version = 1;
  old.staff = { cashier: 3, stocker: 2 };
  old.prices.eau = 10;
  const s = deserialize(JSON.stringify(old));
  assert.equal(s.version, 2);
  assert.equal(s.staff.cashiers[0].days, 3);
  assert.equal(s.staff.stocker.days, 2);
  assert.ok(s.prices.eau >= 50);
  const g = new Game(s);
  assert.ok(g.stocker);
});

test('carte : client facturé trop = recette encaissée, prix minimum respecté', () => {
  const g = new Game();
  g.setPrice('eau', 0);
  assert.equal(g.state.prices.eau, g.minPrice('eau'));
});

// ---- V1.1 : retours de Jack du 20/10/2026
import { nearestTarget, isTap, TAP_MOVE } from '../src/tap.js';
import { customersPerDay } from '../src/data.js';

test('toucher : un doigt à côté du « + » vise quand même la bonne case', () => {
  const g = new Game();
  const tiles = g.actionTiles();
  // toute la réserve et les emplacements libres de l'allée 1 font partie des cibles (V1.4 : plus d'ordinateur)
  assert.ok(DELIVERY_SPOTS.every((d) => tiles.some((t) => t.r === d.r && t.c === d.c)));
  const free = SHELF_SLOTS.find((sl) => sl.zone === 'A' && !g.state.shelves.some((x) => x.slot === sl.id));
  assert.ok(g.isActionTile(free.r, free.c), 'le « + » libre doit être touchable');
  // grille fictive : 40 px par case
  const cands = tiles.map((t) => ({ ...t, x: t.c * 40 + 20, y: t.r * 40 + 20 }));
  // doigt tombé sur le sol juste sous le « + » (case sans action)
  const hit = nearestTarget(cands, free.c * 40 + 24, free.r * 40 + 20 + 30);
  assert.deepEqual(hit, { r: free.r, c: free.c });
  assert.equal(nearestTarget(cands, 2000, 2000), null, 'trop loin : rien');
  // toucher du « + » → fiche « Nouvelle étagère »
  assert.equal(g.tap(free.r, free.c).open, 'buyShelf');
});

test('toucher : geste annulé par le téléphone compté s’il était court et immobile', () => {
  const d = { x: 100, y: 100, t: 0 };
  assert.ok(isTap(d, 100 + TAP_MOVE - 1, 100, 200));
  assert.ok(!isTap(d, 100 + TAP_MOVE + 5, 100, 200), 'glissé : pas un tap');
  assert.ok(!isTap(d, 100, 100, 5000), 'appui long : pas un tap');
});

test('étagère : bouton « Placer » = premier emplacement libre, installé et payé', () => {
  const g = new Game();
  const id = g.firstFreeSlot();
  assert.ok(id);
  const before = g.state.coins;
  const cost = g.nextShelfCost();
  assert.ok(g.buyShelf(id).ok);
  assert.equal(g.state.coins, before - cost);
  assert.ok(g.state.shelves.some((x) => x.slot === id));
  assert.notEqual(g.firstFreeSlot(), id);
});

test('popularité : plus haute = plus de clients, arnaque repérée = baisse rangée en « arnaque »', () => {
  const s = newState();
  const low = customersPerDay({ ...s, reputation: 5 }, 6);
  const high = customersPerDay({ ...s, reputation: 95 }, 6);
  assert.ok(high > low * 2, `${low} → ${high}`);
  const g = new Game();
  const r0 = g.state.reputation;
  g.addReputation(-2, 'arnaque');
  assert.equal(g.state.reputation, r0 - 2);
  assert.equal(g.state.stats.rep.arnaque, -2);
  // bilan du jour : choix en rayon et personnel comptés, détail dans le résumé
  g.state.shelves[0] = { slot: g.state.shelves[0].slot, product: 'eau', qty: 18 };
  g.openStore();
  g.state.phase = 'closing';
  g.endDay();
  const sum = g.state.lastSummary;
  assert.equal(sum.rep.arnaque, -2);
  assert.ok('choix' in sum.rep);
  // vieille sauvegarde sans détail de popularité : migrée sans plantage
  const old = JSON.parse(serialize(newState()));
  delete old.stats.rep;
  const back = deserialize(JSON.stringify(old));
  assert.deepEqual(back.stats.rep, {});
});

import { shouldCloseOnBackdrop, BACKDROP_GRACE_MS } from '../src/tap.js';
test('panneau : le « click » qui suit le tap sur le plan ne referme plus le panneau ouvert', () => {
  // bug : toucher l'ordinateur ou un « + » ouvrait le panneau puis le refermait aussitôt
  assert.equal(shouldCloseOnBackdrop(false, 1000, 1010), false, 'doigt posé sur le plan, pas sur le fond');
  assert.equal(shouldCloseOnBackdrop(true, 1000, 1000 + BACKDROP_GRACE_MS - 1), false, 'juste après l’ouverture');
  assert.equal(shouldCloseOnBackdrop(true, 1000, 1000 + BACKDROP_GRACE_MS + 50), true, 'vrai toucher du fond : ferme');
});
