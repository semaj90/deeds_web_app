/*
 * Packet cache worker
 * Stores tool-enriched ACE packets in IndexedDB for client-side reuse.
 */

type PacketRecord = {
  cacheKey: string;
  query: string;
  createdAt: string;
  toolInputs?: Record<string, unknown>;
  toolOutputs?: Record<string, unknown>;
  response?: string;
  sourceRefs?: string[];
  metadata?: Record<string, unknown>;
};

type WorkerRequest =
  | { type: 'PUT_PACKET'; payload: PacketRecord }
  | { type: 'GET_PACKET'; payload: { cacheKey: string } }
  | { type: 'DELETE_PACKET'; payload: { cacheKey: string } }
  | { type: 'CLEAR_PACKETS' };

const DB_NAME = 'ace_packet_cache';
const DB_VERSION = 1;
const STORE_NAME = 'packets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open packet cache DB'));
  });
}

async function putPacket(packet: PacketRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(packet);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to write packet'));
  });
}

async function getPacket(cacheKey: string): Promise<PacketRecord | null> {
  const db = await openDb();
  return new Promise<PacketRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(cacheKey);
    req.onsuccess = () => resolve((req.result as PacketRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('Failed to read packet'));
  });
}

async function deletePacket(cacheKey: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(cacheKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete packet'));
  });
}

async function clearPackets(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear packet cache'));
  });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'PUT_PACKET') {
      await putPacket(message.payload);
      self.postMessage({ type: 'PACKET_CACHED', payload: { cacheKey: message.payload.cacheKey } });
      return;
    }

    if (message.type === 'GET_PACKET') {
      const packet = await getPacket(message.payload.cacheKey);
      self.postMessage({ type: 'PACKET_LOADED', payload: packet });
      return;
    }

    if (message.type === 'DELETE_PACKET') {
      await deletePacket(message.payload.cacheKey);
      self.postMessage({ type: 'PACKET_DELETED', payload: { cacheKey: message.payload.cacheKey } });
      return;
    }

    if (message.type === 'CLEAR_PACKETS') {
      await clearPackets();
      self.postMessage({ type: 'PACKETS_CLEARED' });
      return;
    }

    self.postMessage({ type: 'PACKET_ERROR', payload: 'Unknown message type' });
  } catch (err) {
    self.postMessage({
      type: 'PACKET_ERROR',
      payload: err instanceof Error ? err.message : 'Unknown packet cache error',
    });
  }
};
