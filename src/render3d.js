// Rendu 3D low-poly (Three.js) : magasin vu de haut en biais, lumière chaude et ombres douces.
// V1.2 : décor fusionné par matériau (peu d'appels de rendu), articles reconnaissables instanciés,
// personnages mieux proportionnés et animés, petites touches de vie (plantes, affiches, sacs).
// Les textes (prix, bulles, alertes, gains) sont dessinés sur un calque 2D par-dessus.
import { COLS, ROWS, DELIVERY_SPOTS, ZONES, SHELF_SLOTS, SHELF_CAPACITY, REGISTERS, PRODUCT_BY_ID, PRODUCTS, DOOR, SPOT_STACK, SHOP_TOP, AUTO_SPOTS, staffLook } from './data.js';
import { drawProduct, money } from './render.js';
import { DECO_BY_ID } from './rewards.js';

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

function mix(hex, amt, to = 255) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r += (to - r) * amt; g += (to - g) * amt; b += (to - b) * amt;
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('')}`;
}
const lighten = (hex, a) => mix(hex, a, 255);
const darken = (hex, a) => mix(hex, a, 0);

// Clarté d'une couleur (0 = noir, 1 = blanc) : texte sombre sur les couleurs claires.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// Pseudo-hasard stable (même décor à chaque reconstruction).
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.THREE && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- fusion de géométries
// On empile des pièces simples (boîtes, cylindres…) colorées par sommet, puis on les fusionne
// en UNE géométrie par matériau : un seul appel de rendu pour tout le décor d'un même matériau.
class Batch {
  constructor(T) {
    this.T = T;
    this.buckets = new Map();
    this.m = new T.Matrix4();
    this.q = new T.Quaternion();
    this.e = new T.Euler();
    this.v = new T.Vector3();
    this.s = new T.Vector3();
    this.c = new T.Color();
  }
  // base : matrice du groupe (ou null) ; o : { x, y, z, rx, ry, rz, sx, sy, sz }
  add(bucket, geo, color, o = {}, base = null) {
    const T = this.T;
    this.e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    this.q.setFromEuler(this.e);
    this.v.set(o.x || 0, o.y || 0, o.z || 0);
    this.s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    const m = new T.Matrix4().compose(this.v, this.q, this.s);
    if (base) m.premultiply(base);
    let list = this.buckets.get(bucket);
    if (!list) this.buckets.set(bucket, (list = []));
    list.push({ geo, color, m });
  }
  // Boîte : dimensions réelles w × h × d, posée sur y (bas de la boîte).
  box(bucket, color, w, h, d, x, y, z, base = null, extra = {}) {
    this.add(bucket, Batch.geo(this.T, 'box'), color, { x, y: y + h / 2, z, sx: w, sy: h, sz: d, ...extra }, base);
  }
  merge() {
    const T = this.T;
    const out = new Map();
    for (const [bucket, list] of this.buckets) {
      let n = 0;
      const geos = list.map((p) => {
        const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
        g.applyMatrix4(p.m);
        n += g.attributes.position.count;
        return g;
      });
      const pos = new Float32Array(n * 3);
      const nor = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      let k = 0;
      geos.forEach((g, i) => {
        const c = this.c.set(list[i].color);
        const cnt = g.attributes.position.count;
        pos.set(g.attributes.position.array, k * 3);
        nor.set(g.attributes.normal.array, k * 3);
        for (let j = 0; j < cnt; j++) {
          col[(k + j) * 3] = c.r; col[(k + j) * 3 + 1] = c.g; col[(k + j) * 3 + 2] = c.b;
        }
        k += cnt;
        g.dispose();
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      out.set(bucket, geo);
    }
    this.buckets.clear();
    return out;
  }
  // Géométries de base partagées (taille unité).
  static geo(T, kind) {
    const cache = Batch.cache || (Batch.cache = new Map());
    let g = cache.get(kind);
    if (g) return g;
    switch (kind) {
      case 'box': g = new T.BoxGeometry(1, 1, 1); break;
      case 'cyl': g = new T.CylinderGeometry(0.5, 0.5, 1, 14); break;
      case 'cyl8': g = new T.CylinderGeometry(0.5, 0.5, 1, 8); break;
      case 'cone': g = new T.CylinderGeometry(0.2, 0.5, 1, 14); break;
      case 'sph': g = new T.SphereGeometry(0.5, 14, 10); break;
      case 'sphLow': g = new T.SphereGeometry(0.5, 8, 6); break;
      case 'ico': g = new T.IcosahedronGeometry(0.5, 1); break;
      case 'prism': g = new T.CylinderGeometry(0.5, 0.5, 1, 3); break;
      case 'torus': g = new T.TorusGeometry(0.5, 0.08, 6, 14, Math.PI); break;
      case 'cap': g = new T.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); break;
      default: g = new T.BoxGeometry(1, 1, 1);
    }
    cache.set(kind, g);
    return g;
  }
}

// Articles en rayon : silhouette par forme (largeur, hauteur max ≈ 0,3 pour tenir sous la tablette).
function productParts(b, p, T) {
  const c = p.color;
  const G = (k) => Batch.geo(T, k);
  const dk = darken(c, 0.3);
  const lt = lighten(c, 0.55);
  switch (p.shape) {
    case 'bottle':
      b.add('i', G('cyl'), lighten(c, 0.35), { y: 0.1, sx: 0.12, sy: 0.2, sz: 0.12 });
      b.add('i', G('cyl'), c, { y: 0.1, sx: 0.125, sy: 0.08, sz: 0.125 });
      b.add('i', G('cone'), lighten(c, 0.35), { y: 0.235, sx: 0.12, sy: 0.07, sz: 0.12 });
      b.add('i', G('cyl8'), '#ffffff', { y: 0.29, sx: 0.045, sy: 0.04, sz: 0.045 });
      break;
    case 'can':
      b.add('i', G('cyl'), c, { y: 0.09, sx: 0.12, sy: 0.17, sz: 0.12 });
      b.add('i', G('cyl'), '#ffffff', { y: 0.1, sx: 0.122, sy: 0.05, sz: 0.122 });
      b.add('i', G('cyl'), '#c9d0d6', { y: 0.185, sx: 0.11, sy: 0.02, sz: 0.11 });
      break;
    case 'bag':
      b.add('i', G('sph'), c, { y: 0.13, sx: 0.2, sy: 0.25, sz: 0.1 });
      b.box('i', dk, 0.17, 0.035, 0.05, 0, 0.245, 0);
      b.add('i', G('cyl'), lt, { y: 0.13, z: 0.045, rx: Math.PI / 2, sx: 0.09, sy: 0.02, sz: 0.09 });
      break;
    case 'box':
      b.box('i', c, 0.17, 0.26, 0.07, 0, 0, 0);
      b.box('i', dk, 0.172, 0.05, 0.072, 0, 0.21, 0);
      b.box('i', '#fff8ec', 0.12, 0.08, 0.01, 0, 0.09, 0.036);
      break;
    case 'carton':
      b.box('i', c, 0.12, 0.19, 0.12, 0, 0, 0);
      b.add('i', G('prism'), dk, { y: 0.21, rx: -Math.PI / 2, sx: 0.14, sy: 0.12, sz: 0.08 });
      b.box('i', p.id === 'lait' ? '#3a7bd5' : '#ffffff', 0.122, 0.05, 0.122, 0, 0.06, 0);
      b.add('i', G('cyl8'), '#ffffff', { y: 0.255, x: 0.03, sx: 0.03, sy: 0.03, sz: 0.03 });
      break;
    case 'pack':
      b.box('i', c, 0.2, 0.15, 0.09, 0, 0, 0);
      b.box('i', lt, 0.13, 0.06, 0.01, 0, 0.05, 0.046);
      b.box('i', dk, 0.202, 0.03, 0.092, 0, 0.12, 0);
      break;
    case 'bar':
      b.box('i', c, 0.2, 0.07, 0.11, 0, 0, 0);
      b.box('i', lt, 0.05, 0.072, 0.112, 0, 0, 0);
      b.box('i', c, 0.19, 0.06, 0.1, 0, 0.07, -0.005);
      break;
    case 'tube':
      b.add('i', G('cyl'), c, { y: 0.12, sx: 0.11, sy: 0.22, sz: 0.07 });
      b.add('i', G('cyl'), lt, { y: 0.12, sx: 0.112, sy: 0.07, sz: 0.072 });
      b.add('i', G('cyl8'), '#ffffff', { y: 0.255, sx: 0.06, sy: 0.05, sz: 0.06 });
      break;
    case 'jar':
      b.add('i', G('cyl'), c, { y: 0.085, sx: 0.14, sy: 0.17, sz: 0.14 });
      b.add('i', G('cyl'), '#fff8ec', { y: 0.08, sx: 0.142, sy: 0.06, sz: 0.142 });
      b.add('i', G('cyl'), p.id === 'bonbons' ? '#ffffff' : '#e3c26a', { y: 0.19, sx: 0.13, sy: 0.04, sz: 0.13 });
      break;
    case 'wheel':
      b.add('i', G('cyl'), c, { y: 0.045, sx: 0.21, sy: 0.09, sz: 0.21 });
      b.add('i', G('cyl'), lighten(c, 0.3), { y: 0.092, sx: 0.19, sy: 0.006, sz: 0.19 });
      b.box('i', '#d9533b', 0.06, 0.03, 0.005, 0, 0.03, 0.105);
      break;
    default:
      b.box('i', c, 0.16, 0.22, 0.1, 0, 0, 0);
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
    r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9dcc6');
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
    this.dist = 30;
    this.target = new THREE.Vector3(COLS / 2, 0.45, ROWS / 2 - 0.3);

    // Lumières : ciel chaud + soleil de fin d'après-midi (ombres douces) + contre-jour frais.
    scene.add(new THREE.HemisphereLight('#fff3e2', '#b59f86', 1.15));
    const sun = new THREE.DirectionalLight('#ffe1b8', 2.1);
    sun.position.set(COLS / 2 - 6, 15, ROWS / 2 + 5);
    sun.target.position.set(COLS / 2, 0, ROWS / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    const sc = sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 40;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    const fill = new THREE.DirectionalLight('#d6e6ff', 0.45);
    fill.position.set(COLS + 6, 8, -4);
    scene.add(fill);

    this.ray = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.pickables = [];
    this.pickMat = new THREE.MeshBasicMaterial({ visible: false });

    // Matériaux partagés (couleurs par sommet)
    this.vm = {
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
      satin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 }),
      metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }),
      item: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.02 }),
      skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 })
    };

    this.world = new THREE.Group(); // éléments qui dépendent de l'aménagement
    scene.add(this.world);
    this.buildConstant();
    this.buildHalos();

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

  // Ajoute les géométries fusionnées d'un Batch à un parent.
  addBatch(batch, parent, { shadow = true, receive = true } = {}) {
    const meshes = [];
    for (const [bucket, geo] of batch.merge()) {
      const m = new this.T3.Mesh(geo, this.vm[bucket] || this.vm.paint);
      m.castShadow = shadow && bucket !== 'glass' && bucket !== 'glow';
      m.receiveShadow = receive && bucket !== 'glow';
      parent.add(m);
      meshes.push(m);
    }
    return meshes;
  }

  plane(w, h, tex, x, y, z, opts = {}) {
    const m = new this.T3.Mesh(new this.T3.PlaneGeometry(w, h), new this.T3.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, ...opts }));
    m.position.set(x, y, z);
    return m;
  }

  // Zone touchable invisible (le rayon de toucher vise la case de l'objet).
  pickBox(w, h, d, x, y, z, tile, parent) {
    const m = new this.T3.Mesh(Batch.geo(this.T3, 'box'), this.pickMat);
    m.scale.set(w, h, d);
    m.position.set(x, y + h / 2, z);
    m.userData = { tile };
    m.updateMatrixWorld();
    parent.add(m);
    this.pickables.push(m);
    return m;
  }

  // ---------------------------------------------------------------- décor fixe
  buildConstant() {
    const T = this.T3;
    const s = this.scene;
    const b = new Batch(T);
    const G = (k) => Batch.geo(T, k);

    // Trottoir pavé autour du magasin
    const pave = this.canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#d9cfbf'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const v = hash(x * 31 + y * 7);
        c.fillStyle = `rgb(${205 + v * 22 | 0},${195 + v * 20 | 0},${178 + v * 18 | 0})`;
        c.fillRect(x * 64 + 2 + (y % 2) * 32, y * 64 + 2, 60, 60);
      }
    });
    pave.wrapS = pave.wrapT = T.RepeatWrapping;
    pave.repeat.set(10, 10);
    const outside = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshStandardMaterial({ map: pave, roughness: 0.95 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(COLS / 2, -0.02, ROWS / 2);
    outside.receiveShadow = true;
    s.add(outside);

    // Sol de la réserve (V1.4 : 3 lignes, toute la largeur) : béton, palettes, bande de sécurité
    const RH = SHOP_TOP - 1; // lignes de réserve
    const conc = this.canvasTex(576, 64 * RH, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#b9b5ab'); gr.addColorStop(1, '#cbc7bc');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        c.fillStyle = `rgba(${i % 2 ? 255 : 40},${i % 2 ? 255 : 40},${i % 2 ? 250 : 30},${0.03 + (i % 5) * 0.012})`;
        c.fillRect((i * 97.13) % w, (i * 53.7) % h, 1 + (i % 3), 1 + (i % 2));
      }
      // fines lignes de la grille : chaque case est un emplacement possible
      c.strokeStyle = 'rgba(80,70,55,0.13)'; c.lineWidth = 2;
      for (let x = 0; x <= w; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.strokeStyle = 'rgba(232,178,40,0.9)'; c.lineWidth = 3; c.setLineDash([10, 7]);
      for (const i of AUTO_SPOTS) { const d = DELIVERY_SPOTS[i]; rr2(c, d.c * 64 + 4, (d.r - 1) * 64 + 4, 56, 56, 8); c.stroke(); }
      c.setLineDash([]);
      for (let x = 0; x < w; x += 24) {
        c.fillStyle = '#f2c230'; c.fillRect(x, h - 8, 12, 8);
        c.fillStyle = '#2c2c2c'; c.fillRect(x + 12, h - 8, 12, 8);
      }
    });
    const reserve = new T.Mesh(new T.PlaneGeometry(COLS, RH), new T.MeshStandardMaterial({ map: conc, roughness: 0.95 }));
    reserve.rotation.x = -Math.PI / 2;
    reserve.position.set(COLS / 2, 0, 1 + RH / 2);
    reserve.receiveShadow = true;
    s.add(reserve);
    for (const i of AUTO_SPOTS) {
      const d = DELIVERY_SPOTS[i];
      const x = d.c + 0.5, z = d.r + 0.5;
      for (const dx of [-0.26, 0, 0.26]) b.box('paint', '#b88a55', 0.1, 0.06, 0.62, x + dx, 0, z);
      for (const dz of [-0.24, 0, 0.24]) b.box('paint', '#c99a62', 0.7, 0.03, 0.14, x, 0.06, z + dz);
    }

    // Mur du fond : plâtre crème, soubassement sarcelle, plinthe et corniche
    const W = COLS + 0.4;
    b.box('paint', '#f1e6d4', W, 1.9, 0.5, COLS / 2, 0, 0.75);
    b.box('paint', '#2a6e6a', W, 0.62, 0.52, COLS / 2, 0, 0.75);
    b.box('satin', '#22595a', W, 0.06, 0.55, COLS / 2, 0.62, 0.75);
    b.box('satin', '#d8c3a0', W, 0.08, 0.56, COLS / 2, 1.86, 0.75);
    // Fronton de l'enseigne + guirlande d'ampoules
    b.box('paint', '#1f5c5a', W, 2.6, 0.3, COLS / 2, 1.9, 0.6, null);
    b.box('satin', '#174746', W + 0.1, 0.1, 0.36, COLS / 2, 4.46, 0.6);
    for (let i = 0; i < 17; i++) {
      const x = 0.5 + i * 0.5;
      b.add('glow', G('sphLow'), i % 2 ? '#ffe6a8' : '#fff6d8', { x, y: 4.2, z: 0.78, sx: 0.09, sy: 0.09, sz: 0.09 });
      b.add('glow', G('sphLow'), i % 2 ? '#fff6d8' : '#ffe6a8', { x, y: 2.1, z: 0.78, sx: 0.09, sy: 0.09, sz: 0.09 });
    }
    // (V1.4 : plus de racks muraux ni de cartons décoratifs : seuls les vrais cartons sont dans la réserve)

    // Murs latéraux : soubassement, vitres, chapeau en bois
    for (const x of [-0.12, COLS + 0.12]) {
      b.box('paint', '#f1e6d4', 0.25, 0.62, 15.2, x, 0, ROWS / 2 + 0.2);
      b.box('satin', '#2a6e6a', 0.27, 0.16, 15.2, x, 0, ROWS / 2 + 0.2);
      b.box('glass', '#bfe6f0', 0.1, 0.42, 15.2, x, 0.62, ROWS / 2 + 0.2);
      for (let z = 1; z <= ROWS; z += 1.5) b.box('paint', '#e8dcc6', 0.24, 0.42, 0.08, x, 0.62, z);
      b.box('paint', '#c9a172', 0.32, 0.07, 15.3, x, 1.04, ROWS / 2 + 0.2);
    }

    // Façade vitrée, encadrement de porte et portes coulissantes ouvertes
    const zf = ROWS - 0.55;
    for (let c = 0; c < COLS; c++) {
      if (c === DOOR.c) continue;
      b.box('paint', '#2a6e6a', 1, 0.24, 0.3, c + 0.5, 0, zf);
      b.box('glass', '#bfe6f0', 0.96, 0.5, 0.05, c + 0.5, 0.24, zf);
      b.box('metal', '#3f4a52', 0.05, 0.56, 0.08, c + (c < DOOR.c ? 0.03 : 0.97), 0.24, zf);
    }
    b.box('metal', '#3f4a52', W, 0.05, 0.12, COLS / 2, 0.76, zf);
    for (const dx of [-0.5, 0.5]) b.box('metal', '#3f4a52', 0.08, 0.84, 0.16, DOOR.c + 0.5 + dx, 0, zf);
    for (const dx of [-0.78, 0.78]) b.box('glass', '#d8f1f6', 0.5, 0.7, 0.03, DOOR.c + 0.5 + dx, 0.03, zf + 0.12);
    // Store banne rayé (dehors)
    for (let i = 0; i < 18; i++) {
      const x = i * 0.5 + 0.25;
      b.box('paint', i % 2 ? '#ffffff' : '#ff8a3d', 0.5, 0.04, 0.42, x, 0.46, ROWS + 0.12, null, { rx: 0.4 });
      b.box('paint', i % 2 ? '#f3e9dc' : '#e8742c', 0.5, 0.1, 0.03, x, 0.31, ROWS + 0.32);
    }
    // Tapis d'entrée
    b.box('paint', '#4f6266', 0.9, 0.015, 0.75, DOOR.c + 0.5, 0, ROWS - 1.45);
    b.box('paint', '#5f7579', 0.8, 0.017, 0.08, DOOR.c + 0.5, 0, ROWS - 1.6);
    b.box('paint', '#5f7579', 0.8, 0.017, 0.08, DOOR.c + 0.5, 0, ROWS - 1.3);

    // Plante verte et pile de paniers près de l'entrée
    const plant = (x, z, k = 1, y0 = 0) => {
      b.add('paint', G('cyl'), '#c86b3c', { x, y: y0 + 0.12 * k, z, sx: 0.3 * k, sy: 0.24 * k, sz: 0.3 * k });
      b.add('paint', G('cyl'), '#5b3b26', { x, y: y0 + 0.245 * k, z, sx: 0.26 * k, sy: 0.02, sz: 0.26 * k });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + x;
        b.add('paint', G('ico'), i % 2 ? '#4f9d5a' : '#3d8a4c', { x: x + Math.cos(a) * 0.08 * k, y: y0 + (0.38 + i * 0.06) * k, z: z + Math.sin(a) * 0.08 * k, sx: 0.26 * k, sy: 0.24 * k, sz: 0.26 * k });
      }
    };
    // (V1.6 : la plante de l'entrée est dessinée avec les décorations, voir buildDeco)
    void plant;
    for (let i = 0; i < 4; i++) {
      const y = i * 0.07;
      b.box('satin', '#e8483d', 0.34, 0.06, 0.24, COLS - 0.3, y, ROWS - 1.35);
    }
    b.add('metal', G('torus'), '#2b3036', { x: COLS - 0.3, y: 0.3, z: ROWS - 1.35, sx: 0.28, sy: 0.28, sz: 0.28 });

    this.addBatch(b, s);
    // (V1.4 : bureau et ordinateur retirés, on commande avec le bouton « Commander » ; la place sert à la réserve)

    // Panneau RÉSERVE, affiche promo, horloge (V1.6 : l'enseigne est dans buildDeco, sa couleur se choisit)
    s.add(this.plane(2.2, 0.42, this.canvasTex(512, 98, (c, w, h) => {
      c.fillStyle = '#1f5c5a'; rr2(c, 0, 0, w, h, 20); c.fill();
      c.strokeStyle = '#f2c230'; c.lineWidth = 6; rr2(c, 6, 6, w - 12, h - 12, 16); c.stroke();
      c.fillStyle = '#ffffff'; c.font = `800 60px ${FONT3}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('RÉSERVE', w / 2, h / 2 + 4);
    }), 2.9, 1.6, 1.01));
    s.add(this.plane(0.62, 0.8, this.canvasTex(160, 206, (c, w, h) => {
      c.fillStyle = '#ffd23f'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8483d'; c.beginPath(); c.arc(w / 2, 82, 62, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = `800 46px ${FONT3}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('-20%', w / 2, 86);
      c.fillStyle = '#7a2a12'; c.font = `800 30px ${FONT3}`;
      c.fillText('PROMO', w / 2, 172);
    }), 6.55, 1.36, 1.01, { toneMapped: true }));
    s.add(this.plane(0.4, 0.4, this.canvasTex(128, 128, (c) => {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
      c.lineWidth = 8; c.strokeStyle = '#2b3036'; c.stroke();
      c.lineCap = 'round'; c.lineWidth = 7;
      c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 28); c.stroke();
      c.beginPath(); c.moveTo(64, 64); c.lineTo(90, 72); c.stroke();
    }), 8.3, 1.55, 1.01, { toneMapped: true }));
  }

  // V1.6 : décorations (coffre déco), sans effet sur le jeu. Reconstruites seulement quand le choix change.
  buildDeco() {
    const placed = (this.game.state.deco && this.game.state.deco.placed) || {};
    const key = `${placed.affiche}|${placed.plante}|${placed.enseigne}`;
    if (key === this.decoKey) return;
    this.decoKey = key;
    const T = this.T3;
    if (this.decoGroup) {
      this.scene.remove(this.decoGroup);
      this.decoGroup.traverse((m) => { if (m.isMesh) { if (m.geometry !== Batch.geo(T, 'box')) m.geometry.dispose(); if (m.material.map) { m.material.map.dispose(); m.material.dispose(); } } });
    }
    const grp = new T.Group();
    this.decoGroup = grp;
    this.scene.add(grp);
    const G = (k) => Batch.geo(T, k);
    // Enseigne
    const ens = DECO_BY_ID[placed.enseigne];
    const [e1, e2, e3] = ens ? ens.colors : ['#ff9d52', '#f2762a', '#ffffff'];
    grp.add(this.plane(7.6, 1.5, this.canvasTex(1024, 202, (c, w, h) => {
      c.fillStyle = '#fff7ea'; rr2(c, 4, 4, w - 8, h - 8, 40); c.fill();
      const gr = c.createLinearGradient(0, 14, 0, h - 14);
      gr.addColorStop(0, ens ? e2 : e1); gr.addColorStop(1, ens ? e1 : e2);
      c.fillStyle = gr; rr2(c, 14, 14, w - 28, h - 28, 32); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.font = `800 104px ${FONT3}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Ma P’tite Supérette', w / 2 + 4, h / 2 + 13);
      c.fillStyle = e3;
      c.fillText('Ma P’tite Supérette', w / 2, h / 2 + 8);
    }), COLS / 2, 3.15, 0.76));
    // Affiche (mur du fond, à gauche du panneau RÉSERVE)
    const aff = DECO_BY_ID[placed.affiche];
    if (aff) {
      grp.add(this.plane(0.62, 0.8, this.canvasTex(160, 206, (c, w, h) => {
        c.fillStyle = aff.colors[0]; c.fillRect(0, 0, w, h);
        c.fillStyle = aff.colors[1]; c.beginPath(); c.arc(w / 2, 84, 56, 0, Math.PI * 2); c.fill();
        c.fillStyle = aff.colors[2]; c.font = `800 34px ${FONT3}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(aff.text, w / 2, 86);
        c.fillStyle = aff.colors[1]; c.font = `800 22px ${FONT3}`;
        c.fillText('Ma P’tite Supérette', w / 2, 176);
      }), 0.9, 1.36, 1.01, { toneMapped: true }));
    }
    // Plante de l'entrée
    const pl = DECO_BY_ID[placed.plante];
    const b = new Batch(T);
    const x = 0.3, z = ROWS - 1.3;
    const pot = pl ? pl.colors[0] : '#c86b3c';
    const leaf = pl ? pl.colors[1] : '#4f9d5a';
    const shape = pl ? pl.shape : 'base';
    if (shape === 'palmier') {
      b.add('paint', G('cyl'), pot, { x, y: 0.14, z, sx: 0.34, sy: 0.28, sz: 0.34 });
      b.add('paint', G('cyl'), '#9c6b3e', { x, y: 0.55, z, sx: 0.07, sy: 0.6, sz: 0.07 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add('paint', G('sph'), i % 2 ? leaf : '#3d7a3a', { x: x + Math.cos(a) * 0.18, y: 0.86, z: z + Math.sin(a) * 0.18, sx: 0.36, sy: 0.06, sz: 0.12, ry: -a });
      }
    } else if (shape === 'cactus') {
      b.add('paint', G('cyl'), pot, { x, y: 0.1, z, sx: 0.28, sy: 0.2, sz: 0.28 });
      b.add('paint', G('cyl8'), leaf, { x, y: 0.38, z, sx: 0.14, sy: 0.36, sz: 0.14 });
      b.add('paint', G('cyl8'), leaf, { x: x + 0.1, y: 0.42, z, sx: 0.07, sy: 0.14, sz: 0.07 });
      b.add('paint', G('sphLow'), '#ff6fa8', { x, y: 0.58, z, sx: 0.07, sy: 0.05, sz: 0.07 });
    } else {
      b.add('paint', G('cyl'), pot, { x, y: 0.12, z, sx: 0.3, sy: 0.24, sz: 0.3 });
      b.add('paint', G('cyl'), '#5b3b26', { x, y: 0.245, z, sx: 0.26, sy: 0.02, sz: 0.26 });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + x;
        b.add('paint', G('ico'), i % 2 ? leaf : '#3d8a4c', { x: x + Math.cos(a) * 0.08, y: 0.38 + i * 0.06, z: z + Math.sin(a) * 0.08, sx: 0.26, sy: 0.24, sz: 0.26 });
      }
      if (shape === 'fleurs') for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        b.add('paint', G('sphLow'), leaf, { x: x + Math.cos(a) * 0.12, y: 0.56 + (i % 2) * 0.05, z: z + Math.sin(a) * 0.12, sx: 0.08, sy: 0.08, sz: 0.08 });
      }
    }
    this.addBatch(b, grp);
  }

  // Halos au sol (rayon compatible avec le carton porté, mode « Déplacer ») : un seul appel de rendu.
  buildHalos() {
    const T = this.T3;
    const tex = this.canvasTex(128, 128, (c) => {
      const g = c.createRadialGradient(64, 64, 10, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0.0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    });
    const geo = new T.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.haloMat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 });
    this.halos = new T.InstancedMesh(geo, this.haloMat, 32);
    this.halos.count = 0;
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 2;
    this.halos.setColorAt(0, new T.Color('#ffffff'));
    this.scene.add(this.halos);
  }

  // ---------------------------------------------------------------- aménagement (étagères, caisses, sol)
  buildLayout() {
    const g = this.game;
    const st = g.state;
    const solDeco = DECO_BY_ID[st.deco && st.deco.placed && st.deco.placed.sol];
    const key = `${st.zones.join()}|${st.registers.join()}|${st.shelves.map((x) => x.slot).join()}|${solDeco ? solDeco.id : ''}`;
    if (key === this.staticKey) return;
    const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const tiles = solDeco ? [hexRgb(solDeco.colors[1]), hexRgb(solDeco.colors[0])] : [[233, 225, 209], [246, 240, 228]];
    this.staticKey = key;
    const T = this.T3;
    for (const o of [...this.world.children]) {
      this.world.remove(o);
      o.traverse((m) => {
        if (m.isMesh && m.geometry && m.geometry !== Batch.geo(T, 'box')) m.geometry.dispose();
        if (m.isMesh && m.userData.ownTex) { m.material.map?.dispose(); m.material.dispose(); }
      });
    }
    this.pickables = this.pickables.filter((m) => m.parent !== this.world && m.parent);
    this.shelfObjs = new Map();

    // Sol de la boutique : carrelage chaud, joints, flaques de lumière des plafonniers, marquages
    const px = 96;
    const rows = ROWS - SHOP_TOP;
    const floorTex = this.canvasTex(COLS * px, rows * px, (c, w, h) => {
      for (let r = 0; r < rows; r++) for (let col = 0; col < COLS; col++) {
        const v = hash(r * 13 + col * 7) * 0.05;
        const base = tiles[(r + col) % 2];
        c.fillStyle = `rgb(${base[0] - v * 255 | 0},${base[1] - v * 230 | 0},${base[2] - v * 200 | 0})`;
        c.fillRect(col * px, r * px, px, px);
        const gl = c.createLinearGradient(col * px, r * px, col * px + px, r * px + px);
        gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gl; c.fillRect(col * px, r * px, px, px);
      }
      c.strokeStyle = 'rgba(120,96,70,0.22)';
      c.lineWidth = 2;
      for (let r = 0; r <= rows; r++) { c.beginPath(); c.moveTo(0, r * px); c.lineTo(w, r * px); c.stroke(); }
      for (let col = 0; col <= COLS; col++) { c.beginPath(); c.moveTo(col * px, 0); c.lineTo(col * px, h); c.stroke(); }
      // Lumière des plafonniers
      for (const [cx, cy] of [[2.2, 0.8], [6.8, 0.8], [2.2, 3.8], [6.8, 3.8], [4.5, 6.6], [1.6, 8.3], [7.4, 8.3]]) {
        const grd = c.createRadialGradient(cx * px, cy * px, 0, cx * px, cy * px, px * 2.4);
        grd.addColorStop(0, 'rgba(255,248,225,0.55)');
        grd.addColorStop(1, 'rgba(255,248,225,0)');
        c.fillStyle = grd;
        c.fillRect(cx * px - px * 2.5, cy * px - px * 2.5, px * 5, px * 5);
      }
      // Ombre portée douce le long des murs
      const edge = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
        const gr = c.createLinearGradient(gx0, gy0, gx1, gy1);
        gr.addColorStop(0, 'rgba(90,70,50,0.22)'); gr.addColorStop(1, 'rgba(90,70,50,0)');
        c.fillStyle = gr; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      };
      edge(0, 0, px * 0.5, h, 0, 0, px * 0.5, 0);
      edge(w - px * 0.5, 0, w, h, w, 0, w - px * 0.5, 0);
      // Allées verrouillées
      for (const z of ZONES) {
        if (st.zones.includes(z.id)) continue;
        const x = px, y = (z.row - SHOP_TOP) * px - px * 0.1, ww = px * 7, hh = px * 1.2;
        c.save();
        rr2(c, x, y, ww, hh, 18); c.clip();
        c.fillStyle = 'rgba(60,50,40,0.07)'; c.fillRect(x, y, ww, hh);
        c.strokeStyle = 'rgba(242,170,40,0.5)'; c.lineWidth = 18;
        for (let i = -hh; i < ww; i += 52) { c.beginPath(); c.moveTo(x + i, y + hh); c.lineTo(x + i + hh, y); c.stroke(); }
        c.restore();
        c.fillStyle = 'rgba(255,255,255,0.85)';
        rr2(c, x + ww / 2 - px * 2.1, y + hh / 2 - px * 0.3, px * 4.2, px * 0.6, px * 0.3); c.fill();
        c.fillStyle = 'rgba(40,50,48,0.9)';
        c.font = `800 ${px * 0.34}px ${FONT3}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`🔒 ${z.label} · niveau ${z.level}`, x + ww / 2, y + hh / 2 + 3);
      }
      // Emplacements libres : « + »
      for (const sl of SHELF_SLOTS) {
        if (!st.zones.includes(sl.zone) || st.shelves.some((x) => x.slot === sl.id)) continue;
        const x0 = sl.c * px, y0 = (sl.r - SHOP_TOP) * px;
        c.fillStyle = 'rgba(45,122,115,0.08)';
        rr2(c, x0 + 10, y0 + 10, px - 20, px - 20, 14); c.fill();
        c.strokeStyle = 'rgba(45,122,115,0.55)'; c.lineWidth = 4; c.setLineDash([12, 9]);
        rr2(c, x0 + 10, y0 + 10, px - 20, px - 20, 14); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(45,122,115,0.75)';
        c.beginPath(); c.arc(x0 + px / 2, y0 + px / 2, px * 0.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff'; c.font = `800 ${px * 0.36}px ${FONT3}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('+', x0 + px / 2, y0 + px / 2 + 2);
      }
      for (const reg of REGISTERS) {
        if (st.registers.includes(reg.id)) continue;
        const x = reg.counter[0].c * px, y = (reg.counter[0].r - SHOP_TOP) * px;
        c.strokeStyle = 'rgba(45,122,115,0.45)'; c.lineWidth = 4; c.setLineDash([12, 9]);
        rr2(c, x + 8, y + 8, px * 2 - 16, px - 16, 12); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(45,122,115,0.75)'; c.font = `800 ${px * 0.24}px ${FONT3}`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`Caisse 2 · niv. ${reg.level}`, x + px, y + px / 2);
      }
      // Marquage au sol des files d'attente
      for (const reg of REGISTERS) {
        if (!st.registers.includes(reg.id)) continue;
        c.fillStyle = 'rgba(255,138,61,0.22)';
        for (const t of [reg.pay, ...reg.queue.slice(0, 2)]) { rr2(c, t.c * px + 26, (t.r - SHOP_TOP) * px + 26, px - 52, px - 52, 10); c.fill(); }
      }
    });
    const floor = new T.Mesh(new T.PlaneGeometry(COLS, rows), new T.MeshStandardMaterial({ map: floorTex, roughness: 0.38, metalness: 0.02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(COLS / 2, 0, SHOP_TOP + rows / 2);
    floor.receiveShadow = true;
    floor.userData.ownTex = true;
    this.world.add(floor);

    // Étagères : gondoles bois + métal, fusionnées
    const b = new Batch(T);
    const base = new T.Matrix4();
    for (const sh of st.shelves) {
      const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
      base.makeTranslation(sl.c + 0.5, 0, sl.r + 0.5);
      b.box('paint', '#5d6b74', 0.92, 0.1, 0.62, 0, 0, 0.02, base);
      b.box('paint', '#8fb3ae', 0.9, 1.32, 0.06, 0, 0.08, -0.3, base);
      for (let i = 0; i < 5; i++) b.box('paint', '#7fa39e', 0.88, 0.012, 0.005, 0, 0.3 + i * 0.22, -0.267, base);
      for (const x of [-0.44, 0.44]) {
        b.box('satin', '#c99a62', 0.05, 1.42, 0.64, x, 0, 0.0, base);
        b.box('satin', '#b5844f', 0.055, 0.06, 0.66, x, 1.42, 0.0, base);
      }
      for (const y of [0.12, 0.5, 0.88]) {
        b.box('metal', '#dfe4e8', 0.84, 0.03, 0.58, 0, y, 0.02, base);
        b.box('satin', '#ffffff', 0.84, 0.05, 0.015, 0, y - 0.025, 0.31, base);
      }
      this.pickBox(0.96, 1.6, 0.7, sl.c + 0.5, 0, sl.r + 0.5, { r: sl.r, c: sl.c }, this.world);
      this.shelfObjs.set(sh.slot, { slot: sl });
    }

    // Caisses : comptoir bois, tapis, caisse enregistreuse, terminal, présentoir à bonbons, sacs
    for (const reg of REGISTERS) {
      if (!st.registers.includes(reg.id)) continue;
      base.makeTranslation(reg.counter[0].c + 1, 0, reg.counter[0].r + 0.5);
      b.box('satin', '#c99a62', 1.9, 0.66, 0.7, 0, 0, 0, base);
      b.box('paint', '#2a6e6a', 1.92, 0.12, 0.72, 0, 0, 0, base);
      b.box('satin', '#3c4a55', 1.96, 0.06, 0.76, 0, 0.66, 0, base);
      b.box('paint', '#1d2328', 1.1, 0.025, 0.42, -0.34, 0.72, 0.0, base);
      for (let i = 0; i < 6; i++) b.box('metal', '#5b666e', 0.012, 0.028, 0.42, -0.85 + i * 0.2, 0.72, 0.0, base);
      b.box('satin', '#ece8e0', 0.42, 0.2, 0.42, 0.66, 0.72, -0.04, base);
      b.box('satin', '#2b3036', 0.36, 0.22, 0.04, 0.66, 0.92, -0.17, base, { rx: -0.25 });
      b.box('satin', '#2b3036', 0.12, 0.04, 0.16, 0.36, 0.72, 0.2, base);
      b.box('satin', '#46525b', 0.08, 0.1, 0.12, 0.36, 0.76, 0.2, base, { rx: -0.4 });
      // présentoir à bonbons côté client
      b.box('metal', '#8b98a1', 0.36, 0.5, 0.22, -0.68, 0, -0.48, base);
      for (let i = 0; i < 6; i++) {
        const col = ['#ff5fa2', '#ffd23f', '#3ccf8e', '#6c8cff', '#ff8a3d', '#d6336c'][i];
        b.box('satin', col, 0.1, 0.1, 0.06, -0.79 + (i % 3) * 0.11, 0.12 + Math.floor(i / 3) * 0.2, -0.38, base);
      }
      // sacs en papier sous le comptoir côté caissier
      b.box('paint', '#d9b07c', 0.22, 0.26, 0.14, 0.3, 0.0, 0.42, base);
      b.box('paint', '#c99a62', 0.18, 0.22, 0.12, 0.55, 0.0, 0.44, base);
      // poteau du numéro
      b.box('metal', '#9aa6ad', 0.05, 1.0, 0.05, -0.9, 0.7, -0.3, base);
      const num = this.plane(0.4, 0.4, this.canvasTex(128, 128, (c) => {
        c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 6; c.stroke();
        c.fillStyle = '#fff'; c.font = `800 80px ${FONT3}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(reg.id), 64, 70);
      }), reg.counter[0].c + 1 - 0.9, 1.72, reg.counter[0].r + 0.5 - 0.27);
      num.userData.ownTex = true;
      this.world.add(num);
      this.pickBox(2, 1.2, 1, reg.counter[0].c + 1, 0, reg.counter[0].r + 0.5, { r: reg.staff.r, c: reg.staff.c }, this.world);
    }
    this.addBatch(b, this.world);
    // Écrans des caisses
    for (const reg of REGISTERS) {
      if (!st.registers.includes(reg.id)) continue;
      const scr = new T.Mesh(new T.BoxGeometry(0.3, 0.16, 0.01), this.mat('#6edcc8', { emissive: '#3fbfa8', rough: 0.4 }));
      scr.position.set(reg.counter[0].c + 1 + 0.66, 1.03, reg.counter[0].r + 0.5 - 0.145);
      scr.rotation.x = -0.25;
      this.world.add(scr);
    }

    // Frontons colorés des rayons (une seule instance par étagère, couleur du produit)
    const hg = new T.BoxGeometry(0.92, 0.22, 0.08);
    const headers = new T.InstancedMesh(hg, new T.MeshStandardMaterial({ roughness: 0.45 }), Math.max(1, st.shelves.length));
    const mtx = new T.Matrix4();
    st.shelves.forEach((sh, i) => {
      const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
      mtx.makeTranslation(sl.c + 0.5, 1.6, sl.r + 0.5 - 0.27);
      headers.setMatrixAt(i, mtx);
      headers.setColorAt(i, new T.Color('#9aa7b0'));
      this.shelfObjs.get(sh.slot).hi = i;
    });
    headers.castShadow = true;
    headers.userData.ownTex = true;
    this.headers = headers;
    this.world.add(headers);
    this.stockKey = '';
  }

  // ---------------------------------------------------------------- articles en rayon (instanciés)
  itemMesh(pid) {
    let m = this.itemMeshes.get(pid);
    if (m) return m;
    const T = this.T3;
    const p = PRODUCT_BY_ID[pid];
    const b = new Batch(T);
    productParts(b, p, T);
    const geo = b.merge().get('i');
    // Articles bien visibles : on les agrandit pour remplir la tablette (sans dépasser la hauteur).
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const k = Math.min(0.235 / (bb.max.x - bb.min.x), 0.31 / (bb.max.y - bb.min.y), 0.2 / (bb.max.z - bb.min.z), 1.7);
    geo.scale(k, k, k);
    m = new T.InstancedMesh(geo, this.vm.item, SHELF_SLOTS.length * SHELF_CAPACITY);
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
    const q = new T.Quaternion();
    const e = new T.Euler();
    const pos = new T.Vector3();
    const one = new T.Vector3(1, 1, 1);
    const levels = [0.15, 0.53, 0.91];
    const col = new T.Color();
    for (const sh of st.shelves) {
      const obj = this.shelfObjs?.get(sh.slot);
      if (!obj) continue;
      const p = sh.product ? PRODUCT_BY_ID[sh.product] : null;
      if (this.headers && obj.hi != null) {
        this.headers.setColorAt(obj.hi, col.set(p ? p.tag : '#9aa7b0')); // V1.5 : couleur du code carton
        this.headers.instanceColor.needsUpdate = true;
      }
      if (!p || !sh.qty) continue;
      const m = this.itemMesh(p.id);
      let n = counts.get(p.id) || 0;
      for (let i = 0; i < sh.qty; i++) {
        const lvl = 2 - Math.min(2, Math.floor(i / 6)); // on remplit par le haut : le plus visible
        const k = i % 6;
        const cx = k % 3;
        const row = Math.floor(k / 3);
        const seed = hash(i + sh.slot.charCodeAt(0) * 7 + Number(sh.slot.slice(1)) * 31);
        pos.set(obj.slot.c + 0.5 + (cx - 1) * 0.265 + (seed - 0.5) * 0.02, levels[lvl] + 0.015, obj.slot.r + 0.5 + (row === 0 ? 0.13 : -0.12));
        e.set(0, (seed - 0.5) * 0.25, 0);
        q.setFromEuler(e);
        mtx.compose(pos, q, one);
        m.setMatrixAt(n++, mtx);
      }
      counts.set(p.id, n);
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- cartons de la réserve
  // V1.5 (retour de Jack) : plus de nom écrit sur le carton, il le cachait. Un CODE COULEUR par produit
  // (p.tag) : bande de couleur en travers du dessus (comme un adhésif) et étiquette de couleur sur la face avant,
  // avec la petite icône du produit (aide pour les daltoniens). Le carton reste un carton kraft bien visible.
  cartonMat(pid, face) {
    const k = `carton:${pid}:${face}`;
    let m = this.mats.get(k);
    if (!m) {
      const p = PRODUCT_BY_ID[pid];
      const tex = this.canvasTex(256, face === 'top' ? 208 : 150, (c, w, h) => {
        c.fillStyle = face === 'top' ? '#d9b07c' : '#c99a62'; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(120,80,40,0.22)';
        for (let i = 0; i < 6; i++) c.fillRect(0, 8 + i * 26, w, 2);
        const edge = luminance(p.tag) > 0.8 ? '#5b6670' : 'rgba(255,255,255,0.85)';
        if (face === 'top') {
          // bande d'adhésif de la couleur du produit, sur toute la largeur
          const bh = h * 0.42;
          c.fillStyle = p.tag; c.fillRect(0, (h - bh) / 2, w, bh);
          c.fillStyle = edge; c.fillRect(0, (h - bh) / 2, w, 4); c.fillRect(0, (h + bh) / 2 - 4, w, 4);
          const r = bh * 0.36;
          c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h / 2, r + 4, 0, Math.PI * 2); c.fill();
          c.drawImage(this.iconCanvas(p, 128), w / 2 - r, h / 2 - r, r * 2, r * 2);
        } else {
          // étiquette de couleur au centre de la face avant
          const lw = w * 0.56, lh = h * 0.66;
          const x = (w - lw) / 2, y = (h - lh) / 2;
          c.fillStyle = p.tag; rr2(c, x, y, lw, lh, 14); c.fill();
          c.lineWidth = 5; c.strokeStyle = edge; c.stroke();
          const r = lh * 0.3;
          c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h / 2, r + 4, 0, Math.PI * 2); c.fill();
          c.drawImage(this.iconCanvas(p, 128), w / 2 - r, h / 2 - r, r * 2, r * 2);
        }
      });
      tex.anisotropy = 8;
      m = new this.T3.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      this.mats.set(k, m);
    }
    return m;
  }

  cartonMesh(pid) {
    const T = this.T3;
    const plain = this.mat('#c99a62', { rough: 0.9 });
    const m = new T.Mesh(this.cartonGeo || (this.cartonGeo = new T.BoxGeometry(0.62, 0.36, 0.5)), [plain, plain, this.cartonMat(pid, 'top'), plain, this.cartonMat(pid, 'front'), plain]);
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
    this.pickables = this.pickables.filter((m) => !this.cartonMeshes.includes(m));
    this.cartonMeshes = [];
    st.delivery.forEach((stack, i) => {
      const d = DELIVERY_SPOTS[i];
      const pallet = AUTO_SPOTS.includes(i) ? 0.09 : 0;
      stack.forEach((c, k) => {
        const m = this.cartonMesh(c.product);
        m.position.set(d.c + 0.5 + (hash(i * 5 + k) - 0.5) * 0.04, pallet + 0.18 + k * 0.37, d.r + 0.5);
        m.rotation.y = (hash(i * 3 + k * 7) - 0.5) * 0.08;
        m.userData = { tile: { r: d.r, c: d.c } };
        this.scene.add(m);
        this.cartonMeshes.push(m);
        this.pickables.push(m);
      });
    });
  }

  // ---------------------------------------------------------------- personnages
  // Style « chibi » : grosse tête, corps rond, bras et jambes articulés. 5 appels de rendu par personne.
  person(kind, look = {}, id = 0) {
    const T = this.T3;
    const G = (k) => Batch.geo(T, k);
    let shirt = look.shirt || '#3a7bd5', skin = look.skin || '#f1c7a5', hair = look.hair || '#5a3a22';
    const pantsList = ['#34404a', '#3b4f6b', '#5a4a3a', '#2f3640', '#6b5b4b'];
    let pants = pantsList[id % pantsList.length];
    let style = look.hairStyle ?? 0;
    if (kind === 'player') { shirt = '#2d7a73'; skin = '#f0c29e'; hair = '#3b2a1e'; pants = '#2f3a44'; style = 0; }
    // Personnel (V1.4) : apparence fixe, tirée de sa fiche (staffLook), jamais de l'identifiant d'affichage.
    if (kind === 'stocker') { shirt = '#f08a24'; pants = '#2f3a44'; }
    if (kind === 'cashier') { shirt = '#d6336c'; pants = '#2f3a44'; }
    const shoe = '#2a2d31';

    // Tronc + tête + visage + accessoires : une seule géométrie
    const b = new Batch(T);
    b.add('s', G('sph'), shirt, { y: 0.44, sx: 0.32, sy: 0.42, sz: 0.25 });
    b.add('s', G('cyl'), pants, { y: 0.29, sx: 0.29, sy: 0.08, sz: 0.22 });
    b.add('s', G('cyl8'), skin, { y: 0.66, sx: 0.08, sy: 0.06, sz: 0.08 });
    b.add('s', G('sph'), skin, { y: 0.86, sx: 0.36, sy: 0.34, sz: 0.34 });
    // cheveux
    b.add('s', G('cap'), hair, { y: 0.875, sx: 0.38, sy: 0.36, sz: 0.37, rx: -0.38 });
    if (style === 1) b.box('s', hair, 0.34, 0.26, 0.12, 0, 0.66, -0.1);
    if (style === 2) b.add('s', G('sph'), hair, { y: 1.04, z: -0.09, sx: 0.13, sy: 0.13, sz: 0.13 });
    // V1.6 : employée → barrette colorée et cils (l'apparence suit le prénom, voir staffLook)
    if (look.female) {
      b.add('s', G('sphLow'), '#ff6fa8', { x: 0.17, y: 1.0, z: 0.08, sx: 0.07, sy: 0.05, sz: 0.05 });
      for (const x of [-0.065, 0.065]) b.box('s', '#22262b', 0.05, 0.012, 0.01, x + (x < 0 ? -0.012 : 0.012), 0.915, 0.165);
    }
    // visage (vers +z)
    for (const x of [-0.065, 0.065]) {
      b.add('s', G('sphLow'), '#22262b', { x, y: 0.875, z: 0.158, sx: 0.045, sy: 0.055, sz: 0.03 });
      b.add('s', G('sphLow'), '#ffffff', { x: x + 0.01, y: 0.89, z: 0.17, sx: 0.014, sy: 0.014, sz: 0.01 });
      b.add('s', G('sphLow'), '#f08f8f', { x: x * 1.65, y: 0.83, z: 0.135, sx: 0.06, sy: 0.035, sz: 0.02 });
    }
    b.box('s', '#9b3b3b', 0.05, 0.012, 0.01, 0, 0.805, 0.162);
    if (kind === 'customer' && id % 4 === 1) {
      for (const x of [-0.065, 0.065]) b.add('s', G('torus'), '#2b3036', { x, y: 0.875, z: 0.165, rz: Math.PI, sx: 0.1, sy: 0.1, sz: 0.1 });
      for (const x of [-0.065, 0.065]) b.add('s', G('torus'), '#2b3036', { x, y: 0.875, z: 0.165, sx: 0.1, sy: 0.1, sz: 0.1 });
    }
    if (kind === 'player' || kind === 'cashier') {
      b.box('s', '#ffffff', 0.22, 0.26, 0.02, 0, 0.26, 0.125);
      b.box('s', '#ffffff', 0.025, 0.14, 0.02, -0.08, 0.5, 0.11);
      b.box('s', '#ffffff', 0.025, 0.14, 0.02, 0.08, 0.5, 0.11);
      b.box('s', kind === 'player' ? '#ff8a3d' : '#ffd23f', 0.07, 0.04, 0.01, 0.06, 0.5, 0.122);
    }
    if (kind === 'stocker') {
      b.add('s', G('cyl'), '#f2e84b', { y: 0.47, sx: 0.325, sy: 0.04, sz: 0.255 });
      b.add('s', G('cyl'), '#f2e84b', { y: 0.37, sx: 0.33, sy: 0.04, sz: 0.26 });
      b.add('s', G('cap'), '#ffd23f', { y: 0.92, sx: 0.39, sy: 0.3, sz: 0.39 });
      b.box('s', '#ffd23f', 0.42, 0.02, 0.44, 0, 0.92, 0.02);
    }
    if (kind === 'player') {
      b.add('s', G('cap'), '#ff8a3d', { y: 0.9, sx: 0.385, sy: 0.3, sz: 0.38 });
      b.box('s', '#ff8a3d', 0.24, 0.025, 0.16, 0, 0.93, 0.19, null, { rx: 0.15 });
    }
    const torsoGeo = b.merge().get('s');
    const g = new T.Group();
    const torso = new T.Mesh(torsoGeo, this.vm.skin);
    torso.castShadow = true;
    g.add(torso);
    // Jambes (pivot à la hanche)
    const lb = new Batch(T);
    lb.add('s', G('cyl8'), pants, { y: -0.11, sx: 0.1, sy: 0.22, sz: 0.1 });
    lb.box('s', shoe, 0.1, 0.06, 0.15, 0, -0.27, 0.025);
    const legGeo = lb.merge().get('s');
    const legL = new T.Mesh(legGeo, this.vm.skin);
    const legR = new T.Mesh(legGeo, this.vm.skin);
    legL.position.set(-0.07, 0.27, 0);
    legR.position.set(0.07, 0.27, 0);
    // Bras (pivot à l'épaule)
    const ab = new Batch(T);
    ab.add('s', G('cyl8'), shirt, { y: -0.06, sx: 0.085, sy: 0.13, sz: 0.085 });
    ab.add('s', G('cyl8'), skin, { y: -0.17, sx: 0.07, sy: 0.1, sz: 0.07 });
    ab.add('s', G('sphLow'), skin, { y: -0.23, sx: 0.085, sy: 0.085, sz: 0.085 });
    const armGeo = ab.merge().get('s');
    const armL = new T.Group();
    const armR = new T.Group();
    armL.add(new T.Mesh(armGeo, this.vm.skin));
    armR.add(new T.Mesh(armGeo, this.vm.skin));
    armL.position.set(-0.19, 0.6, 0);
    armR.position.set(0.19, 0.6, 0);
    armL.rotation.z = -0.12;
    armR.rotation.z = 0.12;
    g.add(legL, legR, armL, armR);
    g.scale.setScalar(1.05);
    g.userData = { legL, legR, torso, armL, armR, carry: null, carryPid: null, basket: null, bag: null, rot: 0, hop: 0, geos: [torsoGeo, legGeo, armGeo] };
    return g;
  }

  basketMesh() {
    const T = this.T3;
    if (!this.basketGeo) {
      const b = new Batch(T);
      b.box('s', '#e8483d', 0.2, 0.02, 0.14, 0, 0, 0);
      b.box('s', '#e8483d', 0.2, 0.1, 0.015, 0, 0, 0.065);
      b.box('s', '#e8483d', 0.2, 0.1, 0.015, 0, 0, -0.065);
      b.box('s', '#d73c31', 0.015, 0.1, 0.14, 0.1, 0, 0);
      b.box('s', '#d73c31', 0.015, 0.1, 0.14, -0.1, 0, 0);
      b.add('s', Batch.geo(T, 'torus'), '#2b3036', { y: 0.1, sx: 0.18, sy: 0.18, sz: 0.18 });
      for (const [x, col] of [[-0.05, '#ffd23f'], [0.04, '#4aa8e8'], [0.0, '#3ccf8e']]) b.box('s', col, 0.06, 0.08, 0.06, x, 0.02, (x * 7) % 0.04);
      this.basketGeo = b.merge().get('s');
      const bb = new Batch(T);
      bb.box('s', '#d9b07c', 0.2, 0.24, 0.11, 0, 0, 0);
      bb.box('s', '#c99a62', 0.2, 0.03, 0.112, 0, 0.21, 0);
      bb.box('s', '#3ccf8e', 0.06, 0.06, 0.03, -0.03, 0.22, 0.01);
      this.bagGeo = bb.merge().get('s');
    }
    return this.basketGeo;
  }

  syncAgent(key, a, kind) {
    let o = this.agentObjs.get(key);
    if (!o) {
      o = this.person(kind, a.look || {}, a.id || 0);
      this.scene.add(o);
      this.agentObjs.set(key, o);
    }
    o.userData.seen = true;
    const u = o.userData;
    const off = a.off || 0;
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
    const swing = moving ? Math.sin(ph) * 0.65 : 0;
    // Petit saut de joie / secousse de colère selon la bulle
    const bubble = a.bubble && a.bubble.text;
    const happy = bubble === '😊' ? Math.abs(Math.sin(this.time * 9)) * 0.06 : 0;
    const shake = bubble === '😠' ? Math.sin(this.time * 40) * 0.03 : 0;
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.04 : Math.sin(this.time * 2.2 + (a.id || 0)) * 0.008;
    o.position.set(a.x + 0.5 + off + shake, happy, a.y + 0.55);
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.torso.position.y = bob;
    u.torso.rotation.x = moving ? 0.06 : 0;
    u.torso.scale.y = moving ? 1 : 1 + Math.sin(this.time * 2.2 + (a.id || 0)) * 0.012;
    // Carton porté
    const pid = a.carry ? a.carry.product : null;
    if (pid !== u.carryPid) {
      if (u.carry) o.remove(u.carry);
      u.carry = null;
      u.carryPid = pid;
      if (pid) {
        u.carry = this.cartonMesh(pid);
        u.carry.scale.setScalar(0.6);
        u.carry.position.set(0, 0.5, 0.27);
        o.add(u.carry);
      }
    }
    // Bras : marche, port de carton, se servir en rayon, remplir, scanner
    let aL = -swing * 0.8, aR = swing * 0.8;
    if (pid) { aL = -1.25; aR = -1.25; }
    else if (a.fill) { aL = -1.1 + Math.sin(this.time * 14) * 0.35; aR = -1.1 - Math.sin(this.time * 14) * 0.35; }
    else if (a.state === 'browse' && !moving) { aR = -1.7 + Math.sin(this.time * 6) * 0.15; }
    else if (a.scanning) { aR = -0.9 + Math.sin(this.time * 12) * 0.4; aL = -0.6; }
    u.armL.rotation.x += (aL - u.armL.rotation.x) * Math.min(1, this.dt * 14);
    u.armR.rotation.x += (aR - u.armR.rotation.x) * Math.min(1, this.dt * 14);
    u.armL.position.y = 0.6 + bob;
    u.armR.position.y = 0.6 + bob;
    // Panier (en courses) ou sac (après avoir payé)
    const hasBasket = a.basket && a.basket.length > 0;
    const hasBag = !hasBasket && a.paid;
    if (hasBasket && !u.basket) {
      u.basket = new this.T3.Mesh(this.basketMesh(), this.vm.skin);
      u.basket.position.set(0, -0.36, 0.02);
      u.armL.add(u.basket);
    } else if (!hasBasket && u.basket) {
      u.armL.remove(u.basket);
      u.basket = null;
    }
    if (hasBag && !u.bag) {
      this.basketMesh();
      u.bag = new this.T3.Mesh(this.bagGeo, this.vm.skin);
      u.bag.position.set(0, -0.48, 0.02);
      u.armR.add(u.bag);
    }
    return o;
  }

  // ---------------------------------------------------------------- caméra / taille
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    this.w = box.width;
    this.h = box.height;
    this.dpr = Math.min(this.lowQuality ? 1.25 : 2, window.devicePixelRatio || 1);
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
    let ty = ROWS / 2;
    let lo = 8, hi = 80;
    for (let it = 0; it < 6; it++) {
      lo = 8; hi = 80;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid, ty).ok) hi = mid; else lo = mid;
      }
      const f = fits(hi, ty);
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
    const n = r < SHOP_TOP && this.game.state.delivery[(r - 1) * COLS + c] ? this.game.state.delivery[(r - 1) * COLS + c].length : 0;
    const y = r < SHOP_TOP ? 0.15 + n * 0.3 : 0.45;
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
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  updateHalos() {
    const g = this.game;
    const st = g.state;
    const T = this.T3;
    const mtx = this.tmpM || (this.tmpM = new T.Matrix4());
    const col = this.tmpC || (this.tmpC = new T.Color());
    let n = 0;
    const put = (r, c, color, size) => {
      if (n >= 32) return;
      mtx.makeScale(size, 1, size);
      mtx.setPosition(c + 0.5, 0.012, r + 0.5);
      this.halos.setMatrixAt(n, mtx);
      this.halos.setColorAt(n, col.set(color));
      n++;
    };
    const mv = g.moving;
    if (mv) {
      for (const sh of st.shelves) {
        const sl = this.shelfObjs?.get(sh.slot)?.slot;
        if (!sl) continue;
        if (sh.slot === mv.from) put(sl.r, sl.c, '#ff7a1a', 1.7);
        else if (!mv.from) put(sl.r, sl.c, '#ffb27a', 1.35);
      }
      if (mv.from) for (const sl of g.freeSlots()) put(sl.r, sl.c, '#2bd1a0', 1.45);
      this.haloMat.opacity = 0.6 + 0.35 * Math.sin(this.time * 6);
    } else {
      const carry = g.player.carry;
      if (carry) {
        for (const sh of st.shelves) {
          const ok = (sh.product === carry.product || !sh.product || sh.qty === 0) && sh.qty < SHELF_CAPACITY;
          const sl = this.shelfObjs?.get(sh.slot)?.slot;
          if (ok && sl) put(sl.r, sl.c, '#ff8a3d', 1.5);
        }
      }
      this.haloMat.opacity = 0.55 + 0.3 * Math.sin(this.time * 6);
    }
    this.halos.count = n;
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
  }

  draw(dt) {
    this.dt = dt;
    this.time += dt;
    this.adaptQuality(dt);
    const g = this.game;
    const st = g.state;
    this.buildLayout();
    this.buildDeco();
    this.updateStock();
    this.updateDelivery();
    this.updateHalos();

    // Décalage quand le panneau de caisse couvre le bas de l'écran
    this.placeCamera(this.shift);
    const want = this.cover > 0 ? Math.max(0, this.toScreen(COLS / 2, 0, 13.3).y + this.shift - (this.h - this.cover - 6)) : 0;
    this.shift += (want - this.shift) * Math.min(1, dt * 10);
    if (Math.abs(want - this.shift) < 0.5) this.shift = want;
    this.placeCamera(this.shift);

    // Personnages
    for (const o of this.agentObjs.values()) o.userData.seen = false;
    this.syncAgent('player', g.player, 'player');
    for (const a of g.staffAgents()) this.syncAgent(`stocker-${a.id}-${a.memberId ?? ''}`, a, 'stocker'); // V1.6 : nouvelle tête si l'intérimaire remplace
    for (const cu of g.customers) this.syncAgent(`c${cu.id}`, cu, 'customer');
    for (const [regId, member] of g.cashierAssignments()) {
      const reg = REGISTERS.find((x) => x.id === regId);
      const q = g.queues.get(regId) || [];
      const first = q.length && g.customers.find((x) => x.id === q[0]);
      const scanning = !!(first && first.processing);
      this.syncAgent(`cashier-${regId}-${member.id}`, { x: reg.staff.c, y: reg.staff.r - 0.1, dir: -1, id: regId, path: [], scanning, look: staffLook(member) }, 'cashier');
    }
    for (const [k, o] of this.agentObjs) {
      if (!o.userData.seen) {
        this.scene.remove(o);
        for (const geo of o.userData.geos || []) geo.dispose();
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

    // V1.4 : nom du produit sur le fronton de chaque étagère (toujours lisible, par-dessus la 3D)
    for (const sh of st.shelves) {
      const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
      if (!sl) continue;
      // un peu sous le fronton : ne chevauche jamais l'étiquette de prix du rayon de devant (allée 1 / allée 2)
      const pt = this.toScreen(sl.c + 0.5, 1.42, sl.r + 0.32);
      this.shelfSign(ctx, pt.x, pt.y, sh.product ? PRODUCT_BY_ID[sh.product] : null, unit);
    }
    // V1.4 : nom des cartons de la réserve, une étiquette par pile (même derrière une étagère ou empilés)
    this.stackLabels(ctx, unit);

    // Étiquettes de prix (jaune « PROMO » quand le prix est bas)
    for (const sh of st.shelves) {
      const sl = SHELF_SLOTS.find((x) => x.id === sh.slot);
      if (!sl || !sh.product) continue;
      const p = PRODUCT_BY_ID[sh.product];
      const pt = this.toScreen(sl.c + 0.5, 0.06, sl.r + 0.9);
      const empty = sh.qty === 0;
      const ratio = st.prices[p.id] / Math.round(p.market * 100);
      const promo = !empty && ratio < 0.9;
      const label = empty ? 'VIDE' : money(st.prices[p.id]);
      ctx.font = `800 ${fs(0.22)}px ${FONT3}`;
      const tw = ctx.measureText(label).width + 10;
      const th = fs(0.3);
      ctx.fillStyle = 'rgba(40,30,20,0.25)';
      rr2(ctx, pt.x - tw / 2 + 1, pt.y - th / 2 + 2, tw, th, 5); ctx.fill();
      ctx.fillStyle = empty ? `rgba(232,72,61,${0.8 + 0.2 * Math.sin(this.time * 5)})` : promo ? '#ffe14d' : ratio > 1.15 ? '#ffd9a8' : '#ffffff';
      rr2(ctx, pt.x - tw / 2, pt.y - th / 2, tw, th, 5);
      ctx.fill();
      ctx.fillStyle = empty ? '#ffffff' : '#22333b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pt.x, pt.y + 1);
    }

    // Mode « Déplacer » : flèche sur l'étagère choisie, « + » qui pulsent
    if (g.moving) {
      const from = g.moving.from && SHELF_SLOTS.find((x) => x.id === g.moving.from);
      if (from) {
        const pt = this.toScreen(from.c + 0.5, 1.95, from.r + 0.3);
        const by = pt.y - 6 + Math.sin(this.time * 6) * 4;
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath(); ctx.arc(pt.x, by, unit * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${fs(0.36)}px ${FONT3}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('↔', pt.x, by + 1);
        for (const sl of g.freeSlots()) {
          const p2 = this.toScreen(sl.c + 0.5, 0.05, sl.r + 0.5);
          this.pulse(ctx, p2.x, p2.y, unit * 0.42, '43,209,160');
        }
      }
    }

    // Tutoriel : anneau qui pulse sur un carton à prendre
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
      const pt = this.toScreen(p.x + 0.5, 1.35, p.y + 0.55);
      const k = p.fill.shelf.qty / SHELF_CAPACITY;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      rr2(ctx, pt.x - unit * 0.35, pt.y, unit * 0.7, 6, 3); ctx.fill();
      ctx.fillStyle = '#2bb673';
      rr2(ctx, pt.x - unit * 0.35, pt.y, unit * 0.7 * k, 6, 3); ctx.fill();
    }

    // Bulles et patience des clients
    for (const cu of g.customers) {
      const pt = this.toScreen(cu.x + 0.5 + (cu.off || 0), 1.25, cu.y + 0.55);
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

  // Panneau du fronton : nom court du produit sur la couleur de son code carton (V1.5), « libre » sinon.
  shelfSign(ctx, x, y, p, unit) {
    const label = p ? p.short : 'libre';
    const fsz = Math.max(10, Math.round(unit * 0.25));
    ctx.font = `800 ${fsz}px ${FONT3}`;
    const tw = Math.min(unit * 0.98, ctx.measureText(label).width + 10);
    const th = fsz + 5;
    ctx.fillStyle = p ? p.tag : 'rgba(154,167,176,0.95)';
    rr2(ctx, x - tw / 2, y - th / 2, tw, th, th / 2.4); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = p && luminance(p.tag) > 0.8 ? '#5b6670' : 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.fillStyle = p && luminance(p.tag) > 0.62 ? '#1d2b30' : '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1, tw - 6);
  }

  // V1.5 : pastille de couleur (code du produit) sur chaque carton de la réserve, dans le coin de sa face avant,
  // à sa hauteur dans la pile. Petite : elle ne cache pas le carton, mais elle reste visible même empilé ou juste
  // derrière une étagère (dessinée par-dessus la 3D). Le nom n'est plus écrit (il cachait les cartons).
  stackLabels(ctx, unit) {
    const st = this.game.state;
    const rad = Math.max(4.5, unit * 0.11);
    st.delivery.forEach((stack, i) => {
      if (!stack.length) return;
      const d = DELIVERY_SPOTS[i];
      const pallet = AUTO_SPOTS.includes(i) ? 0.09 : 0;
      let prevY = Infinity;
      for (let k = 0; k < stack.length; k++) {
        const p = PRODUCT_BY_ID[stack[k].product];
        const pt = this.toScreen(d.c + 0.79, pallet + 0.18 + k * 0.37, d.r + 0.76);
        const y = Math.min(pt.y, prevY - rad * 1.7); // jamais deux pastilles l'une sur l'autre
        prevY = y;
        this.tagDot(ctx, pt.x, y, rad, p);
      }
    });
  }

  tagDot(ctx, x, y, rad, p) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(x + 0.8, y + 1.2, rad + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = luminance(p.tag) > 0.8 ? '#5b6670' : '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, rad + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.tag;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }

  pulse(ctx, x, y, rad, rgb = '255,138,61') {
    const k = (this.time * 1.2) % 1;
    ctx.strokeStyle = `rgba(${rgb},${0.9 * (1 - k)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, rad * (0.8 + k * 0.5), 0, Math.PI * 2); ctx.stroke();
  }
}

export { PRODUCTS, SPOT_STACK };
