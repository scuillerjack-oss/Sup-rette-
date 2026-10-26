// V1.5 : tutoriel facultatif et rejouable. Aucun DOM ici (testable sous Node).
//
// Principe :
//  - le tutoriel se joue dans une PARTIE D'ESSAI séparée, rangée sous sa propre clé (TUTO_SAVE_KEY) ;
//  - la partie normale (SAVE_KEY = « superette-save-v1 ») n'est ni lue ni écrite pendant le tutoriel ;
//  - on peut le quitter à tout moment (retour à sa partie), le reprendre ou le recommencer depuis le menu ☰ ;
//  - le scénario est fixe (rayons Eau et Pâtes prêts, premiers clients connus) pour que chaque étape soit
//    faisable ; les RÈGLES sont celles du vrai jeu, les textes les décrivent sans en inventer.
import {
  SAVE_KEY, TUTO_SAVE_KEY, TUTO_FLAG_KEY, PRODUCT_BY_ID, SHELF_SLOTS, REGISTERS, DELIVERY_SPOTS, AUTO_SPOTS,
  RESERVE_CAPACITY, SPOT_STACK, SHELF_CAPACITY, CONTRACT_DAYS, STAFF, GOALS_FROM_DAY
} from './data.js';
import { newState, serialize, deserialize, cents, minPriceOf, unlocksAt } from './game.js';

// ---------------------------------------------------------------- partie d'essai
export const TUTO_COINS = 400; // un peu plus que les 150 du vrai départ : de quoi embaucher ET acheter une étagère
export function tutorialState() {
  const s = newState();
  s.tutoMode = true;
  s.tuto = { step: 0 };
  s.tutorial = 99; // anciennes petites bulles d'aide (V1.0) coupées : le tutoriel les remplace
  s.coins = cents(TUTO_COINS);
  // Niveau 2 presque fini : le niveau 3 arrive en servant les premiers clients (et débloque le magasinier).
  s.level = 2;
  s.xp = 70;
  // Rayons Eau et Pâtes déjà attribués (vides), une étagère libre.
  s.shelves = [{ slot: 'A3', product: 'eau', qty: 0 }, { slot: 'A4', product: 'pates', qty: 0 }, { slot: 'A5', product: null, qty: 0 }];
  return s;
}

// ---------------------------------------------------------------- session : quelle partie charger ?
export function readFlag(storage) {
  try {
    const f = JSON.parse(storage.getItem(TUTO_FLAG_KEY) || '{}');
    return { seen: !!f.seen, mode: f.mode === 'tuto' ? 'tuto' : 'normal' };
  } catch (e) {
    return { seen: false, mode: 'normal' };
  }
}
export function writeFlag(storage, flag) {
  try { storage.setItem(TUTO_FLAG_KEY, JSON.stringify({ seen: !!flag.seen, mode: flag.mode === 'tuto' ? 'tuto' : 'normal' })); } catch (e) { /* ignoré */ }
}
function ttLoad(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? deserialize(raw) : null;
  } catch (e) {
    return null;
  }
}
// Étape où reprendre le tutoriel (ou null s'il n'y a pas de tutoriel en cours).
export function savedTutoStep(storage) {
  const s = ttLoad(storage, TUTO_SAVE_KEY);
  return s && s.tutoMode && s.tuto ? s.tuto.step : null;
}

// Au lancement : mode, clé de sauvegarde à utiliser, partie à charger, faut-il proposer le tutoriel ?
export function sessionPlan(storage) {
  const flag = readFlag(storage);
  if (flag.mode === 'tuto') {
    const st = ttLoad(storage, TUTO_SAVE_KEY);
    return { mode: 'tuto', key: TUTO_SAVE_KEY, state: st && st.tutoMode ? st : tutorialState(), fresh: tutorialState, offer: false };
  }
  const st = ttLoad(storage, SAVE_KEY);
  // Proposé une seule fois, au tout premier lancement (pas de partie). Un joueur qui a déjà une partie le
  // trouve dans le menu ☰ (petit message la première fois).
  // (relecture : une partie neuve jamais jouée, écrite pendant que la proposition était affichée, ne compte pas)
  const played = !!st && (st.day > 1 || st.totals.served > 0 || st.phase !== 'prep' || st.pending.length > 0);
  return { mode: 'normal', key: SAVE_KEY, state: st, fresh: newState, offer: !flag.seen && !played, announce: !flag.seen && played };
}

// Lancer le tutoriel. saver = celui de la partie EN COURS (normale) : sa dernière sauvegarde est faite, puis il est
// verrouillé. fresh = recommencer au début (sinon on reprend le tutoriel là où on l'avait laissé).
export function startTutorial(storage, saver, { fresh = true } = {}) {
  if (saver) {
    saver.save();
    saver.lock();
  }
  if (fresh || savedTutoStep(storage) == null) {
    try { storage.setItem(TUTO_SAVE_KEY, serialize(tutorialState())); } catch (e) { /* ignoré */ }
  }
  writeFlag(storage, { seen: true, mode: 'tuto' });
}

// Quitter le tutoriel (saver = celui de la partie d'essai). finished : terminé, la partie d'essai est effacée ;
// sinon elle est gardée pour « Reprendre ». La partie normale n'est jamais touchée.
export function leaveTutorial(storage, saver, { finished = false } = {}) {
  if (saver) {
    if (!finished) saver.save();
    saver.lock();
  }
  if (finished) {
    try { storage.removeItem(TUTO_SAVE_KEY); } catch (e) { /* ignoré */ }
  }
  backToNormal(storage);
}

// Retour à la partie normale, vérifié : si le drapeau ne peut pas être écrit (stockage plein), on l'efface
// (sans drapeau, c'est la partie normale qui se charge). Jamais coincé dans le tutoriel.
export function backToNormal(storage) {
  writeFlag(storage, { seen: true, mode: 'normal' });
  if (readFlag(storage).mode !== 'normal') {
    try { storage.removeItem(TUTO_FLAG_KEY); } catch (e) { /* ignoré */ }
  }
}

export function skipTutorial(storage) {
  writeFlag(storage, { seen: true, mode: 'normal' });
}

// ---------------------------------------------------------------- étapes
const ttTag = (id) => {
  const p = PRODUCT_BY_ID[id];
  return `<span class="tt-tag" style="--c:${p.tag}">${p.short}</span>`;
};
const ttCoins = (c) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`;
const ttShelfOf = (g, id) => g.state.shelves.find((x) => x.product === id);
const ttSlotTile = (sh) => {
  const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
  return { r: sl.r, c: sl.c };
};
const ttStockOf = (g, id) => g.state.pending.some((d) => d.product === id) || g.state.delivery.some((st) => st.some((c) => c.product === id)) || (g.player.carry && g.player.carry.product === id) || g.state.shelves.some((x) => x.product === id && x.qty > 0);
const ttStackTiles = (g, pred = () => true) => g.state.delivery.map((st, i) => (st.length && pred(st[st.length - 1]) ? { r: DELIVERY_SPOTS[i].r, c: DELIVERY_SPOTS[i].c } : null)).filter(Boolean);
const ttFilled = (g, id) => g.state.shelves.some((x) => x.product === id && x.qty > 0);
const ttReg1 = REGISTERS[0];
// Journée finie avant d'avoir servi à la caisse (joueur resté ailleurs) : on passe au bilan, rien ne bloque.
const ttDayOver = (g) => g.state.phase === 'summary' || g.state.day > 1;
function ttTopUp(g) {
  for (const id of ['eau', 'pates']) if (!ttStockOf(g, id)) g.state.pending.push({ product: id, eta: 1.5 });
}
// Plancher de pièces pour les étapes qui achètent (relecture) : le joueur a pu tout dépenser avant.
function ttCoinsAtLeast(g, c) {
  if (g.state.coins < c) {
    g.state.coins = c;
    return true;
  }
  return false;
}
const ttSheetIs = (ui, kind) => ui.sheet && ui.sheet.kind === kind;

// Une étape : { id, day, title, text(g), target(g, ui) → { dom: [sélecteurs], tiles: [{ r, c }] },
//   done(g, mem) → vrai quand l'objectif est atteint, enter(g, mem) (préparation du scénario),
//   button : texte du bouton (étape d'explication), ready(g) : le bouton est-il actif ? }
export const STEPS = [
  {
    id: 'intro',
    title: 'Bienvenue dans le tutoriel !',
    text: () => `En 2 journées, tu vas apprendre tout le jeu en jouant. C'est une <b>partie d'essai</b> : ta vraie partie est gardée de côté. Pour l'essai, ta supérette démarre avec ${TUTO_COINS} pièces. Tu peux quitter quand tu veux.`,
    button: 'C’est parti',
    target: () => ({})
  },
  {
    id: 'order',
    title: 'Commander du stock',
    text: (g) => `Touche <b>🛒 Commander</b>, ajoute <b>1 carton d'Eau</b> et <b>1 carton de Pâtes</b> avec <b>+</b>, puis touche « Commander ». Chaque carton se paie en pièces.`,
    done: (g) => ttStockOf(g, 'eau') && ttStockOf(g, 'pates'),
    target: (g, ui) => {
      if (!ttSheetIs(ui, 'order')) return { dom: ui.sheet ? ['[data-a="close"]'] : ['#btnOrder'] };
      const dom = [];
      for (const id of ['eau', 'pates']) if (!(ui.cart[id] > 0) && !ttStockOf(g, id)) dom.push(`[data-a="plus"][data-id="${id}"]`);
      if (!dom.length || Object.values(ui.cart).some((n) => n > 0)) dom.push('[data-a="order"]');
      return { dom };
    }
  },
  {
    id: 'colors',
    title: 'Le code couleur des cartons',
    text: () => `La livraison arrive dans la <b>réserve</b>, en haut (${RESERVE_CAPACITY} cartons au plus). Chaque produit a sa <b>couleur</b> : ${ttTag('eau')} = Eau, ${ttTag('pates')} = Pâtes. Le panneau de l'étagère a la même couleur, avec le nom écrit dessus.`,
    button: 'Compris',
    // (relecture : si le joueur a déjà rangé les cartons en rayon, le bouton doit rester utilisable)
    ready: (g) => !g.state.pending.length && (g.deliveryCount() > 0 || !!g.player.carry || ttFilled(g, 'eau') || ttFilled(g, 'pates')),
    waiting: 'Livraison en route…',
    target: (g) => ({ tiles: ttStackTiles(g) })
  },
  {
    id: 'reserve',
    title: 'Ranger la réserve',
    text: () => `Tu ranges la réserve comme tu veux. Touche un carton pour le <b>prendre</b>, puis touche une <b>case libre</b> de la réserve pour le <b>reposer</b>. ${SPOT_STACK} cartons par pile au plus, et il faut toujours laisser un passage.`,
    enter: (g, mem) => { mem.drops = g.drops; },
    // Relecture : validée aussi si plus rien n'est à reposer (cartons déjà rangés en rayon avant cette étape).
    done: (g, mem) => g.drops > (mem.drops ?? g.drops) || (!g.deliveryCount() && !g.player.carry && !g.state.pending.length),
    target: (g) => {
      if (!g.player.carry) return { tiles: ttStackTiles(g) };
      const order = [...AUTO_SPOTS, ...DELIVERY_SPOTS.keys()];
      const i = order.find((k) => !g.state.delivery[k].length && g.canPlaceAt(k, { ignore: g.player }).ok);
      return { tiles: i != null ? [{ r: DELIVERY_SPOTS[i].r, c: DELIVERY_SPOTS[i].c }] : [] };
    }
  },
  {
    id: 'shelf',
    title: 'Mettre en rayon',
    text: () => `Prends un carton et touche l'étagère <b>de sa couleur</b> : ${ttTag('eau')} va dans le rayon « Eau », ${ttTag('pates')} dans le rayon « Pâtes ». Lis le nom sur le panneau. Range les <b>deux</b> cartons. Un rayon contient ${SHELF_CAPACITY} articles.`,
    done: (g) => ttFilled(g, 'eau') && ttFilled(g, 'pates'),
    // Scénario : s'il manque le carton d'un des deux produits (vendu, jamais commandé…), le fournisseur le livre.
    enter: (g) => ttTopUp(g),
    tick: (g) => ttTopUp(g),
    target: (g) => {
      const carry = g.player.carry;
      if (carry) {
        const sh = ttShelfOf(g, carry.product) || g.state.shelves.find((x) => !x.product || x.qty === 0);
        return { tiles: sh ? [ttSlotTile(sh)] : [] };
      }
      return { tiles: ttStackTiles(g, (c) => (c.product === 'eau' || c.product === 'pates') && !ttFilled(g, c.product)) };
    }
  },
  {
    id: 'price',
    title: 'Fixer un prix',
    text: (g) => `Touche <b>🏷️ Prix</b> et baisse le prix de l'Eau d'un cran avec <b>−</b>. Impossible de vendre sous le <b>prix d'achat</b> (ici ${ttCoins(minPriceOf(PRODUCT_BY_ID.eau))} pour l'Eau). Moins cher que le prix conseillé : la popularité monte. Plus cher : des clients n'achètent pas et la popularité baisse.`,
    enter: (g, mem) => { mem.price = g.state.prices.eau; },
    done: (g, mem) => g.state.prices.eau !== (mem.price ?? g.state.prices.eau),
    target: (g, ui) => {
      if (!ttSheetIs(ui, 'prices')) return { dom: ui.sheet ? ['[data-a="close"]'] : ['#btnPrices'] };
      return { dom: ['[data-a="pminus"][data-id="eau"]'] };
    }
  },
  {
    id: 'open',
    title: 'Ouvrir le magasin',
    text: () => 'Tout est prêt ? Ferme le panneau et touche <b>« Ouvrir le magasin »</b>. La journée commence à 8:00 et ferme à 20:00.',
    done: (g) => g.state.phase !== 'prep',
    enter: (g) => {
      // Scénario fixe : les 3 premiers clients. Le 3e veut aussi des Chips (pas en rayon) : une demande non satisfaite.
      g.scriptLists = [[{ product: 'eau', want: 1 }, { product: 'pates', want: 1 }], [{ product: 'eau', want: 2 }], [{ product: 'chips', want: 1 }, { product: 'pates', want: 1 }]];
      g.nextPayment = 'cash';
    },
    target: (g, ui) => ({ dom: ui.sheet ? ['[data-a="close"]'] : ['#openBtn'] })
  },
  {
    id: 'register',
    title: 'Aller à la caisse',
    text: () => 'Un client arrive. Touche la <b>caisse</b> (le comptoir en bas à gauche) pour t\'y installer. Si personne n\'est à la caisse, les clients attendent et finissent par partir fâchés.',
    enter: (g) => {
      if (!g.scriptLists.length && g.state.stats.served === 0) g.scriptLists = [[{ product: 'eau', want: 1 }, { product: 'pates', want: 1 }], [{ product: 'eau', want: 2 }], [{ product: 'chips', want: 1 }, { product: 'pates', want: 1 }]];
      if (g.state.stats.served === 0 && g.nextPayment == null) g.nextPayment = 'cash';
    },
    done: (g) => !!g.checkout || (g.player.atRegister != null && !g.player.path.length) || ttDayOver(g),
    target: () => ({ tiles: [ttReg1.staff, ...ttReg1.counter] })
  },
  {
    id: 'scan',
    title: 'Scanner les articles',
    text: () => 'Quand le client est devant toi, touche <b>chaque article</b> sur le tapis pour le scanner.',
    done: (g) => g.state.stats.served > 0 || (g.checkout && g.checkout.step !== 'scan') || ttDayOver(g),
    target: (g) => ({ dom: g.checkout ? ['#checkout .belt .item:not(.done)'] : [], tiles: g.checkout ? [] : [ttReg1.staff] })
  },
  {
    id: 'cash',
    title: 'Rendre la monnaie',
    text: () => `Le client paie en espèces. Rends <b>la monnaie exacte</b> avec les pièces et billets, puis <b>Valider</b>. Rendre trop : le client est content (un peu de popularité) mais tu perds ces pièces. Pas assez : il le remarque souvent et la popularité baisse.`,
    done: (g) => g.state.stats.served + g.state.stats.angry >= 1 || ttDayOver(g),
    target: (g) => ({ dom: g.checkout && g.checkout.step === 'cash' ? ['#checkout .cash-top', '#checkout [data-a="cash"]'] : g.checkout ? ['#checkout .co-actions .primary, #checkout [data-a="exact"]'] : [] })
  },
  {
    id: 'card',
    title: 'Paiement par carte',
    text: () => 'Client suivant : il paie par <b>carte</b>. Tape le montant <b>avec la virgule</b> (par exemple 2,00) puis <b>OK</b>. Attention : un tout petit écart en ta faveur peut passer inaperçu ; plus gros, le client le voit et la popularité baisse ; énorme (plus de la moitié du ticket, ou plus de 10 pièces), il <b>refuse de payer</b> et part furieux.',
    enter: (g, mem) => { g.nextPayment = 'card'; mem.served = g.state.stats.served + g.state.stats.angry; },
    done: (g, mem) => g.state.stats.served + g.state.stats.angry > (mem.served ?? 1) || ttDayOver(g),
    target: (g) => ({ dom: g.checkout && g.checkout.step === 'card' ? ['#checkout .terminal', '#checkout .keypad'] : g.checkout && g.checkout.step === 'scan' ? ['#checkout .belt .item:not(.done)'] : [], tiles: g.checkout || g.player.atRegister != null ? [] : [ttReg1.staff] })
  },
  {
    id: 'day1',
    title: 'Finir la journée',
    text: () => 'Bravo ! Continue de servir les clients jusqu\'à 20:00. Le bouton <b>×1</b> en haut accélère le temps (×2, ×3). Un client voudra des Chips, que tu n\'as pas en rayon : regarde ce qui se passe au bilan.',
    done: (g) => g.state.phase === 'summary' || g.state.day > 1,
    target: () => ({ dom: ['#btnSpeed'] })
  },
  {
    id: 'summary',
    title: 'Le bilan de la journée',
    text: () => 'Chaque soir : <b>Ventes</b>, <b>Achats</b> de marchandise, <b>Loyer et charges</b> (ils montent avec la taille du magasin) et le <b>Résultat</b>. Touche « ❓ demandes non satisfaites » pour comprendre : un client voulait un produit absent ou vide. Puis « Préparer le jour 2 ».',
    done: (g) => g.state.day >= 2 && g.state.phase !== 'summary',
    target: () => ({ dom: ['#modalCard .sum', '#modalCard .chipbtn', '#modalCard [data-a="next"]'] })
  },
  {
    id: 'hire',
    title: 'Embaucher',
    text: () => `Touche <b>👥 Personnel</b> et embauche quelqu'un. <b>Caissier</b> (niveau ${STAFF.cashier.level}) : tient une caisse. <b>Magasinier</b> (niveau ${STAFF.stocker.level}) : range les cartons dans le rayon de leur produit. Plus d'<b>étoiles</b> : plus rapide, moins d'erreurs, plus cher. Contrat de <b>${CONTRACT_DAYS} journées</b> payé d'avance, à prolonger dans Personnel.`,
    done: (g) => g.state.staff.cashiers.length > 0 || !!g.state.staff.stocker,
    enter: (g, mem) => { mem.gift = ttCoinsAtLeast(g, g.staffCost('stocker', 1) + cents(10)); },
    target: (g, ui) => {
      if (!ttSheetIs(ui, 'staff')) return { dom: ui.sheet ? ['[data-a="close"]'] : ['#btnStaff'] };
      return { dom: ['[data-a="hire"]:not([disabled])'] };
    }
  },
  {
    id: 'build',
    title: 'Aménager : acheter une étagère',
    text: (g) => `Touche <b>🛠️ Aménager</b> puis « Placer » pour acheter une étagère (${ttCoins(g.nextShelfCost())} pièces). Chaque étagère de plus coûte un peu plus cher et ajoute un peu de charges chaque jour.`,
    enter: (g, mem) => { mem.shelves = g.state.shelves.length; mem.gift = ttCoinsAtLeast(g, g.nextShelfCost() + cents(10)); },
    done: (g, mem) => g.state.shelves.length > (mem.shelves ?? 3),
    target: (g, ui) => {
      if (ttSheetIs(ui, 'build')) return { dom: ['[data-a="shelf"]'] };
      if (ttSheetIs(ui, 'buyShelf')) return { dom: ['[data-a="shelf"]'] };
      return { dom: ui.sheet ? ['[data-a="close"]'] : ['#btnBuild'] };
    }
  },
  {
    id: 'move',
    title: 'Aménager : déplacer une étagère',
    text: () => 'Déplacer une étagère est <b>gratuit</b> et le produit la suit. Touche <b>🛠️ Aménager</b> → « Déplacer », touche une étagère, puis un <b>« + »</b> libre.',
    enter: (g, mem) => { mem.moves = g.moves; },
    done: (g, mem) => g.moves > (mem.moves ?? g.moves),
    target: (g, ui) => {
      if (g.moving) {
        if (!g.moving.from) return { tiles: g.state.shelves.map(ttSlotTile) };
        return { tiles: g.freeSlots().slice(0, 3).map((sl) => ({ r: sl.r, c: sl.c })) };
      }
      if (ttSheetIs(ui, 'build')) return { dom: ['[data-a="move"]'] };
      return { dom: ui.sheet ? ['[data-a="close"]'] : ['#btnBuild'] };
    }
  },
  {
    id: 'levels',
    title: 'Niveaux et déblocages',
    text: (g) => {
      const next = [];
      for (let l = g.state.level + 1; l <= 10 && next.length < 4; l++) { const u = unlocksAt(l); if (u.length) next.push(`niv. ${l} : ${u.join(', ')}`); }
      return `Chaque client servi donne de l'expérience (la barre sous <b>NIV.</b>). Chaque niveau débloque quelque chose : ${next.join(' · ')}… Les licences s'achètent dans 🛒 Commander, les allées dans 🛠️ Aménager.`;
    },
    button: 'Compris',
    target: () => ({ dom: ['.hud .lvl'] })
  },
  {
    id: 'day2',
    title: 'Journée 2 : à toi de jouer',
    text: () => `Commande du stock si besoin, ouvre le magasin et joue la journée avec ton équipe. Dès le jour ${GOALS_FROM_DAY}, tu auras aussi des objectifs du jour et des événements de quartier.`,
    done: (g) => g.state.phase === 'summary' && g.state.day >= 2,
    target: (g, ui) => ({ dom: g.state.phase === 'prep' && !ui.sheet ? ['#openBtn'] : [] })
  },
  {
    id: 'end',
    title: 'Tutoriel terminé, bravo ! 🎉',
    text: () => 'Tu connais tout le jeu. La partie d\'essai va être effacée et tu retrouves ta vraie partie. Tu peux rejouer ce tutoriel quand tu veux depuis le menu ☰.',
    button: 'Retour à ma partie',
    final: true,
    target: () => ({})
  }
];
export const STEP_BY_ID = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));

// ---------------------------------------------------------------- avancement
// Contrôleur sans DOM : appelé à chaque image par l'interface. Renvoie l'étape courante.
export class Tutorial {
  constructor(game) {
    this.g = game;
    this.mem = {};
    const s = game.state;
    if (!s.tuto || typeof s.tuto.step !== 'number') s.tuto = { step: 0 };
    s.tuto.step = Math.max(0, Math.min(STEPS.length - 1, s.tuto.step));
    this.entered = -1;
  }
  get index() { return this.g.state.tuto.step; }
  get step() { return STEPS[this.index]; }
  get finished() { return !!this.step.final; }

  // Prépare l'étape une seule fois, puis passe à la suivante dès que son objectif est atteint.
  // Renvoie true si l'étape vient de changer.
  update() {
    let changed = false;
    for (let guard = 0; guard < STEPS.length; guard++) {
      const st = this.step;
      if (this.entered !== this.index) {
        this.entered = this.index;
        this.mem = {};
        if (st.enter) st.enter(this.g, this.mem);
      }
      if (st.tick) {
        this.tickClock = (this.tickClock || 0) + 1;
        if (this.tickClock % 30 === 0) st.tick(this.g, this.mem);
      }
      if (st.button || !st.done || !st.done(this.g, this.mem)) break;
      this.next();
      changed = true;
    }
    return changed;
  }

  ready() {
    const st = this.step;
    return !st.ready || st.ready(this.g);
  }

  // Bouton « Compris » d'une étape d'explication.
  confirm() {
    if (!this.step.button || !this.ready() || this.finished) return false;
    this.next();
    return true;
  }

  next() {
    if (this.index < STEPS.length - 1) this.g.state.tuto.step++;
  }
}
