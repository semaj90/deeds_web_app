/**
 * Qdrant Semantic Clustering Service
 * 
 * Performs external semantic clustering (k-means) on Qdrant collections
 * by scrolling all points, clustering embeddings via GPU, and updating payloads.
 */

import { qdrant } from './qdrant-manager.js';
import { kmeansWithCentroids } from '$lib/server/gpu/pytorch-graph.js';

export interface ClusteringResult {
  collection: string;
  pointsClustered: number;
  clusterCount: number;
  durationMs: number;
}

export class ClusteringService {
  /**
   * Performs semantic clustering on a collection.
   * 1. Scrolls all points to get embeddings.
   * 2. Runs k-means via GPU bridge.
   * 3. Updates payload for each point with 'gpuCluster'.
   */
  async clusterCollection(collection: string, k = 100): Promise<ClusteringResult> {
    const t0 = performance.now();
    console.log(`🌀 Starting semantic clustering for ${collection} (k=${k})...`);

    // 1. Scroll all points
    const embeddings: number[][] = [];
    const ids: (string | number)[] = [];
    let nextOffset: string | number | null | undefined = null;

    do {
      const response = await qdrant.client.scroll(collection, {
        offset: nextOffset ?? undefined,
        limit: 1000,
        with_vector: true,
        with_payload: false
      });

      for (const point of response.points) {
        if (point.vector && Array.isArray(point.vector)) {
          embeddings.push(point.vector as number[]);
          ids.push(point.id);
        } else if (point.vector && typeof point.vector === 'object') {
          // Multi-vector case
          const vec = (point.vector as any).content || (point.vector as any).default;
          if (vec) {
            embeddings.push(vec);
            ids.push(point.id);
          }
        }
      }
      nextOffset = response.next_page_offset as string | number | null | undefined;
    } while (nextOffset);

    if (embeddings.length === 0) {
      return { collection, pointsClustered: 0, clusterCount: 0, durationMs: performance.now() - t0 };
    }

    console.log(`📊 Collected ${embeddings.length} embeddings. Running k-means on GPU...`);

    // 2. Run k-means via the existing LibTorch graph wrapper
    const dim = embeddings[0]?.length ?? 0;
    const flatEmbeddings = new Float32Array(embeddings.flat());
    const { assignments } = kmeansWithCentroids(flatEmbeddings, embeddings.length, dim, k);

    // 3. Batch update payloads
    const batchSize = 200;
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunkIds = ids.slice(i, i + batchSize);
      const chunkAssignments = Array.from(assignments.slice(i, i + batchSize));

      await qdrant.client.setPayload(collection, {
        payload: { som_cluster: 0 }, // Placeholder, we use points filter below
        points: chunkIds,
        wait: false
      });

      // Individual update for each point is slow in Qdrant REST client
      // Better to use batch update if possible
      await Promise.all(chunkIds.map((id, idx) => 
        qdrant.client.setPayload(collection, {
          payload: { som_cluster: chunkAssignments[idx] },
          points: [id],
          wait: false
        })
      ));
    }

    const durationMs = performance.now() - t0;
    console.log(`✅ Clustering complete for ${collection}. Duration: ${Math.round(durationMs)}ms`);

    return {
      collection,
      pointsClustered: ids.length,
      clusterCount: k,
      durationMs
    };
  }
}

export const clusteringService = new ClusteringService();
