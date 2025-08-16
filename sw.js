// Unique Service Worker for Yam's v7.5.1
const CACHE_NAME = "yams-cache-v7.5.1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./favicon.ico",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== CACHE_NAME) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const accept = req.headers.get("accept") || "";

  // Network-first for HTML/navigation
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith((async () => {
      try {
        const networkResp = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, networkResp.clone());
        return networkResp;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // Cache-first for other assets with background refresh
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchPromise = fetch(req).then((resp) => {
      caches.open(CACHE_NAME).then((cache) => cache.put(req, resp.clone()));
      return resp;
    }).catch(() => cached);
    return cached || fetchPromise;
  })());
});
