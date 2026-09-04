// Service worker: offline support + update-on-demand.
//
// Bump CACHE_VERSION on every deploy that changes any cached file (mirror
// APP_VERSION in js/config.js so the two stay in sync). That's what makes
// the next `install` see stale content, download fresh files into a new
// cache, and surface the "Update available" banner (wired in js/app.js)
// instead of silently serving old code forever.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `gymapp-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/util.js',
  './js/db.js',
  './js/exercises-seed.js',
  './js/streak.js',
  './js/router.js',
  './js/drive.js',
  './js/sync.js',
  './js/app.js',
  './js/components/modal.js',
  './js/components/toast.js',
  './js/components/exercisePicker.js',
  './js/screens/home.js',
  './js/screens/workout.js',
  './js/screens/workoutHistory.js',
  './js/screens/routines.js',
  './js/screens/progress.js',
  './js/screens/nutrition.js',
  './js/screens/sleep.js',
  './js/screens/bodymetrics.js',
  './js/screens/settings.js',
  './js/screens/more.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => (
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => (
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

// Network-first for same-origin app files (HTML/JS/CSS/manifest/icons):
// always try to fetch the latest, fall back to cache when offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

// Cache-first for third-party CDN assets (Chart.js, idb, Google Identity
// Services): they're pinned by version in the URL, so a cache hit is
// always correct and this keeps them available offline.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (isSameOrigin(request.url)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request).catch(() => fetch(request)));
  }
});
