import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  AgenticRepairLibrarySchema,
  AgenticRepairLibraryLookupObservationV1Schema,
  rankAgenticRepairReadiness,
  type AgenticRepairLibrary,
  type AgenticRepairLibraryFetchParametersV1,
  type AgenticRepairLibraryLookupObservationV1,
  type AgenticRepairReadinessResultV1,
} from './agentic-repair-readiness-ranker.js';
import {
  AdaptiveSearchBudgetV1Schema,
  MatrixDiagnosticsV1Schema,
  SEARCH_POLICY_FEATURE_NAMES,
  buildAdaptiveSearchPlan,
  buildSearchPolicyFeatureMatrix,
  buildTangPromotionRecommendation,
  type AdaptiveSearchPlanV1,
  type MatrixDiagnosticsV1,
  type SearchPolicyFeatureMatrixV1,
  type TangPromotionRecommendationV1,
} from './adaptive-search-policy.js';
import {
  ContextWindowBudgetV1Schema,
  buildTokenAwareContextPlan,
  type ContextWindowPlanV1,
} from './context-window-synthesis.js';
import type { PacketFeatureRow } from './packet-feature-matrix.js';

/**
 * Canonical non-mutating evidence gate for agentic repair.
 *
 * Runtime adapters execute only read-only discovery calls and return normalized
 * batches. This module owns identity merge, readiness, feature assembly, Tang
 * promotion recommendations, token-aware context selection, and the compact
 * repair ContextManifest receipt.
 *
 * Retrieved evidence NEVER authorizes mutation. A caller may separately apply
 * an operator/DAG authorization policy after this gate succeeds.
 */

export const RepairEvidenceLogicalLaneSchema = z.enum([
  'canonical',
  'semantic',
  'lexical',
  'structural',
  'graph',
  'context',
  'centroid',
]);
export type RepairEvidenceLogicalLane = z.infer<typeof RepairEvidenceLogicalLaneSchema>;

export const RepairEvidenceCandidateV1Schema = z.object({
  candidateId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1).nullable(),
  ordinal: z.number().int().nonnegative(),
  tokenCount: z.number().int().positive(),
  semanticScore: z.number().finite().min(0).max(1),
  lexicalScore: z.number().finite().min(0).max(1),
  graphAuthority: z.number().finite().min(0).max(1),
  centroidAffinity: z.number().finite().min(0).max(1),
  cacheHotness: z.number().finite().min(0).max(1),
  demandUtility: z.number().finite().min(0).max(1),
  executionUtility: z.number().finite().min(0).max(1),
  recency: z.number().finite().min(0).max(1),
  normalizedCost: z.number().finite().min(0).max(1),
  hopDistance: z.number().int().nonnegative().nullable(),
  pathCost: z.number().finite().nonnegative().nullable(),
  communityId: z.string().min(1).nullable(),
  communityOverlap: z.number().finite().min(0).max(1),
  pprAffinity: z.number().finite().min(0).max(1),
  exactEvidence: z.boolean(),
  contentRef: z.string().min(1),
  lanes: z.array(RepairEvidenceLogicalLaneSchema).min(1),
  executors: z.array(z.string().min(1)).min(1),
  evidenceRefs: z.array(z.string().min(1)),
}).strict();
export type RepairEvidenceCandidateV1 = z.infer<typeof RepairEvidenceCandidateV1Schema>;

export const RepairEvidenceBatchV1Schema = z.object({
  schema: z.literal('atlas.repair-evidence-batch.v1'),
  library: AgenticRepairLibrarySchema,
  executor: z.string().min(1),
  backend: z.string().min(1),
  reachable: z.boolean(),
  degraded: z.boolean(),
  latencyMs: z.number().finite().nonnegative(),
  observedRevision: z.string().min(1).nullable(),
  candidates: z.array(RepairEvidenceCandidateV1Schema),
  sourceRefs: z.array(z.string().min(1)),
  evidenceRefs: z.array(z.string().min(1)),
  cacheHitCount: z.number().int().nonnegative(),
  cacheProbeCount: z.number().int().nonnegative(),
  reasonCodes: z.array(z.string().min(1)),
}).strict().superRefine((value, ctx) => {
  if (value.cacheHitCount > value.cacheProbeCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cacheHitCount'],
      message: 'cacheHitCount must be <= cacheProbeCount',
    });
  }
});
export type RepairEvidenceBatchV1 = z.infer<typeof RepairEvidenceBatchV1Schema>;

export const RepairEvidenceReadRequestV1Schema = z.object({
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  targetFiles: z.array(z.string().min(1)).max(256),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  topK: z.number().int().positive().max(10_000),
  graphHops: z.number().int().nonnegative().max(8),
  graphFanout: z.number().int().positive().max(10_000),
  latencyBudgetMs: z.number().int().positive().max(120_000),
}).strict();
export type RepairEvidenceReadRequestV1 = z.infer<typeof RepairEvidenceReadRequestV1Schema>;

export interface RepairEvidenceReadOnlyExecutor {
  packetLookup(request: RepairEvidenceReadRequestV1): Promise<RepairEvidenceBatchV1>;
  semanticSearch(request: RepairEvidenceReadRequestV1): Promise<RepairEvidenceBatchV1>;
  graphExpand(request: RepairEvidenceReadRequestV1 & { seedSourceRefs: string[] }): Promise<RepairEvidenceBatchV1>;
  aceValidate(request: RepairEvidenceReadRequestV1 & { candidateSourceRefs: string[] }): Promise<RepairEvidenceBatchV1>;
  centroidLookup(request: RepairEvidenceReadRequestV1): Promise<RepairEvidenceBatchV1>;
}

export const AgenticRepairEvidenceGateInputV1Schema = z.object({
  schema: z.literal('atlas.agentic-repair-evidence-gate-input.v1'),
  requestId: z.string().min(1),
  queryText: z.string().min(1),
  targetFiles: z.array(z.string().min(1)).max(256),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  searchBudget: AdaptiveSearchBudgetV1Schema,
  contextBudget: ContextWindowBudgetV1Schema,
  matrixDiagnostics: MatrixDiagnosticsV1Schema.nullable(),
  readinessPolicy: z.object({
    minRequiredLibraryMeanPercent: z.number().finite().min(0).max(100),
    minOverallMeanPercent: z.number().finite().min(0).max(100),
    minDegradedOverallMeanPercent: z.number().finite().min(0).max(100),
    minSourceRefsPerRequiredLibrary: z.number().int().nonnegative().max(10_000),
  }).strict(),
}).strict();
export type AgenticRepairEvidenceGateInputV1 = z.infer<typeof AgenticRepairEvidenceGateInputV1Schema>;

export const RepairContextManifestV1Schema = z.object({
  schema: z.literal('atlas.repair-context-manifest.v1'),
  requestId: z.string().min(1),
  queryHash: z.string().regex(/^[a-f0-9]{16}$/),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  readinessGate: z.enum(['READY', 'DEGRADED', 'BLOCKED']),
  evidenceStatus: z.enum(['READY_FOR_DRY_RUN', 'DEGRADED_EVIDENCE', 'BLOCKED']),
  recommendationAllowed: z.boolean(),
  selectedPacketKeys: z.array(z.string().min(1)),
  selectedSourceRefs: z.array(z.string().min(1)),
  exactEvidencePacketKeys: z.array(z.string().min(1)),
  candidateCount: z.number().int().nonnegative(),
  selectedCandidateCount: z.number().int().nonnegative(),
  featureMatrix: z.object({
    rows: z.number().int().nonnegative(),
    cols: z.number().int().positive(),
    featureNames: z.array(z.string().min(1)),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  tokenBudget: z.object({
    availableTokens: z.number().int().positive(),
    selectedTokens: z.number().int().nonnegative(),
    unusedTokens: z.number().int().nonnegative(),
    exactEvidenceFloorSatisfied: z.boolean(),
  }).strict(),
  searchAlgorithms: z.array(z.string().min(1)),
  executorReceipts: z.array(z.object({
    library: AgenticRepairLibrarySchema,
    executor: z.string().min(1),
    backend: z.string().min(1),
    reachable: z.boolean(),
    degraded: z.boolean(),
    latencyMs: z.number().finite().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    evidenceRefs: z.array(z.string().min(1)),
  }).strict()),
  cacheActionsProposalOnly: z.literal(true),
  exactPromotionRequired: z.literal(true),
  oneVotePerLogicalLane: z.literal(true),
  graphNeverAnswersDirectly: z.literal(true),
  evidenceAuthorizesMutation: z.literal(false),
  sideEffectsAuthorized: z.literal(false),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type RepairContextManifestV1 = z.infer<typeof RepairContextManifestV1Schema>;

export type AgenticRepairEvidenceGateResultV1 = {
  schema: 'atlas.agentic-repair-evidence-gate-result.v1';
  readiness: AgenticRepairReadinessResultV1;
  searchPlan: AdaptiveSearchPlanV1;
  batches: RepairEvidenceBatchV1[];
  candidates: RepairEvidenceCandidateV1[];
  featureMatrix: SearchPolicyFeatureMatrixV1;
  tangPromotion: TangPromotionRecommendationV1;
  contextPlan: ContextWindowPlanV1;
  manifest: RepairContextManifestV1;
};

const REQUIRED_LIBRARIES: AgenticRepairLibrary[] = [
  'PACKET_FABRIC',
  'GRAPH_EXPANDER',
  'QDRANT',
];

function hash16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

function matrixHash(matrix: SearchPolicyFeatureMatrixV1): string {
  const bytes = Buffer.from(matrix.values.buffer, matrix.values.byteOffset, matrix.values.byteLength);
  const header = stableJson({ packetKeys: matrix.packetKeys, featureNames: matrix.featureNames, rows: matrix.rows, cols: matrix.cols });
  return createHash('sha256').update(header).update(bytes).digest('hex');
}

function canonicalMergeKey(candidate: RepairEvidenceCandidateV1): string {
  return candidate.packetKey ? `packet:${candidate.packetKey}` : `source:${candidate.sourceRef}`;
}

function mergeCandidates(batches: readonly RepairEvidenceBatchV1[]): RepairEvidenceCandidateV1[] {
  const merged = new Map<string, RepairEvidenceCandidateV1>();

  for (const batch of batches) {
    for (const raw of batch.candidates) {
      // sourceRevision is evidence provenance. The request revision is only a
      // validation constraint and must never be copied onto an observation.
      const candidate = RepairEvidenceCandidateV1Schema.parse(raw);
      const key = canonicalMergeKey(candidate);
      const previous = merged.get(key);
      if (!previous) {
        merged.set(key, candidate);
        continue;
      }

      merged.set(key, RepairEvidenceCandidateV1Schema.parse({
        ...previous,
        packetKey: previous.packetKey ?? candidate.packetKey,
        sourceRevision: previous.sourceRevision ?? candidate.sourceRevision,
        ordinal: Math.min(previous.ordinal, candidate.ordinal),
        tokenCount: Math.max(previous.tokenCount, candidate.tokenCount),
        semanticScore: Math.max(previous.semanticScore, candidate.semanticScore),
        lexicalScore: Math.max(previous.lexicalScore, candidate.lexicalScore),
        graphAuthority: Math.max(previous.graphAuthority, candidate.graphAuthority),
        centroidAffinity: Math.max(previous.centroidAffinity, candidate.centroidAffinity),
        cacheHotness: Math.max(previous.cacheHotness, candidate.cacheHotness),
        demandUtility: Math.max(previous.demandUtility, candidate.demandUtility),
        executionUtility: Math.max(previous.executionUtility, candidate.executionUtility),
        recency: Math.max(previous.recency, candidate.recency),
        normalizedCost: Math.max(previous.normalizedCost, candidate.normalizedCost),
        hopDistance: previous.hopDistance == null
          ? candidate.hopDistance
          : candidate.hopDistance == null
            ? previous.hopDistance
            : Math.min(previous.hopDistance, candidate.hopDistance),
        pathCost: previous.pathCost == null
          ? candidate.pathCost
          : candidate.pathCost == null
            ? previous.pathCost
            : Math.min(previous.pathCost, candidate.pathCost),
        communityId: previous.communityId ?? candidate.communityId,
        communityOverlap: Math.max(previous.communityOverlap, candidate.communityOverlap),
        pprAffinity: Math.max(previous.pprAffinity, candidate.pprAffinity),
        exactEvidence: previous.exactEvidence || candidate.exactEvidence,
        contentRef: previous.exactEvidence ? previous.contentRef : candidate.exactEvidence ? candidate.contentRef : previous.contentRef,
        lanes: uniqueSorted([...previous.lanes, ...candidate.lanes]),
        executors: uniqueSorted([...previous.executors, ...candidate.executors]),
        evidenceRefs: uniqueSorted([...previous.evidenceRefs, ...candidate.evidenceRefs]),
      }));
    }
  }

  return [...merged.values()].sort((a, b) => {
    if (a.exactEvidence !== b.exactEvidence) return a.exactEvidence ? -1 : 1;
    const scoreA = Math.max(a.semanticScore, a.lexicalScore, a.graphAuthority);
    const scoreB = Math.max(b.semanticScore, b.lexicalScore, b.graphAuthority);
    return scoreB - scoreA || canonicalMergeKey(a).localeCompare(canonicalMergeKey(b));
  });
}

function alignment(numerator: number, denominator: number) {
  return denominator > 0 ? { numerator: Math.min(numerator, denominator), denominator } : null;
}

function batchObservation(batch: RepairEvidenceBatchV1, input: AgenticRepairEvidenceGateInputV1): AgenticRepairLibraryLookupObservationV1 {
  const candidates = batch.candidates;
  const canonicalCount = candidates.filter((row) => row.packetKey != null && row.sourceRef.length > 0).length;
  const exactCount = candidates.filter((row) => row.exactEvidence).length;
  const revisionCount = candidates.filter((row) => row.sourceRevision === input.sourceRevision || batch.observedRevision === input.sourceRevision).length;
  const denominator = Math.max(1, candidates.length || batch.sourceRefs.length || 1);

  return AgenticRepairLibraryLookupObservationV1Schema.parse({
    schema: 'atlas.agentic-repair-library-lookup-observation.v1',
    library: batch.library,
    reachable: batch.reachable,
    latencyMs: batch.latencyMs,
    coverage: alignment(Math.min(denominator, Math.max(candidates.length, batch.sourceRefs.length)), denominator),
    exactEvidence: alignment(exactCount, denominator),
    revisionAlignment: alignment(revisionCount, denominator),
    canonicalIdentity: alignment(canonicalCount, denominator),
    cacheHits: batch.cacheProbeCount > 0 ? alignment(batch.cacheHitCount, batch.cacheProbeCount) : null,
    sourceRefs: uniqueSorted(batch.sourceRefs),
    observedRevision: batch.observedRevision,
    producerRevision: input.producerRevision,
  });
}

function fetchPlan(library: AgenticRepairLibrary, input: AgenticRepairEvidenceGateInputV1): AgenticRepairLibraryFetchParametersV1 {
  return {
    schema: 'atlas.agentic-repair-library-fetch-parameters.v1',
    library,
    topK: input.searchBudget.topK,
    latencyBudgetMs: input.searchBudget.latencyBudgetMs,
    graphHopBudget: input.searchBudget.maxGraphHops,
    graphFanoutBudget: input.searchBudget.maxGraphFanout,
    maxWarmBuckets: 16,
    centroidCandidateLimit: Math.min(input.searchBudget.maxCandidates, 10_000),
    cacheTtlSeconds: 1800,
    exactPromotionRequired: true,
  };
}

async function buildReadiness(
  input: AgenticRepairEvidenceGateInputV1,
  batches: readonly RepairEvidenceBatchV1[],
): Promise<AgenticRepairReadinessResultV1> {
  const byLibrary = new Map<AgenticRepairLibrary, RepairEvidenceBatchV1>();
  for (const batch of batches) {
    const prior = byLibrary.get(batch.library);
    if (!prior || (!prior.reachable && batch.reachable) || batch.candidates.length > prior.candidates.length) {
      byLibrary.set(batch.library, batch);
    }
  }

  const libraries = uniqueSorted([...byLibrary.keys(), ...REQUIRED_LIBRARIES]) as AgenticRepairLibrary[];
  const plans = libraries.map((library) => fetchPlan(library, input));
  const observations = new Map<AgenticRepairLibrary, AgenticRepairLibraryLookupObservationV1>();
  for (const library of libraries) {
    const batch = byLibrary.get(library);
    observations.set(library, batch
      ? batchObservation(batch, input)
      : AgenticRepairLibraryLookupObservationV1Schema.parse({
          schema: 'atlas.agentic-repair-library-lookup-observation.v1',
          library,
          reachable: false,
          latencyMs: input.searchBudget.latencyBudgetMs,
          coverage: null,
          exactEvidence: null,
          revisionAlignment: null,
          canonicalIdentity: null,
          cacheHits: null,
          sourceRefs: [],
          observedRevision: null,
          producerRevision: input.producerRevision,
        }));
  }

  return rankAgenticRepairReadiness({
    schema: 'atlas.agentic-repair-readiness-input.v1',
    requestId: input.requestId,
    queryText: input.queryText,
    targetFiles: input.targetFiles,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    fetchPlans: plans,
    gatePolicy: {
      schema: 'atlas.agentic-repair-gate-policy.v1',
      requiredLibraries: REQUIRED_LIBRARIES,
      ...input.readinessPolicy,
    },
    producerRevision: input.producerRevision,
  }, async (request) => observations.get(request.parameters.library));
}

function baseFeatureRow(candidate: RepairEvidenceCandidateV1): PacketFeatureRow {
  return {
    packetKey: candidate.packetKey ?? `source:${candidate.sourceRef}`,
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

function packetIdentity(candidate: RepairEvidenceCandidateV1): string {
  return candidate.packetKey ?? `source:${candidate.sourceRef}`;
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
    resolvedDir: input.targetFiles[0] ? input.targetFiles[0].split('/').slice(0, -1).join('/') || null : null,
    workspaceRevision: input.workspaceRevision,
    candidates: candidates.map((candidate) => ({
      packetKey: packetIdentity(candidate),
      sourceRef: candidate.sourceRef,
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

  const initialMatrix = buildSearchPolicyFeatureMatrix({ baseRows, policyRows: initialPolicyRows });
  const matrixRows = Array.from({ length: initialMatrix.rows }, (_unused, rowIndex) => {
    const start = rowIndex * initialMatrix.cols;
    return Array.from(initialMatrix.values.slice(start, start + initialMatrix.cols));
  });
  const tang = buildTangPromotionRecommendation({
    packetKeys: initialMatrix.packetKeys,
    matrixRows,
    diagnostics: input.matrixDiagnostics as MatrixDiagnosticsV1 | null,
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

function batchReceipt(batch: RepairEvidenceBatchV1) {
  return {
    library: batch.library,
    executor: batch.executor,
    backend: batch.backend,
    reachable: batch.reachable,
    degraded: batch.degraded,
    latencyMs: batch.latencyMs,
    candidateCount: batch.candidates.length,
    evidenceRefs: uniqueSorted(batch.evidenceRefs),
  };
}

function emptyBatch(library: AgenticRepairLibrary, executor: string, reason: string): RepairEvidenceBatchV1 {
  return RepairEvidenceBatchV1Schema.parse({
    schema: 'atlas.repair-evidence-batch.v1',
    library,
    executor,
    backend: 'unavailable',
    reachable: false,
    degraded: true,
    latencyMs: 0,
    observedRevision: null,
    candidates: [],
    sourceRefs: [],
    evidenceRefs: [],
    cacheHitCount: 0,
    cacheProbeCount: 0,
    reasonCodes: [reason],
  });
}

async function safeRead(
  library: AgenticRepairLibrary,
  executor: string,
  fn: () => Promise<RepairEvidenceBatchV1>,
): Promise<RepairEvidenceBatchV1> {
  try {
    const result = RepairEvidenceBatchV1Schema.parse(await fn());
    if (result.library !== library) throw new Error(`REPAIR_EVIDENCE_LIBRARY_MISMATCH:${library}:${result.library}`);
    return result;
  } catch (error) {
    return emptyBatch(library, executor, `READ_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function buildAgenticRepairEvidenceGate(
  value: AgenticRepairEvidenceGateInputV1,
  executor: RepairEvidenceReadOnlyExecutor,
): Promise<AgenticRepairEvidenceGateResultV1> {
  const input = AgenticRepairEvidenceGateInputV1Schema.parse(value);
  const request = RepairEvidenceReadRequestV1Schema.parse({
    requestId: input.requestId,
    queryText: input.queryText,
    targetFiles: input.targetFiles,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    topK: input.searchBudget.topK,
    graphHops: input.searchBudget.maxGraphHops,
    graphFanout: input.searchBudget.maxGraphFanout,
    latencyBudgetMs: input.searchBudget.latencyBudgetMs,
  });

  const [packetBatch, semanticBatch, centroidBatch] = await Promise.all([
    safeRead('PACKET_FABRIC', 'packetLookup', () => executor.packetLookup(request)),
    safeRead('QDRANT', 'semanticSearch', () => executor.semanticSearch(request)),
    safeRead('CENTROID_CACHE', 'centroidLookup', () => executor.centroidLookup(request)),
  ]);

  const initialCandidates = mergeCandidates([packetBatch, semanticBatch, centroidBatch]);
  const seedSourceRefs = uniqueSorted([
    ...input.targetFiles,
    ...initialCandidates.slice(0, Math.min(input.searchBudget.topK, 24)).map((row) => row.sourceRef),
  ]).slice(0, Math.min(input.searchBudget.maxGraphFanout, 64));

  const graphBatch = await safeRead('GRAPH_EXPANDER', 'graphExpand', () => executor.graphExpand({ ...request, seedSourceRefs }));
  const graphMerged = mergeCandidates([packetBatch, semanticBatch, centroidBatch, graphBatch]);
  const aceSourceRefs = uniqueSorted(graphMerged.slice(0, Math.min(input.searchBudget.exactPromotionTopK, 16)).map((row) => row.sourceRef));
  const aceBatch = await safeRead('ACE', 'aceValidate', () => executor.aceValidate({ ...request, candidateSourceRefs: aceSourceRefs }));

  const batches = [packetBatch, semanticBatch, graphBatch, aceBatch, centroidBatch];
  const candidates = mergeCandidates(batches)
    .slice(0, Math.min(input.searchBudget.maxCandidates, Math.max(input.searchBudget.topK * 4, input.searchBudget.exactPromotionTopK)));
  const readiness = await buildReadiness(input, batches);

  const searchPlan = buildAdaptiveSearchPlan({
    schema: 'atlas.adaptive-search-input.v1',
    requestId: input.requestId,
    queryText: input.queryText,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    featureRevision: input.featureRevision,
    graphWeighted: false,
    sourceNodeKnown: seedSourceRefs.length > 0,
    targetNodeKnown: input.targetFiles.length > 1,
    candidateCount: Math.max(1, candidates.length),
    filteredFraction: input.targetFiles.length > 0 ? 0.95 : 0,
    budget: input.searchBudget,
    matrixDiagnostics: input.matrixDiagnostics,
    producerRevision: input.producerRevision,
  });

  if (!candidates.length) {
    const placeholder = RepairEvidenceCandidateV1Schema.parse({
      candidateId: `placeholder:${hash16(input.queryText)}`,
      packetKey: null,
      sourceRef: input.targetFiles[0] ?? 'unresolved:repair-target',
      sourceRevision: null,
      ordinal: 0,
      tokenCount: 1,
      semanticScore: 0,
      lexicalScore: 0,
      graphAuthority: 0,
      centroidAffinity: 0,
      cacheHotness: 0,
      demandUtility: 0,
      executionUtility: 0,
      recency: 0,
      normalizedCost: 1,
      hopDistance: null,
      pathCost: null,
      communityId: null,
      communityOverlap: 0,
      pprAffinity: 0,
      exactEvidence: false,
      contentRef: 'unresolved:evidence',
      lanes: ['canonical'],
      executors: ['evidence-gate-placeholder'],
      evidenceRefs: [],
    });
    candidates.push(placeholder);
  }

  const contextPlan = buildContextPlan(input, candidates);
  const { matrix: featureMatrix, tang: tangPromotion } = featureMatrixAndTang(input, candidates, contextPlan);
  const exactEvidencePacketKeys = uniqueSorted(candidates.filter((row) => row.exactEvidence && row.packetKey).map((row) => row.packetKey as string));
  const exactEvidenceReady = exactEvidencePacketKeys.length > 0 && contextPlan.exactEvidenceFloorSatisfied;
  const evidenceStatus: RepairContextManifestV1['evidenceStatus'] = readiness.gate === 'READY'
    ? exactEvidenceReady
      ? 'READY_FOR_DRY_RUN'
      : 'DEGRADED_EVIDENCE'
    : readiness.gate === 'BLOCKED'
      ? 'BLOCKED'
      : 'DEGRADED_EVIDENCE';
  const recommendationAllowed = readiness.gate === 'READY' && evidenceStatus === 'READY_FOR_DRY_RUN';
  const selectedPacketSet = new Set(contextPlan.selectedPacketKeys);
  const selectedCandidates = candidates.filter((row) => selectedPacketSet.has(packetIdentity(row)));

  const manifest = RepairContextManifestV1Schema.parse({
    schema: 'atlas.repair-context-manifest.v1',
    requestId: input.requestId,
    queryHash: hash16(input.queryText),
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    graphRevision: input.graphRevision,
    featureRevision: input.featureRevision,
    readinessGate: readiness.gate,
    evidenceStatus,
    recommendationAllowed,
    selectedPacketKeys: uniqueSorted(selectedCandidates.flatMap((row) => row.packetKey ? [row.packetKey] : [])),
    selectedSourceRefs: uniqueSorted(selectedCandidates.map((row) => row.sourceRef)),
    exactEvidencePacketKeys,
    candidateCount: candidates.length,
    selectedCandidateCount: selectedCandidates.length,
    featureMatrix: {
      rows: featureMatrix.rows,
      cols: featureMatrix.cols,
      featureNames: [...SEARCH_POLICY_FEATURE_NAMES],
      sha256: matrixHash(featureMatrix),
    },
    tokenBudget: {
      availableTokens: contextPlan.availableTokens,
      selectedTokens: contextPlan.selectedTokens,
      unusedTokens: contextPlan.unusedTokens,
      exactEvidenceFloorSatisfied: contextPlan.exactEvidenceFloorSatisfied,
    },
    searchAlgorithms: uniqueSorted(searchPlan.recommendations.map((row) => row.algorithm)),
    executorReceipts: batches.map(batchReceipt),
    cacheActionsProposalOnly: true,
    exactPromotionRequired: true,
    oneVotePerLogicalLane: true,
    graphNeverAnswersDirectly: true,
    evidenceAuthorizesMutation: false,
    sideEffectsAuthorized: false,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });

  return {
    schema: 'atlas.agentic-repair-evidence-gate-result.v1',
    readiness,
    searchPlan,
    batches,
    candidates,
    featureMatrix,
    tangPromotion,
    contextPlan,
    manifest,
  };
}
