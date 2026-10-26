// V1.6 : achats intégrés DÉCRITS seulement (docs/MODELE-ECONOMIQUE.md, 2.3). RIEN N'EST VENDABLE.
// Pas de Google Play Billing, pas de SDK, pas d'écran d'achat. En bêta, la vitesse ×3 reste gratuite.
// Le jour où les achats seront branchés (accord écrit de Jack), BETA_FREE passera à false et ce module
// interrogera Google Play ; le jeu ne lit que les fonctions ci-dessous.
export const BETA_FREE = true;

export const PRODUCTS_IAP = [
  { id: 'vitesse3', name: 'Vitesse ×3', price: '0,89 €', desc: 'Débloque le ×3 pour toujours (×1 et ×2 restent gratuits).' },
  { id: 'pack-gerant', name: 'Pack Gérant', price: '2,99 €', desc: 'Plus aucune pub imposée, le ×3, et 3 coffres offerts sans pub par jour réel (caissier, magasinier ou déco).' }
];

// Vitesse ×3 : gratuite pendant la bêta.
export function speed3Unlocked() {
  return BETA_FREE;
}

// Pack Gérant : jamais possédé tant que rien n'est vendable (les pubs imposées simulées restent donc actives).
export function hasManagerPack() {
  return false;
}
