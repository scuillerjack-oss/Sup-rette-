// V1.6 : pubs SIMULÉES (bêta). Module unique, prêt à recevoir AdMob plus tard (même interface).
//
// RÈGLE ABSOLUE : aucune vraie pub, aucun SDK, aucune requête réseau. Ce module affiche seulement un écran
// « Pub simulée (bêta) » d'environ 3 secondes avec un bouton Fermer, pour que Jack ressente le rythme.
// Le jour où AdMob sera branché (accord écrit de Jack, micro-entreprise créée), seules les fonctions
// showRewarded et showInterstitial changeront ; le reste du jeu n'y verra aucune différence.
//
// showRewarded(kind) → Promise<{ watched: boolean }> : watched = la pub est allée au bout (récompense due).
// showInterstitial()  → Promise<{ watched: true }>
export const AD_SECONDS = 3;

const LABELS = {
  cashier: 'Coffre caissier',
  stocker: 'Coffre magasinier',
  deco: 'Coffre déco',
  double: 'Bilan doublé'
};

let busy = null;

// Affiche le faux écran de pub. Sans DOM (tests Node) : résolu tout de suite.
function fakeAd({ title, rewarded, seconds = AD_SECONDS }) {
  if (busy) return busy;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || !doc.body) return Promise.resolve({ watched: true });
  busy = new Promise((resolve) => {
    const box = doc.createElement('div');
    box.id = 'fakeAd';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `<div class="fa-card">
      <small class="fa-tag">Pub simulée (bêta)</small>
      <div class="fa-art" aria-hidden="true"><span></span><span></span><span></span></div>
      <b class="fa-title">${title}</b>
      <p class="fa-txt">Ici passera une vraie pub plus tard. Aujourd’hui : aucune pub réelle, aucune connexion.</p>
      <div class="fa-bar"><i></i></div>
      <button class="fa-close" type="button">Fermer <span class="fa-count">${seconds}</span></button>
    </div>`;
    doc.body.appendChild(box);
    const bar = box.querySelector('.fa-bar i');
    const count = box.querySelector('.fa-count');
    const btn = box.querySelector('.fa-close');
    const t0 = performance.now();
    let done = false;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      bar.style.transform = `scaleX(${k})`;
      const left = Math.ceil(seconds * (1 - k));
      count.textContent = left > 0 ? String(left) : '✓';
      if (k >= 1 && !done) { done = true; box.classList.add('done'); }
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    btn.addEventListener('click', () => {
      // Pub imposée : on ne peut fermer qu'à la fin. Pub récompensée : fermer avant la fin = pas de récompense.
      if (!done && !rewarded) return;
      cancelAnimationFrame(raf);
      box.classList.add('out');
      setTimeout(() => box.remove(), 180);
      busy = null;
      resolve({ watched: done });
    });
  });
  return busy;
}

export function showRewarded(kind) {
  return fakeAd({ title: `${LABELS[kind] || 'Récompense'} · regarde jusqu’au bout`, rewarded: true });
}

export function showInterstitial() {
  return fakeAd({ title: 'Pause pub · merci de soutenir le jeu', rewarded: false });
}
