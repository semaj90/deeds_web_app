import { createHash } from 'node:crypto';
import { z } from 'zod';

export const LOD_RESIDENCY_STATES = ['COLD', 'WARM', 'HOT'] as const;
export type LodResidency = (typeof LOD_RESIDENCY_STATES)[number];

export const LOD_REPRESENTATIONS = ['FP32_MMAP', 'FP32', 'FP16', 'INT8', 'TURBO_4BIT', 'TURBO_2BIT', 'CAGRA'] as const;
export type LodRepresentation = (typeof LOD_REPRESENTATIONS)[number];

export const LOD_REASONS = ['QUERY_REUSE', 'VRAM_PRESSURE', 'LOW_REUSE', 'POLICY_EXPIRED', 'REVISION_INVALIDATION', 'CACHE_MISS'] as const;
export type LodReason = (typeof LOD_REASONS)[number];

const LodResidencySchema = z.enum(LOD_RESIDENCY_STATES);
const LodRepresentationSchema = z.enum(LOD_REPRESENTATIONS);
const LodTierSchema = z.object({
  residency: LodResidencySchema,
  representation: LodRepresentationSchema,
}).strict();

export const LodPromotionDecisionV1Schema = z
  .object({
    schema: z.literal('atlas.lod-promotion.v1'),
    decisionId: z.string().min(1),
    packetKey: z.string().min(1).optional(),
    ordinal: z.number().int().nonnegative().optional(),
    workspaceRevision: z.string().min(1),
    sourceRevision: z.string().min(1),
    representationRevision: z.string().min(1),
    ordinalMapRevision: z.string().min(1),
    from: LodTierSchema,
    to: LodTierSchema,
    reason: z.enum(LOD_REASONS),
    utility: z.number().finite().min(0).max(1),
    vectorPayloadBytesBefore: z.number().int().nonnegative(),
    vectorPayloadBytesAfter: z.number().int().nonnegative(),
    residentBytesBefore: z.number().int().nonnegative(),
    residentBytesAfter: z.number().int().nonnegative(),
    artifactId: z.string().min(1),
    artifactRevision: z.string().min(1),
    policyRevision: z.string().min(1),
    timestamp: z.string().datetime(),
  })
  .strict()
  .refine((value) => value.packetKey !== undefined || value.ordinal !== undefined, {
    message: 'packetKey or ordinal is required',
    path: ['packetKey'],
  })
  .refine((value) => value.from.residency !== value.to.residency || value.from.representation !== value.to.representation, {
    message: 'LOD transition must change residency or representation',
    path: ['to'],
  });

export type LodPromotionDecisionV1 = z.infer<typeof LodPromotionDecisionV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.keys(item as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = (item as Record<string, unknown>)[key];
        return result;
      }, {});
  });
}

function decisionId(input: Omit<LodPromotionDecisionV1, 'decisionId' | 'schema'>): string {
  return `lod:${createHash('sha256').update(stableJson(input)).digest('hex').slice(0, 24)}`;
}

export function buildLodPromotionDecision(input: Omit<LodPromotionDecisionV1, 'decisionId' | 'schema'>): LodPromotionDecisionV1 {
  const value = LodPromotionDecisionV1Schema.parse({
    schema: 'atlas.lod-promotion.v1',
    decisionId: decisionId(input),
    ...input,
  });
  assertLodTransition(value);
  return value;
}

export function assertLodTransition(decision: LodPromotionDecisionV1): void {
  LodPromotionDecisionV1Schema.parse(decision);
  if (decision.from.residency === 'COLD' && decision.to.residency === 'HOT') {
    throw new Error('unsupported LOD transition COLD -> HOT without a WARM tier');
  }
  if (decision.from.residency === 'HOT' && decision.to.residency === 'COLD') {
    throw new Error('unsupported LOD transition HOT -> COLD without a WARM tier');
  }
}
