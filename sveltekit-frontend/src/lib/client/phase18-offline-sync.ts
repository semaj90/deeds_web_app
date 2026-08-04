import {
  offlineStorageEnvelopeSchema,
  phase18RequestEnvelopeSchema,
  phase18ResponseEnvelopeSchema,
  type OfflineStorageEnvelope,
  type Phase18RequestEnvelope,
  type Phase18ResponseEnvelope,
} from '$lib/schemas/phase18-envelope-schema.js';
const randomUUID = () => crypto.randomUUID(); // Web Crypto — works in SW, browser, and Node 19+

/**
 * Phase 18 Offline Storage & Sync Manager
 *
 * Persists Phase 18 reranker requests/responses to IndexedDB for offline-first support
 * Provides sync queue for later delivery when network reconnects
 *
 * Single source of truth: offlineStorageEnvelopeSchema from phase18-envelope-schema.ts
 */

const DB_NAME = 'phase18-reranker-db';
const DB_VERSION = 1;
const STORE_REQUESTS = 'phase18-requests';
const STORE_RESPONSES = 'phase18-responses';

/**
 * Initialize IndexedDB stores for Phase 18 offline storage
 */
export async function initializePhase18OfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Requests store: stores pending reranker requests with sync status
      if (!db.objectStoreNames.contains(STORE_REQUESTS)) {
        const requestStore = db.createObjectStore(STORE_REQUESTS, { keyPath: 'storageId' });
        requestStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        requestStore.createIndex('createdAt', 'storedAt', { unique: false });
      }

      // Responses store: caches received responses
      if (!db.objectStoreNames.contains(STORE_RESPONSES)) {
        const responseStore = db.createObjectStore(STORE_RESPONSES, { keyPath: 'storageId' });
        responseStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        responseStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
  });
}

/**
 * Store a Phase 18 request in IndexedDB for offline access
 */
export async function storePhase18RequestOffline(
  request: Phase18RequestEnvelope,
  storageLayer: 'indexeddb' | 'localstorage' = 'indexeddb'
): Promise<OfflineStorageEnvelope> {
  const envelope: OfflineStorageEnvelope = {
    storageId: randomUUID(),
    payloadType: 'request',
    payload: request as unknown as Record<string, unknown>,
    storedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h TTL
    storageLayer,
    syncStatus: 'pending',
    syncAttempts: 0
  };

  // Validate against schema
  const validation = offlineStorageEnvelopeSchema.safeParse(envelope);
  if (!validation.success) {
    throw new Error(`Offline storage validation failed: ${validation.error.message}`);
  }

  if (storageLayer === 'indexeddb') {
    const db = await initializePhase18OfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_REQUESTS], 'readwrite');
      const store = transaction.objectStore(STORE_REQUESTS);
      const request = store.add(validation.data);

      request.onsuccess = () => resolve(validation.data);
      request.onerror = () => reject(request.error);
    });
  } else {
    // LocalStorage fallback for small payloads
    const key = `phase18:request:${envelope.storageId}`;
    localStorage.setItem(key, JSON.stringify(validation.data));
    return validation.data;
  }
}

/**
 * Store a Phase 18 response in IndexedDB for caching
 */
export async function storePhase18ResponseOffline(
  response: Phase18ResponseEnvelope,
  ttlSeconds: number = 3600,
  storageLayer: 'indexeddb' | 'localstorage' = 'indexeddb'
): Promise<OfflineStorageEnvelope> {
  const envelope: OfflineStorageEnvelope = {
    storageId: randomUUID(),
    payloadType: 'response',
    payload: response as unknown as Record<string, unknown>,
    storedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    storageLayer,
    syncStatus: 'synced', // Responses are already synced
    syncAttempts: 0
  };

  const validation = offlineStorageEnvelopeSchema.safeParse(envelope);
  if (!validation.success) {
    throw new Error(`Offline storage validation failed: ${validation.error.message}`);
  }

  if (storageLayer === 'indexeddb') {
    const db = await initializePhase18OfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_RESPONSES], 'readwrite');
      const store = transaction.objectStore(STORE_RESPONSES);
      const request = store.add(validation.data);

      request.onsuccess = () => resolve(validation.data);
      request.onerror = () => reject(request.error);
    });
  } else {
    const key = `phase18:response:${envelope.storageId}`;
    localStorage.setItem(key, JSON.stringify(validation.data));
    return validation.data;
  }
}

/**
 * Retrieve pending requests for sync
 */
export async function getPendingPhase18Requests(): Promise<OfflineStorageEnvelope[]> {
  const db = await initializePhase18OfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_REQUESTS], 'readonly');
    const store = transaction.objectStore(STORE_REQUESTS);
    const index = store.index('syncStatus');
    const request = index.getAll('pending');

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update sync status of a stored request
 */
export async function updatePhase18SyncStatus(
  storageId: string,
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed',
  payloadType: 'request' | 'response' = 'request'
): Promise<void> {
  const db = await initializePhase18OfflineDB();
  const storeName = payloadType === 'request' ? STORE_REQUESTS : STORE_RESPONSES;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const getRequest = store.get(storageId);

    getRequest.onsuccess = () => {
      const envelope = getRequest.result as OfflineStorageEnvelope;
      if (!envelope) {
        reject(new Error(`Storage envelope not found: ${storageId}`));
        return;
      }

      envelope.syncStatus = syncStatus;
      envelope.syncAttempts = (envelope.syncAttempts || 0) + (syncStatus === 'syncing' ? 1 : 0);

      const updateRequest = store.put(envelope);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

/**
 * Clean up expired envelopes from offline storage
 */
export async function cleanupExpiredPhase18Envelopes(): Promise<number> {
  const db = await initializePhase18OfflineDB();
  const now = new Date().toISOString();
  let deletedCount = 0;

  // Clean requests
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_REQUESTS], 'readwrite');
    const store = transaction.objectStore(STORE_REQUESTS);
    const request = store.getAll();

    request.onsuccess = () => {
      const envelopes = request.result as OfflineStorageEnvelope[];
      envelopes.forEach((env) => {
        if (env.expiresAt < now) {
          const deleteRequest = store.delete(env.storageId);
          deleteRequest.onsuccess = () => { deletedCount++; };
        }
      });
      resolve();
    };

    request.onerror = () => reject(request.error);
  });

  // Clean responses
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([STORE_RESPONSES], 'readwrite');
    const store = transaction.objectStore(STORE_RESPONSES);
    const request = store.getAll();

    request.onsuccess = () => {
      const envelopes = request.result as OfflineStorageEnvelope[];
      envelopes.forEach((env) => {
        if (env.expiresAt < now) {
          const deleteRequest = store.delete(env.storageId);
          deleteRequest.onsuccess = () => { deletedCount++; };
        }
      });
      resolve();
    };

    request.onerror = () => reject(request.error);
  });

  return deletedCount;
}

/**
 * Service Worker message handler for offline sync
 *
 * Expected message format:
 * {
 *   type: 'phase18:sync-offline',
 *   action: 'store-request' | 'store-response' | 'get-pending' | 'update-sync' | 'cleanup'
 *   payload?: Phase18RequestEnvelope | Phase18ResponseEnvelope | { storageId, syncStatus }
 * }
 */
export async function handlePhase18OfflineMessage(
  message: any
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    switch (message.action) {
      case 'store-request':
        const request = await storePhase18RequestOffline(message.payload);
        return { success: true, data: request };

      case 'store-response':
        const response = await storePhase18ResponseOffline(
          message.payload,
          message.ttlSeconds
        );
        return { success: true, data: response };

      case 'get-pending':
        const pending = await getPendingPhase18Requests();
        return { success: true, data: pending };

      case 'update-sync':
        await updatePhase18SyncStatus(
          message.payload.storageId,
          message.payload.syncStatus
        );
        return { success: true };

      case 'cleanup':
        const deleted = await cleanupExpiredPhase18Envelopes();
        return { success: true, data: { deletedCount: deleted } };

      default:
        return {
          success: false,
          error: `Unknown action: ${message.action}`
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
