// Service worker de Ma P'tite Supérette.
// Stratégie : « cache d'abord, mise à jour en arrière-plan » (stale-while-revalidate).
// - Le jeu s'ouvre instantanément depuis le cache, même hors ligne, après le premier lancement.
// - À chaque lancement en ligne, la nouvelle version est téléchargée en arrière-plan :
//   elle s'affiche au lancement SUIVANT (pas besoin de toucher à ce fichier pour publier).
// Monter VERSION seulement pour forcer le vidage complet des anciens caches.
const VERSION = '1.0.0';
const CACHE_NAME = `superette-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
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
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Les pages (avec ou sans ?paramètres) partagent toutes l'entrée du jeu.
    const key = isPage ? new URL('./', self.registration.scope).href : req;
    const cached = await cache.match(key, { ignoreSearch: isPage });

    const network = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    if (res) return res;
    if (isPage) {
      const offline = await cache.match('offline.html');
      if (offline) return offline;
    }
    return Response.error();
  })());
});
