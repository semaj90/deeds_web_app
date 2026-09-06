import { sha256Stable } from './contracts.js';
import type { QueryClassificationV1 } from './query-classifier.js';
import type { QueryExpansionBundleV1 } from './query-expansion-v1.js';
import type { QueryFingerprintV1 } from './query-fingerprint-v1.js';
import type { TaxonomyScopeV1 } from './taxonomy-scope-v1.js';

export type RetrievalLane = 'lexical' | 'ast' | 'semantic' | 'graph';
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
}

export function buildRetrievalPlan(input: { classification: QueryClassificationV1; workspaceRevision: string; candidateBudget?: number; graphHopBudget?: number; hyperedgeExpansionBudget?: number; producerRevision?: string; taxonomyScope?: TaxonomyScopeV1; queryExpansion?: QueryExpansionBundleV1; queryFingerprint?: QueryFingerprintV1; reductionPolicyRef?: string; tokenBudget?: number; topicBudget?: number; forestNodeBudget?: number; contextLodPolicyRef?: string }): RetrievalPlanV1 {
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
  };
  return { ...body, checksum: sha256Stable(body) };
}
