// Calcul du modèle économique de Ma P'tite Supérette (docs/MODELE-ECONOMIQUE.md, sections 1 à 4 et 9).
// Usage : node scripts/economie.mjs   (aucune dépendance, aucun réseau)
// Hypothèses explicites : voir docs/MODELE-ECONOMIQUE.md. Tout est en euros, par mois, pour N joueurs actifs/mois.

export const N = 10000;
export const COTISATIONS = 0.212;
export const COMMISSION_PLAY = 0.15; // 10 % service + 5 % facturation, petit développeur (< 1 M$/an), dès le 30/06/2026
export const COMMISSION_ANCIENNE = 0.25;

// jours = jours joués par joueur actif et par mois ; forcees/recomp = pubs par jour joué ;
// ecpmF/ecpmR = € pour 1 000 pubs ; achat = part des joueurs qui achètent dans le mois ; panier = prix moyen brut.
export const SCENARIOS = {
  bas: { jours: 3, forcees: 1.0, ecpmF: 2.5, recomp: 1.0, ecpmR: 4, achat: 0.005, panier: 2.0 },
  central: { jours: 5, forcees: 1.5, ecpmF: 4, recomp: 2.5, ecpmR: 6, achat: 0.01, panier: 2.5 },
  haut: { jours: 8, forcees: 1.5, ecpmF: 6, recomp: 4, ecpmR: 9, achat: 0.02, panier: 3.0 },
};

// Hypothèses prudentes sur le classement (option recommandée : défi de la semaine, partie séparée).
export const CLASSEMENT = {
  bas: { participants: 0.10, hausseJours: 0.0 }, // le classement n'attire personne de plus
  central: { participants: 0.25, hausseJours: 0.20 }, // 1 joueur sur 4 y joue, et joue 20 % de jours en plus
  haut: { participants: 0.40, hausseJours: 0.40 },
};
export const PART_JOURS_CLASSES = 0.5; // la moitié des jours des participants se passent en partie classée
export const RECOMP_RESTANTE_CLASSE = 0.25; // en partie classée : seul le coffre déco reste (1 récompense sur 4)
export const ACHATS_RESTANTS = 0.9; // -10 % d'achats (le Pack Gérant « 3 coffres » vaut moins) : hypothèse prudente

export function revenu(s, commission = COMMISSION_PLAY, classement = null) {
  const pubsJour = (s.forcees * s.ecpmF + s.recomp * s.ecpmR) / 1000;
  const forceesJour = (s.forcees * s.ecpmF) / 1000;
  const recompJour = (s.recomp * s.ecpmR) / 1000;
  let joursTotal = N * s.jours;
  let joursClasses = 0;
  if (classement) {
    const sup = N * classement.participants * s.jours * classement.hausseJours;
    joursTotal += sup;
    joursClasses = N * classement.participants * s.jours * (1 + classement.hausseJours) * PART_JOURS_CLASSES;
  }
  const pubs = (joursTotal - joursClasses) * pubsJour + joursClasses * (forceesJour + recompJour * RECOMP_RESTANTE_CLASSE);
  let achats = N * s.achat * s.panier * (1 - commission);
  if (classement) achats *= ACHATS_RESTANTS;
  const brut = pubs + achats;
  return { pubs, achats, brut, net: brut * (1 - COTISATIONS), joursTotal, joursClasses };
}

const f = (x) => Math.round(x).toString().padStart(6);
if (process.argv[1] && process.argv[1].endsWith('economie.mjs')) {
  console.log(`Revenu mensuel pour ${N} joueurs actifs/mois (€)`);
  console.log('scénario | commission 25 % (ancien) | commission 15 % | + classement (15 %) | net après cotisations (sans / avec)');
  for (const k of Object.keys(SCENARIOS)) {
    const s = SCENARIOS[k];
    const a = revenu(s, COMMISSION_ANCIENNE), b = revenu(s), c = revenu(s, COMMISSION_PLAY, CLASSEMENT[k]);
    console.log(`${k.padEnd(8)} |${f(a.brut)} |${f(b.brut)} |${f(c.brut)} (${(((c.brut / b.brut) - 1) * 100).toFixed(1)} %) | ${f(b.net)} / ${f(c.net)}`);
  }
}
