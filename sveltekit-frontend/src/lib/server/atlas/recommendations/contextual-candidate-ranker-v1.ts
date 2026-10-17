import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateFeatureSnapshotV1Schema,
} from '../features/candidate-feature-snapshot-v1.js';
import { candidateOrdinalMapV1Schema } from '../features/canonical-candidate-v1.js';
import {
  buildSearchRuntimeSelectedFeatureRowsV1,
  searchRuntimeSelectedCandidateSetV1Schema,
} from '../retrieval/search-runtime-selected-candidate-set-v1.js';

const boundedScore = z.number().finite().min(0).max(1);
const recommendationSignals = [
  ['semanticRelevance', 0.25],
  ['lexicalRelevance', 0.10],
  ['astAffinity', 0.15],
  ['graphAuthority', 0.15],
  ['crossEncoderCalibratedScore', 0.15],
  ['domainAffinity', 0.08],
  ['executionUtility', 0.06],
  ['memoryUtility', 0.06],
] as const;

export const ContextualCandidateRecommendationV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1).nullable(),
  semanticRevision: z.string().min(1).nullable(),
  featureRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  score: boundedScore,
  signals: z.record(z.string(), boundedScore),
}).strict();

export const ContextualCandidateRecommendationReceiptV1Schema = z.object({
  schema: z.literal('atlas.contextual-candidate-recommendations.v1'),
  requestId: z.string().min(1),
  candidateSnapshotRevision: z.string().min(1),
  selectionChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  parentOrdinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  featureSnapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  recommendations: z.array(ContextualCandidateRecommendationV1Schema).max(4),
  abstained: z.boolean(),
  status: z.enum(['ADVISORY', 'ABSTAIN']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  retrievalVoteAdded: z.literal(false),
  requiresApproval: z.literal(true),
  receiptChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.abstained !== (receipt.recommendations.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['abstained'], message: 'ABSTENTION_COUNT_MISMATCH' });
  }
  if (receipt.status !== (receipt.abstained ? 'ABSTAIN' : 'ADVISORY')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'RECOMMENDATION_STATUS_MISMATCH' });
  }
});

export type ContextualCandidateRecommendationReceiptV1 = z.infer<typeof ContextualCandidateRecommendationReceiptV1Schema>;

export function verifyContextualCandidateRecommendationReceiptV1(
  input: z.input<typeof ContextualCandidateRecommendationReceiptV1Schema>,
): void {
  const receipt = ContextualCandidateRecommendationReceiptV1Schema.parse(input);
  const { receiptChecksum, ...body } = receipt;
  if (checksum(body) !== receiptChecksum) throw new Error('CONTEXTUAL_RECOMMENDATION_RECEIPT_CHECKSUM_MISMATCH');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function buildReceiptBody(input: Omit<ContextualCandidateRecommendationReceiptV1, 'receiptChecksum'>) {
  return input;
}

/**
 * Produces up to four advisory candidate recommendations from a SearchRuntime
 * selection and its revision-bound feature snapshot. This neither retrieves,
 * changes fusion, admits a ContextManifest, trains weights, nor writes state.
 */
export function recommendContextualCandidatesV1(input: {
  selection: z.input<typeof searchRuntimeSelectedCandidateSetV1Schema>;
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  featureSnapshot: z.input<typeof candidateFeatureSnapshotV1Schema>;
  maxRecommendations?: number;
}): ContextualCandidateRecommendationReceiptV1 {
  const maxRecommendations = input.maxRecommendations ?? 4;
  if (!Number.isInteger(maxRecommendations) || maxRecommendations < 1 || maxRecommendations > 4) {
    throw new Error('CONTEXTUAL_RECOMMENDATION_LIMIT_INVALID');
  }

  const selection = searchRuntimeSelectedCandidateSetV1Schema.parse(input.selection);
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const featureSnapshot = candidateFeatureSnapshotV1Schema.parse(input.featureSnapshot);
  const selectedFeatures = buildSearchRuntimeSelectedFeatureRowsV1({
    selection,
    ordinalMap,
    featureSnapshot,
  });
  const candidatesByOrdinal = new Map(selection.selectedCandidates.map((candidate) => [candidate.candidateOrdinal, candidate]));
  const ranked = selectedFeatures.rows.flatMap((row) => {
    const candidate = candidatesByOrdinal.get(row.candidateOrdinal);
    if (!candidate || row.degradedIdentity || candidate.evidenceRefs.length === 0) return [];

    const signals: Record<string, number> = {};
    let weightedScore = 0;
    let availableWeight = 0;
    for (const [name, weight] of recommendationSignals) {
      const value = row[name];
      if (value === null) continue;
      const score = boundedScore.parse(value);
      signals[name] = score;
      weightedScore += score * weight;
      availableWeight += weight;
    }
    if (availableWeight === 0) return [];

    return [{
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      workspaceRevision: candidate.workspaceRevision,
      graphRevision: row.graphRevision,
      semanticRevision: row.semanticRevision,
      featureRevision: row.featureRevision,
      evidenceRefs: candidate.evidenceRefs,
      score: weightedScore / availableWeight,
      signals,
    }];
  }).sort((left, right) => right.score - left.score || left.candidateOrdinal - right.candidateOrdinal)
    .slice(0, maxRecommendations);

  const body = buildReceiptBody({
    schema: 'atlas.contextual-candidate-recommendations.v1',
    requestId: selection.requestId,
    candidateSnapshotRevision: selection.candidateSnapshotRevision,
    selectionChecksum: selection.selectionChecksum,
    parentOrdinalMapChecksum: selectedFeatures.parentOrdinalMapChecksum,
    featureSnapshotChecksum: selectedFeatures.featureSnapshotChecksum,
    recommendations: ranked,
    abstained: ranked.length === 0,
    status: ranked.length === 0 ? 'ABSTAIN' : 'ADVISORY',
    canonicalAuthority: false,
    writesPerformed: false,
    retrievalVoteAdded: false,
    requiresApproval: true,
  });
  const receipt = ContextualCandidateRecommendationReceiptV1Schema.parse({
    ...body,
    receiptChecksum: checksum(body),
  });
  verifyContextualCandidateRecommendationReceiptV1(receipt);
  return receipt;
}
