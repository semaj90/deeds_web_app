/**
 * Resolve Embedding Lane — Precedence-Based Explicit Lineage
 *
 * When a candidate has a legacy 384 lane, we trust explicit lineage only.
 * Do NOT infer lane from dimension alone.
 *
 * Precedence:
 * 1. Explicit embedding_lane field in the search result
 * 2. Vector name from Qdrant collection (e.g., "dense_384", "dense_768")
 * 3. Collection contract (which lane does this collection represent?)
 * 4. Native dimension fallback (768 → dense_768, 64 → latent_64)
 * 5. Legacy 384 requires explicit lineage and is never inferred from dimension
 * 6. UNKNOWN (emit telemetry, gate the candidate)
 */

import { DenseRepresentationName } from '../atlas/contracts/dense-lane-policy';

export enum EmbeddingLaneTelemetryReason {
  EXPLICIT_FIELD = 'explicit_field',                // Lane from embedding_lane field
  VECTOR_NAME = 'vector_name',                      // Lane from vector collection name
  COLLECTION_CONTRACT = 'collection_contract',      // Lane from collection registry
  NATIVE_DIMENSION_FALLBACK = 'native_dimension_fallback',  // Inferred from dimension
  LEGACY_DIMENSION_EXPLICIT_ONLY = 'legacy_dimension_explicit_only',
  UNKNOWN = 'unknown',                              // Could not resolve
}

export interface RawSearchHit {
  // Explicit lane field (if present in Qdrant payload or search response)
  embedding_lane?: DenseRepresentationName;

  // Vector name (from Qdrant collection name, e.g., "codebase_chunks_384" uses dense_384)
  vector_name?: string;

  // Raw dimension from the vector
  embedding_dim?: number;

  // Collection name (e.g., "codebase_chunks_768", "codebase_chunks_384")
  collection?: string;

  // Projection metadata (if this vector was projected)
  projection?: {
    source_dimension: number;
    method: string;
    version: string;
  };

  // Generic fallback dimension (should not be used if explicit fields present)
  dimension?: number;
}

export interface EmbeddingLaneResolution {
  lane: DenseRepresentationName | null;
  reason: EmbeddingLaneTelemetryReason;
  fallbackChain?: string[];  // For debugging: which checks were tried
}

/**
 * Collection-to-lane mapping (canonical)
 */
const COLLECTION_LANE_REGISTRY: Record<string, DenseRepresentationName> = {
  'codebase_chunks_768': DenseRepresentationName.SEMANTIC_768,
  'codebase_chunks_384': DenseRepresentationName.SEMANTIC_384,
  'codebase_chunks_latent64': DenseRepresentationName.LATENT_64,
  'evidence_items_768': DenseRepresentationName.SEMANTIC_768,
  'evidence_items_384': DenseRepresentationName.SEMANTIC_384,
};

/**
 * Vector name to lane mapping (Qdrant vector field naming)
 */
const VECTOR_NAME_LANE_REGISTRY: Record<string, DenseRepresentationName> = {
  'dense_768': DenseRepresentationName.SEMANTIC_768,
  'dense_384': DenseRepresentationName.SEMANTIC_384,
  'latent_64': DenseRepresentationName.LATENT_64,
  'semantic_768': DenseRepresentationName.SEMANTIC_768,
  'semantic_384': DenseRepresentationName.SEMANTIC_384,
  'routing_latent64': DenseRepresentationName.LATENT_64,
};

/**
 * Resolve embedding lane from a raw search result
 * Follows strict precedence to prevent fallback-based lane drift
 */
export function resolveEmbeddingLane(
  hit: RawSearchHit
): EmbeddingLaneResolution {
  const fallbackChain: string[] = [];

  // Step 1: Explicit embedding_lane field (highest priority)
  if (hit.embedding_lane) {
    fallbackChain.push(`explicit_field=${hit.embedding_lane}`);
    return {
      lane: hit.embedding_lane,
      reason: EmbeddingLaneTelemetryReason.EXPLICIT_FIELD,
      fallbackChain,
    };
  }
  fallbackChain.push('no_explicit_field');

  // Step 2: Vector name from collection (e.g., "dense_384")
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

  // Step 3: Collection contract (e.g., "codebase_chunks_384")
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

  // Step 4: Native dimension fallback
  // CRITICAL: Only use this if NO explicit lineage available.
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
    fallbackChain.push(`dimension=${dimToCheck} → explicit lineage required (no fallback)`);
    return {
      lane: null,
      reason: EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY,
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

  // Step 5: UNKNOWN (emit telemetry, gate the candidate)
  fallbackChain.push('UNKNOWN — unable to resolve lane');
  return {
    lane: null,
    reason: EmbeddingLaneTelemetryReason.UNKNOWN,
    fallbackChain,
  };
}

/**
 * Emit telemetry event when lane resolution falls back or fails
 */
export function emitEmbeddingLaneTelementry(
  packetKey: string,
  resolution: EmbeddingLaneResolution
): void {
  if (resolution.reason === EmbeddingLaneTelemetryReason.EXPLICIT_FIELD) {
    return;  // No telemetry needed for explicit case
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
 * Gate: Reject candidates where lane resolution failed
 */
export function gateEmbeddingLaneResolution(
  hit: RawSearchHit,
  packetKey: string
): { gatePass: boolean; reason?: string } {
  const resolution = resolveEmbeddingLane(hit);

  if (resolution.lane === null) {
    emitEmbeddingLaneTelementry(packetKey, resolution);
    return {
      gatePass: false,
      reason: `lane_resolution_failed:${resolution.reason}: ${resolution.fallbackChain?.join(' → ')}`,
    };
  }

  return { gatePass: true };
}
