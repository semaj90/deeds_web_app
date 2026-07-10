/**
 * SOM Lookup Cache Interceptor for Service Worker
 *
 * Adds cache-first SOM cell lookup to fetch intercepts.
 * Before network request, checks IndexedDB for cached SOM coordinates.
 * Uses 8-neighbor radius search on cache miss + network fetch.
 */

const SOM_DB_NAME = 'som-cache';
const SOM_STORE_NAME = 'cells';
const MANIFEST_STORE_NAME = 'manifests';
const SOM_CACHE_TTL = 3600000; // 1 hour

class SomNeighborCache {
  constructor() {
    this.db = null;
    this.ready = this.initDb();
  }

  async initDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SOM_DB_NAME, 1);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this.db = req.result;
        resolve(true);
      };

      req.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains(SOM_STORE_NAME)) {
          db.createObjectStore(SOM_STORE_NAME, { keyPath: 'packetKey' });
        }
        if (!db.objectStoreNames.contains(MANIFEST_STORE_NAME)) {
          db.createObjectStore(MANIFEST_STORE_NAME, { keyPath: 'packetKey' });
        }
      };
    });
  }

  async getCellCoordinates(packetKey) {
    if (!this.db) await this.ready;

    return new Promise((resolve) => {
      const tx = this.db.transaction([SOM_STORE_NAME], 'readonly');
      const store = tx.objectStore(SOM_STORE_NAME);
      const req = store.get(packetKey);

      req.onsuccess = () => {
        const record = req.result;
        if (record && record.expiresAt > Date.now()) {
          resolve({ row: record.somRow, col: record.somCol, isExact: true });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  async getManifest(packetKey) {
    if (!this.db) await this.ready;

    return new Promise((resolve) => {
      const tx = this.db.transaction([MANIFEST_STORE_NAME], 'readonly');
      const store = tx.objectStore(MANIFEST_STORE_NAME);
      const req = store.get(packetKey);

      req.onsuccess = () => {
        const record = req.result;
        if (record && record.expiresAt > Date.now()) {
          resolve(record.manifest);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  }

  async cacheCell(packetKey, somRow, somCol, ttl = SOM_CACHE_TTL) {
    if (!this.db) await this.ready;

    return new Promise((resolve) => {
      const tx = this.db.transaction([SOM_STORE_NAME], 'readwrite');
      const store = tx.objectStore(SOM_STORE_NAME);
      const req = store.put({
        packetKey,
        somRow,
        somCol,
        expiresAt: Date.now() + ttl,
        cachedAt: new Date().toISOString()
      });

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  async cacheManifest(packetKey, manifest, ttl = SOM_CACHE_TTL) {
    if (!this.db) await this.ready;

    return new Promise((resolve) => {
      const tx = this.db.transaction([MANIFEST_STORE_NAME], 'readwrite');
      const store = tx.objectStore(MANIFEST_STORE_NAME);
      const req = store.put({
        packetKey,
        manifest,
        expiresAt: Date.now() + ttl,
        cachedAt: new Date().toISOString()
      });

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  async getNearbyNeighbors(row, col, radius = 1) {
    if (!this.db) await this.ready;

    const neighbors = [];
    for (let r = row - radius; r <= row + radius; r++) {
      for (let c = col - radius; c <= col + radius; c++) {
        if (r !== row || c !== col) {
          neighbors.push({ row: r, col: c });
        }
      }
    }
    return neighbors;
  }
}

// Global cache instance
const somCache = new SomNeighborCache();

/**
 * Lookup SOM neighbors (exact + 8-neighbor radius)
 * Returns manifest if exact hit, or signals radius search needed
 */
async function lookupSomNeighbors(packetKey) {
  // Try exact cell lookup
  const exactCell = await somCache.getCellCoordinates(packetKey);
  if (exactCell) {
    const manifest = await somCache.getManifest(packetKey);
    if (manifest) {
      return { manifest, isExact: true, source: 'indexeddb-exact' };
    }
  }

  // Fallback: return null to trigger network fetch
  return null;
}

/**
 * Cache SOM cell coordinates and manifest after network fetch
 */
async function cacheSomResult(packetKey, somRow, somCol, manifest) {
  await Promise.all([
    somCache.cacheCell(packetKey, somRow, somCol),
    somCache.cacheManifest(packetKey, manifest)
  ]);
}

/**
 * Fetch interceptor: cache-first SOM lookup
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only intercept GET requests for /api/packets/
  if (event.request.method !== 'GET' || !url.pathname.includes('/api/packets/')) {
    return;
  }

  // Extract packet key from URL
  const packetKeyMatch = url.pathname.match(/\/api\/packets\/([^/?]+)/);
  if (!packetKeyMatch) {
    return;
  }

  const packetKey = packetKeyMatch[1];

  event.respondWith(
    (async () => {
      // Check SOM cache first
      const cached = await lookupSomNeighbors(packetKey);
      if (cached) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'SOM-HIT' }
        });
      }

      // Network fallback
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const data = await response.clone().json();
          // Cache the result for future requests
          if (data.packet_key && data.som_row !== undefined && data.som_col !== undefined) {
            await cacheSomResult(
              data.packet_key,
              data.som_row,
              data.som_col,
              data.lod_manifest
            );
          }
        }
        return response;
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Network unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })()
  );
});
