// Effets sonores synthétisés (aucun fichier) + vibrations optionnelles.
let ctx = null;
let master = null;
// simAds (V1.6) : « Simuler les pubs (bêta) », activé par défaut (fausses pubs de src/ads.js, aucune vraie pub).
export const settings = { sound: true, haptics: true, simAds: true };

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slide = 0 } = {}) {
  if (!settings.sound) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let lastPlace = 0;
export function sfx(name, data = {}) {
  switch (name) {
    case 'beep': tone(1760, 0.09, { type: 'square', vol: 0.07 }); break;
    case 'beepSoft': tone(1760, 0.06, { type: 'square', vol: 0.025 }); break;
    case 'key': tone(900, 0.05, { type: 'triangle', vol: 0.08 }); break;
    case 'coin': tone(1320, 0.07, { type: 'triangle', vol: 0.12 }); tone(1980, 0.09, { type: 'triangle', vol: 0.08, delay: 0.04 }); break;
    case 'cash':
      tone(988, 0.1, { type: 'triangle', vol: 0.16 });
      tone(1319, 0.1, { type: 'triangle', vol: 0.16, delay: 0.08 });
      tone(1976, 0.25, { type: 'triangle', vol: 0.14, delay: 0.16 });
      break;
    case 'cashSoft': tone(1319, 0.08, { type: 'triangle', vol: 0.05 }); tone(1976, 0.14, { type: 'triangle', vol: 0.05, delay: 0.07 }); break;
    case 'pick': tone(330, 0.08, { type: 'triangle', vol: 0.14, slide: 120 }); break;
    case 'drop': tone(220, 0.1, { type: 'triangle', vol: 0.14, slide: -60 }); break;
    case 'place': {
      const now = performance.now();
      if (now - lastPlace < 45) break;
      lastPlace = now;
      tone(520 + (data.n || 0) * 18, 0.05, { type: 'sine', vol: 0.09 });
      break;
    }
    case 'done': tone(660, 0.08, { vol: 0.12 }); tone(880, 0.12, { vol: 0.12, delay: 0.07 }); break;
    case 'buy': tone(523, 0.08, { type: 'triangle', vol: 0.12 }); tone(784, 0.14, { type: 'triangle', vol: 0.12, delay: 0.07 }); break;
    case 'build': tone(196, 0.12, { type: 'square', vol: 0.06 }); tone(392, 0.16, { type: 'triangle', vol: 0.12, delay: 0.1 }); break;
    case 'error': tone(180, 0.18, { type: 'square', vol: 0.06, slide: -40 }); break;
    case 'angry': tone(240, 0.22, { type: 'sawtooth', vol: 0.04, slide: -90 }); break;
    case 'open': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.09 })); break;
    case 'level': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.13, delay: i * 0.08 })); break;
    case 'bell': tone(1568, 0.3, { vol: 0.08 }); tone(2093, 0.4, { vol: 0.06, delay: 0.05 }); break;
    case 'tick': tone(1200, 0.03, { type: 'square', vol: 0.04 }); break;
    case 'delivery': tone(392, 0.1, { type: 'triangle', vol: 0.08 }); tone(330, 0.12, { type: 'triangle', vol: 0.08, delay: 0.1 }); break;
    default: break;
  }
}

let lastHaptic = 0;
export function haptic(ms = 15) {
  if (!settings.haptics) return;
  const now = performance.now();
  if (now - lastHaptic < 120) return;
  lastHaptic = now;
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    /* vibrations non disponibles */
  }
}
