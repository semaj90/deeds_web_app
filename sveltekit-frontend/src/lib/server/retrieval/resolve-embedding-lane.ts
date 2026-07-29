/**
 * Resolve Embedding Lane — Precedence-Based Explicit Lineage
 *
 * When a candidate has embedding dimension 768 but explicit lane=dense_384,
 * we trust the explicit lane field (it was projected). Do NOT infer lane from dimension alone.
 *
 * Precedence:
 * 1. Explicit embedding_lane field in the search result
 * 2. Vector name from Qdrant collection (e.g., "dense_384", "dense_768")
 * 3. Collection contract (which lane does this collection represent?)
 * 4. Native dimension fallback (768 → dense_768, 384 → dense_384, 64 → latent_64)
 * 5. UNKNOWN (emit telemetry, gate the candidate)
 */

import { DenseRepresentationName } from '../atlas/contracts/dense-lane-policy';

export enum EmbeddingLaneTelemetryReason {
  EXPLICIT_FIELD = 'explicit_field',
  VECTOR_NAME = 'vector_name',
  COLLECTION_CONTRACT = 'collection_contract',
  NATIVE_DIMENSION_FALLBACK = 'native_dimension_fallback',
  UNKNOWN = 'unknown',
}

export interface RawSearchHit {
  embedding_lane?: DenseRepresentationName;
  vector_name?: string;
  embedding_dim?: number;
  collection?: string;
  projection?: {
    source_dimension: number;
    method: string;
    version: string;
  };
  dimension?: number;
}

export interface EmbeddingLaneResolution {
  lane: DenseRepresentationName | null;
  reason: EmbeddingLaneTelemetryReason;
  fallbackChain?: string[];
}

/**
 * Collection-to-lane mapping.
 *
 * Collection names are deployment slots, not representation identifiers. Keep
 * persisted compatibility names here so old data can be read without making
 * the 384 lane active or canonical.
 */
const COLLECTION_LANE_REGISTRY: Record<string, DenseRepresentationName> = {
  codebase_chunks_768: DenseRepresentationName.SEMANTIC_768,
  codebase_chunks_384: DenseRepresentationName.SEMANTIC_384,
  codebase_chunks_384_hybrid: DenseRepresentationName.SEMANTIC_384,
  codebase_chunks_latent64: DenseRepresentationName.LATENT_64,
  codebase_topology_64: DenseRepresentationName.LATENT_64,
  evidence_items_768: DenseRepresentationName.SEMANTIC_768,
  evidence_items_384: DenseRepresentationName.SEMANTIC_384,
};

/**
 * Vector name to lane mapping (Qdrant vector field naming).
 */
const VECTOR_NAME_LANE_REGISTRY: Record<string, DenseRepresentationName> = {
  dense_768: DenseRepresentationName.SEMANTIC_768,
  dense_384: DenseRepresentationName.SEMANTIC_384,
  latent_64: DenseRepresentationName.LATENT_64,
  semantic_768: DenseRepresentationName.SEMANTIC_768,
  semantic_384: DenseRepresentationName.SEMANTIC_384,
  routing_latent64: DenseRepresentationName.LATENT_64,
  content: DenseRepresentationName.SEMANTIC_768,
};

/**
 * Resolve embedding lane from a raw search result.
 * Follows strict precedence to prevent fallback-based lane drift.
 */
export function resolveEmbeddingLane(hit: RawSearchHit): EmbeddingLaneResolution {
  const fallbackChain: string[] = [];

  if (hit.embedding_lane) {
    fallbackChain.push(`explicit_field=${hit.embedding_lane}`);
    return {
      lane: hit.embedding_lane,
      reason: EmbeddingLaneTelemetryReason.EXPLICIT_FIELD,
      fallbackChain,
    };
  }
  fallbackChain.push('no_explicit_field');

  if (hit.vector_name && VECTOR_NAME_LANE_REGISTRY[hit.vector_name]) {
    const lane = VECTOR_NAME_LANE_REGISTRY[hit.vector_name];
    fallbackChain.push(`vector_name=${hit.vector_name} → ${lane}`);
    return {
      lane,
      reason: EmbeddingLaneTelemetryReason.VECTOR_NAME,
      fallbackChain,
    };
  }
  if (hit.vector_name) {
    fallbackChain.push(`unknown_vector_name=${hit.vector_name}`);
  }

  if (hit.collection && COLLECTION_LANE_REGISTRY[hit.collection]) {
    const lane = COLLECTION_LANE_REGISTRY[hit.collection];
    fallbackChain.push(`collection_contract=${hit.collection} → ${lane}`);
    return {
      lane,
      reason: EmbeddingLaneTelemetryReason.COLLECTION_CONTRACT,
      fallbackChain,
    };
  }
  if (hit.collection) {
    fallbackChain.push(`unknown_collection=${hit.collection}`);
  }

  const dimToCheck = hit.embedding_dim ?? hit.dimension;
  if (dimToCheck === 768) {
    fallbackChain.push(`dimension=${dimToCheck} → dense_768 (fallback)`);
    return {
      lane: DenseRepresentationName.SEMANTIC_768,
      reason: EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK,
      fallbackChain,
    };
  }
  if (dimToCheck === 384) {
    fallbackChain.push(`dimension=${dimToCheck} → dense_384 (fallback)`);
    return {
      lane: DenseRepresentationName.SEMANTIC_384,
      reason: EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK,
      fallbackChain,
    };
  }
  if (dimToCheck === 64) {
    fallbackChain.push(`dimension=${dimToCheck} → latent_64 (fallback)`);
    return {
      lane: DenseRepresentationName.LATENT_64,
      reason: EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK,
      fallbackChain,
    };
  }
  if (dimToCheck) {
    fallbackChain.push(`unknown_dimension=${dimToCheck}`);
  }

  fallbackChain.push('UNKNOWN — unable to resolve lane');
  return {
    lane: null,
    reason: EmbeddingLaneTelemetryReason.UNKNOWN,
    fallbackChain,
  };
}

/**
 * Emit telemetry when lane resolution falls back or fails.
 */
export function emitEmbeddingLaneTelemetry(
  packetKey: string,
  resolution: EmbeddingLaneResolution,
): void {
  if (resolution.reason === EmbeddingLaneTelemetryReason.EXPLICIT_FIELD) {
    return;
  }

  console.warn('[embedding_lineage_fallback]', {
    packet_key: packetKey,
    inferred_from: resolution.reason,
    fallback_chain: resolution.fallbackChain?.join(' → '),
    resolved_lane: resolution.lane ?? 'null',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Compatibility alias. Keep existing imports working while new code uses the
 * correctly spelled export.
 */
export const emitEmbeddingLaneTelementry = emitEmbeddingLaneTelemetry;

/**
 * Gate candidates where lane resolution failed.
 */
export function gateEmbeddingLaneResolution(
  hit: RawSearchHit,
  packetKey: string,
): { gatePass: boolean; reason?: string } {
  const resolution = resolveEmbeddingLane(hit);

  if (resolution.lane === null) {
    emitEmbeddingLaneTelemetry(packetKey, resolution);
    return {
      gatePass: false,
      reason: `lane_resolution_failed: ${resolution.fallbackChain?.join(' → ')}`,
    };
  }

  return { gatePass: true };
}
