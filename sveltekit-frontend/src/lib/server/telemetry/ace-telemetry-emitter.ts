/**
 * ACE Retrieval Telemetry Emitter
 *
 * Captures behavioral evidence from ACE context assembly without blocking execution.
 * Fire-and-forget pattern: failures logged but never thrown.
 *
 * Phase 3D: Telemetry baseline collection (>1,000 queries before cache policy)
 */

import { recordRetrievalTelemetry, type RetrievalTelemetrySignal } from './retrieval-recorder.js';
import { ENV } from '$lib/server/env.server.js';

export interface ACERetrievalMetrics {
  query: string;
  vectorHits?: number;
  trigramHits?: number;
  ftsHits?: number;
  selectedPacketKey?: string | null;
  selectedPacketKeys?: string[];
  selectedFeatureId?: string | null;
  featureIds?: string[];
  fusionScore?: number;
  latencyMs: number;
  retrievalStrategy: 'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom';
  cacheHit?: boolean;
  userId?: string;
  surface?: string;
  fromParentAtlas?: boolean;
}

/**
 * Record ACE retrieval telemetry asynchronously.
 *
 * This function:
 * 1. Validates required fields
 * 2. Constructs telemetry signal
 * 3. Emits to PostgreSQL via recorder
 * 4. Never throws (fires and forgets)
 *
 * @param metrics - ACE retrieval metrics from context assembly
 */
export async function recordACERetrievalTelemetry(metrics: ACERetrievalMetrics): Promise<void> {
  // Fire-and-forget: do not await, do not propagate errors
  recordRetrievalTelemetry({
    query: metrics.query,
    latencyMs: metrics.latencyMs,
    vectorHits: metrics.vectorHits ?? 0,
    trigramHits: metrics.trigramHits ?? 0,
    ftsHits: metrics.ftsHits ?? 0,
    selectedPacketKey: metrics.selectedPacketKey ?? null,
    selectedPacketKeys: metrics.selectedPacketKeys ?? [],
    selectedFeatureId: metrics.selectedFeatureId ?? null,
    featureIds: metrics.featureIds ?? [],
    fusionScore: metrics.fusionScore,
    cacheHit: metrics.cacheHit ?? false,
    surface: metrics.surface ?? 'ace',
    environment: ENV.NODE_ENV ?? 'development',
    retrievalStrategy: metrics.retrievalStrategy,
  }).catch((err) => {
    // Telemetry failure should never block ACE
    console.debug('[ACE Telemetry] Emit failed (non-blocking):', {
      query: metrics.query.slice(0, 50),
      strategy: metrics.retrievalStrategy,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Determine retrieval strategy from hybrid search mode and result composition.
 *
 * @param mode - Hybrid search mode from chooseRetrievalMode()
 * @param vectorHits - Number of vector search results
 * @param lexicalHits - Number of lexical search results
 * @param graphHits - Number of Neo4j graph neighbors
 * @param isFallback - True if result came from NESCHROM97 cold fallback
 * @returns Retrieval strategy name
 */
export function determineRetrievalStrategy(
  mode: 'lexical-heavy' | 'semantic-heavy' | 'hybrid',
  vectorHits: number,
  lexicalHits: number,
  graphHits?: number,
  isFallback?: boolean
): 'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom' {
  // Cold fallback (NESCHROM97 derived artifacts)
  if (isFallback) {
    return 'cold_neschrom';
  }

  // Structural-only (Neo4j graph expansion)
  if (graphHits && graphHits > 0 && vectorHits === 0 && lexicalHits === 0) {
    return 'structural_only';
  }

  // Vector-only (Qdrant semantic search, no lexical hits)
  if (vectorHits > 0 && lexicalHits === 0) {
    return 'vector_only';
  }

  // Lexical-only (Postgres FTS, no vector hits)
  if (lexicalHits > 0 && vectorHits === 0) {
    return 'lexical_only';
  }

  // Fusion (combination of vector + lexical, possibly with graph)
  if (vectorHits > 0 && lexicalHits > 0) {
    return 'fusion';
  }

  // Default fallback
  return 'fusion';
}

/**
 * Extract packet and feature IDs from ranked candidates.
 *
 * Used to populate selectedPacketKey, selectedFeatureId, and featureIds arrays
 * for telemetry emission.
 *
 * @param candidates - Ranked retrieval results
 * @returns Object with packet and feature extraction
 */
export function extractPacketAndFeatureIds(
  candidates: Array<{ packet_key?: string; feature_id?: string; [key: string]: unknown }>
): {
  selectedPacketKey: string | null;
  selectedPacketKeys: string[];
  selectedFeatureId: string | null;
  featureIds: string[];
} {
  const packetKeys = new Set<string>();
  const featureIds = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.packet_key && typeof candidate.packet_key === 'string') {
      packetKeys.add(candidate.packet_key);
    }
    if (candidate.feature_id && typeof candidate.feature_id === 'string') {
      featureIds.add(candidate.feature_id);
    }
  }

  const packetKeysArray = Array.from(packetKeys);
  const featureIdsArray = Array.from(featureIds);

  return {
    selectedPacketKey: packetKeysArray[0] ?? null,
    selectedPacketKeys: packetKeysArray,
    selectedFeatureId: featureIdsArray[0] ?? null,
    featureIds: featureIdsArray,
  };
}
