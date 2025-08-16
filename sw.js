const CACHE_NAME = "yams-cache-v7.5.1";
const URLS = ["./","./index.html","./style.css","./script.js","./favicon.ico"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(URLS)));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(e.request);
    try {
      const net = await fetch(e.request, { cache: "no-store" });
      cache.put(e.request, net.clone());
      return net;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
