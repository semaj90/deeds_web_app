/**
 * Canonical ingestion packet schema with embedding contract enforcement.
 *
 * Authority flow:
 * PostgreSQL + SeaweedFS (canonical) → derived mirrors (Qdrant, Redis, Neo4j)
 *
 * Embedding contract:
 * - Semantic native: 768-dim (mandatory, canonical)
 * - Semantic retrieval: 768 or 256-dim MRL (post-evaluation)
 * - Latent routing: 64-dim autoencoder (clustering/SOM only, never retrieval)
 *
 * No agent in the inner loop. Validation at boundaries only.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// CHUNK IDENTITY (deterministic, no agents)
// ──────────────────────────────────────────────────────────────────────────

export const ChunkIdentitySchema = z.object({
  chunkId: z.string().uuid('Chunk must have stable UUID identity'),
  ordinal: z.number().int().nonnegative('Chunk ordinal must be >= 0'),
  text: z.string().min(1, 'Chunk text cannot be empty'),
  tokenCount: z.number().int().positive('Token count must be positive'),
  startOffset: z.number().int().nonnegative('Start offset must be >= 0'),
  endOffset: z.number().int().positive('End offset must be positive'),
  structuralPath: z.array(z.string()).default([]).describe('e.g., ["section", "subsection", "paragraph"]'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Content hash must be SHA-256 hex').describe('SHA-256 of chunk text'),
});

export type ChunkIdentity = z.infer<typeof ChunkIdentitySchema>;

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING CONTRACT (no truncation without proof)
// ──────────────────────────────────────────────────────────────────────────

export const EmbeddingContractSchema = z.object({
  modelId: z.string().min(1, 'Model ID required').describe('e.g., "embeddinggemma"'),
  modelRevision: z.string().min(1, 'Model revision required').describe('e.g., "20260720"'),

  // NATIVE DIMENSION (what the model produces)
  nativeDimensions: z.number().int().positive().describe('Model native output, e.g., 768 for EmbeddingGemma'),

  // STORED DIMENSION (what we persist)
  storedDimensions: z.number().int().positive().describe('Canonical: 768, 512, 256, or 128. NO 384.'),

  // TRANSFORMATION (if different from native)
  normalized: z.boolean().default(true).describe('L2 normalization applied'),
  pooling: z.string().default('mean').describe('Pooling method: mean, max, cls'),

  // PROJECTION (if stored != native)
  projectionVersion: z.string().nullable().default(null).describe('Matryoshka projection version if truncated. NULL for native.'),

  // VALIDATION
  contractVersion: z.string().default('1.0').describe('Schema version for evolution'),
});

export type EmbeddingContract = z.infer<typeof EmbeddingContractSchema>;

// Hard-coded canonical embedding contracts
export const CANONICAL_EMBEDDING_CONTRACTS = {
  // Tier 1: Native (mandatory for Phase 106)
  NATIVE_768: {
    modelId: 'embeddinggemma',
    modelRevision: '20260720',
    nativeDimensions: 768,
    storedDimensions: 768,
    normalized: true,
    pooling: 'mean',
    projectionVersion: null,
    contractVersion: '1.0',
  } as const satisfies EmbeddingContract,

  // Tier 2: Matryoshka 256 (Phase 107+, requires evaluation pass)
  MRL_256: {
    modelId: 'embeddinggemma',
    modelRevision: '20260720',
    nativeDimensions: 768,
    storedDimensions: 256,
    normalized: true,
    pooling: 'mean',
    projectionVersion: 'mrl-256-v1',
    contractVersion: '1.0',
  } as const satisfies EmbeddingContract,

  // Tier 3: Autoencoder latent (routing/clustering only)
  LATENT_64: {
    modelId: 'autoencoder-768-to-64',
    modelRevision: '20260801',
    nativeDimensions: 64,
    storedDimensions: 64,
    normalized: false, // AE latent is not normalized
    pooling: 'none',
    projectionVersion: 'ae-v1',
    contractVersion: '1.0',
  } as const satisfies EmbeddingContract,
};

// Forbidden dimensions (reject at validation boundary)
const FORBIDDEN_DIMENSIONS = new Set([384]); // Ollama truncation is undocumented

export const validateEmbeddingContract = (contract: EmbeddingContract): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (FORBIDDEN_DIMENSIONS.has(contract.storedDimensions)) {
    errors.push(`Stored dimension ${contract.storedDimensions} is not an approved contract. Use 768 (native), 256 (MRL), or 64 (autoencoder latent).`);
  }

  if (contract.storedDimensions !== contract.nativeDimensions && !contract.projectionVersion) {
    errors.push(`Dimension reduction from ${contract.nativeDimensions} to ${contract.storedDimensions} requires projectionVersion (truncation/MRL method).`);
  }

  if (contract.nativeDimensions !== 768 && contract.modelId === 'embeddinggemma') {
    errors.push(`EmbeddingGemma native dimension is 768, not ${contract.nativeDimensions}.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ──────────────────────────────────────────────────────────────────────────
// CLASSIFICATION (lightweight, no LLM in loop)
// ──────────────────────────────────────────────────────────────────────────

export const ClassificationSchema = z.object({
  domainClass: z.string().min(1, 'Domain class required').describe('e.g., "legal", "code", "documentation"'),
  confidence: z.number().min(0).max(1).describe('0.0 to 1.0 from logistic regression + embedding similarity'),
  classifierVersion: z.string().describe('e.g., "xgboost-v2-20260720"'),
  classifierComponents: z.object({
    lexical: z.number().min(0).max(1).default(0),
    embedding: z.number().min(0).max(1).default(0),
    pathRule: z.number().min(0).max(1).default(0),
  }).optional().describe('Breakdown for transparency'),
});

export type Classification = z.infer<typeof ClassificationSchema>;

// Classification decision gates (no agents unless < 0.55)
export const classificationDecisionGate = (confidence: number): 'auto-accept' | 'provisional' | 'review' => {
  if (confidence >= 0.80) return 'auto-accept';
  if (confidence >= 0.55) return 'provisional';
  return 'review'; // Mastra review task
};

// ──────────────────────────────────────────────────────────────────────────
// CANONICAL INGEST PACKET (before embedding)
// ──────────────────────────────────────────────────────────────────────────

export const IngestPacketSchema = z.object({
  // Identity
  packetKey: z.string().uuid('Packet must have stable UUID identity'),
  sourceRef: z.string().min(1, 'Source reference required').describe('e.g., "src/lib/server/db.ts", "document:123"'),
  documentId: z.string().uuid('Document must have UUID'),
  documentVersion: z.string().describe('e.g., git commit hash or timestamp'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Content hash must be SHA-256 hex').describe('Document-level SHA-256'),

  // Chunk structure
  chunk: ChunkIdentitySchema,

  // Classification (deterministic, pre-embedding)
  classification: ClassificationSchema,

  // Embedding contract (validated at boundary)
  embeddingContract: EmbeddingContractSchema,

  // Metadata (optional, preserved through pipeline)
  metadata: z.record(z.unknown()).optional().describe('Arbitrary metadata: title, labels, tags, etc.'),
});

export type IngestPacket = z.infer<typeof IngestPacketSchema>;

// ──────────────────────────────────────────────────────────────────────────
// ENRICHED PACKET (after embedding worker processes)
// ──────────────────────────────────────────────────────────────────────────

export const EnrichedPacketSchema = IngestPacketSchema.extend({
  // Embedding (768-dim canonical, validated)
  embeddingNative: z.array(z.number()).describe('768-dim L2-normalized vector from EmbeddingGemma'),

  // Optional: Matryoshka projection (after Phase 106 validation)
  embeddingProjected: z.array(z.number()).optional().describe('256-dim MRL vector (optional, post-evaluation)'),

  // Optional: Autoencoder latent (routing/clustering only)
  embeddingLatent: z.array(z.number()).optional().describe('64-dim autoencoder output (routing/SOM/visualization only)'),

  // Embedding metadata
  embeddingModel: z.string().describe('Resolved model ID + revision'),
  embeddingTimestamp: z.string().datetime().describe('ISO 8601 timestamp when embedding was generated'),
  embeddingIdempotencyKey: z.string().describe('SHA-256 of (model+revision+dim+contentHash+version) for deduplication'),
});

export type EnrichedPacket = z.infer<typeof EnrichedPacketSchema>;

// ──────────────────────────────────────────────────────────────────────────
// PROMOTION GATE (validation before writing to Postgres/Qdrant)
// ──────────────────────────────────────────────────────────────────────────

export const validateEnrichedPacketForPromotion = (packet: EnrichedPacket): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Embedding dimension validation
  if (!packet.embeddingNative || packet.embeddingNative.length !== 768) {
    errors.push(`Native embedding must be 768-dim L2-normalized, got ${packet.embeddingNative?.length ?? 0}-dim.`);
  }

  // L2 norm check (within tolerance)
  if (packet.embeddingNative) {
    const norm = Math.sqrt(packet.embeddingNative.reduce((sum, x) => sum + x * x, 0));
    if (Math.abs(norm - 1.0) > 0.01) {
      errors.push(`Embedding is not properly L2-normalized (norm = ${norm}, expected 1.0 ± 0.01).`);
    }
  }

  // Projected embedding (if present) must match contract
  if (packet.embeddingProjected) {
    if (packet.embeddingProjected.length !== 256) {
      errors.push(`Projected embedding must be 256-dim, got ${packet.embeddingProjected.length}-dim.`);
    }
    if (!packet.embeddingContract.projectionVersion) {
      errors.push(`Projected embedding requires projectionVersion in contract.`);
    }
  }

  // Latent embedding (if present) must NOT be used for retrieval
  if (packet.embeddingLatent) {
    if (packet.embeddingLatent.length !== 64) {
      errors.push(`Latent embedding must be 64-dim, got ${packet.embeddingLatent.length}-dim.`);
    }
    // Note: latent is for SOM/clustering only, validation happens at retrieval gate
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// ──────────────────────────────────────────────────────────────────────────
// WORKER DISPATCH (Mastra control plane, not LLM in loop)
// ──────────────────────────────────────────────────────────────────────────

export const IngestionWorkerDispatchSchema = z.object({
  jobType: z.enum(['embed_chunk', 'classify_domain', 'project_mrl', 'encode_latent', 'review_classification']),
  packet: IngestPacketSchema,
  priority: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(3),
});

export type IngestionWorkerDispatch = z.infer<typeof IngestionWorkerDispatchSchema>;

// Worker job handlers (no Mastra agent here, just deterministic workers)
export const workerDispatchRules = {
  embed_chunk: {
    description: 'Call embedding sidecar with 768-dim canonical contract',
    handler: 'embedding-worker.ts',
    timeout: 30000,
  },
  classify_domain: {
    description: 'Lightweight logistic regression + embedding similarity (no LLM)',
    handler: 'classifier-worker.ts',
    timeout: 5000,
  },
  project_mrl: {
    description: 'Optional Matryoshka projection (Phase 107+, after validation)',
    handler: 'mrl-projection-worker.ts',
    timeout: 5000,
  },
  encode_latent: {
    description: 'Autoencoder 768→64 (routing/SOM only, async offline)',
    handler: 'autoencoder-worker.ts',
    timeout: 10000,
  },
  review_classification: {
    description: 'Mastra review task for 0.55 <= confidence < 0.80',
    handler: 'classification-reviewer.ts',
    timeout: 300000, // 5 min human review window
  },
};

export const buildIngestionWorkerDispatch = (
  packet: IngestPacket,
  classificationDecision: 'auto-accept' | 'provisional' | 'review'
): IngestionWorkerDispatch[] => {
  const jobs: IngestionWorkerDispatch[] = [];

  // Always: embed chunk (768-dim canonical)
  jobs.push({
    jobType: 'embed_chunk',
    packet,
    priority: 'high',
  });

  // Optional: project to 256-dim MRL (post-Phase 106 evaluation)
  if (packet.embeddingContract.storedDimensions === 256) {
    jobs.push({
      jobType: 'project_mrl',
      packet,
      priority: 'normal',
    });
  }

  // Optional: encode to 64-dim autoencoder (routing/clustering)
  if (process.env.ENABLE_AUTOENCODER_LATENT === 'true') {
    jobs.push({
      jobType: 'encode_latent',
      packet,
      priority: 'low', // async, non-blocking
    });
  }

  // Classification decision: auto-accept, provisional queue, or review task
  if (classificationDecision === 'review') {
    jobs.push({
      jobType: 'review_classification',
      packet,
      priority: 'high', // human review has priority
    });
  }

  return jobs;
};
