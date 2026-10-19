// Moteur du jeu : état, journées, clients, stock, employés, caisse. Aucun DOM ici.
import {
  DAY_START, DAY_END, GAME_MIN_PER_SEC, DOOR, SPAWN, DELIVERY_SPOTS, SPOT_STACK, COMPUTER,
  ZONES, SHELF_SLOTS, SHELF_CAPACITY, REGISTERS, PRODUCTS, PRODUCT_BY_ID, START_COINS, START_SHELVES,
  MAX_LEVEL, xpForLevel, shelfCost, dailyCharges, STAFF, CONTRACT_DAYS, buyChance, customersPerDay,
  CASHIER_LEVELS, STOCKER_LEVELS, FIRST_NAMES, maxCandidateLevel, priceReputation,
  DELIVERY_SECONDS, PATIENCE_SECONDS, BILLS
} from './data.js';
import { buildBlocked, findPath } from './layout.js';

export const cents = (v) => Math.round(v * 100);

// ---------------------------------------------------------------- état persistant
export function newState() {
  const prices = {};
  for (const p of PRODUCTS) prices[p.id] = cents(p.market);
  return {
    version: 2,
    day: 1,
    minute: DAY_START,
    phase: 'prep', // prep | open | closing | summary
    coins: cents(START_COINS),
    level: 1,
    xp: 0,
    reputation: 30,
    licences: PRODUCTS.filter((p) => p.licence === 0).map((p) => p.id),
    prices,
    shelves: START_SHELVES.map((slot) => ({ slot, product: null, qty: 0 })),
    zones: ['A'],
    registers: [1],
    delivery: DELIVERY_SPOTS.map(() => []),
    pending: [],
    staff: { cashiers: [], stocker: null }, // employés sous contrat (jours restants, niveau)
    candidates: null,
    stats: emptyStats(),
    lastSummary: null,
    totals: { revenue: 0, served: 0, days: 0 },
    tutorial: 0
  };
}

function emptyStats() {
  return { revenue: 0, spent: 0, sold: 0, served: 0, angry: 0, missing: 0, profitItems: 0 };
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(json) {
  try {
    const s = JSON.parse(json);
    if (!s || (s.version !== 1 && s.version !== 2)) return null;
    if (s.version === 1) {
      // V0.1 → V1 : employés sans niveau → niveau 1
      const old = s.staff || {};
      s.staff = {
        cashiers: old.cashier > 0 ? [{ id: 1, name: 'Léa', level: 1, days: old.cashier, look: 0 }] : [],
        stocker: old.stocker > 0 ? { id: 2, name: 'Momo', level: 1, days: old.stocker, look: 1 } : null
      };
      s.version = 2;
    }
    const base = newState();
    const merged = { ...base, ...s, staff: { ...base.staff, ...s.staff }, stats: { ...base.stats, ...s.stats } };
    for (const p of PRODUCTS) if (merged.prices[p.id] == null) merged.prices[p.id] = cents(p.market);
    return merged;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- utilitaires
export function slotById(id) {
  return SHELF_SLOTS.find((s) => s.id === id);
}
export function registerById(id) {
  return REGISTERS.find((r) => r.id === id);
}
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SKINS = ['#f6d3b3', '#e8b48f', '#c98d63', '#9c6644', '#6f4a33', '#f1c7a5'];
const HAIRS = ['#2b1d14', '#5a3a22', '#a8642e', '#e6c068', '#1f1f1f', '#8a8a8a', '#c0462b'];
const SHIRTS = ['#3a7bd5', '#e85d75', '#2bb673', '#f2a541', '#8e6cdf', '#30a5bf', '#ef6f3c', '#556270'];

// ---------------------------------------------------------------- le jeu
export class Game {
  constructor(state) {
    this.state = state || newState();
    this.listeners = [];
    this.speed = 1;
    this.paused = false;
    this.uid = 1;
    this.customers = [];
    this.queues = new Map(); // registerId -> [customerId]
    this.spawnClock = 0;
    this.saveClock = 0;
    this.checkout = null; // passage en caisse tenu par le joueur
    this.cashierTimers = new Map();
    this.fx = []; // effets visuels (pièces qui volent…)
    this.rebuild();
    this.player = this.makeAgent(2, 4, { kind: 'player' });
    this.player.carry = null;
    this.player.atRegister = null;
    this.stocker = null;
    this.syncStaff();
    if (this.state.phase === 'open' || this.state.phase === 'closing') this.spawnClock = 0;
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(type, data = {}) {
    for (const fn of this.listeners) fn(type, data);
  }

  rebuild() {
    this.blocked = buildBlocked(this.state);
    for (const reg of this.state.registers) if (!this.queues.has(reg)) this.queues.set(reg, []);
  }

  makeAgent(r, c, extra = {}) {
    return { id: this.uid++, x: c, y: r, path: [], speed: 3, dir: 1, walk: 0, onArrive: null, ...extra };
  }

  tileOf(a) {
    return { r: Math.round(a.y), c: Math.round(a.x) };
  }

  moveTo(agent, r, c, onArrive) {
    const t = this.tileOf(agent);
    const path = findPath(this.blocked, t.r, t.c, r, c);
    if (!path) {
      agent.path = [];
      agent.onArrive = null;
      return false;
    }
    agent.path = path;
    agent.onArrive = onArrive || null;
    if (!path.length && onArrive) {
      agent.onArrive = null;
      onArrive();
    }
    return true;
  }

  // ------------------------------------------------------------- requêtes
  shelfAt(r, c) {
    const slot = SHELF_SLOTS.find((s) => s.r === r && s.c === c);
    if (!slot) return null;
    return { slot, shelf: this.state.shelves.find((s) => s.slot === slot.id) || null };
  }
  zoneOwned(zoneId) {
    return this.state.zones.includes(zoneId);
  }
  stockedTypes() {
    const set = new Set();
    for (const s of this.state.shelves) if (s.product && s.qty > 0) set.add(s.product);
    return set.size;
  }
  deliveryCount() {
    return this.state.delivery.reduce((n, st) => n + st.length, 0);
  }
  deliveryRoom() {
    return DELIVERY_SPOTS.length * SPOT_STACK - this.deliveryCount() - this.state.pending.length;
  }
  xpNeeded() {
    return xpForLevel(this.state.level);
  }
  nextShelfCost() {
    return cents(shelfCost(this.state.shelves.length));
  }
  registerStaffed(regId) {
    if (this.cashierAt(regId)) return 'cashier';
    if (this.player.atRegister === regId && !this.player.path.length) return 'player';
    return null;
  }
  // Répartition des caissiers : dans l'ordre des caisses, en laissant au joueur celle qu'il occupe.
  cashierAssignments() {
    const s = this.state;
    const map = new Map();
    const free = [...s.registers].sort((a, b) => a - b).filter((id) => id !== this.player.atRegister);
    let i = 0;
    for (const c of s.staff.cashiers) {
      if (c.days <= 0) continue;
      if (i >= free.length) break;
      map.set(free[i++], c);
    }
    return map;
  }
  cashierAt(regId) {
    return this.cashierAssignments().get(regId) || null;
  }

  // ------------------------------------------------------------- actions du joueur
  tap(r, c) {
    const s = this.state;
    if (s.phase === 'summary') return null;
    const p = this.player;
    // Emplacement de livraison
    const spotIdx = DELIVERY_SPOTS.findIndex((d) => d.r === r && d.c === c);
    if (spotIdx >= 0) {
      const stack = s.delivery[spotIdx];
      if (p.carry) {
        if (stack.length >= SPOT_STACK) return this.toast('Cet emplacement est plein');
        this.leaveRegister();
        this.moveTo(p, 2, c, () => {
          stack.push(p.carry);
          p.carry = null;
          this.emit('sfx', { name: 'drop' });
        });
        return { moved: true };
      }
      if (!stack.length) return this.toast('Rien ici : commande sur l’ordinateur 🖥️');
      this.leaveRegister();
      this.moveTo(p, 2, c, () => {
        if (p.carry || !stack.length) return;
        p.carry = stack.pop();
        this.emit('sfx', { name: 'pick' });
        this.emit('haptic', { ms: 12 });
        if (s.tutorial === 1) this.advanceTutorial(2);
      });
      return { moved: true };
    }
    // Ordinateur
    if (COMPUTER.tiles.some((t) => t.r === r && t.c === c)) return { open: 'order' };
    // Étagère
    const sh = this.shelfAt(r, c);
    if (sh) {
      if (!this.zoneOwned(sh.slot.zone)) return { open: 'zone', zone: sh.slot.zone };
      if (!sh.shelf) return { open: 'buyShelf', slot: sh.slot.id };
      const shelf = sh.shelf;
      if (p.carry) {
        if (shelf.product && shelf.product !== p.carry.product && shelf.qty > 0) {
          return this.toast(`Ce rayon contient déjà : ${PRODUCT_BY_ID[shelf.product].name}`);
        }
        if (shelf.qty >= SHELF_CAPACITY && shelf.product === p.carry.product) return this.toast('Rayon déjà plein');
        this.leaveRegister();
        this.moveTo(p, sh.slot.r + 1, sh.slot.c, () => this.startFill(p, shelf, sh.slot));
        return { moved: true };
      }
      return { open: 'shelf', slot: shelf.slot };
    }
    // Caisse
    for (const reg of REGISTERS) {
      if (!s.registers.includes(reg.id)) continue;
      const onReg = reg.counter.some((t) => t.r === r && t.c === c) || (reg.staff.r === r && reg.staff.c === c);
      if (!onReg) continue;
      const cashier = this.cashierAt(reg.id);
      if (cashier && !s.registers.some((id) => id !== reg.id && !this.cashierAt(id))) return this.toast(`${cashier.name} tient déjà cette caisse`);
      this.leaveRegister();
      p.atRegister = reg.id;
      p.goingToRegister = true;
      this.moveTo(p, reg.staff.r, reg.staff.c, () => {
        p.goingToRegister = false;
        p.dir = 1;
        this.emit('sfx', { name: 'tick' });
        if (s.tutorial === 3) this.advanceTutorial(4);
      });
      return { moved: true };
    }
    // Sol
    if (!this.blocked[r * 9 + c]) {
      this.leaveRegister();
      this.moveTo(p, r, c);
      return { moved: true };
    }
    return null;
  }

  toast(text) {
    this.emit('toast', { text });
    return { toast: text };
  }

  leaveRegister() {
    const p = this.player;
    if (p.atRegister != null) {
      if (this.checkout) this.abortCheckout();
      p.atRegister = null;
      p.goingToRegister = false;
    }
    p.fill = null;
  }

  startFill(agent, shelf, slot) {
    if (!agent.carry) return;
    if (shelf.product && shelf.product !== agent.carry.product && shelf.qty > 0) return;
    if (!shelf.product || shelf.qty === 0) shelf.product = agent.carry.product;
    agent.dir = -1;
    agent.fill = { shelf, slot, t: 0 };
  }

  stepFill(agent, dt, perUnit) {
    const f = agent.fill;
    if (!f || !agent.carry) {
      agent.fill = null;
      return;
    }
    f.t += dt;
    while (f.t >= perUnit) {
      f.t -= perUnit;
      if (!agent.carry || agent.carry.qty <= 0 || f.shelf.qty >= SHELF_CAPACITY) {
        agent.fill = null;
        break;
      }
      agent.carry.qty--;
      f.shelf.qty++;
      if (agent.kind === 'player') this.emit('sfx', { name: 'place', n: f.shelf.qty });
    }
    if (agent.carry && agent.carry.qty <= 0) {
      agent.carry = null;
      agent.fill = null;
      if (agent.kind === 'player') {
        this.emit('sfx', { name: 'done' });
        if (this.state.tutorial === 2) this.advanceTutorial(3);
      }
    } else if (!agent.fill && agent.kind === 'player' && agent.carry) {
      this.emit('sfx', { name: 'done' });
      if (this.state.tutorial === 2) this.advanceTutorial(3);
    }
  }

  // ------------------------------------------------------------- économie
  order(cart) {
    const s = this.state;
    let total = 0;
    let count = 0;
    for (const [id, n] of Object.entries(cart)) {
      if (!n) continue;
      if (!s.licences.includes(id)) return { ok: false, reason: 'Licence manquante' };
      total += cents(PRODUCT_BY_ID[id].cartonCost) * n;
      count += n;
    }
    if (!count) return { ok: false, reason: 'Panier vide' };
    if (count > this.deliveryRoom()) return { ok: false, reason: 'Pas assez de place dans la réserve' };
    if (total > s.coins) return { ok: false, reason: 'Pas assez de pièces' };
    s.coins -= total;
    s.stats.spent += total;
    for (const [id, n] of Object.entries(cart)) {
      for (let i = 0; i < n; i++) s.pending.push({ product: id, eta: DELIVERY_SECONDS + i * 0.35 });
    }
    this.emit('sfx', { name: 'buy' });
    if (s.tutorial === 0) this.advanceTutorial(1);
    return { ok: true, total, count };
  }

  buyLicence(id) {
    const s = this.state;
    const p = PRODUCT_BY_ID[id];
    if (!p || s.licences.includes(id)) return { ok: false };
    if (s.level < p.level) return { ok: false, reason: `Niveau ${p.level} requis` };
    if (s.coins < cents(p.licence)) return { ok: false, reason: 'Pas assez de pièces' };
    s.coins -= cents(p.licence);
    s.licences.push(id);
    this.emit('sfx', { name: 'buy' });
    return { ok: true };
  }

  buyShelf(slotId) {
    const s = this.state;
    const slot = slotById(slotId);
    if (!slot || !this.zoneOwned(slot.zone) || s.shelves.some((x) => x.slot === slotId)) return { ok: false };
    const cost = this.nextShelfCost();
    if (s.coins < cost) return { ok: false, reason: 'Pas assez de pièces' };
    // Ne jamais enfermer quelqu'un : l'accès devant l'étagère doit rester libre (il l'est par construction).
    s.coins -= cost;
    s.shelves.push({ slot: slotId, product: null, qty: 0 });
    this.rebuild();
    this.repathAll();
    this.emit('sfx', { name: 'build' });
    return { ok: true };
  }

  buyZone(zoneId) {
    const s = this.state;
    const z = ZONES.find((x) => x.id === zoneId);
    if (!z || this.zoneOwned(zoneId)) return { ok: false };
    if (s.level < z.level) return { ok: false, reason: `Niveau ${z.level} requis` };
    if (s.coins < cents(z.cost)) return { ok: false, reason: 'Pas assez de pièces' };
    s.coins -= cents(z.cost);
    s.zones.push(zoneId);
    this.emit('sfx', { name: 'build' });
    return { ok: true };
  }

  buyRegister(id) {
    const s = this.state;
    const reg = registerById(id);
    if (!reg || s.registers.includes(id)) return { ok: false };
    if (s.level < reg.level) return { ok: false, reason: `Niveau ${reg.level} requis` };
    if (s.coins < cents(reg.cost)) return { ok: false, reason: 'Pas assez de pièces' };
    s.coins -= cents(reg.cost);
    s.registers.push(id);
    this.rebuild();
    this.repathAll();
    this.emit('sfx', { name: 'build' });
    return { ok: true };
  }

  staffCost(kind, level) {
    const table = kind === 'cashier' ? CASHIER_LEVELS : STOCKER_LEVELS;
    return cents(table[level - 1].weekCost);
  }

  // Candidats de la semaine : renouvelés tous les 7 jours (et au premier affichage).
  ensureCandidates() {
    const s = this.state;
    const week = Math.floor((s.day - 1) / 7);
    if (s.candidates && s.candidates.week === week) return s.candidates;
    const maxL = maxCandidateLevel(s.level);
    const used = new Set([...s.staff.cashiers.map((c) => c.name), s.staff.stocker?.name].filter(Boolean));
    const make = (kind, i) => {
      let name = pick(FIRST_NAMES);
      for (let k = 0; k < 10 && used.has(name); k++) name = pick(FIRST_NAMES);
      used.add(name);
      // Un candidat de chaque gamme : débutant, moyen, meilleur disponible
      const level = Math.max(1, Math.min(maxL, i === 0 ? 1 : i === 1 ? Math.ceil(maxL / 2) + (Math.random() < 0.3 ? 1 : 0) : maxL));
      return { id: this.uid++ + s.day * 1000 + i, kind, name, level: Math.min(maxL, level), look: Math.floor(Math.random() * 6) };
    };
    s.candidates = { week, cashier: [0, 1, 2].map((i) => make('cashier', i)), stocker: [0, 1, 2].map((i) => make('stocker', i)) };
    return s.candidates;
  }

  hire(kind, candidateId) {
    const s = this.state;
    const def = STAFF[kind];
    if (!def) return { ok: false };
    if (s.level < def.level) return { ok: false, reason: `Niveau ${def.level} requis` };
    const cands = this.ensureCandidates()[kind];
    const cand = cands.find((c) => c.id === candidateId) || cands[0];
    const cost = this.staffCost(kind, cand.level);
    if (kind === 'cashier' && s.staff.cashiers.filter((c) => c.days > 0).length >= s.registers.length) {
      return { ok: false, reason: 'Une personne par caisse au maximum' };
    }
    if (kind === 'stocker' && s.staff.stocker && s.staff.stocker.days > 0) return { ok: false, reason: 'Un magasinier est déjà sous contrat' };
    if (s.coins < cost) return { ok: false, reason: 'Pas assez de pièces' };
    s.coins -= cost;
    const member = { id: cand.id, name: cand.name, level: cand.level, look: cand.look, days: CONTRACT_DAYS };
    if (kind === 'cashier') s.staff.cashiers = [...s.staff.cashiers.filter((c) => c.days > 0), member];
    else s.staff.stocker = member;
    s.candidates[kind] = cands.filter((c) => c.id !== cand.id);
    this.syncStaff();
    this.emit('sfx', { name: 'buy' });
    return { ok: true, member };
  }

  extend(kind, memberId) {
    const s = this.state;
    const m = kind === 'cashier' ? s.staff.cashiers.find((c) => c.id === memberId) : s.staff.stocker;
    if (!m) return { ok: false };
    const cost = this.staffCost(kind, m.level);
    if (s.coins < cost) return { ok: false, reason: 'Pas assez de pièces' };
    s.coins -= cost;
    m.days += CONTRACT_DAYS;
    this.syncStaff();
    this.emit('sfx', { name: 'buy' });
    return { ok: true };
  }

  // Prix minimum : le prix d'achat unitaire (arrondi aux 10 centimes supérieurs).
  minPrice(id) {
    const p = PRODUCT_BY_ID[id];
    return Math.ceil(cents(p.cartonCost) / p.qty / 10) * 10;
  }

  setPrice(id, value) {
    const v = Math.max(this.minPrice(id), Math.round(value / 10) * 10);
    this.state.prices[id] = Math.min(v, 99990);
  }

  // Indice prix du magasin : moyenne (prix / prix conseillé) des produits en rayon.
  priceIndex() {
    const s = this.state;
    const ids = [...new Set(s.shelves.filter((x) => x.product).map((x) => x.product))];
    if (!ids.length) return 1;
    return ids.reduce((n, id) => n + s.prices[id] / cents(PRODUCT_BY_ID[id].market), 0) / ids.length;
  }

  syncStaff() {
    const s = this.state;
    const st = s.staff.stocker;
    if (st && st.days > 0 && !this.stocker) {
      const lv = STOCKER_LEVELS[st.level - 1];
      this.stocker = this.makeAgent(2, 8, { kind: 'stocker', speed: lv.speed, perUnit: lv.perUnit, carry: null, idle: 0, name: st.name, lookIndex: st.look });
    }
    if ((!st || st.days <= 0) && this.stocker) {
      if (this.stocker.carry) this.returnCarton(this.stocker.carry);
      this.stocker = null;
    }
  }

  returnCarton(carry) {
    const s = this.state;
    let best = -1;
    for (let i = 0; i < s.delivery.length; i++) {
      if (s.delivery[i].length < SPOT_STACK && (best < 0 || s.delivery[i].length < s.delivery[best].length)) best = i;
    }
    if (best >= 0) s.delivery[best].push(carry);
  }

  repathAll() {
    for (const cu of this.customers) {
      if (cu.target) this.moveTo(cu, cu.target.r, cu.target.c, cu.onArrive);
    }
  }

  // ------------------------------------------------------------- journée
  openStore() {
    const s = this.state;
    if (s.phase !== 'prep') return;
    s.phase = 'open';
    this.spawnClock = 2; // premier client rapidement
    this.emit('sfx', { name: 'open' });
    this.emit('phase', { phase: 'open' });
  }

  endDay() {
    const s = this.state;
    const charges = cents(dailyCharges(s));
    s.coins -= charges;
    const summary = {
      day: s.day,
      revenue: s.stats.revenue,
      spent: s.stats.spent,
      charges,
      sold: s.stats.sold,
      served: s.stats.served,
      angry: s.stats.angry,
      missing: s.stats.missing,
      profit: s.stats.revenue - s.stats.spent - charges,
      reputation: s.reputation,
      staffEnding: []
    };
    for (const c of s.staff.cashiers) {
      if (c.days > 0 && --c.days === 0) summary.staffEnding.push(c.name);
    }
    s.staff.cashiers = s.staff.cashiers.filter((c) => c.days > 0);
    if (s.staff.stocker && s.staff.stocker.days > 0 && --s.staff.stocker.days === 0) {
      summary.staffEnding.push(s.staff.stocker.name);
      s.staff.stocker = null;
    }
    summary.staffErrors = s.stats.staffErrors || 0;
    s.totals.revenue += s.stats.revenue;
    s.totals.days++;
    s.lastSummary = summary;
    s.phase = 'summary';
    this.leaveRegister();
    this.emit('phase', { phase: 'summary', summary });
    this.emit('save');
  }

  nextDay() {
    const s = this.state;
    if (s.phase !== 'summary') return;
    s.day++;
    s.minute = DAY_START;
    s.phase = 'prep';
    s.stats = emptyStats();
    this.syncStaff();
    this.checkAid();
    this.emit('phase', { phase: 'prep' });
    this.emit('save');
  }

  checkAid() {
    const s = this.state;
    const stock = s.shelves.reduce((n, x) => n + x.qty, 0) + this.deliveryCount() + s.pending.length + (this.player.carry ? 1 : 0);
    if (s.coins < cents(12) && stock === 0) {
      s.pending.push({ product: 'eau', eta: 2 }, { product: 'pates', eta: 2.4 });
      this.emit('toast', { text: 'Ton fournisseur t’offre 2 cartons pour repartir 🤝' });
    }
  }

  gainXp(n) {
    const s = this.state;
    if (s.level >= MAX_LEVEL) return;
    s.xp += n;
    while (s.level < MAX_LEVEL && s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
      const unlocked = [];
      for (const p of PRODUCTS) if (p.level === s.level) unlocked.push(`Licence ${p.name}`);
      for (const z of ZONES) if (z.level === s.level && z.cost) unlocked.push(`Agrandissement : ${z.label}`);
      for (const r of REGISTERS) if (r.level === s.level && r.cost) unlocked.push('Deuxième caisse');
      for (const k of Object.keys(STAFF)) if (STAFF[k].level === s.level) unlocked.push(`${STAFF[k].label} à embaucher`);
      this.emit('levelup', { level: s.level, unlocked });
    }
  }

  addReputation(d) {
    const s = this.state;
    s.reputation = Math.max(0, Math.min(100, s.reputation + d));
  }

  advanceTutorial(step) {
    if (this.state.tutorial < step) {
      this.state.tutorial = step;
      this.emit('tutorial', { step });
    }
  }

  // ------------------------------------------------------------- clients
  spawnCustomer() {
    const s = this.state;
    const owned = s.licences;
    const maxItems = Math.min(5, 1 + Math.floor(s.level / 4) + (Math.random() < 0.5 ? 1 : 0));
    const n = 1 + Math.floor(Math.random() * maxItems);
    const pool = [...owned];
    const list = [];
    for (let i = 0; i < n && pool.length; i++) {
      const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      list.push({ product: id, want: Math.random() < 0.3 ? 2 : 1 });
    }
    const cu = this.makeAgent(SPAWN.r + 1, SPAWN.c, {
      kind: 'customer',
      speed: rand(1.7, 2.3),
      list,
      idx: 0,
      basket: [],
      mood: 1,
      state: 'shop',
      patience: PATIENCE_SECONDS * rand(0.85, 1.15),
      waited: 0,
      look: { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), hairStyle: Math.floor(Math.random() * 3) },
      bubble: null,
      off: rand(-0.12, 0.12)
    });
    this.customers.push(cu);
    this.nextShelf(cu);
  }

  goto(cu, r, c, fn) {
    cu.target = { r, c };
    cu.onArriveFn = fn;
    const ok = this.moveTo(cu, r, c, () => {
      cu.target = null;
      fn();
    });
    if (!ok) fn();
  }

  nextShelf(cu) {
    const s = this.state;
    while (cu.idx < cu.list.length) {
      const item = cu.list[cu.idx];
      const candidates = s.shelves.filter((x) => x.product === item.product && x.qty > 0);
      if (!candidates.length) {
        cu.mood -= 0.22;
        s.stats.missing++;
        this.say(cu, '❓');
        this.emit('missing', { product: item.product });
        cu.idx++;
        continue;
      }
      const t = this.tileOf(cu);
      let best = candidates[0];
      let bd = Infinity;
      for (const c of candidates) {
        const sl = slotById(c.slot);
        const d = Math.abs(sl.r + 1 - t.r) + Math.abs(sl.c - t.c);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      const sl = slotById(best.slot);
      this.goto(cu, sl.r + 1, sl.c, () => {
        cu.state = 'browse';
        cu.dir = -1;
        cu.timer = rand(0.6, 1.1);
        cu.browseItem = item;
      });
      return;
    }
    // Liste terminée
    if (cu.basket.length) this.joinQueue(cu);
    else this.leave(cu, false);
  }

  finishBrowse(cu) {
    const s = this.state;
    const item = cu.browseItem;
    cu.browseItem = null;
    cu.state = 'shop';
    const shelf = s.shelves.find((x) => x.product === item.product && x.qty > 0 && this.tileMatches(cu, x));
    const p = PRODUCT_BY_ID[item.product];
    if (!shelf) {
      // Rayon vidé entre-temps : on réessaie ailleurs
      return this.nextShelf(cu);
    }
    const ratio = s.prices[item.product] / cents(p.market);
    if (Math.random() > buyChance(ratio)) {
      cu.mood -= 0.15;
      this.say(cu, '💸');
      cu.idx++;
      return this.nextShelf(cu);
    }
    const take = Math.min(item.want, shelf.qty);
    shelf.qty -= take;
    if (shelf.qty === 0) this.emit('empty', { product: item.product });
    for (let i = 0; i < take; i++) cu.basket.push({ product: item.product, price: s.prices[item.product] });
    this.addReputation(priceReputation(ratio) * take);
    if (take < item.want) {
      cu.mood -= 0.1;
      s.stats.missing++;
    }
    if (ratio < 0.9) cu.mood += 0.05;
    cu.idx++;
    this.nextShelf(cu);
  }

  tileMatches(cu, shelf) {
    const sl = slotById(shelf.slot);
    const t = this.tileOf(cu);
    return sl.r + 1 === t.r && sl.c === t.c;
  }

  chooseRegister() {
    const regs = this.state.registers;
    let best = regs[0];
    let bestScore = Infinity;
    for (const id of regs) {
      const q = this.queues.get(id) || [];
      const staffed = this.registerStaffed(id) || (this.player.atRegister === id) ? 0 : 3;
      const score = q.length + staffed;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  }

  joinQueue(cu) {
    const id = this.chooseRegister();
    const q = this.queues.get(id);
    const reg = registerById(id);
    if (q.length >= reg.queue.length + 1) {
      // File pleine : le client attend un peu près des caisses puis réessaie.
      cu.state = 'waitQueue';
      cu.timer = 2;
      this.say(cu, '⏳');
      return;
    }
    q.push(cu.id);
    cu.register = id;
    cu.state = 'queue';
    cu.waited = 0;
    this.placeInQueue(cu);
  }

  placeInQueue(cu) {
    const q = this.queues.get(cu.register);
    const reg = registerById(cu.register);
    const pos = q.indexOf(cu.id);
    const tile = pos === 0 ? reg.pay : reg.queue[pos - 1];
    cu.queuePos = pos;
    this.goto(cu, tile.r, tile.c, () => {
      cu.dir = 1;
    });
  }

  shiftQueue(regId) {
    const q = this.queues.get(regId);
    for (const id of q) {
      const cu = this.customers.find((x) => x.id === id);
      if (cu) this.placeInQueue(cu);
    }
  }

  leaveQueue(cu) {
    if (cu.register == null) return;
    const q = this.queues.get(cu.register);
    const i = q.indexOf(cu.id);
    if (i >= 0) q.splice(i, 1);
    const reg = cu.register;
    cu.register = null;
    this.shiftQueue(reg);
  }

  leave(cu, paid) {
    const s = this.state;
    if (cu.state === 'leaving') return;
    this.leaveQueue(cu);
    cu.state = 'leaving';
    if (paid) {
      if (cu.mood >= 0.75) {
        this.addReputation(0.3 * (1 - s.reputation / 115));
        this.say(cu, '😊');
      } else if (cu.mood < 0.45) {
        this.addReputation(-0.8);
        this.say(cu, '😕');
      }
    } else if (cu.basket.length === 0) {
      this.addReputation(-0.4);
      this.say(cu, '😕');
    }
    this.goto(cu, DOOR.r, DOOR.c, () => {
      cu.gone = true;
    });
  }

  angryLeave(cu) {
    const s = this.state;
    // Les articles retournent en rayon si possible.
    for (const it of cu.basket) {
      const shelf = s.shelves.find((x) => x.product === it.product && x.qty < SHELF_CAPACITY);
      if (shelf) shelf.qty++;
    }
    cu.basket = [];
    s.stats.angry++;
    this.addReputation(-1.6);
    this.say(cu, '😠', 3);
    this.emit('sfx', { name: 'angry' });
    if (this.checkout && this.checkout.customerId === cu.id) this.checkout = null;
    this.leave(cu, false);
  }

  say(cu, text, secs = 2) {
    cu.bubble = { text, t: secs };
  }

  // ------------------------------------------------------------- encaissement
  completeSale(cu, received) {
    const s = this.state;
    const total = cu.basket.reduce((n, it) => n + it.price, 0);
    s.coins += received;
    s.stats.revenue += received;
    s.stats.sold += cu.basket.length;
    s.stats.served++;
    s.totals.served++;
    let cost = 0;
    for (const it of cu.basket) cost += cents(PRODUCT_BY_ID[it.product].cartonCost) / PRODUCT_BY_ID[it.product].qty;
    s.stats.profitItems += total - cost;
    this.gainXp(cu.basket.length + 2);
    const reg = registerById(cu.register);
    this.fx.push({ kind: 'coins', x: reg.pay.c, y: reg.pay.r, value: received, t: 0 });
    this.emit('sale', { amount: received });
    cu.basket = [];
    this.leave(cu, true);
  }

  startPlayerCheckout(cu) {
    const items = cu.basket.map((it, i) => ({ i, product: it.product, price: it.price, scanned: false }));
    // Mélange pour que le tapis ne soit pas trié
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    this.checkout = {
      customerId: cu.id,
      regId: cu.register,
      items,
      total: cu.basket.reduce((n, it) => n + it.price, 0),
      step: 'scan',
      paidWith: 0,
      given: [],
      card: ''
    };
    cu.processing = true;
    this.emit('checkout', { open: true });
  }

  scan(index) {
    const co = this.checkout;
    if (!co || co.step !== 'scan') return;
    const it = co.items.find((x) => x.i === index);
    if (!it || it.scanned) return;
    it.scanned = true;
    this.emit('sfx', { name: 'beep' });
    this.emit('haptic', { ms: 8 });
    if (co.items.every((x) => x.scanned)) this.choosePayment();
  }

  choosePayment() {
    const co = this.checkout;
    const total = co.total;
    const r = Math.random();
    if (r < 0.4) {
      co.step = 'card';
      co.card = '';
    } else if (r < 0.52) {
      co.step = 'exact';
      co.paidWith = total;
    } else {
      co.step = 'cash';
      const bills = BILLS.map(cents).sort((a, b) => a - b);
      let bill = bills.find((b) => b >= total) || Math.ceil(total / 5000) * 5000;
      if (Math.random() < 0.3) {
        const bigger = bills.find((b) => b > bill);
        if (bigger) bill = bigger;
      }
      co.paidWith = bill;
      co.given = [];
    }
    this.emit('checkout', { step: co.step });
  }

  changeDue() {
    const co = this.checkout;
    return co ? co.paidWith - co.total : 0;
  }
  changeGiven() {
    const co = this.checkout;
    return co ? co.given.reduce((n, v) => n + v, 0) : 0;
  }

  giveChange(v) {
    const co = this.checkout;
    if (!co || co.step !== 'cash') return;
    co.given.push(v);
    this.emit('sfx', { name: 'coin' });
  }
  undoChange() {
    const co = this.checkout;
    if (!co || co.step !== 'cash') return;
    co.given.pop();
  }

  validateCash() {
    const co = this.checkout;
    if (!co || co.step !== 'cash') return { ok: false };
    const due = this.changeDue();
    const given = this.changeGiven();
    const cu = this.customers.find((x) => x.id === co.customerId);
    const excess = given - due;
    let noticed = false;
    this.checkout = null;
    if (cu) {
      if (excess === 0) cu.mood += 0.1;
      if (excess < 0 && Math.random() < 0.8) {
        // Le client remarque qu'on ne lui a pas rendu assez.
        noticed = true;
        cu.mood -= 0.7;
        this.addReputation(-2);
        this.say(cu, '😠', 2.5);
      }
      this.completeSale(cu, co.paidWith - given);
    }
    this.emit('sfx', { name: noticed ? 'angry' : 'cash' });
    this.emit('haptic', { ms: 20 });
    this.emit('checkout', { open: false, excess });
    return { ok: true, excess, noticed };
  }

  validateExact() {
    const co = this.checkout;
    if (!co || co.step !== 'exact') return;
    const cu = this.customers.find((x) => x.id === co.customerId);
    this.checkout = null;
    if (cu) this.completeSale(cu, co.total);
    this.emit('sfx', { name: 'cash' });
    this.emit('checkout', { open: false });
  }

  cardKey(k) {
    const co = this.checkout;
    if (!co || co.step !== 'card') return { ok: false };
    if (k === 'del') co.card = co.card.slice(0, -1);
    else if (k === 'ok') {
      const value = parseInt(co.card || '0', 10);
      if (!co.card || value <= 0) {
        this.emit('sfx', { name: 'error' });
        return { ok: false, reason: 'Tape le montant à encaisser' };
      }
      const cu = this.customers.find((x) => x.id === co.customerId);
      const diff = value - co.total;
      let noticed = false;
      this.checkout = null;
      if (cu) {
        if (diff > 0 && Math.random() < 0.7) {
          // Client facturé trop cher : ça passe, mais s'il le remarque, la réputation en prend un coup.
          noticed = true;
          cu.mood -= 0.7;
          this.addReputation(-2);
          this.say(cu, '😠', 2.5);
        }
        this.completeSale(cu, value);
      }
      this.emit('sfx', { name: noticed ? 'angry' : 'cash' });
      this.emit('haptic', { ms: 20 });
      this.emit('checkout', { open: false });
      return { ok: true, diff, noticed };
    } else if (co.card.length < 6) {
      co.card += k;
      this.emit('sfx', { name: 'key' });
    }
    return { ok: true };
  }

  abortCheckout() {
    const co = this.checkout;
    if (!co) return;
    const cu = this.customers.find((x) => x.id === co.customerId);
    if (cu) cu.processing = false;
    this.checkout = null;
    this.emit('checkout', { open: false });
  }

  // ------------------------------------------------------------- boucle
  update(realDt) {
    if (this.paused) return;
    const dt = Math.min(realDt, 0.1) * this.speed;
    const s = this.state;

    // Livraisons (avancent aussi pendant la préparation)
    for (const d of s.pending) d.eta -= dt;
    if (s.pending.length) {
      const arrived = s.pending.filter((d) => d.eta <= 0);
      for (const d of arrived) {
        // Empiler avec le même produit si possible, sinon sur la pile la plus basse
        let idx = s.delivery.findIndex((st) => st.length && st.length < SPOT_STACK && st[st.length - 1].product === d.product);
        if (idx < 0) {
          let best = -1;
          for (let i = 0; i < s.delivery.length; i++) if (s.delivery[i].length < SPOT_STACK && (best < 0 || s.delivery[i].length < s.delivery[best].length)) best = i;
          idx = best;
        }
        if (idx < 0) break;
        s.delivery[idx].push({ product: d.product, qty: PRODUCT_BY_ID[d.product].qty });
        s.pending.splice(s.pending.indexOf(d), 1);
        this.emit('delivery', {});
      }
    }

    // Temps de la journée
    if (s.phase === 'open') {
      s.minute += dt * GAME_MIN_PER_SEC;
      this.spawnClock -= dt * GAME_MIN_PER_SEC;
      if (this.spawnClock <= 0) {
        const perDay = customersPerDay(s, Math.max(1, this.stockedTypes()));
        const interval = (DAY_END - DAY_START) / perDay;
        this.spawnClock = interval * rand(0.55, 1.45);
        if (this.customers.length < 18) this.spawnCustomer();
      }
      if (s.minute >= DAY_END) {
        s.minute = DAY_END;
        s.phase = 'closing';
        this.emit('phase', { phase: 'closing' });
      }
    }

    // Déplacements
    this.moveAgent(this.player, dt);
    if (this.player.fill) this.stepFill(this.player, dt, 0.075);
    if (this.stocker) this.updateStocker(dt);
    for (const cu of this.customers) this.updateCustomer(cu, dt);
    this.customers = this.customers.filter((c) => !c.gone);

    // Caisses
    for (const regId of s.registers) this.updateRegister(regId, dt);

    if (s.phase === 'closing' && this.customers.length === 0 && !this.checkout) this.endDay();

    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 1.2);

    this.saveClock += realDt;
    if (this.saveClock > 15) {
      this.saveClock = 0;
      this.emit('save');
    }
  }

  moveAgent(a, dt) {
    if (!a.path.length) {
      a.walk = 0;
      return;
    }
    let remaining = a.speed * dt;
    while (remaining > 0 && a.path.length) {
      const next = a.path[0];
      const dx = next.c - a.x;
      const dy = next.r - a.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) a.dir = dx > 0 ? 2 : -2;
      else if (Math.abs(dy) > 0.01) a.dir = dy > 0 ? 1 : -1;
      if (d <= remaining) {
        a.x = next.c;
        a.y = next.r;
        a.path.shift();
        remaining -= d;
      } else {
        a.x += (dx / d) * remaining;
        a.y += (dy / d) * remaining;
        remaining = 0;
      }
    }
    a.walk += dt * a.speed;
    if (!a.path.length && a.onArrive) {
      const fn = a.onArrive;
      a.onArrive = null;
      fn();
    }
  }

  updateCustomer(cu, dt) {
    this.moveAgent(cu, dt);
    if (cu.bubble) {
      cu.bubble.t -= dt;
      if (cu.bubble.t <= 0) cu.bubble = null;
    }
    if (cu.state === 'browse' && !cu.path.length) {
      cu.timer -= dt;
      if (cu.timer <= 0) this.finishBrowse(cu);
    } else if (cu.state === 'waitQueue') {
      cu.timer -= dt;
      cu.waited += dt;
      if (cu.waited > cu.patience) return this.angryLeave(cu);
      if (cu.timer <= 0) this.joinQueue(cu);
    } else if (cu.state === 'queue' && !cu.processing) {
      // Après la fermeture, une caisse vide fait partir les clients plus vite.
      cu.waited += this.state.phase === 'closing' && !this.registerStaffed(cu.register) ? dt * 3 : dt;
      if (cu.waited > cu.patience * 0.5 && !cu.bubble && Math.random() < dt * 0.3) this.say(cu, '⌛');
      if (cu.waited > cu.patience) this.angryLeave(cu);
    }
  }

  updateRegister(regId, dt) {
    const q = this.queues.get(regId);
    if (!q || !q.length) return;
    const cu = this.customers.find((x) => x.id === q[0]);
    if (!cu) {
      q.shift();
      return;
    }
    const reg = registerById(regId);
    const atPay = !cu.path.length && Math.round(cu.y) === reg.pay.r && Math.round(cu.x) === reg.pay.c;
    if (!atPay) return;
    const staffed = this.registerStaffed(regId);
    if (staffed === 'cashier') {
      cu.processing = true;
      const cashier = this.cashierAt(regId);
      const lv = CASHIER_LEVELS[cashier.level - 1];
      const t = (this.cashierTimers.get(regId) || 0) + dt;
      const need = lv.secPerItem * cu.basket.length + 1.6;
      if (t >= need) {
        this.cashierTimers.set(regId, 0);
        const total = cu.basket.reduce((n, it) => n + it.price, 0);
        let received = total;
        if (Math.random() < lv.error) {
          // Erreur de caisse : un article compté deux fois (le client paie trop) ou oublié (on perd la vente).
          const it = cu.basket[Math.floor(Math.random() * cu.basket.length)];
          const over = Math.random() < 0.5;
          received = over ? total + it.price : total - it.price;
          this.state.stats.staffErrors = (this.state.stats.staffErrors || 0) + 1;
          if (over && Math.random() < 0.7) {
            cu.mood -= 0.6;
            this.addReputation(-1.5);
            this.say(cu, '😠', 2.5);
          }
          this.emit('staffError', { name: cashier.name, over, amount: it.price });
        }
        this.completeSale(cu, received);
        this.emit('sfx', { name: 'cashSoft' });
      } else {
        this.cashierTimers.set(regId, t);
        if (Math.floor(t / lv.secPerItem) !== Math.floor((t - dt) / lv.secPerItem) && t < need - 1.6) this.emit('sfx', { name: 'beepSoft' });
      }
    } else if (staffed === 'player') {
      if (!this.checkout) this.startPlayerCheckout(cu);
    } else {
      cu.processing = false;
    }
  }

  updateStocker(dt) {
    const a = this.stocker;
    const s = this.state;
    this.moveAgent(a, dt);
    if (a.fill) {
      this.stepFill(a, dt, a.perUnit || 0.28);
      if (!a.fill) a.busy = false;
      return;
    }
    if (a.path.length || a.busy) return;
    a.idle -= dt;
    if (a.idle > 0) return;
    if (a.carry) {
      // Trouver un rayon pour le carton en main, sinon le reposer.
      const shelf = this.shelfFor(a.carry.product);
      if (shelf) {
        const sl = slotById(shelf.slot);
        a.busy = true;
        this.moveTo(a, sl.r + 1, sl.c, () => {
          this.startFill(a, shelf, sl);
          if (!a.fill) a.busy = false;
        });
      } else {
        const idx = s.delivery.findIndex((st) => st.length < SPOT_STACK);
        if (idx >= 0) {
          a.busy = true;
          this.moveTo(a, 2, idx, () => {
            s.delivery[idx].push(a.carry);
            a.carry = null;
            a.busy = false;
            a.idle = 1;
          });
        }
      }
      return;
    }
    // Chercher un carton utile dans la réserve
    for (let i = 0; i < s.delivery.length; i++) {
      const st = s.delivery[i];
      if (!st.length) continue;
      const top = st[st.length - 1];
      if (this.shelfFor(top.product)) {
        a.busy = true;
        this.moveTo(a, 2, i, () => {
          a.busy = false;
          if (!st.length || a.carry) return;
          const t = st[st.length - 1];
          if (!this.shelfFor(t.product)) return;
          a.carry = st.pop();
        });
        return;
      }
    }
    a.idle = 1.2;
    const t = this.tileOf(a);
    if (t.r !== 2 || t.c !== 8) this.moveTo(a, 2, 8);
  }

  // Rayon qui peut recevoir ce produit (déjà ce produit avec de la place, sinon un rayon vide).
  shelfFor(product) {
    const s = this.state;
    const same = s.shelves.filter((x) => x.product === product && x.qty < SHELF_CAPACITY);
    if (same.length) return same.sort((a, b) => a.qty - b.qty)[0];
    if (s.shelves.some((x) => x.product === product && x.qty > 0)) return null;
    return s.shelves.find((x) => !x.product || x.qty === 0 && !this.productWanted(x.product)) || null;
  }

  productWanted(product) {
    if (!product) return false;
    return this.state.delivery.some((st) => st.some((c) => c.product === product)) || this.state.pending.some((d) => d.product === product);
  }
}
