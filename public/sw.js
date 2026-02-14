/* sw.js - MAKER Offline-First Service Worker */
/* Comments in English by project rule */

const CACHE_NAME = "maker-v3"; // bump to force update
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./curriculum.json",
  "./manifest.json",

  // Precache required runtime assets
  "./content/units.json",
  "./core/db.js",
  "./core/engine.js",
  "./core/types.js",
  "./core/ui.js"
];

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const requests = APP_SHELL.map((u) => new Request(u, { cache: "reload" }));
      await cache.addAll(requests);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  if (req.method !== "GET") return;
  if (!isSameOrigin(req.url)) return;

  // Navigation: keep app shell working offline
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("./index.html", { ignoreSearch: true });
        try {
          const fresh = await fetch(req);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Network-first for curriculum.json
  if (new URL(req.url).pathname.endsWith("curriculum.json")) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const res = await fetch(req);
          cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req, { ignoreSearch: true })) || Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first for others (with ignoreSearch)
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch {
        const fallback = await cache.match("./index.html", { ignoreSearch: true });
        return fallback || Response.error();
      }
    })()
  );
});
