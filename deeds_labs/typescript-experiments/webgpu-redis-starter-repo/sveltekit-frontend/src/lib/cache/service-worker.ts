// Service Worker for background tensor operations and caching
import { TensorCache } from './indexeddb';

declare const self: ServiceWorkerGlobalScope;

const tensorCache = new TensorCache();
const pendingOperations = new Map<string, Promise<any>>();

// Message types for worker communication
interface WorkerMessage {
    type: 'EMBED' | 'CLUSTER' | 'CACHE' | 'EVICT' | 'PREFETCH';
    id: string;
    data: any;
}

interface TensorOperation {
    assetId: string;
    operation: 'embed' | 'cluster' | 'quantize';
    data: Float32Array;
    shape: number[];
}

// Initialize on activation
self.addEventListener('activate', async (event) => {
    event.waitUntil(tensorCache.init());
    console.log('Tensor service worker activated');
});

// Handle messages from main thread
self.addEventListener('message', async (event: ExtendableMessageEvent) => {
    const msg = event.data as WorkerMessage;

    switch (msg.type) {
        case 'EMBED':
            event.waitUntil(handleEmbedding(msg.id, msg.data));
            break;

        case 'CLUSTER':
            event.waitUntil(handleClustering(msg.id, msg.data));
            break;

        case 'CACHE':
            event.waitUntil(handleCache(msg.id, msg.data));
            break;

        case 'EVICT':
            event.waitUntil(handleEviction(msg.data.maxAge));
            break;

        case 'PREFETCH':
            event.waitUntil(handlePrefetch(msg.data.tensorIds));
            break;
    }
});

// Background embedding generation
async function handleEmbedding(id: string, data: TensorOperation) {
    // Check if already processing
    if (pendingOperations.has(id)) {
        return pendingOperations.get(id);
    }

    const operation = (async () => {
        try {
            // Send to FastAPI service for embedding
            const response = await fetch('/api/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: data.assetId,
                    tensor_id: id,
                    num_slices: 3,
                }),
            });

            const result = await response.json();

            // Store slices in IndexedDB
            const sliceIds = await tensorCache.storeTensorSlices(
                data.assetId,
                new Float32Array(result.embeddings),
                result.shape
            );

            // Notify main thread
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'EMBED_COMPLETE',
                    id,
                    sliceIds,
                });
            });

            return sliceIds;
        } catch (error) {
            console.error('Embedding failed:', error);
            throw error;
        } finally {
            pendingOperations.delete(id);
        }
    })();

    pendingOperations.set(id, operation);
    return operation;
}

// K-means clustering in background
async function handleClustering(id: string, data: {
    tensorIds: string[];
    k: number;
}) {
    if (pendingOperations.has(id)) {
        return pendingOperations.get(id);
    }

    const operation = (async () => {
        try {
            // Load tensors from cache
            const tensors = await Promise.all(
                data.tensorIds.map(tid => tensorCache.getTensor(tid))
            );

            // Simple k-means implementation
            const vectors = tensors
                .filter(t => t !== null)
                .map(t => new Float32Array(t!.data));

            if (vectors.length < data.k) {
                throw new Error('Not enough vectors for clustering');
            }

            // Initialize centroids randomly
            const centroids = Array(data.k)
                .fill(null)
                .map(() => {
                    const idx = Math.floor(Math.random() * vectors.length);
                    return vectors[idx].slice();
                });

            // Run k-means iterations
            const maxIterations = 20;
            const assignments = new Array(vectors.length);

            for (let iter = 0; iter < maxIterations; iter++) {
                // Assign points to nearest centroid
                let changed = false;
                for (let i = 0; i < vectors.length; i++) {
                    const nearest = findNearestCentroid(vectors[i], centroids);
                    if (assignments[i] !== nearest) {
                        assignments[i] = nearest;
                        changed = true;
                    }
                }

                if (!changed) break;

                // Update centroids
                for (let c = 0; c < data.k; c++) {
                    const members = vectors.filter((_, i) => assignments[i] === c);
                    if (members.length > 0) {
                        centroids[c] = computeMean(members);
                    }
                }
            }

            // Store clustering results
            const result = {
                id,
                centroids: centroids.map(c => Array.from(c)),
                assignments,
                timestamp: Date.now(),
            };

            // Notify main thread
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'CLUSTER_COMPLETE',
                    id,
                    result,
                });
            });

            return result;
        } catch (error) {
            console.error('Clustering failed:', error);
            throw error;
        } finally {
            pendingOperations.delete(id);
        }
    })();

    pendingOperations.set(id, operation);
    return operation;
}

// Cache tensor data
async function handleCache(id: string, data: {
    tensorId: string;
    buffer: ArrayBuffer;
    shape: number[];
    dtype: string;
}) {
    try {
        await tensorCache.init();

        // Store in IndexedDB
        const sliceIds = await tensorCache.storeTensorSlices(
            data.tensorId,
            new Float32Array(data.buffer),
            data.shape
        );

        // Notify completion
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'CACHE_COMPLETE',
                id,
                sliceIds,
            });
        });

        return sliceIds;
    } catch (error) {
        console.error('Caching failed:', error);
        throw error;
    }
}

// Evict old tensors
async function handleEviction(maxAge: number) {
    try {
        await tensorCache.evictOldTensors(maxAge);

        // Report memory usage
        const usage = tensorCache.getMemoryUsage();

        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'EVICTION_COMPLETE',
                usage,
            });
        });
    } catch (error) {
        console.error('Eviction failed:', error);
    }
}

// Prefetch tensors for upcoming operations
async function handlePrefetch(tensorIds: string[]) {
    try {
        const results = await Promise.all(
            tensorIds.map(id => tensorCache.getTensor(id))
        );

        const loaded = results.filter(r => r !== null).length;

        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'PREFETCH_COMPLETE',
                loaded,
                total: tensorIds.length,
            });
        });
    } catch (error) {
        console.error('Prefetch failed:', error);
    }
}

// Utility functions
function findNearestCentroid(
    point: Float32Array,
    centroids: Float32Array[]
): number {
    let minDist = Infinity;
    let nearest = 0;

    for (let i = 0; i < centroids.length; i++) {
        const dist = euclideanDistance(point, centroids[i]);
        if (dist < minDist) {
            minDist = dist;
            nearest = i;
        }
    }

    return nearest;
}

function euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = a[i] - b[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

function computeMean(vectors: Float32Array[]): Float32Array {
    const mean = new Float32Array(vectors[0].length);
    for (const vec of vectors) {
        for (let i = 0; i < vec.length; i++) {
            mean[i] += vec[i];
        }
    }
    for (let i = 0; i < mean.length; i++) {
        mean[i] /= vectors.length;
    }
    return mean;
}

// Periodic cleanup
setInterval(() => {
    handleEviction(3600000); // Evict tensors older than 1 hour
}, 300000); // Run every 5 minutes

export {};