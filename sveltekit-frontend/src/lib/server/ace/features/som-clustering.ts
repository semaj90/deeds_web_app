import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema/atlas-packets.js';
import { eq } from 'drizzle-orm';

/**
 * SOM Clustering via pytorch-graph N-API bridge.
 * Consumes feature vectors (40-dim from FeatureVectorGenerator).
 * Outputs: cluster assignments to Postgres (4 columns, 0 conditionals).
 * Gate 12 execution: 4-5 hours for 61,659 packets.
 */

export const SomClusterAssignmentSchema = z.object({
  packetKey: z.string(),
  clusterId: z.number().int().min(0).max(399),
  somBmuRow: z.number().int().min(0).max(19),
  somBmuCol: z.number().int().min(0).max(19),
  confidence: z.number().min(0).max(1.0),
});

export type SomClusterAssignment = z.infer<typeof SomClusterAssignmentSchema>;

export interface SomClusterResult {
  assignments: SomClusterAssignment[];
  centroids: Float32Array[];
  iteration: number;
  convergence: number;
  version: string;
  timestamp: number;
  totalProcessed: number;
  totalSuccessful: number;
  totalFailed: number;
}

export class SomClusterer {
  private addon: any;
  private k: number;
  private maxIterations: number;

  constructor(options?: { k?: number; maxIterations?: number }) {
    this.addon = null;
    this.k = options?.k ?? 400;
    this.maxIterations = options?.maxIterations ?? 50;
  }

  private async loadAddon(): Promise<any | null> {
    if (this.addon) {
      return this.addon;
    }

    try {
      // Vite must not try to statically analyze the native addon path.
      // @ts-expect-error Native addon import is runtime-only.
      const mod = await import(/* @vite-ignore */ '../../../gpu/libtorch-bridge.node');
      this.addon = (mod as { default?: any }).default ?? mod;
      return this.addon;
    } catch {
      return null;
    }
  }

  /**
   * Cluster feature vectors using K-Means (GPU via N-API or CPU fallback).
   * Returns cluster assignments + centroids.
   */
  async cluster(
    packets: Array<{
      packetKey: string;
      sourceRef: string;
      features: number[];
    }>,
    options?: { seed?: number; batchSize?: number }
  ): Promise<SomClusterResult> {
    const startTime = Date.now();

    if (!packets || packets.length === 0) {
      throw new Error('No packets to cluster');
    }

    // Validate all feature vectors are same dimension
    const dim = packets[0].features.length;
    for (const pkt of packets) {
      if (pkt.features.length !== dim) {
        throw new Error(
          `Feature dimension mismatch: expected ${dim}, got ${pkt.features.length} for ${pkt.packetKey}`
        );
      }
    }

    // Build feature matrix: packets.length × dim
    const featureMatrix = new Float32Array(packets.length * dim);
    for (let i = 0; i < packets.length; i++) {
      featureMatrix.set(packets[i].features, i * dim);
    }

    let result: { centroids: Float32Array[]; assignments: Int32Array; iteration: number; convergence: number };

    const addon = await this.loadAddon();

    if (addon && typeof addon.kmeansWithCentroids === 'function') {
      // GPU path: N-API LibTorch bridge
      try {
        const gpuResult = addon.kmeansWithCentroids(
          featureMatrix,
          this.k,
          this.maxIterations,
          options?.seed ?? 42
        );
        result = {
          centroids: gpuResult.centroids,
          assignments: gpuResult.assignments,
          iteration: gpuResult.iteration ?? this.maxIterations,
          convergence: gpuResult.convergence ?? 0,
        };
      } catch (err) {
        console.error('GPU K-Means failed, falling back to CPU:', err);
        result = this.kmeansSync(featureMatrix, dim);
      }
    } else {
      // CPU fallback: synchronous CPU K-Means
      result = this.kmeansSync(featureMatrix, dim);
    }

    // Map assignments to SomClusterAssignment objects
    const assignments: SomClusterAssignment[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < packets.length; i++) {
      const clusterId = result.assignments[i];
      if (clusterId < 0 || clusterId >= this.k) {
        console.error(`Invalid cluster ID ${clusterId} for packet ${packets[i].packetKey}`);
        failCount++;
        continue;
      }

      const somBmuRow = Math.floor(clusterId / 20);
      const somBmuCol = clusterId % 20;

      // Calculate confidence: 1.0 - (distance / max_distance)
      const centerStart = clusterId * dim;
      const centroid = result.centroids[clusterId];
      let distanceSq = 0;
      for (let j = 0; j < dim; j++) {
        const diff = packets[i].features[j] - centroid[j];
        distanceSq += diff * diff;
      }
      const distance = Math.sqrt(distanceSq);
      const confidence = Math.max(0, Math.min(1.0, 1.0 - distance / 100)); // Normalize distance

      assignments.push({
        packetKey: packets[i].packetKey,
        clusterId,
        somBmuRow,
        somBmuCol,
        confidence,
      });
      successCount++;
    }

    return {
      assignments,
      centroids: result.centroids,
      iteration: result.iteration,
      convergence: result.convergence,
      version: 'kmeansWithCentroids-v1',
      timestamp: startTime,
      totalProcessed: packets.length,
      totalSuccessful: successCount,
      totalFailed: failCount,
    };
  }

  /**
   * CPU fallback: synchronous K-Means implementation.
   * Lloyd's algorithm with random initialization.
   */
  private kmeansSync(
    featureMatrix: Float32Array,
    dim: number
  ): { centroids: Float32Array[]; assignments: Int32Array; iteration: number; convergence: number } {
    const n = featureMatrix.length / dim;
    const effectiveK = Math.min(this.k, n);
    const centroids: Float32Array[] = [];
    const assignments = new Int32Array(n);

    // Random initialization: pick k random data points as initial centroids
    const initialIdx = new Set<number>();
    while (initialIdx.size < effectiveK) {
      initialIdx.add(Math.floor(Math.random() * n));
    }
    for (const idx of initialIdx) {
      const centroid = new Float32Array(dim);
      centroid.set(featureMatrix.slice(idx * dim, (idx + 1) * dim));
      centroids.push(centroid);
    }

    let convergence = Infinity;
    let iteration = 0;

    for (iteration = 0; iteration < this.maxIterations; iteration++) {
      // Assign points to nearest centroid
      for (let i = 0; i < n; i++) {
        let minDist = Infinity;
        let nearestCluster = 0;
        for (let k = 0; k < effectiveK; k++) {
          let dist = 0;
          for (let j = 0; j < dim; j++) {
            const diff = featureMatrix[i * dim + j] - centroids[k][j];
            dist += diff * diff;
          }
          if (dist < minDist) {
            minDist = dist;
            nearestCluster = k;
          }
        }
        assignments[i] = nearestCluster;
      }

      // Update centroids
      const clusterSizes = new Int32Array(effectiveK);
      const newCentroids = Array.from({ length: effectiveK }, () => new Float32Array(dim));

      for (let i = 0; i < n; i++) {
        const cluster = assignments[i];
        clusterSizes[cluster]++;
        for (let j = 0; j < dim; j++) {
          newCentroids[cluster][j] += featureMatrix[i * dim + j];
        }
      }

      // Normalize centroids
      for (let k = 0; k < effectiveK; k++) {
        if (clusterSizes[k] > 0) {
          for (let j = 0; j < dim; j++) {
            newCentroids[k][j] /= clusterSizes[k];
          }
        }
      }

      // Check convergence
      let maxDelta = 0;
      for (let k = 0; k < effectiveK; k++) {
        for (let j = 0; j < dim; j++) {
          const delta = Math.abs(newCentroids[k][j] - centroids[k][j]);
          maxDelta = Math.max(maxDelta, delta);
        }
      }
      convergence = maxDelta;

      if (convergence < 1e-6) {
        break;
      }

      // Update centroids for next iteration
      for (let k = 0; k < effectiveK; k++) {
        centroids[k].set(newCentroids[k]);
      }
    }

    return {
      centroids,
      assignments,
      iteration,
      convergence,
    };
  }

  /**
   * Materialize cluster assignments to Postgres.
   * Direct UPDATE: 4 columns, no conditionals.
   */
  async materializeToPostgres(result: SomClusterResult): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    const batchSize = 1000;
    for (let i = 0; i < result.assignments.length; i += batchSize) {
      const batch = result.assignments.slice(i, i + batchSize);

      for (const assignment of batch) {
        try {
          await db
            .update(atlasPackets)
            .set({
              kmeansCluster: assignment.clusterId,
              somRow: assignment.somBmuRow,
              somCol: assignment.somBmuCol,
              somIndex: assignment.clusterId,
            })
            .where(eq(atlasPackets.packetKey, assignment.packetKey));
          updated++;
        } catch (err) {
          console.error(`Failed to update packet ${assignment.packetKey}:`, err);
          failed++;
        }
      }
    }

    return { updated, failed };
  }

  /**
   * Write centroids to Redis for retrieval prefilter.
   */
  async cacheInRedis(
    result: SomClusterResult,
    redis: any,
    ttlSeconds: number = 86400
  ): Promise<void> {
    for (let i = 0; i < result.centroids.length; i++) {
      const key = `som:centroid:${i}`;
      const value = Buffer.from(result.centroids[i].buffer);
      await redis.setex(key, ttlSeconds, value);
    }
  }
}
