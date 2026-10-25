// V1.4 : rangement intelligent, réserve libre et agrandie, noms lisibles, demandes non satisfaites,
// erreurs de caisse selon la règle de Jack, apparence fixe des employés, migration d'une partie V1.3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, newState, serialize, deserialize, cashError, cashDetect, cashReaction, GOAL_KINDS } from '../src/game.js';
import {
  SHELF_SLOTS, SHELF_CAPACITY, DELIVERY_SPOTS, SPOT_STACK, RESERVE_CAPACITY, PRODUCTS, PRODUCT_BY_ID, STOCKER_LEVELS,
  SAVE_KEY, DOOR, spotIndex, staffLook, ZONES, REGISTERS, CASH_ERRORS
} from '../src/data.js';
import { findPath, countTurns, buildBlocked } from '../src/layout.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const slot = (id) => SHELF_SLOTS.find((s) => s.id === id);

// Magasin de test : rayons donnés, un magasinier du niveau voulu, la réserve vide.
function shop({ shelves, level = 1, cartons = {} }) {
  const g = new Game();
  const s = g.state;
  s.level = 6;
  s.licences = PRODUCTS.map((p) => p.id);
  s.shelves = shelves.map(([id, product, qty]) => ({ slot: id, product, qty }));
  for (const [idx, list] of Object.entries(cartons)) s.delivery[idx] = list.map((p) => ({ product: p, qty: PRODUCT_BY_ID[p].qty }));
  s.staff.stocker = { id: 7, name: 'Momo', level, days: 7, look: 3 };
  g.rebuild();
  g.syncStaff();
  return g;
}
const run = (g, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) g.update(dt); };
const shelf = (g, id) => g.state.shelves.find((x) => x.slot === id);

// Surveille chaque article posé par le personnel : jamais dans le rayon d'un autre produit.
function watchMixing(g) {
  const bad = [];
  const orig = g.stepFill.bind(g);
  g.stepFill = (agent, dt, per) => {
    const f = agent.fill;
    const before = f && f.shelf.qty;
    const product = agent.carry && agent.carry.product;
    orig(agent, dt, per);
    if (agent.kind !== 'player' && f && f.shelf.qty > before && f.shelf.product !== product) bad.push(`${product} → rayon ${f.shelf.product}`);
  };
  return bad;
}

// ------------------------------------------------------------------ B. rangement intelligent
test('rangement : scénario de Jack (eau pleine, pâtes vides, carton de pâtes SOUS le carton d’eau) → il range les pâtes', () => {
  for (let level = 1; level <= 5; level++) {
    const i = spotIndex(1, 2);
    const g = shop({ level, shelves: [['A3', 'eau', SHELF_CAPACITY], ['A4', 'pates', 0]], cartons: { [i]: ['pates', 'eau'] } });
    const bad = watchMixing(g);
    run(g, 40);
    assert.equal(shelf(g, 'A4').qty, 12, `niveau ${level} : les pâtes doivent être en rayon`);
    assert.equal(shelf(g, 'A4').product, 'pates');
    assert.equal(shelf(g, 'A3').product, 'eau');
    assert.equal(shelf(g, 'A3').qty, SHELF_CAPACITY);
    assert.deepEqual(g.state.delivery[i].map((c) => c.product), ['eau'], 'le carton d’eau reste en réserve (rayon plein)');
    assert.deepEqual(bad, []);
    assert.equal(g.stocker.carry, null, 'il ne garde pas le carton d’eau dans les bras');
  }
});

test('rangement : jamais d’eau sur les pâtes, même quand le rayon de pâtes est vide (tous les niveaux)', () => {
  for (let level = 1; level <= 5; level++) {
    const g = shop({ level, shelves: [['A3', 'eau', SHELF_CAPACITY], ['A4', 'pates', 0], ['A5', 'chips', 2]], cartons: { 0: ['eau', 'eau'], 2: ['chips'] } });
    const bad = watchMixing(g);
    run(g, 60);
    assert.equal(shelf(g, 'A4').qty, 0, `niveau ${level}`);
    assert.equal(shelf(g, 'A4').product, 'pates', 'le rayon de pâtes garde son produit');
    assert.equal(shelf(g, 'A5').qty, 14, 'les chips sont rangées avec les chips');
    assert.deepEqual(bad, []);
    assert.equal(g.state.delivery[0].length, 2, 'cartons d’eau laissés en réserve');
  }
});

test('rangement : il ne prend pas de carton sans rayon compatible libre (et ne tourne pas en rond)', () => {
  const g = shop({ shelves: [['A3', 'eau', SHELF_CAPACITY]], cartons: { 0: ['eau'], 3: ['chips'] } });
  let pickups = 0;
  const orig = g.takeCarton.bind(g);
  g.takeCarton = (...a) => { pickups++; return orig(...a); };
  run(g, 60);
  assert.equal(pickups, 0, 'aucun carton pris : pas de place en rayon');
  assert.equal(g.stocker.carry, null);
  assert.equal(g.deliveryCount(), 2);
  // il attend tranquillement : pas de chemin en cours, près de la réserve
  assert.equal(g.stocker.path.length, 0);
});

test('rangement : initiative, le rayon vide passe avant le rayon presque plein', () => {
  const g = shop({ level: 5, shelves: [['A3', 'eau', 10], ['A5', 'pates', 0]], cartons: { 0: ['eau'], 2: ['pates'] } });
  run(g, 0.2);
  for (let i = 0; i < 100 && !g.stocker.task; i++) g.update(0.05);
  assert.equal(g.stocker.task.product, 'pates', 'le rayon vide d’abord');
  run(g, 40);
  assert.equal(shelf(g, 'A5').qty, 12);
  assert.equal(shelf(g, 'A3').qty, SHELF_CAPACITY, 'puis il complète l’eau (5 étoiles : dès qu’il manque des articles)');
});

test('rangement : les étoiles ne changent que la vitesse et l’initiative (niveau 1 : il attend qu’un rayon baisse)', () => {
  // Rayon d'eau à 12/18 : le niveau 1 (seuil 40 %) n'y touche pas, le niveau 5 le complète.
  const g1 = shop({ level: 1, shelves: [['A3', 'eau', 12]], cartons: { 0: ['eau'] } });
  run(g1, 30);
  assert.equal(shelf(g1, 'A3').qty, 12);
  const g5 = shop({ level: 5, shelves: [['A3', 'eau', 12]], cartons: { 0: ['eau'] } });
  run(g5, 30);
  assert.equal(shelf(g5, 'A3').qty, SHELF_CAPACITY);
  // vitesse : le niveau 5 range plus vite que le niveau 1
  const time = (level) => {
    const g = shop({ level, shelves: [['A6', 'pates', 0]], cartons: { 0: ['pates'] } });
    let t = 0;
    while (shelf(g, 'A6').qty < 12 && t < 120) { g.update(0.05); t += 0.05; }
    return t;
  };
  assert.ok(time(5) < time(1) * 0.7, `${time(5)} s contre ${time(1)} s`);
  // seuils et réflexion progressifs
  for (let i = 1; i < 5; i++) {
    assert.ok(STOCKER_LEVELS[i].refill > STOCKER_LEVELS[i - 1].refill);
    assert.ok(STOCKER_LEVELS[i].think < STOCKER_LEVELS[i - 1].think);
  }
  // expliqué dans la fiche du personnel
  assert.match(read('src/ui.js'), /range toujours chaque produit dans son rayon/);
});

test('rangement : étagère neuve sans produit → seulement pour un produit qui n’a pas encore de rayon', () => {
  const g = shop({ level: 3, shelves: [['A3', 'eau', 2], ['A4', null, 0]], cartons: { 0: ['eau', 'eau'], 2: ['chips'] } });
  const bad = watchMixing(g);
  run(g, 60);
  assert.equal(shelf(g, 'A4').product, 'chips', 'les chips prennent l’étagère neuve');
  assert.equal(shelf(g, 'A3').product, 'eau');
  assert.ok(shelf(g, 'A3').qty > 2);
  assert.deepEqual(bad, []);
});

test('rangement : deux employés ne visent jamais le même carton ni le même rayon', () => {
  const g = shop({ level: 3, shelves: [['A2', 'eau', 0], ['A4', 'pates', 0], ['A6', 'chips', 0]], cartons: { 0: ['eau'], 2: ['pates'], 4: ['chips'] } });
  const lv = STOCKER_LEVELS[2];
  g.helpers = [g.makeAgent(3, 0, { kind: 'stocker', level: 3, speed: lv.speed, perUnit: lv.perUnit, carry: null, idle: 0, task: null, name: 'Inès' })];
  const bad = watchMixing(g);
  for (let t = 0; t < 60; t += 0.05) {
    g.update(0.05);
    const [a, b] = g.staffAgents();
    if (a.task && b.task) {
      if (a.task.carton && b.task.carton) assert.notEqual(a.task.carton, b.task.carton, 'même carton visé');
      if (a.task.shelf && b.task.shelf) assert.notEqual(a.task.shelf, b.task.shelf, 'même rayon visé');
    }
  }
  assert.deepEqual(['A2', 'A4', 'A6'].map((id) => shelf(g, id).qty), [12, 12, 12]);
  assert.deepEqual(bad, []);
});

test('rangement : le joueur prend le carton que le magasinier allait chercher → il change de tâche', () => {
  const i = spotIndex(1, 3);
  const g = shop({ level: 1, shelves: [['A4', 'pates', 0]], cartons: { [i]: ['pates'] } });
  for (let k = 0; k < 200 && !g.stocker.task; k++) g.update(0.05);
  assert.ok(g.stocker.task && g.stocker.task.carton, 'il est parti chercher le carton');
  // le joueur, déjà à côté, le prend avant lui
  g.player.x = 3; g.player.y = 2; g.player.path = [];
  assert.ok(g.takeCarton(g.player, i, g.stocker.task.carton));
  assert.equal(g.stocker.task, null, 'tâche abandonnée aussitôt');
  run(g, 20);
  assert.equal(g.stocker.carry, null);
  assert.equal(shelf(g, 'A4').qty, 0, 'rien de rangé par lui (le carton est chez le joueur)');
});

test('rangement : aucun rayon compatible → pas de boucle, la journée se termine avec un magasinier', () => {
  const g = shop({ level: 2, shelves: [['A3', 'eau', SHELF_CAPACITY]], cartons: { 0: ['eau', 'eau', 'eau'], 1: ['chips', 'soda'] } });
  let tasks = 0;
  const orig = g.chooseTask.bind(g);
  g.chooseTask = (a) => { const t = orig(a); if (t) tasks++; return t; };
  g.openStore();
  g.state.minute = 19.9 * 60;
  for (let k = 0; k < 6000 && g.state.phase !== 'summary'; k++) g.update(0.05);
  assert.equal(g.state.phase, 'summary');
  assert.equal(tasks, 0);
});

test('rangement : une longue partie avec magasinier sans aucun mélange de produits', () => {
  for (let level = 1; level <= 5; level += 2) {
    const g = shop({ level, shelves: [['A1', 'eau', 4], ['A2', 'pates', 0], ['A3', 'chips', 18], ['A5', 'soda', 9], ['A6', null, 0], ['A7', 'lait', 0]] });
    g.state.licences = ['eau', 'pates', 'chips', 'soda', 'lait', 'cafe'];
    const bad = watchMixing(g);
    g.order({ eau: 3, pates: 3, chips: 2, soda: 2, cafe: 2, lait: 1 });
    g.openStore();
    for (let k = 0; k < 8000 && g.state.phase !== 'summary'; k++) {
      if (g.state.minute > 11 * 60) g.state.minute = 20 * 60;
      if (g.checkout) g.abortCheckout();
      g.update(0.05);
    }
    assert.deepEqual(bad, [], `niveau ${level}`);
    assert.equal(shelf(g, 'A6').product, 'cafe', 'le café (sans rayon) prend l’étagère neuve');
  }
});

// ------------------------------------------------------------------ C. réserve
test('réserve : 30 cartons, plus d’ordinateur, toute la zone derrière les étagères est touchable', () => {
  assert.equal(RESERVE_CAPACITY, 30);
  const g = new Game();
  assert.equal(g.deliveryRoom(), 30);
  assert.ok(DELIVERY_SPOTS.length >= 27);
  const tiles = g.actionTiles();
  for (const d of DELIVERY_SPOTS) assert.ok(tiles.some((t) => t.r === d.r && t.c === d.c), `case ${d.r},${d.c}`);
  for (const f of ['src/data.js', 'src/game.js', 'src/layout.js', 'src/render.js', 'src/render3d.js']) assert.doesNotMatch(read(f), /COMPUTER/, f);
  assert.doesNotMatch(read('src/ui.js'), /ordinateur en haut/);
  // la première rangée d'étagères est descendue d'une ligne : la réserve est entièrement au-dessus
  assert.ok(ZONES[0].row > Math.max(...DELIVERY_SPOTS.map((d) => d.r)));
  // commande refusée au-delà de 30
  g.state.coins = 1e7;
  assert.equal(g.order({ eau: 31 }).ok, false);
  assert.ok(g.order({ eau: 30 }).ok);
  run(g, 30);
  assert.equal(g.deliveryCount(), 30, 'les 30 cartons trouvent leur place');
  assert.ok(g.state.delivery.every((st) => st.length <= SPOT_STACK));
  // tout reste accessible : chaque pile a une case libre voisine reliée à la porte, chaque rayon aussi
  assert.equal(g.layoutProblem(g.blocked), null);
});

test('réserve : poser un carton où l’on veut, le reprendre, le déplacer', () => {
  const g = new Game();
  g.state.delivery[0] = [{ product: 'chips', qty: 12 }];
  g.rebuild();
  g.player.x = 4; g.player.y = 5; g.player.path = [];
  // prendre
  assert.ok(g.tap(1, 0).moved);
  run(g, 5);
  assert.equal(g.player.carry && g.player.carry.product, 'chips');
  assert.equal(g.state.delivery[0].length, 0);
  // poser ailleurs (case derrière les étagères)
  const target = spotIndex(3, 6);
  assert.ok(g.tap(3, 6).moved);
  run(g, 5);
  assert.equal(g.player.carry, null);
  assert.equal(g.state.delivery[target][0].product, 'chips');
  assert.ok(g.blocked[3 * 9 + 6], 'une pile bloque le passage');
  assert.equal(g.layoutProblem(g.blocked), null);
});

test('réserve : emplacements invalides refusés avec un message clair', () => {
  const g = new Game();
  g.player.carry = { product: 'eau', qty: 12 };
  g.player.x = 4; g.player.y = 6; g.player.path = [];
  // pile pleine
  const full = spotIndex(1, 4);
  g.state.delivery[full] = [1, 2, 3].map(() => ({ product: 'eau', qty: 12 }));
  g.rebuild();
  assert.match(g.tap(1, 4).toast, /Pile pleine/);
  // quelqu'un debout sur la case
  g.state.delivery[full] = [];
  g.rebuild();
  g.state.staff.stocker = { id: 3, name: 'Momo', level: 1, days: 3, look: 0 };
  g.syncStaff();
  g.stocker.x = 7; g.stocker.y = 2; g.stocker.idle = 99;
  assert.match(g.tap(2, 7).toast, /Quelqu’un/);
  // enfermer une pile : on remplit le pourtour d'une case du fond
  g.stocker.x = 8; g.stocker.y = 3;
  for (const [r, c] of [[1, 1], [2, 0]]) g.state.delivery[spotIndex(r, c)] = [{ product: 'eau', qty: 12 }];
  g.state.delivery[spotIndex(1, 0)] = [{ product: 'pates', qty: 12 }];
  g.rebuild();
  // (1,0) a encore un voisin libre ? non : (1,1) et (2,0) sont pris → la pile (1,0) est déjà inaccessible ;
  // on vérifie plutôt qu'on ne peut pas créer cette situation : on retire (2,0) puis on essaie de la reposer.
  g.state.delivery[spotIndex(2, 0)] = [];
  g.rebuild();
  assert.equal(g.layoutProblem(g.blocked), null);
  const r = g.tap(2, 0);
  assert.match(r.toast, /inaccessible/);
  assert.equal(g.player.carry.product, 'eau', 'le carton reste en main');
});

test('réserve : la ligne derrière les étagères garde un passage (achat d’étagère qui couperait l’accès refusé)', () => {
  const g = new Game();
  g.state.coins = 1e6;
  // On remplit toute la ligne 3 sauf la colonne 0 et toute la ligne 2 sauf la colonne 0 → seul passage par la colonne 0
  for (let c = 1; c < 9; c++) {
    g.state.delivery[spotIndex(3, c)] = [{ product: 'eau', qty: 12 }];
  }
  g.rebuild();
  assert.equal(g.layoutProblem(g.blocked), null);
  // une étagère en A... il n'y a pas d'emplacement en colonne 0 ; on vérifie la règle directement
  const test = new Uint8Array(g.blocked);
  test[3 * 9 + 0] = 1;
  assert.match(g.layoutProblem(test), /inaccessible/);
});

test('réserve : un carton coincé sous d’autres peut être pris par le magasinier, même pile entourée sur 3 côtés', () => {
  const i = spotIndex(1, 4);
  const g = shop({ level: 1, shelves: [['A4', 'pates', 0], ['A5', 'eau', SHELF_CAPACITY]], cartons: { [i]: ['pates', 'eau', 'eau'], [spotIndex(1, 3)]: ['eau'], [spotIndex(1, 5)]: ['eau'] } });
  run(g, 60);
  assert.equal(shelf(g, 'A4').qty, 12);
  assert.deepEqual(g.state.delivery[i].map((c) => c.product), ['eau', 'eau']);
});

test('réserve : livraison posée sur une case libre, jamais sur quelqu’un ni en enfermant un rayon', () => {
  const g = new Game();
  g.state.coins = 1e6;
  g.player.x = 0; g.player.y = 1; g.player.path = [];
  assert.ok(g.order({ eau: 2, pates: 2 }).ok);
  run(g, 20);
  assert.equal(g.deliveryCount(), 4);
  assert.equal(g.state.delivery[spotIndex(1, 0)].length, 0, 'pas de carton sur le joueur');
  assert.equal(g.layoutProblem(g.blocked), null);
  // les cartons d'un même produit s'empilent ensemble (plus lisible)
  const stacks = g.state.delivery.filter((st) => st.length);
  assert.ok(stacks.every((st) => st.every((c) => c.product === st[0].product)));
});

// ------------------------------------------------------------------ A. lisibilité
test('lisibilité : chaque produit a un nom court écrit sur les cartons et les frontons d’étagères', () => {
  for (const p of PRODUCTS) {
    assert.ok(p.short && p.short.length <= 9, `${p.id} : « ${p.short} »`);
  }
  const r3 = read('src/render3d.js');
  assert.match(r3, /p\.short/, '3D : nom sur les cartons');
  assert.match(r3, /shelfSign/, '3D : panneau nommé sur le fronton');
  const r2 = read('src/render.js');
  assert.match(r2, /p\.short/, '2D : nom sur les cartons et les étagères');
});

test('apparence : un employé garde la même tête à chaque pas (tirée de sa fiche, jamais au hasard)', () => {
  const m = { id: 2, name: 'Momo', level: 1, days: 7, look: 4 };
  assert.deepEqual(staffLook(m), staffLook({ ...m }));
  const g = shop({ level: 1, shelves: [['A4', 'pates', 0]], cartons: { 0: ['pates'] } });
  const look = g.stocker.look;
  assert.ok(look && look.hair && look.skin, 'apparence attachée au magasinier');
  run(g, 10);
  assert.equal(g.stocker.look, look, 'même objet après des déplacements');
  // le rendu 3D ne choisit pas l'apparence d'après l'identifiant de l'objet
  assert.match(read('src/render3d.js'), /staffLook\(member\)/);
  // Chemins : moins de virages (le personnage ne se retourne plus à chaque case)
  const blocked = buildBlocked(newState());
  const p = findPath(blocked, 13, 4, 5, 0);
  assert.ok(countTurns(p, 13, 4) <= 2, `virages : ${countTurns(p, 13, 4)}`);
  assert.equal(p.length, 12, 'toujours le plus court');
});

// ------------------------------------------------------------------ D. demandes non satisfaites
test('demandes non satisfaites : compte les produits voulus par un client et absents, avec le détail par produit', () => {
  const g = new Game();
  g.state.shelves = [{ slot: 'A3', product: 'eau', qty: 1 }];
  g.rebuild();
  g.openStore();
  g.spawnCustomer();
  const cu = g.customers[0];
  g.state.stats.missing = 0;
  g.state.stats.missingBy = {};
  cu.list = [{ product: 'pates', want: 1 }, { product: 'eau', want: 2 }];
  cu.idx = 0;
  g.nextShelf(cu);
  assert.equal(g.state.stats.missing, 1, 'pâtes absentes');
  // au rayon d'eau : il en voulait 2, il n'y en a qu'une
  const sl = slot('A3');
  cu.x = sl.c; cu.y = sl.r + 1; cu.path = [];
  cu.browseItem = cu.list[1];
  g.state.prices.eau = 50;
  g.finishBrowse(cu);
  assert.equal(g.state.stats.missing, 2);
  assert.deepEqual(g.state.stats.missingBy, { pates: 1, eau: 1 });
  const ui = read('src/ui.js');
  assert.match(ui, /demandes? non satisfaites?/i);
  assert.doesNotMatch(ui, /\d+} introuvables|Produits introuvables/, 'plus de libellé « introuvables » affiché');
  assert.match(ui, /data-a="missingHelp"|missingHelp/, 'explication touchable');
  assert.match(GOAL_KINDS.stock.label(2), /demandes non satisfaites/);
  g.state.phase = 'closing';
  g.customers = [];
  g.endDay();
  assert.deepEqual(g.state.lastSummary.missingBy, { pates: 1, eau: 1 });
});

// ------------------------------------------------------------------ E. erreurs de caisse
test('erreurs de caisse : erreur, détection et réaction séparées (règle de Jack)', () => {
  // 1) l'erreur
  assert.deepEqual(cashError(500, 500), { diff: 0, favor: null, amount: 0 });
  assert.equal(cashError(500, 400).favor, 'client');
  assert.equal(cashError(500, 650).favor, 'magasin');
  // 2) la détection : jamais pour une erreur en faveur du client
  assert.equal(cashDetect(cashError(500, 400), 1, () => 0), false);
  assert.equal(cashDetect(cashError(500, 600), 0.7, () => 0.69), true);
  assert.equal(cashDetect(cashError(500, 600), 0.7, () => 0.71), false);
  // 3) la réaction
  const gift = cashReaction(cashError(500, 300), false);
  assert.ok(gift.rep > 0 && gift.rep <= CASH_ERRORS.gainMax, 'en faveur du client : la popularité monte un peu');
  assert.ok(cashReaction(cashError(500, 100), false).rep <= CASH_ERRORS.gainMax, 'plafonné');
  assert.ok(cashReaction(cashError(500, 600), true).rep < 0, 'remarquée : elle baisse');
  assert.equal(cashReaction(cashError(500, 600), false).rep, 0, 'pas remarquée : rien');
  assert.equal(cashReaction(cashError(500, 500), false).rep, 0);
});

// Popularité due aux erreurs de caisse seulement (le « merci » d'un client content compte à part : « service »).
const cashRep = (g) => (g.state.stats.rep.cadeau || 0) + (g.state.stats.rep.arnaque || 0) + (g.state.stats.rep.personnel || 0);

function atRegister(g, basket) {
  g.state.shelves[0] = { slot: 'A3', product: 'eau', qty: 10 };
  g.rebuild();
  g.openStore();
  g.spawnCustomer();
  const cu = g.customers[0];
  cu.basket = basket;
  cu.register = 1;
  g.queues.get(1).push(cu.id);
  g.startPlayerCheckout(cu);
  g.checkout.items.forEach((it) => g.scan(it.i));
  return cu;
}

test('erreurs de caisse en jeu : trop rendu → popularité qui monte ; pas assez rendu, remarqué ou non', () => {
  const realRandom = Math.random;
  try {
    // trop rendu (en faveur du client)
    let g = new Game();
    atRegister(g, [{ product: 'eau', price: 100 }]);
    Object.assign(g.checkout, { step: 'cash', paidWith: 500, given: [] });
    g.giveChange(500);
    let res = g.validateCash();
    assert.equal(res.excess, 100);
    assert.ok(cashRep(g) > 0, 'monte');
    assert.ok(g.state.stats.rep.cadeau > 0);
    // pas assez rendu, remarqué
    Math.random = () => 0.1;
    g = new Game();
    atRegister(g, [{ product: 'eau', price: 100 }]);
    Object.assign(g.checkout, { step: 'cash', paidWith: 500, given: [] });
    g.giveChange(300);
    res = g.validateCash();
    assert.equal(res.noticed, true);
    assert.ok(cashRep(g) < 0);
    // pas assez rendu, pas remarqué → rien
    Math.random = () => 0.99;
    g = new Game();
    atRegister(g, [{ product: 'eau', price: 100 }]);
    Object.assign(g.checkout, { step: 'cash', paidWith: 500, given: [] });
    g.giveChange(300);
    res = g.validateCash();
    assert.equal(res.noticed, false);
    assert.equal(cashRep(g), 0, 'aucune variation');
    // carte : montant trop bas (en faveur du client) → monte ; trop haut non remarqué → rien
    g = new Game();
    atRegister(g, [{ product: 'eau', price: 300 }]);
    g.checkout.step = 'card'; g.checkout.card = '';
    for (const k of '200') g.cardKey(k);
    g.cardKey('ok');
    assert.ok(cashRep(g) > 0);
    g = new Game();
    atRegister(g, [{ product: 'eau', price: 300 }]);
    g.checkout.step = 'card'; g.checkout.card = '';
    for (const k of '400') g.cardKey(k);
    assert.equal(g.cardKey('ok').noticed, false);
    assert.equal(cashRep(g), 0);
  } finally {
    Math.random = realRandom;
  }
});

test('erreurs de caisse d’un caissier : même règle (article oublié = cadeau, compté deux fois = remarqué ou non)', () => {
  const realRandom = Math.random;
  try {
    const play = (rolls) => {
      let k = 0;
      Math.random = () => rolls[Math.min(k++, rolls.length - 1)];
      const g = new Game();
      g.state.staff.cashiers = [{ id: 1, name: 'Léa', level: 1, days: 3, look: 0 }];
      g.state.registers = [1];
      g.player.atRegister = null;
      const cu = { ...g.makeAgent(10, 2, { kind: 'customer' }), basket: [{ product: 'eau', price: 100 }], mood: 1, register: 1, list: [], idx: 0 };
      g.customers.push(cu);
      g.queues.get(1).push(cu.id);
      g.updateRegister(1, 10);
      return cashRep(g);
    };
    // rolls : [erreur ?, choix de l'article, over ?, remarqué ?, …]
    assert.ok(play([0, 0, 0.9, 0.9]) > 0, 'article oublié : en faveur du client → monte');
    assert.ok(play([0, 0, 0.1, 0.1]) < 0, 'compté deux fois, remarqué → baisse');
    assert.equal(play([0, 0, 0.1, 0.95]), 0, 'compté deux fois, pas remarqué → rien');
  } finally {
    Math.random = realRandom;
  }
});

// ------------------------------------------------------------------ migration
test('migration : une partie V1.3 se charge (cartons gardés, allée 1 gardée, magasinier sans apparence), clé inchangée', () => {
  assert.equal(SAVE_KEY, 'superette-save-v1');
  const old = JSON.parse(serialize(newState()));
  old.day = 17; old.level = 6; old.phase = 'prep';
  old.delivery = [[{ product: 'eau', qty: 12 }, { product: 'pates', qty: 12 }], [], [{ product: 'chips', qty: 5 }], [], [], []];
  old.shelves = [{ slot: 'A1', product: 'eau', qty: 18 }, { slot: 'A4', product: 'pates', qty: 0 }];
  old.staff = { cashiers: [], stocker: { id: 2, name: 'Hugo', level: 1, days: 3, look: 1 } };
  delete old.stats.missingBy;
  const s = deserialize(JSON.stringify(old));
  assert.ok(s);
  assert.equal(s.delivery.length, DELIVERY_SPOTS.length);
  assert.deepEqual(s.delivery[0].map((c) => c.product), ['eau', 'pates'], 'cartons de la V1.3 sur la même palette');
  assert.equal(s.delivery[2][0].qty, 5, 'carton entamé gardé');
  const g = new Game(s);
  assert.equal(g.state.shelves.length, 2);
  assert.ok(g.stocker && g.stocker.look);
  assert.equal(g.layoutProblem(g.blocked), null, 'tout reste accessible');
  run(g, 60);
  assert.equal(shelf(g, 'A4').qty, 12, 'Hugo range les pâtes, même sous l’eau');
  assert.equal(shelf(g, 'A1').product, 'eau');
  // vieille réserve abîmée ou trop longue : rien de perdu ni de cassé
  const bad = JSON.parse(serialize(newState()));
  bad.delivery = [[{ product: 'inconnu', qty: 3 }, null], 'x', ...Array.from({ length: 40 }, () => [{ product: 'eau', qty: 12 }])];
  const s2 = deserialize(JSON.stringify(bad));
  assert.equal(s2.delivery.length, DELIVERY_SPOTS.length);
  assert.ok(s2.delivery.every((st) => Array.isArray(st) && st.every((c) => PRODUCT_BY_ID[c.product])));
  assert.ok(s2.pending.length > 0, 'les cartons en trop reviennent en livraison');
  const g2 = new Game(s2);
  run(g2, 30);
  assert.ok(g2.state.delivery.every((st) => st.length <= SPOT_STACK));
});

test('magasin complet V1.4 : tout reste atteignable depuis la porte, toutes allées et caisses ouvertes', () => {
  const s = newState();
  s.zones = ZONES.map((z) => z.id);
  s.registers = REGISTERS.map((r) => r.id);
  s.shelves = SHELF_SLOTS.map((sl) => ({ slot: sl.id, product: null, qty: 0 }));
  const g = new Game(s);
  assert.equal(g.layoutProblem(g.blocked), null);
  for (const d of DELIVERY_SPOTS) assert.ok(findPath(g.blocked, DOOR.r, DOOR.c, d.r, d.c), `${d.r},${d.c}`);
});
