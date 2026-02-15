/* sw.js - MAKER Offline-First Service Worker */
/* Comments in English by project rule */

const CACHE_NAME = "maker-v4"; // bump to force update

// Keep your legacy paths if they exist, but NEVER let install fail if they don't.
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./motor_ar.js",
  "./curriculum.json",
  "./manifest.json",

  // Optional / legacy (cache if present, ignore if missing)
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

// Safe precache: fetch each asset, cache only successful responses.
// This prevents SW install from failing when optional assets are missing.
async function safePrecache(cache, urls) {
  const results = await Promise.allSettled(
    urls.map(async (u) => {
      try {
        const req = new Request(u, { cache: "reload" });
        const res = await fetch(req);
        if (res && res.ok) {
          await cache.put(u, res.clone());
          return true;
        }
      } catch {}
      return false;
    })
  );
  // We intentionally ignore failures.
  return results;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await safePrecache(cache, APP_SHELL);
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      } catch {}
      try {
        await self.clients.claim();
      } catch {}
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;
  if (!isSameOrigin(req.url)) return;

  const url = new URL(req.url);

  // Navigation: network-first, fallback to cached index.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(req);
          // Keep index fresh for shell updates
          await cache.put("./index.html", fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match("./index.html", { ignoreSearch: true });
          return (
            cached ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
          );
        }
      })()
    );
    return;
  }

  // curriculum.json: cache-first with a stable key (ignores query params),
  // update in background to keep content fresh without breaking offline.
  if (url.pathname.endsWith("/curriculum.json")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("./curriculum.json", { ignoreSearch: true });

        // Background update (does not block response)
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch("./curriculum.json", { cache: "no-cache" });
              if (fresh && fresh.ok) await cache.put("./curriculum.json", fresh.clone());
            } catch {}
          })()
        );

        if (cached) return cached;

        // If not cached, try network
        try {
          const fresh = await fetch("./curriculum.json", { cache: "no-cache" });
          if (fresh && fresh.ok) {
            await cache.put("./curriculum.json", fresh.clone());
            return fresh;
          }
        } catch {}

        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
      })()
    );
    return;
  }

  // Other assets: stale-while-revalidate (fast + updates when online)
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });

      const fetchPromise = (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok && fresh.type === "basic") {
            await cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          return null;
        }
      })();

      return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
    })()
  );
});
