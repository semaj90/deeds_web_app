import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SampleQueryMatrixV1Schema } from '../sampling/sample-query-matrix-v1.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const RecommendationEvidenceReceiptV1Schema = z.object({
  receiptId: z.string().min(1),
  producer: z.string().min(1),
  producerRevision: revision,
  workspaceRevision: revision,
  sourceRevision: revision,
  graphRevision: revision.nullable(),
  representationRevision: revision,
  checksum,
}).strict();

export const RecommendationKnnHitV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  score: z.number().finite(),
  rank: z.number().int().positive(),
}).strict();

export const RecommendationKnnReceiptV1Schema = RecommendationEvidenceReceiptV1Schema.extend({
  kind: z.literal('KNN_TOPK'),
  metric: z.enum(['COSINE_SIMILARITY', 'INNER_PRODUCT', 'L2_DISTANCE']),
  topK: z.number().int().positive().max(512),
  ordinalMapChecksum: checksum,
  hits: z.array(RecommendationKnnHitV1Schema).max(512),
}).strict();

export const RecommendationGraphReceiptV1Schema = RecommendationEvidenceReceiptV1Schema.extend({
  kind: z.enum(['PAGERANK', 'SPECTRAL_PROJECTION', 'COMMUNITY_PROJECTION']),
  ordinalMapChecksum: checksum,
  resultChecksum: checksum,
  candidateOrdinals: z.array(z.number().int().nonnegative()).max(512),
  readOnly: z.literal(true),
}).strict();

export const RecommendationDomainReceiptV1Schema = RecommendationEvidenceReceiptV1Schema.extend({
  kind: z.literal('DOMAIN_CLASSIFICATION'),
  taxonomyRevision: revision,
  domainId: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  proofStatus: z.enum(['FROZEN_EVAL_PROVEN', 'CHALLENGER_UNPROVEN']),
  featureWeight: z.number().finite().min(0).max(1),
  canonicalIdentityAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.proofStatus === 'CHALLENGER_UNPROVEN' && value.featureWeight !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['featureWeight'], message: 'unproven domain classifiers must have zero recommendation weight' });
  }
});

export const RecommendationEvidenceBundleV1Schema = z.object({
  schema: z.literal('atlas.recommendation-evidence-bundle.v1'),
  requestId: z.string().min(1),
  subjectRef: z.string().min(1),
  workspaceRevision: revision,
  sourceRevision: revision,
  graphRevision: revision.nullable(),
  representationId: z.enum(['semantic_768', 'semantic_512']),
  representationRevision: revision,
  semanticChecksum: checksum,
  ordinalMapChecksum: checksum,
  candidateOrdinals: z.array(z.number().int().nonnegative()).min(1).max(512),
  sample: SampleQueryMatrixV1Schema.nullable(),
  graph: z.array(RecommendationGraphReceiptV1Schema).max(8),
  knn: RecommendationKnnReceiptV1Schema.nullable(),
  domain: z.array(RecommendationDomainReceiptV1Schema).max(8),
  okfSchemaRevision: revision,
  okfFeatureIds: z.array(z.string().min(1)).max(64),
  parameters: z.object({
    topK: z.number().int().positive().max(512),
    graphHops: z.number().int().min(0).max(2),
    sampleRank: z.number().int().min(0).max(512),
    synthesisBudgetTokens: z.number().int().positive().max(32768),
  }).strict(),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  identityAuthority: z.literal(false),
  bundleChecksum: checksum,
}).strict().superRefine((value, ctx) => {
  if (value.knn && value.knn.ordinalMapChecksum !== value.ordinalMapChecksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['knn', 'ordinalMapChecksum'], message: 'KNN ordinal map checksum mismatch' });
  }
  for (const [index, receipt] of value.graph.entries()) {
    if (receipt.ordinalMapChecksum !== value.ordinalMapChecksum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['graph', index, 'ordinalMapChecksum'], message: 'graph ordinal map checksum mismatch' });
    }
  }
});

export type RecommendationEvidenceBundleV1 = z.infer<typeof RecommendationEvidenceBundleV1Schema>;
export type RecommendationKnnReceiptV1 = z.infer<typeof RecommendationKnnReceiptV1Schema>;
export type RecommendationGraphReceiptV1 = z.infer<typeof RecommendationGraphReceiptV1Schema>;
export type RecommendationDomainReceiptV1 = z.infer<typeof RecommendationDomainReceiptV1Schema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function compileRecommendationEvidenceBundleV1(input: Omit<RecommendationEvidenceBundleV1, 'bundleChecksum'>): RecommendationEvidenceBundleV1 {
  const parsed = RecommendationEvidenceBundleV1Schema.parse({ ...input, bundleChecksum: '0'.repeat(64) });
  const bundleChecksum = sha256(parsed);
  const result = RecommendationEvidenceBundleV1Schema.parse({ ...parsed, bundleChecksum });
  verifyRecommendationEvidenceBundleV1(result);
  return result;
}

/**
 * Independently verifies a deserialized recommendation evidence envelope.
 * Does NOT prove external provider receipts, source-column lineage, or GPU execution;
 * those remain the responsibilities of the original producers and admission gates.
 *
 * Hash compatibility: v1's composer hashes the complete object with its
 * bundleChecksum temporarily set to 64 zeroes. Preserve this existing rule.
 */
export function verifyRecommendationEvidenceBundleV1(input: RecommendationEvidenceBundleV1): void {
  const bundle = RecommendationEvidenceBundleV1Schema.parse(input);
  const expectedChecksum = sha256({ ...bundle, bundleChecksum: '0'.repeat(64) });
  if (expectedChecksum !== bundle.bundleChecksum) {
    throw new Error('RECOMMENDATION_BUNDLE_CHECKSUM_MISMATCH');
  }
  const ordinalSet = new Set(bundle.candidateOrdinals);
  if (ordinalSet.size !== bundle.candidateOrdinals.length) {
    throw new Error('RECOMMENDATION_BUNDLE_DUPLICATE_ORDINAL');
  }
  if (bundle.sample && bundle.sample.ordinalMapChecksum !== bundle.ordinalMapChecksum) {
    throw new Error('RECOMMENDATION_BUNDLE_SAMPLE_ORDINAL_DRIFT');
  }

  const assertReceiptBinding = (receipt: z.infer<typeof RecommendationEvidenceReceiptV1Schema>, kind: string) => {
    if (receipt.workspaceRevision !== bundle.workspaceRevision) {
      throw new Error(`RECOMMENDATION_${kind}_WORKSPACE_REVISION_MISMATCH`);
    }
    if (receipt.sourceRevision !== bundle.sourceRevision) {
      throw new Error(`RECOMMENDATION_${kind}_SOURCE_REVISION_MISMATCH`);
    }
    if (receipt.representationRevision !== bundle.representationRevision) {
      throw new Error(`RECOMMENDATION_${kind}_REPRESENTATION_REVISION_MISMATCH`);
    }
    if (receipt.graphRevision !== null && bundle.graphRevision !== null && receipt.graphRevision !== bundle.graphRevision) {
      throw new Error(`RECOMMENDATION_${kind}_GRAPH_REVISION_MISMATCH`);
    }
  };

  if (bundle.knn) {
    assertReceiptBinding(bundle.knn, 'KNN');
    if (bundle.knn.hits.length > bundle.knn.topK) {
      throw new Error('RECOMMENDATION_KNN_TOPK_EXCEEDED');
    }
    const ranks = new Set<number>();
    const ordinals = new Set<number>();
    for (const hit of bundle.knn.hits) {
      if (hit.rank > bundle.knn.topK || ranks.has(hit.rank) || ordinals.has(hit.candidateOrdinal)) {
        throw new Error('RECOMMENDATION_KNN_DUPLICATE_OR_INVALID_RANK');
      }
      ranks.add(hit.rank);
      ordinals.add(hit.candidateOrdinal);
    }
  }

  for (const receipt of bundle.graph) {
    assertReceiptBinding(receipt, 'GRAPH');
    if (new Set(receipt.candidateOrdinals).size !== receipt.candidateOrdinals.length) {
      throw new Error('RECOMMENDATION_GRAPH_DUPLICATE_ORDINAL');
    }
  }
  for (const receipt of bundle.domain) {
    assertReceiptBinding(receipt, 'DOMAIN');
  }
}

export function recommendationEvidenceFeatureWeightV1(input: RecommendationEvidenceBundleV1): number {
  const provenDomainWeight = input.domain.reduce((sum, item) => sum + item.featureWeight, 0);
  const graphSignal = input.graph.length > 0 ? 1 : 0;
  const knnSignal = input.knn && input.knn.hits.length > 0 ? 1 : 0;
  const sampleSignal = input.sample?.retrievalVoteAdded === false ? 1 : 0;
  return Math.min(1, (provenDomainWeight * 0.35) + (graphSignal * 0.25) + (knnSignal * 0.3) + (sampleSignal * 0.1));
}
