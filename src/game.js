// Moteur du jeu : état, journées, clients, stock, employés, caisse. Aucun DOM ici.
import {
  DAY_START, DAY_END, GAME_MIN_PER_SEC, DOOR, SPAWN, DELIVERY_SPOTS, SPOT_STACK, AUTO_SPOTS, RESERVE_CAPACITY, STOCKER_HOME, spotIndex, CASH_ERRORS,
  ZONES, SHELF_SLOTS, SHELF_CAPACITY, REGISTERS, PRODUCTS, PRODUCT_BY_ID, START_COINS, START_SHELVES,
  MAX_LEVEL, staffLook, xpForLevel, shelfCost, dailyCharges, STAFF, CONTRACT_DAYS, buyChance, customersPerDay,
  CASHIER_LEVELS, STOCKER_LEVELS, FIRST_NAMES, maxCandidateLevel, priceReputation,
  DELIVERY_SECONDS, PATIENCE_SECONDS, BILLS, EVENTS, EVENT_BY_ID, GOALS_PER_DAY, GOALS_FROM_DAY, goalReward, CARD_MAX_INT_DIGITS, cashThresholds
} from './data.js';
import { buildBlocked, findPath, reachable, DIRS } from './layout.js';

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
    tutorial: 0,
    event: null, // événement de quartier du jour (V1.2)
    distrust: 0, // méfiance du quartier après des clients surfacturés (V1.5)
    goals: null // objectifs du jour (V1.2) : { day, list: [{ kind, target, reward }] }
  };
}

function emptyStats() {
  // missing = demandes non satisfaites (un client voulait un produit absent ou en quantité insuffisante) ;
  // missingBy = le détail par produit (V1.4, pour le bilan).
  return { revenue: 0, spent: 0, sold: 0, served: 0, angry: 0, missing: 0, missingBy: {}, profitItems: 0, perfect: 0, rep: {} };
}

// ---------------------------------------------------------------- erreurs de caisse (V1.4)
// Trois étapes séparées : l'erreur, sa détection par le client, la réaction (popularité).
// 1) L'erreur : due = ce que le client devait payer, paid = ce qu'il a réellement payé.
export function cashError(due, paid) {
  const diff = paid - due;
  if (diff === 0) return { diff: 0, favor: null, amount: 0, due };
  return { diff, favor: diff < 0 ? 'client' : 'magasin', amount: Math.abs(diff), due };
}
// 2) La détection : une erreur en faveur du client ne lui coûte rien (il n'a rien à « remarquer ») ;
//    une erreur en faveur du magasin est remarquée avec la probabilité « chance ».
//    V1.5 : seuils proportionnels au ticket (cashThresholds) : au-delà du seuil « inaperçu », le client remarque
//    TOUJOURS ; en dessous, la chance de remarquer monte avec l'écart.
export function cashDetect(err, chance, rnd = Math.random) {
  if (err.favor !== 'magasin') return false;
  const th = cashThresholds(err.due ?? 0);
  if (err.amount > th.discreet) return true;
  const k = CASH_ERRORS.noticeFloor + (1 - CASH_ERRORS.noticeFloor) * (err.amount / th.discreet);
  return rnd() < chance * k;
}
// 3) La réaction (règle de Jack) :
//    - en faveur du client → la popularité monte un peu (selon le montant, plafonné) ;
//    - en faveur du magasin et remarquée → la popularité baisse ;
//    - en faveur du magasin et pas remarquée → rien.
export function cashReaction(err, noticed, who = 'player') {
  if (err.favor === 'client') {
    const rep = Math.min(CASH_ERRORS.gainMax, Math.round(err.amount / 100 * CASH_ERRORS.gainPerCoin * 100) / 100);
    return { rep, why: 'cadeau', mood: 0.1, bubble: '😊' };
  }
  if (err.favor === 'magasin' && noticed) {
    const th = cashThresholds(err.due ?? 0);
    const beyond = Math.max(0, err.amount - th.discreet) / 100; // pièces au-delà du seuil « inaperçu »
    // V1.5, zone 3 : au-delà du seuil de refus, le client refuse de payer (la vente est annulée).
    // (un caissier se trompe d'un article, il ne vole pas : son erreur reste en zone 2, jamais de refus — relecture)
    if (err.amount > th.refuse && who !== 'cashier') {
      const loss = Math.min(CASH_ERRORS.refuseLossMax, CASH_ERRORS.refuseLoss + CASH_ERRORS.refuseLossPerCoin * (err.amount - th.refuse) / 100);
      return { rep: -Math.round(loss * 100) / 100, why: 'arnaque', mood: -1, bubble: '😡', refused: true, distrust: Math.max(1, beyond) };
    }
    // Zones 1 (remarquée) et 2 : il paie, la perte de popularité grandit avec l'écart (et le bouche-à-oreille suit).
    const base = who === 'cashier' ? CASH_ERRORS.lossCashier : CASH_ERRORS.lossPlayer;
    return { rep: -Math.round((base + beyond * CASH_ERRORS.lossPerCoin) * 100) / 100, why: 'arnaque', mood: who === 'cashier' ? -0.6 : -0.7, bubble: '😠', distrust: beyond };
  }
  return { rep: 0, why: null, mood: 0, bubble: null };
}

// V1.5 : montant tapé au terminal de carte → centimes (ou null si invalide). Le joueur tape comme il lit le prix :
// « 1,60 », « 1,6 » ou « 1.6 » (virgule ou point) = 1 pièce 60 ; « 2 » = 2 pièces. Au plus 3 chiffres avant la
// virgule et 2 après : plus de « 1 600 » tapé par erreur pour 1,60.
export function parseCardAmount(text) {
  const t = String(text || '').replace('.', ',');
  const m = /^(\d{0,3})(?:,(\d{0,2}))?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return null;
  return parseInt(m[1] || '0', 10) * 100 + parseInt((m[2] || '').padEnd(2, '0'), 10);
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
    if (!merged.stats.rep || typeof merged.stats.rep !== 'object') merged.stats.rep = {};
    // V1.4 : réserve agrandie (6 → 9 palettes, ordinateur retiré). Les cartons d'une partie V1.3 restent
    // sur leurs palettes ; les nouvelles palettes arrivent vides. Données abîmées : ignorées.
    const del = Array.isArray(merged.delivery) ? merged.delivery : [];
    merged.delivery = DELIVERY_SPOTS.map((_, i) => (Array.isArray(del[i]) ? del[i].filter((c) => c && PRODUCT_BY_ID[c.product] && c.qty > 0) : []));
    for (let i = DELIVERY_SPOTS.length; i < del.length; i++) {
      for (const c of Array.isArray(del[i]) ? del[i] : []) if (c && PRODUCT_BY_ID[c.product] && c.qty > 0) merged.pending.push({ product: c.product, eta: 1, qty: c.qty });
    }
    if (merged.event && !EVENT_BY_ID[merged.event]) merged.event = null;
    if (merged.goals && (!Array.isArray(merged.goals.list) || merged.goals.list.some((g) => !GOAL_KINDS[g.kind]))) merged.goals = null;
    for (const p of PRODUCTS) {
      if (merged.prices[p.id] == null) merged.prices[p.id] = cents(p.market);
      merged.prices[p.id] = Math.max(minPriceOf(p), merged.prices[p.id]);
    }
    return merged;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- utilitaires
// Prix minimum : le prix d'achat unitaire (arrondi aux 10 centimes supérieurs).
export function minPriceOf(p) {
  return Math.ceil(cents(p.cartonCost) / p.qty / 10) * 10;
}
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

// ---------------------------------------------------------------- objectifs du jour (V1.2)
// value(stats, state) = avancement ; « max » = objectif à ne pas dépasser (jugé en fin de journée).
const sumRep = (st) => Object.values(st.rep || {}).reduce((a, v) => a + v, 0);
export const GOAL_KINDS = {
  serve: { icon: '🧺', label: (t) => `Servir ${t} clients`, value: (st) => st.served },
  sell: { icon: '📦', label: (t) => `Vendre ${t} articles`, value: (st) => st.sold },
  perfect: { icon: '🪙', label: (t) => `Rendre la monnaie juste ${t} fois`, value: (st) => st.perfect || 0 },
  calm: { icon: '😌', label: () => 'Aucun client parti fâché', value: (st) => st.angry, max: true, min: (st) => st.served >= 5 },
  stock: { icon: '❓', label: (t) => `Au plus ${t} demandes non satisfaites`, value: (st) => st.missing, max: true, min: (st) => st.served >= 5 },
  pop: { icon: '⭐', label: (t) => `Gagner ${t} points de popularité`, value: (st) => Math.max(0, Math.floor(sumRep(st) * 10) / 10) }
};

// Ce qu'un niveau débloque (fenêtre « Niveau N ! » et tutoriel V1.5).
export function unlocksAt(level) {
  const unlocked = [];
  for (const p of PRODUCTS) if (p.level === level) unlocked.push(`Licence ${p.name}`);
  for (const z of ZONES) if (z.level === level && z.cost) unlocked.push(`Agrandissement : ${z.label}`);
  for (const r of REGISTERS) if (r.level === level && r.cost) unlocked.push('Deuxième caisse');
  for (const k of Object.keys(STAFF)) if (STAFF[k].level === level) unlocked.push(`${STAFF[k].label} à embaucher`);
  return unlocked;
}

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
    this.moving = null; // mode « Déplacer une étagère » : { from: slotId | null }
    // Tutoriel (V1.5) : scénario fixe. Listes d'achats imposées aux prochains clients, mode de paiement imposé au
    // prochain passage en caisse, compteur de cartons reposés par le joueur. Rien de tout ça hors tutoriel.
    this.scriptLists = [];
    this.nextPayment = null;
    this.drops = 0;
    this.moves = 0; // étagères déplacées (tutoriel)
    this.syncStaff();
    // Ancienne sauvegarde (V1.1 et avant) : pas encore d'objectifs du jour.
    if (!this.state.goals || this.state.goals.day !== this.state.day) this.planDay(this.state.phase === 'prep');
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
  // Cases qui réagissent au toucher (pour viser juste même si le doigt tombe à côté).
  actionTiles() {
    const s = this.state;
    if (this.moving) {
      // Mode « Déplacer » : seules les étagères et les « + » libres réagissent (grosses cibles).
      return SHELF_SLOTS.filter((sl) => s.shelves.some((x) => x.slot === sl.id) || this.zoneOwned(sl.zone)).map((sl) => ({ r: sl.r, c: sl.c }));
    }
    const out = DELIVERY_SPOTS.map((d) => ({ r: d.r, c: d.c }));
    for (const sl of SHELF_SLOTS) {
      if (this.zoneOwned(sl.zone) || s.shelves.some((x) => x.slot === sl.id)) out.push({ r: sl.r, c: sl.c });
    }
    for (const reg of REGISTERS) {
      if (!s.registers.includes(reg.id)) continue;
      for (const t of [...reg.counter, reg.staff]) out.push({ r: t.r, c: t.c });
    }
    return out;
  }
  isActionTile(r, c) {
    return this.actionTiles().some((t) => t.r === r && t.c === c);
  }
  // Premier emplacement libre d'une allée ouverte (bouton « Placer » du menu Aménager).
  firstFreeSlot() {
    const s = this.state;
    const sl = SHELF_SLOTS.find((x) => this.zoneOwned(x.zone) && !s.shelves.some((y) => y.slot === x.id));
    return sl ? sl.id : null;
  }
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
  // Places libres dans la réserve : 30 cartons au total, en comptant ceux en route et ceux qu'on porte.
  deliveryRoom() {
    const carried = [this.player, this.stocker].filter((a) => a && a.carry).length;
    return RESERVE_CAPACITY - this.deliveryCount() - this.state.pending.length - carried;
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
    if (this.moving) return this.tapMove(r, c);
    const p = this.player;
    // Réserve (V1.4) : toute la zone est touchable. Avec un carton en main : on le pose sur cette case ;
    // les mains vides : on prend le carton du dessus de la pile touchée.
    const spotIdx = spotIndex(r, c);
    if (spotIdx >= 0) {
      const stack = s.delivery[spotIdx];
      if (p.carry) {
        const chk = this.canPlaceAt(spotIdx, { ignore: p });
        if (!chk.ok) {
          this.emit('sfx', { name: 'error' });
          return this.toast(chk.reason);
        }
        const acc = this.accessFor(p, spotIdx);
        if (!acc) return this.toast('Impossible d’atteindre cette case');
        this.leaveRegister();
        this.moveTo(p, acc.r, acc.c, () => this.dropCarton(p, spotIdx));
        return { moved: true };
      }
      if (!stack.length) {
        if (!this.blocked[r * 9 + c]) {
          this.leaveRegister();
          this.moveTo(p, r, c);
        }
        if (!this.deliveryCount()) return this.toast('Réserve vide : commande avec le bouton « Commander » en bas');
        return { moved: true };
      }
      const acc = this.accessFor(p, spotIdx);
      if (!acc) return this.toast('Cette pile est bloquée : libère un passage à côté');
      this.leaveRegister();
      this.moveTo(p, acc.r, acc.c, () => {
        if (p.carry || !stack.length) return;
        const carton = stack[stack.length - 1];
        this.takeCarton(p, spotIdx, carton);
        this.emit('sfx', { name: 'pick' });
        this.emit('haptic', { ms: 12 });
        if (s.tutorial === 1) this.advanceTutorial(2);
      });
      return { moved: true };
    }
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
    // V1.4 : le personnel ne range JAMAIS un produit dans le rayon d'un autre produit, même vide.
    if (agent.kind !== 'player' && !this.staffMayFill(shelf, agent.carry.product)) return;
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
    // V1.4 : la rangée du haut touche la réserve : ne jamais couper l'accès aux cartons ni enfermer quelqu'un.
    const test = new Uint8Array(this.blocked);
    test[slot.r * 9 + slot.c] = 1;
    const why = this.layoutProblem(test);
    if (why) return { ok: false, reason: `Pas ici : ${why}` };
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
    if (!cand) return { ok: false, reason: 'Plus de candidat cette semaine' };
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
    return minPriceOf(PRODUCT_BY_ID[id]);
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
      this.stocker = this.makeAgent(STOCKER_HOME.r, STOCKER_HOME.c, { kind: 'stocker', level: st.level, speed: lv.speed, perUnit: lv.perUnit, carry: null, idle: 0, task: null, name: st.name, lookIndex: st.look, look: staffLook(st) });
    }
    if ((!st || st.days <= 0) && this.stocker) {
      if (this.stocker.carry) {
        const c = this.stocker.carry;
        this.stocker.carry = null;
        this.returnCarton(c);
      }
      this.stocker = null;
    }
  }

  // Carton remis dans la réserve sans marcher (fin de contrat du magasinier) : sur la meilleure case valide.
  returnCarton(carry) {
    const idx = this.findDropSpot(carry.product);
    if (idx >= 0) {
      this.state.delivery[idx].push(carry);
      this.reserveChanged();
    } else this.state.pending.push({ product: carry.product, eta: 1, qty: carry.qty });
  }

  // ------------------------------------------------------------- réserve (V1.4)
  agents() {
    return [this.player, this.stocker, ...(this.helpers || []), ...this.customers].filter(Boolean);
  }

  // La grille dépend de la réserve (une case avec des cartons bloque le passage) : on la refait, et tout le
  // monde recalcule son chemin.
  reserveChanged() {
    this.rebuild();
    this.repathAll();
  }

  // Peut-on poser un carton sur cette case ? Pile pas pleine, personne debout dessus, et aucune pile ni
  // personne enfermée (chaque pile garde une case libre à côté, reliée à la porte).
  canPlaceAt(idx, { ignore = null } = {}) {
    const s = this.state;
    const d = DELIVERY_SPOTS[idx];
    if (!d) return { ok: false, reason: 'Pose les cartons dans la réserve' };
    const stack = s.delivery[idx];
    if (stack.length >= SPOT_STACK) return { ok: false, reason: `Pile pleine (${SPOT_STACK} cartons au plus)` };
    if (stack.length) return { ok: true };
    if (this.agents().some((a) => a !== ignore && Math.abs(a.x - d.c) < 0.85 && Math.abs(a.y - d.r) < 0.85)) {
      return { ok: false, reason: 'Quelqu’un se tient à cet endroit' };
    }
    // Relecture V1.4 : ni sur la case où quelqu'un est en train d'aller.
    const goingThere = (a) => a.path && a.path.length && a.path[a.path.length - 1].r === d.r && a.path[a.path.length - 1].c === d.c;
    if (this.agents().some((a) => a !== ignore && goingThere(a))) return { ok: false, reason: 'Quelqu’un va à cet endroit' };
    if (d.r === STOCKER_HOME.r && d.c === STOCKER_HOME.c && this.staffAgents().length && !ignore) return { ok: false, reason: 'Place du magasinier' };
    const blocked = new Uint8Array(this.blocked);
    blocked[d.r * 9 + d.c] = 1;
    const why = this.layoutProblem(blocked, ignore);
    if (why) return { ok: false, reason: `Ici, ${why} : laisse un passage` };
    if (ignore && !DIRS.some(([dr, dc]) => this.walkable(blocked, d.r + dr, d.c + dc))) return { ok: false, reason: 'Ici, tu te retrouverais enfermé' };
    return { ok: true };
  }

  walkable(blocked, r, c) {
    return r >= 0 && c >= 0 && r < 15 && c < 9 && !blocked[r * 9 + c];
  }

  // Avec cette grille, quelque chose deviendrait-il inaccessible depuis la porte ? (texte du problème ou null)
  // Vérifié avant de poser un carton, d'acheter ou de déplacer une étagère.
  layoutProblem(blocked, ignore = null) {
    const s = this.state;
    const seen = reachable(blocked, DOOR.r, DOOR.c);
    const ok = (r, c) => r >= 0 && c >= 0 && r < 15 && c < 9 && seen[r * 9 + c];
    for (let i = 0; i < DELIVERY_SPOTS.length; i++) {
      const t = DELIVERY_SPOTS[i];
      if (!blocked[t.r * 9 + t.c]) continue;
      if (!DIRS.some(([dr, dc]) => ok(t.r + dr, t.c + dc))) return 'une pile de cartons deviendrait inaccessible';
    }
    for (const sh of s.shelves) {
      const sl = slotById(sh.slot);
      if (!ok(sl.r + 1, sl.c)) return 'un rayon deviendrait inaccessible';
    }
    for (const a of this.agents()) {
      if (a === ignore) continue;
      const t = this.tileOf(a);
      if (!blocked[t.r * 9 + t.c] && !ok(t.r, t.c)) return 'quelqu’un se retrouverait enfermé';
    }
    return null;
  }

  hasFreeSide(idx) {
    const d = DELIVERY_SPOTS[idx];
    return DIRS.some(([dr, dc]) => this.walkable(this.blocked, d.r + dr, d.c + dc));
  }

  // Case libre voisine d'une pile, la plus proche à pied pour cet agent : { r, c, len } ou null.
  accessFor(agent, idx) {
    const d = DELIVERY_SPOTS[idx];
    const from = this.tileOf(agent);
    let best = null;
    for (const [dr, dc] of DIRS) {
      const r = d.r + dr;
      const c = d.c + dc;
      if (r < 0 || c < 0 || r >= 15 || c >= 9) continue;
      if (this.blocked[r * 9 + c] && !(r === from.r && c === from.c)) continue;
      const path = findPath(this.blocked, from.r, from.c, r, c);
      if (!path) continue;
      if (!best || path.length < best.len) best = { r, c, len: path.length };
    }
    return best;
  }

  // Meilleure case pour un carton qui arrive : avec le même produit si possible (piles par produit, plus
  // lisibles), sinon une palette vide du fond, sinon la pile la plus basse ; jamais une case invalide.
  findDropSpot(product, ignore = null) {
    const s = this.state;
    const order = [...AUTO_SPOTS, ...DELIVERY_SPOTS.keys()].filter((v, i, a) => a.indexOf(v) === i);
    // Pile existante : il faut aussi pouvoir l'atteindre (sauvegarde abîmée : pile entourée).
    const ok = (i) => this.canPlaceAt(i, { ignore }).ok && (!s.delivery[i].length || (ignore ? !!this.accessFor(ignore, i) : this.hasFreeSide(i)));
    for (const i of AUTO_SPOTS) {
      const st = s.delivery[i];
      if (st.length && st.length < SPOT_STACK && st[st.length - 1].product === product && ok(i)) return i;
    }
    for (const i of AUTO_SPOTS) if (!s.delivery[i].length && ok(i)) return i;
    let best = -1;
    for (const i of order) {
      if (s.delivery[i].length < SPOT_STACK && ok(i) && (best < 0 || s.delivery[i].length < s.delivery[best].length)) best = i;
    }
    return best;
  }

  // Prendre un carton (celui du dessus, ou un carton coincé dessous : le magasinier soulève les autres).
  takeCarton(agent, idx, carton) {
    const st = this.state.delivery[idx];
    const k = st.lastIndexOf(carton);
    if (k < 0) return false;
    st.splice(k, 1);
    agent.carry = carton;
    // Un employé qui venait chercher ce carton change de tâche aussitôt.
    for (const o of this.staffAgents()) {
      if (o !== agent && o.task && o.task.carton === carton) this.cancelTask(o, 0.2);
    }
    if (!st.length) this.reserveChanged();
    return true;
  }

  dropCarton(agent, idx) {
    if (!agent.carry) return false;
    const chk = this.canPlaceAt(idx, { ignore: agent });
    if (!chk.ok) {
      if (agent.kind === 'player') {
        this.emit('sfx', { name: 'error' });
        this.toast(chk.reason);
      }
      return false;
    }
    const st = this.state.delivery[idx];
    st.push(agent.carry);
    agent.carry = null;
    if (st.length === 1) this.reserveChanged();
    if (agent.kind === 'player') {
      this.drops++;
      this.emit('sfx', { name: 'drop' });
    }
    return true;
  }

  // ------------------------------------------------------------- déplacer une étagère (V1.2)
  // Gratuit. Le produit et la quantité suivent l'étagère. Refusé si quelqu'un la remplit ou s'y sert,
  // ou si quelqu'un se tient sur l'emplacement visé. Tous les chemins sont recalculés ensuite.
  canMoveShelf(fromId, toId) {
    const s = this.state;
    const shelf = s.shelves.find((x) => x.slot === fromId);
    if (!shelf) return { ok: false, reason: 'Pas d’étagère à cet endroit' };
    const to = slotById(toId);
    if (!to) return { ok: false, reason: 'Emplacement inconnu' };
    if (fromId === toId) return { ok: false, reason: 'L’étagère est déjà ici' };
    if (!this.zoneOwned(to.zone)) return { ok: false, reason: 'Cette allée n’est pas encore ouverte' };
    if (s.shelves.some((x) => x.slot === toId)) return { ok: false, reason: 'Cet emplacement est déjà pris' };
    const from = slotById(fromId);
    const fillers = [this.player, ...this.staffAgents()].filter((a) => a && a.fill && a.fill.shelf === shelf);
    if (fillers.length) {
      return { ok: false, reason: fillers[0].kind === 'player' ? 'Tu es en train de remplir ce rayon : attends la fin' : `${fillers[0].name || 'Le magasinier'} remplit ce rayon : réessaie dans un instant` };
    }
    if (this.customers.some((cu) => cu.state === 'browse' && !cu.path.length && this.tileOf(cu).r === from.r + 1 && this.tileOf(cu).c === from.c)) {
      return { ok: false, reason: 'Un client se sert dans ce rayon : réessaie dans un instant' };
    }
    const agents = this.agents();
    if (agents.some((a) => Math.abs(a.x - to.c) < 0.85 && Math.abs(a.y - to.r) < 0.85)) {
      return { ok: false, reason: 'Quelqu’un passe à cet endroit : réessaie dans un instant' };
    }
    const test = new Uint8Array(this.blocked);
    test[from.r * 9 + from.c] = 0;
    test[to.r * 9 + to.c] = 1;
    // (le rayon déplacé est vérifié à sa nouvelle place)
    shelf.slot = toId;
    const why = this.layoutProblem(test);
    shelf.slot = fromId;
    if (why) return { ok: false, reason: `Pas ici : ${why}` };
    return { ok: true, shelf, from, to };
  }

  moveShelf(fromId, toId) {
    const chk = this.canMoveShelf(fromId, toId);
    if (!chk.ok) return chk;
    const { shelf, from, to } = chk;
    const oldFront = { r: from.r + 1, c: from.c };
    const endsAt = (a, t) => a && a.path.length && a.path[a.path.length - 1].r === t.r && a.path[a.path.length - 1].c === t.c;
    shelf.slot = toId;
    this.rebuild();
    // Ceux qui allaient vers l'ancien emplacement vont au nouveau.
    for (const cu of this.customers) {
      if (cu.state === 'shop' && cu.target && cu.target.r === oldFront.r && cu.target.c === oldFront.c) cu.target = { r: to.r + 1, c: to.c };
    }
    const p = this.player;
    if (endsAt(p, oldFront) && p.carry) {
      this.moveTo(p, to.r + 1, to.c, () => this.startFill(p, shelf, to));
    }
    for (const st of this.staffAgents()) {
      if (endsAt(st, oldFront) || (st.task && st.task.shelf === shelf)) this.cancelTask(st, 0);
    }
    this.repathAll();
    this.moves++;
    this.emit('sfx', { name: 'build' });
    return { ok: true };
  }

  // Cases libres où l'étagère peut aller (allées ouvertes).
  freeSlots() {
    const s = this.state;
    return SHELF_SLOTS.filter((sl) => this.zoneOwned(sl.zone) && !s.shelves.some((x) => x.slot === sl.id));
  }

  startMove(fromId = null) {
    this.moving = { from: fromId };
    this.emit('moving', { on: true });
  }

  cancelMove() {
    if (!this.moving) return;
    this.moving = null;
    this.emit('moving', { on: false });
  }

  // Toucher pendant le mode « Déplacer » : choisir l'étagère, puis un « + » libre.
  tapMove(r, c) {
    const mv = this.moving;
    const sh = this.shelfAt(r, c);
    if (sh && sh.shelf) {
      if (mv.from === sh.slot.id) {
        this.cancelMove();
        return { moveCancelled: true };
      }
      mv.from = sh.slot.id;
      this.emit('moving', { on: true });
      this.emit('sfx', { name: 'tick' });
      return { moveFrom: sh.slot.id };
    }
    if (sh && !sh.shelf && mv.from) {
      const res = this.moveShelf(mv.from, sh.slot.id);
      if (!res.ok) {
        this.emit('sfx', { name: 'error' });
        return this.toast(res.reason);
      }
      this.moving = null;
      this.emit('moving', { on: false });
      return { moved: false, moveDone: sh.slot.id };
    }
    return this.toast(mv.from ? 'Touche un « + » libre pour y poser l’étagère' : 'Touche l’étagère à déplacer');
  }

  // ------------------------------------------------------------- journée : événement et objectifs (V1.2)
  // Multiplicateur de clients du jour. Point d'entrée prévu pour les concurrents du quartier (V1.3).
  dayMultiplier() {
    const ev = EVENT_BY_ID[this.state.event];
    return (ev ? ev.clients : 1) * this.trustFactor();
  }

  // V1.5 : bouche-à-oreille après des clients surfacturés (remarqué) : moins de clients, qui reviennent peu à peu.
  trustFactor() {
    const d = Math.max(0, this.state.distrust || 0);
    return Math.max(CASH_ERRORS.distrustFloor, 1 - d / CASH_ERRORS.distrustScale);
  }

  planDay(withEvent = true) {
    const s = this.state;
    s.event = null;
    if (withEvent && s.day >= 3 && Math.random() < 0.5) {
      const ok = EVENTS.filter((e) => !e.wanted || e.wanted.some((id) => s.licences.includes(id)));
      s.event = pick(ok).id;
    }
    const expected = customersPerDay(s, Math.max(1, this.stockedTypes()), this.dayMultiplier());
    const serve = Math.max(5, Math.round(expected * 0.95));
    const perClient = 1.5 + 0.15 * Math.min(10, s.level);
    const targets = {
      serve,
      sell: Math.max(8, Math.round(serve * perClient * 0.85)),
      perfect: s.level < 4 ? 2 : 3,
      calm: 0,
      stock: 2,
      pop: s.reputation > 85 ? 0.5 : s.reputation > 60 ? 1 : 2
    };
    // « Monnaie juste » seulement si le joueur peut encore tenir une caisse lui-même.
    const allStaffed = s.staff.cashiers.filter((c) => c.days > 0).length >= s.registers.length;
    const kinds = Object.keys(GOAL_KINDS).filter((k) => !(k === 'perfect' && allStaffed));
    const list = [];
    while (s.day >= GOALS_FROM_DAY && list.length < GOALS_PER_DAY) {
      const k = kinds.splice(Math.floor(Math.random() * kinds.length), 1)[0];
      list.push({ kind: k, target: targets[k], reward: cents(goalReward(s.level)) });
    }
    s.goals = { day: s.day, list };
  }

  // Avancement des objectifs : { kind, label, value, target, done, failed, reward }
  goalsStatus(final = false) {
    const s = this.state;
    if (!s.goals) return [];
    return s.goals.list.map((g) => {
      const def = GOAL_KINDS[g.kind];
      const value = def.value(s.stats, s);
      let done, failed = false;
      if (def.max) {
        failed = value > g.target;
        done = final && !failed && def.min(s.stats);
      } else done = value >= g.target;
      return { kind: g.kind, icon: def.icon, label: def.label(g.target), value, target: g.target, done, failed, max: !!def.max, reward: g.reward };
    });
  }

  repathAll() {
    for (const a of [this.player, ...this.staffAgents()]) {
      if (a && a.path.length) {
        const last = a.path[a.path.length - 1];
        if (this.blocked[last.r * 9 + last.c] && spotIndex(last.r, last.c) >= 0) {
          // la case visée vient de recevoir des cartons : on s'arrête (le magasinier rechoisit une tâche)
          if (a.kind === 'stocker') this.cancelTask(a, 0.3);
          else { a.path = []; a.onArrive = null; }
          continue;
        }
        const ok = this.moveTo(a, last.r, last.c, a.onArrive);
        if (!ok && a.kind === 'stocker') this.cancelTask(a, 0.3); // plus de chemin : il choisit autre chose
      }
    }
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
    const pop = this.dailyPopularity();
    this.addReputation(pop.choix, 'choix');
    if (pop.personnel) this.addReputation(pop.personnel, 'personnel');
    const charges = cents(dailyCharges(s));
    s.coins -= charges;
    // Objectifs du jour : primes en pièces
    const goals = this.goalsStatus(true);
    const goalCoins = goals.reduce((a, g) => a + (g.done ? g.reward : 0), 0);
    s.coins += goalCoins;
    const summary = {
      day: s.day,
      revenue: s.stats.revenue,
      spent: s.stats.spent,
      charges,
      sold: s.stats.sold,
      served: s.stats.served,
      angry: s.stats.angry,
      missing: s.stats.missing,
      missingBy: { ...(s.stats.missingBy || {}) },
      cashErrors: s.stats.cashErrors ? { ...s.stats.cashErrors } : null,
      profit: s.stats.revenue - s.stats.spent - charges + goalCoins,
      goals,
      goalCoins,
      event: s.event,
      reputation: s.reputation,
      rep: { ...(s.stats.rep || {}) },
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
    s.distrust = Math.round((s.distrust || 0) * CASH_ERRORS.distrustDecay * 100) / 100;
    if (s.distrust < 0.1) s.distrust = 0;
    this.syncStaff();
    this.planDay();
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
      this.emit('levelup', { level: s.level, unlocked: unlocksAt(s.level) });
    }
  }

  // Popularité du magasin (0 à 100). « why » range la variation par cause pour le bilan du jour :
  // prix, service, arnaque, choix, personnel.
  addReputation(d, why = 'service') {
    const s = this.state;
    const before = s.reputation;
    s.reputation = Math.max(0, Math.min(100, s.reputation + d));
    const rep = s.stats.rep || (s.stats.rep = {});
    rep[why] = (rep[why] || 0) + (s.reputation - before);
  }

  // Bilan de popularité de fin de journée : choix en rayon et qualité de l'équipe.
  dailyPopularity() {
    const s = this.state;
    const types = this.stockedTypes();
    const stocked = s.shelves.filter((x) => x.product);
    const fill = stocked.length ? stocked.reduce((a, x) => a + x.qty, 0) / (stocked.length * SHELF_CAPACITY) : 0;
    let choix = Math.max(-1, Math.min(1.5, 0.25 * types - 1));
    if (fill < 0.2) choix -= 0.8;
    else if (fill > 0.6) choix += 0.4;
    const team = [...s.staff.cashiers, ...(s.staff.stocker ? [s.staff.stocker] : [])];
    const personnel = Math.max(-0.5, Math.min(1, team.reduce((a, m) => a + 0.12 * (m.level - 2), 0)));
    return { choix, personnel };
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
    const ev = EVENT_BY_ID[s.event];
    const n = 1 + Math.floor(Math.random() * maxItems) + (ev?.extra || 0);
    const pool = [...owned];
    const list = [];
    // Événement : un produit très demandé s'ajoute à beaucoup de listes.
    const wanted = (ev?.wanted || []).filter((id) => owned.includes(id));
    if (wanted.length && Math.random() < 0.6) {
      const id = pick(wanted);
      pool.splice(pool.indexOf(id), 1);
      list.push({ product: id, want: Math.random() < 0.5 ? 2 : 1 });
    }
    for (let i = list.length; i < n && pool.length; i++) {
      const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      list.push({ product: id, want: Math.random() < 0.3 ? 2 : 1 });
    }
    // Tutoriel : liste imposée (produits en rayon + un produit absent, pour voir une demande non satisfaite).
    if (this.scriptLists.length) list.splice(0, list.length, ...this.scriptLists.shift().map((x) => ({ ...x })));
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
        this.countMissing(item.product);
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
    const tol = EVENT_BY_ID[s.event]?.tolerance || 0;
    if (Math.random() > buyChance(ratio - tol)) {
      cu.mood -= 0.15;
      this.say(cu, '💸');
      cu.idx++;
      return this.nextShelf(cu);
    }
    const take = Math.min(item.want, shelf.qty);
    shelf.qty -= take;
    if (shelf.qty === 0) this.emit('empty', { product: item.product });
    for (let i = 0; i < take; i++) cu.basket.push({ product: item.product, price: s.prices[item.product] });
    this.addReputation(priceReputation(ratio) * take, 'prix');
    if (take < item.want) {
      cu.mood -= 0.1;
      this.countMissing(item.product);
    }
    if (ratio < 0.9) cu.mood += 0.05;
    cu.idx++;
    this.nextShelf(cu);
  }

  // Demande non satisfaite : un client voulait ce produit et ne l'a pas trouvé (rayon absent ou vide), ou pas
  // en quantité suffisante. Effet : client moins content (−0,22 ou −0,1 d'humeur), donc moins de popularité.
  countMissing(product) {
    const st = this.state.stats;
    st.missing++;
    if (!st.missingBy || typeof st.missingBy !== 'object') st.missingBy = {};
    st.missingBy[product] = (st.missingBy[product] || 0) + 1;
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
    cu.paid = true; // repart avec son sac (dessin)
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
    const forced = { card: 0.1, exact: 0.45, cash: 0.9 }[this.nextPayment];
    this.nextPayment = null;
    const r = forced ?? Math.random();
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
      if (excess === 0) {
        cu.mood += 0.1;
        this.state.stats.perfect = (this.state.stats.perfect || 0) + 1;
      }
      // Trop rendu = erreur en faveur du client ; pas assez rendu = en faveur du magasin.
      const mk = this.cashMistake(cu, co.total, co.paidWith - given, CASH_ERRORS.notice.change, 'player');
      noticed = mk.noticed;
      if (mk.refused) {
        this.refuseSale(cu);
        this.emit('sfx', { name: 'angry' });
        this.emit('haptic', { ms: 40 });
        this.emit('checkout', { open: false, excess });
        return { ok: true, excess, noticed: true, refused: true };
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
      // V1.5 : le montant se tape comme on le lit (« 1,60 ») ; saisie bornée à 999,99.
      const value = parseCardAmount(co.card);
      if (value == null || value <= 0) {
        this.emit('sfx', { name: 'error' });
        return { ok: false, reason: 'Tape le montant à encaisser' };
      }
      const cu = this.customers.find((x) => x.id === co.customerId);
      const diff = value - co.total;
      let noticed = false;
      this.checkout = null;
      if (cu) {
        // Facturé trop = en faveur du magasin (remarqué ou non) ; pas assez = en faveur du client.
        const mk = this.cashMistake(cu, co.total, value, CASH_ERRORS.notice.card, 'player');
        noticed = mk.noticed;
        if (mk.refused) {
          this.refuseSale(cu);
          this.emit('sfx', { name: 'angry' });
          this.emit('haptic', { ms: 40 });
          this.emit('checkout', { open: false });
          return { ok: true, diff, noticed: true, refused: true };
        }
        this.completeSale(cu, value);
      }
      this.emit('sfx', { name: noticed ? 'angry' : 'cash' });
      this.emit('haptic', { ms: 20 });
      this.emit('checkout', { open: false });
      return { ok: true, diff, noticed };
    } else if (k === ',' || k === '.') {
      if (!co.card.includes(',')) { co.card = (co.card || '0') + ','; this.emit('sfx', { name: 'key' }); }
    } else if (/^\d$/.test(k)) {
      // Pas plus de 3 chiffres avant la virgule ni 2 après : la saisie refuse le chiffre en trop.
      const next = co.card + k;
      const [a, b] = next.split(',');
      if (a.length <= CARD_MAX_INT_DIGITS && (b === undefined || b.length <= 2)) {
        co.card = next;
        this.emit('sfx', { name: 'key' });
      } else {
        this.emit('sfx', { name: 'error' });
        return { ok: false, reason: b === undefined ? 'Montant trop grand : tape la virgule pour les centimes' : 'Deux chiffres après la virgule au plus' };
      }
    }
    return { ok: true };
  }

  // Erreur de caisse (V1.4) : erreur → détection → réaction, voir cashError / cashDetect / cashReaction.
  // Renvoie { noticed, refused } : remarquée par le client ? refusée (plus de 10 pièces de trop, V1.5) ?
  cashMistake(cu, due, paid, chance, who) {
    const err = cashError(due, paid);
    if (!err.favor) return { noticed: false, refused: false };
    const noticed = cashDetect(err, chance);
    const re = cashReaction(err, noticed, who);
    if (re.rep) this.addReputation(re.rep, re.why);
    // Bouche-à-oreille (V1.5) : des clients en moins les jours suivants, voir dayMultiplier().
    if (re.distrust && who === 'player') this.state.distrust = (this.state.distrust || 0) + re.distrust;
    cu.mood += re.mood;
    if (re.bubble) this.say(cu, re.bubble, 2.5);
    const st = this.state.stats;
    st.cashErrors = st.cashErrors || { client: 0, noticed: 0, unnoticed: 0 };
    if (err.favor === 'client') st.cashErrors.client++;
    else if (re.refused) st.cashErrors.refused = (st.cashErrors.refused || 0) + 1;
    else if (noticed) st.cashErrors.noticed++;
    else st.cashErrors.unnoticed++;
    return { noticed, refused: !!re.refused };
  }

  // V1.5 : le client refuse de payer un montant énorme. Pas de vente, pas d'argent : ses articles retournent en
  // rayon (ou dans la réserve s'il n'y a plus de place), et il part fâché.
  refuseSale(cu) {
    const s = this.state;
    const left = {};
    for (const it of cu.basket) {
      const shelf = s.shelves.find((x) => x.product === it.product && x.qty < SHELF_CAPACITY);
      if (shelf) shelf.qty++;
      else left[it.product] = (left[it.product] || 0) + 1;
    }
    // Rayon plein entre-temps : les articles repartent dans la réserve en carton entamé (rien ne disparaît).
    for (const [product, qty] of Object.entries(left)) this.returnCarton({ product, qty });
    cu.basket = [];
    cu.processing = false;
    s.stats.angry++;
    this.say(cu, '😡', 3);
    this.emit('refused', {});
    this.leaveQueue(cu);
    cu.state = 'leaving';
    this.goto(cu, DOOR.r, DOOR.c, () => { cu.gone = true; });
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
        const idx = this.findDropSpot(d.product);
        if (idx < 0) break; // réserve encombrée : le livreur attend qu'une place se libère
        const st = s.delivery[idx];
        st.push({ product: d.product, qty: d.qty ?? PRODUCT_BY_ID[d.product].qty });
        if (st.length === 1) this.reserveChanged();
        s.pending.splice(s.pending.indexOf(d), 1);
        this.emit('delivery', {});
      }
    }

    // Temps de la journée
    if (s.phase === 'open') {
      s.minute += dt * GAME_MIN_PER_SEC;
      this.spawnClock -= dt * GAME_MIN_PER_SEC;
      if (this.spawnClock <= 0) {
        // V1.5 : avec la méfiance du quartier, le minimum de 4 clients par jour ne s'applique plus.
        const perDay = customersPerDay(s, Math.max(1, this.stockedTypes()), this.dayMultiplier(), this.trustFactor() < 1 ? 1 : 4);
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
    for (const a of this.staffAgents()) this.updateStocker(a, dt);
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
          // Erreur de caisse : un article compté deux fois (le client paie trop) ou oublié (il paie moins).
          const it = cu.basket[Math.floor(Math.random() * cu.basket.length)];
          const over = Math.random() < 0.5;
          received = over ? total + it.price : total - it.price;
          this.state.stats.staffErrors = (this.state.stats.staffErrors || 0) + 1;
          const mk = this.cashMistake(cu, total, received, CASH_ERRORS.notice.cashier, 'cashier');
          this.emit('staffError', { name: cashier.name, over, amount: it.price, noticed: mk.noticed, refused: mk.refused });
          if (mk.refused) {
            this.refuseSale(cu);
            return;
          }
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

  // ------------------------------------------------------------- magasinier (V1.4)
  // Règles, identiques à tous les niveaux :
  //  - un produit va dans SON rayon (même produit), ou dans une étagère neuve sans produit si ce produit n'a
  //    encore aucun rayon ; jamais dans le rayon d'un autre produit, même vide ;
  //  - il ne prend un carton que s'il a déjà un rayon compatible où le vider ;
  //  - il va de lui-même remplir les rayons vides ou presque vides ; un rayon vide passe en premier ;
  //  - un carton coincé sous d'autres est sorti quand même (un peu plus long) ;
  //  - chaque carton et chaque rayon visés sont réservés : deux employés ne font jamais la même tâche ;
  //  - rien à faire : il attend près de la réserve (pas d'aller-retour sans fin).
  // Les étoiles jouent seulement sur la vitesse et l'initiative (seuil de remplissage, temps de réflexion).
  staffAgents() {
    return [this.stocker, ...(this.helpers || [])].filter(Boolean);
  }

  stockerLevel(a) {
    return STOCKER_LEVELS[Math.max(1, Math.min(5, a.level || 1)) - 1];
  }

  // Ce rayon peut-il recevoir ce produit des mains d'un employé ?
  staffMayFill(shelf, product) {
    if (shelf.product) return shelf.product === product;
    return !this.state.shelves.some((x) => x.product === product);
  }

  // Ce que les AUTRES employés ont réservé.
  claimsExcept(agent) {
    const cartons = new Set();
    const shelves = new Set();
    for (const o of this.staffAgents()) {
      if (o === agent || !o.task) continue;
      if (o.task.carton) cartons.add(o.task.carton);
      if (o.task.shelf) shelves.add(o.task.shelf);
    }
    return { cartons, shelves };
  }

  // Rayon où un employé peut vider ce carton (le moins rempli d'abord), ou null.
  shelfFor(product, agent = null) {
    const s = this.state;
    const { shelves } = this.claimsExcept(agent);
    const ok = s.shelves.filter((x) => x.qty < SHELF_CAPACITY && !shelves.has(x) && this.staffMayFill(x, product));
    if (!ok.length) return null;
    return ok.sort((a, b) => (a.product ? 0 : 1) - (b.product ? 0 : 1) || a.qty - b.qty)[0];
  }

  // Le rayon a-t-il besoin de ce magasinier ? Vide : toujours ; sinon sous le seuil de son niveau.
  shelfNeedsStock(shelf, lv) {
    // Jamais pour 1 ou 2 articles : il faut de la place pour au moins un tiers de rayon (pas d'allers-retours).
    return shelf.qty === 0 || (shelf.qty <= SHELF_CAPACITY * lv.refill && SHELF_CAPACITY - shelf.qty >= SHELF_CAPACITY / 3);
  }

  // Choisit la prochaine tâche : { shelf, product, carton, idx, above } ou null.
  chooseTask(a) {
    const s = this.state;
    const lv = this.stockerLevel(a);
    const { cartons, shelves } = this.claimsExcept(a);
    const here = this.tileOf(a);
    // Cartons disponibles par produit, avec un coût (cartons à soulever, distance, carton entamé d'abord)
    const offers = new Map();
    s.delivery.forEach((st, idx) => {
      st.forEach((carton, k) => {
        if (cartons.has(carton)) return;
        const d = DELIVERY_SPOTS[idx];
        const above = st.length - 1 - k;
        const cost = above * 3 + Math.abs(d.r - here.r) + Math.abs(d.c - here.c) * 0.5 + (carton.qty < PRODUCT_BY_ID[carton.product].qty ? -0.5 : 0);
        const list = offers.get(carton.product) || [];
        list.push({ carton, idx, above, cost });
        offers.set(carton.product, list);
      });
    });
    if (!offers.size) return null;
    const needs = s.shelves.filter((x) => !shelves.has(x) && x.qty < SHELF_CAPACITY && this.shelfNeedsStock(x, lv));
    // Rayon vide d'abord, puis le moins rempli.
    needs.sort((x, y) => (x.qty === 0 ? 0 : 1) - (y.qty === 0 ? 0 : 1) || x.qty - y.qty || (x.product ? 0 : 1) - (y.product ? 0 : 1));
    for (const shelf of needs) {
      // Étagère sans produit : seulement pour un produit qui n'a encore aucun rayon.
      const products = shelf.product ? [shelf.product] : [...offers.keys()].filter((p) => !s.shelves.some((x) => x.product === p));
      for (const p of products) {
        const list = (offers.get(p) || []).slice().sort((x, y) => x.cost - y.cost);
        for (const o of list) {
          if (!this.accessFor(a, o.idx)) continue; // pile entourée : on essaie un autre carton
          return { shelf, product: p, carton: o.carton, idx: o.idx, above: o.above };
        }
      }
    }
    return null;
  }

  cancelTask(a, idle = 0.5) {
    a.path = [];
    a.onArrive = null;
    a.busy = false;
    a.task = null;
    a.dig = null;
    a.idle = idle;
  }

  updateStocker(a, dt) {
    const s = this.state;
    const lv = this.stockerLevel(a);
    this.moveAgent(a, dt);
    if (a.fill) {
      this.stepFill(a, dt, a.perUnit || lv.perUnit);
      if (!a.fill) {
        a.busy = false;
        a.task = null;
        a.idle = lv.think * 0.4;
      }
      return;
    }
    if (a.dig) {
      // Sortir un carton coincé sous d'autres (il soulève ceux du dessus)
      a.dig.t -= dt;
      if (a.dig.t > 0) return;
      const { carton, idx } = a.dig;
      a.dig = null;
      a.busy = false;
      if (!s.delivery[idx].includes(carton) || a.carry) return this.cancelTask(a, lv.think);
      this.takeCarton(a, idx, carton);
      a.idle = 0.1;
      return;
    }
    if (a.path.length || a.busy) return;
    a.idle -= dt;
    if (a.idle > 0) return;

    if (a.carry) {
      // Un carton en main : vers son rayon, sinon retour à la réserve.
      const shelf = this.shelfFor(a.carry.product, a);
      if (shelf) {
        const sl = slotById(shelf.slot);
        a.task = { shelf };
        a.busy = true;
        const ok = this.moveTo(a, sl.r + 1, sl.c, () => {
          a.busy = false;
          const cur = s.shelves.includes(shelf) ? slotById(shelf.slot) : null;
          const t = this.tileOf(a);
          if (!cur || t.r !== cur.r + 1 || t.c !== cur.c) return this.cancelTask(a, 0.2); // étagère déplacée
          this.startFill(a, shelf, cur);
          if (!a.fill) this.cancelTask(a, lv.think);
        });
        if (!ok) this.cancelTask(a, lv.think);
        return;
      }
      const idx = this.findDropSpot(a.carry.product, a);
      const acc = idx >= 0 ? this.accessFor(a, idx) : null;
      if (!acc) return this.cancelTask(a, lv.think + 1);
      a.task = { drop: idx };
      a.busy = true;
      const ok = this.moveTo(a, acc.r, acc.c, () => {
        a.busy = false;
        a.task = null;
        a.idle = this.dropCarton(a, idx) ? lv.think * 0.5 : lv.think;
      });
      if (!ok) this.cancelTask(a, lv.think);
      return;
    }

    const task = this.chooseTask(a);
    if (!task) {
      // Rien d'utile : il patiente près de la réserve.
      a.idle = lv.think + 0.6;
      const t = this.tileOf(a);
      if ((t.r !== STOCKER_HOME.r || t.c !== STOCKER_HOME.c) && !this.blocked[STOCKER_HOME.r * 9 + STOCKER_HOME.c]) this.moveTo(a, STOCKER_HOME.r, STOCKER_HOME.c);
      return;
    }
    a.task = task;
    a.busy = true;
    const acc = this.accessFor(a, task.idx);
    const ok = acc && this.moveTo(a, acc.r, acc.c, () => {
      const st = s.delivery[task.idx];
      const k = st.indexOf(task.carton);
      if (k < 0 || a.carry || a.task !== task) return this.cancelTask(a, lv.think * 0.5); // carton pris ou déplacé
      const above = st.length - 1 - k;
      if (above > 0) {
        a.dig = { t: lv.dig * above, carton: task.carton, idx: task.idx };
        return;
      }
      a.busy = false;
      this.takeCarton(a, task.idx, task.carton);
      a.idle = 0.1;
    });
    if (!ok) this.cancelTask(a, lv.think);
  }

  productWanted(product) {
    if (!product) return false;
    return this.state.delivery.some((st) => st.some((c) => c.product === product)) || this.state.pending.some((d) => d.product === product);
  }
}
