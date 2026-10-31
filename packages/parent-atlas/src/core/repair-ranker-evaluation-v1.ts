import { createHash } from 'node:crypto';
import { z } from 'zod';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const reference = z.string().trim().min(1).max(500);
const metric = z.number().finite();

const candidateSchema = z.object({
  candidateId: reference,
  sourceRevision: digest,
  relevance: z.number().int().min(0).max(3),
  judgmentEvidenceRef: reference,
  judgmentSource: z.enum(['human_judgment', 'independently_verified_repair_receipt']),
  baselineScore: metric,
  challengerScore: metric,
  baselineProbability: z.number().finite().min(0).max(1).nullable(),
  challengerProbability: z.number().finite().min(0).max(1).nullable(),
}).strict();

const performanceSchema = z.object({
  receiptRef: reference,
  latencyMs: z.number().finite().nonnegative(),
  peakMemoryBytes: z.number().int().nonnegative(),
}).strict();

export const repairRankerEvaluationInputV1Schema = z.object({
  schema: z.literal('atlas.repair-ranker-evaluation-input.v1').default('atlas.repair-ranker-evaluation-input.v1'),
  datasetChecksum: digest,
  baselineModelRevision: digest,
  challengerModelRevision: digest,
  trainingSourceRevisions: z.array(digest).min(1),
  heldOutSourceRevisions: z.array(digest).min(1),
  k: z.number().int().positive().max(100),
  queries: z.array(z.object({
    queryId: reference,
    candidates: z.array(candidateSchema).min(1).max(500),
  }).strict()).min(1).max(500),
  baselinePerformance: performanceSchema,
  challengerPerformance: performanceSchema,
}).strict().superRefine((input, ctx) => {
  const training = new Set(input.trainingSourceRevisions);
  if (training.size !== input.trainingSourceRevisions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['trainingSourceRevisions'], message: 'DUPLICATE_TRAINING_SOURCE_REVISION' });
  }
  const heldOut = new Set(input.heldOutSourceRevisions);
  if (heldOut.size !== input.heldOutSourceRevisions.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['heldOutSourceRevisions'], message: 'DUPLICATE_HELD_OUT_SOURCE_REVISION' });
  }
  for (const revision of heldOut) {
    if (training.has(revision)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['heldOutSourceRevisions'], message: 'HELD_OUT_SOURCE_REVISION_OVERLAP' });
    }
  }
  const queryIds = input.queries.map((query) => query.queryId);
  if (new Set(queryIds).size !== queryIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['queries'], message: 'DUPLICATE_QUERY_ID' });
  }
  for (const [queryIndex, query] of input.queries.entries()) {
    const candidateIds = query.candidates.map((candidate) => candidate.candidateId);
    if (new Set(candidateIds).size !== candidateIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['queries', queryIndex, 'candidates'], message: 'DUPLICATE_CANDIDATE_ID' });
    }
    if (!query.candidates.some((candidate) => candidate.relevance > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['queries', queryIndex, 'candidates'], message: 'QUERY_REQUIRES_RELEVANT_JUDGMENT' });
    }
    for (const [candidateIndex, candidate] of query.candidates.entries()) {
      if (!heldOut.has(candidate.sourceRevision)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['queries', queryIndex, 'candidates', candidateIndex, 'sourceRevision'], message: 'CANDIDATE_NOT_IN_FROZEN_HELD_OUT_SPLIT' });
      }
    }
  }
});

export type RepairRankerEvaluationInputV1 = z.infer<typeof repairRankerEvaluationInputV1Schema>;

const metricSetSchema = z.object({
  recallAtK: z.number().finite().min(0).max(1),
  mrr: z.number().finite().min(0).max(1),
  ndcgAtK: z.number().finite().min(0).max(1),
  brierScore: z.number().finite().min(0).max(1).nullable(),
  latencyMs: z.number().finite().nonnegative(),
  peakMemoryBytes: z.number().int().nonnegative(),
}).strict();

export const repairRankerEvaluationReceiptV1Schema = z.object({
  schema: z.literal('atlas.repair-ranker-evaluation-receipt.v1'),
  datasetChecksum: digest,
  baselineModelRevision: digest,
  challengerModelRevision: digest,
  trainingSourceRevisions: z.array(digest).min(1),
  heldOutSourceRevisions: z.array(digest).min(1),
  sourceRevisionSplitDisjoint: z.literal(true),
  queryCount: z.number().int().positive(),
  k: z.number().int().positive(),
  baseline: metricSetSchema,
  challenger: metricSetSchema,
  judgmentEvidenceRefs: z.array(reference).min(1),
  baselinePerformanceReceiptRef: reference,
  challengerPerformanceReceiptRef: reference,
  evaluationOnly: z.literal(true),
  trainingPerformed: z.literal(false),
  promotionAuthorized: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksum: digest,
}).strict();

export type RepairRankerEvaluationReceiptV1 = z.infer<typeof repairRankerEvaluationReceiptV1Schema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function evaluationChecksum(body: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(body), 'utf8').digest('hex')}`;
}

function calculateMetrics(input: RepairRankerEvaluationInputV1, arm: 'baseline' | 'challenger') {
  let recallSum = 0;
  let reciprocalRankSum = 0;
  let ndcgSum = 0;
  let brierSum = 0;
  let probabilityCount = 0;

  for (const query of input.queries) {
    const ordered = [...query.candidates].sort((left, right) => {
      const scoreDiff = right[`${arm}Score`] - left[`${arm}Score`];
      return scoreDiff || left.candidateId.localeCompare(right.candidateId);
    });
    const relevantCount = query.candidates.filter((candidate) => candidate.relevance > 0).length;
    const topK = ordered.slice(0, input.k);
    recallSum += topK.filter((candidate) => candidate.relevance > 0).length / relevantCount;

    const firstRelevantIndex = ordered.findIndex((candidate) => candidate.relevance > 0);
    if (firstRelevantIndex >= 0) reciprocalRankSum += 1 / (firstRelevantIndex + 1);

    const dcg = topK.reduce((sum, candidate, index) =>
      sum + (Math.pow(2, candidate.relevance) - 1) / Math.log2(index + 2), 0);
    const ideal = [...query.candidates]
      .sort((left, right) => right.relevance - left.relevance || left.candidateId.localeCompare(right.candidateId))
      .slice(0, input.k);
    const idcg = ideal.reduce((sum, candidate, index) =>
      sum + (Math.pow(2, candidate.relevance) - 1) / Math.log2(index + 2), 0);
    ndcgSum += idcg > 0 ? dcg / idcg : 0;

    for (const candidate of query.candidates) {
      const probability = candidate[`${arm}Probability`];
      if (probability === null) continue;
      const target = candidate.relevance > 0 ? 1 : 0;
      brierSum += (probability - target) ** 2;
      probabilityCount += 1;
    }
  }

  const queryCount = input.queries.length;
  return {
    recallAtK: Number((recallSum / queryCount).toFixed(6)),
    mrr: Number((reciprocalRankSum / queryCount).toFixed(6)),
    ndcgAtK: Number((ndcgSum / queryCount).toFixed(6)),
    brierScore: probabilityCount === 0 ? null : Number((brierSum / probabilityCount).toFixed(6)),
  };
}

export function buildRepairRankerEvaluationReceiptV1(raw: RepairRankerEvaluationInputV1): RepairRankerEvaluationReceiptV1 {
  const input = repairRankerEvaluationInputV1Schema.parse(raw);
  const baseline = {
    ...calculateMetrics(input, 'baseline'),
    latencyMs: input.baselinePerformance.latencyMs,
    peakMemoryBytes: input.baselinePerformance.peakMemoryBytes,
  };
  const challenger = {
    ...calculateMetrics(input, 'challenger'),
    latencyMs: input.challengerPerformance.latencyMs,
    peakMemoryBytes: input.challengerPerformance.peakMemoryBytes,
  };
  const body = {
    schema: 'atlas.repair-ranker-evaluation-receipt.v1' as const,
    datasetChecksum: input.datasetChecksum,
    baselineModelRevision: input.baselineModelRevision,
    challengerModelRevision: input.challengerModelRevision,
    trainingSourceRevisions: [...input.trainingSourceRevisions].sort(),
    heldOutSourceRevisions: [...input.heldOutSourceRevisions].sort(),
    sourceRevisionSplitDisjoint: true as const,
    queryCount: input.queries.length,
    k: input.k,
    baseline,
    challenger,
    judgmentEvidenceRefs: [...new Set(input.queries.flatMap((query) => query.candidates.map((candidate) => candidate.judgmentEvidenceRef)))].sort(),
    baselinePerformanceReceiptRef: input.baselinePerformance.receiptRef,
    challengerPerformanceReceiptRef: input.challengerPerformance.receiptRef,
    evaluationOnly: true as const,
    trainingPerformed: false as const,
    promotionAuthorized: false as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return repairRankerEvaluationReceiptV1Schema.parse({ ...body, checksum: evaluationChecksum(body) });
}

export function verifyRepairRankerEvaluationReceiptV1(raw: unknown): RepairRankerEvaluationReceiptV1 {
  const receipt = repairRankerEvaluationReceiptV1Schema.parse(raw);
  const { checksum, ...body } = receipt;
  if (checksum !== evaluationChecksum(body)) throw new Error('REPAIR_RANKER_EVALUATION_CHECKSUM_MISMATCH');
  return receipt;
}
