import { z } from 'zod';
import { candidateRepresentationBindingV1Schema } from './canonical-candidate-v1.js';

export const CANDIDATE_FEATURE_ROW_SCHEMA = 'atlas.candidate-feature-row.v1' as const;

const nullableScore = z.number().finite().nullable().default(null);

export const CandidateFeatureRowV1Schema = z.object({
  schema: z.literal(CANDIDATE_FEATURE_ROW_SCHEMA),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1).nullable().default(null),
  treeNodeId: z.string().min(1).nullable().default(null),
  symbolVersionId: z.string().min(1).nullable().default(null),

  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable().default(null),
  semanticRevision: z.string().min(1).nullable().default(null),
  featureRevision: z.string().min(1),
  representationBindings: z.array(candidateRepresentationBindingV1Schema).default([]),

  semanticRelevance: nullableScore,
  lexicalRelevance: nullableScore,
  astAffinity: nullableScore,
  graphAuthority: nullableScore,
  personalizedPageRank: nullableScore,
  communityAffinity: nullableScore,
  manifold4OrientationSimilarity: nullableScore,
  crossEncoderRawScore: nullableScore,
  crossEncoderCalibratedScore: nullableScore,
  crossEncoderAvailable: z.boolean().default(false),
  domainAffinity: nullableScore,
  executionUtility: nullableScore,
  memoryUtility: nullableScore,

  laneMask: z.array(z.enum(['semantic', 'lexical', 'ast', 'graph', 'manifold4', 'cross_encoder', 'domain', 'execution', 'memory'])),
  degradedIdentity: z.boolean().default(false),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).superRefine((row, ctx) => {
  if (row.crossEncoderAvailable && row.crossEncoderRawScore === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['crossEncoderRawScore'],
      message: 'CROSS_ENCODER_AVAILABLE_REQUIRES_RAW_SCORE',
    });
  }
  if (!row.crossEncoderAvailable && row.crossEncoderRawScore !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['crossEncoderRawScore'],
      message: 'CROSS_ENCODER_SCORE_REQUIRES_AVAILABLE=true',
    });
  }
});

export type CandidateFeatureRowV1 = z.infer<typeof CandidateFeatureRowV1Schema>;

/**
 * Invariant: manifold4 is a derived topology/orientation feature only.
 * It must never substitute for semantic_768, canonical identity, or CandidateOrdinal.
 */
export const CANDIDATE_FEATURE_INVARIANTS = Object.freeze({
  semanticLane: 'semantic_768',
  manifold4Role: 'DERIVED_PROJECTION',
  canonicalJoinKey: 'candidateOrdinal',
  missingLearnedScorePolicy: 'NULL_PLUS_AVAILABILITY_FLAG',
});
