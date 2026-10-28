// Démarrage : sauvegarde, boucle d'animation, toucher.
import { SETTINGS_KEY } from './data.js';
import { Game, newState, serialize, deserialize } from './game.js';
import { Renderer } from './render.js';
import { Renderer3D, webglAvailable } from './render3d.js';
import { UI } from './ui.js';
import { resolveTap, isTap, TAP_RADIUS_MOVE } from './tap.js';
import { settings, unlockAudio, savedQuality } from './audio.js';
import { createSaver } from './storage.js';
import { BUILD_VERSION, UPDATE_TRIED_KEY, fetchLatestVersion, updateAction } from './update.js';
import { sessionPlan, startTutorial, leaveTutorial, skipTutorial, savedTutoStep, backToNormal } from './tutorial.js';
import { TutoUI } from './tutoui.js';

// Stockage du navigateur, ou un stockage vide si le téléphone le refuse (la partie continue sans sauvegarde).
function getStore() {
  try { return window.localStorage || null; } catch (e) { return null; }
}
const NO_STORE = { getItem() { return null; }, setItem() {}, removeItem() {} };

function start(hotData) {
  try {
    const st = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (typeof st.sound === 'boolean') settings.sound = st.sound;
    if (typeof st.haptics === 'boolean') settings.haptics = st.haptics;
    if (typeof st.simAds === 'boolean') settings.simAds = st.simAds;
    // V1.7 : nouvelle clé des réglages. V1.7.1 : on ne garde le choix que s'il a été fait par le joueur
    // (une sauvegarde V1.7 contient 'auto' sans que le joueur l'ait choisi : elle passe en Haute).
    Object.assign(settings, savedQuality(st));
  } catch (e) { /* réglages par défaut */ }

  // V1.5 : partie normale (clé SAVE_KEY) ou partie d'essai du tutoriel (sa propre clé), voir src/tutorial.js.
  const store = getStore() || NO_STORE;
  const plan = sessionPlan(store);
  // (aperçu Claude : un état gardé en mémoire n'est repris que s'il est du même type de partie que la clé utilisée)
  const hot = hotData && hotData.state && deserialize(hotData.state);
  const hotOk = hot && !!hot.tutoMode === (plan.mode === 'tuto');
  const initial = (hotOk && hot) || plan.state || (plan.mode === 'tuto' ? plan.fresh() : newState());
  const game = new Game(initial);
  const canvas = document.getElementById('cv');
  let renderer;
  let cv = canvas;
  try {
    renderer = webglAvailable() ? new Renderer3D(cv, game, document.getElementById('ov')) : null;
  } catch (e) {
    console.warn('3D indisponible, passage en 2D', e);
    renderer = null;
    // Le canvas a pu garder un contexte WebGL : on le remplace par un neuf pour le dessin 2D.
    const fresh = cv.cloneNode(false);
    cv.replaceWith(fresh);
    cv = fresh;
  }
  if (!renderer) {
    document.getElementById('ov').hidden = true;
    renderer = new Renderer(cv, game);
  }

  const saver = createSaver(store, plan.key, () => game.state, { fresh: plan.fresh, serializeFn: serialize });
  const save = () => saver.save();
  const ui = new UI(game, renderer, {
    save,
    saveSettings: () => {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignoré */ }
    },
    // Nouvelle partie : partie neuve écrite, ancienne partie plus jamais sauvegardée, puis rechargement.
    reset: () => {
      saver.reset();
      location.reload();
    },
    update: () => { save(); location.reload(); },
    // V1.5 : tutoriel. La partie normale est sauvegardée (si elle existe) puis plus jamais écrite jusqu'au
    // rechargement ; la partie d'essai a sa propre clé.
    tutoMode: plan.mode === 'tuto',
    tutoStep: () => savedTutoStep(store),
    startTutorial: (fresh = true) => {
      // Depuis le tutoriel : « Recommencer le tutoriel » (la partie normale n'est pas concernée).
      if (plan.mode === 'tuto') { saver.lock(); startTutorial(store, null, { fresh: true }); }
      else startTutorial(store, saver, { fresh });
      location.reload();
    },
    leaveTutorial: ({ finished = false } = {}) => {
      leaveTutorial(store, saver, { finished });
      location.reload();
    },
    skipTutorial: () => skipTutorial(store)
  });
  let tuto = null;
  if (plan.mode === 'tuto') {
    try {
      tuto = new TutoUI(game, renderer, ui, { save, leaveTutorial: (o) => ui.hooks.leaveTutorial(o) });
      ui.tuto = tuto;
      document.body.classList.add('tuto');
    } catch (e) {
      // Relecture : un tutoriel qui ne démarre pas ne doit jamais bloquer le jeu → retour à la partie normale.
      console.warn('tutoriel', e);
      saver.lock();
      backToNormal(store);
      location.reload();
      return;
    }
  } else if (plan.offer) ui.offerTutorial();
  else if (plan.announce) {
    skipTutorial(store);
    setTimeout(() => ui.toast('Nouveau : un tutoriel dans le menu ☰ (ta partie est gardée)'), 1500);
  }
  checkForUpdate(ui, save, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate(ui, save, false);
  });
  setupSystemBars();
  window.__game = game;
  window.__renderer = renderer;

  if (window.claude?.hot?.snapshot) window.claude.hot.snapshot(() => ({ state: serialize(game.state) }));

  // Reprise d'une sauvegarde de fin de journée
  if (game.state.phase === 'summary' && game.state.lastSummary) ui.showSummary(game.state.lastSummary);

  // Android peut retirer le contexte WebGL (appli en arrière-plan) : on recharge proprement quand il revient.
  if (renderer.scene) {
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); save(); });
    cv.addEventListener('webglcontextrestored', () => location.reload());
  }

  // Toucher sur la carte
  // Un seul doigt suivi à la fois ; un geste annulé par le téléphone (pointercancel) compte s'il était un vrai tap.
  let down = null;
  cv.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (down && e.pointerId !== down.id) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now() };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (down && e.pointerId === down.id) { down.lx = e.clientX; down.ly = e.clientY; }
  });
  const endTap = (e, cancelled) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    const x = cancelled ? d.lx : e.clientX;
    const y = cancelled ? d.ly : e.clientY;
    if (!isTap(d, x, y, performance.now())) return;
    const rect = cv.getBoundingClientRect();
    const px = x - rect.left;
    const py = y - rect.top;
    renderer.addRipple(px, py);
    const tile = resolveTap(game, renderer, px, py, game.moving ? TAP_RADIUS_MOVE : undefined);
    if (!tile) return;
    ui.handleTapResult(game.tap(tile.r, tile.c));
  };
  cv.addEventListener('pointerup', (e) => endTap(e, false));
  cv.addEventListener('pointercancel', (e) => endTap(e, true));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
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
      if (tuto) {
        // Une erreur du tutoriel ne doit jamais figer le jeu.
        try { tuto.frame(dt); } catch (e) { if (!tuto.failed) { tuto.failed = true; console.warn('tutoriel', e); } }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderer.staticKey = ''; renderer.icons.clear(); });
}

// V1.3 : mise à jour automatique (voir src/update.js). Au lancement : rechargement direct sur la
// nouvelle version (une seule tentative par version). En cours de partie : bandeau « Mettre à jour ».
let lastCheck = 0;
async function checkForUpdate(ui, save, atLaunch) {
  if (BUILD_VERSION.includes('__') || /\+local$/.test(BUILD_VERSION) || window.claude) return;
  const now = Date.now();
  if (!atLaunch && now - lastCheck < 60000) return;
  lastCheck = now;
  const latest = await fetchLatestVersion();
  let tried = null;
  try { tried = sessionStorage.getItem(UPDATE_TRIED_KEY); } catch (e) { /* rien */ }
  let action = updateAction(latest, BUILD_VERSION, { atLaunch, triedVersion: tried });
  if (action === 'reload') {
    // Garde-fou anti-boucle : on ne recharge que si la tentative a bien pu être notée.
    let noted = false;
    try { sessionStorage.setItem(UPDATE_TRIED_KEY, latest); noted = sessionStorage.getItem(UPDATE_TRIED_KEY) === latest; } catch (e) { noted = false; }
    if (noted) {
      save();
      location.reload();
      return;
    }
    action = 'banner';
  }
  if (action === 'banner') {
    ui.showUpdate(latest);
  }
}

// Android (APK) : icônes claires dans la barre d'état, au-dessus de l'en-tête sarcelle.
function setupSystemBars() {
  try {
    const bars = window.Capacitor?.Plugins?.SystemBars;
    if (bars?.setStyle) bars.setStyle({ style: 'DARK', bar: 'StatusBar' }).catch(() => {});
  } catch (e) { /* hors APK : rien */ }
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
