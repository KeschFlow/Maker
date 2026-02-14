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

  // Typical repo structure (precache to keep app functional offline)
  "./content/units.json",
  "./core/db.js",
  "./core/engine.js",
  "./core/types.js",
  "./core/ui.js"
];

// Helper: only handle same-origin GET
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

      // Use reload to bypass HTTP cache during SW install
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
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Only GET
  if (req.method !== "GET") return;

  // Only same-origin (avoid caching third-party)
  if (!isSameOrigin(req.url)) return;

  // Navigation requests: serve app shell offline
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("./index.html", { ignoreSearch: true });
        try {
          // Try network first to get latest HTML, then cache it
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

  // Network-first for curriculum.json (keep it up-to-date)
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

  // Cache-first for everything else (app shell + content/core), with ignoreSearch
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const res = await fetch(req);
        // Cache successful basic responses only
        if (res && res.ok && res.type === "basic") {
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        // Last resort: if something fails, return index.html (keeps linear flow alive)
        const fallback = await cache.match("./index.html", { ignoreSearch: true });
        return fallback || Response.error();
      }
    })()
  );
});
