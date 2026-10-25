// Service worker de Ma P'tite Supérette (V1.3, même principe que FRONTIÈRES: ARKEN).
//
// Stratégie : « RÉSEAU D'ABORD, cache en secours ».
// - En ligne : on prend TOUJOURS la dernière version publiée sur GitHub Pages (le téléphone de Jack
//   reçoit chaque fusion dans main dès le lancement suivant, dans le navigateur comme dans l'APK).
// - Hors ligne : on sert la dernière copie gardée en cache ; sinon offline.html.
// - Le nom du cache contient la version ET le commit (tamponnés par build.mjs) : chaque publication
//   change ce fichier, le téléphone installe donc le nouveau service worker, qui efface les anciens caches.
//
// Pourquoi ce changement (cause racine du blocage en V1.0) : l'ancien service worker servait d'abord
// le cache, sous un nom fixe « superette-1.0.0 ». L'appli installée réaffichait donc la V1.0 gardée
// en cache au lieu de la version publiée.
const VERSION = '__VERSION__';
const CACHE_NAME = `superette-${VERSION}`;
const SHELL = [
  './',
  'offline.html',
  'version.txt',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'no-store' }))))
      .catch(() => { /* hors ligne pendant l'installation : le cache se remplira en jouant */ })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('superette-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate';
  // Les pages (avec ou sans ?paramètres) partagent toutes l'entrée du jeu.
  const key = isPage ? new URL('./', self.registration.scope).href : req;
  event.respondWith((async () => {
    try {
      // Page et version.txt : cache: 'no-store' = toujours la copie du serveur, jamais celle du cache HTTP
      // du téléphone (GitHub Pages autorise 10 min de cache) ; pas de requête conditionnelle « 304 » non plus,
      // plus sûr dans l'APK où Capacitor relaie lui-même les pages HTML.
      const fresh = isPage || url.pathname.endsWith('version.txt');
      const res = await fetch(fresh ? new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }) : req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(key, copy)).catch(() => {}));
      }
      return res;
    } catch (e) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(key, { ignoreSearch: isPage });
      if (cached) return cached;
      if (isPage) {
        const offline = await cache.match('offline.html');
        if (offline) return offline;
      }
      return Response.error();
    }
  })());
});
