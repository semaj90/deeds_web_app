/**
 * Analytics Fusion Bridge: RRF Results → Event Logging
 *
 * Wires RRF fusion output (rank-fused candidates from multiple lanes)
 * into the analytics event pipeline with multi-lane provenance.
 *
 * Event types emitted:
 * - lane.result: Each retrieval lane's contribution (dense, sparse, topology, domain)
 * - candidate.selected: Final RRF-ranked candidate with lane attribution
 * - cache.hit / cache.miss: Lane-specific cache performance
 *
 * Lanes tracked:
 * - dense_content: Qdrant content vector (768-dim)
 * - dense_summary: Qdrant summary intent
 * - sparse_lexical: BM25 / trigram similarity (PostgreSQL)
 * - topology_embedding: SOM cell / K-means centroid
 * - domain_classifier: Ontology domain prediction
 *
 * All events carry traceId for end-to-end correlation.
 */

import { emitBatch, makeEvent } from './analytics-sink.js';
import type { AnalyticsEventEnvelope } from './analytics-event-envelope.js';
import type { FusedCandidate, RRFContribution } from '../retrieval/rrf-fusion.js';

/**
 * Lane metadata for analytics attribution
 */
export interface LaneMetadata {
  laneName: string;
  source: 'qdrant' | 'bm25' | 'neo4j' | 'graph' | 'domain';
  cacheSource?: 'redis' | 'postgres' | 'qdrant';
  latencyMs: number;
  candidateCount: number;
  confidence: number; // Per-lane confidence in results
}

/**
 * RRF fusion result with analytics context
 */
export interface AnalyticsFusionContext {
  traceId: string;
  sessionId?: string;
  userId?: number;
  queryHash: string;
  lanes: Map<string, LaneMetadata>;
  fusedCandidates: FusedCandidate[];
  totalLatencyMs: number;
  rffK: number; // Reciprocal rank fusion k parameter
}

/**
 * Emit per-lane results before fusion (pre-RRF context)
 *
 * One lane.result event per retrieval lane, capturing:
 * - Which lane (dense_content, sparse_lexical, etc.)
 * - How many candidates it retrieved
 * - Lane confidence and latency
 * - Cache status (hit/miss)
 */
export function emitLaneResults(
  context: AnalyticsFusionContext,
): void {
  const events: AnalyticsEventEnvelope[] = [];

  for (const [laneName, metadata] of context.lanes) {
    const laneEvent = makeEvent({
      eventType: 'lane.result',
      traceId: context.traceId,
      sessionId: context.sessionId,
      userId: context.userId,
      queryHash: context.queryHash,
      laneId: laneName,
      latencyMs: metadata.latencyMs,
      metadata: {
        source: metadata.source,
        candidateCount: metadata.candidateCount,
        confidence: metadata.confidence,
        cacheSource: metadata.cacheSource,
        rffContext: 'pre-fusion', // Emitted before RRF combination
      },
    });

    events.push(laneEvent);

    // Emit cache hit/miss for this lane
    if (metadata.cacheSource === 'redis') {
      events.push(
        makeEvent({
          eventType: 'cache.hit',
          traceId: context.traceId,
          sessionId: context.sessionId,
          userId: context.userId,
          queryHash: context.queryHash,
          laneId: laneName,
          metadata: {
            cacheType: 'redis_l1',
            source: metadata.source,
          },
        })
      );
    } else if (metadata.cacheSource === 'postgres' || metadata.cacheSource === 'qdrant') {
      events.push(
        makeEvent({
          eventType: 'cache.miss',
          traceId: context.traceId,
          sessionId: context.sessionId,
          userId: context.userId,
          queryHash: context.queryHash,
          laneId: laneName,
          metadata: {
            fallback: metadata.cacheSource,
            source: metadata.source,
          },
        })
      );
    }
  }

  emitBatch(events);
}

/**
 * Emit RRF-fused candidates with lane attribution
 *
 * One candidate.selected event per fused result, carrying:
 * - Final RRF score and rank position
 * - Which lane(s) contributed to this score
 * - Improvement vs best single-lane result
 * - Packet identity (source_ref, packet_key)
 */
export function emitFusedCandidates(
  context: AnalyticsFusionContext,
): void {
  const events: AnalyticsEventEnvelope[] = context.fusedCandidates.map((candidate, idx) => {
    const contributions = candidate.contributions.map((c) => ({
      lane: c.lane_name,
      rrfScore: c.rrf_score.toFixed(4),
      weight: c.weight.toFixed(3),
      normalizedScore: c.normalized_score.toFixed(3),
    }));

    return makeEvent({
      eventType: 'candidate.selected',
      traceId: context.traceId,
      sessionId: context.sessionId,
      userId: context.userId,
      queryHash: context.queryHash,
      packetKey: candidate.candidate_id,
      sourceRef: candidate.source_ref,
      score: candidate.weighted_score,
      rank: candidate.final_rank,
      latencyMs: Math.round(context.totalLatencyMs / context.fusedCandidates.length), // Amortize
      metadata: {
        rrfScore: candidate.rrf_score.toFixed(4),
        winningLane: candidate.winning_lane,
        improvementVsBest: (candidate.improvement_vs_best * 100).toFixed(1) + '%',
        contributions: contributions, // Which lanes voted for this
        contentHash: candidate.content_hash,
        totalRFFCandidates: context.fusedCandidates.length,
        rffK: context.rffK,
      },
    });
  });

  emitBatch(events);
}

/**
 * Emit domain classification event
 *
 * Signals the domain classifier's prediction for a candidate,
 * with confidence from the ontology model.
 */
export function emitDomainClassification(
  traceId: string,
  sessionId: string | undefined,
  userId: number | undefined,
  queryHash: string,
  packetKey: string,
  domain: string,
  confidence: number,
): void {
  const event = makeEvent({
    eventType: 'candidate.selected', // Reuse candidate event for domain signal
    traceId,
    sessionId,
    userId,
    queryHash,
    packetKey,
    score: confidence,
    metadata: {
      domain,
      confidence,
      source: 'domain_classifier',
    },
  });

  emitBatch([event]);
}

/**
 * Emit topology/SOM context
 *
 * Signals when a candidate is selected due to SOM clustering
 * or K-means centroid proximity.
 */
export function emitTopologyContext(
  traceId: string,
  sessionId: string | undefined,
  userId: number | undefined,
  queryHash: string,
  packetKey: string,
  centroidId: string,
  somCell: number,
  score: number,
): void {
  const event = makeEvent({
    eventType: 'centroid.assigned',
    traceId,
    sessionId,
    userId,
    queryHash,
    packetKey,
    centroidId,
    somCell,
    score,
    metadata: {
      topology: 'som_grid',
      gridSize: 20, // 20x20 SOM
      cellScore: score,
    },
  });

  emitBatch([event]);
}

/**
 * Emit complete fusion summary
 *
 * Final event summarizing the entire RRF fusion operation:
 * - Total candidates fused
 * - Best improvement achieved
 * - Average lane latency
 * - Winning lane (the one that ranked the #1 result highest)
 */
export function emitFusionSummary(
  context: AnalyticsFusionContext,
): void {
  const topCandidate = context.fusedCandidates[0];
  const bestLaneLatency = Array.from(context.lanes.values()).reduce((min, lane) =>
    lane.latencyMs < min ? lane.latencyMs : min,
  );
  const avgLaneLatency = Array.from(context.lanes.values()).reduce((sum, lane) =>
    sum + lane.latencyMs,
    0) / context.lanes.size;

  const event = makeEvent({
    eventType: 'request.routed', // Summary of routing decision
    traceId: context.traceId,
    sessionId: context.sessionId,
    userId: context.userId,
    queryHash: context.queryHash,
    latencyMs: context.totalLatencyMs,
    metadata: {
      fusionStrategy: 'rrf_weighted_blend',
      candidatesFused: context.fusedCandidates.length,
      lanesParticipated: context.lanes.size,
      winningLane: topCandidate?.winning_lane,
      bestImprovement: (topCandidate?.improvement_vs_best ?? 0 * 100).toFixed(1) + '%',
      avgLaneLatency: avgLaneLatency.toFixed(0) + 'ms',
      bestLaneLatency: bestLaneLatency.toFixed(0) + 'ms',
      rffK: context.rffK,
      laneList: Array.from(context.lanes.keys()).join(','),
    },
  });

  emitBatch([event]);
}

/**
 * Emit lexical (BM25) lane result
 *
 * Helper for sparse retrieval lane signaling through the analytics pipeline.
 */
export function emitLexicalLaneResult(
  context: AnalyticsFusionContext,
  candidateId: string,
  similarity: number,
  latencyMs: number,
): void {
  const event = makeEvent({
    eventType: 'lane.result',
    traceId: context.traceId,
    sessionId: context.sessionId,
    userId: context.userId,
    queryHash: context.queryHash,
    packetKey: candidateId,
    laneId: 'sparse_lexical',
    score: similarity,
    latencyMs,
    metadata: {
      source: 'bm25',
      lane: 'sparse_lexical',
      similarity: similarity.toFixed(3),
    },
  });

  emitBatch([event]);
}

/**
 * Emit round-robin lane selection context
 *
 * When multiple lanes have similar scores, the system may use round-robin
 * or other balancing to avoid always picking the same lane.
 */
export function emitRoundRobinContext(
  traceId: string,
  sessionId: string | undefined,
  userId: number | undefined,
  queryHash: string,
  selectedLane: string,
  alternateLanes: string[],
  reason: string,
): void {
  const event = makeEvent({
    eventType: 'request.routed',
    traceId,
    sessionId,
    userId,
    queryHash,
    laneId: selectedLane,
    metadata: {
      strategy: 'round_robin',
      selectedLane,
      alternates: alternateLanes.join(','),
      reason, // e.g., "similar_scores", "load_balance", "diversity"
    },
  });

  emitBatch([event]);
}

export type { AnalyticsFusionContext, LaneMetadata };
