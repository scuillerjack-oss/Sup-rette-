// Rendu Canvas 2D haute définition : magasin vu de dessus en légère perspective.
import { COLS, ROWS, DELIVERY_SPOTS, ZONES, SHELF_SLOTS, SHELF_CAPACITY, REGISTERS, PRODUCT_BY_ID, PRODUCTS, DOOR, STAFF, SHOP_TOP, AUTO_SPOTS, staffLook } from './data.js';

const FONT = '"Baloo 2", "Nunito", system-ui, sans-serif';

export function money(c) {
  const neg = c < 0;
  const v = Math.abs(c);
  const s = `${Math.floor(v / 100)},${String(v % 100).padStart(2, '0')}`;
  return neg ? `−${s}` : s;
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  } else {
    r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ------------------------------------------------------------ icônes produits
// Dessine un produit centré en (0,0), dans une boîte de taille s.
export function drawProduct(ctx, p, s) {
  const c = p.color;
  const dark = shade(c, -0.35);
  const light = shade(c, 0.45);
  ctx.save();
  ctx.lineJoin = 'round';
  const label = (y, h) => {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-s * 0.32, y, s * 0.64, h);
  };
  switch (p.shape) {
    case 'bottle': {
      ctx.fillStyle = shade(c, 0.25);
      rr(ctx, -s * 0.2, -s * 0.28, s * 0.4, s * 0.72, s * 0.12); ctx.fill();
      ctx.fillStyle = dark; rr(ctx, -s * 0.09, -s * 0.46, s * 0.18, s * 0.2, s * 0.04); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(-s * 0.2, -s * 0.02, s * 0.4, s * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-s * 0.13, -s * 0.24, s * 0.05, s * 0.6);
      break;
    }
    case 'can': {
      ctx.fillStyle = c; rr(ctx, -s * 0.22, -s * 0.34, s * 0.44, s * 0.72, s * 0.08); ctx.fill();
      ctx.fillStyle = '#d9dde3'; ctx.fillRect(-s * 0.22, -s * 0.36, s * 0.44, s * 0.06); ctx.fillRect(-s * 0.22, s * 0.32, s * 0.44, s * 0.06);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.12, s * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-s * 0.16, -s * 0.3, s * 0.05, s * 0.6);
      break;
    }
    case 'bag': {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.36); ctx.lineTo(s * 0.3, -s * 0.36); ctx.quadraticCurveTo(s * 0.4, 0, s * 0.3, s * 0.4);
      ctx.lineTo(-s * 0.3, s * 0.4); ctx.quadraticCurveTo(-s * 0.4, 0, -s * 0.3, -s * 0.36); ctx.fill();
      ctx.fillStyle = dark; ctx.fillRect(-s * 0.3, -s * 0.4, s * 0.6, s * 0.08);
      ctx.fillStyle = light; ctx.beginPath(); ctx.arc(0, s * 0.04, s * 0.15, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'box': {
      ctx.fillStyle = c; rr(ctx, -s * 0.28, -s * 0.4, s * 0.56, s * 0.8, s * 0.05); ctx.fill();
      ctx.fillStyle = dark; ctx.fillRect(-s * 0.28, -s * 0.4, s * 0.56, s * 0.1);
      label(-s * 0.12, s * 0.22);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, -s * 0.01, s * 0.07, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'carton': {
      ctx.fillStyle = c; rr(ctx, -s * 0.24, -s * 0.28, s * 0.48, s * 0.68, s * 0.04); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-s * 0.24, -s * 0.28); ctx.lineTo(0, -s * 0.46); ctx.lineTo(s * 0.24, -s * 0.28); ctx.fill();
      ctx.fillStyle = p.id === 'lait' ? '#3a7bd5' : '#fff'; ctx.fillRect(-s * 0.24, s * 0.02, s * 0.48, s * 0.14);
      break;
    }
    case 'pack': {
      ctx.fillStyle = c; rr(ctx, -s * 0.32, -s * 0.3, s * 0.64, s * 0.62, s * 0.1); ctx.fill();
      ctx.fillStyle = light; rr(ctx, -s * 0.22, -s * 0.12, s * 0.44, s * 0.24, s * 0.06); ctx.fill();
      ctx.fillStyle = dark; ctx.fillRect(-s * 0.32, -s * 0.3, s * 0.64, s * 0.07);
      break;
    }
    case 'bar': {
      ctx.fillStyle = c; rr(ctx, -s * 0.36, -s * 0.2, s * 0.72, s * 0.4, s * 0.08); ctx.fill();
      ctx.fillStyle = light; ctx.fillRect(-s * 0.1, -s * 0.2, s * 0.2, s * 0.4);
      break;
    }
    case 'tube': {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.4); ctx.lineTo(-s * 0.26, -s * 0.24); ctx.lineTo(s * 0.26, -s * 0.24); ctx.lineTo(s * 0.2, s * 0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; rr(ctx, -s * 0.12, -s * 0.44, s * 0.24, s * 0.2, s * 0.05); ctx.fill();
      ctx.fillStyle = light; ctx.fillRect(-s * 0.14, -s * 0.06, s * 0.28, s * 0.16);
      break;
    }
    case 'jar': {
      ctx.fillStyle = shade(c, 0.1); rr(ctx, -s * 0.26, -s * 0.24, s * 0.52, s * 0.64, s * 0.14); ctx.fill();
      ctx.fillStyle = '#e8e2d6'; rr(ctx, -s * 0.24, -s * 0.4, s * 0.48, s * 0.17, s * 0.05); ctx.fill();
      label(-s * 0.04, s * 0.2);
      break;
    }
    case 'wheel': {
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.36, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.36, -0.4, 0.5); ctx.fill();
      ctx.fillStyle = shade(c, -0.25);
      for (const [x, y] of [[-0.12, -0.08], [0.08, 0.12], [-0.05, 0.14]]) { ctx.beginPath(); ctx.arc(x * s, y * s, s * 0.04, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------ le renderer
export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.static = document.createElement('canvas');
    this.staticKey = '';
    this.icons = new Map();
    this.ripples = [];
    this.time = 0;
    this.shift = 0; // décalage vertical (caisse ouverte : on remonte la vue)
    this.cover = 0; // hauteur de scène cachée par le panneau de caisse
    this.resize();
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = box.width;
    this.h = box.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    // On garde un peu d'air en haut pour la perspective du mur.
    this.T = Math.floor(Math.min(this.w / COLS, (this.h - 6) / (ROWS - 0.2)) * 4) / 4;
    this.ox = Math.round((this.w - this.T * COLS) / 2);
    this.oy = Math.round((this.h - this.T * (ROWS - 0.2)) / 2 - this.T * 0.2);
    this.staticKey = '';
    this.icons.clear();
  }

  // Coordonnées écran -> case
  pick(px, py) {
    const T = this.T;
    let c = Math.floor((px - this.ox) / T);
    py += this.shift;
    let r = Math.floor((py - this.oy) / T);
    // Toucher la partie haute d'une étagère (qui dépasse sur la case du dessus) vise l'étagère.
    const fy = (py - this.oy) / T - r;
    if (fy > 0.55 && r + 1 < ROWS && SHELF_SLOTS.some((s) => s.r === r + 1 && s.c === c)) r += 1;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { r, c };
  }

  tileScreen(r, c) {
    return { x: this.ox + (c + 0.5) * this.T, y: this.oy + (r + 0.5) * this.T - this.shift };
  }

  addRipple(px, py) {
    this.ripples.push({ x: px, y: py, t: 0 });
  }

  icon(p, size) {
    const k = `${p.id}:${size}`;
    let cv = this.icons.get(k);
    if (!cv) {
      cv = document.createElement('canvas');
      const px = Math.ceil(size * this.dpr);
      cv.width = px;
      cv.height = px;
      const c = cv.getContext('2d');
      c.scale(this.dpr, this.dpr);
      c.translate(size / 2, size / 2);
      drawProduct(c, p, size * 0.92);
      this.icons.set(k, cv);
    }
    return cv;
  }

  // ---------------------------------------------------------- couche statique
  buildStatic() {
    const g = this.game;
    const s = g.state;
    const key = `${this.w}x${this.h}|${s.zones.join()}|${s.registers.join()}|${s.shelves.map((x) => x.slot).join()}`;
    if (key === this.staticKey) return;
    this.staticKey = key;
    const cv = this.static;
    cv.width = this.canvas.width;
    cv.height = this.canvas.height;
    const ctx = cv.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const T = this.T;
    const X = (c) => this.ox + c * T;
    const Y = (r) => this.oy + r * T;

    // Fond extérieur (trottoir)
    ctx.fillStyle = '#d7dcd6';
    ctx.fillRect(0, 0, this.w, this.h);

    // Sol de la boutique : carrelage
    for (let r = SHOP_TOP; r < 14; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#f6f0e4' : '#e9e1d1';
        ctx.fillRect(X(c), Y(r), T + 0.5, T + 0.5);
      }
    }
    // Joints discrets
    ctx.strokeStyle = 'rgba(120,96,70,0.14)';
    ctx.lineWidth = 1;
    for (let r = SHOP_TOP; r <= 14; r++) { ctx.beginPath(); ctx.moveTo(X(0), Y(r)); ctx.lineTo(X(COLS), Y(r)); ctx.stroke(); }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(X(c), Y(SHOP_TOP)); ctx.lineTo(X(c), Y(14)); ctx.stroke(); }
    // Reflets des néons au plafond
    for (const [cx, cy] of [[2.5, 5], [6.5, 5], [2.5, 9.5], [6.5, 9.5], [4.5, 12.5]]) {
      const grd = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), T * 2.6);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(X(cx) - T * 3, Y(cy) - T * 3, T * 6, T * 6);
    }

    // Réserve : béton + ligne de sécurité
    const RH = SHOP_TOP - 1;
    ctx.fillStyle = '#c9cbc4';
    ctx.fillRect(X(0), Y(1), T * COLS, T * RH);
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.arc(X(0) + ((i * 97) % (T * COLS)), Y(1) + ((i * 53) % (T * RH)), 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    // Grille de la réserve (chaque case peut recevoir une pile) et palettes
    ctx.strokeStyle = 'rgba(80,70,55,0.12)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= SHOP_TOP; r++) { ctx.beginPath(); ctx.moveTo(X(0), Y(r)); ctx.lineTo(X(COLS), Y(r)); ctx.stroke(); }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(X(c), Y(1)); ctx.lineTo(X(c), Y(SHOP_TOP)); ctx.stroke(); }
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(X(0), Y(SHOP_TOP) - 3, T * COLS, 3);
    ctx.fillStyle = '#2c2c2c';
    for (let x = X(0); x < X(COLS); x += 12) ctx.fillRect(x, Y(SHOP_TOP) - 3, 6, 3);
    ctx.strokeStyle = 'rgba(242,194,48,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    for (const i of AUTO_SPOTS) { const d = DELIVERY_SPOTS[i]; rr(ctx, X(d.c) + 3, Y(d.r) + 3, T - 6, T - 6, 4); ctx.stroke(); }
    ctx.setLineDash([]);

    // Mur du fond
    const wall = ctx.createLinearGradient(0, Y(0) - T * 0.2, 0, Y(1));
    wall.addColorStop(0, '#1f5c5a');
    wall.addColorStop(1, '#2d7a73');
    ctx.fillStyle = wall;
    ctx.fillRect(X(0), Y(0) - T * 0.2, T * COLS, T * 1.2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(X(0), Y(1) - 4, T * COLS, 4);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(T * 0.34)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('RÉSERVE', X(0) + T * 0.2, Y(0) + T * 0.4);

    // Façade + porte
    ctx.fillStyle = '#1f5c5a';
    ctx.fillRect(X(0), Y(14), T * COLS, T);
    ctx.fillStyle = '#9fd3e0';
    for (let c = 0; c < COLS; c++) {
      if (c === DOOR.c) continue;
      ctx.fillStyle = 'rgba(160,215,230,0.75)';
      rr(ctx, X(c) + 3, Y(14) + T * 0.2, T - 6, T * 0.45, 3); ctx.fill();
    }
    ctx.fillStyle = '#7fb7c4';
    ctx.fillRect(X(DOOR.c) + 2, Y(14), T - 4, T);
    ctx.fillStyle = '#5a6f73';
    rr(ctx, X(DOOR.c) + T * 0.12, Y(13) + T * 0.35, T * 0.76, T * 0.55, 4); ctx.fill(); // tapis
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 5; i++) ctx.fillRect(X(DOOR.c) + T * 0.16, Y(13) + T * (0.4 + i * 0.1), T * 0.68, 2);

    // Zones fermées : rubalise
    for (const z of ZONES) {
      if (s.zones.includes(z.id)) continue;
      const x = X(1), y = Y(z.row) - T * 0.15, w = T * 7, h = T * 1.3;
      ctx.save();
      rr(ctx, x, y, w, h, 8);
      ctx.clip();
      ctx.fillStyle = 'rgba(40,60,60,0.08)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(242,170,40,0.35)';
      ctx.lineWidth = 6;
      for (let i = -h; i < w; i += 18) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(30,50,50,0.75)';
      ctx.font = `700 ${Math.round(T * 0.3)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`🔒 ${z.label} · niveau ${z.level}`, x + w / 2, y + h / 2);
    }
    // Emplacements libres dans les zones ouvertes
    for (const sl of SHELF_SLOTS) {
      if (!s.zones.includes(sl.zone) || s.shelves.some((x) => x.slot === sl.id)) continue;
      ctx.strokeStyle = 'rgba(45,122,115,0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      rr(ctx, X(sl.c) + 4, Y(sl.r) + 4, T - 8, T - 8, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(45,122,115,0.45)';
      ctx.font = `700 ${Math.round(T * 0.42)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('+', X(sl.c) + T / 2, Y(sl.r) + T / 2 + 1);
    }
    // Caisse non achetée : marquage
    for (const reg of REGISTERS) {
      if (s.registers.includes(reg.id)) continue;
      const x = X(reg.counter[0].c), y = Y(reg.counter[0].r);
      ctx.strokeStyle = 'rgba(45,122,115,0.3)';
      ctx.setLineDash([5, 4]);
      rr(ctx, x + 3, y + 3, T * 2 - 6, T - 6, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(45,122,115,0.5)';
      ctx.font = `700 ${Math.round(T * 0.26)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`Caisse 2 · niv. ${reg.level}`, x + T, y + T / 2);
    }
  }

  // ---------------------------------------------------------- dessin
  draw(dt) {
    this.time += dt;
    const g = this.game;
    const s = g.state;
    const ctx = this.ctx;
    const T = this.T;
    const X = (c) => this.ox + c * T;
    const Y = (r) => this.oy + r * T;
    this.buildStatic();
    const want = this.cover > 0 ? Math.max(0, this.oy + 13 * T - (this.h - this.cover - 4)) : 0;
    this.shift += (want - this.shift) * Math.min(1, dt * 10);
    if (Math.abs(want - this.shift) < 0.5) this.shift = want;
    const sh = Math.round(this.shift * this.dpr) / this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#d7dcd6';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.static, 0, -Math.round(sh * this.dpr));
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, -Math.round(sh * this.dpr));

    // Rangs : cartons, étagères, comptoirs et personnages triés par profondeur.
    const agents = [g.player, ...g.customers, ...g.staffAgents()];
    let pulsed = false;
    const cashierRegs = [...g.cashierAssignments().keys()].map((id) => REGISTERS.find((r) => r.id === id));
    const carry = g.player.carry;
    for (let r = 1; r < ROWS; r++) {
      for (let i = 0; i < DELIVERY_SPOTS.length; i++) {
        const d = DELIVERY_SPOTS[i];
        const st = s.delivery[i];
        if (d.r !== r || !st.length) continue;
        // Cartons empilés en décalé : le nom de chacun reste visible (le carton du dessus est entier).
        for (let k = 0; k < st.length; k++) this.drawCarton(X(d.c) + T * 0.5, Y(d.r) + T * 0.86 - k * T * 0.3, T * 0.86, st[k], true, false);
        if (!pulsed && s.tutorial === 1 && !g.player.carry) { pulsed = true; this.pulseRing(X(d.c) + T * 0.5, Y(d.r) + T * 0.5, T * 0.55); }
      }
      for (const sh of s.shelves) {
        const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
        if (sl.r === r) this.drawShelf(sl, sh, carry);
      }
      for (const reg of REGISTERS) {
        if (s.registers.includes(reg.id) && reg.counter[0].r === r) this.drawRegister(reg);
      }
      for (const cr of cashierRegs) if (cr.staff.r === r) this.drawPerson(cr.staff.c, cr.staff.r, { kind: 'cashier', dir: -1, walk: 0, look: staffLook(g.cashierAt(cr.id)) });
      for (const a of agents) {
        if (Math.round(a.y) === r) this.drawPerson(a.x, a.y, a);
      }
    }

    // Mode « Déplacer une étagère » : étagère choisie en orange, « + » libres qui pulsent
    if (g.moving) {
      const k = 0.5 + 0.5 * Math.sin(this.time * 6);
      if (g.moving.from) {
        const sl = SHELF_SLOTS.find((x) => x.id === g.moving.from);
        ctx.strokeStyle = `rgba(255,122,26,${0.6 + 0.4 * k})`;
        ctx.lineWidth = 4;
        rr(ctx, X(sl.c) + 1, Y(sl.r) - T * 0.45, T - 2, T * 1.4, 7); ctx.stroke();
        for (const fs of g.freeSlots()) {
          ctx.fillStyle = `rgba(43,209,160,${0.18 + 0.2 * k})`;
          rr(ctx, X(fs.c) + 3, Y(fs.r) + 3, T - 6, T - 6, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(30,150,115,0.9)';
          ctx.lineWidth = 2.5;
          rr(ctx, X(fs.c) + 3, Y(fs.r) + 3, T - 6, T - 6, 7); ctx.stroke();
        }
      } else {
        for (const sh of s.shelves) {
          const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
          ctx.strokeStyle = `rgba(255,150,80,${0.35 + 0.4 * k})`;
          ctx.lineWidth = 3;
          rr(ctx, X(sl.c) + 1, Y(sl.r) - T * 0.45, T - 2, T * 1.4, 7); ctx.stroke();
        }
      }
    }

    // Caisse sans personne avec des clients : alerte
    for (const regId of s.registers) {
      const q = g.queues.get(regId) || [];
      if (q.length && !g.registerStaffed(regId) && g.player.atRegister !== regId) {
        const reg = REGISTERS.find((x) => x.id === regId);
        const bx = X(reg.staff.c) + T * 0.5, by = Y(reg.staff.r) + T * 0.1 + Math.sin(this.time * 6) * 3;
        ctx.fillStyle = '#ff6b3d';
        ctx.beginPath(); ctx.arc(bx, by, T * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${Math.round(T * 0.36)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('!', bx, by + 1);
        if (s.tutorial >= 3) this.pulseRing(bx, by, T * 0.45);
      }
    }

    // Bulles des clients
    for (const cu of g.customers) {
      const hx = X(cu.x + cu.off) + T * 0.5, hy = Y(cu.y) - T * 0.42;
      if (cu.state === 'queue' && !cu.processing && cu.waited > cu.patience * 0.35) {
        const f = Math.max(0, 1 - cu.waited / cu.patience);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        rr(ctx, hx - T * 0.3, hy - 4, T * 0.6, 5, 2.5); ctx.fill();
        ctx.fillStyle = f > 0.4 ? '#f2a541' : '#e8483d';
        rr(ctx, hx - T * 0.3, hy - 4, T * 0.6 * f, 5, 2.5); ctx.fill();
      }
      if (cu.bubble) {
        const a = Math.min(1, cu.bubble.t * 3);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff';
        rr(ctx, hx - T * 0.26, hy - T * 0.62, T * 0.52, T * 0.44, T * 0.14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx - 4, hy - T * 0.19); ctx.lineTo(hx + 4, hy - T * 0.19); ctx.lineTo(hx, hy - T * 0.08); ctx.fill();
        ctx.font = `${Math.round(T * 0.3)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cu.bubble.text, hx, hy - T * 0.39);
        ctx.globalAlpha = 1;
      }
    }

    // Pièces qui s'envolent
    for (const f of g.fx) {
      const k = f.t / 1.2;
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = '#e8a317';
      ctx.font = `800 ${Math.round(T * 0.34)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      const tx = X(f.x) + T * 0.5, ty = Y(f.y) - T * 0.6 - k * T * 1.2;
      ctx.strokeText(`+${money(f.value)}`, tx, ty);
      ctx.fillText(`+${money(f.value)}`, tx, ty);
      ctx.globalAlpha = 1;
    }

    // Ondes de toucher (en coordonnées écran)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const rp of this.ripples) {
      rp.t += dt;
      const k = rp.t / 0.45;
      ctx.strokeStyle = `rgba(45,122,115,${0.5 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + k * T * 0.6, 0, Math.PI * 2); ctx.stroke();
    }
    this.ripples = this.ripples.filter((r) => r.t < 0.45);
  }

  pulseRing(x, y, rad) {
    const ctx = this.ctx;
    const k = (this.time * 1.2) % 1;
    ctx.strokeStyle = `rgba(255,138,61,${0.9 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, rad * (0.8 + k * 0.5), 0, Math.PI * 2); ctx.stroke();
  }

  // Carton vu de face, avec l'icône ET le nom du produit (V1.4). « named » : écrire le nom (carton du dessus).
  drawCarton(cx, by, w, carton, named = true, compact = false) {
    const ctx = this.ctx;
    const p = PRODUCT_BY_ID[carton.product];
    const h = w * 0.56;
    const x = cx - w / 2, y = by - h;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(cx, by, w * 0.5, w * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c99a62';
    rr(ctx, x, y, w, h, 3); ctx.fill();
    ctx.fillStyle = '#dbb07a';
    ctx.fillRect(x, y, w, h * 0.22);
    // étiquette blanche : bande de couleur, icône, nom
    ctx.fillStyle = '#fff';
    rr(ctx, x + w * 0.05, y + h * 0.28, w * 0.9, h * 0.64, 3); ctx.fill();
    ctx.fillStyle = p.color;
    ctx.fillRect(x + w * 0.05, y + h * 0.28, w * 0.06, h * 0.64);
    const isz = h * 0.56;
    ctx.drawImage(this.icon(p, Math.round(isz)), x + w * 0.12, y + h * 0.32, isz, isz);
    if (named && compact) {
      // carton à moitié caché par celui du dessus : le nom en haut de la face, sur toute la largeur
      ctx.fillStyle = '#fff';
      rr(ctx, x + w * 0.05, y + h * 0.04, w * 0.9, h * 0.44, 3); ctx.fill();
      ctx.fillStyle = p.color;
      ctx.fillRect(x + w * 0.05, y + h * 0.04, w * 0.06, h * 0.44);
      ctx.font = `800 ${Math.max(7, Math.round(h * 0.32))}px ${FONT}`;
      ctx.fillStyle = '#1d2b30';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.short, cx + w * 0.03, y + h * 0.27, w * 0.8);
    } else if (named) {
      const fsz = Math.max(7, Math.round(h * 0.34));
      ctx.font = `800 ${fsz}px ${FONT}`;
      ctx.fillStyle = '#1d2b30';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tx0 = x + w * 0.14 + isz;
      ctx.fillText(p.short, (tx0 + x + w * 0.93) / 2, y + h * 0.61, x + w * 0.93 - tx0);
    }
    if (carton.qty < p.qty) {
      ctx.fillStyle = '#2d7a73';
      ctx.font = `800 ${Math.round(w * 0.18)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(carton.qty, x + w * 0.88, y + h * 0.12);
    }
  }

  drawShelf(sl, sh, carry) {
    const ctx = this.ctx;
    const T = this.T;
    const x = this.ox + sl.c * T + 2;
    const w = T - 4;
    const bottom = this.oy + (sl.r + 1) * T - 3;
    const top = this.oy + sl.r * T - T * 0.42;
    const h = bottom - top;
    // Surbrillance si le joueur porte un carton compatible
    if (carry && (sh.product === carry.product || !sh.product || sh.qty === 0) && sh.qty < SHELF_CAPACITY) {
      const a = 0.35 + 0.25 * Math.sin(this.time * 6);
      ctx.fillStyle = `rgba(255,170,60,${a})`;
      rr(ctx, x - 3, top - 3, w + 6, h + 6, 8); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, x + 2, bottom - 4, w, 8, 4); ctx.fill();
    // Corps
    ctx.fillStyle = '#e9edf0';
    rr(ctx, x, top, w, h, 5); ctx.fill();
    ctx.fillStyle = '#cfd6dc';
    ctx.fillRect(x, top, 3, h);
    ctx.fillRect(x + w - 3, top, 3, h);
    // Fronton coloré avec le nom du produit (V1.4)
    const p = sh.product ? PRODUCT_BY_ID[sh.product] : null;
    ctx.fillStyle = p ? p.color : '#9aa7b0';
    rr(ctx, x, top, w, h * 0.16, 5); ctx.fill();
    ctx.fillRect(x, top + h * 0.08, w, h * 0.08);
    if (p) {
      ctx.fillStyle = luminance(p.color) > 0.62 ? '#1d2b30' : '#ffffff';
      ctx.font = `800 ${Math.max(8, Math.round(h * 0.12))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.short, x + w / 2, top + h * 0.085, w - 4);
    }
    // Tablettes et produits
    const levels = 3;
    const inner = h * 0.72;
    const lh = inner / levels;
    const perLevel = SHELF_CAPACITY / levels;
    let remaining = sh.qty;
    for (let l = 0; l < levels; l++) {
      const ly = top + h * 0.16 + lh * (l + 1);
      ctx.fillStyle = '#b9c3cb';
      ctx.fillRect(x + 3, ly - 2, w - 6, 3);
      if (p) {
        const n = Math.max(0, Math.min(perLevel, remaining - (levels - 1 - l) * perLevel));
        const isz = Math.min(lh * 0.95, (w - 8) / 3.2);
        const ic = this.icon(p, Math.round(isz));
        for (let i = 0; i < n; i++) {
          const col = i % 3;
          const back = i >= 3;
          const ix = x + 4 + col * ((w - 8 - isz) / 2) + (back ? 3 : 0);
          const iy = ly - 2 - isz - (back ? 2 : 0);
          ctx.globalAlpha = back ? 0.8 : 1;
          ctx.drawImage(ic, ix, iy, isz, isz);
          ctx.globalAlpha = 1;
        }
      }
    }
    // Étiquette de prix
    const ty = bottom - h * 0.12;
    if (p) {
      const ratio = this.game.state.prices[p.id] / Math.round(p.market * 100);
      ctx.fillStyle = sh.qty === 0 ? '#e8483d' : ratio > 1.15 ? '#f2a541' : '#ffffff';
      rr(ctx, x + w * 0.12, ty - 1, w * 0.76, h * 0.13, 3); ctx.fill();
      ctx.fillStyle = sh.qty === 0 ? '#fff' : '#22333b';
      ctx.font = `800 ${Math.max(8, Math.round(T * 0.2))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sh.qty === 0 ? 'VIDE' : money(this.game.state.prices[p.id]), x + w / 2, ty + h * 0.065);
    } else {
      ctx.fillStyle = '#7d8a93';
      ctx.font = `700 ${Math.max(8, Math.round(T * 0.18))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('libre', x + w / 2, top + h * 0.55);
    }
    if (sh.qty === 0 && p) {
      const a = 0.5 + 0.5 * Math.sin(this.time * 4);
      ctx.strokeStyle = `rgba(232,72,61,${a})`;
      ctx.lineWidth = 2;
      rr(ctx, x, top, w, h, 5); ctx.stroke();
    }
  }

  drawRegister(reg) {
    const ctx = this.ctx;
    const T = this.T;
    const x = this.ox + reg.counter[0].c * T + 2;
    const y = this.oy + reg.counter[0].r * T;
    const w = T * 2 - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, x + 2, y + T * 0.75, w, 8, 4); ctx.fill();
    ctx.fillStyle = '#3c4a55';
    rr(ctx, x, y + T * 0.05, w, T * 0.78, 6); ctx.fill();
    ctx.fillStyle = '#56646f';
    rr(ctx, x, y + T * 0.05, w, T * 0.3, 6); ctx.fill();
    // Tapis roulant
    ctx.fillStyle = '#1f262c';
    rr(ctx, x + 4, y + T * 0.1, w * 0.62, T * 0.2, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const off = (this.time * 14) % 8;
    for (let i = x + 6 + off; i < x + w * 0.62; i += 8) { ctx.beginPath(); ctx.moveTo(i, y + T * 0.11); ctx.lineTo(i, y + T * 0.29); ctx.stroke(); }
    // Caisse enregistreuse
    ctx.fillStyle = '#e9edf0';
    rr(ctx, x + w * 0.7, y - T * 0.18, w * 0.26, T * 0.42, 4); ctx.fill();
    ctx.fillStyle = '#6edcc8';
    rr(ctx, x + w * 0.72, y - T * 0.14, w * 0.22, T * 0.16, 2); ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.font = `800 ${Math.round(T * 0.22)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`CAISSE ${reg.id}`, x + w * 0.35, y + T * 0.6);
  }

  drawPerson(fx, fy, a) {
    const ctx = this.ctx;
    const T = this.T;
    const off = a.off || 0;
    const cx = this.ox + (fx + off + 0.5) * T;
    const by = this.oy + (fy + 0.82) * T;
    const s = T / 40;
    const look = a.look || {};
    let shirt = look.shirt || '#3a7bd5';
    let skin = look.skin || '#f1c7a5';
    let hair = look.hair || '#5a3a22';
    if (a.kind === 'player') { shirt = '#2d7a73'; skin = '#f0c29e'; hair = '#3b2a1e'; }
    if (a.kind === 'stocker') shirt = '#f08a24';
    if (a.kind === 'cashier') shirt = '#d6336c';
    const moving = a.path && a.path.length;
    const bob = moving ? Math.abs(Math.sin(a.walk * 6)) * 2 * s : 0;
    const step = moving ? Math.sin(a.walk * 6) * 3 * s : 0;
    // Ombre
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(cx, by, 10 * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    // Jambes
    ctx.fillStyle = '#34404a';
    rr(ctx, cx - 6 * s, by - 10 * s + step * 0.3, 5 * s, 10 * s - step * 0.3, 2 * s); ctx.fill();
    rr(ctx, cx + 1 * s, by - 10 * s - step * 0.3, 5 * s, 10 * s + step * 0.3, 2 * s); ctx.fill();
    // Corps
    const bodyTop = by - 25 * s - bob;
    ctx.fillStyle = shirt;
    rr(ctx, cx - 9 * s, bodyTop, 18 * s, 17 * s, 6 * s); ctx.fill();
    if (a.kind === 'player' || a.kind === 'cashier') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      rr(ctx, cx - 6 * s, bodyTop + 5 * s, 12 * s, 11 * s, 3 * s); ctx.fill(); // tablier
    }
    if (a.kind === 'stocker') {
      ctx.fillStyle = '#f2e84b';
      ctx.fillRect(cx - 9 * s, bodyTop + 7 * s, 18 * s, 2.5 * s);
    }
    // Bras / objet porté
    ctx.fillStyle = skin;
    if (a.carry) {
      const p = PRODUCT_BY_ID[a.carry.product];
      this.drawCarton(cx, bodyTop + 14 * s, 26 * s, a.carry);
      void p;
    } else {
      ctx.beginPath(); ctx.arc(cx - 10 * s, bodyTop + 12 * s - step * 0.3, 2.8 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 10 * s, bodyTop + 12 * s + step * 0.3, 2.8 * s, 0, Math.PI * 2); ctx.fill();
      if (a.basket && a.basket.length) {
        ctx.fillStyle = '#e85d3a';
        rr(ctx, cx + 7 * s, bodyTop + 11 * s, 10 * s, 7 * s, 2 * s); ctx.fill();
        ctx.strokeStyle = '#e85d3a';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath(); ctx.arc(cx + 12 * s, bodyTop + 11 * s, 4 * s, Math.PI, 0); ctx.stroke();
        const p = PRODUCT_BY_ID[a.basket[a.basket.length - 1].product];
        ctx.drawImage(this.icon(p, Math.round(8 * s)), cx + 8 * s, bodyTop + 6 * s, 8 * s, 8 * s);
      }
    }
    // Tête
    const hy = bodyTop - 7 * s;
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(cx, hy, 8.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair;
    const dir = a.dir || 1;
    if (dir === -1) {
      ctx.beginPath(); ctx.arc(cx, hy - 0.5 * s, 8.8 * s, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(cx, hy - 2 * s, 8.6 * s, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      if (look.hairStyle === 1) { ctx.fillRect(cx - 8.6 * s, hy - 2 * s, 3 * s, 9 * s); ctx.fillRect(cx + 5.6 * s, hy - 2 * s, 3 * s, 9 * s); }
      if (look.hairStyle === 2) { ctx.beginPath(); ctx.arc(cx, hy - 10 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill(); }
      // Yeux
      ctx.fillStyle = '#22262b';
      const ex = dir === 2 ? 2.5 * s : dir === -2 ? -2.5 * s : 0;
      if (Math.abs(dir) === 2) {
        ctx.beginPath(); ctx.arc(cx + ex + (dir > 0 ? 2 : -2) * s, hy + 1 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(cx - 3 * s, hy + 1 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 3 * s, hy + 1 * s, 1.2 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(232,93,117,0.35)';
        ctx.beginPath(); ctx.arc(cx - 5 * s, hy + 3.5 * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 5 * s, hy + 3.5 * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Casquette du joueur
    if (a.kind === 'player') {
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.arc(cx, hy - 3 * s, 8.8 * s, Math.PI, 0); ctx.fill();
      if (dir !== -1) { rr(ctx, cx - 6 * s, hy - 4 * s, 12 * s, 3 * s, 1.5 * s); ctx.fill(); }
    }
    // Indicateur au-dessus du joueur
    if (a.kind === 'player' && a.fill) {
      const f = a.fill;
      const k = f.shelf.qty / SHELF_CAPACITY;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      rr(ctx, cx - 14 * s, hy - 18 * s, 28 * s, 5 * s, 2.5 * s); ctx.fill();
      ctx.fillStyle = '#2bb673';
      rr(ctx, cx - 14 * s, hy - 18 * s, 28 * s * k, 5 * s, 2.5 * s); ctx.fill();
    }
  }
}

export { PRODUCTS, STAFF };
