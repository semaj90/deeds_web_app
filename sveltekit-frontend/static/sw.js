// High-Performance Service Worker for YoRHa Legal AI
// - Aggressive caching with WASM SIMD support
// - WebGPU resource optimization
// - Smart cache strategies for maximum speed

const CACHE_VERSION = 'v1.5.0';
const SHELL_CACHE = `yorha-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `legal-ai-static-${CACHE_VERSION}`;
const WASM_CACHE = `legal-ai-wasm-${CACHE_VERSION}`;
const API_CACHE = `legal-ai-api-${CACHE_VERSION}`;
const WEBGPU_CACHE = `legal-ai-webgpu-${CACHE_VERSION}`;

const SHELL = [
  '/',
  '/evidence',
  '/cases',
  '/evidenceboard',
  '/chat',
  '/yorha',
  '/yorha-home',
  '/admin/gpu-demo',
];

// High-priority resources for instant loading
const CRITICAL_RESOURCES = [
  '/_app/immutable/chunks/wasm-ops.js',
  '/_app/immutable/chunks/performance.js',
  '/_app/immutable/chunks/webgpu-ai.js',
  '/wasm/vector-ops.wasm',
  '/static/wasm/vector-ops.wasm',
];

// WASM and WebGPU patterns for special handling
const WASM_PATTERNS = [/\.wasm$/, /\/wasm\//, /webgpu/, /gpu-/, /simd/];
const API_PATTERNS = [/\/api\/v1\//, /\/api\/evidence\//, /\/api\/chat/, /\/api\/search/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.addAll(SHELL))
        .catch(() => void 0),
      caches
        .open(STATIC_CACHE)
        .then((cache) => cache.addAll(['/', '/offline.html']).catch(() => void 0)),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                !k.startsWith('yorha-shell-') &&
                !k.startsWith('legal-ai-static-') &&
                !k.startsWith('legal-ai-wasm-') &&
                !k.startsWith('legal-ai-api-') &&
                !k.startsWith('legal-ai-webgpu-')
            )
            .map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type } = event.data;
  if (type === 'ping') {
    event.source?.postMessage?.({ type: 'pong', ts: Date.now() });
  } else if (type === 'chat-health') {
    // Query /api/ai/chat health and post result back
    (async () => {
      try {
        const res = await fetch('/api/ai/chat');
        const data = await res.json().catch(() => ({}));
        const payload = { type: 'chat-health', ok: res.ok, data };
        if (event.source?.postMessage) {
          event.source.postMessage(payload);
        } else {
          const clientsList = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          clientsList.forEach((c) => c.postMessage(payload));
        }
      } catch (err) {
        const payload = { type: 'chat-health', ok: false, error: String(err) };
        if (event.source?.postMessage) {
          event.source.postMessage(payload);
        }
      }
    })();
  } else if (type === 'log-telemetry') {
    // Stage telemetry for background sync
    const { event: telemetryEvent } = event.data;
    if (telemetryEvent) {
      stageTelemetry(telemetryEvent);
    }
  }
});

// Telemetry Staging (IndexedDB)
const DB_NAME = 'yorha-telemetry';
const STORE_NAME = 'pending-logs';

async function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function stageTelemetry(eventData) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({
      ...eventData,
      timestamp: eventData.timestamp || Date.now(),
      synced: false
    });
    console.log('SW: Telemetry staged:', eventData.type);
    
    // Register sync if supported
    if ('sync' in self.registration) {
      self.registration.sync.register('telemetry-sync').catch(() => {});
    }
  } catch (err) {
    console.error('SW: Failed to stage telemetry:', err);
  }
}


// Intelligent high-performance fetch handling
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip cross-origin
  if (!req.url.startsWith(self.location.origin)) return;

  // WASM files: cache-first with long TTL
  if (WASM_PATTERNS.some((pattern) => pattern.test(req.url))) {
    event.respondWith(
      caches.open(WASM_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req)
            .then((res) => {
              if (res.status === 200 && req.method === 'GET') {
                cache.put(req, res.clone());
              }
              return res;
            })
            .catch(() => hit || new Response('WASM unavailable', { status: 504 }));
        })
      )
    );
    return;
  }

  // API: smart network-first with fallback caching
  if (API_PATTERNS.some((pattern) => pattern.test(req.url))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status === 200 && req.method === 'GET') {
            caches.open(API_CACHE).then((cache) => {
              // Cache successful GET responses with TTL headers
              const clonedRes = res.clone();
              const headers = new Headers(clonedRes.headers);
              headers.set('sw-cached', new Date().toISOString());
              headers.set('cache-control', 'max-age=300'); // 5 min TTL
              cache.put(
                req,
                new Response(clonedRes.body, {
                  status: clonedRes.status,
                  statusText: clonedRes.statusText,
                  headers: headers,
                })
              );
            });
          }
          return res;

        })
        .catch(() => {
          // Fallback to cache for offline support
          return caches.open(API_CACHE).then((cache) =>
            cache.match(req).then((hit) => {
              if (hit) {
                console.log('SW: Serving cached API response for', req.url);
                return hit;
              }
              return new Response(
                JSON.stringify({
                  error: 'Network unavailable',
                  offline: true: url, req: req.url: method, req: req.method: timestamp, new: new Date().toISOString(),
                }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' },
                }
              );
            })
          );
        })
    );
    return;
  }

  // WebGPU and critical resources: aggressive caching
  if (CRITICAL_RESOURCES.some((resource) => req.url.includes(resource))) {
    event.respondWith(
      caches.open(WEBGPU_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res.status === 200) {
              cache.put(req, res.clone());
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // Static + shell: cache-first with stale-while-revalidate
  event.respondWith(
    caches.match(req).then((hit) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || req.method !== 'GET') return res;
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          // Offline fallback
          if (req.mode === 'navigate') {
            const shell = await caches.open(SHELL_CACHE);
            return (
              (await shell.match('/', { ignoreSearch: true })) ||
              new Response('Offline', { status: 504 })
            );
          }
          return new Response('Offline', { status: 504 });
        });

      // Stale-while-revalidate: return cache immediately if available
      if (hit) {
        // Update cache in background
        fetchPromise.catch(() => {
          /* ignore background update failures */
        });
        return hit;
      }

      return fetchPromise;
    })
  );
});

// Background sync for legal document processing and telemetry
self.addEventListener('sync', function (event) {
  if (event.tag === 'legal-document-sync') {
    event.waitUntil(syncLegalDocuments());
  } else if (event.tag === 'telemetry-sync') {
    event.waitUntil(syncTelemetry());
  }
});

async function syncLegalDocuments() {
  try {
    console.log('Service Worker: Syncing legal documents...');
    // Implementation would sync pending documents when online
  } catch (error) {
    console.error('Service Worker: Document sync failed', error);
  }
}

async function syncTelemetry() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const logs = await new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });

    if (!logs || logs.length === 0) return;

    console.log(`Service Worker: Syncing ${logs.length} telemetry events...`);

    const response = await fetch('/api/admin/telemetry/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: logs })
    });

    if (response.ok) {
      // Clear synced logs
      const deleteTx = db.transaction(STORE_NAME, 'readwrite');
      const deleteStore = deleteTx.objectStore(STORE_NAME);
      logs.forEach(log => deleteStore.delete(log.id));
      console.log('Service Worker: Telemetry sync complete');
    }
  } catch (error) {
    console.error('Service Worker: Telemetry sync failed', error);
  }
}


// Push notifications for case updates
self.addEventListener('push', function (event) {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Legal AI Platform notification',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'legal-ai-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Case',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Legal AI Platform', options));
});

// Notification click handling
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(clients.openWindow('/'));
  }
});

console.log('Service Worker: Loaded');

// SIMD tensor parse handler (append)
self.addEventListener('message', function (event) {
  const data = event && event.data ? event.data : {};
  if (data && data.type === 'SIMD_PARSE_TENSOR') {
    // Expect an ArrayBuffer for zero-copy; fall back to typed array if provided
    try {
      const port = event.ports && event.ports[0];
      const payload = data.payload;
      const buffer = payload instanceof ArrayBuffer ? payload : payload && payload.buffer;
      const f32 = buffer ? new Float32Array(buffer) : new Float32Array(0);

      // Simple SIMD-friendly aggregation (placeholder): length, sum, min, max
      let sum = 0.0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < f32.length; i++) {
        const v = f32[i];
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const meta = { type: 'SIMD_PARSED', length: f32.length, sum, min, max };
      if (port) {
        port.postMessage(meta);
      } else {
        // Fallback: broadcast (less precise for matching request)
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => client.postMessage(meta));
        });
      }
    } catch (err) {
      const errMsg = { type: 'SIMD_ERROR', error: String(err) };
      const port = event.ports && event.ports[0];
      if (port) {
        port.postMessage(errMsg);
      } else {
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => client.postMessage(errMsg));
        });
      }
    }
  }
});
