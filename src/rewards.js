// V1.6 : coffres, bilan doublé, décorations et rythme des pubs. Aucun DOM ici (testable sous Node).
// Référence : docs/MODELE-ECONOMIQUE.md, sections 0 et 2 (validées par Jack).
//  - Jamais de pub quand le joueur dit non ; jamais pendant qu'on joue ; jamais dans le tutoriel.
//  - Une seule monnaie : les pièces, gagnées en jouant. Les chances des coffres sont toujours affichées.
//  - TOUTES les pubs sont simulées (src/ads.js) : aucune vraie pub, aucun réseau.
import { STAFF } from './data.js';

// ---------------------------------------------------------------- réglages
export const REWARD_FROM_DAY = 3; // coffres et pubs à partir du jour 3 (après les premières journées)
export const REWARD_KINDS = ['cashier', 'stocker', 'deco', 'double'];
export const FORCED_EVERY_DAYS = 3; // pub imposée : une toutes les 3 journées de jeu, au bilan seulement
export const AD_GAP_MS = 4 * 60 * 1000; // jamais deux pubs (tous types) à moins de 4 minutes réelles

// Chances des coffres d'employés (affichées dans le coffre), en % pour 1★ … 5★.
export const CHEST_ODDS = [35, 28, 20, 12, 5];
// Garantie anti-malchance : après 5 coffres d'employé sans 4★ ou plus, le suivant donne 4★ ou 5★.
export const PITY_AFTER = 5;

// Tirage d'un nombre d'étoiles. pity = coffres d'employé ouverts d'affilée sans 4★+ (sauvegardé).
export function rollStars(pity, rng = Math.random) {
  const guaranteed = (pity || 0) >= PITY_AFTER;
  const odds = guaranteed ? CHEST_ODDS.map((p, i) => (i >= 3 ? p : 0)) : CHEST_ODDS;
  const total = odds.reduce((a, b) => a + b, 0);
  let x = rng() * total;
  let stars = 1;
  for (let i = 0; i < odds.length; i++) {
    if (x < odds[i]) { stars = i + 1; break; }
    x -= odds[i];
    stars = i + 1;
  }
  if (guaranteed && stars < 4) stars = 4; // sécurité (arrondis)
  return { stars, guaranteed, pity: stars >= 4 ? 0 : (pity || 0) + 1 };
}

// Générateur pseudo-aléatoire avec graine (tests et simulation reproductibles).
export function seededRng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- décorations (aucun effet sur le jeu)
export const DECO_SLOTS = {
  affiche: { label: 'Affiche', icon: '🖼️' },
  sol: { label: 'Sol', icon: '🟫' },
  plante: { label: 'Plante', icon: '🪴' },
  enseigne: { label: 'Enseigne', icon: '🪧' }
};
export const DECOS = [
  { id: 'aff-fruits', slot: 'affiche', name: 'Affiche « Fruits frais »', colors: ['#3ccf8e', '#ffffff', '#1d6b45'], text: 'FRAIS' },
  { id: 'aff-soleil', slot: 'affiche', name: 'Affiche « Soleil »', colors: ['#ffb347', '#fff3c4', '#a3400f'], text: 'ÉTÉ' },
  { id: 'aff-merci', slot: 'affiche', name: 'Affiche « Merci ! »', colors: ['#8e6cdf', '#ffffff', '#3d2a75'], text: 'MERCI' },
  { id: 'sol-damier', slot: 'sol', name: 'Sol damier bleu', colors: ['#dbe7f3', '#bcd0e6'] },
  { id: 'sol-terre', slot: 'sol', name: 'Sol terre cuite', colors: ['#f0cfb2', '#e2b48f'] },
  { id: 'sol-menthe', slot: 'sol', name: 'Sol menthe', colors: ['#dcf1e6', '#c2e3d1'] },
  { id: 'pla-cactus', slot: 'plante', name: 'Cactus en pot bleu', colors: ['#3a7bd5', '#4f9d5a'], shape: 'cactus' },
  { id: 'pla-fleurs', slot: 'plante', name: 'Pot de fleurs roses', colors: ['#f2f2f2', '#ff6fa8'], shape: 'fleurs' },
  { id: 'pla-palmier', slot: 'plante', name: 'Grand palmier', colors: ['#7a4b2a', '#2f8a46'], shape: 'palmier' },
  { id: 'ens-nuit', slot: 'enseigne', name: 'Enseigne bleu nuit', colors: ['#283593', '#5c6bc0', '#ffffff'] },
  { id: 'ens-cerise', slot: 'enseigne', name: 'Enseigne cerise', colors: ['#b0103a', '#e8483d', '#fff3c4'] }
];
export const DECO_BY_ID = Object.fromEntries(DECOS.map((d) => [d.id, d]));

export function rollDeco(owned = [], rng = Math.random) {
  const left = DECOS.filter((d) => !owned.includes(d.id));
  if (!left.length) return null;
  return left[Math.floor(rng() * left.length)];
}

// ---------------------------------------------------------------- état sauvegardé
export function emptyRewards() {
  // used[kind] = jour de jeu où la récompense a été prise ; adAnchor = jour de la dernière pub (tous types) ;
  // lastAdAt = heure réelle (ms) de la dernière pub ; forcedDay = jour du dernier bilan où une pub imposée est passée.
  return { used: {}, pity: 0, adAnchor: 0, lastAdAt: 0, forcedDay: 0 };
}
export function emptyDeco() {
  return { owned: [], placed: { affiche: null, sol: null, plante: null, enseigne: null } };
}
// Données abîmées ou partie V1.5 : on répare sans rien perdre.
export function cleanRewards(r) {
  const base = emptyRewards();
  if (!r || typeof r !== 'object') return base;
  const used = {};
  for (const k of REWARD_KINDS) if (Number.isFinite(r.used?.[k])) used[k] = r.used[k];
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  return { used, pity: Math.min(PITY_AFTER, Math.floor(num(r.pity))), adAnchor: num(r.adAnchor), lastAdAt: num(r.lastAdAt), forcedDay: num(r.forcedDay) };
}
export function cleanDeco(d) {
  const base = emptyDeco();
  if (!d || typeof d !== 'object') return base;
  const owned = [...new Set((Array.isArray(d.owned) ? d.owned : []).filter((id) => DECO_BY_ID[id]))];
  for (const slot of Object.keys(base.placed)) {
    const id = d.placed && d.placed[slot];
    base.placed[slot] = id && owned.includes(id) && DECO_BY_ID[id].slot === slot ? id : null;
  }
  return { owned, placed: base.placed };
}

// ---------------------------------------------------------------- disponibilité
// Peut-on proposer cette récompense ? { ok, reason }. Le joueur choisit toujours : rien n'est imposé ici.
export function rewardStatus(state, kind, { summary = null } = {}) {
  if (!REWARD_KINDS.includes(kind)) return { ok: false, reason: 'Inconnu' };
  if (state.tutoMode) return { ok: false, reason: 'Pas dans le tutoriel' };
  if (state.day < REWARD_FROM_DAY) return { ok: false, reason: `À partir du jour ${REWARD_FROM_DAY}` };
  const r = state.rewards || emptyRewards();
  if (r.used[kind] === state.day) return { ok: false, reason: 'Déjà pris aujourd’hui · revient demain', used: true };
  if (kind === 'cashier' || kind === 'stocker') {
    const def = STAFF[kind];
    if (state.level < def.level) return { ok: false, reason: `Poste débloqué au niveau ${def.level}` };
    if (state.phase === 'summary' || state.phase === 'closing') return { ok: false, reason: 'Journée terminée · revient demain' };
  }
  if (kind === 'deco') {
    const owned = (state.deco && state.deco.owned) || [];
    if (owned.length >= DECOS.length) return { ok: false, reason: 'Tu as toutes les décorations' };
  }
  if (kind === 'double') {
    const sum = summary || state.lastSummary;
    if (state.phase !== 'summary' || !sum || sum.day !== state.day) return { ok: false, reason: 'Au bilan de fin de journée' };
    if (sum.doubled) return { ok: false, reason: 'Bénéfice déjà doublé', used: true };
    if (!(sum.profit > 0)) return { ok: false, reason: 'Journée en perte : rien à doubler', loss: true };
  }
  return { ok: true };
}

// Pub imposée (simulée) due à ce bilan ? Uniquement au bilan, jamais avant le jour 3, jamais en tutoriel,
// une toutes les 3 journées (une pub récompensée regardée repousse la suivante), 4 minutes réelles d'écart.
// noForced : Pack Gérant (plus tard) ; simulate : interrupteur « Simuler les pubs (bêta) ».
export function forcedAdDue(state, now, { simulate = true, noForced = false } = {}) {
  if (!simulate || noForced) return false;
  if (state.tutoMode) return false;
  if (state.phase !== 'summary') return false;
  if (state.day < REWARD_FROM_DAY) return false;
  const r = state.rewards || emptyRewards();
  if (r.forcedDay === state.day) return false;
  if (state.day - (r.adAnchor || 0) < FORCED_EVERY_DAYS) return false;
  const since = now - (r.lastAdAt || 0);
  if (r.lastAdAt && since >= 0 && since < AD_GAP_MS) return false; // (heure du téléphone reculée : on ne bloque pas)
  return true;
}

// Une pub (récompensée ou imposée) vient d'être vue : mise à jour du rythme.
export function noteAd(state, now, { forced = false } = {}) {
  const r = state.rewards || (state.rewards = emptyRewards());
  r.adAnchor = state.day;
  r.lastAdAt = now;
  if (forced) r.forcedDay = state.day;
}
