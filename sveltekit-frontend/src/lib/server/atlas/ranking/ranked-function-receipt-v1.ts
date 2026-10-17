import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type FmRank4ModelArtifactV1,
  FUNCTION_RANKING_FEATURES_12,
  scoreCandidateFmRank4,
} from './fm-ranker-v1.js';
import {
  AST_DEFINED,
  SOURCE_PROVEN,
  isCandidateEligible,
} from '../contracts/symbol-evidence-v1.js';

export const RANKED_FUNCTION_RECEIPT_SCHEMA = 'atlas.ranked-function-receipt.v1' as const;

export const RankedCandidateFunctionItemSchema = z
  .object({
    rank: z.number().int().positive(),
    candidateOrdinal: z.number().int().nonnegative(),
    packetKey: z.string().min(1),
    canonicalId: z.string().min(1),
    symbolName: z.string().min(1),
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    features: z.array(z.number().finite()).length(12),
    score: z.number().finite(),
    eligibilityMask: z.number().int().nonnegative(),
    featureLabels: z.array(z.string()),
  })
  .strict();
export type RankedCandidateFunctionItem = z.infer<typeof RankedCandidateFunctionItemSchema>;

export const RankedFunctionReceiptV1Schema = z
  .object({
    schema: z.literal(RANKED_FUNCTION_RECEIPT_SCHEMA),
    receiptId: z.string().min(1),
    receiptChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    queryText: z.string().min(1),
    queryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    modelId: z.string().min(1),
    modelRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    workspaceRevision: z.string().min(1),
    graphRevision: z.string().nullable(),
    rankedCandidates: z.array(RankedCandidateFunctionItemSchema),
    totalCandidatesConsidered: z.number().int().nonnegative(),
    eligibleCandidatesCount: z.number().int().nonnegative(),
    topK: z.number().int().positive(),
    featureNames: z.array(z.string()).length(12),
    // Architectural safety invariants
    singleVoteInvariantEnforced: z.literal(true),
    authorityCreated: z.literal(false),
    writesPerformed: z.literal(false),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type RankedFunctionReceiptV1 = z.infer<typeof RankedFunctionReceiptV1Schema>;

export interface RawCandidateFunctionInputV1 {
  candidateOrdinal: number;
  packetKey: string;
  canonicalId: string;
  symbolName: string;
  sourceRef: string;
  sourceRevision: string;
  features: readonly number[]; // length 12
  eligibilityMask: number;     // must satisfy AST_DEFINED | SOURCE_PROVEN to be eligible
  featureLabels?: readonly string[];
}

/**
 * FM-09: 8095 -> SearchRuntime -> Ranked Function Receipt.
 * Filters verified function candidates via eligibility bitmask, scores them through
 * the frozen FM Rank-4 (61-parameter) low-rank ranker, and produces an immutable,
 * deterministic selection receipt.
 */
export function rankFunctionsWithFm4V1(input: {
  queryText: string;
  workspaceRevision: string;
  graphRevision?: string | null;
  model: FmRank4ModelArtifactV1;
  candidates: readonly RawCandidateFunctionInputV1[];
  topK?: number;
}): RankedFunctionReceiptV1 {
  const topK = input.topK ?? 5;
  const queryDigest = `sha256:${createHash('sha256').update(input.queryText.trim(), 'utf8').digest('hex')}`;

  // 1. Gate eligibility: Hard prerequisite AST_DEFINED | SOURCE_PROVEN
  const eligibleCandidates = input.candidates.filter((c) => isCandidateEligible(c.eligibilityMask));

  // 2. Score candidates using frozen FM Rank-4 model
  const scored = eligibleCandidates.map((c) => ({
    candidate: c,
    score: scoreCandidateFmRank4(input.model, c.features),
  }));

  // 3. Stable tie-break sorting: score descending, candidateOrdinal ascending
  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) {
      return b.score - a.score;
    }
    return a.candidate.candidateOrdinal - b.candidate.candidateOrdinal;
  });

  // 4. Bounded top-K slice
  const topSlice = scored.slice(0, topK);

  const rankedCandidates: RankedCandidateFunctionItem[] = topSlice.map((item, idx) => ({
    rank: idx + 1,
    candidateOrdinal: item.candidate.candidateOrdinal,
    packetKey: item.candidate.packetKey,
    canonicalId: item.candidate.canonicalId,
    symbolName: item.candidate.symbolName,
    sourceRef: item.candidate.sourceRef,
    sourceRevision: item.candidate.sourceRevision,
    features: [...item.candidate.features],
    score: Number(item.score.toFixed(6)),
    eligibilityMask: item.candidate.eligibilityMask,
    featureLabels: [...(item.candidate.featureLabels ?? [])],
  }));

  // 5. Compute immutable receipt checksum
  const payloadToHash = JSON.stringify({
    queryDigest,
    modelRevision: input.model.modelRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision ?? null,
    rankedOrdinals: rankedCandidates.map((c) => c.candidateOrdinal),
    scores: rankedCandidates.map((c) => c.score),
  });
  const receiptHash = createHash('sha256').update(payloadToHash, 'utf8').digest('hex');
  const receiptChecksum = `sha256:${receiptHash}`;
  const receiptId = `rec_fn_${receiptHash.slice(0, 16)}`;

  return RankedFunctionReceiptV1Schema.parse({
    schema: RANKED_FUNCTION_RECEIPT_SCHEMA,
    receiptId,
    receiptChecksum,
    queryText: input.queryText,
    queryDigest,
    modelId: input.model.modelId,
    modelRevision: input.model.modelRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision ?? null,
    rankedCandidates,
    totalCandidatesConsidered: input.candidates.length,
    eligibleCandidatesCount: eligibleCandidates.length,
    topK,
    featureNames: [...FUNCTION_RANKING_FEATURES_12],
    singleVoteInvariantEnforced: true,
    authorityCreated: false,
    writesPerformed: false,
    canonicalAuthority: false,
  });
}
