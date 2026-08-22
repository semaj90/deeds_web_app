import { sha256Stable } from './contracts.js';
import type { QueryClassificationV1 } from './query-classifier.js';

export type RetrievalLane = 'lexical' | 'ast' | 'semantic' | 'graph';
export interface RetrievalPlanV1 {
  schema: 'atlas.retrieval-plan.v1'; retrievalPlanId: string; requestId: string; lanes: RetrievalLane[];
  candidateBudget: number; exactPromotionRequired: boolean; semanticRepresentation: 'semantic_768';
  graphHopBudget: number; hyperedgeExpansionBudget: number; workspaceRevision: string;
  producerRevision: string; checksum: string;
}

export function buildRetrievalPlan(input: { classification: QueryClassificationV1; workspaceRevision: string; candidateBudget?: number; graphHopBudget?: number; hyperedgeExpansionBudget?: number; producerRevision?: string }): RetrievalPlanV1 {
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
  };
  return { ...body, checksum: sha256Stable(body) };
}
