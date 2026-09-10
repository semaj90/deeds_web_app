/**
 * Canonical ingestion packet schema with embedding contract enforcement.
 *
 * Authority flow:
 * PostgreSQL + SeaweedFS (canonical) → derived mirrors (Qdrant, Redis, Neo4j)
 *
 * Embedding contract:
 * - Semantic native: 768-dim EmbeddingGemma (mandatory canonical authority)
 * - Optional EmbeddingGemma MRL reference projections: 512 / 256 / 128 only
 * - 384 is historical Atlas direct-slice data, never an EmbeddingGemma MRL target
 * - Latent routing: 64-dim autoencoder (routing/clustering only, never semantic retrieval)
 */

import { z } from 'zod';
import { CANONICAL_EMBEDDING_DIMENSION } from '$lib/server/atlas/contracts/canonical-chunk-contract.js';
import { EMBEDDINGGEMMA_MRL_DIMENSIONS } from '$lib/server/embedding/embedding-contract-768.js';

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

export const EmbeddingContractSchema = z.object({
  modelId: z.string().min(1, 'Model ID required').describe('e.g., "embeddinggemma"'),
  modelRevision: z.string().min(1, 'Model revision required').describe('e.g., "20260720"'),
  nativeDimensions: z.number().int().positive().describe('Model-native output; EmbeddingGemma is 768'),
  storedDimensions: z.number().int().positive().describe('Persisted representation width; canonical EmbeddingGemma is 768, MRL references are 512/256/128'),
  normalized: z.boolean().default(true).describe('L2 normalization applied'),
  pooling: z.string().default('mean').describe('Pooling method: mean, max, cls'),
  projectionVersion: z.string().nullable().default(null).describe('Explicit MRL projection revision; NULL for native semantic_768'),
  contractVersion: z.string().default('2.0').describe('Schema version for evolution'),
});

export type EmbeddingContract = z.infer<typeof EmbeddingContractSchema>;

const OFFICIAL_EMBEDDINGGEMMA_MRL_WIDTHS = new Set<number>(EMBEDDINGGEMMA_MRL_DIMENSIONS);

export const CANONICAL_EMBEDDING_CONTRACTS = {
  NATIVE_768: {
    modelId: 'embeddinggemma',
    modelRevision: '20260720',
    nativeDimensions: 768,
    storedDimensions: 768,
    normalized: true,
    pooling: 'mean',
    projectionVersion: null,
    contractVersion: '2.0',
  } as const satisfies EmbeddingContract,
  MRL_512: {
    modelId: 'embeddinggemma',
    modelRevision: '20260720',
    nativeDimensions: 768,
    storedDimensions: 512,
    normalized: true,
    pooling: 'mean',
    projectionVersion: 'embeddinggemma-mrl-512-v1',
    contractVersion: '2.0',
  } as const satisfies EmbeddingContract,
  MRL_256: {
    modelId: 'embeddinggemma',
    modelRevision: '20260720',
    nativeDimensions: 768,
    storedDimensions: 256,
    normalized: true,
    pooling: 'mean',
    projectionVersion: 'embeddinggemma-mrl-256-v1',
    contractVersion: '2.0',
  } as const satisfies EmbeddingContract,
  MRL_128: {
    modelId: 'embeddinggemma',
    modelRevision: '20260720',
    nativeDimensions: 768,
    storedDimensions: 128,
    normalized: true,
    pooling: 'mean',
    projectionVersion: 'embeddinggemma-mrl-128-v1',
    contractVersion: '2.0',
  } as const satisfies EmbeddingContract,
  LATENT_64: {
    modelId: 'autoencoder-768-to-64',
    modelRevision: '20260801',
    nativeDimensions: 64,
    storedDimensions: 64,
    normalized: false,
    pooling: 'none',
    projectionVersion: 'ae-v1',
    contractVersion: '1.0',
  } as const satisfies EmbeddingContract,
};

export const validateEmbeddingContract = (contract: EmbeddingContract): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (contract.storedDimensions > contract.nativeDimensions) {
    errors.push(`Stored dimension ${contract.storedDimensions} cannot exceed native dimension ${contract.nativeDimensions}.`);
  }

  if (contract.modelId === 'embeddinggemma') {
    if (contract.nativeDimensions !== CANONICAL_EMBEDDING_DIMENSION) {
      errors.push(`EmbeddingGemma native dimension is ${CANONICAL_EMBEDDING_DIMENSION}, not ${contract.nativeDimensions}.`);
    }

    if (contract.storedDimensions === 384) {
      errors.push('EmbeddingGemma 384 is not an admitted MRL representation; legacy Atlas 768→384 replay must use an explicit migration-only contract.');
    }

    if (
      contract.storedDimensions !== CANONICAL_EMBEDDING_DIMENSION &&
      !OFFICIAL_EMBEDDINGGEMMA_MRL_WIDTHS.has(contract.storedDimensions)
    ) {
      errors.push(`Unsupported EmbeddingGemma stored dimension ${contract.storedDimensions}; admitted widths are 768/512/256/128.`);
    }

    if (contract.storedDimensions !== contract.nativeDimensions && !contract.projectionVersion) {
      errors.push(`EmbeddingGemma MRL projection ${contract.nativeDimensions}→${contract.storedDimensions} requires projectionVersion.`);
    }

    if (contract.storedDimensions < contract.nativeDimensions && !contract.normalized) {
      errors.push(`EmbeddingGemma MRL projection ${contract.storedDimensions} requires normalized=true.`);
    }
  } else if (contract.storedDimensions !== contract.nativeDimensions && !contract.projectionVersion) {
    errors.push(`Dimension reduction from ${contract.nativeDimensions} to ${contract.storedDimensions} requires projectionVersion.`);
  }

  return { valid: errors.length === 0, errors };
};

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

export const classificationDecisionGate = (confidence: number): 'auto-accept' | 'provisional' | 'review' => {
  if (confidence >= 0.80) return 'auto-accept';
  if (confidence >= 0.55) return 'provisional';
  return 'review';
};

export const IngestPacketSchema = z.object({
  packetKey: z.string().uuid('Packet must have stable UUID identity'),
  sourceRef: z.string().min(1, 'Source reference required').describe('e.g., "src/lib/server/db.ts", "document:123"'),
  documentId: z.string().uuid('Document must have UUID'),
  documentVersion: z.string().describe('e.g., git commit hash or timestamp'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, 'Content hash must be SHA-256 hex').describe('Document-level SHA-256'),
  chunk: ChunkIdentitySchema,
  classification: ClassificationSchema,
  embeddingContract: EmbeddingContractSchema,
  metadata: z.record(z.string(), z.unknown()).optional().describe('Arbitrary metadata: title, labels, tags, etc.'),
});

export type IngestPacket = z.infer<typeof IngestPacketSchema>;

export const EnrichedPacketSchema = IngestPacketSchema.extend({
  embeddingNative: z.array(z.number()).describe('768-dim L2-normalized semantic_768 vector from EmbeddingGemma'),
  embeddingProjected: z.array(z.number()).optional().describe('Optional EmbeddingGemma MRL reference vector: 512, 256, or 128 dimensions'),
  embeddingLatent: z.array(z.number()).optional().describe('64-dim autoencoder output (routing/SOM/visualization only)'),
  embeddingModel: z.string().describe('Resolved model ID + revision'),
  embeddingTimestamp: z.string().datetime().describe('ISO 8601 timestamp when embedding was generated'),
  embeddingIdempotencyKey: z.string().describe('SHA-256 of (model+revision+dim+contentHash+version) for deduplication'),
});

export type EnrichedPacket = z.infer<typeof EnrichedPacketSchema>;

export const validateEnrichedPacketForPromotion = (packet: EnrichedPacket): { valid: boolean; errors: string[] } => {
  const errors: string[] = [...validateEmbeddingContract(packet.embeddingContract).errors];

  if (!packet.embeddingNative || packet.embeddingNative.length !== CANONICAL_EMBEDDING_DIMENSION) {
    errors.push(`Native embedding must be ${CANONICAL_EMBEDDING_DIMENSION}-dim L2-normalized, got ${packet.embeddingNative?.length ?? 0}-dim.`);
  }

  if (packet.embeddingNative) {
    const norm = Math.sqrt(packet.embeddingNative.reduce((sum, x) => sum + x * x, 0));
    if (Math.abs(norm - 1.0) > 0.01) errors.push(`Embedding is not properly L2-normalized (norm = ${norm}, expected 1.0 ± 0.01).`);
  }

  if (packet.embeddingProjected) {
    if (packet.embeddingContract.modelId !== 'embeddinggemma') {
      errors.push('embeddingProjected is reserved for an explicitly declared EmbeddingGemma MRL representation.');
    }
    if (!OFFICIAL_EMBEDDINGGEMMA_MRL_WIDTHS.has(packet.embeddingProjected.length)) {
      errors.push(`Projected EmbeddingGemma vector must be 512, 256, or 128 dimensions; got ${packet.embeddingProjected.length}.`);
    }
    if (packet.embeddingProjected.length !== packet.embeddingContract.storedDimensions) {
      errors.push(`Projected embedding must be ${packet.embeddingContract.storedDimensions}-dim, got ${packet.embeddingProjected.length}-dim.`);
    }
    if (!packet.embeddingContract.projectionVersion) errors.push('Projected embedding requires projectionVersion in contract.');
  }

  if (packet.embeddingLatent && packet.embeddingLatent.length !== 64) {
    errors.push(`Latent embedding must be 64-dim, got ${packet.embeddingLatent.length}-dim.`);
  }

  return { valid: errors.length === 0, errors };
};

export const IngestionWorkerDispatchSchema = z.object({
  jobType: z.enum(['embed_chunk', 'classify_domain', 'project_mrl', 'encode_latent', 'review_classification']),
  packet: IngestPacketSchema,
  priority: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(3),
});

export type IngestionWorkerDispatch = z.infer<typeof IngestionWorkerDispatchSchema>;

export const workerDispatchRules = {
  embed_chunk: {
    description: 'Call embedding runtime with native semantic_768 contract',
    handler: 'embedding-worker.ts',
    timeout: 30000,
  },
  classify_domain: {
    description: 'Lightweight logistic regression + embedding similarity (no LLM)',
    handler: 'classifier-worker.ts',
    timeout: 5000,
  },
  project_mrl: {
    description: 'Optional EmbeddingGemma MRL 512/256/128 reference projection with explicit lineage',
    handler: 'mrl-projection-worker.ts',
    timeout: 5000,
  },
  encode_latent: {
    description: 'Autoencoder 768→64 (routing/SOM only, async offline)',
    handler: 'autoencoder-worker.ts',
    timeout: 10000,
  },
  review_classification: {
    description: 'Mastra review task for confidence < 0.55',
    handler: 'classification-reviewer.ts',
    timeout: 300000,
  },
};

export const buildIngestionWorkerDispatch = (
  packet: IngestPacket,
  classificationDecision: 'auto-accept' | 'provisional' | 'review',
): IngestionWorkerDispatch[] => {
  const contractCheck = validateEmbeddingContract(packet.embeddingContract);
  if (!contractCheck.valid) {
    throw new Error(`INVALID_EMBEDDING_CONTRACT: ${contractCheck.errors.join(' | ')}`);
  }

  const jobs: IngestionWorkerDispatch[] = [{
    jobType: 'embed_chunk',
    packet,
    priority: 'high',
    retryCount: 0,
    maxRetries: 3,
  }];

  if (
    packet.embeddingContract.modelId === 'embeddinggemma' &&
    packet.embeddingContract.storedDimensions < packet.embeddingContract.nativeDimensions
  ) {
    jobs.push({
      jobType: 'project_mrl',
      packet,
      priority: 'normal',
      retryCount: 0,
      maxRetries: 3,
    });
  }

  if (process.env.ENABLE_AUTOENCODER_LATENT === 'true') {
    jobs.push({
      jobType: 'encode_latent',
      packet,
      priority: 'low',
      retryCount: 0,
      maxRetries: 3,
    });
  }

  if (classificationDecision === 'review') {
    jobs.push({
      jobType: 'review_classification',
      packet,
      priority: 'high',
      retryCount: 0,
      maxRetries: 3,
    });
  }

  return jobs;
};
