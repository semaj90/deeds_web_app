/**
 * rg-cluster-pivot.ts
 *
 * Bridges fast-AST (rg lexical) hits to Qdrant cluster-level semantic expansion.
 *
 * Pipeline:
 *   file paths (from fast-AST Redis tag index)
 *   → Qdrant scroll: get som_cluster + topoClass per path
 *   → Redis: load 64-dim encoded vectors for those files (gpu:karpathy:encoded)
 *   → Centroid compare: cosine similarity between cluster encodings → k adjacent clusters
 *   → Qdrant scroll: expand to all files in pivot clusters (capped per cluster)
 *   → Merge + rank: deduplicate against existing ragChunks, weight by Karpathy blend
 *
 * Output slots into context-assembler's ragChunks after the fast-AST step.
 * Score cap: CLUSTER_PIVOT_SCORE_CAP (between fast-AST 0.07 and Qdrant ANN ~0.6+)
 */

import { getRedis } from '$lib/server/redis.js';
import { QdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { readLatestQdrantClusterTags } from './cluster-tags-cache.js';
import type { UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

const CODEBASE_COLLECTION = 'codebase_chunks_768';
const CLUSTER_PIVOT_SCORE_CAP = 0.18;
const MAX_FILES_PER_CLUSTER = 6;
const MAX_PIVOT_CLUSTERS = 3;

// ── 64-dim cosine similarity (no GPU needed — vectors are tiny) ───────────────

function dot64(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < 64; i++) s += a[i] * b[i];
  return s;
}

function norm64(v: number[]): number {
  return Math.sqrt(dot64(v, v));
}

function cosine64(a: number[], b: number[]): number {
  const na = norm64(a);
  const nb = norm64(b);
  if (na === 0 || nb === 0) return 0;
  return dot64(a, b) / (na * nb);
}

function parseEncoded(csv: string): number[] {
  return csv.split(',').map(Number);
}

// ── Qdrant: get som_cluster + topoClass for a list of file paths ─────────────

async function getClusterMembership(
  qdrant: QdrantManager,
  filePaths: string[],
): Promise<Map<number, { topoClass: string; files: string[] }>> {
  const clusterMap = new Map<number, { topoClass: string; files: string[] }>();
  if (!filePaths.length) return clusterMap;

  try {
    const client = (qdrant as any).client;
    const result: any = await client.scroll(CODEBASE_COLLECTION, {
      filter: {
        must: [{ key: 'file_path', match: { any: filePaths.slice(0, 20) } }],
      },
      with_payload: ['file_path', 'som_cluster', 'topoClass'],
      with_vector: false,
      limit: 40,
    });

    for (const pt of result?.points ?? []) {
      const cluster: number = pt.payload?.som_cluster;
      const topo: string = pt.payload?.topoClass ?? 'general';
      const fp: string = pt.payload?.file_path ?? '';
      if (cluster == null) continue;
      const entry = clusterMap.get(cluster) ?? { topoClass: topo, files: [] };
      entry.files.push(fp);
      clusterMap.set(cluster, entry);
    }
  } catch {
    // Qdrant unavailable — silently skip cluster pivot
  }

  return clusterMap;
}

// ── Redis: load 64-dim encoded vectors for a batch of file paths ─────────────

async function loadEncodedVectors(
  filePaths: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (!filePaths.length) return out;
  try {
    const redis = getRedis();
    const vals = await redis.hmget('gpu:karpathy:encoded', ...filePaths);
    for (let i = 0; i < filePaths.length; i++) {
      const v = vals[i];
      if (v) out.set(filePaths[i], parseEncoded(v));
    }
  } catch {
    // Redis miss — centroids unavailable, skip similarity step
  }
  return out;
}

// ── Compute mean centroid for a group of file vectors ────────────────────────

function meanCentroid(vecs: number[][]): number[] | null {
  if (!vecs.length) return null;
  const dim = vecs[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) sum[i] += v[i];
  return sum.map((s) => s / vecs.length);
}

// ── Qdrant: expand to files belonging to pivot cluster ids ───────────────────

async function expandClusters(
  qdrant: QdrantManager,
  clusterIds: number[],
  excludePaths: Set<string>,
  karpathyScores: Map<string, number>,
): Promise<UnifiedRetrievalResult[]> {
  if (!clusterIds.length) return [];
  const results: UnifiedRetrievalResult[] = [];

  try {
    const client = (qdrant as any).client;
    const result: any = await client.scroll(CODEBASE_COLLECTION, {
      filter: {
        must: [{ key: 'som_cluster', match: { any: clusterIds } }],
      },
      with_payload: ['file_path', 'som_cluster', 'topoClass', 'tags', 'summary'],
      with_vector: false,
      limit: clusterIds.length * MAX_FILES_PER_CLUSTER,
    });

    const seen = new Map<number, number>(); // cluster → count
    for (const pt of result?.points ?? []) {
      const fp: string = pt.payload?.file_path ?? '';
      if (!fp || excludePaths.has(fp)) continue;

      const cid: number = pt.payload?.som_cluster;
      const count = seen.get(cid) ?? 0;
      if (count >= MAX_FILES_PER_CLUSTER) continue;
      seen.set(cid, count + 1);

      const karpathy = karpathyScores.get(fp) ?? 0;
      const score = Math.min(
        0.10 + karpathy * 0.08,
        CLUSTER_PIVOT_SCORE_CAP,
      );

      results.push({
        id: `cluster-pivot:${fp}`,
        kind: 'code_chunk' as const,
        source: 'qdrant' as const,
        content: fp,
        summary: pt.payload?.summary ?? `[cluster-pivot] ${fp}`,
        score,
        tags: ['cluster-pivot', ...(pt.payload?.tags ?? [])],
        filePath: fp,
        metadata: {
          indexMode: 'cluster-pivot',
          som_cluster: cid,
          topoClass: pt.payload?.topoClass ?? 'general',
        },
      });
    }
  } catch {
    // Qdrant unavailable
  }

  return results;
}

// ── Load Karpathy blend scores for a list of files ───────────────────────────

async function loadKarpathyBlend(filePaths: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!filePaths.length) return out;
  try {
    const redis = getRedis();
    const vals = await redis.hmget('gpu:karpathy:scores', ...filePaths);
    for (let i = 0; i < filePaths.length; i++) {
      const v = vals[i];
      if (v) {
        try {
          const obj = JSON.parse(v) as { blend?: number };
          if (obj.blend != null) out.set(filePaths[i], obj.blend);
        } catch { /* skip */ }
      }
    }
  } catch { /* Redis miss */ }
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface ClusterPivotResult {
  hits: UnifiedRetrievalResult[];
  /** Cluster keys that were expanded (for ACE transparency) */
  pivotClusters: string[];
  /** Number of source file paths that matched a known cluster */
  anchoredFiles: number;
}

/**
 * Given file paths from a fast-AST rg hit, pivot through Qdrant cluster membership
 * to surface semantically adjacent files in the same topology clusters.
 *
 * @param fastAstFilePaths - file paths from the fast-AST Redis tag index
 * @param existingPaths - paths already in ragChunks (for dedup)
 */
export async function clusterPivot(
  fastAstFilePaths: string[],
  existingPaths: Set<string>,
): Promise<ClusterPivotResult> {
  const empty: ClusterPivotResult = { hits: [], pivotClusters: [], anchoredFiles: 0 };
  if (!fastAstFilePaths.length) return empty;

  const qdrant = new QdrantManager();

  // Step 1: get som_cluster membership for rg-matched files
  const membership = await getClusterMembership(qdrant, fastAstFilePaths);
  if (!membership.size) return empty;

  // Step 2: load 64-dim encoded vectors for all files across matched clusters
  const allClusterFiles = [...membership.values()].flatMap((m) => m.files);
  const [encoded, clusterTags] = await Promise.all([
    loadEncodedVectors(allClusterFiles),
    Promise.resolve(readLatestQdrantClusterTags()),
  ]);

  // Step 3: compute centroid per matched cluster, find k adjacent clusters by cosine
  const matchedClusterIds = [...membership.keys()];
  const pivotSet = new Set<number>(matchedClusterIds);

  if (encoded.size > 0) {
    // Build centroid for each matched cluster
    const centroids = new Map<number, number[]>();
    for (const [cid, { files }] of membership) {
      const vecs = files.map((f) => encoded.get(f)).filter(Boolean) as number[][];
      const c = meanCentroid(vecs);
      if (c) centroids.set(cid, c);
    }

    // Compare against other known clusters from cluster-tags cache
    // Use files from clusterTags to probe their 64-dim vectors
    const clusterTagKeys = clusterTags.slice(0, 40);
    for (const [cid, centroid] of centroids) {
      // Find top-k similar clusters from tags cache by probing representative files
      const similarities: Array<{ cid: number; sim: number }> = [];
      for (const tag of clusterTagKeys) {
        const probeFiles = (tag.topFiles ?? []).filter(Boolean) as string[];
        if (!probeFiles.length) continue;
        const probeVecs = probeFiles
          .map((f) => encoded.get(f))
          .filter(Boolean) as number[][];
        const probeCentroid = meanCentroid(probeVecs);
        if (!probeCentroid) continue;
        const tagCid = Number(tag.clusterKey?.replace(/\D+/g, '') ?? -1);
        if (isNaN(tagCid) || tagCid === cid || pivotSet.has(tagCid)) continue;
        similarities.push({ cid: tagCid, sim: cosine64(centroid, probeCentroid) });
      }
      similarities.sort((a, b) => b.sim - a.sim);
      for (const { cid: adjCid } of similarities.slice(0, MAX_PIVOT_CLUSTERS)) {
        pivotSet.add(adjCid);
      }
    }
  }

  // Step 4: load Karpathy blend scores for scoring output hits
  const allPivotFiles = [...pivotSet].flatMap((cid) => {
    const tag = clusterTags.find(
      (t) => Number(t.clusterKey?.replace(/\D+/g, '') ?? -1) === cid,
    );
    return (tag?.topFiles ?? []).filter(Boolean) as string[];
  });
  const karpathy = await loadKarpathyBlend(allPivotFiles);

  // Step 5: expand clusters → file-level hits
  const hits = await expandClusters(
    qdrant,
    [...pivotSet].slice(0, MAX_PIVOT_CLUSTERS * 2),
    existingPaths,
    karpathy,
  );

  const pivotClusters = [...pivotSet].map((id) => `cluster:gpu:${id}`);

  return {
    hits,
    pivotClusters,
    anchoredFiles: allClusterFiles.length,
  };
}