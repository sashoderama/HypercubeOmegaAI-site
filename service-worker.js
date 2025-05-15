importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

workbox.routing.registerRoute(
    ({url}) => url.pathname.startsWith('/api'),
    new workbox.strategies.NetworkFirst()
);

workbox.routing.registerRoute(
    ({url}) => /\.(?:js|css|ts|wasm)$/.test(url.pathname),
    new workbox.strategies.StaleWhileRevalidate()
);

workbox.routing.registerRoute(
    ({request}) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
        cacheName: 'images',
        plugins: [
            new workbox.expiration.ExpirationPlugin({ maxEntries: 60 })
        ]
    })
);

workbox.routing.setCatchHandler(({event}) => {
    if (event.request.destination === 'document') {
        return caches.match('/offline.html') || Response.error();
    }
    return Response.error();
});
