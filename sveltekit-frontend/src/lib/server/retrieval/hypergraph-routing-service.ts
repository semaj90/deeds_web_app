import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';
import { QueryProfileRouter } from '$lib/server/retrieval/query-profile-router.js';
import { readHotClusters } from '$lib/server/ace/hot-cluster-reader.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ClusterRoutingResult {
  clusterIds: number[];
  hotClusterIds: number[];
  clusterField: 'gpu_cluster' | 'som_cluster';
  cards: any[];
  method: string;
}

// Profiles are now managed in QueryProfileRouter.ts

export class HypergraphRoutingService {
  private static instance: HypergraphRoutingService;
  private hgLookupUrl = ENV.HG_LOOKUP_URL ?? ENV.TOPOLOGY_SEARCH_URL;

  public static getInstance(): HypergraphRoutingService {
    if (!HypergraphRoutingService.instance) {
      HypergraphRoutingService.instance = new HypergraphRoutingService();
    }
    return HypergraphRoutingService.instance;
  }

  // Handled by QueryProfileRouter.route

  /**
   * Routes a query embedding to the nearest topological clusters.
   */
  public async route(embedding: number[], queryText: string, topK = 3): Promise<ClusterRoutingResult> {
    const result: ClusterRoutingResult = {
      clusterIds: [],
      hotClusterIds: [],
      clusterField: 'gpu_cluster',
      cards: [],
      method: 'greedy-topology'
    };

    try {
      // 1. Ask Lookup Server
      const hgRes = await fetch(`${this.hgLookupUrl}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding, k: topK }),
      });

      if (hgRes.ok) {
        const data = await hgRes.json();
        result.clusterIds = data.results?.map((r: any) => r.id) ?? [];
        result.method = data.method || 'greedy-topology';
      }
    } catch (err) {
      console.warn('[HypergraphRoutingService] Lookup server unreachable, falling back to priors:', err.message);
      result.method = 'fail-open-priors';
    }

    // 2. Merge with Profile Priors
    const profile = QueryProfileRouter.route(queryText);
    const priors = QueryProfileRouter.getPriors(profile);
    const hotClusters = await readHotClusters(getRedis(), topK, { preferHotSet: true }).catch(() => []);
    const hotClusterIds = hotClusters.map((cluster) => cluster.clusterId).filter((id) => Number.isFinite(id) && id >= 0);
    result.hotClusterIds = hotClusterIds.slice(0, topK + 2);
    
    // 3. Neighbor Expansion
    const neighbors = this.getNeighbors(result.clusterIds);
    
    const uniqueIds = new Set([...result.clusterIds, ...priors, ...neighbors, ...result.hotClusterIds]);
    result.clusterIds = Array.from(uniqueIds).slice(0, topK + 5);
    if (result.hotClusterIds.length > 0) {
      result.method = `${result.method}+hot-set`;
    }

    // 3. Fetch Cluster Cards from Redis
    if (result.clusterIds.length > 0) {
      const redis = getRedis();
      const keys = result.clusterIds.map(id => `ace:cluster:${id}`);
      try {
        const rawCards = await redis.mget(...keys);
        result.cards = rawCards.filter(Boolean).map(c => JSON.parse(c!));
      } catch (err) {
        console.warn('[HypergraphRoutingService] Redis card fetch failed:', err.message);
      }
    }

    return result;
  }

  /**
   * Expands the cluster set with immediate topological neighbors.
   */
  private getNeighbors(clusterIds: number[]): number[] {
    const topologyPath = resolve(process.cwd(), 'docs/graph/cluster-topology.json');
    if (!existsSync(topologyPath)) return [];

    try {
      const data = JSON.parse(readFileSync(topologyPath, 'utf8'));
      const neighbors = new Set<number>();

      for (const id of clusterIds) {
        const cluster = data.clusters.find((c: any) => c.clusterId === id);
        if (cluster && cluster.neighbors) {
          cluster.neighbors
            .filter((n: any) => n.manhattan <= 1) // Only closest neighbors
            .forEach((n: any) => neighbors.add(n.clusterId));
        }
      }
      return Array.from(neighbors);
    } catch {
      return [];
    }
  }

  /**
   * Builds a Qdrant filter for the routed clusters.
   */
  public buildFilter(routing: ClusterRoutingResult, clusterField: 'gpu_cluster' | 'som_cluster' = 'gpu_cluster'): any | null {
    if (routing.clusterIds.length === 0) return null;
    return {
      must: [
        { key: clusterField, match: { any: routing.clusterIds } }
      ]
    };
  }
}
