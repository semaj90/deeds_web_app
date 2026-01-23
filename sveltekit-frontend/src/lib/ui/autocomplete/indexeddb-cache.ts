/**
 * IndexedDB Cache for Legal Search
 * Enables offline autocomplete + semantic fallback
 * Uses Fuse.js for local scoring
 */

import Fuse from 'fuse.js';

export interface CachedStatute {
    id: string;
    titleNumber: number;
    section: string;
    fullCitation: string;
    heading: string;
    text: string;
    embedding256?: number[]; // Matryoshka truncated
    som_cluster_id?: number;
    kmeans_label?: string;
    cluster_confidence?: number;
    echo_hits?: number;
    lastUpdated: number; // timestamp
}

export interface AutocompleteResult {
    id: string;
    citation: string;
    heading: string;
    source: 'local' | 'semantic' | 'server';
    confidence: number;
    echoHits?: number;
}

const DB_NAME = 'legal-research-os';
const DB_VERSION = 1;
const STORE_NAME = 'statutes';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let db: IDBDatabase | null = null;
let fuse: Fuse<CachedStatute> | null = null;

/**
 * Initialize IndexedDB
 */
export async function initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            resolve(); // Running in SSR or non-browser env
            return;
        }

        const request = indexedDB.open(DB_NAME: DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('citation', 'fullCitation', { unique: false });
                store.createIndex('cluster', 'kmeans_label', { unique: false });
                store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
            }
        };
    });
}

/**
 * Sync statutes from server to IndexedDB
 */
export async function syncStatutesFromServer(statutes: CachedStatute[]): Promise<number> {
    if (!db) await initIndexedDB();
    if (!db) return 0;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    let count = 0;
    const promises: Promise<void>[] = [];

    for (const statute of statutes) {
        promises.push(
            new Promise<void>((resolve, reject) => {
                const req = store.put({
                    ...statute,
                    lastUpdated: Date.now()
                });
                req.onerror = () => reject(req.error);
                req.onsuccess = () => {
                    count++;
                    resolve();
                };
            })
        );
    }

    await Promise.all(promises);

    // Initialize Fuse after sync
    await initFuse();

    return count;
}

/**
 * Initialize Fuse.js for local search
 */
async function initFuse(): Promise<void> {
    if (!db) await initIndexedDB();
    const statutes = await getAllStatutes();

    fuse = new Fuse(statutes, {
        keys: ['fullCitation', 'heading', 'kmeans_label'],
        threshold: 0.3,
        includeScore: true,
        minMatchCharLength: 2
    });
}

/**
 * Get all statutes from IndexedDB
 */
async function getAllStatutes(): Promise<CachedStatute[]> {
    if (!db) await initIndexedDB();
    if (!db) return [];

    return new Promise((resolve, reject) => {
        const tx = db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
    });
}

/**
 * Local search using Fuse.js
 */
export async function searchLocal(query: string, limit: number = 10): Promise<AutocompleteResult[]> {
    if (!fuse) await initFuse();
    if (!fuse) return [];

    const results = fuse.search(query, { limit });

    return results.map((result) => ({
        id: result.item.id,
        citation: result.item.fullCitation,
        heading: result.item.heading,
        source: 'local',
        confidence: 1 - (result.score ?? 0),
        echoHits: result.item.echo_hits
    }));
}

/**
 * Semantic search using cached 256d embeddings
 * Falls back to server if needed
 */
export async function searchSemantic(
    query: string,
    embedding256: number[],
    limit: number = 10
): Promise<AutocompleteResult[]> {
    if (!db) await initIndexedDB();

    // In a real app, loading *all* statutes into memory to scan embeddings might be heavy.
    // Ideally this would use a vector index or we rely on the server.
    // But for "cached" offline support, we iterate if the dataset isn't huge.
    const statutes = await getAllStatutes();

    // Simple cosine similarity on 256d embeddings
    const scored = statutes
        .map((statute) => {
            if (!statute.embedding256 || statute.embedding256.length === 0) {
                return { statute, score: 0 };
            }

            const similarity = cosineSimilarity(embedding256, statute.embedding256);
            return { statute, score: similarity };
        })
        .filter((item) => item.score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scored.map((item) => ({
        id: item.statute.id,
        citation: item.statute.fullCitation,
        heading: item.statute.heading,
        source: 'semantic',
        confidence: item.score,
        echoHits: item.statute.echo_hits
    }));
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Get statutes by cluster
 */
export async function getStatutesByCluster(clusterLabel: string, limit: number = 20): Promise<CachedStatute[]> {
    if (!db) await initIndexedDB();
    if (!db) return [];

    return new Promise((resolve, reject) => {
        const tx = db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('cluster');
        const req = index.getAll(clusterLabel);

        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result.slice(0, limit));
    });
}

/**
 * Check if cache is stale
 */
export async function isCacheStale(): Promise<boolean> {
    if (!db) await initIndexedDB();
    if (!db) return true;

    return new Promise((resolve, reject) => {
        const tx = db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('lastUpdated');
        const req = index.openCursor(null, 'prev');

        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve(true); // Empty cache
                return;
            }

            const lastUpdate = cursor.value.lastUpdated;
            const isStale = Date.now() - lastUpdate > CACHE_TTL_MS;
            resolve(isStale);
        };
    });
}

/**
 * Clear cache
 */
export async function clearCache(): Promise<void> {
    if (!db) await initIndexedDB();
    if (!db) return;

    return new Promise((resolve, reject) => {
        const tx = db!.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            fuse = null;
            resolve();
        };
    });
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
    count: number;
    lastUpdated: number | null;
    isStale: boolean;
}> {
    if (!db) await initIndexedDB();

    // getAllStatutes checks db existence internally
    const statutes = await getAllStatutes();
    const isStale = await isCacheStale();

    const lastUpdated = statutes.length > 0 ? Math.max(...statutes.map((s) => s.lastUpdated)) : null;

    return {
        count: statutes.length,
        lastUpdated,
        isStale
    };
}
