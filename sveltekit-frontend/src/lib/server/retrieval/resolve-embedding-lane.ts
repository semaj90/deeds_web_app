/**
 * Resolve Embedding Lane - Precedence-Based Explicit Lineage
 *
 * The runtime resolver only accepts the canonical 768 semantic lane and the
 * 64-dim routing lane. Legacy 384 lineage is blocked here and must stay in
 * migration-only tooling.
 *
 * Precedence:
 * 1. Explicit embedding_lane field in the search result
 * 2. Vector name from Qdrant collection (768/64 active lanes only)
 * 3. Collection contract (768/64 active lanes only)
 * 4. Native dimension fallback (768 -> semantic_768, 64 -> latent_64)
 * 5. Legacy 384 is blocked and never resolved at runtime
 * 6. UNKNOWN (emit telemetry, gate the candidate)
 */

import { DenseRepresentationName } from '../atlas/contracts/dense-lane-policy';
import { SEMANTIC_REPRESENTATION_ID } from '../embedding/embedding-contract-768.js';

export enum EmbeddingLaneTelemetryReason {
  EXPLICIT_FIELD = 'explicit_field',
  VECTOR_NAME = 'vector_name',
  COLLECTION_CONTRACT = 'collection_contract',
  NATIVE_DIMENSION_FALLBACK = 'native_dimension_fallback',
  LEGACY_DIMENSION_EXPLICIT_ONLY = 'legacy_dimension_explicit_only',
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

const COLLECTION_LANE_REGISTRY: Record<string, DenseRepresentationName> = {
  'codebase_chunks_768': DenseRepresentationName.SEMANTIC_768,
  'codebase_chunks_latent64': DenseRepresentationName.LATENT_64,
  'evidence_items_768': DenseRepresentationName.SEMANTIC_768,
};

const VECTOR_NAME_LANE_REGISTRY: Record<string, DenseRepresentationName> = {
  'dense_768': DenseRepresentationName.SEMANTIC_768,
  'latent_64': DenseRepresentationName.LATENT_64,
  [SEMANTIC_REPRESENTATION_ID]: DenseRepresentationName.SEMANTIC_768,
  'routing_latent64': DenseRepresentationName.LATENT_64,
};

const LEGACY_384_VECTOR_NAMES = new Set(['dense_384', 'semantic_384']);
const LEGACY_384_COLLECTIONS = new Set(['codebase_chunks_384', 'codebase_chunks_384_hybrid', 'evidence_items_384']);

export function resolveEmbeddingLane(
  hit: RawSearchHit
): EmbeddingLaneResolution {
  const fallbackChain: string[] = [];

  if (hit.embedding_lane) {
    fallbackChain.push(`explicit_field=${hit.embedding_lane}`);
    if (hit.embedding_lane === DenseRepresentationName.SEMANTIC_384) {
      return {
        lane: null,
        reason: EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY,
        fallbackChain,
      };
    }
    return {
      lane: hit.embedding_lane,
      reason: EmbeddingLaneTelemetryReason.EXPLICIT_FIELD,
      fallbackChain,
    };
  }
  fallbackChain.push('no_explicit_field');

  if (hit.vector_name && LEGACY_384_VECTOR_NAMES.has(hit.vector_name)) {
    fallbackChain.push(`legacy_vector_name=${hit.vector_name} → blocked`);
    return {
      lane: null,
      reason: EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY,
      fallbackChain,
    };
  }

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

  if (hit.collection && LEGACY_384_COLLECTIONS.has(hit.collection)) {
    fallbackChain.push(`legacy_collection=${hit.collection} → blocked`);
    return {
      lane: null,
      reason: EmbeddingLaneTelemetryReason.LEGACY_DIMENSION_EXPLICIT_ONLY,
      fallbackChain,
    };
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
    fallbackChain.push(`dimension=${dimToCheck} → semantic_768 (fallback)`);
    return {
      lane: DenseRepresentationName.SEMANTIC_768,
      reason: EmbeddingLaneTelemetryReason.NATIVE_DIMENSION_FALLBACK,
      fallbackChain,
    };
  }
  if (dimToCheck === 384) {
    fallbackChain.push(`dimension=${dimToCheck} → blocked legacy lane`);
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

  fallbackChain.push('UNKNOWN — unable to resolve lane');
  return {
    lane: null,
    reason: EmbeddingLaneTelemetryReason.UNKNOWN,
    fallbackChain,
  };
}

export function emitEmbeddingLaneTelementry(
  packetKey: string,
  resolution: EmbeddingLaneResolution
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
