/**
 * Stage 5 — Qdrant Centroid Clustering via k-means
 * Wraps kmeansWithCentroids for hit embeddings.
 */

import { getAddonInternal, acquireFloat32, releaseFloat32 } from '$lib/server/gpu/libtorch-bridge.js';

export interface ClusterAssignment {
    id: number;
    centroid: number[];
    memberKeys: string[];
}

/**
 * Performs k-means clustering on a set of embeddings.
 * @param keys Identifier for each embedding (e.g. stable_key)
 * @param embeddings The vectors to cluster
 * @param k Number of clusters
 */
export async function clusterHits(
    keys: string[],
    embeddings: number[][],
    k: number = 5
): Promise<ClusterAssignment[]> {
    const n = embeddings.length;
    if (n === 0) return [];
    const actualK = Math.min(k, n);
    const dim = 768;

    const addon = getAddonInternal();
    if (!addon?.kmeansWithCentroids) {
        // CPU fallback placeholder or warning
        console.warn('[kmeans-cluster] kmeansWithCentroids not available on addon');
        return [];
    }

    const flat = acquireFloat32(n * dim);
    embeddings.forEach((emb, i) => flat.set(emb, i * dim));

    try {
        const result = addon.kmeansWithCentroids(flat, n, dim, actualK, 100);
        const { assignments, centroids } = result;

        const clusters: ClusterAssignment[] = Array.from({ length: actualK }, (_, i) => ({
            id: i,
            centroid: Array.from(centroids.subarray(i * dim, (i + 1) * dim)),
            memberKeys: []
        }));

        for (let i = 0; i < n; i++) {
            const clusterId = assignments[i];
            if (clusterId >= 0 && clusterId < actualK) {
                clusters[clusterId].memberKeys.push(keys[i]);
            }
        }

        return clusters;
    } catch (err) {
        console.error('[kmeans-cluster] Error:', err);
        return [];
    } finally {
        releaseFloat32(flat);
    }
}
