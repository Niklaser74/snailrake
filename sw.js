// Service worker: cache-first app shell so the game works offline.
// Cache names are prefixed per game: everything on snails.se shares one origin.
const VERSION = 'snailrake-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/engine.js',
  './js/physics.js',
  './js/merge.js',
  './js/rake.js',
  './js/view.js',
  './js/input.js',
  './js/levels.js',
  './js/i18n.js',
  './js/config.js',
  './js/online.js',
  './js/supa.js',
  './js/account.js',
  './js/game/snails.js',
  './js/game/cosmetics.js',
  './js/game/themes.js',
  './js/game/audio.js',
  './js/game/rng.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('snailrake-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
