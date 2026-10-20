// Démarrage : sauvegarde, boucle d'animation, toucher.
import { SAVE_KEY, SETTINGS_KEY } from './data.js';
import { Game, newState, serialize, deserialize } from './game.js';
import { Renderer } from './render.js';
import { Renderer3D, webglAvailable } from './render3d.js';
import { UI } from './ui.js';
import { resolveTap, isTap, TAP_RADIUS_MOVE } from './tap.js';
import { settings, unlockAudio } from './audio.js';

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch (e) {
    return null;
  }
}

function start(hotData) {
  try {
    const st = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof st.sound === 'boolean') settings.sound = st.sound;
    if (typeof st.haptics === 'boolean') settings.haptics = st.haptics;
  } catch (e) { /* réglages par défaut */ }

  const initial = (hotData && hotData.state && deserialize(hotData.state)) || loadState() || newState();
  const game = new Game(initial);
  const canvas = document.getElementById('cv');
  let renderer;
  try {
    renderer = webglAvailable() ? new Renderer3D(canvas, game, document.getElementById('ov')) : null;
  } catch (e) {
    console.warn('3D indisponible, passage en 2D', e);
    renderer = null;
  }
  if (!renderer) {
    document.getElementById('ov').hidden = true;
    renderer = new Renderer(canvas, game);
  }

  const save = () => {
    try {
      localStorage.setItem(SAVE_KEY, serialize(game.state));
    } catch (e) { /* stockage indisponible : la partie continue */ }
  };
  const ui = new UI(game, renderer, {
    save,
    saveSettings: () => {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignoré */ }
    },
    reset: () => {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignoré */ }
      location.reload();
    }
  });
  window.__game = game;
  window.__renderer = renderer;

  if (window.claude?.hot?.snapshot) window.claude.hot.snapshot(() => ({ state: serialize(game.state) }));

  // Reprise d'une sauvegarde de fin de journée
  if (game.state.phase === 'summary' && game.state.lastSummary) ui.showSummary(game.state.lastSummary);

  // Toucher sur la carte
  // Un seul doigt suivi à la fois ; un geste annulé par le téléphone (pointercancel) compte s'il était un vrai tap.
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (down && e.pointerId !== down.id) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (down && e.pointerId === down.id) { down.lx = e.clientX; down.ly = e.clientY; }
  });
  const endTap = (e, cancelled) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    const x = cancelled ? d.lx : e.clientX;
    const y = cancelled ? d.ly : e.clientY;
    if (!isTap(d, x, y, performance.now())) return;
    const rect = canvas.getBoundingClientRect();
    const px = x - rect.left;
    const py = y - rect.top;
    renderer.addRipple(px, py);
    const tile = resolveTap(game, renderer, px, py, game.moving ? TAP_RADIUS_MOVE : undefined);
    if (!tile) return;
    ui.handleTapResult(game.tap(tile.r, tile.c));
  };
  canvas.addEventListener('pointerup', (e) => endTap(e, false));
  canvas.addEventListener('pointercancel', (e) => endTap(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', unlockAudio, { once: true });

  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) {
      game.update(dt);
      renderer.draw(dt);
      ui.frame();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderer.staticKey = ''; renderer.icons.clear(); });
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
