// Grille du magasin et recherche de chemin (A* sur 4 directions).
import { COLS, ROWS, DELIVERY_SPOTS, SHELF_SLOTS, REGISTERS } from './data.js';

export function key(r, c) {
  return r * COLS + c;
}

// Construit la grille des cases bloquées pour l'état courant.
export function buildBlocked(state) {
  const blocked = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++) blocked[key(0, c)] = 1; // mur du fond
  for (let c = 0; c < COLS; c++) if (c !== 4) blocked[key(14, c)] = 1; // façade, porte en (14,4)
  // V1.4 : la réserve est un sol libre ; seule une case qui porte des cartons bloque le passage.
  DELIVERY_SPOTS.forEach((d, i) => {
    if (state.delivery && state.delivery[i] && state.delivery[i].length) blocked[key(d.r, d.c)] = 1;
  });
  for (const slot of SHELF_SLOTS) {
    if (state.shelves.some((s) => s.slot === slot.id)) blocked[key(slot.r, slot.c)] = 1;
  }
  for (const reg of REGISTERS) {
    if (!state.registers.includes(reg.id)) continue;
    for (const t of reg.counter) blocked[key(t.r, t.c)] = 1;
  }
  return blocked;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export { DIRS };

// A* : renvoie la liste des cases de (sr,sc) exclu jusqu'à (tr,tc) inclus, ou null.
// V1.4 : à longueur égale, on préfère le chemin avec le moins de virages (en « L » plutôt qu'en escalier) :
// le personnage ne se retourne plus à chaque case (c'est ce qui donnait l'impression que le magasinier
// changeait de coiffure à chaque pas : on voyait alternativement son visage et l'arrière de sa tête).
const TURN = 0.01; // pénalité minuscule : ne rallonge jamais le chemin, départage seulement les égalités
export function findPath(blocked, sr, sc, tr, tc) {
  if (sr === tr && sc === tc) return [];
  if (tr < 0 || tc < 0 || tr >= ROWS || tc >= COLS) return null;
  if (sr < 0 || sc < 0 || sr >= ROWS || sc >= COLS) return null;
  const n = COLS * ROWS;
  // état = case × direction d'arrivée (0..3), 4 = départ
  const S = n * 5;
  const g = new Float32Array(S).fill(Infinity);
  const f = new Float32Array(S).fill(Infinity);
  const came = new Int32Array(S).fill(-1);
  const closed = new Uint8Array(S);
  const start = key(sr, sc) * 5 + 4;
  const goal = key(tr, tc);
  g[start] = 0;
  f[start] = Math.abs(sr - tr) + Math.abs(sc - tc);
  const open = [start];
  let end = -1;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open.splice(bi, 1);
    if (closed[cur]) continue;
    const cell = Math.floor(cur / 5);
    if (cell === goal) { end = cur; break; }
    closed[cur] = 1;
    const dir = cur % 5;
    const r = Math.floor(cell / COLS);
    const c = cell % COLS;
    for (let d = 0; d < 4; d++) {
      const nr = r + DIRS[d][0];
      const nc = c + DIRS[d][1];
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
      const k = key(nr, nc);
      if (blocked[k] && k !== goal) continue;
      const ns = k * 5 + d;
      if (closed[ns]) continue;
      const ng = g[cur] + 1 + (dir !== 4 && dir !== d ? TURN : 0);
      if (ng < g[ns]) {
        g[ns] = ng;
        came[ns] = cur;
        f[ns] = ng + Math.abs(nr - tr) + Math.abs(nc - tc);
        open.push(ns);
      }
    }
  }
  if (end < 0) return null;
  const path = [];
  let st = end;
  while (st !== start) {
    const cell = Math.floor(st / 5);
    path.push({ r: Math.floor(cell / COLS), c: cell % COLS });
    st = came[st];
  }
  return path.reverse();
}

// Cases libres atteignables à pied depuis (r, c) (parcours en largeur).
export function reachable(blocked, r, c) {
  const seen = new Uint8Array(COLS * ROWS);
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return seen;
  const q = [key(r, c)];
  seen[q[0]] = 1;
  while (q.length) {
    const cur = q.pop();
    const cr = Math.floor(cur / COLS);
    const cc = cur % COLS;
    for (const [dr, dc] of DIRS) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
      const k = key(nr, nc);
      if (seen[k] || blocked[k]) continue;
      seen[k] = 1;
      q.push(k);
    }
  }
  return seen;
}

// Nombre de virages d'un chemin (sert aux tests).
export function countTurns(path, sr, sc) {
  let turns = 0;
  let prev = null;
  let pr = sr;
  let pc = sc;
  for (const p of path) {
    const d = `${p.r - pr},${p.c - pc}`;
    if (prev && d !== prev) turns++;
    prev = d;
    pr = p.r;
    pc = p.c;
  }
  return turns;
}
