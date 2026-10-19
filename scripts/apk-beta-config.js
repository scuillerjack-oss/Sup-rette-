// APK de BÊTA uniquement : l'appli charge le jeu depuis le site GitHub Pages au lieu de
// l'embarquer (même principe que RUPTURE et FRONTIÈRES: ARKEN). Résultat : chaque fusion
// dans main met à jour l'appli déjà installée au lancement suivant, sans retélécharger l'APK.
// Hors ligne, le service worker du site sert la dernière version mise en cache ; si rien
// n'est encore en cache, Capacitor affiche offline.html (embarqué depuis dist/).
//
// Usage : node scripts/apk-beta-config.js   (modifie capacitor.config.json DANS LA CI seulement)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BETA_URL = 'https://scuillerjack-oss.github.io/Sup-rette-/';

export function betaConfig(cfg) {
  return {
    ...cfg,
    server: { ...(cfg.server || {}), url: BETA_URL, errorPath: 'offline.html', cleartext: false }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = 'capacitor.config.json';
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  writeFileSync(path, JSON.stringify(betaConfig(cfg), null, 2) + '\n');
  console.log(`APK de bêta : le jeu sera chargé depuis ${BETA_URL}`);
}
