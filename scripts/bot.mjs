// Robot joueur : joue des journées entières via les mêmes actions que le joueur humain.
// Sert de test de non-plantage et de mesure du rythme de progression.
import { Game, cents } from '../src/game.js';
import { PRODUCTS, PRODUCT_BY_ID, SHELF_SLOTS, SHELF_CAPACITY, ZONES, REGISTERS, STAFF, DELIVERY_SPOTS } from '../src/data.js';

// overcharge (V1.5, test anti-triche) : centimes encaissés EN TROP à chaque client (carte : montant tapé plus
// haut ; espèces : monnaie rendue en moins, dans la limite de ce qu'il y a à rendre).
// noInvest : ne rien acheter d'autre que la marchandise (pour comparer des pièces à pièces).
export function playBot({ days = 30, skill = 1, log = false, maxRealSeconds = 1e9, overcharge = 0, noInvest = false } = {}) {
  const g = new Game();
  g.speed = 1;
  const marks = {};
  const dayStats = [];
  let simSeconds = 0;
  for (let d = 0; d < days; d++) {
    const s = g.state;
    // --- Préparation : achats
    if (!noInvest) invest(g);
    restock(g);
    for (let i = 0; i < 400 && (s.pending.length || g.deliveryCount()); i++) {
      step(g, 0.05, skill, overcharge);
      simSeconds += 0.05;
      if (!s.pending.length && !hasUsefulCarton(g)) break;
    }
    g.openStore();
    let guard = 0;
    while (s.phase !== 'summary' && guard++ < 20000) {
      step(g, 0.05, skill, overcharge);
      simSeconds += 0.05;
      if (guard % 200 === 0 && s.phase === 'open') restock(g);
    }
    if (s.phase !== 'summary') throw new Error(`Journée ${s.day} bloquée`);
    dayStats.push({ ...s.lastSummary, level: s.level, coins: s.coins });
    if (log) console.log(`J${s.day} niv${s.level} pièces ${(s.coins / 100).toFixed(0)} clients ${s.lastSummary.served} fâchés ${s.lastSummary.angry} manquants ${s.lastSummary.missing} rep ${s.reputation.toFixed(0)}`);
    for (const L of [5, 10, 15, 20, 25]) if (s.level >= L && marks[`level${L}`] == null) marks[`level${L}`] = s.day;
    if (s.zones.length === 3 && marks.zones == null) marks.zones = s.day;
    g.nextDay();
    if (simSeconds > maxRealSeconds) break;
  }
  return { game: g, marks, dayStats, simSeconds };
}

function hasUsefulCarton(g) {
  return g.state.delivery.some((st) => st.length && playerShelfFor(g, st[st.length - 1].product));
}

// Le joueur (contrairement au personnel) peut réaffecter un rayon vide à un autre produit.
export function playerShelfFor(g, product) {
  const s = g.state;
  const same = s.shelves.filter((x) => x.product === product && x.qty < SHELF_CAPACITY);
  if (same.length) return same.sort((a, b) => a.qty - b.qty)[0];
  if (s.shelves.some((x) => x.product === product && x.qty > 0)) return null;
  return s.shelves.find((x) => !x.product || (x.qty === 0 && !g.productWanted(x.product))) || null;
}

// Pile dont le carton du dessus a une place en rayon, atteignable par le joueur.
function usefulSpot(g) {
  const s = g.state;
  for (let i = 0; i < s.delivery.length; i++) {
    const st = s.delivery[i];
    if (st.length && playerShelfFor(g, st[st.length - 1].product) && g.accessFor(g.player, i)) return i;
  }
  return -1;
}

function invest(g) {
  const s = g.state;
  const reserve = cents(60);
  // Personnel quand la journée devient chargée
  if (s.level >= STAFF.cashier.level && s.staff.cashiers.length < s.registers.length && s.totals.served / Math.max(1, s.totals.days) > 22) {
    const best = [...g.ensureCandidates().cashier].sort((a, b) => b.level - a.level).find((c) => s.coins > g.staffCost('cashier', c.level) + reserve * 3);
    if (best) g.hire('cashier', best.id);
  }
  if (s.level >= STAFF.stocker.level && !s.staff.stocker && s.shelves.length >= 7) {
    const best = [...g.ensureCandidates().stocker].sort((a, b) => b.level - a.level).find((c) => s.coins > g.staffCost('stocker', c.level) + reserve * 4);
    if (best) g.hire('stocker', best.id);
  }
  for (const z of ZONES) if (!s.zones.includes(z.id) && s.level >= z.level && s.coins > cents(z.cost) + reserve * 2) g.buyZone(z.id);
  for (const r of REGISTERS) if (!s.registers.includes(r.id) && s.level >= r.level && s.coins > cents(r.cost) + reserve * 3) g.buyRegister(r.id);
  for (const p of PRODUCTS) {
    if (s.licences.includes(p.id) || s.level < p.level) continue;
    if (s.coins > cents(p.licence) + reserve * 2 && s.shelves.length >= s.licences.length) g.buyLicence(p.id);
  }
  // Une étagère par produit possédé, plus quelques doublons
  for (const sl of SHELF_SLOTS) {
    if (!s.zones.includes(sl.zone) || s.shelves.some((x) => x.slot === sl.id)) continue;
    if (s.shelves.length >= s.licences.length + 2) break;
    if (s.coins > g.nextShelfCost() + reserve * 2) g.buyShelf(sl.id);
  }
}

function restock(g) {
  const s = g.state;
  const cart = {};
  let budget = s.coins - cents(15);
  let room = g.deliveryRoom();
  for (const id of s.licences) {
    const p = PRODUCT_BY_ID[id];
    const onShelf = s.shelves.filter((x) => x.product === id).reduce((a, x) => a + x.qty, 0);
    const inStock = s.delivery.flat().filter((c) => c.product === id).reduce((a, c) => a + c.qty, 0) + s.pending.filter((d) => d.product === id).length * p.qty;
    const shelves = Math.max(1, s.shelves.filter((x) => x.product === id).length);
    const target = shelves * SHELF_CAPACITY + p.qty;
    let n = Math.ceil(Math.max(0, target - onShelf - inStock) / p.qty);
    while (n > 0 && budget >= cents(p.cartonCost) && room > 0) {
      cart[id] = (cart[id] || 0) + 1;
      budget -= cents(p.cartonCost);
      room--;
      n--;
    }
  }
  if (Object.keys(cart).length) g.order(cart);
}

function step(g, dt, skill, overcharge = 0) {
  const p = g.player;
  const s = g.state;
  if (!p.path.length && !p.fill) {
    // Priorité : caisse avec clients si personne, sinon ranger.
    const needReg = s.registers.find((id) => (g.queues.get(id) || []).length && !g.registerStaffed(id));
    if (g.checkout) {
      // Le robot encaisse à une vitesse humaine approximative.
      g.botTimer = (g.botTimer || 0) + dt;
      const co = g.checkout;
      if (g.botTimer > 0.55 / skill) {
        g.botTimer = 0;
        if (co.step === 'scan') {
          const it = co.items.find((x) => !x.scanned);
          g.scan(it.i);
        } else if (co.step === 'exact') g.validateExact();
        else if (co.step === 'card') {
          const v = co.total + overcharge;
          for (const ch of `${Math.floor(v / 100)},${String(v % 100).padStart(2, '0')}`) g.cardKey(ch);
          g.cardKey('ok');
        } else if (co.step === 'cash') {
          let due = g.changeDue() - g.changeGiven() - Math.min(overcharge, g.changeDue());
          for (const v of [2000, 1000, 500, 200, 100, 50, 20, 10]) while (due >= v) { g.giveChange(v); due -= v; }
          g.validateCash();
        }
      }
    } else if (p.carry) {
      const shelf = playerShelfFor(g, p.carry.product);
      if (shelf) {
        const sl = SHELF_SLOTS.find((x) => x.id === shelf.slot);
        g.tap(sl.r, sl.c);
      } else {
        const idx = g.findDropSpot(p.carry.product, p);
        if (idx >= 0) g.tap(DELIVERY_SPOTS[idx].r, DELIVERY_SPOTS[idx].c);
      }
    } else if (needReg && (p.atRegister !== needReg)) {
      const reg = REGISTERS.find((r) => r.id === needReg);
      g.tap(reg.staff.r, reg.staff.c);
    } else if (p.atRegister == null || !(g.queues.get(p.atRegister) || []).length) {
      const idx = usefulSpot(g);
      if (idx >= 0 && !needReg) g.tap(DELIVERY_SPOTS[idx].r, DELIVERY_SPOTS[idx].c);
      else if (p.atRegister == null && s.phase !== 'prep') {
        const reg = REGISTERS.find((r) => r.id === s.registers.find((id) => !g.cashierAt(id)));
        if (reg) g.tap(reg.staff.r, reg.staff.c);
      }
    }
  }
  g.update(dt);
}

if (process.argv[1] && process.argv[1].endsWith('bot.mjs')) {
  const days = parseInt(process.argv[2] || '40', 10);
  const r = playBot({ days, log: true });
  console.log('Repères (jour atteint) :', r.marks, `temps de jeu simulé ≈ ${(r.simSeconds / 3600).toFixed(1)} h`);
}
