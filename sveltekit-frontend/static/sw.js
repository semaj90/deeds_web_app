// High-Performance Service Worker for YoRHa Legal AI
// - Aggressive caching with WASM SIMD support
// - WebGPU resource optimization
// - Smart cache strategies for maximum speed

// v1.6.0 (2026-05-10): Phase D — analytics POST interception + IDB offline queue.
// See next_steps/active/2026-05-10_service-worker-regex-tool-router.md §1.
const CACHE_VERSION = 'v1.6.0';
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
  } else if (type === 'analytics-queue-depth') {
    // Phase D: respond with current pending_events count
    (async () => {
      const depth = await getAnalyticsDepth();
      const payload = { type: 'analytics-queue-depth', depth };
      if (event.source?.postMessage) event.source.postMessage(payload);
    })();
  } else if (type === 'analytics-flush-now') {
    // Phase D: caller wants an immediate drain (e.g. before page-unload)
    (async () => {
      const result = await drainAnalyticsQueue();
      const payload = { type: 'analytics-flush-now', ...result };
      if (event.source?.postMessage) event.source.postMessage(payload);
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase D — Analytics POST offline queue (added 2026-05-10, CACHE_VERSION v1.6.0)
// Design: next_steps/active/2026-05-10_service-worker-regex-tool-router.md §1
//
// Default-deny: only INTERCEPTS POSTs to the explicit allowlist below; every
// other request falls through to the normal fetch path with NO interception.
// SSE / WebSocket / auth / AI / admin paths are ignored by design (see §1.3).
//
// On offline → enqueue with synthetic 202 to the client (UX promise).
// On 'online' event → drainQueue() with mutex; 401/403 are terminal.
// ═══════════════════════════════════════════════════════════════════════════

const ANALYTICS_DB     = 'yorha-sw-queue';
const ANALYTICS_STORE  = 'pending_events';
const ANALYTICS_DB_VER = 1;

// URLs we intercept (default-deny everything else)
const ANALYTICS_ALLOWLIST = [
  '/api/analytics/context-timeline',
  '/api/analytics/rl-signal',
];

// Drain-loop mutex (design §1.7 — guards against double-flush on flaky reconnects)
let draining = false;

function shouldInterceptAnalytics(req, url) {
  if (req.method !== 'POST') return false;
  if (req.headers.get('upgrade')) return false;
  if ((req.headers.get('accept') ?? '').includes('text/event-stream')) return false;
  return ANALYTICS_ALLOWLIST.some((p) => url.pathname === p);
}

async function getAnalyticsDB() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(ANALYTICS_DB, ANALYTICS_DB_VER);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(ANALYTICS_STORE)) {
        const store = db.createObjectStore(ANALYTICS_STORE, { keyPath: 'key' });
        store.createIndex('enqueuedAt', 'enqueuedAt', { unique: false });
        store.createIndex('deadAt',     'deadAt',     { unique: false });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror   = () => reject(open.error);
  });
}

async function enqueueAnalytics(req) {
  const body    = await req.clone().text();
  const headers = [];
  req.headers.forEach((v, k) => headers.push([k, v]));
  const record = {
    key:        (self.crypto && self.crypto.randomUUID) ? self.crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
    url:        req.url,
    body,
    headers,
    enqueuedAt: Date.now(),
    retryCount: 0,
    lastError:  null,
    deadAt:     null,
  };
  try {
    const db = await getAnalyticsDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ANALYTICS_STORE, 'readwrite');
      tx.objectStore(ANALYTICS_STORE).add(record);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      // §1.4: drop the oldest 100 rows + log overflow on next online drain
      await purgeOldestAnalytics(100);
      try {
        const db = await getAnalyticsDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(ANALYTICS_STORE, 'readwrite');
          tx.objectStore(ANALYTICS_STORE).add(record);
          tx.oncomplete = resolve;
          tx.onerror    = () => reject(tx.error);
        });
      } catch (retryErr) {
        console.error('SW: analytics enqueue still failed after purge:', retryErr);
      }
    } else {
      console.error('SW: analytics enqueue error:', err);
    }
  }
}

async function purgeOldestAnalytics(n) {
  try {
    const db = await getAnalyticsDB();
    return await new Promise((resolve) => {
      const tx     = db.transaction(ANALYTICS_STORE, 'readwrite');
      const store  = tx.objectStore(ANALYTICS_STORE);
      const cursor = store.index('enqueuedAt').openCursor();
      let purged   = 0;
      cursor.onsuccess = (e) => {
        const c = e.target.result;
        if (!c || purged >= n) return resolve(purged);
        store.delete(c.primaryKey);
        purged++;
        c.continue();
      };
      tx.onerror = () => resolve(purged);
    });
  } catch (err) {
    console.error('SW: purgeOldestAnalytics error:', err);
    return 0;
  }
}

async function getAnalyticsDepth() {
  try {
    const db = await getAnalyticsDB();
    return await new Promise((resolve, reject) => {
      const tx    = db.transaction(ANALYTICS_STORE, 'readonly');
      const count = tx.objectStore(ANALYTICS_STORE).count();
      count.onsuccess = () => resolve(count.result);
      count.onerror   = () => reject(count.error);
    });
  } catch {
    return 0;
  }
}

async function drainAnalyticsQueue() {
  if (draining) return { drained: 0, failed: 0, skipped: true };
  draining = true;
  let drained = 0;
  let failed  = 0;
  try {
    const db = await getAnalyticsDB();
    const records = await new Promise((resolve) => {
      const tx  = db.transaction(ANALYTICS_STORE, 'readonly');
      const req = tx.objectStore(ANALYTICS_STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => resolve([]);
    });

    for (const rec of records) {
      if (rec.deadAt) continue; // skip terminal-failed rows
      const headers = Object.fromEntries(rec.headers ?? []);
      let status;
      try {
        const res = await fetch(rec.url, { method: 'POST', headers, body: rec.body, credentials: 'include' });
        status = res.status;
      } catch (e) {
        rec.retryCount += 1;
        rec.lastError   = String(e).slice(0, 200);
        await analyticsUpsert(rec);
        failed++;
        continue;
      }

      if (status >= 200 && status < 300) {
        await analyticsDelete(rec.key);
        drained++;
      } else if (status === 401 || status === 403) {
        // §1.7 terminal: do NOT retry (cookie expired)
        rec.deadAt    = Date.now();
        rec.lastError = `HTTP ${status} terminal`;
        await analyticsUpsert(rec);
        failed++;
      } else {
        rec.retryCount += 1;
        rec.lastError   = `HTTP ${status}`;
        await analyticsUpsert(rec);
        failed++;
      }
    }
  } finally {
    draining = false;
  }
  return { drained, failed };
}

async function analyticsUpsert(rec) {
  try {
    const db = await getAnalyticsDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ANALYTICS_STORE, 'readwrite');
      tx.objectStore(ANALYTICS_STORE).put(rec);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (err) {
    console.error('SW: analytics upsert error:', err);
  }
}

async function analyticsDelete(key) {
  try {
    const db = await getAnalyticsDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(ANALYTICS_STORE, 'readwrite');
      tx.objectStore(ANALYTICS_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  } catch (err) {
    console.error('SW: analytics delete error:', err);
  }
}

// Online event → drain. Wrapped in waitUntil-equivalent via the registration's
// extendable lifetime — we just let drainAnalyticsQueue run; it self-limits via mutex.
self.addEventListener('online', () => {
  drainAnalyticsQueue().catch((err) => console.error('SW: drain on online failed:', err));
});

// Background-sync drain (parallel path — useful when 'online' fires while SW is
// suspended; the sync event wakes us back up).
self.addEventListener('sync', (event) => {
  if (event.tag === 'analytics-drain') {
    event.waitUntil(drainAnalyticsQueue().catch(() => undefined));
  }
});

// Intelligent high-performance fetch handling
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip cross-origin
  if (!req.url.startsWith(self.location.origin)) return;

  // Phase D: analytics POST interception (default-deny, allowlist of 2 URLs).
  // Online → pass through. Offline OR 5xx → enqueue + synthetic 202.
  if (shouldInterceptAnalytics(req, url)) {
    event.respondWith((async () => {
      if (navigator.onLine === false) {
        await enqueueAnalytics(req);
        return new Response(
          JSON.stringify({ ok: true, queued: true }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        );
      }
      try {
        const res = await fetch(req.clone());
        // Server flaky → queue for retry, but tell the client the request was accepted.
        if (res.status >= 500) {
          await enqueueAnalytics(req);
          return new Response(
            JSON.stringify({ ok: true, queued: true, upstreamStatus: res.status }),
            { status: 202, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return res;
      } catch (err) {
        await enqueueAnalytics(req);
        return new Response(
          JSON.stringify({ ok: true, queued: true, error: String(err) }),
          { status: 202, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })());
    return;
  }

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
