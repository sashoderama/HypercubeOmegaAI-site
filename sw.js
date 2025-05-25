/* sw.js – Service Worker for Elvira Genesis-Elvira */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('elvira-v1').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/style.css',
        '/nexus.js',
        '/charts.js',
        '/llm.js',
        '/theme-toggle.js',
        '/accordion.js'
      ]);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});