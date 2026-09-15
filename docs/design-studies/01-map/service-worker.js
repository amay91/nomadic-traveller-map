// Minimal offline cache for the app shell — no framework, no Workbox, just
// the two events a static single-page app actually needs. Bump CACHE when
// any precached file changes; the old cache is dropped on activate, so a
// stale version never lingers past the next visit.
const CACHE = "nomad-travel-map-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "../../../app/countries.js", "../../../app/geo.js",
  "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-512.png", "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache-first: this app's own files never change without a new CACHE name,
// so there's nothing to gain from a network race, only latency to lose.
// Anything not in the shell (there shouldn't be anything — no fonts, no
// analytics, no CDN) falls through to the network and is left uncached.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
