self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('elvira-v1').then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/style.css',
        '/nexus.js',
        '/theme-toggle.js',
        '/llm.js',
        '/charts.js',
        '/telemetry.js',
        '/accordion.js',
        '/import-map.json'
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
