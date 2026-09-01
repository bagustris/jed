const CACHE_VERSION = 'jed-v4';

// Only the app shell + the two small tables needed immediately (romaji-kana
// conversion, radical picker) are precached. Everything else under data/ --
// word shards, search indices, kanji.json, kanjivg/*.svg -- is large and
// fetched on demand; it still ends up cached (see the fetch handler below),
// just opportunistically rather than at install time. Adding those paths
// here would turn every install into a multi-hundred-MB download.
const CORE_ASSETS = [
  '.',
  'index.html',
  'style.css',
  'manifest.json',
  'js/kana-convert.js',
  'js/data-loader.js',
  'js/conjugation.js',
  'js/search.js',
  'js/radicals.js',
  'js/notepad.js',
  'js/history.js',
  'js/settings.js',
  'js/app.js',
  'data/kana-romaji.json',
  'data/radicals.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate for every same-origin GET, not just CORE_ASSETS --
// this is what gives on-demand data/ fetches (word shards, kanji.json,
// kanjivg SVGs) offline availability after their first successful fetch,
// without needing to list them explicitly above.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept requests for the SW script itself. Without this, a
  // page-level `fetch('/sw.js')` -- including the one this app's own
  // registration/update flow could end up making indirectly -- gets
  // answered out of this same cache, silently serving back whatever
  // (possibly stale) copy of sw.js was cached earlier instead of hitting
  // the network, which defeats the browser's own update-detection.
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => null);
      // Keep the revalidation fetch (and its cache.put) alive even after we
      // hand back `cached` below -- without waitUntil() here, the browser is
      // free to terminate this worker as soon as the respondWith() promise
      // settles, and the network half of stale-while-revalidate may never
      // finish. Also fall back to a synthesized network-error Response
      // instead of `undefined` when there's neither a cached entry nor a
      // successful fetch (fully offline, resource never fetched before) --
      // resolving respondWith() with undefined throws instead of failing
      // the request cleanly.
      event.waitUntil(network);
      return cached || (await network) || Response.error();
    })
  );
});
