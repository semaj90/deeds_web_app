/**
 * Payload factory functions for Qdrant upsert and enrichment operations.
 * Normalises raw scroll results into typed payloads, builds graph enrichment
 * patches, and scores ACE context chunks for ranking.
 */

import type { CodebaseChunkPayload, EvidenceChunkPayload } from '../types/qdrant.js';
import { buildEmbedText } from './embed-text.js';

/**
 * Normalise a raw Qdrant scroll result payload into a typed
 * CodebaseChunkPayload. Unknown or missing fields are given safe defaults.
 */
export function normalizeCodebasePayload(
  raw: Record<string, unknown>,
): CodebaseChunkPayload {
  return {
    file_path: String(raw.file_path ?? ''),
    chunk_index: Number(raw.chunk_index ?? 0),
    content: String(raw.content ?? ''),
    language: String(raw.language ?? 'typescript'),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    summary: raw.summary ? String(raw.summary) : undefined,
    entities: Array.isArray(raw.entities)
      ? (raw.entities as string[])
      : undefined,
    graph_neighbors: Array.isArray(raw.graph_neighbors)
      ? (raw.graph_neighbors as string[])
      : undefined,
    schema_version: Number(raw.schema_version ?? 1),
    som_cluster: raw.som_cluster != null ? Number(raw.som_cluster) : null,
    centroid_id: raw.centroid_id != null ? Number(raw.centroid_id) : null,
    quality_score: raw.quality_score != null ? Number(raw.quality_score) : null,
    authority_score:
      raw.authority_score != null ? Number(raw.authority_score) : null,
  };
}

/**
 * Build a partial payload update object for enriching existing Qdrant points
 * with graph-derived metadata (SOM cluster, PageRank authority, neighbours).
 * Only keys with defined values are included in the patch.
 */
export function buildGraphEnrichmentPayload(opts: {
  somCluster?: number;
  centroidId?: number;
  graphNeighbors?: string[];
  authorityScore?: number;
  qualityScore?: number;
}): Partial<CodebaseChunkPayload> {
  const patch: Partial<CodebaseChunkPayload> = {};
  if (opts.somCluster !== undefined) patch.som_cluster = opts.somCluster;
  if (opts.centroidId !== undefined) patch.centroid_id = opts.centroidId;
  if (opts.graphNeighbors !== undefined)
    patch.graph_neighbors = opts.graphNeighbors;
  if (opts.authorityScore !== undefined)
    patch.authority_score = opts.authorityScore;
  if (opts.qualityScore !== undefined) patch.quality_score = opts.qualityScore;
  return patch;
}

/**
 * Compute a composite relevance score for an ACE context chunk.
 * Combines the raw Qdrant similarity score with authority, graph distance,
 * and SOM cluster proximity signals. Result is clamped to [0, 1].
 *
 * Weights:
 * - authority_score bonus: ×0.15
 * - graph_distance ≤ 1 bonus: +0.08
 * - SOM cluster match bonus: +0.05
 */
export function scoreACEChunk(opts: {
  qdrantScore: number;
  authorityScore?: number;
  graphDistance?: number;
  somClusterMatch?: boolean;
}): number {
  let score = opts.qdrantScore;
  if (opts.authorityScore) score += opts.authorityScore * 0.15;
  if (opts.graphDistance !== undefined && opts.graphDistance <= 1) score += 0.08;
  if (opts.somClusterMatch) score += 0.05;
  return Math.min(score, 1.0);
}

export { buildEmbedText };
