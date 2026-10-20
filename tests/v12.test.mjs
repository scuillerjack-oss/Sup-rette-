// V1.2 : déplacer une étagère, événements de quartier, objectifs du jour, migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, newState, serialize, deserialize, GOAL_KINDS } from '../src/game.js';
import { SHELF_SLOTS, DOOR, EVENTS, EVENT_BY_ID, customersPerDay, SAVE_KEY } from '../src/data.js';
import { findPath } from '../src/layout.js';
import { playBot } from '../scripts/bot.mjs';

const front = (id) => { const sl = SHELF_SLOTS.find((s) => s.id === id); return { r: sl.r + 1, c: sl.c }; };

test('déplacer une étagère : produit et quantité suivent, gratuit, grille mise à jour', () => {
  const g = new Game();
  g.state.shelves[0] = { slot: 'A3', product: 'eau', qty: 11 };
  const coins = g.state.coins;
  assert.ok(g.blocked[3 * 9 + 3]);
  const r = g.moveShelf('A3', 'A1');
  assert.ok(r.ok, r.reason);
  const sh = g.state.shelves.find((x) => x.slot === 'A1');
  assert.deepEqual({ p: sh.product, q: sh.qty }, { p: 'eau', q: 11 });
  assert.ok(!g.state.shelves.some((x) => x.slot === 'A3'));
  assert.equal(g.state.coins, coins, 'gratuit');
  assert.equal(g.blocked[3 * 9 + 3], 0, 'ancien emplacement libéré');
  assert.equal(g.blocked[3 * 9 + 1], 1, 'nouvel emplacement bloqué');
});

test('déplacer une étagère : les refus (pris, allée fermée, même place, inconnue)', () => {
  const g = new Game();
  assert.equal(g.moveShelf('A3', 'A4').ok, false, 'déjà pris');
  assert.match(g.moveShelf('A3', 'B1').reason, /allée/);
  assert.equal(g.moveShelf('A3', 'A3').ok, false);
  assert.equal(g.moveShelf('A1', 'A2').ok, false, 'pas d’étagère en A1');
  assert.equal(g.moveShelf('A3', 'Z9').ok, false);
});

test('déplacer une étagère : interdit pendant qu’on la remplit ou qu’un client s’y sert', () => {
  const g = new Game();
  const shelf = g.state.shelves.find((x) => x.slot === 'A3');
  shelf.product = 'eau'; shelf.qty = 5;
  // le joueur remplit
  const f = front('A3');
  g.player.x = f.c; g.player.y = f.r;
  g.player.carry = { product: 'eau', qty: 12 };
  g.startFill(g.player, shelf, SHELF_SLOTS.find((s) => s.id === 'A3'));
  let r = g.moveShelf('A3', 'A1');
  assert.equal(r.ok, false);
  assert.match(r.reason, /remplir/);
  g.player.fill = null; g.player.carry = null;
  // un client se sert
  g.openStore();
  g.spawnCustomer();
  const cu = g.customers[0];
  cu.path = []; cu.x = f.c; cu.y = f.r; cu.state = 'browse'; cu.browseItem = { product: 'eau', want: 1 };
  r = g.moveShelf('A3', 'A1');
  assert.equal(r.ok, false);
  assert.match(r.reason, /client/);
  // quelqu'un debout sur l'emplacement visé
  cu.state = 'shop'; cu.x = 1; cu.y = 3;
  r = g.moveShelf('A3', 'A1');
  assert.equal(r.ok, false);
  assert.match(r.reason, /passe/);
  cu.x = 0; cu.y = 5;
  assert.ok(g.moveShelf('A3', 'A1').ok);
});

test('déplacer une étagère : chemins recalculés, tout le monde reste atteignable, la journée finit', () => {
  const g = new Game();
  g.state.zones = ['A', 'B', 'C'];
  g.state.licences = ['eau', 'pates', 'chips'];
  g.state.shelves = ['A1', 'A3', 'A5', 'B2', 'B4', 'C3'].map((slot, i) => ({ slot, product: ['eau', 'pates', 'chips'][i % 3], qty: 18 }));
  g.rebuild();
  g.openStore();
  for (let i = 0; i < 8; i++) g.spawnCustomer();
  let moves = 0;
  for (let t = 0; t < 4000 && g.state.phase !== 'summary'; t++) {
    if (t % 40 === 0) {
      const from = g.state.shelves[t % g.state.shelves.length].slot;
      const free = g.freeSlots();
      if (free.length && g.moveShelf(from, free[(t / 40) % free.length | 0].id).ok) moves++;
      // chaque personnage peut toujours rejoindre la porte, et sa destination
      for (const a of [g.player, ...g.customers]) {
        const tl = g.tileOf(a);
        assert.ok(findPath(g.blocked, tl.r, tl.c, DOOR.r, DOOR.c), `bloqué en ${tl.r},${tl.c}`);
        if (a.path.length) {
          const last = a.path[a.path.length - 1];
          assert.ok(findPath(g.blocked, tl.r, tl.c, last.r, last.c));
          assert.ok(a.path.every((s, k) => !g.blocked[s.r * 9 + s.c] || k === a.path.length - 1), 'chemin qui traverse une étagère');
        }
      }
    }
    if (g.state.minute > 9 * 60) g.state.minute = 20 * 60; // journée raccourcie
    // le joueur tient la caisse pour vider la file
    if (g.checkout) { g.checkout.items.forEach((it) => g.scan(it.i)); if (g.checkout?.step === 'exact') g.validateExact(); else if (g.checkout?.step === 'card') { for (const ch of String(g.checkout.total)) g.cardKey(ch); g.cardKey('ok'); } else if (g.checkout?.step === 'cash') { g.giveChange(g.changeDue()); g.validateCash(); } }
    else if (g.player.atRegister == null) g.tap(12, 1);
    g.update(0.1);
  }
  assert.ok(moves >= 5, `déplacements : ${moves}`);
  assert.equal(g.state.phase, 'summary', 'la journée doit se terminer');
});

test('déplacer une étagère au doigt : mode Déplacer (étagère puis « + »), cibles limitées', () => {
  const g = new Game();
  g.startMove();
  const tiles = g.actionTiles();
  assert.ok(tiles.every((t) => SHELF_SLOTS.some((s) => s.r === t.r && s.c === t.c)), 'seulement étagères et « + »');
  assert.ok(g.tap(1, 7).toast, 'l’ordinateur ne réagit pas en mode Déplacer');
  assert.equal(g.tap(3, 4).moveFrom, 'A4');
  assert.equal(g.tap(3, 7).moveDone, 'A7');
  assert.equal(g.moving, null);
  assert.ok(g.state.shelves.some((x) => x.slot === 'A7'));
  // depuis la fiche : départ déjà choisi ; retoucher l'étagère annule
  g.startMove('A3');
  assert.ok(g.tap(3, 3).moveCancelled);
  assert.equal(g.moving, null);
});

test('événements de quartier : effet moyen neutre, jour de marché = +30 % de clients', () => {
  const s = newState();
  const base = customersPerDay(s, 6);
  assert.ok(customersPerDay(s, 6, EVENT_BY_ID.marche.clients) >= Math.round(base * 1.25));
  const mean = EVENTS.reduce((a, e) => a + e.clients, 0) / EVENTS.length;
  assert.ok(mean > 0.95 && mean < 1.07, `moyenne ${mean}`);
  const g = new Game();
  g.state.day = 5;
  const seen = new Set();
  for (let i = 0; i < 200; i++) { g.planDay(); seen.add(g.state.event); }
  assert.ok(seen.has(null) && seen.size >= 4, 'jours normaux et événements variés');
  // soir de match : beaucoup de listes contiennent chips ou soda
  g.state.event = 'match';
  g.state.licences = ['eau', 'pates', 'chips', 'soda', 'biscuits', 'lait'];
  g.openStore();
  let hit = 0;
  for (let i = 0; i < 100; i++) { g.spawnCustomer(); const cu = g.customers.pop(); if (cu.list.some((x) => x.product === 'chips' || x.product === 'soda')) hit++; }
  assert.ok(hit > 60, `${hit} / 100`);
});

test('objectifs du jour : 3 objectifs, prime en pièces au bilan seulement si atteints', () => {
  const g = new Game();
  assert.equal(g.state.goals.list.length, 0, 'pas d’objectifs les 2 premiers jours (découverte)');
  g.state.day = 3;
  g.planDay();
  assert.equal(g.state.goals.list.length, 3);
  g.state.goals = { day: g.state.day, list: [{ kind: 'serve', target: 2, reward: 1000 }, { kind: 'calm', target: 0, reward: 700 }, { kind: 'perfect', target: 1, reward: 500 }] };
  g.state.stats.served = 6;
  g.state.stats.angry = 1;
  g.state.stats.perfect = 0;
  let st = g.goalsStatus();
  assert.equal(st[0].done, true);
  assert.equal(st[1].failed, true);
  const coins = g.state.coins;
  g.openStore();
  g.state.phase = 'closing';
  g.endDay();
  const sum = g.state.lastSummary;
  assert.equal(sum.goalCoins, 1000);
  assert.equal(sum.goals.filter((x) => x.done).length, 1);
  assert.ok(g.state.coins - coins <= 1000);
  g.nextDay();
  assert.equal(g.state.goals.day, g.state.day, 'nouveaux objectifs chaque jour');
  for (const k of g.state.goals.list) assert.ok(GOAL_KINDS[k.kind]);
});

test('monnaie juste comptée pour l’objectif « monnaie juste »', () => {
  const g = new Game();
  g.state.shelves[0] = { slot: 'A3', product: 'eau', qty: 10 };
  g.openStore();
  g.spawnCustomer();
  const cu = g.customers[0];
  cu.basket = [{ product: 'eau', price: 100 }];
  cu.register = 1;
  g.queues.get(1).push(cu.id);
  g.startPlayerCheckout(cu);
  g.checkout.step = 'cash'; g.checkout.paidWith = 500; g.checkout.given = [];
  g.giveChange(400);
  g.validateCash();
  assert.equal(g.state.stats.perfect, 1);
});

test('migration : une sauvegarde V1.1 (sans objectifs ni événement) se charge et joue', () => {
  const old = JSON.parse(serialize(newState()));
  delete old.goals; delete old.event; delete old.stats.perfect;
  old.day = 12; old.phase = 'open'; old.minute = 600;
  old.shelves = [{ slot: 'A2', product: 'eau', qty: 7 }, { slot: 'A4', product: 'pates', qty: 0 }];
  const s = deserialize(JSON.stringify(old));
  assert.ok(s);
  const g = new Game(s);
  assert.equal(g.state.goals.day, 12);
  assert.equal(g.state.goals.list.length, 3);
  assert.equal(g.state.shelves[0].qty, 7, 'stock intact');
  for (let i = 0; i < 50; i++) g.update(0.1);
  // aller-retour, et clé de sauvegarde inchangée
  assert.deepEqual(deserialize(serialize(g.state)).goals, g.state.goals);
  assert.equal(SAVE_KEY, 'superette-save-v1');
  // données abîmées : ignorées proprement
  const bad = JSON.parse(serialize(g.state));
  bad.event = 'inconnu'; bad.goals = { day: 12, list: [{ kind: 'xx', target: 1, reward: 1 }] };
  const s2 = deserialize(JSON.stringify(bad));
  assert.equal(s2.event, null);
  assert.equal(new Game(s2).state.goals.list.length, 3);
});

test('robot : rythme proche de la V1.1 (niveau 10 vers le jour 31)', () => {
  const days = [];
  for (let i = 0; i < 3; i++) days.push(playBot({ days: 45 }).marks.level10 ?? 99);
  const avg = days.reduce((a, b) => a + b, 0) / days.length;
  assert.ok(avg >= 26 && avg <= 36, `niveau 10 au jour ${avg.toFixed(1)} (${days.join(', ')})`);
});
