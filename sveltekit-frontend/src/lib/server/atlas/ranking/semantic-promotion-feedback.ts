import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SEMANTIC_REPRESENTATION_ID } from '$lib/server/embedding/embedding-contract-768.js';
import type { RepairSemanticTournamentReceiptV1 } from '$lib/server/atlas/retrieval/repair-semantic-corpus.js';
import {
  SEARCH_POLICY_FEATURE_NAMES,
  buildSearchPolicyFeatureMatrix,
  buildTangPromotionRecommendation,
  type MatrixDiagnosticsV1,
  type SearchPolicyFeatureMatrixV1,
  type TangPromotionRecommendationV1,
} from './adaptive-search-policy.js';
import {
  buildTokenAwareContextPlan,
  type ContextWindowPlanV1,
} from './context-window-synthesis.js';
import type { PacketFeatureRow } from './packet-feature-matrix.js';
import {
  AgenticRepairEvidenceGateInputV1Schema,
  RepairContextManifestV1Schema,
  RepairEvidenceCandidateV1Schema,
  type AgenticRepairEvidenceGateInputV1,
  type AgenticRepairEvidenceGateResultV1,
  type RepairContextManifestV1,
  type RepairEvidenceCandidateV1,
} from './agentic-repair-evidence-gate.js';

/**
 * Feedback seam from the bounded CAGRA -> brute-force exact semantic tournament
 * back into the existing Parent Atlas repair ranking/context fabric.
 *
 * Exact promotion does NOT create a second logical lane and does NOT convert
 * squared-Euclidean distance into a fake probability. The raw exact distance is
 * preserved as evidence; the only score feedback is a deterministic bounded
 * exact-rank percentile used as a heuristic semantic feature floor.
 */

export const SemanticPromotionScorePolicySchema = z.literal('BOUNDED_EXACT_RANK_PERCENTILE_V1');
export type SemanticPromotionScorePolicy = z.infer<typeof SemanticPromotionScorePolicySchema>;

export const SemanticPromotionDeltaV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRevision: z.string().min(1),
  exactRank: z.number().int().positive(),
  promotedCount: z.number().int().positive(),
  rawExactDistance: z.number().finite().nonnegative(),
  cagraRank: z.number().int().positive().nullable(),
  priorSemanticScore: z.number().finite().min(0).max(1),
  rankPercentileScore: z.number().finite().min(0).max(1),
  semanticScoreAfter: z.number().finite().min(0).max(1),
  scoreChanged: z.boolean(),
  exactEvidenceBefore: z.boolean(),
  exactEvidenceAfter: z.boolean(),
  evidenceRefsAdded: z.array(z.string().min(1)),
}).strict();
export type SemanticPromotionDeltaV1 = z.infer<typeof SemanticPromotionDeltaV1Schema>;

export const SemanticPromotionExclusionV1Schema = z.object({
  packetKey: z.string().min(1),
  sourceRevision: z.string().min(1),
  reason: z.enum([
    'CANDIDATE_NOT_FOUND',
    'SOURCE_REVISION_MISMATCH',
    'DUPLICATE_PROMOTION_IDENTITY',
  ]),
  detail: z.string().min(1),
}).strict();
export type SemanticPromotionExclusionV1 = z.infer<typeof SemanticPromotionExclusionV1Schema>;

export const SemanticPromotionReceiptV1Schema = z.object({
  schema: z.literal('atlas.semantic-promotion-receipt.v1'),
  requestId: z.string().min(1),
  status: z.enum(['APPLIED', 'SKIPPED']),
  reason: z.string().min(1),
  logicalLane: z.literal('semantic'),
  representationId: z.literal(SEMANTIC_REPRESENTATION_ID),
  representationRevision: z.string().min(1).nullable(),
  scorePolicy: SemanticPromotionScorePolicySchema,
  distanceConvertedToSimilarity: z.literal(false),
  exactDistanceUsedAsObservedEvidenceOnly: z.literal(true),
  promotedPacketKeys: z.array(z.string().min(1)),
  deltas: z.array(SemanticPromotionDeltaV1Schema),
  exclusions: z.array(SemanticPromotionExclusionV1Schema),
  changedCandidateCount: z.number().int().nonnegative(),
  invariants: z.object({
    oneSemanticLaneVote: z.literal(true),
    cagraIndependentLaneVote: z.literal(false),
    exactIndependentLaneVote: z.literal(false),
    exactPromotionDoesNotCreateSourceEvidence: z.literal(true),
    exactPromotionDoesNotAuthorizeMutation: z.literal(true),
    canonicalWritesAllowed: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type SemanticPromotionReceiptV1 = z.infer<typeof SemanticPromotionReceiptV1Schema>;

export const RepairContextManifestV2Schema = z.object({
  schema: z.literal('atlas.repair-context-manifest.v2'),
  requestId: z.string().min(1),
  parentManifest: RepairContextManifestV1Schema,
  semanticPromotion: z.object({
    status: z.enum(['APPLIED', 'SKIPPED']),
    receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
    promotedPacketKeys: z.array(z.string().min(1)),
    changedCandidateCount: z.number().int().nonnegative(),
    scorePolicy: SemanticPromotionScorePolicySchema,
  }).strict(),
  selectedPacketKeys: z.array(z.string().min(1)),
  selectedSourceRefs: z.array(z.string().min(1)),
  featureMatrix: z.object({
    rows: z.number().int().nonnegative(),
    cols: z.number().int().positive(),
    featureNames: z.array(z.string().min(1)),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    parentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    changed: z.boolean(),
  }).strict(),
  tokenBudget: z.object({
    availableTokens: z.number().int().positive(),
    selectedTokens: z.number().int().nonnegative(),
    unusedTokens: z.number().int().nonnegative(),
    exactEvidenceFloorSatisfied: z.boolean(),
    parentSelectedTokens: z.number().int().nonnegative(),
  }).strict(),
  matrixDiagnosticsInvalidatedByPromotion: z.boolean(),
  tangStatus: z.string().min(1),
  invariants: z.object({
    parentEvidenceGatePreserved: z.literal(true),
    onlySemanticScoreMayIncrease: z.literal(true),
    exactEvidenceBitMayNotBeCreatedBySemanticPromotion: z.literal(true),
    oneVotePerLogicalLane: z.literal(true),
    graphNeverAnswersDirectly: z.literal(true),
    evidenceAuthorizesMutation: z.literal(false),
    sideEffectsAuthorized: z.literal(false),
    canonicalWritesAllowed: z.literal(false),
  }).strict(),
  producerRevision: z.string().min(1),
}).strict();
export type RepairContextManifestV2 = z.infer<typeof RepairContextManifestV2Schema>;

export type SemanticPromotionFeedbackResultV1 = {
  schema: 'atlas.semantic-promotion-feedback-result.v1';
  receipt: SemanticPromotionReceiptV1;
  candidates: RepairEvidenceCandidateV1[];
  featureMatrix: SearchPolicyFeatureMatrixV1;
  tangPromotion: TangPromotionRecommendationV1;
  contextPlan: ContextWindowPlanV1;
  manifest: RepairContextManifestV2;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === 'object' && !(item instanceof Float32Array)) {
      return Object.keys(item as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((out, key) => {
          out[key] = (item as Record<string, unknown>)[key];
          return out;
        }, {});
    }
    if (item instanceof Float32Array) return Array.from(item);
    return item;
  });
}

function sha256Stable(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function matrixHash(matrix: SearchPolicyFeatureMatrixV1): string {
  const bytes = Buffer.from(matrix.values.buffer, matrix.values.byteOffset, matrix.values.byteLength);
  const header = stableJson({
    packetKeys: matrix.packetKeys,
    featureNames: matrix.featureNames,
    rows: matrix.rows,
    cols: matrix.cols,
  });
  return createHash('sha256').update(header).update(bytes).digest('hex');
}

function packetIdentity(candidate: RepairEvidenceCandidateV1): string {
  return candidate.packetKey ?? `source:${candidate.sourceRef}`;
}

function rankPercentile(rank: number, count: number): number {
  if (count <= 0) return 0;
  return clamp01((count - rank + 1) / count);
}

function baseFeatureRow(candidate: RepairEvidenceCandidateV1): PacketFeatureRow {
  return {
    packetKey: packetIdentity(candidate),
    semanticScore: clamp01(Math.max(candidate.semanticScore, candidate.lexicalScore * 0.5)),
    centroidAffinity: candidate.centroidAffinity,
    quaternionAffinity: 0,
    graphAuthority: candidate.graphAuthority,
    demandUtility: candidate.demandUtility,
    executionUtility: candidate.executionUtility,
    recency: candidate.recency,
    cacheHotness: candidate.cacheHotness,
    normalizedCost: candidate.normalizedCost,
  };
}

function contextUtilityByPacket(contextPlan: ContextWindowPlanV1): Map<string, number> {
  const values = new Map<string, number>();
  for (const window of contextPlan.windows) {
    for (const member of window.members) {
      values.set(member.packetKey, Math.max(values.get(member.packetKey) ?? 0, member.contextWindowUtility));
    }
  }
  return values;
}

function buildContextPlan(
  input: AgenticRepairEvidenceGateInputV1,
  candidates: readonly RepairEvidenceCandidateV1[],
): ContextWindowPlanV1 {
  return buildTokenAwareContextPlan({
    schema: 'atlas.context-window-input.v1',
    requestId: input.requestId,
    queryText: input.queryText,
    topoClass: 0,
    clusterId: null,
    resolvedDir: input.targetFiles[0]
      ? input.targetFiles[0].split('/').slice(0, -1).join('/') || null
      : null,
    workspaceRevision: input.workspaceRevision,
    candidates: candidates.map((candidate) => ({
      packetKey: packetIdentity(candidate),
      sourceRef: candidate.sourceRef,
      // Context assembly needs a non-empty revision field but it must not fabricate
      // candidate evidence. Unknown candidate lineage remains explicitly unresolved.
      sourceRevision: candidate.sourceRevision ?? 'unresolved:candidate-source-revision',
      ordinal: candidate.ordinal,
      tokenCount: candidate.tokenCount,
      score: clamp01(Math.max(candidate.semanticScore, candidate.lexicalScore)),
      exactEvidence: candidate.exactEvidence,
      cacheHotness: candidate.cacheHotness,
      graphAuthority: candidate.graphAuthority,
      communityId: candidate.communityId,
      contentRef: candidate.contentRef,
    })),
    budget: input.contextBudget,
    producerRevision: input.producerRevision,
  });
}

function featureMatrixAndTang(
  input: AgenticRepairEvidenceGateInputV1,
  candidates: readonly RepairEvidenceCandidateV1[],
  contextPlan: ContextWindowPlanV1,
  diagnostics: MatrixDiagnosticsV1 | null,
): { matrix: SearchPolicyFeatureMatrixV1; tang: TangPromotionRecommendationV1 } {
  const contextUtility = contextUtilityByPacket(contextPlan);
  const baseRows = candidates.map(baseFeatureRow);
  const initialPolicyRows = candidates.map((candidate) => ({
    packetKey: packetIdentity(candidate),
    hopProximity: candidate.hopDistance == null ? 0 : clamp01(1 / (1 + candidate.hopDistance)),
    pathCostUtility: candidate.pathCost == null ? 0 : clamp01(1 / (1 + candidate.pathCost)),
    communityOverlap: candidate.communityOverlap,
    pprAffinity: candidate.pprAffinity,
    contextWindowUtility: contextUtility.get(packetIdentity(candidate)) ?? 0,
    tangPromotionProbability: 0,
    exactEvidence: candidate.exactEvidence ? 1 : 0,
  }));

  const initialMatrix = buildSearchPolicyFeatureMatrix({
    baseRows,
    policyRows: initialPolicyRows,
  });
  const matrixRows = Array.from({ length: initialMatrix.rows }, (_unused, rowIndex) => {
    const start = rowIndex * initialMatrix.cols;
    return Array.from(initialMatrix.values.slice(start, start + initialMatrix.cols));
  });
  const tang = buildTangPromotionRecommendation({
    packetKeys: initialMatrix.packetKeys,
    matrixRows,
    diagnostics,
    policy: {
      maxEffectiveRankRatio: 0.35,
      minRetainedEnergyPercent: 80,
      maxConditionNumber: 1_000_000,
      promotionCount: Math.min(input.searchBudget.exactPromotionTopK, Math.max(1, candidates.length)),
    },
  });
  const tangByPacket = new Map(tang.rows.map((row) => [row.packetKey, row.samplingProbability]));

  return {
    matrix: buildSearchPolicyFeatureMatrix({
      baseRows,
      policyRows: initialPolicyRows.map((row) => ({
        ...row,
        tangPromotionProbability: tangByPacket.get(row.packetKey) ?? 0,
      })),
    }),
    tang,
  };
}

export function buildSemanticPromotionReceipt(
  input: {
    requestId: string;
    candidates: readonly RepairEvidenceCandidateV1[];
    tournament: RepairSemanticTournamentReceiptV1;
    producerRevision: string;
  },
): SemanticPromotionReceiptV1 {
  const candidateByPacket = new Map(
    input.candidates
      .filter((candidate): candidate is RepairEvidenceCandidateV1 & { packetKey: string } => Boolean(candidate.packetKey))
      .map((candidate) => [candidate.packetKey, candidate]),
  );

  if (input.tournament.status !== 'EXECUTED' || !input.tournament.challenger) {
    return SemanticPromotionReceiptV1Schema.parse({
      schema: 'atlas.semantic-promotion-receipt.v1',
      requestId: input.requestId,
      status: 'SKIPPED',
      reason: `SEMANTIC_TOURNAMENT_${input.tournament.status}:${input.tournament.reason}`,
      logicalLane: 'semantic',
      representationId: SEMANTIC_REPRESENTATION_ID,
      representationRevision: input.tournament.corpus.representationRevision,
      scorePolicy: 'BOUNDED_EXACT_RANK_PERCENTILE_V1',
      distanceConvertedToSimilarity: false,
      exactDistanceUsedAsObservedEvidenceOnly: true,
      promotedPacketKeys: [],
      deltas: [],
      exclusions: [],
      changedCandidateCount: 0,
      invariants: {
        oneSemanticLaneVote: true,
        cagraIndependentLaneVote: false,
        exactIndependentLaneVote: false,
        exactPromotionDoesNotCreateSourceEvidence: true,
        exactPromotionDoesNotAuthorizeMutation: true,
        canonicalWritesAllowed: false,
      },
      producerRevision: input.producerRevision,
    });
  }

  const promoted = input.tournament.challenger.promoted;
  const seen = new Set<string>();
  const deltas: SemanticPromotionDeltaV1[] = [];
  const exclusions: SemanticPromotionExclusionV1[] = [];

  for (const hit of promoted) {
    const identity = `${hit.packetKey}\0${hit.sourceRevision}`;
    if (seen.has(identity)) {
      exclusions.push(SemanticPromotionExclusionV1Schema.parse({
        packetKey: hit.packetKey,
        sourceRevision: hit.sourceRevision,
        reason: 'DUPLICATE_PROMOTION_IDENTITY',
        detail: identity,
      }));
      continue;
    }
    seen.add(identity);

    const candidate = candidateByPacket.get(hit.packetKey);
    if (!candidate) {
      exclusions.push(SemanticPromotionExclusionV1Schema.parse({
        packetKey: hit.packetKey,
        sourceRevision: hit.sourceRevision,
        reason: 'CANDIDATE_NOT_FOUND',
        detail: 'exact-promoted packet is outside the localized repair candidate set',
      }));
      continue;
    }
    if (candidate.sourceRevision !== hit.sourceRevision) {
      exclusions.push(SemanticPromotionExclusionV1Schema.parse({
        packetKey: hit.packetKey,
        sourceRevision: hit.sourceRevision,
        reason: 'SOURCE_REVISION_MISMATCH',
        detail: `candidate=${candidate.sourceRevision ?? 'null'} exact=${hit.sourceRevision}`,
      }));
      continue;
    }

    const rankScore = rankPercentile(hit.rank, promoted.length);
    const after = clamp01(Math.max(candidate.semanticScore, rankScore));
    const evidenceRefsAdded = [
      `semantic-promotion:${input.requestId}:rank:${hit.rank}`,
      `semantic-exact-distance:${hit.exactDistance}`,
      `semantic-exact-backend:cuvs.brute_force`,
    ];
    deltas.push(SemanticPromotionDeltaV1Schema.parse({
      packetKey: hit.packetKey,
      sourceRevision: hit.sourceRevision,
      exactRank: hit.rank,
      promotedCount: promoted.length,
      rawExactDistance: hit.exactDistance,
      cagraRank: hit.cagraRank,
      priorSemanticScore: candidate.semanticScore,
      rankPercentileScore: rankScore,
      semanticScoreAfter: after,
      scoreChanged: after !== candidate.semanticScore,
      exactEvidenceBefore: candidate.exactEvidence,
      exactEvidenceAfter: candidate.exactEvidence,
      evidenceRefsAdded,
    }));
  }

  return SemanticPromotionReceiptV1Schema.parse({
    schema: 'atlas.semantic-promotion-receipt.v1',
    requestId: input.requestId,
    status: deltas.length ? 'APPLIED' : 'SKIPPED',
    reason: deltas.length ? 'BOUNDED_EXACT_SEMANTIC_PROMOTION_JOINED' : 'NO_EXACT_PROMOTED_PACKET_JOINED',
    logicalLane: 'semantic',
    representationId: SEMANTIC_REPRESENTATION_ID,
    representationRevision: input.tournament.corpus.representationRevision,
    scorePolicy: 'BOUNDED_EXACT_RANK_PERCENTILE_V1',
    distanceConvertedToSimilarity: false,
    exactDistanceUsedAsObservedEvidenceOnly: true,
    promotedPacketKeys: uniqueSorted(deltas.map((delta) => delta.packetKey)),
    deltas,
    exclusions,
    changedCandidateCount: deltas.filter((delta) => delta.scoreChanged).length,
    invariants: {
      oneSemanticLaneVote: true,
      cagraIndependentLaneVote: false,
      exactIndependentLaneVote: false,
      exactPromotionDoesNotCreateSourceEvidence: true,
      exactPromotionDoesNotAuthorizeMutation: true,
      canonicalWritesAllowed: false,
    },
    producerRevision: input.producerRevision,
  });
}

export function applySemanticPromotionReceipt(
  candidates: readonly RepairEvidenceCandidateV1[],
  receipt: SemanticPromotionReceiptV1,
): RepairEvidenceCandidateV1[] {
  const deltaByPacket = new Map(receipt.deltas.map((delta) => [delta.packetKey, delta]));
  return candidates.map((candidate) => {
    if (!candidate.packetKey) return candidate;
    const delta = deltaByPacket.get(candidate.packetKey);
    if (!delta || candidate.sourceRevision !== delta.sourceRevision) return candidate;

    return RepairEvidenceCandidateV1Schema.parse({
      ...candidate,
      semanticScore: delta.semanticScoreAfter,
      // Semantic exact promotion is not byte/source exact evidence. Preserve the
      // original source-evidence bit exactly.
      exactEvidence: candidate.exactEvidence,
      lanes: uniqueSorted([...candidate.lanes, 'semantic']),
      executors: uniqueSorted([...candidate.executors, 'cuvs.brute_force:exact-promotion']),
      evidenceRefs: uniqueSorted([...candidate.evidenceRefs, ...delta.evidenceRefsAdded]),
    });
  });
}

export function rebuildRepairAfterSemanticPromotion(
  rawInput: AgenticRepairEvidenceGateInputV1,
  gateResult: AgenticRepairEvidenceGateResultV1,
  tournament: RepairSemanticTournamentReceiptV1,
  producerRevision = 'semantic-promotion-feedback.v1',
): SemanticPromotionFeedbackResultV1 {
  const input = AgenticRepairEvidenceGateInputV1Schema.parse(rawInput);
  if (gateResult.manifest.requestId !== input.requestId || tournament.requestId !== input.requestId) {
    throw new Error('SEMANTIC_PROMOTION_REQUEST_ID_MISMATCH');
  }

  const receipt = buildSemanticPromotionReceipt({
    requestId: input.requestId,
    candidates: gateResult.candidates,
    tournament,
    producerRevision,
  });
  const candidates = applySemanticPromotionReceipt(gateResult.candidates, receipt);
  const contextPlan = buildContextPlan(input, candidates);

  // Any changed semantic feature invalidates previously measured matrix rank/SVD
  // diagnostics. Re-measure instead of reusing diagnostics for the old matrix.
  const diagnostics = receipt.changedCandidateCount > 0
    ? null
    : input.matrixDiagnostics as MatrixDiagnosticsV1 | null;
  const { matrix: featureMatrix, tang: tangPromotion } = featureMatrixAndTang(
    input,
    candidates,
    contextPlan,
    diagnostics,
  );

  const selectedSet = new Set(contextPlan.selectedPacketKeys);
  const selectedCandidates = candidates.filter((candidate) => selectedSet.has(packetIdentity(candidate)));
  const parentMatrixHash = gateResult.manifest.featureMatrix.sha256;
  const nextMatrixHash = matrixHash(featureMatrix);
  const manifest = RepairContextManifestV2Schema.parse({
    schema: 'atlas.repair-context-manifest.v2',
    requestId: input.requestId,
    parentManifest: gateResult.manifest as RepairContextManifestV1,
    semanticPromotion: {
      status: receipt.status,
      receiptSha256: sha256Stable(receipt),
      promotedPacketKeys: receipt.promotedPacketKeys,
      changedCandidateCount: receipt.changedCandidateCount,
      scorePolicy: receipt.scorePolicy,
    },
    selectedPacketKeys: uniqueSorted(selectedCandidates.flatMap((candidate) => candidate.packetKey ? [candidate.packetKey] : [])),
    selectedSourceRefs: uniqueSorted(selectedCandidates.map((candidate) => candidate.sourceRef)),
    featureMatrix: {
      rows: featureMatrix.rows,
      cols: featureMatrix.cols,
      featureNames: [...SEARCH_POLICY_FEATURE_NAMES],
      sha256: nextMatrixHash,
      parentSha256: parentMatrixHash,
      changed: nextMatrixHash !== parentMatrixHash,
    },
    tokenBudget: {
      availableTokens: contextPlan.availableTokens,
      selectedTokens: contextPlan.selectedTokens,
      unusedTokens: contextPlan.unusedTokens,
      exactEvidenceFloorSatisfied: contextPlan.exactEvidenceFloorSatisfied,
      parentSelectedTokens: gateResult.contextPlan.selectedTokens,
    },
    matrixDiagnosticsInvalidatedByPromotion: receipt.changedCandidateCount > 0,
    tangStatus: tangPromotion.status,
    invariants: {
      parentEvidenceGatePreserved: true,
      onlySemanticScoreMayIncrease: true,
      exactEvidenceBitMayNotBeCreatedBySemanticPromotion: true,
      oneVotePerLogicalLane: true,
      graphNeverAnswersDirectly: true,
      evidenceAuthorizesMutation: false,
      sideEffectsAuthorized: false,
      canonicalWritesAllowed: false,
    },
    producerRevision,
  });

  return {
    schema: 'atlas.semantic-promotion-feedback-result.v1',
    receipt,
    candidates,
    featureMatrix,
    tangPromotion,
    contextPlan,
    manifest,
  };
}
