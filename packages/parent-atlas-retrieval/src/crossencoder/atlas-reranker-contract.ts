import { z } from 'zod';

/**
 * Revision-qualified evidence supplied to AtlasRerankerV1 after candidate
 * reduction. It is intentionally numeric and identity-free: CandidateOrdinal
 * and source revisions identify the row, while these values are model input.
 */
export const AtlasRerankerFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.reranker-feature-row.v1'),
  candidateOrdinal: z.number().int().nonnegative(),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  ontologyRevision: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),
  semanticScore: z.number().finite().nullable(),
  lexicalScore: z.number().finite().nullable(),
  sparseScore: z.number().finite().nullable(),
  astMatch: z.number().finite().min(0).max(1).nullable(),
  exactSymbolMatch: z.number().finite().min(0).max(1).nullable(),
  relationMatch: z.number().finite().min(0).max(1).nullable(),
  pageRank: z.number().finite().nullable(),
  personalizedPageRank: z.number().finite().nullable(),
  communityAffinity: z.number().finite().nullable(),
  hopDistance: z.number().finite().min(0).nullable(),
  domainAffinity: z.number().finite().min(0).max(1).nullable(),
  domainConfidence: z.number().finite().min(0).max(1).nullable(),
  somAffinity: z.number().finite().min(0).max(1).nullable(),
  centroidAffinity: z.number().finite().min(0).max(1).nullable(),
  identityQuality: z.number().finite().min(0).max(1),
  evidenceFreshness: z.number().finite().min(0).max(1),
  evidenceKinds: z.array(z.enum(['SOURCE', 'CITATION', 'TEST_RESULT', 'EXECUTION_OUTCOME', 'DERIVED_SYNTHESIS'])),
  ontologyTupleCount: z.number().int().nonnegative(),
  ontologySummary: z.array(z.number().int().nonnegative()).max(256)
});

export type AtlasRerankerFeatureRowV1 = z.infer<typeof AtlasRerankerFeatureRowV1Schema>;

export const AtlasOntologyTupleV1Schema = z.object({
  subjectType: z.string().min(1),
  predicate: z.string().min(1),
  objectType: z.string().min(1),
  evidenceType: z.enum(['SOURCE', 'CITATION', 'TEST_RESULT', 'EXECUTION_OUTCOME', 'DERIVED_SYNTHESIS']),
  authorityClass: z.string().min(1),
  relationDepth: z.number().int().nonnegative(),
  revisionMatch: z.boolean()
});

export type AtlasOntologyTupleV1 = z.infer<typeof AtlasOntologyTupleV1Schema>;

/**
 * Labels are targets, not features. Keep repair/promotion outcomes here so a
 * compiler can explicitly exclude them from online reranker input.
 */
export const AtlasPairJudgmentV1Schema = z.object({
  schema: z.literal('atlas.pair-judgment.v1'),
  queryId: z.string().min(1),
  queryRevision: z.string().min(1),
  candidate: AtlasRerankerFeatureRowV1Schema,
  queryText: z.string().min(1),
  candidateText: z.string().min(1),
  retrievalRank: z.number().int().nonnegative(),
  humanRelevanceGrade: z.number().int().min(0).max(4).nullable(),
  teacherScore: z.number().finite().nullable(),
  exactPromotionOutcome: z.boolean().nullable(),
  repairSuccess: z.boolean().nullable(),
  testSuccess: z.boolean().nullable(),
  labelRevision: z.string().min(1),
  isHardNegative: z.boolean()
});

export type AtlasPairJudgmentV1 = z.infer<typeof AtlasPairJudgmentV1Schema>;

export const ATLAS_RERANKER_FEATURE_NAMES = [
  'semanticScore', 'lexicalScore', 'sparseScore', 'astMatch',
  'exactSymbolMatch', 'relationMatch', 'pageRank', 'personalizedPageRank',
  'communityAffinity', 'hopDistance', 'domainAffinity', 'domainConfidence',
  'somAffinity', 'centroidAffinity', 'identityQuality', 'evidenceFreshness'
] as const;

export type AtlasRerankerFeatureName = typeof ATLAS_RERANKER_FEATURE_NAMES[number];

const fallbackValue = (value: number | null, fallback = 0): number =>
  value == null || !Number.isFinite(value) ? fallback : value;

/** Stable feature order shared by Python, Torch, ONNX, and future N-API paths. */
export function toAtlasRerankerFeatureVector(row: AtlasRerankerFeatureRowV1): number[] {
  return ATLAS_RERANKER_FEATURE_NAMES.map((name) => fallbackValue(row[name]));
}

/** Remove outcome fields before creating a training/inference feature record. */
export function onlineFeatureRowFromJudgment(judgment: AtlasPairJudgmentV1): AtlasRerankerFeatureRowV1 {
  return AtlasRerankerFeatureRowV1Schema.parse(judgment.candidate);
}

/** Derived synthesis is never admitted as sole evidence for promotion. */
export function hasPromotableEvidence(row: AtlasRerankerFeatureRowV1): boolean {
  return row.evidenceKinds.some((kind) => kind !== 'DERIVED_SYNTHESIS');
}

