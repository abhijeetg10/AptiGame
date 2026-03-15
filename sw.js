const CACHE_NAME = 'aptiverse-v2';
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'styles.css',
  'auth.js',
  'analytics.js',
  'firebase-config.js',
  'game-constants.js',
  'rating-system.js',
  'logo.png',
  'grid.html',
  'grid.js',
  'switch.html',
  'switch.js',
  'sudoku.html',
  'sudoku.js',
  'inductive.html',
  'inductive.js',
  'motion.html',
  'motion.js',
  'di.html',
  'di.js',
  'rc.html',
  'rc.js',
  'mock-tests.html',
  'mock-test-activity.html',
  'mock-test-engine.js',
  'profile.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
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
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch events (Cache-first strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
