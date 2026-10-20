// Toucher tolérant : un doigt sur téléphone vise mal (surtout en 3D en perspective).
// Si la case touchée ne fait rien, on prend l'objet utile le plus proche à l'écran
// (ordinateur, « + » d'étagère, carton, caisse…), dans un rayon raisonnable.

export const TAP_RADIUS = 46; // px CSS : à peu près la largeur d'un doigt
export const TAP_RADIUS_MOVE = 64; // mode « Déplacer une étagère » : cibles plus larges

// candidates : [{ r, c, x, y }] (x, y = centre de la case à l'écran)
export function nearestTarget(candidates, px, py, radius = TAP_RADIUS) {
  let best = null;
  let bestD = radius;
  for (const t of candidates) {
    const d = Math.hypot(t.x - px, t.y - py);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best ? { r: best.r, c: best.c } : null;
}

// Résout la case visée : la case touchée si elle est utile, sinon la plus proche utile.
export function resolveTap(game, renderer, px, py, radius = TAP_RADIUS) {
  const tile = renderer.pick(px, py);
  if (tile && game.isActionTile(tile.r, tile.c)) return tile;
  if (!renderer.tileScreen) return tile;
  const cands = game.actionTiles().map((t) => ({ ...t, ...renderer.tileScreen(t.r, t.c) }));
  return nearestTarget(cands, px, py, radius) || tile;
}

// Fond sombre d'un panneau : après un tap sur le plan, le téléphone envoie encore un « click »
// au même endroit, qui tombait sur le fond tout juste ouvert et refermait le panneau aussitôt
// (bug « je touche l'ordinateur / le + et rien ne se passe »). On ne ferme que si le doigt
// s'est posé sur le fond lui-même, et jamais dans la foulée de l'ouverture.
export const BACKDROP_GRACE_MS = 450;
export function shouldCloseOnBackdrop(downOnBackdrop, openedAt, now) {
  return !!downOnBackdrop && now - openedAt >= BACKDROP_GRACE_MS;
}

// Suivi d'un toucher : un vrai « tap » = doigt posé puis levé sans glisser.
// Certains téléphones Android annulent le geste (pointercancel) au lieu de le terminer :
// on compte alors quand même le tap s'il était court et immobile.
export const TAP_MOVE = 24; // px CSS
export const TAP_MS = 700;

export function isTap(down, x, y, now) {
  if (!down) return false;
  return Math.hypot(x - down.x, y - down.y) <= TAP_MOVE && now - down.t <= TAP_MS;
}
