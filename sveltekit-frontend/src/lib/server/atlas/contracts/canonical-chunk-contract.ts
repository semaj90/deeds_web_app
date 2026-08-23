import { z } from 'zod';
import {
  ATLAS_CANONICAL_SEMANTIC_DIMENSION,
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
  ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
} from '../retrieval/qdrant-semantic-projection.js';

// The canonical persisted/searched representation is native semantic_768.
// MRL prefixes remain separately named derived/reference lanes.
export const CANONICAL_EMBEDDING_DIMENSION = ATLAS_CANONICAL_SEMANTIC_DIMENSION;

export const CanonicalRepresentationNameSchema = z.enum([
  ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
  'semantic_512',
  'semantic_128',
  'latent_64',
  'lexical_v1',
  'learned_sparse_v1',
  'reranker_features_v1',
]);

export type CanonicalRepresentationName = z.infer<typeof CanonicalRepresentationNameSchema>;

export const RepresentationStatusSchema = z.enum([
  'ACTIVE',
  'EXPERIMENTAL',
  'REFERENCE_ONLY',
  'SUPERSEDED',
]);

export type RepresentationStatus = z.infer<typeof RepresentationStatusSchema>;

export type CanonicalRepresentationRegistryEntry = {
  persistedName: CanonicalRepresentationName;
  dimension: number | null;
  status: RepresentationStatus;
  aliases: readonly string[];
};

export const CANONICAL_REPRESENTATIONS = {
  semantic_768: {
    persistedName: ATLAS_CANONICAL_SEMANTIC_REPRESENTATION,
    dimension: ATLAS_EMBEDDINGGEMMA_NATIVE_DIMENSION,
    status: 'ACTIVE',
    aliases: ['semantic768', 'dense_768', 'dense768'],
  },
  semantic_512: {
    persistedName: 'semantic_512',
    dimension: 512,
    status: 'REFERENCE_ONLY',
    aliases: ['semantic512', 'dense_512', 'dense512'],
  },
  semantic_128: {
    persistedName: 'semantic_128',
    dimension: 128,
    status: 'EXPERIMENTAL',
    aliases: [],
  },
  latent_64: {
    persistedName: 'latent_64',
    dimension: 64,
    status: 'REFERENCE_ONLY',
    aliases: ['latent64'],
  },
  lexical_v1: {
    persistedName: 'lexical_v1',
    dimension: null,
    status: 'REFERENCE_ONLY',
    aliases: [],
  },
  learned_sparse_v1: {
    persistedName: 'learned_sparse_v1',
    dimension: null,
    status: 'REFERENCE_ONLY',
    aliases: [],
  },
  reranker_features_v1: {
    persistedName: 'reranker_features_v1',
    dimension: null,
    status: 'REFERENCE_ONLY',
    aliases: [],
  },
} as const satisfies Record<CanonicalRepresentationName, CanonicalRepresentationRegistryEntry>;

const REPRESENTATION_ALIAS_LOOKUP: Record<string, CanonicalRepresentationName> = Object.fromEntries(
  Object.values(CANONICAL_REPRESENTATIONS).flatMap((entry) =>
    entry.aliases.map((alias) => [alias, entry.persistedName] as const)
  ),
);

export function normalizeRepresentationName(value: string): CanonicalRepresentationName {
  const trimmed = value.trim();
  if (trimmed in CANONICAL_REPRESENTATIONS) {
    return trimmed as CanonicalRepresentationName;
  }

  const normalized = REPRESENTATION_ALIAS_LOOKUP[trimmed];
  if (normalized) {
    return normalized;
  }

  if (trimmed === 'semantic_384' || trimmed === 'dense_384' || trimmed === 'dense_384_custom') {
    throw new Error(`Representation ${trimmed} is reference-only and cannot be normalized to a canonical representation`);
  }

  throw new Error(`Unknown representation name: ${value}`);
}

export const CanonicalValidationStateSchema = z.enum([
  'PENDING',
  'VALIDATED',
  'DEGRADED',
  'SUPERSEDED',
  'FAILED',
]);

export type CanonicalValidationState = z.infer<typeof CanonicalValidationStateSchema>;

export const CanonicalChunkIdentitySchema = z
  .object({
    chunkId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    workspaceRevision: z.string().min(1),
    sourceRef: z.string().min(1),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export type CanonicalChunkIdentity = z.infer<typeof CanonicalChunkIdentitySchema>;

export const CanonicalChunkSchema = CanonicalChunkIdentitySchema.extend({
  content: z.string().min(1),
  language: z.string().min(1).nullable().default(null),
  artifactKind: z.string().min(1),
  domainClasses: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type CanonicalChunk = z.infer<typeof CanonicalChunkSchema>;

export const RepresentationDescriptorSchema = z
  .object({
    chunkId: z.string().uuid(),
    name: CanonicalRepresentationNameSchema,
    producer: z.string().min(1),
    modelName: z.string().min(1).nullable().default(null),
    modelRevision: z.string().min(1).nullable().default(null),
    representationRevision: z.string().min(1),
    sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    workspaceRevision: z.string().min(1),
    dimensionality: z.number().int().positive().nullable().default(null),
    validationState: CanonicalValidationStateSchema,
  })
  .strict();

export type RepresentationDescriptor = z.infer<typeof RepresentationDescriptorSchema>;

export const DenseVectorSchema = z
  .object({
    name: CanonicalRepresentationNameSchema,
    values: z.array(z.number().finite()),
    representationRevision: z.string().min(1),
    modelName: z.string().min(1).nullable().default(null),
    modelRevision: z.string().min(1).nullable().default(null),
  })
  .strict();

export type DenseVector = z.infer<typeof DenseVectorSchema>;

export const SparseVectorSchema = z
  .object({
    name: z.string().min(1),
    indices: z.array(z.number().int().nonnegative()),
    values: z.array(z.number().finite()),
    vocabularyRevision: z.string().min(1),
    weightingRevision: z.string().min(1),
  })
  .strict();

export type SparseVector = z.infer<typeof SparseVectorSchema>;

export const ProjectionRunSchema = z
  .object({
    runId: z.string().uuid(),
    projectionName: z.string().min(1),
    sourceWorkspaceRevision: z.string().min(1),
    representationRevision: z.string().min(1),
    expectedRows: z.number().int().nonnegative(),
    scannedRows: z.number().int().nonnegative(),
    encodedRows: z.number().int().nonnegative(),
    writtenRows: z.number().int().nonnegative(),
    readbackRows: z.number().int().nonnegative(),
    failedRows: z.number().int().nonnegative(),
    state: z.enum(['PLANNED', 'RUNNING', 'VALIDATING', 'PROVEN', 'FAILED', 'ROLLED_BACK']),
  })
  .strict();

export type ProjectionRun = z.infer<typeof ProjectionRunSchema>;

export const ProjectionBatchSchema = z
  .object({
    runId: z.string().uuid(),
    batchNumber: z.number().int().nonnegative(),
    firstChunkId: z.string().uuid(),
    lastChunkId: z.string().uuid(),
    expectedCount: z.number().int().nonnegative(),
    items: z.array(z.unknown()),
  })
  .strict();

export type ProjectionBatch = z.infer<typeof ProjectionBatchSchema>;

export const PackedEnvelopeSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    messageType: z.string().min(1),
    producerRevision: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();

export type PackedEnvelope = z.infer<typeof PackedEnvelopeSchema>;

export const DependencyReadinessSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(['READY', 'DEGRADED', 'BLOCKED']),
    latencyMs: z.number().int().nonnegative().optional(),
    reason: z.string().optional(),
  })
  .strict();

export const ServiceReadinessSchema = z
  .object({
    service: z.string().min(1),
    status: z.enum(['READY', 'DEGRADED', 'BLOCKED']),
    revision: z.string().min(1),
    dependencies: z.array(DependencyReadinessSchema).default([]),
    capabilities: z.record(z.string(), z.boolean()).default({}),
  })
  .strict();

export type ServiceReadiness = z.infer<typeof ServiceReadinessSchema>;

export function validateDenseVector(values: readonly number[], expectedDimension = CANONICAL_EMBEDDING_DIMENSION): void {
  if (values.length !== expectedDimension) {
    throw new Error(`Dimension mismatch: expected ${expectedDimension}, got ${values.length}`);
  }

  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) {
      throw new Error(`Non-finite vector value at index ${index}`);
    }
  }
}

export function validateSparseVector(indices: readonly number[], values: readonly number[]): void {
  if (indices.length !== values.length) {
    throw new Error(`Sparse indices and values differ in length: ${indices.length} vs ${values.length}`);
  }

  let previous = -1;
  for (let index = 0; index < indices.length; index += 1) {
    const tokenId = indices[index];
    const weight = values[index];
    if (!Number.isSafeInteger(tokenId) || tokenId < 0) {
      throw new Error(`Invalid sparse token ID ${tokenId} at index ${index}`);
    }
    if (tokenId <= previous) {
      throw new Error(`Sparse indices must be sorted and unique; token ${tokenId} at index ${index}`);
    }
    if (!Number.isFinite(weight)) {
      throw new Error(`Invalid sparse weight at index ${index}`);
    }
    previous = tokenId;
  }
}
