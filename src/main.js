// Démarrage : sauvegarde, boucle d'animation, toucher.
import { SAVE_KEY, SETTINGS_KEY } from './data.js';
import { Game, newState, serialize, deserialize } from './game.js';
import { Renderer } from './render.js';
import { Renderer3D, webglAvailable } from './render3d.js';
import { UI } from './ui.js';
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
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 18) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const tile = renderer.pick(px, py);
    renderer.addRipple(px, py);
    if (!tile) return;
    ui.handleTapResult(game.tap(tile.r, tile.c));
  });
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
