import { z } from 'zod';

const sourceRefSchema = z.string().trim().min(1).max(1024);

export const FeatureRegistryLookupV1Schema = z.object({
  featureKey: z.string().trim().min(1).max(512),
  sourceRef: sourceRefSchema,
}).strict();

export const FeatureResolutionV1Schema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('CANONICAL'),
    featureId: z.string().trim().min(1).max(512),
    featureLabel: z.string().trim().min(1).max(512),
    registryRevision: z.string().trim().min(1).max(512),
    sourceRef: sourceRefSchema,
    bindingReceiptId: z.string().trim().min(1).max(512),
    canonicalAuthority: z.literal(true),
  }).strict(),
  z.object({
    state: z.literal('PROPOSED'),
    proposedFeatureId: z.string().trim().min(1).max(512),
    proposedLabel: z.string().trim().min(1).max(512),
    sourceRef: sourceRefSchema,
    sourceRevision: z.string().trim().min(1).max(512).nullable(),
    method: z.enum(['normalized_exact', 'review_candidate']),
    registryStatus: z.enum(['PRESENT', 'ABSENT', 'UNAVAILABLE']),
    canonicalAuthority: z.literal(false),
  }).strict(),
  z.object({
    state: z.enum(['UNRESOLVED', 'REGISTRY_ABSENT']),
    reason: z.enum([
      'NO_MATCH',
      'AMBIGUOUS_MATCH',
      'SOURCE_REF_MISMATCH',
      'REGISTRY_UNAVAILABLE',
      'INVALID_LOOKUP',
      'NO_CANONICAL_REGISTRY',
    ]),
    canonicalAuthority: z.literal(false),
  }).strict(),
]);

export const FeatureResolutionLookupV1Schema = z.object({
  sourceRef: sourceRefSchema,
  registryStatus: z.enum(['PRESENT', 'ABSENT', 'UNAVAILABLE']),
  candidates: z.array(z.object({
    featureId: z.string().trim().min(1).max(512),
    featureLabel: z.string().trim().min(1).max(512),
    sourceRef: sourceRefSchema,
    sourceRevision: z.string().trim().min(1).max(512).nullable(),
    method: z.enum(['normalized_exact', 'review_candidate']),
  }).strict()).max(64),
}).strict();

export type FeatureResolutionV1 = z.infer<typeof FeatureResolutionV1Schema>;
export type FeatureResolutionLookupV1 = z.infer<typeof FeatureResolutionLookupV1Schema>;
export type FeatureResolutionProposalV1 = Exclude<FeatureResolutionV1, { state: 'CANONICAL' }>;
