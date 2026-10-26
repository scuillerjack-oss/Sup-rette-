// Interface DOM : HUD, barre du bas, panneaux, mini-jeu de caisse, fin de journée.
import { shouldCloseOnBackdrop } from './tap.js';
import { PRODUCTS, PRODUCT_BY_ID, STAFF, ZONES, REGISTERS, SHELF_CAPACITY, RESERVE_CAPACITY, CHANGE_MONEY, DAY_START, DAY_END, xpForLevel, dailyCharges, CASHIER_LEVELS, STOCKER_LEVELS, EVENT_BY_ID, GOALS_FROM_DAY } from './data.js';
import { cents } from './game.js';
import { drawProduct, money } from './render.js';
import { settings, sfx, haptic } from './audio.js';
import { BUILD_VERSION } from './update.js';
import { rewardStatus, forcedAdDue, noteAd, CHEST_ODDS, PITY_AFTER, REWARD_FROM_DAY, DECOS, DECO_BY_ID, DECO_SLOTS } from './rewards.js';
import { showRewarded, showInterstitial } from './ads.js';
import { hasManagerPack } from './shop.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const iconCache = new Map();
function iconUrl(id, size = 56) {
  const k = `${id}:${size}`;
  if (iconCache.has(k)) return iconCache.get(k);
  const cv = document.createElement('canvas');
  const d = 2;
  cv.width = size * d;
  cv.height = size * d;
  const c = cv.getContext('2d');
  c.scale(d, d);
  c.translate(size / 2, size / 2);
  drawProduct(c, PRODUCT_BY_ID[id], size * 0.9);
  const url = cv.toDataURL();
  iconCache.set(k, url);
  return url;
}

const coinSvg = '<span class="coin" aria-hidden="true"></span>';

// Popularité (0 à 100)
function popIcon(v) { return v >= 75 ? '🤩' : v >= 50 ? '😊' : v >= 25 ? '🙂' : '😟'; }
function popLabel(v) { return v >= 75 ? 'le quartier adore' : v >= 50 ? 'bonne réputation' : v >= 25 ? 'on commence à te connaître' : 'les clients t’évitent'; }
function popColor(v) { return v >= 50 ? '#3ccf8e' : v >= 25 ? '#ffd36b' : '#ff7a5c'; }
const POP_CAUSES = { prix: '🏷️ Prix', service: '😊 Service', cadeau: '🎁 Erreurs de caisse en faveur du client', arnaque: '😠 Erreurs de caisse remarquées', choix: '📦 Choix en rayon', personnel: '👥 Personnel' };
function popRows(rep) {
  if (!rep) return '';
  const rows = Object.keys(POP_CAUSES).filter((k) => Math.abs(rep[k] || 0) >= 0.05).map((k) => {
    const v = rep[k];
    return `<div class="poprow"><span>${POP_CAUSES[k]}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}</b></div>`;
  });
  return rows.length ? `<div class="poprows">${rows.join('')}</div>` : '';
}

// « Demandes non satisfaites » (nom avant la V1.4 : « introuvables », trop flou) : ce que mesure le jeu et comment l'améliorer.
export const MISSING_HELP = 'Un client voulait un produit qui n’était pas en rayon (rayon vide ou absent), ou pas en quantité suffisante. Chaque demande ratée le rend moins content et fait baisser un peu la popularité.';
const MISSING_TIPS = ['Remplis les rayons avant d’ouvrir et pendant la journée (ou embauche un magasinier).', 'Commande un peu d’avance : les cartons attendent dans la réserve.', 'Installe un rayon pour chaque produit dont tu as la licence.'];
function missingHelp(by) {
  const top = Object.entries(by || {}).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([id, n]) => `<span>${esc(PRODUCT_BY_ID[id] ? PRODUCT_BY_ID[id].name : id)} × ${n}</span>`).join('');
  return `<p>${MISSING_HELP}</p>${top ? `<div class="missing-top"><small>Les plus demandés :</small>${top}</div>` : ''}<ul>${MISSING_TIPS.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

function hhmm(min) {
  const m = Math.floor(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const TUTO = [
  'Touche le bouton « Commander » 🛒 en bas pour commander tes premiers cartons.',
  'Les cartons arrivent dans la réserve (en haut). Touche un carton pour le prendre. Tu peux aussi le reposer où tu veux dans la réserve.',
  'Touche une étagère pour y ranger le carton.',
  'Ouvre le magasin, puis touche la caisse pour servir les clients.',
  ''
];

export class UI {
  constructor(game, renderer, hooks) {
    this.g = game;
    this.r = renderer;
    this.hooks = hooks;
    this.sheet = null; // { kind, data }
    this.cart = {};
    this.last = {};
    this.toastTimer = null;
    this.bind();
    $('#verTag').textContent = `v${BUILD_VERSION}`;
    game.on((type, data) => this.onEvent(type, data));
    this.renderPhase();
  }

  bind() {
    $('#btnOrder').onclick = () => this.open('order');
    $('#btnPrices').onclick = () => this.open('prices');
    $('#btnStaff').onclick = () => this.open('staff');
    $('#btnBuild').onclick = () => this.open('build');
    $('#btnMenu').onclick = () => this.open('menu');
    $('#btnPop').onclick = () => this.open('pop');
    $('#btnGoals').onclick = () => this.open('goals');
    $('#btnChest').onclick = () => this.open('chests');
    $('#moveCancel').onclick = () => { this.g.cancelMove(); sfx('tick'); };
    $('#btnSpeed').onclick = () => {
      this.g.speed = this.g.speed === 1 ? 2 : this.g.speed === 2 ? 3 : 1;
      $('#btnSpeed').textContent = `×${this.g.speed}`;
      sfx('tick');
    };
    $('#openBtn').onclick = () => {
      this.g.openStore();
      this.renderPhase();
    };
    let downOnBackdrop = false;
    $('#sheet').addEventListener('pointerdown', (e) => { downOnBackdrop = e.target.id === 'sheet'; });
    $('#sheet').addEventListener('click', (e) => {
      const ok = e.target.id === 'sheet' && shouldCloseOnBackdrop(downOnBackdrop, this.openedAt || 0, performance.now());
      downOnBackdrop = false;
      if (ok) this.close();
    });
    $('#sheetBody').addEventListener('click', (e) => this.onSheetClick(e));
    $('#checkout').addEventListener('click', (e) => this.onCheckoutClick(e));
    $('#modal').addEventListener('click', (e) => this.onModalClick(e));
  }

  // ---------------------------------------------------------------- événements
  onEvent(type, data) {
    switch (type) {
      case 'toast': this.toast(data.text); break;
      case 'sfx': sfx(data.name, data); break;
      case 'haptic': haptic(data.ms); break;
      case 'phase':
        this.renderPhase();
        if (data.phase === 'summary') this.showSummary(data.summary);
        if (data.phase === 'closing') this.toast('20:00 · Le magasin ferme, on sert les derniers clients');
        if (data.phase === 'prep') {
          const ev = EVENT_BY_ID[this.g.state.event];
          if (ev) setTimeout(() => this.toast(`${ev.icon} ${ev.name} : ${ev.desc}`), 400);
        }
        break;
      case 'levelup':
        sfx('level');
        haptic(40);
        this.queueModal({ kind: 'level', data });
        break;
      case 'checkout': this.renderCheckout(); break;
      case 'delivery': sfx('delivery'); break;
      case 'tutorial': this.renderHint(); break;
      case 'moving': this.renderMove(); break;
      case 'sale': if (this.sheet) this.refreshSheet(); break;
      case 'save': this.hooks.save(); break;
      case 'staffError':
        this.toast(data.over
          ? `${data.name} a compté un article en trop (+${money(data.amount)})${data.refused ? ' : le client refuse de payer 😡' : data.noticed ? ' : le client a remarqué 😠' : ''}`
          : `${data.name} a oublié un article (−${money(data.amount)}) : client ravi 🎁`, 'warn');
        break;
      case 'empty': {
        const p = PRODUCT_BY_ID[data.product];
        this.toast(`Rayon ${p.name} vide !`, 'warn');
        haptic(25);
        break;
      }
      default: break;
    }
  }

  toast(text, tone = '') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------------------------------------------------------------- HUD
  frame() {
    const s = this.g.state;
    const set = (id, v) => {
      if (this.last[id] !== v) {
        this.last[id] = v;
        $(id).textContent = v;
      }
    };
    set('#coins', money(s.coins));
    set('#day', `Jour ${s.day}`);
    set('#clock', s.phase === 'prep' ? 'Préparation' : s.phase === 'summary' ? 'Fermé' : hhmm(s.minute));
    set('#lvl', `${s.level}`);
    const xpk = s.level >= 25 ? 1 : s.xp / xpForLevel(s.level);
    const w = `${Math.round(xpk * 100)}%`;
    if (this.last.xpw !== w) {
      this.last.xpw = w;
      $('#xpbar').style.width = w;
    }
    const dk = `${Math.round(((s.minute - DAY_START) / (DAY_END - DAY_START)) * 100)}%`;
    if (this.last.dk !== dk) {
      this.last.dk = dk;
      $('#daybar').style.width = dk;
    }
    const pop = Math.round(s.reputation);
    set('#rep', String(pop));
    set('#repIco', popIcon(pop));
    const pw = `${pop}%`;
    if (this.last.pw !== pw) {
      this.last.pw = pw;
      $('#popbar').style.width = pw;
      $('#popbar').style.background = popColor(pop);
    }
    // Objectifs du jour et événement
    const gs = this.g.goalsStatus();
    const ev = EVENT_BY_ID[s.event];
    const gk = `${gs.filter((x) => x.done).length}/${gs.length}|${ev ? ev.id : ''}|${s.phase}`;
    if (this.last.goals !== gk) {
      this.last.goals = gk;
      const btn = $('#btnGoals');
      btn.hidden = !gs.length && !ev;
      if (this.sheet && this.sheet.kind === 'goals') this.refreshSheet();
      btn.innerHTML = `${gs.length ? `<span>🎯 ${gs.filter((x) => x.done).length}/${gs.length}</span>` : ''}${ev ? `<span class="ev">${ev.icon} ${esc(ev.name)}</span>` : ''}`;
    }
    // V1.6 : bouton des coffres (à partir du jour 3, jamais dans le tutoriel). Pastille = coffres encore dispo.
    const chestOk = !s.tutoMode && s.day >= REWARD_FROM_DAY && (s.phase === 'prep' || s.phase === 'open');
    const nChest = chestOk ? ['cashier', 'stocker', 'deco'].filter((k) => rewardStatus(s, k).ok).length : 0;
    const ck = chestOk ? `${nChest}` : 'off';
    if (this.last.chest !== ck) {
      this.last.chest = ck;
      const b = $('#btnChest');
      b.hidden = !chestOk;
      b.innerHTML = `🎁<span>Coffres</span>${nChest ? `<i>${nChest}</i>` : ''}`;
      b.classList.toggle('none', !nChest);
    }
    // Bulle « à la caisse »
    const p = this.g.player;
    const atReg = p.atRegister != null && !p.path.length && !this.g.checkout;
    const k = atReg ? 'reg' : 'no';
    if (this.last.atReg !== k) {
      this.last.atReg = k;
      $('#regPill').hidden = !atReg;
    }
    // Remonter la vue quand le panneau de caisse cache le bas du magasin
    const co = $('#checkout');
    let cover = 0;
    if (!co.hidden && co.classList.contains('show')) {
      const st = $('#stage').getBoundingClientRect();
      cover = Math.max(0, st.bottom - co.getBoundingClientRect().top);
    }
    this.r.cover = cover;
  }

  renderPhase() {
    const s = this.g.state;
    $('#openBtn').hidden = s.phase !== 'prep';
    this.renderHint();
  }

  renderHint() {
    const s = this.g.state;
    const text = TUTO[Math.min(s.tutorial, TUTO.length - 1)];
    const show = !!text && s.phase !== 'summary' && !(s.tutorial === 3 && s.phase === 'prep' && false);
    $('#hint').hidden = !show;
    if (show) $('#hint').textContent = text;
  }

  // ---------------------------------------------------------------- panneaux
  open(kind, data = {}) {
    if (kind === 'order') this.cart = {};
    this.sheet = { kind, data };
    this.openedAt = performance.now();
    $('#sheet').hidden = false;
    requestAnimationFrame(() => $('#sheet').classList.add('show'));
    this.refreshSheet();
    sfx('tick');
  }

  close() {
    this.sheet = null;
    $('#sheet').classList.remove('show');
    setTimeout(() => {
      if (!this.sheet) $('#sheet').hidden = true;
    }, 220);
  }

  refreshSheet() {
    if (!this.sheet) return;
    const { kind, data } = this.sheet;
    const html = {
      order: () => this.orderHtml(),
      prices: () => this.pricesHtml(),
      staff: () => this.staffHtml(),
      build: () => this.buildHtml(),
      shelf: () => this.shelfHtml(data.slot),
      buyShelf: () => this.buyShelfHtml(data.slot),
      zone: () => this.buildHtml(),
      menu: () => this.menuHtml(),
      pop: () => this.popHtml(),
      goals: () => this.goalsHtml(),
      chests: () => this.chestsHtml()
    }[kind];
    const body = $('#sheetBody');
    const scroll = body.scrollTop;
    body.innerHTML = html ? html() : '';
    body.scrollTop = scroll;
  }

  head(title, sub = '') {
    return `<div class="sh-head"><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div><button class="x" data-a="close" aria-label="Fermer">✕</button></div>`;
  }

  orderHtml() {
    const g = this.g;
    const s = g.state;
    let total = 0;
    let count = 0;
    for (const [id, n] of Object.entries(this.cart)) {
      total += cents(PRODUCT_BY_ID[id].cartonCost) * n;
      count += n;
    }
    const room = g.deliveryRoom();
    const rows = PRODUCTS.map((p) => {
      const owned = s.licences.includes(p.id);
      const n = this.cart[p.id] || 0;
      const stock = s.shelves.filter((x) => x.product === p.id).reduce((a, x) => a + x.qty, 0);
      if (!owned) {
        const locked = s.level < p.level;
        return `<div class="row locked">
          <img src="${iconUrl(p.id)}" alt="">
          <div class="info"><b>${esc(p.name)}</b><span>${esc(p.brand)}</span></div>
          ${locked ? `<span class="tag">Niveau ${p.level}</span>` : `<button class="buy" data-a="licence" data-id="${p.id}" ${s.coins < cents(p.licence) ? 'disabled' : ''}>Licence ${coinSvg}${money(cents(p.licence))}</button>`}
        </div>`;
      }
      return `<div class="row">
        <img src="${iconUrl(p.id)}" alt="">
        <div class="info"><b>${esc(p.name)}</b><span>Carton de ${p.qty} · ${coinSvg}${money(cents(p.cartonCost))}</span><span class="muted">En rayon : ${stock}</span></div>
        <div class="step"><button data-a="minus" data-id="${p.id}" ${n ? '' : 'disabled'} aria-label="Retirer">−</button><output>${n}</output><button data-a="plus" data-id="${p.id}" aria-label="Ajouter">+</button></div>
      </div>`;
    }).join('');
    return `${this.head('Commande fournisseur', `Place dans la réserve : ${Math.max(0, room)} carton${Math.max(0, room) > 1 ? 's' : ''} sur ${RESERVE_CAPACITY}`)}
      <div class="list">${rows}</div>
      <div class="sh-foot">
        <div class="total"><span>${count} carton${count > 1 ? 's' : ''}</span><b>${coinSvg}${money(total)}</b></div>
        <button class="primary" data-a="order" ${!count || total > s.coins || count > room ? 'disabled' : ''}>Commander</button>
      </div>`;
  }

  pricesHtml() {
    const s = this.g.state;
    const rows = s.licences.map((id) => {
      const p = PRODUCT_BY_ID[id];
      return this.priceRow(p);
    }).join('');
    const idx = this.g.priceIndex();
    const tone = idx <= 0.95 ? ['good', 'Bon marché : la réputation monte, marges serrées'] : idx <= 1.05 ? ['ok', 'Prix justes : réputation stable'] : idx <= 1.2 ? ['warn', 'Plutôt cher : la réputation baisse doucement'] : ['bad', 'Trop cher : la réputation chute, les clients fuient'];
    return `${this.head('Prix de vente', 'Impossible de vendre sous le prix d’achat.')}
      <div class="index"><div><small>Indice prix du magasin</small><b>${idx.toFixed(2).replace('.', ',')}</b></div><span class="pill ${tone[0]}">${tone[1]}</span></div>
      <div class="list">${rows}</div>`;
  }

  priceRow(p) {
    const s = this.g.state;
    const price = s.prices[p.id];
    const market = cents(p.market);
    const ratio = price / market;
    const unitCost = cents(p.cartonCost) / p.qty;
    const margin = Math.round(price - unitCost);
    const mood = ratio <= 1 ? ['good', 'Prix attractif'] : ratio <= 1.15 ? ['ok', 'Un peu cher'] : ratio <= 1.3 ? ['warn', 'Cher'] : ['bad', 'Trop cher'];
    return `<div class="row">
      <img src="${iconUrl(p.id)}" alt="">
      <div class="info"><b>${esc(p.name)}</b><span>Conseillé ${money(market)} · marge ${money(margin)}</span><span class="pill ${mood[0]}">${mood[1]}</span></div>
      <div class="step price"><button data-a="pminus" data-id="${p.id}" ${price <= this.g.minPrice(p.id) ? 'disabled' : ''} aria-label="Baisser">−</button><output>${money(price)}</output><button data-a="pplus" data-id="${p.id}" aria-label="Monter">+</button></div>
    </div>`;
  }

  staffHtml() {
    const g = this.g;
    const s = g.state;
    // V1.6 : deux onglets. « Mon équipe » = le carnet (tous les employés connus) ; « Candidats » = la semaine.
    const tab = this.staffTab || ((s.tutoMode || !(s.roster || []).length) ? 'cands' : 'team');
    const tabs = `<div class="tabs" role="tablist"><button role="tab" class="${tab === 'team' ? 'on' : ''}" data-a="staffTab" data-id="team">👥 Mon équipe</button><button role="tab" class="${tab === 'cands' ? 'on' : ''}" data-a="staffTab" data-id="cands">📋 Candidats</button></div>`;
    if (tab === 'team') return `${this.head('Personnel', 'Qui travaille à quel poste. Changer en pleine journée ne coûte rien.')}${tabs}${this.teamHtml()}`;
    const stars = (n) => `<span class="stars" aria-label="Niveau ${n} sur 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
    const stats = (kind, level) => {
      if (kind === 'cashier') {
        const lv = CASHIER_LEVELS[level - 1];
        return `${lv.secPerItem.toFixed(1).replace('.', ',')} s / article · ${Math.round(lv.error * 100)} % d’erreurs`;
      }
      const lv = STOCKER_LEVELS[level - 1];
      return `Vitesse ${Math.round((lv.speed / 1.8) * 100)} % · range ${Math.round(1 / lv.perUnit)} articles/s · complète un rayon sous ${Math.round(lv.refill * 100)} %`;
    };
    const team = [];
    for (const c of s.staff.cashiers) team.push({ kind: 'cashier', m: c });
    if (s.staff.stocker) team.push({ kind: 'stocker', m: s.staff.stocker });
    const teamHtml = team.length ? team.map(({ kind, m }) => {
      const cost = g.staffCost(kind, m.level);
      return `<div class="card">
        <div class="avatar ${kind}" aria-hidden="true">${kind === 'cashier' ? '🧑‍💼' : '👷'}</div>
        <div class="info"><b>${esc(m.name)} ${stars(m.level)}</b><span>${STAFF[kind].label} · ${stats(kind, m.level)}</span><span class="pill ${m.days <= 1 ? 'warn' : 'good'}">Encore ${m.days} jour${m.days > 1 ? 's' : ''}</span></div>
        <button class="buy" data-a="extend" data-kind="${kind}" data-id="${m.id}" ${s.coins < cost ? 'disabled' : ''}>+7 jours<small>${coinSvg}${money(cost)}</small></button>
      </div>`;
    }).join('') : '<p class="empty">Personne pour l’instant : tu fais tout toi-même.</p>';
    const cands = g.ensureCandidates();
    const section = (kind) => {
      const d = STAFF[kind];
      if (s.level < d.level) return `<h3 class="sec">${d.label}s</h3><p class="empty">Disponible au niveau ${d.level}.</p>`;
      const full = kind === 'cashier' ? s.staff.cashiers.length >= s.registers.length : !!s.staff.stocker;
      const list = cands[kind].map((c) => {
        const cost = g.staffCost(kind, c.level);
        return `<div class="card">
          <div class="avatar ${kind}" aria-hidden="true">${kind === 'cashier' ? '🧑‍💼' : '👷'}</div>
          <div class="info"><b>${esc(c.name)} ${stars(c.level)}</b><span>${stats(kind, c.level)}</span></div>
          <button class="buy" data-a="hire" data-kind="${kind}" data-id="${c.id}" ${full || s.coins < cost ? 'disabled' : ''}>Embaucher<small>${coinSvg}${money(cost)}</small></button>
        </div>`;
      }).join('') || '<p class="empty">Plus de candidat cette semaine.</p>';
      const note = full ? `<p class="empty">${kind === 'cashier' ? 'Une personne par caisse au maximum.' : 'Un magasinier à la fois.'}</p>` : '';
      return `<h3 class="sec">${d.label}s · candidats de la semaine</h3>${note}<div class="list">${list}</div>`;
    };
    return `${this.head('Personnel', 'Contrats de 7 journées payés d’avance. Plus d’étoiles : plus rapide, moins d’erreurs, plus cher.')}${tabs}
      <h3 class="sec">Ton équipe</h3><div class="list">${teamHtml}</div>
      ${section('cashier')}${section('stocker')}
      <div class="explain"><b>👷 Comment travaille le magasinier ?</b>
        <p>À tous les niveaux, il range toujours chaque produit dans son rayon : l’eau avec l’eau, les pâtes avec les pâtes. Il ne prend un carton que s’il a de la place dans le bon rayon, et il va chercher un carton même coincé sous un autre.</p>
        <p>Les étoiles changent seulement sa vitesse et son initiative : ⭐ il ne s’occupe d’un rayon que lorsqu’il est vide ou presque (sous 40 %) et réfléchit un moment entre deux cartons ; ⭐⭐⭐⭐⭐ il complète les rayons dès qu’il y manque quelques articles et enchaîne sans attendre.</p>
        <p>Une étagère neuve sans produit reçoit un produit qui n’a pas encore de rayon. Pour changer le produit d’un rayon, c’est toi qui décides : vide-le et range-y un autre carton.</p></div>
      <p class="credits">Nouveaux candidats chaque semaine. Les meilleurs profils arrivent quand ton magasin monte de niveau.</p>`;
  }

  // V1.6 : « Mon équipe ». Tous les employés connus (embauchés ou gagnés en coffre), étoiles, poste, salaire.
  teamHtml() {
    const g = this.g;
    const s = g.state;
    const stars = (n) => `<span class="stars" aria-label="Niveau ${n} sur 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
    const temp = g.tempActive() ? s.temp : null;
    const cashMap = g.cashierAssignments();
    const regOf = (id) => { for (const [r, c] of cashMap) if (c.id === id) return r; return null; };
    const stockerNow = g.dutyStocker();
    const cards = [];
    for (const kind of ['cashier', 'stocker']) {
      const d = STAFF[kind];
      const people = [];
      if (temp && temp.kind === kind) people.push({ m: temp.member, temp: true });
      for (const m of (s.roster || []).filter((x) => x.kind === kind)) if (!(temp && temp.member.id === m.id)) people.push({ m });
      cards.push(`<h3 class="sec">${d.label}s</h3>`);
      if (s.level < d.level) { cards.push(`<p class="empty">Poste débloqué au niveau ${d.level}.</p>`); continue; }
      if (!people.length) { cards.push('<p class="empty">Personne pour l’instant. Embauche dans « Candidats », ou ouvre un coffre 🎁.</p>'); continue; }
      const list = people.sort((a, b) => (b.temp ? 1 : 0) - (a.temp ? 1 : 0) || b.m.level - a.m.level).map(({ m, temp: isTemp }) => {
        const contract = g.contracted(kind).find((c) => c.id === m.id);
        const wage = `${coinSvg}${money(g.staffCost(kind, m.level))} / semaine`;
        let status;
        let btns = '';
        const working = kind === 'cashier' ? regOf(m.id) != null : stockerNow && stockerNow.id === m.id;
        if (isTemp) {
          status = `<span class="pill temp">Intérimaire jusqu’à 20 h · gratuit</span>`;
          const team = g.contracted(kind);
          const opts = [];
          if (team.length < g.postsFor(kind) && !(temp.onDuty && temp.replaces == null)) opts.push(`<button class="ghost sm" data-a="tempDuty" data-id="free">Prendre le poste libre</button>`);
          for (const c of team) if (!(temp.onDuty && temp.replaces === c.id)) opts.push(`<button class="ghost sm" data-a="tempDuty" data-id="${c.id}">À la place de ${esc(c.name)}</button>`);
          if (temp.onDuty) opts.push(`<button class="ghost sm" data-a="tempDuty" data-id="rest">Au repos</button>`);
          btns = opts.join('');
        } else if (contract) {
          status = working ? `<span class="pill good">Au travail · encore ${contract.days} jour${contract.days > 1 ? 's' : ''}</span>` : `<span class="pill ok">Au repos aujourd’hui · revient demain (contrat : ${contract.days} j)</span>`;
          if (!working && temp && temp.kind === kind && temp.replaces === m.id) btns += `<button class="ghost sm" data-a="tempDuty" data-id="rest">Le remettre au poste</button>`;
          btns += `<button class="buy sm" data-a="extend" data-kind="${kind}" data-id="${m.id}" ${s.coins < g.staffCost(kind, m.level) ? 'disabled' : ''}>+7 jours · ${coinSvg}${money(g.staffCost(kind, m.level))}</button>`;
        } else {
          status = `<span class="pill">Libre · ${m.from === 'coffre' ? 'gagné dans un coffre' : 'ancien employé'}</span>`;
          const full = g.contracted(kind).length >= g.postsFor(kind);
          btns = `<button class="buy sm" data-a="hireKnown" data-kind="${kind}" data-id="${m.id}" ${full || s.coins < g.staffCost(kind, m.level) ? 'disabled' : ''}>Embaucher 7 jours · ${coinSvg}${money(g.staffCost(kind, m.level))}</button>${full ? `<small class="why">${kind === 'cashier' ? 'Une personne par caisse : attends la fin d’un contrat.' : 'Un magasinier à la fois.'}</small>` : ''}`;
        }
        if (kind === 'cashier' && working && s.registers.length > 1) {
          const r = regOf(m.id);
          btns += s.registers.filter((x) => x !== r && x !== g.player.atRegister).map((x) => `<button class="ghost sm" data-a="toReg" data-id="${m.id}" data-reg="${x}">Aller en caisse ${x}</button>`).join('');
        }
        const where = kind === 'cashier' && working ? ` · caisse ${regOf(m.id)}` : '';
        return `<div class="card team ${isTemp ? 'is-temp' : ''}">
          <div class="avatar ${kind}" aria-hidden="true">${kind === 'cashier' ? '🧑‍💼' : '👷'}</div>
          <div class="info"><b>${esc(m.name)} ${stars(m.level)}</b><span>${d.label}${where} · ${wage}</span>${status}</div>
          ${btns ? `<div class="tbtns">${btns}</div>` : ''}
        </div>`;
      }).join('');
      cards.push(`<div class="list">${list}</div>`);
    }
    return `${cards.join('')}<p class="credits">L’intérimaire gagné dans un coffre travaille gratuitement jusqu’à 20 h, puis rejoint ce carnet : tu pourras l’embaucher au prix normal.</p>`;
  }

  // V1.6 : coffres du jour (pub simulée). Le joueur choisit ; s'il ne touche à rien, aucune pub.
  chestsHtml() {
    const g = this.g;
    const s = g.state;
    const odds = `<div class="odds" aria-label="Chances">${CHEST_ODDS.map((p, i) => `<span><b>${i + 1}★</b>${p} %</span>`).join('')}</div>`;
    const pity = Math.max(0, PITY_AFTER - ((s.rewards && s.rewards.pity) || 0));
    const pityTxt = pity === 0 ? '<b>Le prochain coffre d’employé donne forcément un 4★ ou un 5★.</b>' : `Garantie : 4★ ou 5★ au plus tard dans ${pity + 1} coffre${pity + 1 > 1 ? 's' : ''} d’employé.`;
    const card = (kind, ico, title, txt, extra = '') => {
      const st = rewardStatus(s, kind);
      return `<div class="chest-card ${st.ok ? '' : 'off'}">
        <div class="chest-ico" aria-hidden="true">${ico}</div>
        <div class="info"><b>${title}</b><span>${txt}</span>${extra}${st.ok ? '' : `<span class="pill">${esc(st.reason)}</span>`}</div>
        <button class="buy" data-a="chest" data-id="${kind}" ${st.ok ? '' : 'disabled'}>${settings.simAds ? '📺 Pub<small>puis ouvrir</small>' : 'Ouvrir<small>(pubs coupées)</small>'}</button>
      </div>`;
    };
    const owned = (s.deco && s.deco.owned.length) || 0;
    return `${this.head('🎁 Coffres du jour', 'Chaque coffre : 1 fois par journée de jeu, en échange d’une pub. C’est toi qui choisis.')}
      <div class="list">
        ${card('cashier', '🧑‍💼', 'Coffre caissier', 'Un caissier intérimaire de 1 à 5★, gratuit jusqu’à 20 h.', odds)}
        ${card('stocker', '👷', 'Coffre magasinier', 'Un magasinier intérimaire de 1 à 5★, gratuit jusqu’à 20 h.', odds)}
        ${card('deco', '🪴', 'Coffre déco', `Une décoration pour ton magasin, sans effet sur le jeu (${owned}/${DECOS.length}).`)}
      </div>
      <p class="credits">${pityTxt} S’il est meilleur que ton employé, l’intérimaire le remplace tout de suite ; ton employé garde son contrat et revient demain. Ensuite, il rejoint « Mon équipe ».</p>
      <p class="credits">${settings.simAds ? 'Bêta : les pubs sont simulées (aucune vraie pub). Réglage dans le menu ☰.' : 'Pubs simulées coupées dans le menu ☰ : les coffres s’ouvrent directement.'} Pas envie ? Ferme simplement : aucune pub.</p>`;
  }

  // Pub récompensée (simulée) puis récompense. Refus ou pub fermée avant la fin : aucune récompense, aucune autre pub.
  async watchFor(kind) {
    const g = this.g;
    if (this.adBusy) return null;
    const st = rewardStatus(g.state, kind);
    if (!st.ok) { this.toast(st.reason, 'warn'); return null; }
    if (settings.simAds) {
      this.adBusy = true;
      const wasPaused = g.paused;
      g.paused = true;
      let r;
      try { r = await showRewarded(kind); } finally { g.paused = wasPaused; this.adBusy = false; }
      if (!r.watched) {
        if (!g.state.rewards) g.state.rewards = {};
        g.state.rewards.lastAdAt = Date.now();
        this.toast('Pub fermée avant la fin : pas de récompense', 'warn');
        return null;
      }
    }
    const res = g.claimReward(kind, { ad: settings.simAds });
    if (!res.ok) { this.toast(res.reason || 'Indisponible', 'warn'); return null; }
    return res;
  }

  // Animation d'ouverture du coffre (CSS : transform et opacité seulement, fluide sur téléphone).
  showChest(res) {
    this.close();
    this.modals = [{ kind: 'chest', data: res }, ...(this.modalOpen ? [this.modalOpen] : []), ...(this.modals || [])];
    this.nextModal();
    sfx('level');
    haptic(30);
  }

  buildHtml() {
    const g = this.g;
    const s = g.state;
    const freeSlots = s.zones.length * 7 - s.shelves.filter((x) => s.zones.includes(x.slot[0])).length;
    const items = [];
    const freeId = g.firstFreeSlot();
    items.push(`<div class="card"><div class="ico">🗄️</div><div class="info"><b>Nouvelle étagère</b><span>${freeSlots ? `Touche « Placer », ou un « + » sur le plan pour choisir l’endroit. ${freeSlots} emplacement${freeSlots > 1 ? 's' : ''} libre${freeSlots > 1 ? 's' : ''}.` : 'Aucun emplacement libre : agrandis le magasin.'}</span></div>
      ${freeId ? `<button class="buy place" data-a="shelf" data-id="${freeId}" ${s.coins < g.nextShelfCost() ? 'disabled' : ''}>Placer · ${coinSvg}${money(g.nextShelfCost())}</button>` : `<span class="tag">${coinSvg}${money(g.nextShelfCost())}</span>`}</div>`);
    const nFree = g.freeSlots().length;
    items.push(`<div class="card"><div class="ico">↔️</div><div class="info"><b>Déplacer une étagère</b><span>${nFree ? 'Gratuit. Touche l’étagère, puis un « + » libre : le produit suit.' : 'Aucun « + » libre pour l’instant.'}</span></div>
      <button class="buy" data-a="move" ${nFree && s.shelves.length ? '' : 'disabled'}>Déplacer</button></div>`);
    for (const z of ZONES) {
      if (!z.cost) continue;
      const owned = s.zones.includes(z.id);
      const locked = s.level < z.level;
      items.push(`<div class="card"><div class="ico">🧱</div><div class="info"><b>Agrandissement · ${z.label}</b><span>7 emplacements d’étagères en plus.</span>${locked && !owned ? `<span class="pill">Niveau ${z.level}</span>` : ''}</div>
        ${owned ? '<span class="pill good">Ouvert</span>' : `<button class="buy" data-a="zone" data-id="${z.id}" ${locked || s.coins < cents(z.cost) ? 'disabled' : ''}>${coinSvg}${money(cents(z.cost))}</button>`}</div>`);
    }
    for (const r of REGISTERS) {
      if (!r.cost) continue;
      const owned = s.registers.includes(r.id);
      const locked = s.level < r.level;
      items.push(`<div class="card"><div class="ico">🧾</div><div class="info"><b>Deuxième caisse</b><span>Deux files d’attente : idéal avec une caissière.</span>${locked && !owned ? `<span class="pill">Niveau ${r.level}</span>` : ''}</div>
        ${owned ? '<span class="pill good">Installée</span>' : `<button class="buy" data-a="register" data-id="${r.id}" ${locked || s.coins < cents(r.cost) ? 'disabled' : ''}>${coinSvg}${money(cents(r.cost))}</button>`}</div>`);
    }
    return `${this.head('Aménager', `Charges du jour : ${money(cents(dailyCharges(s)))} (loyer et électricité)`)}<div class="list">${items.join('')}</div>${this.decoHtml()}`;
  }

  // V1.6 : décorations gagnées dans le coffre déco. Sans aucun effet sur le jeu.
  decoHtml() {
    const s = this.g.state;
    const d = s.deco || { owned: [], placed: {} };
    const rows = Object.entries(DECO_SLOTS).map(([slot, def]) => {
      const mine = d.owned.filter((id) => DECO_BY_ID[id] && DECO_BY_ID[id].slot === slot);
      const total = DECOS.filter((x) => x.slot === slot).length;
      const chips = mine.map((id) => {
        const x = DECO_BY_ID[id];
        return `<button class="dchip ${d.placed[slot] === id ? 'on' : ''}" data-a="deco" data-slot="${slot}" data-id="${id}"><i style="background:linear-gradient(135deg,${x.colors[0]},${x.colors[1]})"></i>${esc(x.name)}</button>`;
      }).join('');
      return `<div class="card deco"><div class="ico">${def.icon}</div><div class="info"><b>${def.label} · ${mine.length}/${total}</b>
        ${mine.length ? `<div class="dchips"><button class="dchip ${d.placed[slot] ? '' : 'on'}" data-a="deco" data-slot="${slot}" data-id="">D’origine</button>${chips}</div>` : '<span>À gagner dans le coffre déco 🎁</span>'}</div></div>`;
    }).join('');
    return `<h3 class="sec">🎨 Décorations</h3><p class="empty">Pour le plaisir des yeux : aucun effet sur les clients ni sur la popularité.</p><div class="list">${rows}</div>`;
  }

  popHtml() {
    const s = this.g.state;
    const pop = Math.round(s.reputation);
    return `${this.head('Popularité du magasin', `${popIcon(pop)} ${pop} / 100 · ${popLabel(pop)}`)}
      <div class="popgauge"><span style="width:${pop}%;background:${popColor(pop)}"></span></div>
      <p class="empty">Plus ta supérette est populaire, plus il y a de clients (jusqu’à ×1,45 au sommet, ×0,55 au plus bas). Elle bouge tous les jours.</p>
      <h3 class="sec">Ce qui la fait monter ou baisser</h3>
      <div class="poprows">
        <div class="poprow"><span>🏷️ Prix bas (sous le prix conseillé)</span><b class="pos">↑</b></div>
        <div class="poprow"><span>📦 Choix de produits et rayons bien remplis</span><b class="pos">↑</b></div>
        <div class="poprow"><span>👥 Personnel de qualité (étoiles)</span><b class="pos">↑</b></div>
        <div class="poprow"><span>😊 Clients bien servis, sans attente</span><b class="pos">↑</b></div>
        <div class="poprow"><span>🎁 Erreur de caisse en faveur du client (trop rendu, pas assez encaissé)</span><b class="pos">↑</b></div>
        <div class="poprow"><span>😠 Client qui remarque qu’il a payé trop</span><b class="neg">↓↓</b></div>
        <div class="poprow"><span>❓ Demandes non satisfaites, file trop longue</span><b class="neg">↓</b></div>
      </div>
      <h3 class="sec">Aujourd’hui</h3>${popRows(s.stats.rep) || '<p class="empty">Rien de notable pour l’instant.</p>'}`;
  }

  goalsHtml() {
    const s = this.g.state;
    const ev = EVENT_BY_ID[s.event];
    const gs = this.g.goalsStatus();
    const rows = gs.map((x) => {
      const pct = x.max ? (x.failed ? 0 : 100) : Math.min(100, Math.round((x.value / Math.max(0.1, x.target)) * 100));
      const state = x.done ? '<span class="pill good">Réussi</span>' : x.failed ? '<span class="pill bad">Raté</span>' : x.max ? '<span class="pill ok">Jugé à 20:00</span>' : `<span class="pill">${String(x.value).replace('.', ',')} / ${String(x.target).replace('.', ',')}</span>`;
      return `<div class="card goal ${x.done ? 'done' : ''}"><div class="ico">${x.icon}</div><div class="info"><b>${esc(x.label)}</b>${state}<div class="gauge mini"><span style="width:${pct}%"></span></div></div><span class="tag">+${coinSvg}${money(x.reward)}</span></div>`;
    }).join('');
    return `${this.head('Aujourd’hui dans le quartier', `Jour ${s.day}`)}
      ${ev ? `<div class="event"><span>${ev.icon}</span><div><b>${esc(ev.name)}</b><small>${esc(ev.desc)}</small></div></div>` : '<p class="empty">Journée calme : pas d’événement dans le quartier.</p>'}
      <h3 class="sec">🎯 Objectifs du jour</h3>
      ${rows ? `<div class="list">${rows}</div><p class="credits">Les primes sont versées au bilan de fin de journée.</p>` : `<p class="empty">Les objectifs du jour arrivent au jour ${GOALS_FROM_DAY}.</p>`}`;
  }

  renderMove() {
    const mv = this.g.moving;
    const bar = $('#moveBar');
    bar.hidden = !mv;
    $('#app').classList.toggle('moving', !!mv);
    if (!mv) return;
    const sh = mv.from && this.g.state.shelves.find((x) => x.slot === mv.from);
    const name = sh && sh.product ? `Rayon ${PRODUCT_BY_ID[sh.product].name}` : 'Étagère';
    $('#moveText').textContent = mv.from ? `${name} : touche un « + » libre pour l’y poser` : 'Touche l’étagère à déplacer';
  }

  shelfHtml(slotId) {
    const s = this.g.state;
    const sh = s.shelves.find((x) => x.slot === slotId);
    if (!sh) return this.head('Étagère');
    const free = this.g.freeSlots().length;
    const moveBtn = `<button class="movebtn" data-a="move" data-id="${slotId}" ${free ? '' : 'disabled'}><span>↔️</span><b>Déplacer cette étagère</b><small>${free ? 'Gratuit · le produit suit' : 'Aucun « + » libre : agrandis le magasin'}</small></button>`;
    if (!sh.product) {
      return `${this.head('Étagère libre')}<p class="empty">Prends un carton dans la réserve puis touche cette étagère pour y ranger le produit.</p>${moveBtn}`;
    }
    const p = PRODUCT_BY_ID[sh.product];
    return `${this.head(`Rayon ${esc(p.name)}`, `${sh.qty} / ${SHELF_CAPACITY} en rayon`)}
      <div class="gauge"><span style="width:${Math.round((sh.qty / SHELF_CAPACITY) * 100)}%"></span></div>
      <div class="list">${this.priceRow(p)}</div>
      ${sh.qty === 0 ? '<p class="empty">Rayon vide : toi, tu peux y ranger un carton d’un autre produit pour le réaffecter. Le magasinier, lui, n’y remettra que ce produit.</p>' : ''}
      ${moveBtn}`;
  }

  buyShelfHtml(slotId) {
    const g = this.g;
    const cost = g.nextShelfCost();
    return `${this.head('Nouvelle étagère', `${SHELF_CAPACITY} articles · un seul produit par étagère`)}
      <p class="empty">Installer une étagère ici ?</p>
      <div class="sh-foot"><div class="total"><span>Prix</span><b>${coinSvg}${money(cost)}</b></div>
      <button class="primary" data-a="shelf" data-id="${slotId}" ${g.state.coins < cost ? 'disabled' : ''}>Installer</button></div>`;
  }

  // V1.5 : ligne « Tutoriel » du menu. Hors tutoriel : jouer / reprendre / recommencer (la partie est gardée).
  // Pendant le tutoriel : quitter (retour à sa partie) ou recommencer le tutoriel.
  tutoMenuHtml() {
    if (this.hooks.tutoMode) {
      return `<div class="row tutorow"><div class="info"><b>📘 Tutoriel en cours</b><span>Partie d’essai : ta vraie partie est gardée de côté.</span></div>
        <div class="btns"><button class="ghost" data-a="tutoRestart">Recommencer</button><button class="primary" data-a="tutoQuit">Quitter</button></div></div>`;
    }
    const step = this.hooks.tutoStep ? this.hooks.tutoStep() : null;
    const resume = step != null && step > 0;
    return `<div class="row tutorow"><div class="info"><b>📘 Tutoriel</b><span>Apprendre le jeu en 2 journées. Ta partie n’est pas effacée.</span></div>
      <div class="btns">${resume ? '<button class="ghost" data-a="tutoRestart">Recommencer</button><button class="primary" data-a="tutoResume">Reprendre</button>' : '<button class="primary" data-a="tutoPlay">Jouer</button>'}</div></div>`;
  }

  menuHtml() {
    const s = this.g.state;
    const tuto = this.hooks.tutoMode;
    return `${this.head(tuto ? 'Tutoriel · partie d’essai' : 'Ma P’tite Supérette', tuto ? `Jour ${s.day} du tutoriel` : `Jour ${s.day} · ${s.totals.served} clients servis au total`)}
      <div class="list">
        ${this.tutoMenuHtml()}
        <div class="row"><div class="info"><b>Sons</b><span>Bips, caisse, livraisons</span></div><button class="toggle ${settings.sound ? 'on' : ''}" data-a="sound">${settings.sound ? 'Activés' : 'Coupés'}</button></div>
        <div class="row"><div class="info"><b>Vibrations</b><span>Rayon vide, scan, passage de niveau</span></div><button class="toggle ${settings.haptics ? 'on' : ''}" data-a="haptics">${settings.haptics ? 'Activées' : 'Coupées'}</button></div>
        <div class="row"><div class="info"><b>Simuler les pubs (bêta)</b><span>Fausses pubs de 3 s pour ressentir le rythme. Aucune vraie pub.</span></div><button class="toggle ${settings.simAds ? 'on' : ''}" data-a="simAds">${settings.simAds ? 'Activé' : 'Coupé'}</button></div>
        ${tuto ? '' : '<div class="row"><div class="info"><b>Nouvelle partie</b><span>Recommencer au jour 1 (sons et vibrations gardés)</span></div><button class="danger" data-a="reset">Recommencer</button></div>'}
      </div>
      <p class="credits">Version <b id="menuVersion">v${esc(BUILD_VERSION)}</b>${this.updateVersion ? ` · <button class="linkbtn" data-a="update">nouvelle version v${esc(this.updateVersion)} : mettre à jour</button>` : ''} · tout est dessiné par le code, sans achat ni diamant.</p>`;
  }

  onSheetClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const g = this.g;
    const id = b.dataset.id;
    let res = null;
    switch (b.dataset.a) {
      case 'close': return this.close();
      case 'plus': this.cart[id] = (this.cart[id] || 0) + 1; sfx('tick'); break;
      case 'minus': this.cart[id] = Math.max(0, (this.cart[id] || 0) - 1); sfx('tick'); break;
      case 'order':
        res = g.order(this.cart);
        if (res.ok) {
          this.toast(`Commande passée : ${res.count} carton${res.count > 1 ? 's' : ''} en route 🚚`);
          this.close();
          this.renderHint();
          return;
        }
        break;
      case 'licence': res = g.buyLicence(id); if (res.ok) this.toast(`Licence ${PRODUCT_BY_ID[id].name} achetée`); break;
      case 'pminus': g.setPrice(id, g.state.prices[id] - 10); sfx('tick'); break;
      case 'pplus': g.setPrice(id, g.state.prices[id] + 10); sfx('tick'); break;
      case 'hire': res = g.hire(b.dataset.kind, Number(id)); if (res.ok) this.toast(`${res.member.name} rejoint l’équipe pour 7 jours`); break;
      case 'extend': res = g.extend(b.dataset.kind, Number(id)); if (res.ok) this.toast('Contrat prolongé de 7 jours'); break;
      case 'staffTab': this.staffTab = id; sfx('tick'); break;
      case 'hireKnown': res = g.hireKnown(b.dataset.kind, Number(id)); if (res.ok) this.toast(`${res.member.name} rejoint l’équipe pour 7 jours`); break;
      case 'tempDuty': res = g.setTempDuty(id === 'rest' ? null : id === 'free' ? 'free' : Number(id)); if (res.ok) sfx('tick'); break;
      case 'toReg': res = g.setCashierRegister(Number(id), Number(b.dataset.reg)); if (res.ok) sfx('tick'); break;
      case 'deco': res = g.placeDeco(b.dataset.slot, id || null); if (res.ok) sfx('tick'); break;
      case 'chest':
        this.watchFor(id).then((r) => { if (r) this.showChest(r); else this.refreshSheet(); });
        return;
      case 'simAds': settings.simAds = !settings.simAds; this.hooks.saveSettings(); break;
      case 'zone': res = g.buyZone(id); if (res.ok) this.toast('Travaux terminés : nouvelle allée !'); break;
      case 'register': res = g.buyRegister(id); if (res.ok) this.toast('Caisse 2 installée'); break;
      case 'shelf': res = g.buyShelf(id); if (res.ok) { this.toast('Étagère installée'); this.close(); return; } break;
      case 'move':
        g.startMove(id || null);
        this.close();
        return;
      case 'sound': settings.sound = !settings.sound; this.hooks.saveSettings(); break;
      case 'haptics': settings.haptics = !settings.haptics; this.hooks.saveSettings(); if (settings.haptics) haptic(30); break;
      case 'reset':
        // V1.3 : confirmation dans une fenêtre claire avant d'effacer (voir onModalClick).
        this.close();
        // Ouverte tout de suite, même si une autre fenêtre attendait (elle reviendra après « Annuler »).
        this.modals = [{ kind: 'reset' }, ...(this.modalOpen ? [this.modalOpen] : []), ...(this.modals || [])];
        this.nextModal();
        return;
      case 'update': return this.hooks.update();
      case 'tutoPlay': this.close(); return this.hooks.startTutorial(true);
      case 'tutoRestart': this.close(); return this.hooks.startTutorial(true);
      case 'tutoResume': this.close(); return this.hooks.startTutorial(false);
      case 'tutoQuit': this.close(); return this.askQuitTutorial();
      default: break;
    }
    if (res && !res.ok && res.reason) {
      this.toast(res.reason, 'warn');
      sfx('error');
    }
    this.refreshSheet();
  }

  // ---------------------------------------------------------------- caisse
  renderCheckout() {
    const co = this.g.checkout;
    const box = $('#checkout');
    if (!co) {
      box.classList.remove('show');
      this.coKey = null;
      setTimeout(() => {
        if (!this.g.checkout) box.hidden = true;
      }, 200);
      return;
    }
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
    const g = this.g;
    const scanned = co.items.filter((x) => x.scanned);
    const sub = scanned.reduce((n, x) => n + x.price, 0);
    const fresh = this.coKey !== co.customerId;
    this.coKey = co.customerId;
    const belt = co.items.map((it) => `<button class="item ${it.scanned ? 'done' : ''} ${fresh ? 'enter' : ''}" data-a="scan" data-i="${it.i}" ${it.scanned ? 'disabled' : ''} aria-label="Scanner ${esc(PRODUCT_BY_ID[it.product].name)}"><img src="${iconUrl(it.product, 64)}" alt=""><span>${money(it.price)}</span></button>`).join('');
    let pay = '';
    if (co.step === 'scan') {
      pay = '<p class="co-help">Touche chaque article pour le scanner</p>';
    } else if (co.step === 'cash') {
      const due = g.changeDue();
      const given = g.changeGiven();
      const left = due - given;
      pay = `<div class="cash">
        <div class="cash-top"><div><small>Le client donne</small><b class="bill">${money(co.paidWith)}</b></div><div><small>À rendre</small><b>${money(due)}</b></div><div class="${left < 0 ? 'over' : left === 0 ? 'ok' : ''}"><small>Rendu</small><b>${money(given)}</b></div></div>
        <div class="money">${CHANGE_MONEY.map((v) => `<button class="${v >= 5 ? 'note' : 'piece'} v${String(v).replace('.', '_')}" data-a="give" data-v="${cents(v)}">${v >= 1 ? v : money(cents(v))}</button>`).join('')}</div>
        <div class="co-actions"><button data-a="undo" ${given ? '' : 'disabled'}>Annuler</button><button class="primary" data-a="cash" ${given || due === 0 ? '' : 'disabled'}>Valider</button></div>
      </div>`;
    } else if (co.step === 'card') {
      // V1.5 : on tape le montant comme on le lit, avec la virgule (« 1,60 »), 999,99 au plus.
      const typed = co.card || '0';
      pay = `<div class="card-pay"><div class="terminal"><small>Paiement par carte · tape ${money(co.total)} (avec la virgule)</small><b>${esc(typed)}</b></div>
        <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => `<button data-a="key" data-k="${k}" aria-label="${k === 'del' ? 'Effacer' : k === ',' ? 'Virgule' : k}">${k === 'del' ? '⌫' : k}</button>`).join('')}<button data-a="key" data-k="ok" class="primary okkey">OK</button></div></div>`;
    } else if (co.step === 'exact') {
      pay = `<div class="exact"><p>Le client paie l’appoint : <b>${money(co.total)}</b></p><button class="primary" data-a="exact">Encaisser</button></div>`;
    }
    box.innerHTML = `<div class="co-head"><div><small>Caisse ${co.regId} · ${co.items.length} article${co.items.length > 1 ? 's' : ''}</small><b class="screen">${money(co.step === 'scan' ? sub : co.total)}</b></div><button class="leave" data-a="leave">Quitter la caisse</button></div>
      <div class="belt">${belt}</div>${pay}`;
  }

  tickCheckout() {
    /* rien d'animé pour l'instant : le rendu est piloté par les actions */
  }

  onCheckoutClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const g = this.g;
    switch (b.dataset.a) {
      case 'scan': g.scan(parseInt(b.dataset.i, 10)); break;
      case 'give': g.giveChange(parseInt(b.dataset.v, 10)); break;
      case 'undo': g.undoChange(); sfx('tick'); break;
      case 'cash': {
        const r = g.validateCash();
        if (r.ok && r.refused) this.toast(`Il manque ${money(-r.excess)} : le client refuse de payer et part furieux 😡`, 'warn');
        else if (r.ok && r.excess > 0) this.toast(`Tu as rendu ${money(r.excess)} de trop`, 'warn');
        else if (r.ok && r.excess < 0) this.toast(r.noticed ? `Il manque ${money(-r.excess)} : le client a remarqué 😠` : `Il manquait ${money(-r.excess)}… personne n’a rien vu`, 'warn');
        else if (r.ok) this.toast('Monnaie parfaite ✨');
        break;
      }
      case 'exact': g.validateExact(); break;
      case 'key': {
        const r = g.cardKey(b.dataset.k);
        if (r.ok && r.refused) this.toast(`${money(r.diff)} de trop : le client refuse de payer et part furieux 😡`, 'warn');
        else if (r.ok && r.diff > 0) this.toast(r.noticed ? `Client facturé ${money(r.diff)} de trop : il a remarqué 😠` : `Client facturé ${money(r.diff)} de trop… ni vu ni connu`, 'warn');
        if (r.ok && r.diff < 0) this.toast(`Tu as encaissé ${money(-r.diff)} de moins`, 'warn');
        if (!r.ok && r.reason) {
          this.toast(r.reason, 'warn');
          $('#checkout').classList.add('shake');
          setTimeout(() => $('#checkout').classList.remove('shake'), 350);
        }
        break;
      }
      case 'leave': g.leaveRegister(); g.player.atRegister = null; break;
      default: break;
    }
    if (g.checkout) this.renderCheckout();
  }

  // ---------------------------------------------------------------- fenêtres
  queueModal(m) {
    this.modals = this.modals || [];
    this.modals.push(m);
    if (!this.modalOpen) this.nextModal();
  }

  nextModal() {
    const m = (this.modals || []).shift();
    const box = $('#modal');
    if (!m) {
      this.modalOpen = null;
      box.classList.remove('show');
      setTimeout(() => { if (!this.modalOpen) box.hidden = true; }, 200);
      return;
    }
    this.modalOpen = m;
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
    this.renderModal(m);
  }

  renderModal(m) {
    const card = $('#modalCard');
    card.classList.toggle('chest-card-modal', m.kind === 'chest');
    if (m.kind === 'level') {
      card.innerHTML = `<div class="burst">⭐</div><h2>Niveau ${m.data.level} !</h2>
        ${m.data.unlocked.length ? `<ul>${m.data.unlocked.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p>Ta supérette gagne en réputation.</p>'}
        <button class="primary" data-a="ok">Super</button>`;
    } else if (m.kind === 'reset') {
      card.innerHTML = `<div class="burst">🧺</div><h2>Nouvelle partie ?</h2>
        <p class="reset-txt">Ta supérette repart <b>au jour 1</b> : argent, stock, réserve, étagères, personnel, popularité, niveau et objectifs sont <b>effacés</b>.<br>Les sons et vibrations sont gardés.</p>
        <div class="reset-btns"><button class="ghost" data-a="cancel">Annuler</button><button class="primary danger-fill" data-a="resetYes">Oui, tout effacer</button></div>`;
    } else if (m.kind === 'tutoOffer') {
      card.innerHTML = `<div class="burst">🧺</div><h2>Bienvenue !</h2>
        <p class="reset-txt">Tu veux apprendre le jeu avec un <b>tutoriel</b> de 2 journées ? Tu joues pour de vrai, pas à pas. Tu pourras le rejouer quand tu veux depuis le menu ☰.</p>
        <div class="reset-btns"><button class="ghost" data-a="tutoSkip">Passer</button><button class="primary" data-a="tutoYes">Jouer le tutoriel</button></div>`;
    } else if (m.kind === 'tutoQuit') {
      card.innerHTML = `<div class="burst">📘</div><h2>Quitter le tutoriel ?</h2>
        <p class="reset-txt">Tu retrouves ta partie telle que tu l’as laissée. Le tutoriel est gardé : <b>Reprendre</b> ou <b>Recommencer</b> depuis le menu ☰.</p>
        <div class="reset-btns"><button class="ghost" data-a="cancel">Continuer</button><button class="primary" data-a="tutoLeave">Quitter</button></div>`;
    } else if (m.kind === 'summary') {
      const d = m.data;
      const line = (label, v, cls = '') => `<div class="sum-row ${cls}"><span>${label}</span><b>${v}</b></div>`;
      card.innerHTML = `<small class="kicker">Fin de journée</small><h2>Jour ${d.day}</h2>
        <div class="sum">
          ${line('Ventes', `+${money(d.revenue)}`, 'pos')}
          ${line('Achats de marchandise', `−${money(d.spent)}`)}
          ${line('Loyer et charges', `−${money(d.charges)}`)}
          ${d.goalCoins ? line('Primes d’objectifs', `+${money(d.goalCoins)}`, 'pos') : ''}
          ${line('Résultat', `${d.profit >= 0 ? '+' : ''}${money(d.profit)}`, d.profit >= 0 ? 'big pos' : 'big neg')}
          ${d.doubled ? line('📺 Bénéfice doublé', `+${money(d.bonus)}`, 'big pos dbl') : ''}
        </div>
        ${this.doubleHtml(d)}
        <div class="chips"><span>🧺 ${d.served} clients</span><span>📦 ${d.sold} articles</span>${d.missing ? `<button class="warn chipbtn" data-a="missingHelp" aria-label="Qu’est-ce que c’est ?">❓ ${d.missing} demande${d.missing > 1 ? 's' : ''} non satisfaite${d.missing > 1 ? 's' : ''} <i>?</i></button>` : ''}${d.angry ? `<span class="warn">😠 ${d.angry} partis fâchés</span>` : ''}${d.staffErrors ? `<span class="warn">🧾 ${d.staffErrors} erreur${d.staffErrors > 1 ? 's' : ''} de caisse</span>` : ''}<span>${popIcon(d.reputation)} popularité ${Math.round(d.reputation)} %</span></div>
        <div class="missing-help" hidden>${missingHelp(d.missingBy)}</div>
        ${popRows(d.rep)}
        ${d.goals && d.goals.length ? `<div class="sumgoals"><b>🎯 Objectifs : ${d.goals.filter((x) => x.done).length}/${d.goals.length}${d.goalCoins ? ` · +${money(d.goalCoins)} pièces` : ''}</b>${d.goals.map((x) => `<span class="${x.done ? 'ok' : 'ko'}">${x.done ? '✔' : '✘'} ${esc(x.label)}</span>`).join('')}</div>` : ''}
        ${d.staffEnding.length ? `<p class="note">Fin de contrat : ${d.staffEnding.map(esc).join(', ')}. Pense à renouveler dans Personnel.</p>` : ''}
        ${d.tempLeft ? `<p class="note ok">${esc(d.tempLeft)} (intérimaire) est parti à 20 h. Retrouve-le dans Personnel → Mon équipe.</p>` : ''}
        <button class="primary" data-a="next">Préparer le jour ${d.day + 1}</button>`;
    } else if (m.kind === 'chest') {
      card.innerHTML = this.chestRevealHtml(m.data);
    }
  }

  // Bouton « Bilan doublé » (pub simulée). Masqué avant le jour 3 et dans le tutoriel ; désactivé si perte.
  doubleHtml(d) {
    const s = this.g.state;
    if (s.tutoMode || s.day < REWARD_FROM_DAY || d.day !== s.day || d.doubled) return '';
    const st = rewardStatus(s, 'double', { summary: d });
    if (st.used) return '';
    if (st.loss) return `<div class="dbl-box off"><button class="ghost" disabled>📺 Doubler le bénéfice</button><small>Journée en perte : il n’y a pas de bénéfice à doubler.</small></div>`;
    if (!st.ok) return '';
    return `<div class="dbl-box"><button class="primary gold" data-a="double">📺 ${settings.simAds ? 'Pub' : 'Bonus'} : doubler le bénéfice (+${money(d.profit)})</button><small>Facultatif · 1 fois par journée</small></div>`;
  }

  chestRevealHtml(r) {
    const stars = (n) => `<span class="cr-stars">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}" style="--d:${0.95 + i * 0.12}s">★</i>`).join('')}</span>`;
    let body;
    if (r.kind === 'deco') {
      const d = r.deco;
      body = `<div class="cr-prize deco"><i style="background:linear-gradient(135deg,${d.colors[0]},${d.colors[1]})"></i></div>
        <h2>${esc(d.name)}</h2><p class="reset-txt">${r.placed ? 'Déjà posée dans ton magasin ! ' : ''}Change-la quand tu veux dans <b>Aménager → Décorations</b>. Aucun effet sur le jeu.</p>`;
    } else {
      const label = STAFF[r.kind].label;
      const where = r.replaced ? `Il remplace <b>${esc(r.replaced)}</b> tout de suite, sans frais. ${esc(r.replaced)} garde son contrat et revient demain.`
        : r.onDuty ? 'Il prend le poste libre tout de suite.'
        : 'Ton employé actuel est au moins aussi bon : l’intérimaire reste au repos. Tu peux le faire travailler dans Personnel → Mon équipe.';
      body = `<div class="cr-prize staff ${r.stars >= 4 ? 'rare' : ''}">${r.kind === 'cashier' ? '🧑‍💼' : '👷'}</div>
        <h2>${esc(r.member.name)}</h2>${stars(r.stars)}
        <p class="cr-kind">${label} intérimaire · gratuit jusqu’à 20 h${r.guaranteed ? ' · <b>garantie 4★+</b>' : ''}</p>
        <p class="reset-txt">${where} Ensuite, il rejoint ton carnet : embauche possible au prix normal.</p>`;
    }
    return `<div class="chest-stage" aria-hidden="true"><div class="rays"></div><div class="chest"><div class="lid"></div><div class="base"><span></span></div></div></div>
      <div class="cr-body">${body}<button class="primary" data-a="ok">Super !</button></div>`;
  }

  // V1.5 : tutoriel proposé au tout premier lancement (jamais imposé).
  offerTutorial() {
    this.modals = [{ kind: 'tutoOffer' }, ...(this.modals || [])];
    this.nextModal();
  }

  askQuitTutorial() {
    this.close();
    this.modals = [{ kind: 'tutoQuit' }, ...(this.modalOpen && this.modalOpen.kind !== 'tutoQuit' ? [this.modalOpen] : []), ...(this.modals || [])];
    this.nextModal();
  }

  // V1.3 : bandeau « nouvelle version » (affiché en cours de partie, la partie n'est pas coupée).
  showUpdate(latest) {
    this.updateVersion = latest;
    const bar = $('#updateBar');
    if (!bar) return;
    $('#updateVersion').textContent = `v${latest}`;
    bar.hidden = false;
    $('#updateGo').onclick = () => this.hooks.update();
    $('#updateClose').onclick = () => { bar.hidden = true; };
  }

  showSummary(summary) {
    this.close();
    this.g.cancelMove();
    this.queueModal({ kind: 'summary', data: summary });
  }

  onModalClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'missingHelp') {
      const box = $('#modalCard .missing-help');
      if (box) box.hidden = !box.hidden;
      sfx('tick');
      return;
    }
    if (b.dataset.a === 'tutoYes') { this.modals = []; return this.hooks.startTutorial(true); }
    if (b.dataset.a === 'tutoLeave') { this.modals = []; return this.hooks.leaveTutorial({ finished: false }); }
    if (b.dataset.a === 'tutoSkip') this.hooks.skipTutorial();
    if (b.dataset.a === 'resetYes') {
      this.modals = [];
      this.hooks.reset();
      return;
    }
    if (b.dataset.a === 'double') {
      this.watchFor('double').then((r) => {
        if (r && this.modalOpen && this.modalOpen.kind === 'summary') {
          this.modalOpen.data = this.g.state.lastSummary;
          this.renderModal(this.modalOpen);
          this.toast(`Bénéfice doublé : +${money(r.bonus)} pièces 🎉`);
          sfx('level');
        }
      });
      return;
    }
    if (b.dataset.a === 'next') {
      if (this.adBusy) return;
      const go = () => {
        this.g.nextDay();
        this.renderPhase();
        sfx('tick');
        this.nextModal();
      };
      // V1.6 : pub imposée simulée, uniquement ici (au bilan), voir src/rewards.js → forcedAdDue.
      const s = this.g.state;
      const now = Date.now();
      if (forcedAdDue(s, now, { simulate: settings.simAds, noForced: hasManagerPack() })) {
        this.adBusy = true;
        noteAd(s, now, { forced: true });
        this.hooks.save();
        showInterstitial().then(() => { this.adBusy = false; go(); });
        return;
      }
      go();
      return;
    }
    sfx('tick');
    this.nextModal();
  }

  handleTapResult(res) {
    if (!res) return;
    if (res.moveDone) {
      this.toast('Étagère déplacée ✔️');
      haptic(20);
      return;
    }
    if (res.open) this.open(res.open, res);
    if (res.moved && this.sheet) this.close();
  }
}
