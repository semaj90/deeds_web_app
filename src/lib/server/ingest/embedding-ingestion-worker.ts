/**
 * Embedding ingestion worker: deterministic, no LLM in loop.
 *
 * Responsibility:
 * - Call embedding sidecar (EmbeddingGemma, 768-dim native)
 * - Validate L2 normalization
 * - Enforce canonical contract
 * - Return enriched packet with embedding metadata
 *
 * Routing: SvelteKit load hooks or gRPC sidecar (not OpenAI API, not Ollama direct)
 * Error handling: Transient failures → retry; permanent → Mastra remediation task
 */

import { z } from 'zod';
import type { IngestPacket, EnrichedPacket } from './ingest-packet-schema';
import {
  EmbeddingContractSchema,
  CANONICAL_EMBEDDING_CONTRACTS,
  validateEmbeddingContract,
  validateEnrichedPacketForPromotion,
} from './ingest-packet-schema';

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING SIDECAR CLIENT (gRPC or HTTP wrapper)
// ──────────────────────────────────────────────────────────────────────────

export interface EmbeddingSidecarClient {
  embed(texts: string[]): Promise<{ vectors: number[][]; model: string; timestamp: string }>;
  health(): Promise<{ ok: boolean; dimension: number; normalized: boolean }>;
}

/**
 * Factory for embedding sidecar client.
 * Supports both gRPC and HTTP fallback.
 */
export const createEmbeddingSidecarClient = (): EmbeddingSidecarClient => {
  const SIDECAR_URL = process.env.EMBEDDING_SIDECAR_URL || 'http://127.0.0.1:50051';
  const USE_GRPC = process.env.EMBEDDING_SIDECAR_GRPC === 'true';

  return {
    async embed(texts: string[]) {
      // TODO: Implement gRPC client if USE_GRPC === true
      // For now, fallback to HTTP endpoint (Ollama or embedding-server wrapper)

      const response = await fetch(`${SIDECAR_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts,
          model: 'embeddinggemma',
          contract: 'native-768-l2',
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Embedding sidecar failed: ${response.status} ${await response.text()}`);
      }

      return response.json() as Promise<{ vectors: number[][]; model: string; timestamp: string }>;
    },

    async health() {
      const response = await fetch(`${SIDECAR_URL}/health`);
      if (!response.ok) throw new Error(`Sidecar health check failed`);
      return response.json() as Promise<{ ok: boolean; dimension: number; normalized: boolean }>;
    },
  };
};

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING VALIDATION & L2 NORMALIZATION
// ──────────────────────────────────────────────────────────────────────────

/**
 * Validate embedding is 768-dim and L2-normalized.
 * Tolerance: norm = 1.0 ± 0.01 (allows small floating-point error)
 */
export const validateEmbedding768 = (
  embedding: number[],
  tolerance = 0.01
): { valid: boolean; error?: string; norm?: number } => {
  if (!Array.isArray(embedding)) {
    return { valid: false, error: 'Embedding is not an array' };
  }

  if (embedding.length !== 768) {
    return { valid: false, error: `Expected 768-dim, got ${embedding.length}-dim` };
  }

  // Check L2 norm
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  if (Math.isNaN(norm) || Math.isInfinite(norm)) {
    return { valid: false, error: `Invalid norm: ${norm}` };
  }

  if (Math.abs(norm - 1.0) > tolerance) {
    return {
      valid: false,
      error: `Not L2-normalized (norm = ${norm.toFixed(4)}, expected 1.0 ± ${tolerance})`,
      norm,
    };
  }

  return { valid: true, norm };
};

/**
 * Ensure L2 normalization. If not normalized, apply it.
 * Only use if sidecar fails to normalize.
 */
export const ensureL2Normalization = (embedding: number[]): number[] => {
  const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) throw new Error('Cannot normalize zero vector');
  return embedding.map(x => x / norm);
};

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING IDEMPOTENCY KEY (deduplication)
// ──────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';

/**
 * Generate deterministic idempotency key for an embedding request.
 * Same input → same key → safe to retry or deduplicate.
 */
export const generateEmbeddingIdempotencyKey = (input: {
  model: string;
  modelRevision: string;
  dimension: number;
  contentHash: string;
  preprocessingVersion: string;
}): string => {
  const key = `${input.model}:${input.modelRevision}:${input.dimension}:${input.contentHash}:${input.preprocessingVersion}`;
  return crypto.createHash('sha256').update(key).digest('hex');
};

// ──────────────────────────────────────────────────────────────────────────
// WORKER MAIN LOOP: EMBED PACKET
// ──────────────────────────────────────────────────────────────────────────

export interface EmbedPacketResult {
  success: boolean;
  enrichedPacket?: EnrichedPacket;
  error?: string;
  errorType?: 'transient' | 'permanent';
  retryable?: boolean;
}

/**
 * Embed a single ingest packet.
 * Returns enriched packet with 768-dim canonical embedding or error.
 */
export const embedPacket = async (
  packet: IngestPacket,
  sidecar: EmbeddingSidecarClient
): Promise<EmbedPacketResult> => {
  try {
    // Validate embedding contract at boundary
    const contractValidation = validateEmbeddingContract(packet.embeddingContract);
    if (!contractValidation.valid) {
      return {
        success: false,
        error: `Invalid embedding contract: ${contractValidation.errors.join(', ')}`,
        errorType: 'permanent',
        retryable: false,
      };
    }

    // Call embedding sidecar
    let response;
    try {
      response = await sidecar.embed([packet.chunk.text]);
    } catch (err) {
      return {
        success: false,
        error: `Sidecar call failed: ${err instanceof Error ? err.message : String(err)}`,
        errorType: 'transient',
        retryable: true,
      };
    }

    if (!response.vectors || response.vectors.length === 0) {
      return {
        success: false,
        error: 'Sidecar returned empty embedding',
        errorType: 'permanent',
        retryable: false,
      };
    }

    const embedding = response.vectors[0];

    // Validate embedding dimension and normalization
    const validation = validateEmbedding768(embedding);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error || 'Embedding validation failed',
        errorType: 'permanent',
        retryable: false,
      };
    }

    // Generate idempotency key
    const idempotencyKey = generateEmbeddingIdempotencyKey({
      model: packet.embeddingContract.modelId,
      modelRevision: packet.embeddingContract.modelRevision,
      dimension: 768,
      contentHash: packet.chunk.contentHash,
      preprocessingVersion: '1',
    });

    // Build enriched packet
    const enrichedPacket: EnrichedPacket = {
      ...packet,
      embeddingNative: embedding,
      embeddingModel: `${packet.embeddingContract.modelId}/${packet.embeddingContract.modelRevision}`,
      embeddingTimestamp: new Date().toISOString(),
      embeddingIdempotencyKey: idempotencyKey,
    };

    // Final validation gate (before promotion to Postgres)
    const promotionValidation = validateEnrichedPacketForPromotion(enrichedPacket);
    if (!promotionValidation.valid) {
      return {
        success: false,
        error: `Promotion validation failed: ${promotionValidation.errors.join(', ')}`,
        errorType: 'permanent',
        retryable: false,
      };
    }

    return {
      success: true,
      enrichedPacket,
    };
  } catch (err) {
    return {
      success: false,
      error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      errorType: 'permanent',
      retryable: false,
    };
  }
};

// ──────────────────────────────────────────────────────────────────────────
// BATCH EMBEDDING (Mastra worker dispatch)
// ──────────────────────────────────────────────────────────────────────────

export interface BatchEmbedResult {
  total: number;
  succeeded: number;
  failed: number;
  transient: number;
  permanent: number;
  results: EmbedPacketResult[];
}

/**
 * Embed batch of packets (used by Mastra worker pool).
 * Non-blocking: transient errors retry, permanent errors create Mastra remediation tasks.
 */
export const embedBatch = async (
  packets: IngestPacket[],
  sidecar: EmbeddingSidecarClient
): Promise<BatchEmbedResult> => {
  const results = await Promise.all(packets.map(p => embedPacket(p, sidecar)));

  const transient = results.filter(r => r.errorType === 'transient').length;
  const permanent = results.filter(r => r.errorType === 'permanent').length;
  const succeeded = results.filter(r => r.success).length;

  return {
    total: packets.length,
    succeeded,
    failed: packets.length - succeeded,
    transient,
    permanent,
    results,
  };
};

// ──────────────────────────────────────────────────────────────────────────
// MASTRA INTEGRATION (control plane, not in loop)
// ──────────────────────────────────────────────────────────────────────────

export interface MastraRemediationTask {
  taskType: 'retry_embed' | 'review_embedding' | 'alternate_parser' | 'human_approval';
  packetKey: string;
  reason: string;
  evidence: unknown;
  priority: 'critical' | 'high' | 'normal' | 'low';
}

/**
 * Create Mastra remediation task for permanent embedding failures.
 * (Mastra owns this, not the embedding worker)
 */
export const createRemediationTask = (result: EmbedPacketResult, packet: IngestPacket): MastraRemediationTask | null => {
  if (result.success || result.errorType !== 'permanent') return null;

  return {
    taskType: 'review_embedding',
    packetKey: packet.packetKey,
    reason: result.error || 'Embedding failed permanently',
    evidence: {
      errorType: result.errorType,
      contentHash: packet.chunk.contentHash,
      chunkLength: packet.chunk.text.length,
      tokenCount: packet.chunk.tokenCount,
    },
    priority: 'high',
  };
};
