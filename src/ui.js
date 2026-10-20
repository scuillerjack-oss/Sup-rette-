// Interface DOM : HUD, barre du bas, panneaux, mini-jeu de caisse, fin de journée.
import { shouldCloseOnBackdrop } from './tap.js';
import { PRODUCTS, PRODUCT_BY_ID, STAFF, ZONES, REGISTERS, SHELF_CAPACITY, CHANGE_MONEY, DAY_START, DAY_END, xpForLevel, dailyCharges, CASHIER_LEVELS, STOCKER_LEVELS, EVENT_BY_ID, GOALS_FROM_DAY } from './data.js';
import { cents } from './game.js';
import { drawProduct, money } from './render.js';
import { settings, sfx, haptic } from './audio.js';

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
const POP_CAUSES = { prix: '🏷️ Prix', service: '😊 Service', arnaque: '😠 Arnaques repérées', choix: '📦 Choix en rayon', personnel: '👥 Personnel' };
function popRows(rep) {
  if (!rep) return '';
  const rows = Object.keys(POP_CAUSES).filter((k) => Math.abs(rep[k] || 0) >= 0.05).map((k) => {
    const v = rep[k];
    return `<div class="poprow"><span>${POP_CAUSES[k]}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')}</b></div>`;
  });
  return rows.length ? `<div class="poprows">${rows.join('')}</div>` : '';
}

function hhmm(min) {
  const m = Math.floor(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const TUTO = [
  'Touche le bouton « Commander » 🖥️ en bas (ou l’ordinateur en haut à droite) pour commander tes premiers cartons.',
  'Les cartons arrivent dans la réserve. Touche un carton pour le prendre.',
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
        this.toast(data.over ? `${data.name} a compté un article en trop (+${money(data.amount)})` : `${data.name} a oublié un article (−${money(data.amount)})`, 'warn');
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
      btn.innerHTML = `${gs.length ? `<span>🎯 ${gs.filter((x) => x.done).length}/${gs.length}</span>` : ''}${ev ? `<span class="ev">${ev.icon} ${esc(ev.name)}</span>` : ''}`;
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
      goals: () => this.goalsHtml()
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
    return `${this.head('Commande fournisseur', `Place dans la réserve : ${room} carton${room > 1 ? 's' : ''}`)}
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
    const stars = (n) => `<span class="stars" aria-label="Niveau ${n} sur 5">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
    const stats = (kind, level) => {
      if (kind === 'cashier') {
        const lv = CASHIER_LEVELS[level - 1];
        return `${lv.secPerItem.toFixed(1).replace('.', ',')} s / article · ${Math.round(lv.error * 100)} % d’erreurs`;
      }
      const lv = STOCKER_LEVELS[level - 1];
      return `Vitesse ${Math.round((lv.speed / 1.8) * 100)} % · range ${Math.round(1 / lv.perUnit)} articles/s`;
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
    return `${this.head('Personnel', 'Contrats de 7 journées payés d’avance. Plus d’étoiles : plus rapide, moins d’erreurs, plus cher.')}
      <h3 class="sec">Ton équipe</h3><div class="list">${teamHtml}</div>
      ${section('cashier')}${section('stocker')}
      <p class="credits">Nouveaux candidats chaque semaine. Les meilleurs profils arrivent quand ton magasin monte de niveau.</p>`;
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
    return `${this.head('Aménager', `Charges du jour : ${money(cents(dailyCharges(s)))} (loyer et électricité)`)}<div class="list">${items.join('')}</div>`;
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
        <div class="poprow"><span>😠 Client arnaqué qui s’en rend compte</span><b class="neg">↓↓</b></div>
        <div class="poprow"><span>❓ Produits introuvables, file trop longue</span><b class="neg">↓</b></div>
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
      ${sh.qty === 0 ? '<p class="empty">Rayon vide : range un carton de n’importe quel produit pour le réaffecter.</p>' : ''}
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

  menuHtml() {
    const s = this.g.state;
    return `${this.head('Ma P’tite Supérette', `Jour ${s.day} · ${s.totals.served} clients servis au total`)}
      <div class="list">
        <div class="row"><div class="info"><b>Sons</b><span>Bips, caisse, livraisons</span></div><button class="toggle ${settings.sound ? 'on' : ''}" data-a="sound">${settings.sound ? 'Activés' : 'Coupés'}</button></div>
        <div class="row"><div class="info"><b>Vibrations</b><span>Rayon vide, scan, passage de niveau</span></div><button class="toggle ${settings.haptics ? 'on' : ''}" data-a="haptics">${settings.haptics ? 'Activées' : 'Coupées'}</button></div>
        <div class="row"><div class="info"><b>Recommencer</b><span>Efface la partie sur ce téléphone</span></div><button class="danger" data-a="reset">${this.confirmReset ? 'Confirmer' : 'Effacer'}</button></div>
      </div>
      <p class="credits">Version __VERSION__ · tout est dessiné par le code, sans achat ni diamant.</p>`;
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
        if (this.confirmReset) return this.hooks.reset();
        this.confirmReset = true;
        break;
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
      const typed = co.card ? money(parseInt(co.card, 10)) : '0,00';
      pay = `<div class="card-pay"><div class="terminal"><small>Paiement par carte · tape le montant</small><b>${typed}</b></div>
        <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map((k) => `<button data-a="key" data-k="${k}" class="${k === 'ok' ? 'primary' : ''}">${k === 'del' ? '⌫' : k === 'ok' ? 'OK' : k}</button>`).join('')}</div></div>`;
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
        if (r.ok && r.excess > 0) this.toast(`Tu as rendu ${money(r.excess)} de trop`, 'warn');
        else if (r.ok && r.excess < 0) this.toast(r.noticed ? `Il manque ${money(-r.excess)} : le client a remarqué 😠` : `Il manquait ${money(-r.excess)}… personne n’a rien vu`, 'warn');
        else if (r.ok) this.toast('Monnaie parfaite ✨');
        break;
      }
      case 'exact': g.validateExact(); break;
      case 'key': {
        const r = g.cardKey(b.dataset.k);
        if (r.ok && r.diff > 0) this.toast(r.noticed ? `Client facturé ${money(r.diff)} de trop : il a remarqué 😠` : `Client facturé ${money(r.diff)} de trop… ni vu ni connu`, 'warn');
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
    const card = $('#modalCard');
    if (m.kind === 'level') {
      card.innerHTML = `<div class="burst">⭐</div><h2>Niveau ${m.data.level} !</h2>
        ${m.data.unlocked.length ? `<ul>${m.data.unlocked.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p>Ta supérette gagne en réputation.</p>'}
        <button class="primary" data-a="ok">Super</button>`;
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
        </div>
        <div class="chips"><span>🧺 ${d.served} clients</span><span>📦 ${d.sold} articles</span>${d.missing ? `<span class="warn">❓ ${d.missing} introuvables</span>` : ''}${d.angry ? `<span class="warn">😠 ${d.angry} partis fâchés</span>` : ''}${d.staffErrors ? `<span class="warn">🧾 ${d.staffErrors} erreur${d.staffErrors > 1 ? 's' : ''} de caisse</span>` : ''}<span>${popIcon(d.reputation)} popularité ${Math.round(d.reputation)} %</span></div>
        ${popRows(d.rep)}
        ${d.goals && d.goals.length ? `<div class="sumgoals"><b>🎯 Objectifs : ${d.goals.filter((x) => x.done).length}/${d.goals.length}${d.goalCoins ? ` · +${money(d.goalCoins)} pièces` : ''}</b>${d.goals.map((x) => `<span class="${x.done ? 'ok' : 'ko'}">${x.done ? '✔' : '✘'} ${esc(x.label)}</span>`).join('')}</div>` : ''}
        ${d.staffEnding.length ? `<p class="note">Fin de contrat : ${d.staffEnding.map(esc).join(', ')}. Pense à renouveler dans Personnel.</p>` : ''}
        <button class="primary" data-a="next">Préparer le jour ${d.day + 1}</button>`;
    }
  }

  showSummary(summary) {
    this.close();
    this.g.cancelMove();
    this.queueModal({ kind: 'summary', data: summary });
  }

  onModalClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    if (b.dataset.a === 'next') {
      this.g.nextDay();
      this.renderPhase();
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
