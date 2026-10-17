// Jarvis-PWA, Scope nur /jarvis/. Der CRM-Service-Worker unter /sw.js fasst diesen Pfad nicht an.
const CACHE = "jarvis-v5";
const BASE = new URL("./", self.location).href;
const ASSETS = ["", "index.html", "styles.css", "app.js", "data.js", "speech.js", "listen.js", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png"]
  .map((p) => new URL(p, BASE).href);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (url) => {
      try { await cache.add(url); } catch { /* einzelner Fehlschlag darf die Installation nicht stoppen */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("jarvis-") && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/jarvis/")) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok && url.pathname.startsWith("/jarvis/")) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      return caches.match(new URL("./index.html", BASE).href);
    }
  })());
});
