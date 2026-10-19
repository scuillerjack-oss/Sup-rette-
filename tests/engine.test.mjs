import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, newState, serialize, deserialize, cents } from '../src/game.js';
import { SHELF_SLOTS, REGISTERS, DELIVERY_SPOTS, COMPUTER, DOOR, ZONES } from '../src/data.js';
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
    ...DELIVERY_SPOTS.map((d) => ({ r: 2, c: d.c })),
    COMPUTER.access,
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
