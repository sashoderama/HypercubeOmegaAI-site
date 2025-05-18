/* ─── AuroraGenesis-OMEGA Service Worker ──────────────────────────────────── */
const CACHE_PREFIX = 'aurora-omega';
const CACHE_VERSION = 'v2.0.0';
const CACHE_STATIC = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const CACHE_API = `${CACHE_PREFIX}-api-${CACHE_VERSION}`;
const CACHE_IMAGES = `${CACHE_PREFIX}-images-${CACHE_VERSION}`;
const CACHE_ASSETS = `${CACHE_PREFIX}-assets-${CACHE_VERSION}`;
const AUDIT_EVENT = 'aurora-audit';
const FALLBACK_CONFIG = JSON.stringify({ HUGGINGFACE_TOKEN: '' });
const FALLBACK_OFFLINE_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline - AuroraGenesis-OMEGA</title>
    <style>
        body {
            background: #0d1117;
            color: #d0d6e0;
            font-family: 'Inter', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .message {
            background: rgba(22, 27, 34, 0.7);
            padding: 2rem;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 0 20px rgba(0, 247, 255, 0.25);
        }
        h1 {
            font-size: 1.5rem;
            text-shadow: 0 0 10px rgba(47, 129, 247, 0.5);
        }
        p {
            font-size: 1rem;
        }
    </style>
</head>
<body>
    <div class="message" role="alert" aria-live="assertive">
        <h1>Offline Mode</h1>
        <p>AuroraGenesis-OMEGA is currently offline. Please check your network connection and try again.</p>
    </div>
</body>
</html>
`;

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────
async function hashContent(content) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn('Failed to hash content:', e);
        return '';
    }
}

async function validateResponse(response, expectedType) {
    if (!response.ok) return false;
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes(expectedType);
}

async function cacheWithIntegrity(cacheName, request, response, content) {
    const cache = await caches.open(cacheName);
    const hash = await hashContent(content);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Hash', hash);
    const cachedResponse = new Response(content, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
    await cache.put(request, cachedResponse);
}

// ─── INITIALIZATION ───────────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        try {
            const staticCache = await caches.open(CACHE_STATIC);
            await staticCache.addAll([
                '/',
                '/neuro.html',
                '/app.js',
                '/manifest.json',
                '/offline.html'
            ]);
            await staticCache.put('/config.json', new Response(FALLBACK_CONFIG, {
                headers: { 'Content-Type': 'application/json' }
            }));
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({
                    type: AUDIT_EVENT,
                    detail: {
                        id: crypto.randomUUID(),
                        type: 'service_worker_install',
                        status: 'success',
                        ts: Date.now()
                    }
                }));
            });
            self.skipWaiting();
        } catch (e) {
            console.error('Service worker installation failed:', e);
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({
                    type: AUDIT_EVENT,
                    detail: {
                        id: crypto.randomUUID(),
                        type: 'service_worker_install',
                        status: 'failed',
                        error: e.message,
                        ts: Date.now()
                    }
                }));
            });
        }
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        try {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => {
                if (!name.startsWith(CACHE_PREFIX) || !name.includes(CACHE_VERSION)) {
                    return caches.delete(name);
                }
            }));
            await self.clients.claim();
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({
                    type: AUDIT_EVENT,
                    detail: {
                        id: crypto.randomUUID(),
                        type: 'service_worker_activate',
                        status: 'success',
                        ts: Date.now()
                    }
                }));
            });
        } catch (e) {
            console.error('Service worker activation failed:', e);
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({
                    type: AUDIT_EVENT,
                    detail: {
                        id: crypto.randomUUID(),
                        type: 'service_worker_activate',
                        status: 'failed',
                        error: e.message,
                        ts: Date.now()
                    }
                }));
            });
        }
    })());
});

// ─── ROUTING STRATEGIES ───────────────────────────────────────────────────
async function handleApiRequest(request) {
    try {
        const cache = await caches.open(CACHE_API);
        const cachedResponse = await cache.match(request);
        if (cachedResponse && store.state.network.isOnline) {
            // Attempt to update cache in the background
            fetchWithRetry(request).then(async response => {
                if (await validateResponse(response, 'application/json')) {
                    const content = await response.text();
                    await cacheWithIntegrity(CACHE_API, request, response, content);
                }
            }).catch(() => {});
            return cachedResponse;
        }
        const response = await fetchWithRetry(request);
        if (await validateResponse(response, 'application/json')) {
            const content = await response.text();
            try {
                JSON.parse(content); // Validate JSON
                await cacheWithIntegrity(CACHE_API, request, response, content);
            } catch (e) {
                console.warn('Invalid JSON in API response:', e);
                return new Response(FALLBACK_CONFIG, {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'api_request',
                    url: request.url,
                    status: 'success',
                    ts: Date.now()
                }
            }));
        });
        return response;
    } catch (e) {
        console.warn('API request failed:', e);
        const cache = await caches.open(CACHE_API);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'api_request',
                    url: request.url,
                    status: 'failed',
                    error: e.message,
                    ts: Date.now()
                }
            }));
        });
        return new Response(FALLBACK_CONFIG, {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

async function handleAssetRequest(request) {
    try {
        const cache = await caches.open(CACHE_ASSETS);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            // Update cache in the background
            fetchWithRetry(request).then(async response => {
                if (response.ok) {
                    const content = await response.text();
                    await cacheWithIntegrity(CACHE_ASSETS, request, response, content);
                }
            }).catch(() => {});
            return cachedResponse;
        }
        const response = await fetchWithRetry(request);
        if (response.ok) {
            const content = await response.text();
            await cacheWithIntegrity(CACHE_ASSETS, request, response, content);
        }
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'asset_request',
                    url: request.url,
                    status: 'success',
                    ts: Date.now()
                }
            }));
        });
        return response;
    } catch (e) {
        console.warn('Asset request failed:', e);
        const cache = await caches.open(CACHE_ASSETS);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'asset_request',
                    url: request.url,
                    status: 'failed',
                    error: e.message,
                    ts: Date.now()
                }
            }));
        });
        return new Response('Asset not available offline.', { status: 503 });
    }
}

async function handleImageRequest(request) {
    try {
        const cache = await caches.open(CACHE_IMAGES);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        const response = await fetchWithRetry(request);
        if (await validateResponse(response, 'image')) {
            const content = await response.blob();
            const maxEntries = (navigator.deviceMemory || 4) * 15;
            await cache.put(request, new Response(content, {
                headers: response.headers
            }));
            // Clean up old entries
            const keys = await cache.keys();
            if (keys.length > maxEntries) {
                for (const key of keys.slice(0, keys.length - maxEntries)) {
                    await cache.delete(key);
                }
            }
        }
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'image_request',
                    url: request.url,
                    status: 'success',
                    ts: Date.now()
                }
            }));
        });
        return response;
    } catch (e) {
        console.warn('Image request failed:', e);
        const cache = await caches.open(CACHE_IMAGES);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'image_request',
                    url: request.url,
                    status: 'failed',
                    error: e.message,
                    ts: Date.now()
                }
            }));
        });
        return new Response('Image not available offline.', { status: 503 });
    }
}

// ─── FETCH HANDLER ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api')) {
        event.respondWith(handleApiRequest(request));
    } else if (/\.(?:js|css|ts|wasm)$/.test(url.pathname)) {
        event.respondWith(handleAssetRequest(request));
    } else if (request.destination === 'image') {
        event.respondWith(handleImageRequest(request));
    } else if (request.destination === 'document') {
        event.respondWith((async () => {
            try {
                const cache = await caches.open(CACHE_STATIC);
                const cachedResponse = await cache.match(request);
                if (cachedResponse && store.state.network.isOnline) {
                    fetchWithRetry(request).then(async response => {
                        if (response.ok) {
                            const content = await response.text();
                            await cacheWithIntegrity(CACHE_STATIC, request, response, content);
                        }
                    }).catch(() => {});
                    return cachedResponse;
                }
                const response = await fetchWithRetry(request);
                if (response.ok) {
                    const content = await response.text();
                    await cacheWithIntegrity(CACHE_STATIC, request, response, content);
                }
                return response;
            } catch (e) {
                console.warn('Document request failed:', e);
                const cache = await caches.open(CACHE_STATIC);
                const offlineResponse = await cache.match('/offline.html');
                if (offlineResponse) return offlineResponse;
                return new Response(FALLBACK_OFFLINE_PAGE, {
                    headers: { 'Content-Type': 'text/html' }
                });
            }
        })());
    } else {
        event.respondWith(fetchWithRetry(request).catch(async e => {
            console.warn('Fetch failed:', e);
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({
                    type: AUDIT_EVENT,
                    detail: {
                        id: crypto.randomUUID(),
                        type: 'fetch_failed',
                        url: request.url,
                        error: e.message,
                        ts: Date.now()
                    }
                }));
            });
            return new Response('Resource not available offline.', { status: 503 });
        }));
    }
});

// ─── CATCH HANDLER ────────────────────────────────────────────────────────
self.addEventListener('message', event => {
    if (event.data.type === 'CACHE_UPDATE') {
        caches.open(CACHE_STATIC).then(cache => {
            cache.addAll(event.data.urls).catch(e => {
                console.warn('Cache update failed:', e);
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => client.postMessage({
                        type: AUDIT_EVENT,
                        detail: {
                            id: crypto.randomUUID(),
                            type: 'cache_update',
                            status: 'failed',
                            error: e.message,
                            ts: Date.now()
                        }
                    }));
                });
            });
        });
    }
});

// ─── BACKGROUND SYNC ──────────────────────────────────────────────────────
self.addEventListener('sync', event => {
    if (event.tag === 'audit-sync') {
        event.waitUntil(processAuditQueue());
    }
});

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────
async function fetchWithRetry(request, options = {}) {
    const { retries = 3, backoff = 1000 } = options;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(request, options);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            return response;
        } catch (e) {
            if (i === retries - 1) throw e;
            console.warn(`Retry ${i + 1}/${retries} for ${request.url}:`, e);
            await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
        }
    }
}

async function processAuditQueue() {
    // Simulated audit queue processing (integrates with app.js audit system)
    try {
        // Fetch audit logs from indexedDB or other storage if implemented
        console.log('Processing audit sync queue...');
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'audit_sync',
                    status: 'success',
                    ts: Date.now()
                }
            }));
        });
    } catch (e) {
        console.warn('Audit sync failed:', e);
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({
                type: AUDIT_EVENT,
                detail: {
                    id: crypto.randomUUID(),
                    type: 'audit_sync',
                    status: 'failed',
                    error: e.message,
                    ts: Date.now()
                }
            }));
        });
    }
}

// ─── PERIODIC CACHE UPDATE ────────────────────────────────────────────────
self.addEventListener('periodicsync', event => {
    if (event.tag === 'cache-refresh') {
        event.waitUntil((async () => {
            try {
                const cache = await caches.open(CACHE_STATIC);
                await cache.addAll([
                    '/',
                    '/neuro.html',
                    '/app.js',
                    '/manifest.json',
                    '/offline.html'
                ]);
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => client.postMessage({
                        type: AUDIT_EVENT,
                        detail: {
                            id: crypto.randomUUID(),
                            type: 'cache_refresh',
                            status: 'success',
                            ts: Date.now()
                        }
                    }));
                });
            } catch (e) {
                console.warn('Periodic cache refresh failed:', e);
                self.clients.matchAll().then(clients => {
                    clients.forEach(client => client.postMessage({
                        type: AUDIT_EVENT,
                        detail: {
                            id: crypto.randomUUID(),
                            type: 'cache_refresh',
                            status: 'failed',
                            error: e.message,
                            ts: Date.now()
                        }
                    }));
                });
            }
        })());
    }
});
