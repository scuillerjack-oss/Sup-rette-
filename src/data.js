// Données du jeu : catalogue, plan du magasin, économie.
// Tous les montants sont en pièces (avec centimes, multiples de 0,10 pour les prix de vente).

export const SAVE_KEY = 'superette-save-v1';
export const SETTINGS_KEY = 'superette-settings-v1';

// --- Temps -----------------------------------------------------------------
export const DAY_START = 8 * 60; // 8:00 en minutes de jeu
export const DAY_END = 20 * 60; // 20:00
export const GAME_MIN_PER_SEC = 3.4; // 1 journée ≈ 3 min 30 s réelles en ×1

// --- Plan du magasin (9 colonnes × 15 lignes, vue de dessus) ----------------
export const COLS = 9;
export const ROWS = 15;
export const DOOR = { r: 14, c: 4 };
export const SPAWN = { r: 13, c: 4 };

// Emplacements de livraison (cartons posés au sol dans la réserve).
export const DELIVERY_SPOTS = [0, 1, 2, 3, 4, 5].map((c) => ({ r: 1, c }));
export const SPOT_STACK = 4; // cartons empilés par emplacement
export const COMPUTER = { tiles: [{ r: 1, c: 7 }, { r: 1, c: 8 }], access: { r: 2, c: 7 } };

// Emplacements d'étagères : 3 zones de 7 (la zone A est ouverte au départ).
export const ZONES = [
  { id: 'A', row: 3, label: 'Allée 1', cost: 0, level: 1 },
  { id: 'B', row: 6, label: 'Allée 2', cost: 900, level: 5 },
  { id: 'C', row: 9, label: 'Allée 3', cost: 3200, level: 10 }
];
export const SHELF_SLOTS = [];
for (const z of ZONES) for (let c = 1; c <= 7; c++) SHELF_SLOTS.push({ id: `${z.id}${c}`, zone: z.id, r: z.row, c });
export const SHELF_CAPACITY = 18;

// Caisses : comptoir (obstacle), place du caissier, place du client qui paie, file d'attente.
export const REGISTERS = [
  {
    id: 1,
    counter: [{ r: 11, c: 1 }, { r: 11, c: 2 }],
    staff: { r: 12, c: 1 },
    pay: { r: 10, c: 2 },
    queue: [{ r: 10, c: 1 }, { r: 10, c: 0 }, { r: 9, c: 0 }, { r: 8, c: 0 }, { r: 7, c: 0 }],
    exitVia: { r: 11, c: 3 },
    cost: 0,
    level: 1
  },
  {
    id: 2,
    counter: [{ r: 11, c: 6 }, { r: 11, c: 7 }],
    staff: { r: 12, c: 7 },
    pay: { r: 10, c: 6 },
    queue: [{ r: 10, c: 7 }, { r: 10, c: 8 }, { r: 9, c: 8 }, { r: 8, c: 8 }, { r: 7, c: 8 }],
    exitVia: { r: 11, c: 5 },
    cost: 1500,
    level: 8
  }
];

// --- Catalogue ---------------------------------------------------------------
// unitCost = cartonCost / qty ; market = prix de vente conseillé (marge ≈ ×2).
// shape : forme du dessin (bottle, box, bag, can, carton, jar, bar, tube, pack, wheel).
export const PRODUCTS = [
  { id: 'eau', name: 'Eau', brand: 'Source Claire', level: 1, licence: 0, qty: 12, cartonCost: 6.0, market: 1.0, color: '#4aa8e8', shape: 'bottle' },
  { id: 'pates', name: 'Pâtes', brand: 'Nonna', level: 1, licence: 0, qty: 12, cartonCost: 9.6, market: 1.6, color: '#f2b632', shape: 'box' },
  { id: 'chips', name: 'Chips', brand: 'Croc', level: 1, licence: 0, qty: 12, cartonCost: 12.0, market: 2.0, color: '#e8483d', shape: 'bag' },
  { id: 'soda', name: 'Soda', brand: 'Cola Boum', level: 2, licence: 80, qty: 12, cartonCost: 8.4, market: 1.5, color: '#c4262e', shape: 'can' },
  { id: 'biscuits', name: 'Biscuits', brand: 'Mamie', level: 2, licence: 120, qty: 12, cartonCost: 14.4, market: 2.4, color: '#b97a3b', shape: 'pack' },
  { id: 'lait', name: 'Lait', brand: 'Prairie', level: 3, licence: 200, qty: 12, cartonCost: 8.4, market: 1.4, color: '#e9eef5', shape: 'carton' },
  { id: 'cafe', name: 'Café', brand: 'Noir Intense', level: 4, licence: 350, qty: 6, cartonCost: 15.0, market: 5.0, color: '#5a3b28', shape: 'pack' },
  { id: 'cereales', name: 'Céréales', brand: 'Croustis', level: 5, licence: 500, qty: 8, cartonCost: 14.4, market: 3.6, color: '#f08a24', shape: 'box' },
  { id: 'savon', name: 'Savon', brand: 'Bulle', level: 6, licence: 700, qty: 12, cartonCost: 18.0, market: 3.0, color: '#9fd9c8', shape: 'bar' },
  { id: 'chocolat', name: 'Chocolat', brand: 'Choco Lune', level: 7, licence: 900, qty: 12, cartonCost: 14.4, market: 2.6, color: '#7a4a8c', shape: 'bar' },
  { id: 'riz', name: 'Riz', brand: 'Doré', level: 8, licence: 1200, qty: 12, cartonCost: 13.2, market: 2.2, color: '#e8d9a8', shape: 'bag' },
  { id: 'jus', name: 'Jus d’orange', brand: 'Soleil', level: 9, licence: 1500, qty: 12, cartonCost: 16.8, market: 2.8, color: '#ff9f1c', shape: 'carton' },
  { id: 'shampoing', name: 'Shampoing', brand: 'Nuage', level: 10, licence: 2000, qty: 6, cartonCost: 14.4, market: 4.8, color: '#6c8cff', shape: 'tube' },
  { id: 'fromage', name: 'Fromage', brand: 'Alpin', level: 12, licence: 2600, qty: 6, cartonCost: 18.0, market: 6.0, color: '#ffd23f', shape: 'wheel' },
  { id: 'confiture', name: 'Confiture', brand: 'Fraise des bois', level: 14, licence: 3200, qty: 8, cartonCost: 16.0, market: 4.0, color: '#d6336c', shape: 'jar' },
  { id: 'the', name: 'Thé', brand: 'Jardin', level: 16, licence: 4000, qty: 10, cartonCost: 18.0, market: 3.6, color: '#5fa05a', shape: 'box' },
  { id: 'dentifrice', name: 'Dentifrice', brand: 'Éclat', level: 18, licence: 5000, qty: 12, cartonCost: 15.6, market: 2.8, color: '#38b6c9', shape: 'tube' },
  { id: 'bonbons', name: 'Bonbons', brand: 'Pop', level: 20, licence: 6500, qty: 24, cartonCost: 14.4, market: 1.3, color: '#ff5fa2', shape: 'jar' }
];
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// --- Économie ----------------------------------------------------------------
export const START_COINS = 150;
export const START_SHELVES = ['A3', 'A4', 'A5'];
export const MAX_LEVEL = 25;

// Expérience nécessaire pour passer du niveau L au niveau L+1.
export function xpForLevel(level) {
  return Math.round(30 * Math.pow(level, 1.56));
}

export function shelfCost(owned) {
  // owned = nombre d'étagères déjà possédées (3 au départ)
  return Math.round(60 * Math.pow(1.16, Math.max(0, owned - 3)) / 5) * 5;
}

// Charges quotidiennes (loyer, électricité) : montent avec la taille du magasin.
export function dailyCharges(state) {
  const zones = state.zones.length;
  const regs = state.registers.length;
  return Math.round(12 + 1.5 * state.shelves.length + 25 * (zones - 1) + 20 * (regs - 1));
}

// Employés : loués pour 7 journées, payés d'avance en pièces. Chaque candidat a un niveau de 1 à 5.
export const STAFF = {
  cashier: { label: 'Caissier·ère', level: 2, desc: 'Tient une caisse toute la journée.' },
  stocker: { label: 'Magasinier·ère', level: 3, desc: 'Range les cartons de la réserve dans les rayons.' }
};
export const CONTRACT_DAYS = 7;
// Par niveau de candidat (index 0 = niveau 1).
export const CASHIER_LEVELS = [
  { secPerItem: 1.35, error: 0.10, weekCost: 140 },
  { secPerItem: 1.12, error: 0.06, weekCost: 200 },
  { secPerItem: 0.92, error: 0.03, weekCost: 280 },
  { secPerItem: 0.76, error: 0.01, weekCost: 380 },
  { secPerItem: 0.6, error: 0, weekCost: 520 }
];
export const STOCKER_LEVELS = [
  { speed: 1.8, perUnit: 0.36, weekCost: 120 },
  { speed: 2.1, perUnit: 0.3, weekCost: 170 },
  { speed: 2.45, perUnit: 0.24, weekCost: 235 },
  { speed: 2.8, perUnit: 0.19, weekCost: 320 },
  { speed: 3.2, perUnit: 0.15, weekCost: 430 }
];
export const FIRST_NAMES = ['Léa', 'Momo', 'Inès', 'Hugo', 'Sarah', 'Karim', 'Chloé', 'Lucas', 'Nadia', 'Tom', 'Jade', 'Yanis', 'Manon', 'Enzo', 'Lina', 'Bilal', 'Zoé', 'Théo', 'Amel', 'Noah'];
// Meilleur niveau de candidat proposé selon le niveau du magasin.
export function maxCandidateLevel(storeLevel) {
  return Math.min(5, 1 + Math.floor((storeLevel - 1) / 4));
}

// Effet d'un article vendu sur la réputation selon son prix (prix / prix conseillé).
export function priceReputation(ratio) {
  return Math.max(-0.2, Math.min(0.08, (1 - ratio) * 0.2));
}

// Probabilité qu'un client achète selon le prix (prix / prix conseillé).
export function buyChance(ratio) {
  if (ratio <= 1) return 1;
  return Math.max(0, 1 - (ratio - 1) * 2.4);
}

// Clients attendus sur la journée.
export function customersPerDay(state, stockedTypes) {
  return Math.round(7 + 1.7 * stockedTypes + state.reputation * 0.2 + Math.min(10, state.level * 0.6));
}

export const DELIVERY_SECONDS = 10; // délai de livraison (temps réel, ×vitesse)
export const PATIENCE_SECONDS = 55; // patience dans la file (temps réel en ×1)
export const BILLS = [50, 20, 10, 5];
export const CHANGE_MONEY = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
