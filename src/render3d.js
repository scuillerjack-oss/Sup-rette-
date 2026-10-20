// Rendu 3D low-poly (Three.js) : magasin vu de haut en biais, lumière douce et ombres.
// Les textes (prix, bulles, alertes, gains) sont dessinés sur un calque 2D par-dessus.
import { COLS, ROWS, DELIVERY_SPOTS, COMPUTER, ZONES, SHELF_SLOTS, SHELF_CAPACITY, REGISTERS, PRODUCT_BY_ID, PRODUCTS, DOOR, SPOT_STACK } from './data.js';
import { drawProduct, money } from './render.js';

const FONT3 = '"Baloo 2", "Nunito", system-ui, sans-serif';
const PITCH = (54 * Math.PI) / 180;
const FOV = 30;

function rr2(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Proportions des articles en rayon selon la forme (largeur, hauteur, profondeur).
const ITEM_DIMS = {
  bottle: [0.14, 0.3, 0.14], can: [0.14, 0.2, 0.14], bag: [0.22, 0.26, 0.1], box: [0.2, 0.28, 0.08],
  carton: [0.15, 0.27, 0.15], pack: [0.24, 0.2, 0.1], bar: [0.24, 0.1, 0.14], tube: [0.12, 0.26, 0.1],
  jar: [0.16, 0.2, 0.16], wheel: [0.24, 0.12, 0.2]
};

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.THREE && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

export class Renderer3D {
  constructor(canvas, game, overlay) {
    const THREE = window.THREE;
    this.T3 = THREE;
    this.canvas = canvas;
    this.game = game;
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.time = 0;
    this.ripples = [];
    this.shift = 0;
    this.cover = 0;
    this.staticKey = '';
    this.icons = new Map();
    this.mats = new Map();

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bfe3e8');
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
    this.dist = 30;
    this.target = new THREE.Vector3(COLS / 2, 0.45, ROWS / 2 - 0.3);

    // Lumières : ciel doux + soleil de fin de matinée qui donne des ombres courtes.
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a9f98', 1.0));
    const sun = new THREE.DirectionalLight('#fff1dc', 2.3);
    sun.position.set(COLS / 2 - 5, 14, ROWS / 2 + 6);
    sun.target.position.set(COLS / 2, 0, ROWS / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const sc = sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pickables = [];

    this.world = new THREE.Group(); // éléments qui dépendent de l'aménagement
    scene.add(this.world);
    this.buildConstant();

    this.agentObjs = new Map();
    this.itemMeshes = new Map();
    this.stockKey = '';
    this.cartonMeshes = [];
    this.deliveryKey = '';
    this.resize();
  }

  // ---------------------------------------------------------------- utilitaires
  mat(color, opts = {}) {
    const k = `${color}|${opts.rough ?? 0.75}|${opts.metal ?? 0}|${opts.emissive || ''}`;
    let m = this.mats.get(k);
    if (!m) {
      m = new this.T3.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0, emissive: opts.emissive || '#000000' });
      this.mats.set(k, m);
    }
    return m;
  }

  box(w, h, d, material, x, y, z, { shadow = true, receive = true } = {}) {
    const m = new this.T3.Mesh(new this.T3.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    return m;
  }

  canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = new this.T3.CanvasTexture(cv);
    t.colorSpace = this.T3.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  iconCanvas(p, size) {
    const k = `${p.id}:${size}`;
    let cv = this.icons.get(k);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      const c = cv.getContext('2d');
      c.translate(size / 2, size / 2);
      drawProduct(c, p, size * 0.9);
      this.icons.set(k, cv);
    }
    return cv;
  }

  // ---------------------------------------------------------------- décor fixe
  buildConstant() {
    const T = this.T3;
    const s = this.scene;
    // Trottoir autour
    const outside = new T.Mesh(new T.PlaneGeometry(40, 40), this.mat('#c9d2cc', { rough: 1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(COLS / 2, -0.02, ROWS / 2);
    outside.receiveShadow = true;
    s.add(outside);

    // Sol de la réserve (béton)
    const conc = this.canvasTex(576, 128, (c, w, h) => {
      c.fillStyle = '#c3c6bf';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${0.03 + (i % 5) * 0.01})`;
        c.fillRect((i * 97.13) % w, (i * 53.7) % h, 2 + (i % 3), 2);
      }
      // Emplacements de livraison
      c.strokeStyle = '#e8b62c';
      c.lineWidth = 4;
      c.setLineDash([12, 8]);
      for (const d of DELIVERY_SPOTS) rr2(c, d.c * 64 + 6, 6, 52, 52, 8), c.stroke();
      c.setLineDash([]);
      // Ligne de sécurité
      for (let x = 0; x < w; x += 24) {
        c.fillStyle = '#f2c230';
        c.fillRect(x, h - 10, 12, 10);
        c.fillStyle = '#2c2c2c';
        c.fillRect(x + 12, h - 10, 12, 10);
      }
    });
    const reserve = new T.Mesh(new T.PlaneGeometry(COLS, 2), new T.MeshStandardMaterial({ map: conc, roughness: 0.95 }));
    reserve.rotation.x = -Math.PI / 2;
    reserve.position.set(COLS / 2, 0, 2);
    reserve.receiveShadow = true;
    s.add(reserve);

    // Murs
    const teal = this.mat('#2a6e6a');
    const wallLight = this.mat('#e7eeeb');
    s.add(this.box(COLS + 0.4, 1.9, 0.5, teal, COLS / 2, 0.95, 0.75, { shadow: true }));
    // Haut du mur : grande enseigne du magasin (remplit le haut de l'écran)
    s.add(this.box(COLS + 0.4, 2.6, 0.3, this.mat('#1f5c5a'), COLS / 2, 3.2, 0.6, { shadow: false }));
    const big = new T.Mesh(new T.PlaneGeometry(7.6, 1.5), new T.MeshBasicMaterial({
      map: this.canvasTex(1024, 202, (c, w, h) => {
        c.fillStyle = '#ffffff';
        rr2(c, 4, 4, w - 8, h - 8, 40); c.fill();
        c.fillStyle = '#ff8a3d';
        rr2(c, 14, 14, w - 28, h - 28, 32); c.fill();
        c.fillStyle = '#ffffff';
        c.font = `800 104px ${FONT3}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('Ma P’tite Supérette', w / 2, h / 2 + 8);
      }),
      transparent: true
    }));
    big.position.set(COLS / 2, 3.15, 0.76);
    s.add(big);
    const sign = new T.Mesh(new T.PlaneGeometry(2.4, 0.5), new T.MeshBasicMaterial({
      map: this.canvasTex(512, 108, (c, w, h) => {
        c.fillStyle = '#1f5c5a';
        rr2(c, 0, 0, w, h, 20); c.fill();
        c.fillStyle = '#ffffff';
        c.font = `800 64px ${FONT3}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('RÉSERVE', w / 2, h / 2 + 4);
      }),
      transparent: true
    }));
    sign.position.set(2.2, 1.68, 1.01);
    s.add(sign);
    // Étagères murales de la réserve (décor)
    for (let i = 0; i < 3; i++) s.add(this.box(COLS - 3.2, 0.05, 0.3, this.mat('#9aa6ad'), (COLS - 3.2) / 2 + 0.1, 0.5 + i * 0.4, 1.12, { shadow: false }));
    for (let i = 0; i < 14; i++) {
      const col = ['#c99a62', '#d9b07c', '#b8875a'][i % 3];
      s.add(this.box(0.34, 0.26, 0.24, this.mat(col), 0.35 + (i % 7) * 0.8, 0.66 + Math.floor(i / 7) * 0.4, 1.1, { shadow: false }));
    }
    s.add(this.box(0.25, 1.1, 15.2, wallLight, -0.12, 0.55, ROWS / 2 + 0.2));
    s.add(this.box(0.25, 1.1, 15.2, wallLight, COLS + 0.12, 0.55, ROWS / 2 + 0.2));
    // Façade basse vitrée + porte
    for (let c = 0; c < COLS; c++) {
      if (c === DOOR.c) continue;
      s.add(this.box(1, 0.3, 0.3, teal, c + 0.5, 0.15, ROWS - 0.55, { shadow: false }));
      const glass = this.box(0.94, 0.22, 0.04, new T.MeshStandardMaterial({ color: '#a8dbe8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.6 }), c + 0.5, 0.42, ROWS - 0.55, { shadow: false });
      s.add(glass);
    }
    // Tapis d'entrée
    s.add(this.box(0.9, 0.02, 0.7, this.mat('#4f6266', { rough: 1 }), DOOR.c + 0.5, 0.01, ROWS - 1.45, { shadow: false }));

    // Bureau + ordinateur
    const desk = new T.Group();
    desk.add(this.box(1.9, 0.08, 0.7, this.mat('#b8845a'), 0, 0.72, 0));
    desk.add(this.box(0.08, 0.7, 0.6, this.mat('#8a5e3c'), -0.88, 0.35, 0));
    desk.add(this.box(0.08, 0.7, 0.6, this.mat('#8a5e3c'), 0.88, 0.35, 0));
    desk.add(this.box(0.64, 0.42, 0.06, this.mat('#2b3036'), 0.25, 1.06, -0.12));
    this.screenMat = new T.MeshStandardMaterial({ color: '#6edcc8', emissive: '#3fbfa8', emissiveIntensity: 0.8, roughness: 0.4 });
    desk.add(this.box(0.56, 0.34, 0.01, this.screenMat, 0.25, 1.06, -0.085, { shadow: false }));
    desk.add(this.box(0.08, 0.18, 0.08, this.mat('#2b3036'), 0.25, 0.83, -0.12));
    desk.add(this.box(0.4, 0.03, 0.16, this.mat('#3c4248'), 0.2, 0.775, 0.12));
    desk.position.set(COMPUTER.tiles[0].c + 1, 0, COMPUTER.tiles[0].r + 0.45);
    desk.traverse((o) => { if (o.isMesh) o.userData = { tile: COMPUTER.tiles[0], constant: true }; });
    this.pickables.push(...desk.children);
    s.add(desk);
  }

  // ---------------------------------------------------------------- aménagement (étagères, caisses, sol)
  buildLayout() {
    const g = this.game;
    const st = g.state;
    const key = `${st.zones.join()}|${st.registers.join()}|${st.shelves.map((x) => x.slot).join()}`;
    if (key === this.staticKey) return;
    this.staticKey = key;
    const T = this.T3;
    for (const o of [...this.world.children]) {
      this.world.remove(o);
      o.traverse((m) => { if (m.isMesh && m.geometry) m.geometry.dispose(); });
    }
    this.pickables = this.pickables.filter((m) => m.userData.constant || m.userData.carton);
    this.shelfObjs = new Map();

    // Sol de la boutique : carrelage + marquages (emplacements libres, zones fermées)
    const px = 72;
    const rows = ROWS - 3;
    const floorTex = this.canvasTex(COLS * px, rows * px, (c) => {
      for (let r = 0; r < rows; r++) for (let col = 0; col < COLS; col++) {
        c.fillStyle = (r + col) % 2 ? '#f5f8f6' : '#e3ece8';
        c.fillRect(col * px, r * px, px, px);
      }
      c.strokeStyle = 'rgba(60,100,90,0.10)';
      c.lineWidth = 2;
      for (let r = 0; r <= rows; r++) { c.beginPath(); c.moveTo(0, r * px); c.lineTo(COLS * px, r * px); c.stroke(); }
      for (let col = 0; col <= COLS; col++) { c.beginPath(); c.moveTo(col * px, 0); c.lineTo(col * px, rows * px); c.stroke(); }
      for (const z of ZONES) {
        if (st.zones.includes(z.id)) continue;
        const x = px, y = (z.row - 3) * px - px * 0.1, w = px * 7, h = px * 1.2;
        c.save();
        rr2(c, x, y, w, h, 16); c.clip();
        c.fillStyle = 'rgba(40,60,60,0.06)'; c.fillRect(x, y, w, h);
        c.strokeStyle = 'rgba(242,170,40,0.45)'; c.lineWidth = 14;
        for (let i = -h; i < w; i += 40) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + h, y); c.stroke(); }
        c.restore();
        c.fillStyle = 'rgba(30,50,50,0.8)';
        c.font = `800 ${px * 0.36}px ${FONT3}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`🔒 ${z.label} · niveau ${z.level}`, x + w / 2, y + h / 2 + 3);
      }
      for (const sl of SHELF_SLOTS) {
        if (!st.zones.includes(sl.zone) || st.shelves.some((x) => x.slot === sl.id)) continue;
        c.strokeStyle = 'rgba(45,122,115,0.45)'; c.lineWidth = 3; c.setLineDash([10, 8]);
        rr2(c, sl.c * px + 8, (sl.r - 3) * px + 8, px - 16, px - 16, 10); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(45,122,115,0.55)'; c.font = `800 ${px * 0.5}px ${FONT3}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('+', sl.c * px + px / 2, (sl.r - 3) * px + px / 2 + 2);
      }
      for (const reg of REGISTERS) {
        if (st.registers.includes(reg.id)) continue;
        const x = reg.counter[0].c * px, y = (reg.counter[0].r - 3) * px;
        c.strokeStyle = 'rgba(45,122,115,0.4)'; c.lineWidth = 3; c.setLineDash([10, 8]);
        rr2(c, x + 6, y + 6, px * 2 - 12, px - 12, 10); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(45,122,115,0.65)'; c.font = `800 ${px * 0.24}px ${FONT3}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`Caisse 2 · niv. ${reg.level}`, x + px, y + px / 2);
      }
    });
    const floor = new T.Mesh(new T.PlaneGeometry(COLS, rows), new T.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(COLS / 2, 0, 3 + rows / 2);
    floor.receiveShadow = true;
    this.world.add(floor);

    // Étagères
    for (const sh of st.shelves) {
      const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
      const grp = new T.Group();
      const frame = this.mat('#dfe5e9', { rough: 0.5, metal: 0.15 });
      const dark = this.mat('#8d99a3', { rough: 0.5, metal: 0.2 });
      grp.add(this.box(0.92, 0.12, 0.66, dark, 0, 0.06, 0));
      const back = new T.MeshStandardMaterial({ color: '#eef2f4', roughness: 0.6, emissive: '#ff8a3d', emissiveIntensity: 0 });
      grp.add(this.box(0.92, 1.3, 0.06, back, 0, 0.7, -0.3));
      grp.add(this.box(0.05, 1.3, 0.66, frame, -0.44, 0.65, 0));
      grp.add(this.box(0.05, 1.3, 0.66, frame, 0.44, 0.65, 0));
      for (const y of [0.14, 0.52, 0.9]) grp.add(this.box(0.86, 0.035, 0.58, frame, 0, y, 0.02, { shadow: false }));
      const header = new T.MeshStandardMaterial({ color: '#9aa7b0', roughness: 0.5 });
      grp.add(this.box(0.92, 0.2, 0.08, header, 0, 1.42, -0.27));
      grp.position.set(sl.c + 0.5, 0, sl.r + 0.5);
      grp.traverse((o) => { if (o.isMesh) o.userData.tile = { r: sl.r, c: sl.c }; });
      this.pickables.push(...grp.children);
      this.world.add(grp);
      this.shelfObjs.set(sh.slot, { grp, back, header, slot: sl });
    }

    // Caisses
    for (const reg of REGISTERS) {
      if (!st.registers.includes(reg.id)) continue;
      const grp = new T.Group();
      grp.add(this.box(1.9, 0.7, 0.72, this.mat('#3c4a55', { rough: 0.6 }), 0, 0.35, 0));
      grp.add(this.box(1.94, 0.06, 0.76, this.mat('#56646f', { rough: 0.4, metal: 0.2 }), 0, 0.73, 0));
      grp.add(this.box(1.15, 0.03, 0.42, this.mat('#1d2328', { rough: 0.9 }), -0.32, 0.775, 0.02, { shadow: false }));
      grp.add(this.box(0.42, 0.22, 0.42, this.mat('#e9edf0', { rough: 0.4 }), 0.66, 0.87, -0.05));
      grp.add(this.box(0.34, 0.2, 0.04, this.mat('#2b3036'), 0.66, 1.08, -0.18));
      grp.add(this.box(0.3, 0.15, 0.01, new T.MeshStandardMaterial({ color: '#6edcc8', emissive: '#3fbfa8', emissiveIntensity: 0.7 }), 0.66, 1.08, -0.155, { shadow: false }));
      // Petit panneau numéro
      grp.add(this.box(0.05, 0.9, 0.05, this.mat('#9aa6ad', { metal: 0.4, rough: 0.4 }), -0.9, 1.1, -0.3));
      const num = new T.Mesh(new T.PlaneGeometry(0.4, 0.4), new T.MeshBasicMaterial({
        map: this.canvasTex(128, 128, (c) => {
          c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff'; c.font = `800 80px ${FONT3}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(reg.id), 64, 70);
        }),
        transparent: true
      }));
      num.position.set(-0.9, 1.6, -0.27);
      grp.add(num);
      grp.position.set(reg.counter[0].c + 1, 0, reg.counter[0].r + 0.5);
      grp.traverse((o) => { if (o.isMesh) o.userData.tile = { r: reg.staff.r, c: reg.staff.c }; });
      this.pickables.push(...grp.children);
      this.world.add(grp);
    }
    this.stockKey = '';
  }

  // ---------------------------------------------------------------- articles en rayon (instanciés)
  itemMesh(pid) {
    let m = this.itemMeshes.get(pid);
    if (m) return m;
    const T = this.T3;
    const p = PRODUCT_BY_ID[pid];
    const [w, h, d] = ITEM_DIMS[p.shape] || [0.18, 0.24, 0.12];
    const face = this.canvasTex(128, 128, (c) => {
      c.fillStyle = lighten(p.color, 0.55);
      c.fillRect(0, 0, 128, 128);
      c.drawImage(this.iconCanvas(p, 128), 0, 0);
    });
    const side = new T.MeshStandardMaterial({ color: p.color, roughness: 0.55 });
    const front = new T.MeshStandardMaterial({ map: face, roughness: 0.5 });
    const geo = new T.BoxGeometry(w, h, d);
    geo.translate(0, h / 2, 0);
    m = new T.InstancedMesh(geo, [side, side, side, side, front, side], SHELF_SLOTS.length * SHELF_CAPACITY);
    m.count = 0;
    m.castShadow = false;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.scene.add(m);
    this.itemMeshes.set(pid, m);
    return m;
  }

  updateStock() {
    const st = this.game.state;
    const key = st.shelves.map((x) => `${x.slot}:${x.product}:${x.qty}`).join('|');
    if (key === this.stockKey) return;
    this.stockKey = key;
    const T = this.T3;
    const counts = new Map();
    for (const m of this.itemMeshes.values()) m.count = 0;
    const mtx = new T.Matrix4();
    const levels = [0.16, 0.54, 0.92];
    for (const sh of st.shelves) {
      const obj = this.shelfObjs?.get(sh.slot);
      if (!obj) continue;
      const p = sh.product ? PRODUCT_BY_ID[sh.product] : null;
      obj.header.color.set(p ? p.color : '#9aa7b0');
      if (!p || !sh.qty) continue;
      const m = this.itemMesh(p.id);
      let n = counts.get(p.id) || 0;
      for (let i = 0; i < sh.qty; i++) {
        const lvl = 2 - Math.floor(i / 6) < 0 ? 0 : Math.floor(i / 6);
        const k = i % 6;
        const col = k % 3;
        const row = Math.floor(k / 3);
        const x = obj.slot.c + 0.5 + (col - 1) * 0.27;
        const z = obj.slot.r + 0.5 + (row === 0 ? 0.14 : -0.1);
        mtx.makeTranslation(x, levels[lvl] + 0.02, z);
        m.setMatrixAt(n++, mtx);
      }
      counts.set(p.id, n);
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- cartons de la réserve
  cartonMat(pid) {
    const k = `carton:${pid}`;
    let m = this.mats.get(k);
    if (!m) {
      const p = PRODUCT_BY_ID[pid];
      const tex = this.canvasTex(128, 128, (c) => {
        c.fillStyle = '#c99a62'; c.fillRect(0, 0, 128, 128);
        c.fillStyle = 'rgba(120,80,40,0.35)'; c.fillRect(56, 0, 16, 128);
        c.fillStyle = '#ffffff'; rr2(c, 24, 30, 80, 68, 10); c.fill();
        c.drawImage(this.iconCanvas(p, 96), 32, 26, 64, 64);
        c.fillStyle = p.color; c.fillRect(24, 88, 80, 10);
      });
      m = new this.T3.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      this.mats.set(k, m);
    }
    return m;
  }

  cartonMesh(pid) {
    const T = this.T3;
    const plain = this.mat('#c99a62', { rough: 0.9 });
    const top = this.mat('#d9b07c', { rough: 0.9 });
    const lab = this.cartonMat(pid);
    const m = new T.Mesh(this.cartonGeo || (this.cartonGeo = new T.BoxGeometry(0.62, 0.36, 0.5)), [plain, plain, top, plain, lab, plain]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  updateDelivery() {
    const st = this.game.state;
    const key = st.delivery.map((x) => x.map((c) => c.product).join(',')).join('|');
    if (key === this.deliveryKey) return;
    this.deliveryKey = key;
    for (const m of this.cartonMeshes) this.scene.remove(m);
    this.pickables = this.pickables.filter((m) => !m.userData.carton);
    this.cartonMeshes = [];
    st.delivery.forEach((stack, i) => {
      const d = DELIVERY_SPOTS[i];
      stack.forEach((c, k) => {
        const m = this.cartonMesh(c.product);
        m.position.set(d.c + 0.5 + (k % 2 ? 0.03 : -0.02), 0.18 + k * 0.37, d.r + 0.5);
        m.rotation.y = (k % 2 ? 0.06 : -0.04);
        m.userData = { tile: { r: d.r, c: d.c }, carton: true };
        this.scene.add(m);
        this.cartonMeshes.push(m);
        this.pickables.push(m);
      });
    });
  }

  // ---------------------------------------------------------------- personnages
  person(kind, look = {}) {
    const T = this.T3;
    const g = new T.Group();
    let shirt = look.shirt || '#3a7bd5', skin = look.skin || '#f1c7a5', hair = look.hair || '#5a3a22';
    if (kind === 'player') { shirt = '#2d7a73'; skin = '#f0c29e'; hair = '#3b2a1e'; }
    if (kind === 'stocker') { shirt = '#f08a24'; }
    if (kind === 'cashier') { shirt = '#d6336c'; }
    const legMat = this.mat('#34404a');
    const legGeo = this.legGeo || (this.legGeo = new T.CapsuleGeometry(0.055, 0.2, 3, 8));
    const legL = new T.Mesh(legGeo, legMat);
    const legR = new T.Mesh(legGeo, legMat);
    legL.position.set(-0.07, 0.15, 0);
    legR.position.set(0.07, 0.15, 0);
    const body = new T.Mesh(this.bodyGeo || (this.bodyGeo = new T.CapsuleGeometry(0.16, 0.2, 4, 12)), this.mat(shirt, { rough: 0.8 }));
    body.position.y = 0.48;
    body.scale.set(1, 1, 0.8);
    const head = new T.Mesh(this.headGeo || (this.headGeo = new T.SphereGeometry(0.15, 18, 14)), this.mat(skin, { rough: 0.7 }));
    head.position.y = 0.86;
    const hairM = new T.Mesh(this.hairGeo || (this.hairGeo = new T.SphereGeometry(0.158, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), this.mat(hair, { rough: 0.9 }));
    hairM.position.y = 0.87;
    hairM.rotation.x = -0.35;
    const eyeGeo = this.eyeGeo || (this.eyeGeo = new T.SphereGeometry(0.022, 8, 6));
    const eyeMat = this.mat('#22262b', { rough: 0.3 });
    const eyeL = new T.Mesh(eyeGeo, eyeMat);
    const eyeR = new T.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.055, 0.88, 0.135);
    eyeR.position.set(0.055, 0.88, 0.135);
    const armGeo = this.armGeo || (this.armGeo = new T.SphereGeometry(0.06, 10, 8));
    const armL = new T.Mesh(armGeo, this.mat(skin));
    const armR = new T.Mesh(armGeo, this.mat(skin));
    armL.position.set(-0.2, 0.42, 0.04);
    armR.position.set(0.2, 0.42, 0.04);
    g.add(legL, legR, body, head, hairM, eyeL, eyeR, armL, armR);
    if (look.hairStyle === 2) {
      const bun = new T.Mesh(this.bunGeo || (this.bunGeo = new T.SphereGeometry(0.07, 10, 8)), this.mat(hair, { rough: 0.9 }));
      bun.position.set(0, 1.02, -0.06);
      g.add(bun);
    }
    if (kind === 'player' || kind === 'cashier') {
      const apron = this.box(0.24, 0.26, 0.02, this.mat('#ffffff', { rough: 0.9 }), 0, 0.44, 0.13, { shadow: false });
      g.add(apron);
    }
    if (kind === 'stocker') {
      g.add(this.box(0.34, 0.04, 0.27, this.mat('#f2e84b', { rough: 0.5 }), 0, 0.55, 0, { shadow: false }));
    }
    if (kind === 'player') {
      const cap = new T.Mesh(new T.SphereGeometry(0.162, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), this.mat('#ff8a3d', { rough: 0.6 }));
      cap.position.y = 0.88;
      const brim = this.box(0.2, 0.025, 0.14, this.mat('#ff8a3d', { rough: 0.6 }), 0, 0.93, 0.15, { shadow: false });
      g.add(cap, brim);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    g.scale.setScalar(1.15);
    g.userData = { legL, legR, body, head, armL, armR, carry: null, carryPid: null, basket: null, rot: 0 };
    return g;
  }

  syncAgent(key, a, kind) {
    let o = this.agentObjs.get(key);
    if (!o) {
      o = this.person(kind, a.look || {});
      this.scene.add(o);
      this.agentObjs.set(key, o);
    }
    o.userData.seen = true;
    const u = o.userData;
    const off = a.off || 0;
    o.position.set(a.x + 0.5 + off, 0, a.y + 0.55);
    // Orientation douce
    const dir = a.dir || 1;
    const want = dir === 1 ? 0 : dir === -1 ? Math.PI : dir === 2 ? Math.PI / 2 : -Math.PI / 2;
    let d = want - u.rot;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    u.rot += d * Math.min(1, this.dt * 12);
    o.rotation.y = u.rot;
    const moving = a.path && a.path.length;
    const ph = (a.walk || 0) * 7;
    const swing = moving ? Math.sin(ph) * 0.6 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.035 : Math.sin(this.time * 2 + (a.id || 0)) * 0.006;
    u.body.position.y = 0.48 + bob;
    u.head.position.y = 0.86 + bob;
    // Carton porté
    const pid = a.carry ? a.carry.product : null;
    if (pid !== u.carryPid) {
      if (u.carry) o.remove(u.carry);
      u.carry = null;
      u.carryPid = pid;
      if (pid) {
        u.carry = this.cartonMesh(pid);
        u.carry.scale.setScalar(0.62);
        u.carry.position.set(0, 0.5, 0.24);
        o.add(u.carry);
      }
    }
    u.armL.position.set(pid ? -0.17 : -0.2, pid ? 0.5 : 0.42 - swing * 0.03, pid ? 0.2 : 0.04);
    u.armR.position.set(pid ? 0.17 : 0.2, pid ? 0.5 : 0.42 + swing * 0.03, pid ? 0.2 : 0.04);
    // Panier client
    const hasBasket = a.basket && a.basket.length > 0;
    if (hasBasket && !u.basket) {
      u.basket = this.box(0.16, 0.1, 0.12, this.mat('#e85d3a', { rough: 0.6 }), 0.24, 0.36, 0.06);
      o.add(u.basket);
    } else if (!hasBasket && u.basket) {
      o.remove(u.basket);
      u.basket = null;
    }
    return o;
  }

  // ---------------------------------------------------------------- caméra / taille
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    this.w = box.width;
    this.h = box.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.overlay.width = Math.round(this.w * Math.min(3, window.devicePixelRatio || 1));
    this.overlay.height = Math.round(this.h * Math.min(3, window.devicePixelRatio || 1));
    this.overlay.style.width = `${this.w}px`;
    this.overlay.style.height = `${this.h}px`;
    this.odpr = this.overlay.width / this.w;
    // Caméra en perspective : on cherche la distance minimale qui montre tout le magasin.
    const cam = this.camera;
    cam.aspect = this.w / this.h;
    cam.updateProjectionMatrix();
    const pts = [[0, 0, 0.45], [COLS, 0, 0.45], [0, 1.95, 0.5], [COLS, 1.95, 0.5], [0.3, 0, ROWS - 0.6], [COLS - 0.3, 0, ROWS - 0.6], [0.2, 0.45, ROWS - 0.3], [COLS - 0.2, 0.45, ROWS - 0.3]];
    const v = new this.T3.Vector3();
    const fits = (d, ty) => {
      this.dist = d;
      this.target.z = ty;
      this.placeCamera(0);
      let minY = 9, maxY = -9;
      for (const [x, y, z] of pts) {
        v.set(x, y, z).project(cam);
        if (Math.abs(v.x) > 0.995) return { ok: false };
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      return { ok: maxY <= 0.985 && minY >= -0.985, minY, maxY };
    };
    // Recentrage vertical puis recherche par dichotomie de la distance.
    let ty = ROWS / 2;
    let lo = 8, hi = 80;
    for (let it = 0; it < 6; it++) {
      lo = 8; hi = 80;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid, ty).ok) hi = mid; else lo = mid;
      }
      const f = fits(hi, ty);
      // Décale la cible pour équilibrer les marges haut / bas.
      const off = (f.maxY + f.minY) / 2;
      ty -= off * 4;
    }
    let lo2 = 8, hi2 = 80;
    for (let i = 0; i < 30; i++) {
      const mid = (lo2 + hi2) / 2;
      if (fits(mid, ty).ok) hi2 = mid; else lo2 = mid;
    }
    fits(hi2, ty);
    this.baseZ = ty;
    this.unitPerPx = (2 * this.dist * Math.tan((FOV * Math.PI) / 360)) / this.h;
    this.placeCamera(0);
  }

  placeCamera(shiftPx) {
    const cam = this.camera;
    const t = this.target;
    const dist = this.dist;
    cam.position.set(t.x, t.y + Math.sin(PITCH) * dist, t.z + Math.cos(PITCH) * dist);
    cam.lookAt(t);
    if (shiftPx) {
      const up = new this.T3.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      cam.position.addScaledVector(up, -shiftPx * this.unitPerPx);
    }
    cam.updateMatrixWorld();
  }

  toScreen(x, y, z) {
    const v = this.tmpV || (this.tmpV = new this.T3.Vector3());
    v.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  pick(px, py) {
    const T = this.T3;
    const ndc = new T.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.pickables, false);
    if (hits.length && hits[0].object.userData.tile) return { ...hits[0].object.userData.tile };
    const p = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.groundPlane, p)) return null;
    const c = Math.floor(p.x);
    const r = Math.floor(p.z);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { r, c };
  }

  // Centre d'une case à l'écran (px CSS), à mi-hauteur des objets : sert à viser juste au doigt.
  tileScreen(r, c) {
    const y = r <= 1 ? 0.8 : 0.45;
    return this.toScreen(c + 0.5, y, r + 0.5);
  }

  addRipple(px, py) {
    this.ripples.push({ x: px, y: py, t: 0 });
  }

  // ---------------------------------------------------------------- image
  // Qualité adaptative : si le téléphone peine (moins de ~35 i/s), on allège l'image une fois.
  adaptQuality(dt) {
    if (this.lowQuality) return;
    this.perf = this.perf || { n: 0, sum: 0 };
    this.perf.n++;
    this.perf.sum += dt;
    if (this.perf.n < 90) return;
    const avg = this.perf.sum / this.perf.n;
    this.perf = { n: 0, sum: 0 };
    if (avg > 1 / 35) {
      this.lowQuality = true;
      this.dpr = Math.min(this.dpr, 1.25);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.w, this.h, false);
      this.renderer.shadowMap.type = this.T3.PCFShadowMap;
      this.scene.traverse((o) => { if (o.isDirectionalLight) { o.shadow.mapSize.set(1024, 1024); o.shadow.map?.dispose(); o.shadow.map = null; } });
    }
  }

  draw(dt) {
    this.dt = dt;
    this.time += dt;
    this.adaptQuality(dt);
    const g = this.game;
    const st = g.state;
    this.buildLayout();
    this.updateStock();
    this.updateDelivery();

    // Décalage quand le panneau de caisse couvre le bas de l'écran
    this.placeCamera(this.shift);
    const want = this.cover > 0 ? Math.max(0, this.toScreen(COLS / 2, 0, 13.3).y + this.shift - (this.h - this.cover - 6)) : 0;
    this.shift += (want - this.shift) * Math.min(1, dt * 10);
    if (Math.abs(want - this.shift) < 0.5) this.shift = want;
    this.placeCamera(this.shift);

    // Écran de l'ordinateur : pulse pendant une livraison
    this.screenMat.emissiveIntensity = st.pending.length ? 0.6 + 0.5 * Math.sin(this.time * 6) : 0.8;

    // Étagères compatibles avec le carton porté : lueur orange
    const carry = g.player.carry;
    for (const sh of st.shelves) {
      const o = this.shelfObjs?.get(sh.slot);
      if (!o) continue;
      const ok = carry && (sh.product === carry.product || !sh.product || sh.qty === 0) && sh.qty < SHELF_CAPACITY;
      o.back.emissiveIntensity = ok ? 0.35 + 0.25 * Math.sin(this.time * 6) : 0;
    }

    // Personnages
    for (const o of this.agentObjs.values()) o.userData.seen = false;
    this.syncAgent('player', g.player, 'player');
    if (g.stocker) this.syncAgent(`stocker-${g.stocker.id}`, g.stocker, 'stocker');
    for (const cu of g.customers) this.syncAgent(`c${cu.id}`, cu, 'customer');
    for (const [regId] of g.cashierAssignments()) {
      const reg = REGISTERS.find((x) => x.id === regId);
      this.syncAgent(`cashier-${regId}`, { x: reg.staff.c, y: reg.staff.r - 0.1, dir: -1, id: regId, path: [] }, 'cashier');
    }
    for (const [k, o] of this.agentObjs) {
      if (!o.userData.seen) {
        this.scene.remove(o);
        this.agentObjs.delete(k);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(dt);
  }

  // ---------------------------------------------------------------- calque 2D
  drawOverlay(dt) {
    const ctx = this.octx;
    const g = this.game;
    const st = g.state;
    ctx.setTransform(this.odpr, 0, 0, this.odpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const unit = this.toScreen(1, 0, 0).x - this.toScreen(0, 0, 0).x; // pixels par case
    const fs = (k) => Math.max(9, Math.round(unit * k));

    // Étiquettes de prix
    for (const sh of st.shelves) {
      const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
      if (!sl || !sh.product) continue;
      const p = PRODUCT_BY_ID[sh.product];
      const pt = this.toScreen(sl.c + 0.5, 0.06, sl.r + 0.86);
      const empty = sh.qty === 0;
      const ratio = st.prices[p.id] / Math.round(p.market * 100);
      const label = empty ? 'VIDE' : money(st.prices[p.id]);
      ctx.font = `800 ${fs(0.22)}px ${FONT3}`;
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = empty ? `rgba(232,72,61,${0.75 + 0.25 * Math.sin(this.time * 5)})` : ratio > 1.15 ? '#ffd9a8' : '#ffffff';
      rr2(ctx, pt.x - tw / 2, pt.y - fs(0.15), tw, fs(0.3), 4);
      ctx.fill();
      ctx.fillStyle = empty ? '#ffffff' : '#22333b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pt.x, pt.y + 1);
    }

    // Tutoriel : anneaux qui pulsent
    if (st.tutorial === 0) {
      const pt = this.toScreen(COMPUTER.tiles[0].c + 1, 0.9, COMPUTER.tiles[0].r + 0.4);
      this.pulse(ctx, pt.x, pt.y, unit * 0.9);
    }
    if (st.tutorial === 1 && !g.player.carry) {
      const i = st.delivery.findIndex((x) => x.length);
      if (i >= 0) {
        const pt = this.toScreen(DELIVERY_SPOTS[i].c + 0.5, 0.4, DELIVERY_SPOTS[i].r + 0.5);
        this.pulse(ctx, pt.x, pt.y, unit * 0.6);
      }
    }

    // Caisse sans personne alors que des clients attendent
    for (const regId of st.registers) {
      const q = g.queues.get(regId) || [];
      if (q.length && !g.registerStaffed(regId) && g.player.atRegister !== regId) {
        const reg = REGISTERS.find((x) => x.id === regId);
        const pt = this.toScreen(reg.staff.c + 0.5, 1.2, reg.staff.r + 0.3);
        const by = pt.y + Math.sin(this.time * 6) * 3;
        ctx.fillStyle = '#ff6b3d';
        ctx.beginPath(); ctx.arc(pt.x, by, unit * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${fs(0.4)}px ${FONT3}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', pt.x, by + 1);
        if (st.tutorial >= 3) this.pulse(ctx, pt.x, by, unit * 0.45);
      }
    }

    // Remplissage du rayon par le joueur
    const p = g.player;
    if (p.fill) {
      const pt = this.toScreen(p.x + 0.5, 1.25, p.y + 0.55);
      const k = p.fill.shelf.qty / SHELF_CAPACITY;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      rr2(ctx, pt.x - unit * 0.35, pt.y, unit * 0.7, 6, 3); ctx.fill();
      ctx.fillStyle = '#2bb673';
      rr2(ctx, pt.x - unit * 0.35, pt.y, unit * 0.7 * k, 6, 3); ctx.fill();
    }

    // Bulles et patience des clients
    for (const cu of g.customers) {
      const pt = this.toScreen(cu.x + 0.5 + (cu.off || 0), 1.15, cu.y + 0.55);
      if (cu.state === 'queue' && !cu.processing && cu.waited > cu.patience * 0.35) {
        const f = Math.max(0, 1 - cu.waited / cu.patience);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        rr2(ctx, pt.x - unit * 0.3, pt.y + 2, unit * 0.6, 5, 2.5); ctx.fill();
        ctx.fillStyle = f > 0.4 ? '#f2a541' : '#e8483d';
        rr2(ctx, pt.x - unit * 0.3, pt.y + 2, unit * 0.6 * f, 5, 2.5); ctx.fill();
      }
      if (cu.bubble) {
        ctx.globalAlpha = Math.min(1, cu.bubble.t * 3);
        const bw = unit * 0.56, bh = unit * 0.46;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 6;
        rr2(ctx, pt.x - bw / 2, pt.y - bh - 8, bw, bh, bh * 0.35); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(pt.x - 4, pt.y - 9); ctx.lineTo(pt.x + 4, pt.y - 9); ctx.lineTo(pt.x, pt.y - 2); ctx.fill();
        ctx.font = `${fs(0.3)}px ${FONT3}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cu.bubble.text, pt.x, pt.y - 8 - bh / 2 + 1);
        ctx.globalAlpha = 1;
      }
    }

    // Pièces qui s'envolent
    for (const f of g.fx) {
      const k = f.t / 1.2;
      const pt = this.toScreen(f.x + 0.5, 1.3, f.y + 0.5);
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${fs(0.36)}px ${FONT3}`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.fillStyle = '#e8a317';
      const y = pt.y - k * unit * 1.2;
      ctx.strokeText(`+${money(f.value)}`, pt.x, y);
      ctx.fillText(`+${money(f.value)}`, pt.x, y);
      ctx.globalAlpha = 1;
    }

    // Ondes de toucher
    for (const rp of this.ripples) {
      rp.t += dt;
      const k = rp.t / 0.45;
      ctx.strokeStyle = `rgba(45,122,115,${0.55 * (1 - k)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 6 + k * unit * 0.6, 0, Math.PI * 2); ctx.stroke();
    }
    this.ripples = this.ripples.filter((r) => r.t < 0.45);
  }

  pulse(ctx, x, y, rad) {
    const k = (this.time * 1.2) % 1;
    ctx.strokeStyle = `rgba(255,138,61,${0.9 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, rad * (0.8 + k * 0.5), 0, Math.PI * 2); ctx.stroke();
  }
}

export { PRODUCTS, SPOT_STACK };
