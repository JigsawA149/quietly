const CACHE_NAME = 'quietly-shell-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

// Save the app shell AND the script/style files the page needs, so the very
// first visit already works offline (not only after a second refresh).
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
    await Promise.all(assets.map(url => cache.add(url).catch(() => {})));
  } catch (error) { /* offline during install: fine, they are saved as they are used */ }
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

// Network first: always show the newest version when online,
// fall back to the last saved copy when offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.headers.has('range') || url.pathname.startsWith('/sounds/')) return; // big audio files: left to the browser
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.status === 200) {
        const copy = response.clone();
        const copyForIndex = request.mode === 'navigate' ? response.clone() : null;
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, copy);
          if (copyForIndex) cache.put('/index.html', copyForIndex);
        });
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  );
});
