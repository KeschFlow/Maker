const CACHE_NAME = "maker-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./curriculum.json",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  if (req.url.endsWith("curriculum.json")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match("./index.html")))
  );
});
