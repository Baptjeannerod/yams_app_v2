const CACHE_STATIC = "yams-static-v12.6";
const CACHE_HTML = "yams-html-v12.6";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest?v=12.6",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (![CACHE_STATIC, CACHE_HTML].includes(k)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const accept = req.headers.get("accept") || "";

  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith((async () => {
      try {
        const networkResp = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_HTML);
        cache.put(req, networkResp.clone());
        return networkResp;
      } catch (err) {
        const cache = await caches.open(CACHE_HTML);
        const cached = await cache.match(req);
        if (cached) return cached;
        return caches.match("./index.html");
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_STATIC);
    const cached = await cache.match(req);
    const networkPromise = fetch(req).then((resp) => {
      cache.put(req, resp.clone());
      return resp;
    }).catch(() => cached);
    return cached || networkPromise;
  })());
});
