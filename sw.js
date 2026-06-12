const CACHE_NAME = 'aptiverse-v9-production';
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'css/styles.css',
  'js/core/auth.js',
  'js/utils/analytics.js',
  'js/core/db-shim.js',
  'js/core/firebase-config.js',
  'js/core/game-constants.js',
  'js/utils/rating-system.js',
  'assets/images/logo.png',
  'games/grid.html',
  'games/grid.js',
  'games/switch.html',
  'games/switch.js',
  'games/sudoku.html',
  'games/sudoku.js',
  'games/inductive.html',
  'games/inductive.js',
  'games/motion.html',
  'games/motion.js',
  'games/di.html',
  'games/di.js',
  'games/rc.html',
  'games/rc.js',
  'mock-tests.html',
  'mock-test-activity.html',
  'js/features/mock-test-engine.js',
  'profile.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache v7 (Total Refresh)');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Service Worker (Cleanup old caches)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events (Network-first strategy for better debugging)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
