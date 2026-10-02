// Service worker: cache-first app shell so the game works offline.
// Cache names are prefixed per game: everything on snails.se shares one origin.
const VERSION = 'snailrake-v8';
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
  './js/push.js',
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

// cache: 'reload' fetches every file from the network. A plain addAll goes
// through the browser's HTTP cache (GitHub Pages: max-age=600), so a new
// version could be installed with files from the old one.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
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

// ---------- Web Push: tournament notices ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Snigelkrattan', {
    body: d.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || 'snailrake',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

// Only our own windows: every game on snails.se shares the origin, and taking
// over a Snäckmageddon tab would be rude.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes('/snailrake/') && 'focus' in c) { if ('navigate' in c) c.navigate(url); return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
