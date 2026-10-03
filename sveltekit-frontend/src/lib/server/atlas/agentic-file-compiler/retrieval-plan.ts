import { sha256Stable } from './contracts.js';
import type { QueryClassificationV1 } from './query-classifier.js';
import type { QueryExpansionBundleV1 } from './query-expansion-v1.js';
import type { QueryFingerprintV1 } from './query-fingerprint-v1.js';
import type { TaxonomyScopeV1 } from './taxonomy-scope-v1.js';

export type RetrievalLane = 'lexical' | 'ast' | 'semantic' | 'graph';

// AFC-PLAN-01: phased/cost-bounded scheduling, additive to the existing flat lane list.
// A phase groups lanes by cost tier (cheap lexical/ast -> expensive semantic/graph) and
// declares stop conditions so a caller can short-circuit before running every lane.
// This never replaces `lanes` — `lanes` remains the authoritative unordered set of
// lanes this plan touches; `phases`, when present, is a scheduling view over that same
// set, not a second source of truth for which lanes exist.
export type RetrievalPlanPhaseTier = 'CHEAP_LEXICAL' | 'STRUCTURAL' | 'EXPENSIVE_SEMANTIC_GRAPH' | 'EXTRACTION_ESCALATION';
export interface RetrievalPlanPhaseV1 {
  tier: RetrievalPlanPhaseTier; lanes: RetrievalLane[];
  continueWhen: 'MIN_CANDIDATES_NOT_MET' | 'MIN_CONFIDENCE_NOT_MET' | 'ALWAYS';
  minCandidates: number; minConfidence: number;
}

const PHASE_TIER_BY_LANE: Record<RetrievalLane, RetrievalPlanPhaseTier> = {
  lexical: 'CHEAP_LEXICAL',
  ast: 'STRUCTURAL',
  semantic: 'EXPENSIVE_SEMANTIC_GRAPH',
  graph: 'EXPENSIVE_SEMANTIC_GRAPH',
};
const PHASE_TIER_ORDER: RetrievalPlanPhaseTier[] = ['CHEAP_LEXICAL', 'STRUCTURAL', 'EXPENSIVE_SEMANTIC_GRAPH', 'EXTRACTION_ESCALATION'];

export function buildRetrievalPlanPhasesV1(input: { lanes: readonly RetrievalLane[]; minCandidates?: number; minConfidence?: number }): RetrievalPlanPhaseV1[] {
  const laneSet = new Set(input.lanes);
  const minCandidates = Math.max(1, input.minCandidates ?? 10);
  const minConfidence = Math.min(1, Math.max(0, input.minConfidence ?? 0.5));
  return PHASE_TIER_ORDER.map((tier) => {
    const lanes = [...laneSet].filter((lane) => PHASE_TIER_BY_LANE[lane] === tier);
    return { tier, lanes, continueWhen: tier === 'EXTRACTION_ESCALATION' ? 'ALWAYS' as const : 'MIN_CANDIDATES_NOT_MET' as const, minCandidates, minConfidence };
  }).filter((phase) => phase.lanes.length > 0 || phase.tier === 'EXTRACTION_ESCALATION');
}

export interface RetrievalPlanV1 {
  schema: 'atlas.retrieval-plan.v1'; retrievalPlanId: string; requestId: string; lanes: RetrievalLane[];
  candidateBudget: number; exactPromotionRequired: boolean; semanticRepresentation: 'semantic_768';
  graphHopBudget: number; hyperedgeExpansionBudget: number; workspaceRevision: string;
  producerRevision: string; checksum: string;
  taxonomyScopeRef?: string; taxonomyScopeChecksum?: string;
  queryExpansionRef?: string; queryExpansionChecksum?: string;
  queryFingerprintRef?: string; queryFingerprintChecksum?: string;
  reductionPolicyRef?: string; tokenBudget?: number; topicBudget?: number;
  forestNodeBudget?: number; contextLodPolicyRef?: string;
  phases?: RetrievalPlanPhaseV1[];
}

export function buildRetrievalPlan(input: { classification: QueryClassificationV1; workspaceRevision: string; candidateBudget?: number; graphHopBudget?: number; hyperedgeExpansionBudget?: number; producerRevision?: string; taxonomyScope?: TaxonomyScopeV1; queryExpansion?: QueryExpansionBundleV1; queryFingerprint?: QueryFingerprintV1; reductionPolicyRef?: string; tokenBudget?: number; topicBudget?: number; forestNodeBudget?: number; contextLodPolicyRef?: string; minCandidatesPerPhase?: number; minConfidencePerPhase?: number }): RetrievalPlanV1 {
  const needs = input.classification.retrievalNeeds;
  const lanes: RetrievalLane[] = [];
  if (needs.lexical) lanes.push('lexical');
  if (needs.ast) lanes.push('ast');
  if (needs.semantic) lanes.push('semantic');
  if (needs.graph) lanes.push('graph');
  const unique = [...new Set(lanes)];
  const body = {
    schema: 'atlas.retrieval-plan.v1' as const,
    retrievalPlanId: `retrieval:${input.classification.requestId}:${input.workspaceRevision}`,
    requestId: input.classification.requestId,
    lanes: unique,
    candidateBudget: Math.max(1, input.candidateBudget ?? 100),
    exactPromotionRequired: input.classification.exactPromotionRequired,
    semanticRepresentation: 'semantic_768' as const,
    graphHopBudget: Math.max(0, input.graphHopBudget ?? 2),
    hyperedgeExpansionBudget: Math.max(0, input.hyperedgeExpansionBudget ?? 128),
    workspaceRevision: input.workspaceRevision,
    producerRevision: input.producerRevision ?? 'retrieval-plan-v1',
    ...(input.taxonomyScope ? { taxonomyScopeRef: `taxonomy:${input.taxonomyScope.requestId}`, taxonomyScopeChecksum: input.taxonomyScope.checksum } : {}),
    ...(input.queryExpansion ? { queryExpansionRef: `query-expansion:${input.queryExpansion.workspaceRevision}`, queryExpansionChecksum: input.queryExpansion.checksum } : {}),
    ...(input.queryFingerprint ? { queryFingerprintRef: `query-fingerprint:${input.queryFingerprint.checksum}`, queryFingerprintChecksum: input.queryFingerprint.checksum } : {}),
    ...(input.reductionPolicyRef ? { reductionPolicyRef: input.reductionPolicyRef } : {}),
    ...(input.tokenBudget !== undefined ? { tokenBudget: input.tokenBudget } : {}),
    ...(input.topicBudget !== undefined ? { topicBudget: input.topicBudget } : {}),
    ...(input.forestNodeBudget !== undefined ? { forestNodeBudget: input.forestNodeBudget } : {}),
    ...(input.contextLodPolicyRef ? { contextLodPolicyRef: input.contextLodPolicyRef } : {}),
    ...(unique.length > 0 ? { phases: buildRetrievalPlanPhasesV1({ lanes: unique, minCandidates: input.minCandidatesPerPhase, minConfidence: input.minConfidencePerPhase }) } : {}),
  };
  return { ...body, checksum: sha256Stable(body) };
}
