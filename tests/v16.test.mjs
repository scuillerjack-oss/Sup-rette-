// V1.6 : coffres (pubs simulées), intérimaire du jour, « Mon équipe », bilan doublé, décorations, pub imposée,
// équilibre hommes/femmes. Un test par règle (docs/MODELE-ECONOMIQUE.md, sections 0 et 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, newState, serialize, deserialize, cents } from '../src/game.js';
import { SAVE_KEY, FIRST_NAMES, FEMALE_NAMES, genderOf, staffLook, CASHIER_LEVELS, STOCKER_LEVELS, CONTRACT_DAYS } from '../src/data.js';
import {
  CHEST_ODDS, PITY_AFTER, rollStars, seededRng, rewardStatus, forcedAdDue, noteAd, AD_GAP_MS, FORCED_EVERY_DAYS,
  REWARD_FROM_DAY, DECOS, DECO_SLOTS, cleanRewards
} from '../src/rewards.js';
import { showRewarded, showInterstitial, AD_SECONDS } from '../src/ads.js';
import { BETA_FREE, PRODUCTS_IAP, speed3Unlocked, hasManagerPack } from '../src/shop.js';
import { tutorialState } from '../src/tutorial.js';
import { createSaver } from '../src/storage.js';
import { playBot } from '../scripts/bot.mjs';
import { versionCodeFor } from '../scripts/android-version.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const run = (g, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) g.update(dt); };
const MIN = 60 * 1000;
// Tirage qui donne exactement le nombre d'étoiles voulu au prochain coffre (puis des valeurs neutres).
function rngFor(stars) {
  const before = CHEST_ODDS.slice(0, stars - 1).reduce((a, b) => a + b, 0);
  const vals = [(before + 0.5) / 100];
  return () => (vals.length ? vals.shift() : 0.3);
}
// Partie au jour 5, niveau 4 (caissier et magasinier débloqués), magasin ouvert.
function shop({ day = 5, level = 4, open = true } = {}) {
  const s = newState();
  s.day = day; s.level = level; s.coins = cents(5000);
  const g = new Game(s);
  if (open) g.openStore();
  return g;
}

// ------------------------------------------------------------------ chances et garantie
test('coffre : chances affichées 35/28/20/12/5 % (total 100), respectées sur 200 000 tirages avec graine', () => {
  assert.deepEqual(CHEST_ODDS, [35, 28, 20, 12, 5]);
  assert.equal(CHEST_ODDS.reduce((a, b) => a + b, 0), 100);
  const rng = seededRng(42);
  const n = 200000;
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) counts[rollStars(0, rng).stars - 1]++;
  counts.forEach((c, i) => assert.ok(Math.abs((c / n) * 100 - CHEST_ODDS[i]) < 0.5, `${i + 1}★ : ${((c / n) * 100).toFixed(2)} %`));
  // les chances sont écrites dans le coffre
  assert.match(read('src/ui.js'), /CHEST_ODDS\.map\(\(p, i\) => `<span><b>\$\{i \+ 1\}★<\/b>\$\{p\} %/);
});

test('coffre : garantie anti-malchance — jamais 6 coffres d’affilée sans 4★ ou plus (100 000 coffres)', () => {
  const rng = seededRng(7);
  let pity = 0;
  let streak = 0;
  let longest = 0;
  let guaranteed = 0;
  const counts = [0, 0, 0, 0, 0];
  for (let i = 0; i < 100000; i++) {
    const r = rollStars(pity, rng);
    pity = r.pity;
    counts[r.stars - 1]++;
    if (r.guaranteed) { guaranteed++; assert.ok(r.stars >= 4); }
    streak = r.stars >= 4 ? 0 : streak + 1;
    longest = Math.max(longest, streak);
  }
  assert.equal(longest, PITY_AFTER, 'au plus 5 coffres sans 4★+');
  assert.ok(guaranteed > 0);
  // avec la garantie, un 4★+ tombe un peu plus souvent qu'une fois sur six
  const rare = (counts[3] + counts[4]) / 100000;
  assert.ok(rare > 0.17 && rare < 0.28, `4★+ : ${(rare * 100).toFixed(1)} %`);
});

test('coffre : le compteur de garantie est sauvegardé et suit la partie', () => {
  const g = shop();
  g.state.rewards.pity = 5;
  const r = g.claimReward('cashier', { rng: rngFor(1), now: 0 });
  assert.ok(r.ok && r.guaranteed && r.stars >= 4, 'garantie déclenchée');
  assert.equal(g.state.rewards.pity, 0);
  g.state.rewards.pity = 3;
  const back = deserialize(serialize(g.state));
  assert.equal(back.rewards.pity, 3);
  assert.equal(cleanRewards({ pity: 99 }).pity, PITY_AFTER, 'valeur abîmée bornée');
});

// ------------------------------------------------------------------ une fois par journée, à partir du jour 3
test('coffres : chaque récompense une seule fois par journée de jeu, et à partir du jour 3', () => {
  const g = shop({ day: 2 });
  for (const k of ['cashier', 'stocker', 'deco']) assert.equal(g.claimReward(k).ok, false, `${k} au jour 2`);
  g.state.day = REWARD_FROM_DAY;
  for (const k of ['cashier', 'stocker', 'deco']) {
    assert.equal(g.claimReward(k, { now: 0 }).ok, true, `${k} 1re fois`);
    assert.equal(g.claimReward(k, { now: 0 }).ok, false, `${k} 2e fois le même jour`);
    assert.match(rewardStatus(g.state, k).reason, /Déjà pris aujourd’hui/);
  }
  // journée suivante : de nouveau disponible
  run(g, 400);
  assert.equal(g.state.phase, 'summary');
  g.nextDay();
  g.openStore();
  for (const k of ['cashier', 'stocker', 'deco']) assert.equal(rewardStatus(g.state, k).ok, true, `${k} le lendemain`);
});

test('coffres d’employés : poste pas encore débloqué ou journée finie → pas de coffre', () => {
  const g = shop({ level: 2 });
  assert.equal(rewardStatus(g.state, 'cashier').ok, true);
  assert.match(rewardStatus(g.state, 'stocker').reason, /niveau 3/);
  g.state.phase = 'closing';
  assert.equal(rewardStatus(g.state, 'cashier').ok, false);
});

// ------------------------------------------------------------------ pubs simulées : refus, tutoriel, cadence
test('pubs : uniquement simulées, aucun SDK ni réseau ; achats non vendables (×3 gratuit en bêta)', async () => {
  for (const f of ['src/ads.js', 'src/shop.js', 'src/rewards.js']) {
    const code = read(f).replace(/\/\/.*$/gm, ''); // le code, sans les commentaires
    assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\/|admob|billing|^import .* from '(?!\.)/im, f);
  }
  assert.match(read('src/ads.js'), /Pub simulée \(bêta\)/);
  assert.equal(AD_SECONDS, 3);
  // sans écran (Node) : la fausse pub se termine tout de suite
  assert.deepEqual(await showRewarded('cashier'), { watched: true });
  assert.deepEqual(await showInterstitial(), { watched: true });
  assert.equal(BETA_FREE, true);
  assert.equal(speed3Unlocked(), true);
  assert.equal(hasManagerPack(), false);
  assert.deepEqual(PRODUCTS_IAP.map((p) => p.id), ['vitesse3', 'pack-gerant']);
  assert.doesNotMatch(read('src/ui.js'), /PRODUCTS_IAP|acheter/i, 'aucun écran d’achat');
});

test('pubs : refuser = AUCUNE pub. La pub récompensée ne part que d’un geste du joueur, l’imposée que du bilan', () => {
  const ui = read('src/ui.js');
  // une seule pub récompensée possible : dans watchFor, appelé uniquement par les boutons « chest » et « double »
  assert.equal((ui.match(/showRewarded\(/g) || []).length, 1);
  assert.equal((ui.match(/watchFor\(/g) || []).length, 3, 'définition + bouton coffre + bouton bilan doublé');
  assert.match(ui, /case 'chest':\s*\n\s*this\.watchFor\(id\)/);
  assert.match(ui, /b\.dataset\.a === 'double'\) \{\s*\n\s*this\.watchFor\('double'\)/);
  // une seule pub imposée : au bouton « Préparer le jour suivant » du bilan
  assert.equal((ui.match(/showInterstitial\(/g) || []).length, 1);
  assert.match(ui, /if \(b\.dataset\.a === 'next'\) \{[\s\S]{0,600}forcedAdDue\([\s\S]{0,300}showInterstitial\(\)/);
  // fermer le panneau des coffres (= dire non) : rien d'autre que fermer
  assert.match(ui, /case 'close': return this\.close\(\);/);
  // pub récompensée fermée avant la fin : pas de récompense
  assert.match(ui, /if \(!r\.watched\) \{[\s\S]{0,300}return null;/);
  // ne jamais toucher aux coffres ne déclenche rien : la pub imposée ne dépend que des journées jouées
  const s = newState();
  s.day = 4; s.phase = 'summary';
  const before = JSON.stringify(s.rewards);
  rewardStatus(s, 'cashier'); rewardStatus(s, 'double');
  assert.equal(JSON.stringify(s.rewards), before);
});

test('pubs : jamais dans le tutoriel (ni coffre, ni bilan doublé, ni pub imposée), jamais avant le jour 3', () => {
  const t = tutorialState();
  t.day = 9; t.phase = 'open';
  for (const k of ['cashier', 'stocker', 'deco', 'double']) assert.match(rewardStatus(t, k).reason, /tutoriel/);
  t.phase = 'summary';
  assert.equal(forcedAdDue(t, 1e12), false);
  const s = newState();
  s.phase = 'summary';
  for (const d of [1, 2]) { s.day = d; assert.equal(forcedAdDue(s, 1e12), false, `jour ${d}`); }
  // l'interface masque le bouton des coffres dans le tutoriel et avant le jour 3
  assert.match(read('src/ui.js'), /const chestOk = !s\.tutoMode && s\.day >= REWARD_FROM_DAY/);
  assert.match(read('src/ui.js'), /if \(s\.tutoMode \|\| s\.day < REWARD_FROM_DAY/);
});

test('pub imposée : une toutes les 3 journées, au bilan seulement, repoussée par une pub récompensée', () => {
  const s = newState();
  const forcedDays = (days, { rewardedOn = [] } = {}) => {
    const out = [];
    let now = 0;
    for (let d = 1; d <= days; d++) {
      s.day = d;
      s.phase = 'open';
      now += 5 * MIN; // une journée ≈ 5 min réelles
      assert.equal(forcedAdDue(s, now), false, 'jamais pendant qu’on joue');
      if (rewardedOn.includes(d)) noteAd(s, now);
      s.phase = 'summary';
      now += 10 * 1000;
      if (forcedAdDue(s, now)) { out.push(d); noteAd(s, now, { forced: true }); assert.equal(forcedAdDue(s, now), false, 'une seule fois'); }
    }
    return out;
  };
  assert.deepEqual(forcedDays(15), [3, 6, 9, 12, 15]);
  s.rewards = cleanRewards(null);
  assert.deepEqual(forcedDays(15, { rewardedOn: [5] }), [3, 8, 11, 14], 'la pub récompensée du jour 5 repousse');
  s.rewards = cleanRewards(null);
  assert.deepEqual(forcedDays(15, { rewardedOn: [4, 6, 8, 10, 12, 14] }), [3], 'joueur qui regarde souvent : plus de pub imposée');
  assert.equal(FORCED_EVERY_DAYS, 3);
  // interrupteur « Simuler les pubs (bêta) » coupé, ou Pack Gérant : aucune pub imposée
  s.rewards = cleanRewards(null); s.day = 9; s.phase = 'summary';
  assert.equal(forcedAdDue(s, 1e9, { simulate: false }), false);
  assert.equal(forcedAdDue(s, 1e9, { noForced: true }), false);
  assert.equal(forcedAdDue(s, 1e9), true);
});

test('pubs : jamais deux pubs (tous types) à moins de 4 minutes réelles', () => {
  const s = newState();
  s.day = 9; s.phase = 'summary';
  s.rewards.adAnchor = 3; // dernière pub au jour 3
  s.rewards.lastAdAt = 1000 * MIN;
  assert.equal(AD_GAP_MS, 4 * MIN);
  assert.equal(forcedAdDue(s, 1000 * MIN + 3 * MIN), false, '3 min après');
  assert.equal(forcedAdDue(s, 1000 * MIN + 4 * MIN), true, '4 min après');
  // l'interrupteur des paramètres existe et est activé par défaut
  assert.match(read('src/audio.js'), /simAds: true/);
  assert.match(read('src/ui.js'), /Simuler les pubs \(bêta\)/);
});

// ------------------------------------------------------------------ intérimaire : remplacement immédiat sans coût
test('intérimaire magasinier meilleur : remplace IMMÉDIATEMENT (même à 16 h), sans coût, l’habituel revient demain', () => {
  const g = shop();
  const s = g.state;
  s.staff.stocker = { id: 50, name: 'Hugo', level: 1, days: 4, look: 2 };
  g.syncStaff();
  run(g, 60);
  s.minute = 16 * 60;
  const agent = g.stocker;
  const coins = s.coins;
  const r = g.claimReward('stocker', { rng: rngFor(4), now: 0 });
  assert.ok(r.ok && r.stars === 4 && r.onDuty);
  assert.equal(r.replaced, 'Hugo');
  assert.equal(s.coins, coins, 'aucun coût');
  assert.equal(g.stocker, agent, 'même personnage à l’écran : le carton porté et la tâche sont gardés');
  assert.equal(g.stocker.level, 4, 'niveau du remplaçant tout de suite');
  assert.equal(g.stocker.perUnit, STOCKER_LEVELS[3].perUnit);
  assert.equal(g.stocker.name, r.member.name);
  assert.equal(s.staff.stocker.days, 4, 'Hugo garde son contrat');
  run(g, 400);
  assert.equal(s.phase, 'summary');
  assert.equal(s.lastSummary.tempLeft, r.member.name);
  g.nextDay();
  assert.equal(g.stocker.name, 'Hugo', 'Hugo revient le lendemain');
  assert.equal(s.temps.stocker, null);
  assert.ok(s.roster.some((m) => m.id === r.member.id && m.from === 'coffre'), 'intérimaire dans le carnet');
});

test('intérimaire caissier : prend le poste libre, ou remplace le moins bon s’il est meilleur ; sinon au repos', () => {
  // poste libre
  let g = shop();
  let r = g.claimReward('cashier', { rng: rngFor(1), now: 0 });
  assert.ok(r.onDuty && !r.replaced);
  assert.equal(g.cashierAt(1).id, r.member.id, 'tient la caisse 1');
  // remplace le moins bon
  g = shop({ level: 9 });
  g.state.registers = [1, 2]; g.rebuild();
  g.state.staff.cashiers = [{ id: 1, name: 'Léa', level: 3, days: 5, look: 0 }, { id: 2, name: 'Tom', level: 2, days: 5, look: 1 }];
  const coins = g.state.coins;
  r = g.claimReward('cashier', { rng: rngFor(5), now: 0 });
  assert.equal(r.replaced, 'Tom');
  assert.equal(g.state.coins, coins);
  const working = [...g.cashierAssignments().values()].map((c) => c.name);
  assert.ok(working.includes(r.member.name) && working.includes('Léa') && !working.includes('Tom'));
  // pas meilleur : au repos, l'équipe ne change pas ; le joueur peut quand même le faire travailler, sans frais
  g = shop();
  g.state.staff.cashiers = [{ id: 1, name: 'Léa', level: 4, days: 5, look: 0 }];
  r = g.claimReward('cashier', { rng: rngFor(2), now: 0 });
  assert.equal(r.onDuty, false);
  assert.equal(g.cashierAt(1).name, 'Léa');
  assert.equal(g.setTempDuty('cashier', 1).ok, true);
  assert.equal(g.cashierAt(1).id, r.member.id);
  assert.equal(g.setTempDuty('cashier', null).ok, true);
  assert.equal(g.cashierAt(1).name, 'Léa');
  assert.equal(g.state.coins, cents(5000) - 0, 'aucun coût');
});

test('intérimaire caissier : il encaisse vraiment avec SES étoiles', () => {
  const g = shop();
  g.state.staff.cashiers = [{ id: 1, name: 'Léa', level: 1, days: 5, look: 0 }];
  g.claimReward('cashier', { rng: rngFor(5), now: 0 });
  const c = g.cashierAt(1);
  assert.equal(c.level, 5);
  assert.equal(CASHIER_LEVELS[c.level - 1].error, 0);
  assert.ok(c.temp);
});

test('intérimaire : appli fermée avant le bilan → à la réouverture un autre jour, il est parti et dans le carnet', () => {
  const g = shop();
  const r = g.claimReward('stocker', { rng: rngFor(3), now: 0 });
  const saved = deserialize(serialize(g.state));
  saved.day += 1; saved.phase = 'prep';
  const g2 = new Game(saved);
  assert.equal(g2.state.temps.stocker, null);
  assert.ok(g2.state.roster.some((m) => m.id === r.member.id));
  assert.equal(g2.stocker, null);
});

// ------------------------------------------------------------------ carnet « Mon équipe »
test('carnet : embauchés et gagnés en coffre ; embauche du carnet au prix normal ; salaires inchangés', () => {
  assert.deepEqual(CASHIER_LEVELS.map((l) => l.weekCost), [140, 200, 280, 380, 520]);
  assert.deepEqual(STOCKER_LEVELS.map((l) => l.weekCost), [120, 170, 235, 320, 430]);
  const g = shop();
  const cand = g.ensureCandidates().cashier[0];
  const h = g.hire('cashier', cand.id);
  assert.ok(h.ok);
  assert.ok(g.state.roster.some((m) => m.id === h.member.id && m.from === 'embauche'));
  const r = g.claimReward('stocker', { rng: rngFor(4), now: 0 });
  assert.match(g.hireKnown('stocker', r.member.id).reason, /Intérimaire aujourd’hui/);
  run(g, 400);
  g.nextDay();
  const coins = g.state.coins;
  const k = g.hireKnown('stocker', r.member.id);
  assert.ok(k.ok, k.reason);
  assert.equal(coins - g.state.coins, cents(STOCKER_LEVELS[3].weekCost), 'prix normal d’un 4★');
  assert.equal(g.state.staff.stocker.days, CONTRACT_DAYS);
  assert.equal(g.stocker.level, 4);
  assert.match(g.hireKnown('stocker', r.member.id).reason, /Déjà sous contrat/);
  // identifiants uniques et sauvegardés
  const ids = g.state.roster.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(deserialize(serialize(g.state)).nextStaffId, g.state.nextStaffId);
});

test('Mon équipe : changer un caissier de caisse en pleine journée, sans surcoût', () => {
  const g = shop({ level: 9 });
  g.state.registers = [1, 2]; g.rebuild();
  g.state.staff.cashiers = [{ id: 1, name: 'Léa', level: 3, days: 5, look: 0 }];
  assert.equal(g.cashierAt(1).name, 'Léa');
  const coins = g.state.coins;
  assert.ok(g.setCashierRegister(1, 2).ok);
  assert.equal(g.cashierAt(2).name, 'Léa');
  assert.equal(g.cashierAt(1), null);
  assert.equal(g.state.coins, coins);
  // l'interface affiche l'onglet, l'étiquette de l'intérimaire et le salaire hebdo
  const ui = read('src/ui.js');
  assert.match(ui, /👥 Mon équipe/);
  assert.match(ui, /Intérimaire jusqu’à 20 h/);
  assert.match(ui, /\/ semaine/);
});

// ------------------------------------------------------------------ bilan doublé
test('bilan doublé : ×2 sur le BÉNÉFICE seulement, rien si la journée est en perte', () => {
  const g = shop();
  run(g, 400);
  const s = g.state;
  assert.equal(s.phase, 'summary');
  s.lastSummary.profit = cents(42);
  const coins = s.coins;
  const r = g.claimReward('double', { now: 0 });
  assert.ok(r.ok);
  assert.equal(r.bonus, cents(42));
  assert.equal(s.coins - coins, cents(42));
  assert.equal(s.lastSummary.doubled, true);
  assert.equal(g.claimReward('double').ok, false, 'une seule fois');
  // journée en perte ou nulle : refusé avec explication
  const g2 = shop();
  run(g2, 400);
  for (const p of [-500, 0]) {
    g2.state.lastSummary.profit = p;
    const st = rewardStatus(g2.state, 'double');
    assert.equal(st.ok, false);
    assert.match(st.reason, /perte/);
  }
  // pas au bilan : refusé
  const g3 = shop();
  assert.equal(rewardStatus(g3.state, 'double').ok, false);
  assert.match(read('src/ui.js'), /Journée en perte : il n’y a pas de bénéfice à doubler/);
});

// ------------------------------------------------------------------ décorations
test('coffre déco : au moins 3 affiches, 3 sols, 3 plantes, 2 enseignes ; posée et sauvegardée ; aucun effet', () => {
  const by = (slot) => DECOS.filter((d) => d.slot === slot).length;
  assert.ok(by('affiche') >= 3 && by('sol') >= 3 && by('plante') >= 3 && by('enseigne') >= 2);
  assert.deepEqual(Object.keys(DECO_SLOTS), ['affiche', 'sol', 'plante', 'enseigne']);
  const g = shop();
  const before = g.dayMultiplier();
  const r = g.claimReward('deco', { rng: () => 0, now: 0 });
  assert.ok(r.ok && r.deco && r.placed);
  assert.equal(g.state.deco.placed[r.deco.slot], r.deco.id);
  assert.equal(g.dayMultiplier(), before, 'aucun effet sur les clients');
  assert.ok(g.placeDeco(r.deco.slot, null).ok, 'retour au décor d’origine');
  assert.equal(g.placeDeco('sol', 'inconnu').ok, false);
  assert.ok(g.placeDeco(r.deco.slot, r.deco.id).ok);
  const back = deserialize(serialize(g.state));
  assert.deepEqual(back.deco, g.state.deco);
  // toutes gagnées : plus de coffre déco
  g.state.deco.owned = DECOS.map((d) => d.id);
  g.state.rewards.used = {};
  assert.match(rewardStatus(g.state, 'deco').reason, /toutes/);
  // décorations dessinées en 3D et en 2D
  assert.match(read('src/render3d.js'), /buildDeco\(\)/);
  assert.match(read('src/render.js'), /DECO_BY_ID\[dp\.sol\]/);
});

// ------------------------------------------------------------------ sauvegarde / migration V1.5
test('sauvegarde : une partie V1.5 se charge sans rien perdre (clé inchangée, équipe dans le carnet)', () => {
  assert.equal(SAVE_KEY, 'superette-save-v1');
  const old = newState();
  for (const k of ['rewards', 'deco', 'roster', 'temps', 'nextStaffId']) delete old[k];
  old.day = 14; old.level = 7; old.coins = 77777;
  old.staff = { cashiers: [{ id: 3014, name: 'Inès', level: 3, days: 4, look: 2 }], stocker: { id: 3015, name: 'Karim', level: 2, days: 1, look: 5 } };
  const json = JSON.stringify(old);
  const s = deserialize(json);
  assert.equal(s.day, 14);
  assert.equal(s.coins, 77777);
  assert.deepEqual(s.staff, old.staff);
  assert.deepEqual(s.roster.map((m) => m.name).sort(), ['Inès', 'Karim']);
  assert.equal(s.rewards.pity, 0);
  assert.deepEqual(s.deco.owned, []);
  assert.deepEqual(s.temps, { cashier: null, stocker: null });
  assert.ok(s.nextStaffId > 3015);
  const g = new Game(s);
  assert.equal(g.cashierAt(1).name, 'Inès');
  assert.equal(g.stocker.name, 'Karim');
  // la sauvegarde passe toujours par createSaver sur la même clé
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  createSaver(st, SAVE_KEY, () => g.state, { fresh: newState, serializeFn: serialize }).save();
  assert.equal(deserialize(mem.get(SAVE_KEY)).roster.length, 2);
  // données abîmées : ignorées
  const bad = deserialize(JSON.stringify({ ...old, rewards: 'x', deco: { owned: ['zzz'], placed: { sol: 'zzz' } }, roster: [{ kind: 'pirate' }], temps: { cashier: { kind: 'x' } } }));
  assert.deepEqual(bad.deco.owned, []);
  assert.equal(bad.temps.cashier, null);
  assert.equal(bad.roster.length, 2);
});

// ------------------------------------------------------------------ hommes / femmes
test('prénoms 10/10, apparence qui suit le prénom (2D et 3D), tirage des candidats ~50/50', () => {
  assert.equal(FIRST_NAMES.length, 20);
  assert.equal(FEMALE_NAMES.length, 10);
  assert.ok(FEMALE_NAMES.every((n) => FIRST_NAMES.includes(n)));
  for (const name of FIRST_NAMES) {
    for (let look = 0; look < 6; look++) {
      const l = staffLook({ name, look });
      if (genderOf(name) === 'f') assert.ok(l.female && (l.hairStyle === 1 || l.hairStyle === 2), `${name} ${look}`);
      else assert.ok(!l.female && l.hairStyle === 0, `${name} ${look}`);
    }
  }
  assert.equal(staffLook({ name: 'Léa', look: 0 }).female, true);
  assert.match(read('src/render3d.js'), /if \(look\.female\)/);
  assert.match(read('src/render.js'), /look\.female/);
  // candidats de la semaine et coffres
  let f = 0, n = 0;
  for (let w = 0; w < 400; w++) {
    const g = new Game();
    g.state.level = 9;
    for (const c of [...g.ensureCandidates().cashier, ...g.ensureCandidates().stocker]) { n++; if (genderOf(c.name) === 'f') f++; }
  }
  assert.ok(Math.abs(f / n - 0.5) < 0.04, `candidates : ${((f / n) * 100).toFixed(1)} %`);
  const rng = seededRng(3);
  f = 0; n = 0;
  for (let i = 0; i < 2000; i++) {
    const g = shop();
    const r = g.claimReward('cashier', { rng, now: 0 });
    n++; if (genderOf(r.member.name) === 'f') f++;
  }
  assert.ok(Math.abs(f / n - 0.5) < 0.04, `coffres : ${((f / n) * 100).toFixed(1)} %`);
});

// ------------------------------------------------------------------ économie
test('économie : joueur qui ouvre TOUS les coffres → progression un peu plus rapide, jeu pas cassé', () => {
  const days = (chests) => [0, 1, 2].map((i) => playBot({ days: 40, chests, rng: seededRng(200 + i) }));
  const withC = days(true);
  const lv10 = withC.map((r) => r.marks.level10 ?? 99);
  const avg = lv10.reduce((a, b) => a + b, 0) / lv10.length;
  assert.ok(avg >= 22 && avg <= 34, `niveau 10 au jour ${avg.toFixed(1)} avec coffres (${lv10.join(', ')})`);
  for (const r of withC) {
    assert.ok(r.chestLog.opened > 0 && r.chestLog.doubled > 0);
    assert.ok(r.dayStats.every((d) => Number.isFinite(d.coins)));
  }
});

test('relecture : coffre caissier ET coffre magasinier le même jour → deux intérimaires, aucun perdu', () => {
  const g = shop();
  g.state.staff.stocker = { id: 50, name: 'Hugo', level: 1, days: 4, look: 2 };
  g.syncStaff();
  const a = g.claimReward('stocker', { rng: rngFor(5), now: 0 });
  const b = g.claimReward('cashier', { rng: rngFor(2), now: 0 });
  assert.ok(a.ok && b.ok);
  assert.equal(g.stocker.name, a.member.name, 'le magasinier intérimaire reste au poste');
  assert.equal(g.cashierAt(1).name, b.member.name, 'la caisse libre est prise');
  run(g, 400);
  assert.equal(g.state.phase, 'summary');
  assert.match(g.state.lastSummary.tempLeft, / et /);
  const ids = g.state.roster.map((m) => m.id);
  assert.ok(ids.includes(a.member.id) && ids.includes(b.member.id), 'les deux dans le carnet');
});

test('version : au moins 1.6.0, versionCode au-dessus de la V1.5 ; le build embarque rewards, ads et shop', () => {
  const v = JSON.parse(read('package.json')).version;
  assert.ok(versionCodeFor(v, 1) >= versionCodeFor('1.6.0', 1)); // V1.7 : « au moins » (comme le test V1.5)
  assert.ok(versionCodeFor(v, 1) > versionCodeFor('1.5.0', 999));
  assert.match(read('build.mjs'), /'data', 'rewards'[\s\S]*'ads', 'shop', 'ui'/);
});

test('relecture : heure du téléphone reculée → la pub imposée n’est pas bloquée indéfiniment', () => {
  const s = newState();
  s.day = 9; s.phase = 'summary';
  s.rewards.adAnchor = 3;
  s.rewards.lastAdAt = 5000 * MIN;
  assert.equal(forcedAdDue(s, 1000 * MIN), true);
});

test('relecture : un coffre ne donne jamais un prénom déjà dans le carnet ou l’équipe (tant qu’il en reste)', () => {
  const g = shop();
  const rng = seededRng(11);
  const seen = new Set();
  for (let d = 0; d < 12; d++) {
    const r = g.claimReward(d % 2 ? 'cashier' : 'stocker', { rng, now: 0 });
    assert.ok(r.ok);
    assert.ok(!seen.has(r.member.name), `doublon ${r.member.name}`);
    seen.add(r.member.name);
    run(g, 400);
    g.nextDay();
    g.openStore();
  }
});
