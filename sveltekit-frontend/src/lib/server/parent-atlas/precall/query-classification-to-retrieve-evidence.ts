import {
  RetrieveEvidenceInputSchema,
  type RetrieveEvidenceInput,
} from './retrieve-evidence-schema.js';

export interface QueryClassificationLikeV1 {
  requestId: string;
  rawQuery: string;
  retrievalNeeds: {
    lexical: boolean;
    ast: boolean;
    semantic: boolean;
    graph: boolean;
  };
  exactPromotionRequired: boolean;
}

export interface RetrievalPlanLikeV1 {
  candidateBudget: number;
  graphHopBudget: number;
}

/**
 * Adapter only. The canonical live execution owner remains retrieveEvidence().
 * This prevents QueryClassificationV1 from growing a second direct caller of
 * parallelRetrieve().
 */
export function classificationToRetrieveEvidenceInput(input: {
  classification: QueryClassificationLikeV1;
  retrievalPlan: RetrievalPlanLikeV1;
  workspaceRevision: string;
}): RetrieveEvidenceInput {
  const lanes: RetrieveEvidenceInput['lanes'] = [];
  if (input.classification.exactPromotionRequired) lanes.push('exact');
  if (input.classification.retrievalNeeds.lexical) lanes.push('lexical');
  if (input.classification.retrievalNeeds.semantic) lanes.push('semantic');
  if (input.classification.retrievalNeeds.ast) lanes.push('ast');
  if (input.classification.retrievalNeeds.graph) lanes.push('graph');

  return RetrieveEvidenceInputSchema.parse({
    query: input.classification.rawQuery,
    workspaceRevision: input.workspaceRevision,
    topK: Math.min(50, Math.max(1, input.retrievalPlan.candidateBudget)),
    lanes: [...new Set(lanes)],
    centroidRouting: { enabled: false },
  });
}
