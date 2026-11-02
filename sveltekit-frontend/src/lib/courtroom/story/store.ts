import type { Story } from './engine.js';

export const STORY_DB_NAME = 'courtroom-story-v1';
export const STORY_DB_VERSION = 2;

export interface StoryRun {
  id: string;
  storyId: string;
  currentTick: number;
  status: 'running' | 'completed' | 'paused';
  inputs: unknown[];
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface StoryChunk {
  id: string;
  storyId: string;
  text: string;
  vector?: Float32Array;
  metadata?: Record<string, unknown>;
}

/**
 * Open the courtroom story IndexedDB database.
 * Upgraded from v1 (stories) to v2 (stories, runs, chunks).
 * Note: vectors are kept as Float32Array blobs; no KV cache or hidden reasoning is stored.
 */
export function openStoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORY_DB_NAME, STORY_DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('stories')) {
        db.createObjectStore('stories', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('runs')) {
        const runStore = db.createObjectStore('runs', { keyPath: 'id' });
        runStore.createIndex('by_story', 'storyId', { unique: false });
      }

      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('by_story', 'storyId', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Backward-compatible alias
export const openStories = openStoryDb;

export async function saveStory(story: Story): Promise<void> {
  const db = await openStoryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('stories', 'readwrite');
      tx.objectStore('stories').put(story);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadStory(id: string): Promise<Story | undefined> {
  const db = await openStoryDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('stories', 'readonly').objectStore('stories').get(id);
      req.onsuccess = () => resolve(req.result as Story | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveRun(run: StoryRun): Promise<void> {
  const db = await openStoryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('runs', 'readwrite');
      tx.objectStore('runs').put(run);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadRun(id: string): Promise<StoryRun | undefined> {
  const db = await openStoryDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction('runs', 'readonly').objectStore('runs').get(id);
      req.onsuccess = () => resolve(req.result as StoryRun | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveChunks(chunks: StoryChunk[]): Promise<void> {
  const db = await openStoryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      for (const chunk of chunks) {
        store.put(chunk);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadChunksForStory(storyId: string): Promise<StoryChunk[]> {
  const db = await openStoryDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const index = tx.objectStore('chunks').index('by_story');
      const req = index.getAll(storyId);
      req.onsuccess = () => resolve((req.result as StoryChunk[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export interface EvictionReceipt {
  evictedRunsCount: number;
  evictedChunksCount: number;
  remainingRunsCount: number;
  remainingChunksCount: number;
}

/**
 * Quota and eviction policy (CSP-42).
 * The IndexedDB store is a client cache, never the record of truth.
 * Evicts oldest runs when count exceeds maxRuns and chunks exceeding maxChunks.
 */
export async function evictOldRunsAndChunks(
  options: { maxRuns?: number; maxChunks?: number } = {}
): Promise<EvictionReceipt> {
  const maxRuns = options.maxRuns ?? 10;
  const maxChunks = options.maxChunks ?? 100;
  const db = await openStoryDb();

  try {
    // 1. Fetch all runs
    const allRuns = await new Promise<StoryRun[]>((resolve, reject) => {
      const tx = db.transaction('runs', 'readonly');
      const req = tx.objectStore('runs').getAll();
      req.onsuccess = () => resolve((req.result as StoryRun[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    let evictedRuns = 0;
    const evictedStoryIds = new Set<string>();

    if (allRuns.length > maxRuns) {
      // Sort oldest first
      const sorted = allRuns.slice().sort((a, b) => {
        const tA = new Date(a.startedAt).getTime() || 0;
        const tB = new Date(b.startedAt).getTime() || 0;
        return tA - tB;
      });

      const toEvict = sorted.slice(0, allRuns.length - maxRuns);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('runs', 'readwrite');
        const store = tx.objectStore('runs');
        for (const run of toEvict) {
          store.delete(run.id);
          evictedStoryIds.add(run.storyId);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      evictedRuns = toEvict.length;
    }

    // 2. Fetch all chunks
    const allChunks = await new Promise<StoryChunk[]>((resolve, reject) => {
      const tx = db.transaction('chunks', 'readonly');
      const req = tx.objectStore('chunks').getAll();
      req.onsuccess = () => resolve((req.result as StoryChunk[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    let evictedChunks = 0;
    const toDeleteChunkIds = new Set<string>();

    // Evict chunks from evicted stories
    for (const chunk of allChunks) {
      if (evictedStoryIds.has(chunk.storyId)) {
        toDeleteChunkIds.add(chunk.id);
      }
    }

    // If total chunks still exceed maxChunks, prune oldest
    const remainingChunks = allChunks.filter((c) => !toDeleteChunkIds.has(c.id));
    if (remainingChunks.length > maxChunks) {
      const excess = remainingChunks.slice(0, remainingChunks.length - maxChunks);
      for (const c of excess) {
        toDeleteChunkIds.add(c.id);
      }
    }

    if (toDeleteChunkIds.size > 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('chunks', 'readwrite');
        const store = tx.objectStore('chunks');
        for (const id of toDeleteChunkIds) {
          store.delete(id);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      evictedChunks = toDeleteChunkIds.size;
    }

    return {
      evictedRunsCount: evictedRuns,
      evictedChunksCount: evictedChunks,
      remainingRunsCount: allRuns.length - evictedRuns,
      remainingChunksCount: allChunks.length - evictedChunks
    };
  } finally {
    db.close();
  }
}

