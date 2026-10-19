// Grille du magasin et recherche de chemin (A* sur 4 directions).
import { COLS, ROWS, DELIVERY_SPOTS, COMPUTER, SHELF_SLOTS, REGISTERS } from './data.js';

export function key(r, c) {
  return r * COLS + c;
}

// Construit la grille des cases bloquées pour l'état courant.
export function buildBlocked(state) {
  const blocked = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS; c++) blocked[key(0, c)] = 1; // mur du fond
  for (let c = 0; c < COLS; c++) if (c !== 4) blocked[key(14, c)] = 1; // façade, porte en (14,4)
  for (const s of DELIVERY_SPOTS) blocked[key(s.r, s.c)] = 1;
  for (const t of COMPUTER.tiles) blocked[key(t.r, t.c)] = 1;
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

// A* : renvoie la liste des cases de (sr,sc) exclu jusqu'à (tr,tc) inclus, ou null.
export function findPath(blocked, sr, sc, tr, tc) {
  if (sr === tr && sc === tc) return [];
  if (tr < 0 || tc < 0 || tr >= ROWS || tc >= COLS) return null;
  const start = key(sr, sc);
  const goal = key(tr, tc);
  const n = COLS * ROWS;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  g[start] = 0;
  const open = [start];
  const f = new Float32Array(n).fill(Infinity);
  f[start] = Math.abs(sr - tr) + Math.abs(sc - tc);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open.splice(bi, 1);
    if (cur === goal) break;
    closed[cur] = 1;
    const r = Math.floor(cur / COLS);
    const c = cur % COLS;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
      const k = key(nr, nc);
      if (closed[k]) continue;
      if (blocked[k] && k !== goal) continue;
      const ng = g[cur] + 1;
      if (ng < g[k]) {
        g[k] = ng;
        came[k] = cur;
        f[k] = ng + Math.abs(nr - tr) + Math.abs(nc - tc);
        if (!open.includes(k)) open.push(k);
      }
    }
  }
  if (came[goal] === -1) return null;
  const path = [];
  let k = goal;
  while (k !== start) {
    path.push({ r: Math.floor(k / COLS), c: k % COLS });
    k = came[k];
  }
  return path.reverse();
}
