// Minimal offline cache for the app shell — no framework, no Workbox, just
// the two events a static single-page app actually needs.
//
// CACHE was `nomad-travel-map-v1` → `-v2` on 2026-09-14, because v1 had gone
// stale in the worst possible way — see the fetch handler below for what went
// wrong and why the strategy changed with it. Renamed again with the product
// (Nomad Travel Map → Nomadic Traveller Map), which resets the suffix to v1;
// that costs nothing, since `activate` deletes every cache whose name isn't the
// current one, so the old `nomad-travel-map-*` entries are dropped on first run
// rather than lingering. The name only has to be UNIQUE per deployment, not
// monotonically increasing.
const CACHE = "nomadic-traveller-map-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./countries.js", "./geo.js", "./logic.js", "./app.js", "./styles.css",
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

// NETWORK-FIRST, cache as fallback. This was cache-first until 2026-09-14,
// on the reasoning that "this app's own files never change without a new
// CACHE name, so there's nothing to gain from a network race, only latency
// to lose." That reasoning was sound and the practice was not: app.js and
// styles.css changed roughly twenty times in a single working session and
// CACHE was never once bumped, so every browser that had ever loaded the app
// kept serving a frozen copy — silently, with no error and no visible clue.
// The owner reported "I still don't see country labels" on a build where the
// labels demonstrably worked in a fresh browser; the cause was this handler
// handing them a months-old app.js. Reproduced directly before changing it:
// cache a file, edit it on disk, reload in the same profile, still the old
// bytes.
//
// The trade was wrong in both directions. What F20 actually needs is for the
// cache to EXIST when the network is gone — not for it to win when the
// network is right there. Network-first gives the offline guarantee and the
// eviction exemption exactly as before, and costs one round-trip on a ~400 KB
// app served from localhost or a CDN. "Silently serving a stale app forever"
// is a far worse failure than "a few milliseconds slower when online".
//
// Only successful same-origin responses are cached, so a 404 or an error page
// can never poison the cache the way a stale 200 just did.
//
// `cache: "no-cache"` is load-bearing, not decoration. A bare `fetch(e.request)`
// still goes through the BROWSER'S OWN HTTP cache, so "network-first" is only as
// fresh as that cache — and a server that sends `Last-Modified` with no
// `Cache-Control` (Python's `http.server`, which is what this project develops
// against) invites heuristic caching, where the browser reuses a response for a
// fraction of its age without asking the server at all. Caught renaming the app
// on 2026-09-15: the page, the manifest and a plain `fetch()` all still returned
// the OLD product name while the server on disk had the new one, and a
// `cache: "reload"` fetch in the same tab proved the bytes were there all along.
// That is a milder cousin of the v1 disaster below — time-bounded rather than
// permanent — but it makes the guarantee in this comment false, so: `no-cache`
// forces a revalidation (a conditional request; an unchanged file still answers
// 304 and costs almost nothing) instead of a blind cache read.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || Response.error()))
  );
});
