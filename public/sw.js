/* sw.js - MAKER Offline-First Service Worker */
/* Comments in English by project rule */

const CACHE_NAME = "maker-v5"; // bump to force update

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

// Create a stable cache key for any request: same path, no query.
// This prevents cache bloat from "?v=..." while still allowing ignoreSearch matching.
function stableKeyForRequest(request) {
  try {
    const u = new URL(request.url);
    // Keep absolute pathname (works for GitHub Pages subpaths like /Maker/...)
    return u.pathname;
  } catch {
    return request;
  }
}

// Safe precache: fetch each asset, cache only successful responses.
// This prevents SW install from failing when optional assets are missing.
async function safePrecache(cache, urls) {
  await Promise.allSettled(
    urls.map(async (u) => {
      try {
        const req = new Request(u, { cache: "reload" });
        const res = await fetch(req);
        if (res && res.ok) {
          // Store under the provided URL (already stable, no search)
          await cache.put(u, res.clone());
          return true;
        }
      } catch {}
      return false;
    })
  );
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

  // curriculum.json: stable key + background update
  if (url.pathname.endsWith("curriculum.json")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        // Always use the same key regardless of query params
        const key = "./curriculum.json";
        const cached = await cache.match(key, { ignoreSearch: true });

        // Background update (does not block response)
        event.waitUntil(
          (async () => {
            try {
              const fresh = await fetch(key, { cache: "no-cache" });
              if (fresh && fresh.ok) await cache.put(key, fresh.clone());
            } catch {}
          })()
        );

        if (cached) return cached;

        // If not cached, try network once
        try {
          const fresh = await fetch(key, { cache: "no-cache" });
          if (fresh && fresh.ok) {
            await cache.put(key, fresh.clone());
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

      // Use stable key to avoid query-based duplicates
      const stableKey = stableKeyForRequest(req);
      const cached = await cache.match(stableKey, { ignoreSearch: true });

      const fetchPromise = (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok && fresh.type === "basic") {
            await cache.put(stableKey, fresh.clone());
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
