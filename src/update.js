// V1.3 : version visible et mise à jour automatique (même principe que FRONTIÈRES: ARKEN).
//
// L'APK de bêta charge le jeu depuis GitHub Pages. À chaque fusion dans main, le site publie
// version.txt (« 1.3.0+abc1234 »). Le jeu compare cette version à la sienne :
//  - au lancement : si une version plus récente existe, il sauvegarde et se recharge tout seul
//    (une seule tentative par version, pour ne jamais boucler) ;
//  - au retour dans l'appli (Android garde souvent la page ouverte des jours) : un bandeau propose
//    « Mettre à jour » sans couper la partie en cours.
// Silencieux hors ligne, dans l'aperçu Claude et en développement local.

export const BUILD_VERSION = '__BUILD__';
export const UPDATE_TRIED_KEY = 'superette-update-tried';

export function parseBuild(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:\+([0-9a-z]+))?$/i.exec(String(v || '').trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], sha: (m[4] || '').toLowerCase() };
}

// Vrai si « latest » (publiée) est plus récente que « current » (celle qui tourne).
// Même numéro mais autre commit = nouvelle publication (ex. correctif fusionné sans monter la version).
export function isNewerBuild(latest, current) {
  const a = parseBuild(latest);
  const b = parseBuild(current);
  if (!a || !b || !b.sha || b.sha === 'local' || !a.sha || a.sha === 'local') return false;
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  return a.sha !== b.sha;
}

// Récupère la version publiée (jamais depuis un cache). Renvoie '' en cas d'échec.
export async function fetchLatestVersion(fetchFn = globalThis.fetch, url = 'version.txt') {
  try {
    if (!fetchFn) return '';
    const res = await fetchFn(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res || !res.ok) return '';
    return String(await res.text()).trim();
  } catch (e) {
    return '';
  }
}

// Décide quoi faire d'une version publiée : 'none', 'reload' (au lancement, première tentative)
// ou 'banner' (en cours de partie, ou rechargement déjà tenté pour cette version).
export function updateAction(latest, current, { atLaunch, triedVersion }) {
  if (!isNewerBuild(latest, current)) return 'none';
  if (atLaunch && triedVersion !== latest) return 'reload';
  return 'banner';
}
