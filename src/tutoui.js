// V1.5 : affichage du tutoriel. Une bulle (titre, consigne, boutons) placée là où elle ne cache pas ce qu'il faut
// toucher, et des anneaux orange autour des boutons et des cases du magasin à toucher.
// La bulle peut être repliée ; « Quitter » ramène à sa partie (avec confirmation).
import { Tutorial, STEPS } from './tutorial.js';

const qs = (sel) => document.querySelector(sel);

export class TutoUI {
  constructor(game, renderer, ui, hooks) {
    this.g = game;
    this.r = renderer;
    this.ui = ui;
    this.hooks = hooks;
    this.t = new Tutorial(game);
    this.box = qs('#tuto');
    this.layer = qs('#tutoMarks');
    this.folded = false;
    this.shownKey = '';
    this.clock = 0;
    this.box.hidden = false;
    this.box.addEventListener('click', (e) => this.onClick(e));
    this.render();
  }

  onClick(e) {
    const b = e.target.closest('[data-t]');
    if (!b || b.disabled) return;
    const a = b.dataset.t;
    if (a === 'ok') {
      if (this.t.finished) return this.hooks.leaveTutorial({ finished: true });
      if (this.t.confirm()) this.hooks.save();
    } else if (a === 'fold') this.folded = !this.folded;
    else if (a === 'quit') return this.ui.askQuitTutorial();
    this.shownKey = '';
    this.render();
  }

  // Appelé à chaque image.
  frame(dt = 0.016) {
    if (this.t.update()) {
      this.folded = false;
      this.hooks.save();
      this.ui.toast('✔ Étape réussie !');
    }
    this.clock += dt;
    if (this.clock < 0.12) return;
    this.clock = 0;
    this.render();
  }

  render() {
    const st = this.t.step;
    const ready = this.t.ready();
    const key = `${this.t.index}|${this.folded}|${ready}|${st.text(this.g, this.ui)}`;
    if (key !== this.shownKey) {
      this.shownKey = key;
      const n = STEPS.filter((x) => !x.final).length;
      const num = Math.min(this.t.index + 1, n);
      this.box.classList.toggle('folded', this.folded);
      this.box.classList.toggle('final', !!st.final);
      if (this.folded) {
        this.box.innerHTML = `<button class="tt-fold" data-t="fold" aria-label="Afficher la consigne">📘 Tutoriel ${num}/${n} · ${st.title}</button>`;
      } else {
        const btn = st.button ? `<button class="tt-ok" data-t="ok" ${ready ? '' : 'disabled'}>${ready ? st.button : st.waiting || st.button}</button>` : '';
        this.box.innerHTML = `<div class="tt-top"><small>${st.final ? 'Tutoriel' : `Tutoriel · étape ${num}/${n}`}</small>
          ${st.final ? '' : '<span><button data-t="fold" aria-label="Replier la bulle">—</button><button data-t="quit">Quitter</button></span>'}</div>
          <b class="tt-title">${st.title}</b><p>${st.text(this.g, this.ui)}</p>${btn}`;
      }
    }
    this.place();
  }

  // Cibles à l'écran : rectangles des éléments DOM et cercles autour des cases du magasin.
  targets() {
    const tg = this.t.step.target(this.g, this.ui) || {};
    const rects = [];
    for (const sel of tg.dom || []) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('[hidden]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) rects.push({ x: r.left, y: r.top, w: r.width, h: r.height, kind: 'box' });
      }
    }
    const covered = this.ui.sheet || !qs('#modal').hidden || !qs('#checkout').hidden;
    if (!covered && tg.tiles && this.r.tileScreen) {
      const cv = this.r.canvas.getBoundingClientRect();
      for (const t of tg.tiles) {
        const p = this.r.tileScreen(t.r, t.c);
        const rad = 26;
        rects.push({ x: cv.left + p.x - rad, y: cv.top + p.y - rad, w: rad * 2, h: rad * 2, kind: 'ring' });
      }
    }
    return rects;
  }

  place() {
    // Une fenêtre (niveau, bilan…) qui ne concerne pas l'étape : la bulle s'efface le temps de la lire.
    const tg = this.t.step.target(this.g, this.ui) || {};
    const modalOpen = !qs('#modal').hidden;
    const aboutModal = (tg.dom || []).some((sel) => sel.includes('#modalCard'));
    const hide = modalOpen && !aboutModal && !this.t.step.final;
    this.box.classList.toggle('away', hide);
    if (hide) {
      if (this.marksHtml) { this.marksHtml = ''; this.layer.innerHTML = ''; }
      return;
    }
    // Étape qui parle d'une fenêtre (bilan) : la fenêtre descend sous la bulle au lieu d'être cachée par elle.
    const modal = qs('#modal');
    const room = modalOpen && aboutModal && !this.folded;
    modal.classList.toggle('tt-room', room);
    if (room) modal.style.setProperty('--ttroom', `${Math.round(this.box.offsetHeight + 14)}px`);
    const rects = this.targets();
    // Anneaux (au-dessus de tout, sans bloquer le doigt)
    const html = rects.slice(0, 12).map((r) => `<i class="tt-mark ${r.kind}" style="left:${Math.round(r.x - 4)}px;top:${Math.round(r.y - 4)}px;width:${Math.round(r.w + 8)}px;height:${Math.round(r.h + 8)}px"></i>`).join('');
    if (html !== this.marksHtml) {
      this.marksHtml = html;
      this.layer.innerHTML = html;
    }
    // Bulle : première position qui ne recouvre aucune cible (sinon la moins gênante).
    const box = this.box;
    const vh = window.innerHeight;
    const bh = box.offsetHeight;
    const hud = qs('.hud').getBoundingClientRect();
    const bar = qs('.bar').getBoundingClientRect();
    const sheetTop = this.ui.sheet ? qs('#sheetBody').getBoundingClientRect().top : vh;
    const coTop = !qs('#checkout').hidden ? qs('#checkout').getBoundingClientRect().top : vh;
    const lowest = Math.min(bar.top, sheetTop, coTop);
    const cands = room ? [4] : this.t.step.final
      ? [Math.max(hud.bottom + 8, (vh - bh) / 2)]
      : [hud.bottom + 6, lowest - bh - 8, Math.max(4, hud.top + 4), (vh - bh) / 2];
    let best = cands[0];
    let bestHit = Infinity;
    for (const y of cands) {
      const top = Math.max(4, Math.min(vh - bh - 4, y));
      const hit = rects.reduce((a, r) => a + Math.max(0, Math.min(top + bh, r.y + r.h) - Math.max(top, r.y)), 0);
      if (hit < bestHit - 0.5) { bestHit = hit; best = top; }
      if (hit === 0) break;
    }
    const top = Math.round(best);
    if (top !== this.top) {
      this.top = top;
      box.style.top = `${top}px`;
    }
  }

  destroy() {
    this.box.hidden = true;
    this.layer.innerHTML = '';
  }
}
