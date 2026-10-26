// Données du jeu : catalogue, plan du magasin, économie.
// Tous les montants sont en pièces (avec centimes, multiples de 0,10 pour les prix de vente).

export const SAVE_KEY = 'superette-save-v1';
export const SETTINGS_KEY = 'superette-settings-v1';
// V1.5 : tutoriel. Sa partie d'essai a sa PROPRE clé : la partie normale (SAVE_KEY) n'est jamais touchée.
export const TUTO_SAVE_KEY = 'superette-tuto-save-v1';
export const TUTO_FLAG_KEY = 'superette-tuto-v1'; // { seen: proposé au 1er lancement ?, mode: 'normal' | 'tuto' }

// --- Temps -----------------------------------------------------------------
export const DAY_START = 8 * 60; // 8:00 en minutes de jeu
export const DAY_END = 20 * 60; // 20:00
export const GAME_MIN_PER_SEC = 3.4; // 1 journée ≈ 3 min 30 s réelles en ×1

// --- Plan du magasin (9 colonnes × 15 lignes, vue de dessus) ----------------
export const COLS = 9;
export const ROWS = 15;
export const DOOR = { r: 14, c: 4 };
export const SPAWN = { r: 13, c: 4 };

// Réserve (V1.4) : lignes 1 à 3, derrière les étagères. L'ordinateur est retiré (on commande avec le bouton
// « Commander ») : toute la largeur du mur du fond sert de palettes. Le joueur pose ses cartons sur la palette
// de son choix en touchant n'importe où dans la réserve ; on prend/pose un carton depuis la ligne 2 (allée).
export const RESERVE_ROWS = [1, 2, 3];
export const SHOP_TOP = 4; // première ligne du carrelage du magasin (la réserve est au-dessus)
// Toutes les cases de la réserve (3 lignes × 9) sont touchables : le joueur pose ses cartons où il veut,
// tant que chaque pile reste accessible et que personne n'est enfermé. Index = (r − 1) × 9 + c : les 6
// emplacements de la V1.3 (ligne 1, colonnes 0 à 5) gardent le même numéro (partie V1.3 intacte).
export const DELIVERY_SPOTS = [];
for (const r of RESERVE_ROWS) for (let c = 0; c < COLS; c++) DELIVERY_SPOTS.push({ r, c });
export const spotIndex = (r, c) => (RESERVE_ROWS.includes(r) && c >= 0 && c < COLS ? (r - 1) * COLS + c : -1);
// Palettes dessinées au sol (lignes 1 et 2, trois petites allées en colonnes 1, 4 et 7) : c'est là que le
// livreur pose les cartons, du fond vers l'avant. La ligne 3 reste un couloir derrière les étagères, pour
// que les cartons ne soient jamais cachés par les rayons.
export const PALLET_COLS = [0, 2, 3, 5, 6, 8];
export const AUTO_SPOTS = [1, 2].flatMap((r) => PALLET_COLS.map((c) => spotIndex(r, c)));
export const SPOT_STACK = 3; // cartons empilés au plus par case (V1.3 : 4) : piles basses = noms lisibles
// Capacité de la réserve : 30 cartons (V1.3 : 24 annoncés, mais seule la ligne du fond était utilisable).
// Mesure au robot (docs/CAHIER-DES-CHARGES.md, V1.4) : quelques cartons par jour au début, 12 à 16 dans un
// magasin plein. 30 places = 2 jours d'avance pour un grand magasin, sans transformer la réserve en entrepôt.
export const RESERVE_CAPACITY = 30;
export const STOCKER_HOME = { r: 3, c: 8 }; // où le magasinier attend quand il n'a rien à faire

// Emplacements d'étagères : 3 zones de 7 (la zone A est ouverte au départ).
// V1.4 : la première rangée descend d'une ligne (3 → 4) pour que les cartons restent visibles derrière.
export const ZONES = [
  { id: 'A', row: 4, label: 'Allée 1', cost: 0, level: 1 },
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
// short : nom court écrit sur les cartons et les frontons d'étagères (lisible sur téléphone).
// tag / tagName (V1.5) : code couleur du produit. Étiquette de cette couleur sur les cartons (plus de nom écrit
// dessus, il cachait les cartons) et même couleur sur le panneau de l'étagère, qui garde le nom. Couleurs bien
// distinctes ; l'icône du produit reste sur l'étiquette (daltonisme).
// shape : forme du dessin (bottle, box, bag, can, carton, jar, bar, tube, pack, wheel).
export const PRODUCTS = [
  { id: 'eau', name: 'Eau', short: 'Eau', brand: 'Source Claire', level: 1, licence: 0, qty: 12, cartonCost: 6.0, market: 1.0, color: '#4aa8e8', shape: 'bottle', tag: '#1e7fe0', tagName: 'bleue' },
  { id: 'pates', name: 'Pâtes', short: 'Pâtes', brand: 'Nonna', level: 1, licence: 0, qty: 12, cartonCost: 9.6, market: 1.6, color: '#f2b632', shape: 'box', tag: '#ff8c1a', tagName: 'orange' },
  { id: 'chips', name: 'Chips', short: 'Chips', brand: 'Croc', level: 1, licence: 0, qty: 12, cartonCost: 12.0, market: 2.0, color: '#e8483d', shape: 'bag', tag: '#e53935', tagName: 'rouge' },
  { id: 'soda', name: 'Soda', short: 'Soda', brand: 'Cola Boum', level: 2, licence: 80, qty: 12, cartonCost: 8.4, market: 1.5, color: '#c4262e', shape: 'can', tag: '#8e3fd1', tagName: 'violette' },
  { id: 'biscuits', name: 'Biscuits', short: 'Biscuits', brand: 'Mamie', level: 2, licence: 120, qty: 12, cartonCost: 14.4, market: 2.4, color: '#b97a3b', shape: 'pack', tag: '#7a4b2a', tagName: 'marron' },
  { id: 'lait', name: 'Lait', short: 'Lait', brand: 'Prairie', level: 3, licence: 200, qty: 12, cartonCost: 8.4, market: 1.4, color: '#e9eef5', shape: 'carton', tag: '#ffffff', tagName: 'blanche' },
  { id: 'cafe', name: 'Café', short: 'Café', brand: 'Noir Intense', level: 4, licence: 350, qty: 6, cartonCost: 15.0, market: 5.0, color: '#5a3b28', shape: 'pack', tag: '#1f1f1f', tagName: 'noire' },
  { id: 'cereales', name: 'Céréales', short: 'Céréales', brand: 'Croustis', level: 5, licence: 500, qty: 8, cartonCost: 14.4, market: 3.6, color: '#f08a24', shape: 'box', tag: '#ffd400', tagName: 'jaune' },
  { id: 'savon', name: 'Savon', short: 'Savon', brand: 'Bulle', level: 6, licence: 700, qty: 12, cartonCost: 18.0, market: 3.0, color: '#9fd9c8', shape: 'bar', tag: '#14b8a6', tagName: 'turquoise' },
  { id: 'chocolat', name: 'Chocolat', short: 'Choco', brand: 'Choco Lune', level: 7, licence: 900, qty: 12, cartonCost: 14.4, market: 2.6, color: '#7a4a8c', shape: 'bar', tag: '#ff4fa3', tagName: 'rose' },
  { id: 'riz', name: 'Riz', short: 'Riz', brand: 'Doré', level: 8, licence: 1200, qty: 12, cartonCost: 13.2, market: 2.2, color: '#e8d9a8', shape: 'bag', tag: '#9aa3ab', tagName: 'grise' },
  { id: 'jus', name: 'Jus d’orange', short: 'Jus', brand: 'Soleil', level: 9, licence: 1500, qty: 12, cartonCost: 16.8, market: 2.8, color: '#ff9f1c', shape: 'carton', tag: '#8bc34a', tagName: 'vert clair' },
  { id: 'shampoing', name: 'Shampoing', short: 'Shampo', brand: 'Nuage', level: 10, licence: 2000, qty: 6, cartonCost: 14.4, market: 4.8, color: '#6c8cff', shape: 'tube', tag: '#283593', tagName: 'bleu marine' },
  { id: 'fromage', name: 'Fromage', short: 'Fromage', brand: 'Alpin', level: 12, licence: 2600, qty: 6, cartonCost: 18.0, market: 6.0, color: '#ffd23f', shape: 'wheel', tag: '#e0cb98', tagName: 'beige' },
  { id: 'confiture', name: 'Confiture', short: 'Confit.', brand: 'Fraise des bois', level: 14, licence: 3200, qty: 8, cartonCost: 16.0, market: 4.0, color: '#d6336c', shape: 'jar', tag: '#8b1a3a', tagName: 'bordeaux' },
  { id: 'the', name: 'Thé', short: 'Thé', brand: 'Jardin', level: 16, licence: 4000, qty: 10, cartonCost: 18.0, market: 3.6, color: '#5fa05a', shape: 'box', tag: '#2e7d32', tagName: 'vert foncé' },
  { id: 'dentifrice', name: 'Dentifrice', short: 'Dentifr.', brand: 'Éclat', level: 18, licence: 5000, qty: 12, cartonCost: 15.6, market: 2.8, color: '#38b6c9', shape: 'tube', tag: '#7fd4ff', tagName: 'bleu ciel' },
  { id: 'bonbons', name: 'Bonbons', short: 'Bonbons', brand: 'Pop', level: 20, licence: 6500, qty: 24, cartonCost: 14.4, market: 1.3, color: '#ff5fa2', shape: 'jar', tag: '#c6a0ff', tagName: 'lilas' }
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
// Magasinier (V1.4) : TOUS les niveaux rangent chaque produit dans son propre rayon (jamais ailleurs).
// Les étoiles ne jouent que sur la vitesse et l'initiative :
//  think : temps de réflexion entre deux tâches (s) ; refill : il complète un rayon dès qu'il descend
//  sous cette part de sa capacité (un rayon vide est toujours prioritaire) ; dig : secondes pour sortir
//  un carton coincé sous un autre (par carton à soulever).
export const STOCKER_LEVELS = [
  { speed: 1.8, perUnit: 0.36, weekCost: 120, think: 1.6, refill: 0.4, dig: 0.9 },
  { speed: 2.1, perUnit: 0.3, weekCost: 170, think: 1.2, refill: 0.55, dig: 0.7 },
  { speed: 2.45, perUnit: 0.24, weekCost: 235, think: 0.9, refill: 0.7, dig: 0.55 },
  { speed: 2.8, perUnit: 0.19, weekCost: 320, think: 0.6, refill: 0.85, dig: 0.4 },
  { speed: 3.2, perUnit: 0.15, weekCost: 430, think: 0.35, refill: 0.95, dig: 0.3 }
];

// Apparence fixe d'un employé (V1.4) : tirée de son numéro « look », jamais au hasard à l'affichage.
const STAFF_SKINS = ['#f6d3b3', '#c98d63', '#e8b48f', '#9c6644', '#f1c7a5', '#6f4a33'];
const STAFF_HAIRS = ['#a8642e', '#2b1d14', '#e6c068', '#5a3a22', '#1f1f1f', '#c0462b'];
export const FIRST_NAMES = ['Léa', 'Momo', 'Inès', 'Hugo', 'Sarah', 'Karim', 'Chloé', 'Lucas', 'Nadia', 'Tom', 'Jade', 'Yanis', 'Manon', 'Enzo', 'Lina', 'Bilal', 'Zoé', 'Théo', 'Amel', 'Noah'];
// V1.6 : 10 prénoms de femmes, 10 d'hommes. L'apparence suit le prénom (une Léa n'a jamais l'allure d'un homme).
export const FEMALE_NAMES = ['Léa', 'Inès', 'Sarah', 'Chloé', 'Nadia', 'Jade', 'Manon', 'Lina', 'Zoé', 'Amel'];
export function genderOf(name) {
  return FEMALE_NAMES.includes(name) ? 'f' : 'h';
}
// Coiffures : 0 = courte (hommes) ; 1 = cheveux longs, 2 = chignon (femmes, avec un nœud de couleur).
export function staffLook(member) {
  const k = Math.abs(Math.floor(Number(member && member.look) || 0));
  const female = genderOf(member && member.name) === 'f';
  return Object.freeze({ skin: STAFF_SKINS[k % 6], hair: STAFF_HAIRS[(k + 1) % 6], hairStyle: female ? 1 + (k % 2) : 0, female });
}
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
// La popularité (0 à 100) agit fort : ×0,55 quand elle est au plus bas, ×1,45 au plus haut.
export function popularityFactor(reputation) {
  return 0.55 + (Math.max(0, Math.min(100, reputation)) / 100) * 0.9;
}
// « mult » : multiplicateur du jour (événement de quartier ; plus tard, les concurrents de la V1.3).
export function customersPerDay(state, stockedTypes, mult = 1, floor = 4) {
  return Math.max(floor, Math.round((13 + 1.9 * stockedTypes + Math.min(10, state.level * 0.6)) * popularityFactor(state.reputation) * mult));
}

// --- Événements de quartier (V1.2) ------------------------------------------
// Un jour sur deux environ, à partir du jour 3. Moyenne des effets proche de 1 : l'équilibre ne bouge pas.
//  clients : multiplicateur du nombre de clients ; extra : articles en plus par client ;
//  wanted : produits que presque tout le monde ajoute à sa liste ; tolerance : prix tolérés plus hauts.
export const EVENTS = [
  { id: 'marche', icon: '🧺', name: 'Jour de marché', desc: '+30 % de clients aujourd’hui', clients: 1.3 },
  { id: 'pluie', icon: '🌧️', name: 'Jour de pluie', desc: 'Moins de clients (−25 %), mais de plus gros paniers', clients: 0.75, extra: 1 },
  { id: 'match', icon: '⚽', name: 'Soir de match', desc: 'Chips et soda s’arrachent', clients: 1, wanted: ['chips', 'soda'] },
  { id: 'canicule', icon: '☀️', name: 'Canicule', desc: 'Tout le monde veut de l’eau et du jus', clients: 1, wanted: ['eau', 'jus'] },
  { id: 'paie', icon: '💶', name: 'Jour de paie', desc: 'Les clients regardent moins les prix', clients: 1, tolerance: 0.1 }
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// --- Objectifs du jour (V1.2) ------------------------------------------------
// 3 objectifs par jour, payés en pièces au bilan. Prime modeste : elle ne doit pas casser le rythme.
export const GOALS_PER_DAY = 3;
export const GOALS_FROM_DAY = 3; // après les premiers jours de découverte, comme les événements
export function goalReward(level) {
  return Math.round(1 + 0.4 * level);
}

export const DELIVERY_SECONDS = 10; // délai de livraison (temps réel, ×vitesse)
export const PATIENCE_SECONDS = 55; // patience dans la file (temps réel en ×1)

// --- Erreurs de caisse (V1.4, règle de Jack) ---------------------------------
// 1) l'erreur : écart entre ce que le client paie vraiment et ce qu'il devait ;
// 2) la détection : le client s'en rend-il compte ? ;
// 3) la réaction : effet sur la popularité.
//  - en faveur du client (il paie moins) : il est content, la popularité monte un peu (selon le montant) ;
//  - en faveur du magasin (il paie trop) : s'il le remarque, la popularité baisse ; sinon, rien.
export const CASH_ERRORS = {
  notice: { change: 0.8, card: 0.7, cashier: 0.7 }, // chance de remarquer une erreur en faveur du magasin
  gainPerCoin: 0.15, // popularité gagnée par pièce offerte par erreur
  gainMax: 0.5,
  lossPlayer: 2, // client qui remarque qu'on l'a fait payer trop (caisse tenue par toi)
  lossCashier: 1.5, // idem, erreur d'un caissier
  // V1.5 (bug de la bêta : 1 600 encaissés pour un ticket de 1,60). Seuils PROPORTIONNELS au ticket, fixés par le
  // chef de projet avec l'accord de Jack (écart = ce que le client paie en trop) :
  //  1) écart ≤ max(0,20 ; 5 % du ticket) : peut passer inaperçu, et plus l'écart est grand, plus il se voit ;
  //  2) au-dessus, jusqu'à min(10 ; max(2 ; 50 % du ticket)) : le client le remarque TOUJOURS, il paie quand même,
  //     la popularité baisse d'autant plus que l'écart est grand ;
  //  3) au-delà : il REFUSE. Vente annulée, articles reposés en rayon, client furieux, forte baisse.
  //  Exemples : ticket 1,60 → inaperçu ≤ 0,20, paie jusqu'à +2,00, refuse au-delà ;
  //             ticket 30   → inaperçu ≤ 1,50, paie jusqu'à +10,00, refuse au-delà.
  discreetMin: 20, // centimes
  discreetPct: 0.05,
  payMin: 200, // centimes
  payPct: 0.5,
  payMax: 1000, // centimes
  noticeFloor: 0.4, // dans la zone 1 : chance de remarquer = chance de base × (0,4 + 0,6 × écart / seuil)
  lossPerCoin: 0.6, // zone 2 : popularité perdue en plus par pièce au-delà du seuil « inaperçu »
  refuseLoss: 8, // zone 3 : client qui refuse
  refuseLossPerCoin: 0.4, // … plus 0,4 par pièce au-delà du seuil de refus
  refuseLossMax: 25,
  // Bouche-à-oreille : chaque pièce prise en trop et remarquée (au-delà du seuil « inaperçu ») fait fuir des
  // clients les jours suivants : clients du jour × (1 − méfiance / distrustScale), méfiance divisée par 2 chaque
  // nuit. Calibré au robot (tests/v15.test.mjs) : surfacturer fait toujours finir plus pauvre que rester honnête.
  distrustScale: 25,
  distrustDecay: 0.5,
  distrustFloor: 0.15
};
// Seuils d'une erreur de caisse en faveur du magasin pour un ticket « due » (centimes) : { discreet, refuse }.
export function cashThresholds(due) {
  const refuse = Math.min(CASH_ERRORS.payMax, Math.max(CASH_ERRORS.payMin, Math.round(due * CASH_ERRORS.payPct)));
  const discreet = Math.min(refuse, Math.max(CASH_ERRORS.discreetMin, Math.round(due * CASH_ERRORS.discreetPct)));
  return { discreet, refuse };
}
// Saisie du montant au terminal de carte : 3 chiffres avant la virgule au plus (999,99), 2 après.
export const CARD_MAX_INT_DIGITS = 3;
export const BILLS = [50, 20, 10, 5];
export const CHANGE_MONEY = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1];
