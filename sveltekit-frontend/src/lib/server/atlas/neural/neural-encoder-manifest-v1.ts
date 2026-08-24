import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

/**
 * NE-01 contracts (openspec/changes/parent-atlas-neural-prefill-encoder).
 *
 * These types do not train, load weights, or write latent vectors. They give
 * every later NE-* lane (dataset export, encoder training, latent projection,
 * ACE pre-fill) one typed, checksum-bearing identity so a receipt can never
 * be reinterpreted after the fact. Canonical `semantic_768` ownership is
 * untouched — every schema here only ever *references* it by checksum.
 */

const revision = z.string().min(1);

// ── NeuralEncoderManifestV1 ──────────────────────────────────────────────────

export const NeuralEncoderManifestV1Schema = z.object({
  schema: z.literal('atlas.neural-encoder-manifest.v1'),
  modelRevision: revision,
  datasetRevision: revision,
  normalizationRevision: revision,
  sourceRevision: revision,
  featureRevision: revision,
  projectionRevision: revision,
  inputDimension: z.literal(768),
  hiddenDimensions: z.array(z.number().int().positive()).min(1),
  latentDimension: z.number().int().positive(),
  architecture: z.string().min(1),
  weightChecksums: z.array(sha256HexSchema).min(1),
  trainingReceiptChecksum: sha256HexSchema.nullable(),
  canonicalWritesAllowed: z.literal(false),
  onlineTrainingAllowed: z.literal(false),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type NeuralEncoderManifestV1 = z.infer<typeof NeuralEncoderManifestV1Schema>;

export function buildNeuralEncoderManifestV1(
  input: Omit<
    NeuralEncoderManifestV1,
    'schema' | 'checksumSha256' | 'canonicalWritesAllowed' | 'onlineTrainingAllowed'
  >,
): NeuralEncoderManifestV1 {
  const payload = {
    schema: 'atlas.neural-encoder-manifest.v1' as const,
    ...input,
    weightChecksums: [...new Set(input.weightChecksums)].sort(),
    canonicalWritesAllowed: false as const,
    onlineTrainingAllowed: false as const,
  };
  return NeuralEncoderManifestV1Schema.parse({ ...payload, checksumSha256: canonicalSha256V1(payload) });
}

// ── NeuralPrefillRowV1 ───────────────────────────────────────────────────────

export const NeuralPrefillFeatureClassSchema = z.enum([
  'AST',
  'LEXICAL',
  'DOMAIN',
  'ONTOLOGY',
  'TOPOLOGY',
]);
export type NeuralPrefillFeatureClass = z.infer<typeof NeuralPrefillFeatureClassSchema>;

export const NeuralPrefillRowV1Schema = z.object({
  schema: z.literal('atlas.neural-prefill-row.v1'),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  directoryPath: z.string().min(1),
  /** Ties this row to one semantic_768 vector without inlining raw floats. */
  semanticEmbeddingChecksum: sha256HexSchema,
  featureClassesPresent: z.array(NeuralPrefillFeatureClassSchema).default([]),
  domainClassifications: z.array(z.string().min(1)).default([]),
  ontologyTupleRefs: z.array(z.string().min(1)).default([]),
  topologyRevision: revision.nullable(),
  sourceRevision: revision,
  featureRevision: revision,
  /** NE-10: rerunning the same source revision must reproduce this checksum. */
  deterministicRerunChecksum: sha256HexSchema.nullable(),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type NeuralPrefillRowV1 = z.infer<typeof NeuralPrefillRowV1Schema>;

export function buildNeuralPrefillRowV1(
  input: Omit<NeuralPrefillRowV1, 'schema' | 'checksumSha256'>,
): NeuralPrefillRowV1 {
  const payload = {
    schema: 'atlas.neural-prefill-row.v1' as const,
    ...input,
    featureClassesPresent: [...new Set(input.featureClassesPresent)].sort(),
    domainClassifications: [...new Set(input.domainClassifications)].sort(),
    ontologyTupleRefs: [...new Set(input.ontologyTupleRefs)].sort(),
  };
  return NeuralPrefillRowV1Schema.parse({ ...payload, checksumSha256: canonicalSha256V1(payload) });
}

// ── EncoderEvaluationReceiptV1 ───────────────────────────────────────────────

export const EncoderExclusionReasonSchema = z.enum([
  'MISSING_VECTOR',
  'DUPLICATE_IDENTITY',
  'STALE_REVISION',
  'INVALID_ONTOLOGY',
]);

export const EncoderEvaluationReceiptV1Schema = z.object({
  schema: z.literal('atlas.encoder-evaluation-receipt.v1'),
  manifestChecksum: sha256HexSchema,
  /** NE-12: split must be by source/workspace revision, never row-random. */
  datasetSplitRevision: revision,
  sampleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  exclusionReasons: z.array(EncoderExclusionReasonSchema).default([]),
  reconstructionLoss: z.number().finite().nonnegative().nullable(),
  retrievalPreservationRecallAtK: z.number().min(0).max(1).nullable(),
  recallK: z.number().int().positive().nullable(),
  ndcg: z.number().min(0).max(1).nullable(),
  device: z.string().min(1),
  cpuRtxParityWithinTolerance: z.boolean().nullable(),
  /** Promotion is a separate, explicit gate (NE-34) — never implied by an eval receipt. */
  promotionEligible: z.literal(false),
  reasonCodes: z.array(z.string().min(1)).min(1),
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type EncoderEvaluationReceiptV1 = z.infer<typeof EncoderEvaluationReceiptV1Schema>;

export function buildEncoderEvaluationReceiptV1(
  input: Omit<EncoderEvaluationReceiptV1, 'schema' | 'checksumSha256' | 'promotionEligible'>,
): EncoderEvaluationReceiptV1 {
  const payload = {
    schema: 'atlas.encoder-evaluation-receipt.v1' as const,
    ...input,
    promotionEligible: false as const,
  };
  return EncoderEvaluationReceiptV1Schema.parse({ ...payload, checksumSha256: canonicalSha256V1(payload) });
}

// ── LatentProjectionReceiptV1 ────────────────────────────────────────────────

export const LatentTruncationModeSchema = z.enum([
  'NONE',
  'MRL_PREFIX_TRUNCATION',
  'LEGACY_DIRECT_SLICE',
  'LEARNED_AUTOENCODER',
]);
export type LatentTruncationMode = z.infer<typeof LatentTruncationModeSchema>;

export const LatentProjectionReceiptV1Schema = z.object({
  schema: z.literal('atlas.latent-projection-receipt.v1'),
  packetKey: z.string().min(1),
  /** Must derive from an already-indexed semantic_768 checksum, never a speculative one. */
  sourceEmbeddingChecksum: sha256HexSchema,
  manifestChecksum: sha256HexSchema,
  latentDimension: z.number().int().positive(),
  truncationMode: LatentTruncationModeSchema,
  postTruncationRenormalized: z.boolean(),
  overwritesCanonicalSemantic768: z.literal(false),
  qdrantCollection: z.string().min(1).nullable(),
  valkeyNamespace: z.string().min(1).nullable(),
  projectionRevision: revision,
  producerRevision: revision,
  checksumSha256: sha256HexSchema,
}).strict();

export type LatentProjectionReceiptV1 = z.infer<typeof LatentProjectionReceiptV1Schema>;

export function buildLatentProjectionReceiptV1(
  input: Omit<LatentProjectionReceiptV1, 'schema' | 'checksumSha256' | 'overwritesCanonicalSemantic768'>,
): LatentProjectionReceiptV1 {
  const payload = {
    schema: 'atlas.latent-projection-receipt.v1' as const,
    ...input,
    overwritesCanonicalSemantic768: false as const,
  };
  return LatentProjectionReceiptV1Schema.parse({ ...payload, checksumSha256: canonicalSha256V1(payload) });
}
