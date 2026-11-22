const CACHE_NAME = 'quietly-shell-v4';
const SOUND_CACHE = 'quietly-sounds-v1'; // kept across versions; filled by the "Save sounds for offline use" button or on first play
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
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key !== SOUND_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

// Audio files: use the saved copy when there is one (answering "Range" requests
// the way a server would, which audio players need); otherwise go to the network
// and quietly save a full copy in the background for next time.
const savingSounds = new Set();
async function serveSound(request, event) {
  const url = new URL(request.url);
  const cache = await caches.open(SOUND_CACHE);
  const cached = await cache.match(url.pathname);
  if (!cached) {
    if (request.headers.has('range') && !savingSounds.has(url.pathname)) {
      savingSounds.add(url.pathname);
      event.waitUntil(cache.add(url.pathname).catch(() => {}).finally(() => savingSounds.delete(url.pathname)));
    }
    return fetch(request);
  }
  const range = request.headers.get('range');
  if (!range) return cached;
  const buffer = await cached.arrayBuffer();
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const size = buffer.byteLength;
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : size - 1;
  if (match && !match[1] && match[2]) { start = Math.max(0, size - parseInt(match[2], 10)); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
  return new Response(buffer.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': cached.headers.get('Content-Type') || 'audio/mp4',
    'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes'
  } });
}

// Network first: always show the newest version when online,
// fall back to the last saved copy when offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/sounds/')) { event.respondWith(serveSound(request, event)); return }
  if (request.headers.has('range')) return;
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
