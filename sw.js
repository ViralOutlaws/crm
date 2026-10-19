// Viral Outlaws CRM – Service Worker
const CACHE = 'vo-crm-v6';
const ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && !k.startsWith('jarvis-')).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Jarvis hat einen eigenen Service Worker unter /jarvis/. Nicht cachen und nicht abfangen.
  try {
    const path = new URL(e.request.url).pathname;
    if (path === '/jarvis' || path.startsWith('/jarvis/')) return;
  } catch (_) { /* ignore */ }
  // Network first, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
