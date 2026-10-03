// ===========================================================
// SERVICE WORKER
// Caches the app shell (HTML/CSS/JS/icons) so the app opens
// instantly and works offline. Firestore has its own offline
// cache (enabled in firebase.js), so saved location DATA keeps
// working offline too, separately from this shell cache.
// ===========================================================

const CACHE_NAME = "delivery-location-sender-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./firebase.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Never intercept Firestore/Google/OSM network calls — let those
  // go straight to the network (and to Firestore's own offline cache).
  if (req.method !== "GET" || req.url.includes("firestore.googleapis.com")
      || req.url.includes("googleapis.com") || req.url.includes("openstreetmap.org")) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && req.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
