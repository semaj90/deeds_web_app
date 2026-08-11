import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  SEMANTIC_REPRESENTATION_ID,
  SEMANTIC_DIMENSION,
} from '../../embedding/embedding-contract-768.js';

export const LATENT_KINDS = ['DETERMINISTIC_AE', 'LOW_RANK', 'VAE_RESEARCH'] as const;
export type LatentKind = (typeof LATENT_KINDS)[number];

export const FIDELITIES = ['FP32_REFERENCE', 'FP16_HOT', 'INT8_WARM', 'INT4_COLD'] as const;
export type Fidelity = (typeof FIDELITIES)[number];

export const LowRankApproximationMethodSchema = z.enum([
  'SAMPLED_LOW_RANK',
  'RANDOMIZED_SVD',
  'SKETCH',
  'EWIN_TANG',
]);
export type LowRankApproximationMethod = z.infer<typeof LowRankApproximationMethodSchema>;

export const LatentRepresentationManifestSchema = z
  .object({
    representationId: z.string().min(1),
    representationRevision: z.string().min(1),
    sourceRepresentationId: z.literal(SEMANTIC_REPRESENTATION_ID),
    sourceDimension: z.literal(SEMANTIC_DIMENSION),
    latentDimension: z.number().int().positive(),
    kind: z.enum(LATENT_KINDS),
    fidelity: z.enum(FIDELITIES),
    deterministic: z.boolean(),
    checkpointHash: z.string().min(1),
  })
  .strict();

export interface LatentRepresentationManifest
  extends z.infer<typeof LatentRepresentationManifestSchema> {}

export const LowRankFeatureComponentsSchema = z
  .object({
    semantic: z.number().finite(),
    graph: z.number().finite(),
    workflow: z.number().finite(),
    cache: z.number().finite(),
    execution: z.number().finite(),
  })
  .strict();
export type LowRankFeatureComponents = z.infer<typeof LowRankFeatureComponentsSchema>;

export const LowRankFeatureBlockV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.low-rank-feature-block.v1'),
    blockId: z.string().min(1),
    packetKey: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    sourceRepresentationId: z.literal(SEMANTIC_REPRESENTATION_ID),
    sourceRepresentationRevision: z.string().min(1),
    latentManifest: LatentRepresentationManifestSchema,
    approximationMethod: LowRankApproximationMethodSchema,
    rank: z.number().int().positive(),
    seed: z.number().int(),
    producerId: z.string().min(1),
    producerRevision: z.string().min(1),
    featureRevision: z.string().min(1),
    modelRevision: z.string().min(1).nullable().optional(),
    inputDigest: z.string().min(1),
    outputDigest: z.string().min(1),
    generatedAt: z.string().datetime(),
    lastVerifiedAt: z.string().datetime().nullable().optional(),
    components: LowRankFeatureComponentsSchema,
  })
  .strict();

export type LowRankFeatureBlockV1 = z.infer<typeof LowRankFeatureBlockV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === 'object') {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (item as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return item;
  });
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildLatentRepresentationManifest(input: {
  representationId: string;
  representationRevision: string;
  latentDimension: number;
  kind: LatentKind;
  fidelity: Fidelity;
  deterministic: boolean;
  checkpointHash: string;
}): LatentRepresentationManifest {
  return LatentRepresentationManifestSchema.parse({
    sourceRepresentationId: SEMANTIC_REPRESENTATION_ID,
    sourceDimension: SEMANTIC_DIMENSION,
    ...input,
  });
}

export function assertProductionLatent(m: LatentRepresentationManifest): void {
  if (m.kind === 'VAE_RESEARCH') throw new Error('VAE_RESEARCH cannot be promoted as deterministic routing truth');
  if (!m.deterministic) throw new Error('production latent must be deterministic');
  if (m.sourceRepresentationId !== SEMANTIC_REPRESENTATION_ID || m.sourceDimension !== SEMANTIC_DIMENSION) throw new Error('source representation mismatch');
}

export function buildLowRankFeatureBlock(input: {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  sourceRepresentationRevision: string;
  latentManifest: LatentRepresentationManifest;
  approximationMethod: LowRankApproximationMethod;
  rank: number;
  seed: number;
  producerId: string;
  producerRevision: string;
  featureRevision: string;
  modelRevision?: string | null;
  inputDigest: string;
  outputDigest: string;
  generatedAt?: string;
  lastVerifiedAt?: string | null;
  components: LowRankFeatureComponents;
}): LowRankFeatureBlockV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return LowRankFeatureBlockV1Schema.parse({
    schemaVersion: 'atlas.low-rank-feature-block.v1',
    blockId: `low-rank:${sha256Hex(
      stableJson({
        packetKey: input.packetKey,
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        sourceRepresentationRevision: input.sourceRepresentationRevision,
        latentManifest: input.latentManifest,
        approximationMethod: input.approximationMethod,
        rank: input.rank,
        seed: input.seed,
        producerId: input.producerId,
        producerRevision: input.producerRevision,
        featureRevision: input.featureRevision,
        modelRevision: input.modelRevision ?? null,
        inputDigest: input.inputDigest,
        outputDigest: input.outputDigest,
        components: input.components,
      }),
    ).slice(0, 24)}`,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    sourceRepresentationId: SEMANTIC_REPRESENTATION_ID,
    sourceRepresentationRevision: input.sourceRepresentationRevision,
    latentManifest: input.latentManifest,
    approximationMethod: input.approximationMethod,
    rank: input.rank,
    seed: input.seed,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    featureRevision: input.featureRevision,
    modelRevision: input.modelRevision ?? null,
    inputDigest: input.inputDigest,
    outputDigest: input.outputDigest,
    generatedAt,
    lastVerifiedAt: input.lastVerifiedAt ?? null,
    components: input.components,
  });
}
