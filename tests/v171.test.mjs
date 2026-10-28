// V1.7.1 : demande de Jack (28/10/2026) — qualité d'image « Haute » (la plus nette) dès le début.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settings, savedQuality } from '../src/audio.js';
import { renderPixelRatio, slowNotice, SLOW_NOTICE, Renderer3D } from '../src/render3d.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('V1.7.1 : « Haute » par défaut au premier lancement', () => {
  assert.equal(settings.quality, 'high');
  assert.equal(settings.qualityChosen, false);
  assert.deepEqual(savedQuality({}), { quality: 'high', qualityChosen: false });
  assert.deepEqual(savedQuality(null), { quality: 'high', qualityChosen: false });
});

test('V1.7.1 : des réglages V1.7 (« auto » jamais choisi) passent en « Haute »', () => {
  assert.deepEqual(savedQuality({ sound: true, haptics: true, simAds: true, quality: 'auto' }), { quality: 'high', qualityChosen: false });
});

test('V1.7.1 : un choix fait par le joueur dans le menu est gardé', () => {
  for (const q of ['auto', 'high', 'eco']) assert.deepEqual(savedQuality({ quality: q, qualityChosen: true }), { quality: q, qualityChosen: true });
  assert.deepEqual(savedQuality({ quality: 'ultra', qualityChosen: true }), { quality: 'high', qualityChosen: false });
  assert.match(read('src/ui.js'), /settings\.quality = id;\s*settings\.qualityChosen = true;/);
});

test('V1.7.1 : en « Haute », la résolution est celle de l’écran (×3 max), jamais baissée toute seule', () => {
  assert.equal(renderPixelRatio(2.75, 'high', 0), 2.75);
  assert.equal(renderPixelRatio(2.75, 'high', 3), 2.75);
  assert.equal(renderPixelRatio(4, 'high', 0), 3);
  assert.match(read('src/render3d.js'), /if \(mode === 'high'\) \{ this\.watchSlow\(dt\); return; \}/);
});

test('V1.7.1 : téléphone qui rame durablement → un seul conseil, sans rien changer', () => {
  const p = { slow: 0 };
  assert.equal(slowNotice(15, p), false);
  assert.equal(slowNotice(15, p), false);
  assert.equal(slowNotice(40, p), false, 'une mesure correcte remet à zéro');
  for (let i = 1; i < SLOW_NOTICE.need; i++) assert.equal(slowNotice(10, p), false);
  assert.equal(slowNotice(10, p), true);
  const src = read('src/render3d.js');
  assert.match(src, /this\.slowTold = true;/);
  assert.match(src, /if \(this\.slowTold \|\| /);
});

// Bug trouvé en relecture : la boucle de jeu plafonne dt à 0,05 s, donc avec ce dt on ne voyait jamais < 20 i/s.
function fakeRenderer(tuto = false) {
  const toasts = [];
  const r = Object.create(Renderer3D.prototype);
  r.game = { state: { tutoMode: tuto }, emit: (type, d) => { if (type === 'toast') toasts.push(d.text); } };
  return { r, toasts };
}
function play(r, fps, seconds, clock) {
  for (let i = 0; i < fps * seconds; i++) { clock.t += 1000 / fps; r.watchSlow(0.05, clock.t); }
}

test('V1.7.1 : un téléphone à 10 i/s reçoit bien le conseil (vrai temps, pas le dt plafonné), une seule fois', () => {
  const { r, toasts } = fakeRenderer();
  const clock = { t: 1000 };
  play(r, 10, 30, clock);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Qualité d’image/);
  play(r, 10, 30, clock);
  assert.equal(toasts.length, 1, 'une seule fois par lancement');
});

test('V1.7.1 : téléphone fluide ou tutoriel → aucun conseil', () => {
  const a = fakeRenderer();
  play(a.r, 60, 30, { t: 1000 });
  assert.equal(a.toasts.length, 0);
  const b = fakeRenderer(true);
  play(b.r, 10, 30, { t: 1000 });
  assert.equal(b.toasts.length, 0);
});

test('V1.7.1 : version et cahier des charges', () => {
  assert.equal(JSON.parse(read('package.json')).version, '1.7.1');
  assert.match(read('docs/CAHIER-DES-CHARGES.md'), /### V1\.7\.1/);
});
