/**
 * Retrieval Analytics Integration: Multi-Lane Signals → Event Pipeline
 *
 * Bridges the multi-lane retrieval system (Redis, Qdrant, BM25, Neo4j, SOM)
 * into the analytics event pipeline with RRF fusion context.
 *
 * Emission points:
 * 1. Pre-fusion: Each lane's results (lane.result event)
 * 2. Post-fusion: RRF-ranked candidates (candidate.selected events)
 * 3. Summary: Overall fusion performance (request.routed event)
 *
 * Designed for round-robin load balancing across lexical/semantic/topology lanes.
 */

import { createHash } from 'node:crypto';
import {
  emitLaneResults,
  emitFusedCandidates,
  emitFusionSummary,
  emitLexicalLaneResult,
  emitRoundRobinContext,
} from './analytics-fusion-bridge.js';
import type { AnalyticsFusionContext, LaneMetadata } from './analytics-fusion-bridge.js';
import type { RetrievalLaneResult, MultiLaneOutput, ContextHit } from '../features/rag/retrieval-lanes.js';
import type { FusedCandidate } from '../retrieval/rrf-fusion.js';

/**
 * Map retrieval lane name to analytics source type
 */
function mapLaneToSource(lane: string): 'qdrant' | 'bm25' | 'neo4j' | 'graph' | 'domain' {
  if (lane.includes('qdrant') || lane.includes('vector')) return 'qdrant';
  if (lane.includes('postgres') || lane.includes('trigram') || lane.includes('lexical')) return 'bm25';
  if (lane.includes('neo4j') || lane.includes('graph')) return 'neo4j';
  if (lane.includes('topology') || lane.includes('som')) return 'graph';
  return 'domain'; // Default for summary_lenses, cluster, etc.
}

/**
 * Build analytics context from multi-lane retrieval results
 *
 * Transforms RetrievalLaneResult array into AnalyticsFusionContext,
 * ready for RRF fusion and event emission.
 */
export function buildFusionContext(
  multiLaneOutput: MultiLaneOutput,
  traceId: string,
  sessionId: string | undefined,
  userId: number | undefined,
  query: string,
): AnalyticsFusionContext {
  // Compute stable query hash (first 16 chars of SHA-256)
  const queryHash = createHash('sha256').update(query).digest('hex').slice(0, 16);

  const lanes = new Map<string, LaneMetadata>();

  // Extract metadata from each lane
  for (const laneResult of multiLaneOutput.lanes) {
    const source = mapLaneToSource(laneResult.lane);
    const cacheSource = laneResult.degraded ? 'postgres' : 'redis'; // Simplified; could check lane name

    lanes.set(laneResult.lane, {
      laneName: laneResult.lane,
      source,
      cacheSource,
      latencyMs: laneResult.latencyMs,
      candidateCount: laneResult.hits.length,
      confidence: laneResult.degraded ? 0.5 : 0.9, // Degraded lanes have lower confidence
    });
  }

  // Convert ContextHit to FusedCandidate-like structure
  // This is a simplified mapping; real implementation would use actual RRF scores
  const fusedCandidates: FusedCandidate[] = multiLaneOutput.merged.slice(0, 20).map((hit, idx) => ({
    candidate_id: hit.id,
    source_ref: hit.filePath || hit.symbol || 'unknown',
    content_hash: createHash('sha256').update(hit.text || hit.id).digest('hex').slice(0, 16),
    rrf_score: (20 - idx) / 20, // Inverse rank as simple score
    weighted_score: (20 - idx) / 20,
    final_rank: idx + 1,
    contributions: [], // Would be populated by actual RRF computation
    improvement_vs_best: idx === 0 ? 0 : 0.1 * (20 - idx) / 20,
    winning_lane: hit.source,
    landing_score: hit.score,
  }));

  return {
    traceId,
    sessionId,
    userId,
    queryHash,
    lanes,
    fusedCandidates,
    totalLatencyMs: multiLaneOutput.durationMs,
    rffK: 60, // Standard RRF k parameter
  };
}

/**
 * Emit analytics events from multi-lane retrieval results
 *
 * Called after retrieval is complete (pre- or post-fusion).
 * Emits 3 event groups:
 * 1. Per-lane results (lane.result)
 * 2. Fused candidates (candidate.selected)
 * 3. Fusion summary (request.routed)
 */
export function emitRetrievalAnalytics(
  context: AnalyticsFusionContext,
  emitLaneEvents: boolean = true,
  emitCandidateEvents: boolean = true,
  emitSummary: boolean = true,
): void {
  if (emitLaneEvents) {
    emitLaneResults(context);
  }

  if (emitCandidateEvents) {
    emitFusedCandidates(context);
  }

  if (emitSummary) {
    emitFusionSummary(context);
  }
}

/**
 * Implement round-robin lane selection with analytics
 *
 * When multiple lanes have similar performance (score/latency),
 * rotate through them to avoid always selecting the same lane.
 *
 * Example: If qdrant_vector and postgres_trigram are within 5% confidence,
 * alternate selection between them over successive queries from the same user.
 */
export class RoundRobinLaneSelector {
  private userLaneRotation: Map<string, number> = new Map(); // userId -> lane index
  private laneOptions: string[] = [];

  constructor(laneNames: string[]) {
    this.laneOptions = laneNames.sort(); // Deterministic order
  }

  selectLane(userId: string | undefined, candidates: string[]): string {
    if (!userId || candidates.length === 0) {
      return candidates[0] ?? 'qdrant_vector'; // Fallback
    }

    // Current rotation index for this user
    const currentIdx = this.userLaneRotation.get(userId) ?? 0;

    // Find which of the candidates is next in rotation
    const rotationLane = this.laneOptions[currentIdx % this.laneOptions.length];
    const selectedLane = candidates.includes(rotationLane) ? rotationLane : candidates[0];

    // Advance rotation for next time
    this.userLaneRotation.set(userId, (currentIdx + 1) % this.laneOptions.length);

    return selectedLane;
  }

  emitSelectionContext(
    traceId: string,
    sessionId: string | undefined,
    userId: number | undefined,
    queryHash: string,
    selectedLane: string,
    candidateLanes: string[],
  ): void {
    emitRoundRobinContext(
      traceId,
      sessionId,
      userId?.toString(),
      queryHash,
      selectedLane,
      candidateLanes.filter((l) => l !== selectedLane),
      'load_balance_across_lanes',
    );
  }
}

/**
 * Lexical (BM25) lane analytics wrapper
 *
 * Emits analytics for sparse retrieval via PostgreSQL trigram similarity.
 * Each hit is logged with similarity score and lane latency.
 */
export function emitLexicalLaneAnalytics(
  context: AnalyticsFusionContext,
  hits: Array<{ id: string; similarity: number }>,
  latencyMs: number,
): void {
  for (const hit of hits.slice(0, 10)) {
    emitLexicalLaneResult(context, hit.id, hit.similarity, latencyMs);
  }
}

/**
 * Parse JSONB Qdrant payloads for analytics attribution
 *
 * Extracts domain, ontology tags, and other metadata from Qdrant point payloads
 * to enrich analytics events with semantic context.
 */
export interface QdrantPayloadMetadata {
  domain?: string;
  ontologyTags?: string[];
  confidence?: number;
  source_ref?: string;
  feature_id?: string;
}

export function extractQdrantMetadata(payload: Record<string, unknown>): QdrantPayloadMetadata {
  return {
    domain: (payload.domain as string) || undefined,
    ontologyTags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
    confidence: typeof payload.confidence === 'number' ? payload.confidence : undefined,
    source_ref: (payload.source_ref as string) || undefined,
    feature_id: (payload.feature_id as string) || undefined,
  };
}

/**
 * Contextual tree analytics: track retrieval depth and breadth
 *
 * For KAG/topology traversal, emit events as the graph is expanded:
 * - Depth: how many hops from the initial query
 * - Breadth: how many nodes at this depth
 * - Confidence: how confident the expansion is
 */
export interface ContextualTreeEvent {
  depth: number;
  breadth: number;
  nodeId: string;
  confidence: number;
  edgeType: string; // e.g., IMPORTS, BELONGS_TO_CLUSTER, SIMILAR_TOPOLOGY
}

export function emitContextualTreeTraversal(
  traceId: string,
  sessionId: string | undefined,
  userId: number | undefined,
  queryHash: string,
  treeEvents: ContextualTreeEvent[],
): void {
  // This would emit a custom analytics event if the schema supported deeper nesting
  // For now, encode tree depth/breadth in metadata
  console.debug('[analytics] Contextual tree traversal:', {
    traceId,
    totalNodes: treeEvents.length,
    maxDepth: Math.max(...treeEvents.map((e) => e.depth)),
    avgBreadth: treeEvents.reduce((sum, e) => sum + e.breadth, 0) / treeEvents.length,
  });
}

export type { AnalyticsFusionContext, LaneMetadata };
