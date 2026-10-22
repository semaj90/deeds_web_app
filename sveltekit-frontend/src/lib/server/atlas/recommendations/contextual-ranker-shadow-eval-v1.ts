import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';

import {
  currentCandidateFeatureAdmissionV1Schema,
} from '../features/candidate-feature-snapshot-v1.js';
import {
  buildSearchRuntimeSelectedFeatureRowsV1,
  searchRuntimeSelectedCandidateSetV1Schema,
} from '../retrieval/search-runtime-selected-candidate-set-v1.js';
import {
  candidateFeatureSnapshotV1Schema,
} from '../features/candidate-feature-snapshot-v1.js';
import { candidateOrdinalMapV1Schema } from '../features/canonical-candidate-v1.js';
import {
  recommendContextualCandidatesV1,
  verifyContextualCandidateRecommendationReceiptV1,
} from './contextual-candidate-ranker-v1.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const MAX_EVALUATION_CANDIDATES = 512;
const MAX_EVALUATION_TOP_K = 4;

export const contextualRankerShadowEvalReceiptV1Schema = z.object({
  schema: z.literal('atlas.contextual-ranker-shadow-eval.v1'),
  runId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  status: z.enum(['SHADOW_DIAGNOSTIC', 'BLOCKED']),
  reason: z.string().min(1).nullable(),
  inputChecksums: z.object({ selection: digest.nullable(), ordinalMap: digest.nullable(), featureSnapshot: digest.nullable() }).strict(),
  revisions: z.object({ candidateSnapshot: z.string().nullable(), workspace: z.string().nullable(), feature: z.string().nullable(), retrievalPolicy: z.string().nullable() }).strict(),
  baselineRanking: z.array(z.number().int().nonnegative()),
  shadowRanking: z.array(z.number().int().nonnegative()),
  metrics: z.object({
    candidateCount: z.number().int().nonnegative(),
    eligibleCount: z.number().int().nonnegative(),
    abstained: z.boolean(),
    topK: z.number().int().positive(),
    topKOverlap: z.number().int().nonnegative(),
    topKAgreement: z.number().min(0).max(1),
    pairwiseOrderAgreement: z.number().min(0).max(1).nullable(),
    latencyMs: z.number().nonnegative().nullable(),
    heapDeltaBytes: z.number().int().nullable(),
    judgedMetrics: z.null(),
  }).strict(),
  scorerReceiptChecksum: digest.nullable(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  retrievalOrderChanged: z.literal(false),
  receiptChecksum: digest,
}).strict();

export type ContextualRankerShadowEvalReceiptV1 = z.infer<typeof contextualRankerShadowEvalReceiptV1Schema>;

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

function seal(body: Omit<ContextualRankerShadowEvalReceiptV1, 'receiptChecksum'>): ContextualRankerShadowEvalReceiptV1 {
  return contextualRankerShadowEvalReceiptV1Schema.parse({ ...body, receiptChecksum: checksum(body) });
}

export function verifyContextualRankerShadowEvalReceiptV1(input: unknown): void {
  const receipt = contextualRankerShadowEvalReceiptV1Schema.parse(input);
  const { receiptChecksum, ...body } = receipt;
  if (checksum(body) !== receiptChecksum) throw new Error('CONTEXTUAL_RANKER_SHADOW_RECEIPT_CHECKSUM_MISMATCH');
}

export function writeContextualRankerShadowEvalReceiptExclusiveV1(input: {
  repoRoot: string;
  receipt: ContextualRankerShadowEvalReceiptV1;
}): string {
  verifyContextualRankerShadowEvalReceiptV1(input.receipt);
  const runDirectory = resolve(input.repoRoot, '.tmp', 'atlas', 'recommendation-shadow-eval', input.receipt.runId);
  mkdirSync(runDirectory, { recursive: true });
  const receiptPath = resolve(runDirectory, 'receipt.json');
  writeFileSync(receiptPath, `${JSON.stringify(input.receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return receiptPath;
}

export function buildBlockedContextualRankerShadowEvalReceiptV1(input: {
  runId: string;
  reason: string;
  selection?: unknown;
  ordinalMap?: unknown;
  featureSnapshot?: unknown;
}): ContextualRankerShadowEvalReceiptV1 {
  const selection = searchRuntimeSelectedCandidateSetV1Schema.safeParse(input.selection);
  const ordinalMap = candidateOrdinalMapV1Schema.safeParse(input.ordinalMap);
  const featureSnapshot = candidateFeatureSnapshotV1Schema.safeParse(input.featureSnapshot);
  return seal({
    schema: 'atlas.contextual-ranker-shadow-eval.v1', runId: input.runId,
    status: 'BLOCKED', reason: input.reason,
    inputChecksums: {
      selection: selection.success ? selection.data.selectionChecksum : null,
      ordinalMap: ordinalMap.success ? ordinalMap.data.ordinalMapChecksum : null,
      featureSnapshot: featureSnapshot.success ? featureSnapshot.data.snapshotChecksum : null,
    },
    revisions: {
      candidateSnapshot: selection.success ? selection.data.candidateSnapshotRevision : null,
      workspace: selection.success ? selection.data.workspaceRevision : null,
      feature: featureSnapshot.success ? featureSnapshot.data.featureRevision : null,
      retrievalPolicy: selection.success ? selection.data.retrievalPolicyRevision : null,
    },
    baselineRanking: [], shadowRanking: [],
    metrics: { candidateCount: 0, eligibleCount: 0, abstained: true, topK: 1, topKOverlap: 0, topKAgreement: 0, pairwiseOrderAgreement: null, latencyMs: null, heapDeltaBytes: null, judgedMetrics: null },
    scorerReceiptChecksum: null, canonicalAuthority: false, writesPerformed: false, retrievalOrderChanged: false,
  });
}

export function evaluateContextualRankerShadowV1(input: {
  runId: string;
  selection: unknown;
  ordinalMap: unknown;
  featureSnapshot: unknown;
  featureAdmission: unknown;
  topK?: number;
}): ContextualRankerShadowEvalReceiptV1 {
  const selection = searchRuntimeSelectedCandidateSetV1Schema.parse(input.selection);
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const featureSnapshot = candidateFeatureSnapshotV1Schema.parse(input.featureSnapshot);
  const admission = currentCandidateFeatureAdmissionV1Schema.parse(input.featureAdmission);
  if (selection.selectedCandidates.length > MAX_EVALUATION_CANDIDATES) throw new Error('SHADOW_EVAL_CANDIDATE_LIMIT_EXCEEDED');
  if (admission.status !== 'ADMITTED' || !admission.snapshot) throw new Error(`SHADOW_EVAL_FEATURE_ADMISSION_REQUIRED:${admission.reason ?? admission.status}`);
  if (admission.candidateSnapshotRevision !== selection.candidateSnapshotRevision
    || admission.workspaceRevision !== selection.workspaceRevision
    || admission.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || admission.featureRevision !== featureSnapshot.featureRevision
    || admission.snapshot.snapshotChecksum !== featureSnapshot.snapshotChecksum) {
    throw new Error('SHADOW_EVAL_ADMISSION_BINDING_MISMATCH');
  }
  const selectedFeatures = buildSearchRuntimeSelectedFeatureRowsV1({ selection, ordinalMap, featureSnapshot });
  const baselineRanking = [...selection.selectedCandidates]
    .sort((a, b) => b.score - a.score || a.candidateOrdinal - b.candidateOrdinal)
    .map((candidate) => candidate.candidateOrdinal);
  if (new Set(baselineRanking).size !== baselineRanking.length) throw new Error('SHADOW_EVAL_DUPLICATE_CANDIDATE_ID');

  const beforeHeap = process.memoryUsage().heapUsed;
  const started = performance.now();
  const scorer = recommendContextualCandidatesV1({ selection, ordinalMap, featureSnapshot, maxRecommendations: 4 });
  const latencyMs = performance.now() - started;
  const heapDeltaBytes = process.memoryUsage().heapUsed - beforeHeap;
  verifyContextualCandidateRecommendationReceiptV1(scorer);
  const shadowRanking = scorer.recommendations.map((candidate) => candidate.candidateOrdinal);
  const requestedTopK = input.topK ?? MAX_EVALUATION_TOP_K;
  if (!Number.isInteger(requestedTopK) || requestedTopK < 1 || requestedTopK > MAX_EVALUATION_TOP_K) {
    throw new Error('SHADOW_EVAL_TOP_K_INVALID');
  }
  const k = Math.min(requestedTopK, baselineRanking.length);
  const baselineTop = new Set(baselineRanking.slice(0, k));
  const shadowTop = new Set(shadowRanking.slice(0, k));
  const topKOverlap = [...baselineTop].filter((ordinal) => shadowTop.has(ordinal)).length;
  const baselineComparable = baselineRanking.filter((ordinal) => shadowTop.has(ordinal));
  const shadowPositions = new Map(shadowRanking.map((ordinal, index) => [ordinal, index]));
  let pairs = 0;
  let concordant = 0;
  for (let left = 0; left < baselineComparable.length; left += 1) {
    for (let right = left + 1; right < baselineComparable.length; right += 1) {
      pairs += 1;
      if ((shadowPositions.get(baselineComparable[left]!) ?? Infinity) < (shadowPositions.get(baselineComparable[right]!) ?? Infinity)) concordant += 1;
    }
  }
  return seal({
    schema: 'atlas.contextual-ranker-shadow-eval.v1', runId: input.runId,
    status: 'SHADOW_DIAGNOSTIC', reason: null,
    inputChecksums: { selection: selection.selectionChecksum, ordinalMap: ordinalMap.ordinalMapChecksum, featureSnapshot: selectedFeatures.featureSnapshotChecksum },
    revisions: { candidateSnapshot: selection.candidateSnapshotRevision, workspace: selection.workspaceRevision, feature: featureSnapshot.featureRevision, retrievalPolicy: selection.retrievalPolicyRevision },
    baselineRanking, shadowRanking,
    metrics: {
      candidateCount: baselineRanking.length,
      eligibleCount: scorer.recommendations.length,
      abstained: scorer.abstained,
      topK: k,
      topKOverlap,
      topKAgreement: topKOverlap / k,
      pairwiseOrderAgreement: pairs ? concordant / pairs : null,
      latencyMs,
      heapDeltaBytes,
      judgedMetrics: null,
    },
    scorerReceiptChecksum: scorer.receiptChecksum,
    canonicalAuthority: false, writesPerformed: false, retrievalOrderChanged: false,
  });
}
