export interface QdrantQueryBudgetV1 {
  schema: 'atlas.qdrant-query-budget.v1';
  limit: number;
  oversampling: number;
  rescoreOriginal: boolean;
  exact: boolean;
  hnswEf: number | null;
  policyRevision: string;
}

/**
 * Runtime quality/cost policy for Qdrant inside ONE semantic_768 lane.
 * Numbers are conservative priors for evaluation, not permanent constants.
 */
export function chooseQdrantQueryBudget(input: {
  finalLimit: number;
  confidenceRequired?: 'low' | 'normal' | 'high';
  resourceClass?: 'low' | 'normal' | 'high';
  exactRequired?: boolean;
  policyRevision?: string;
}): QdrantQueryBudgetV1 {
  const limit = Math.max(1, Math.floor(input.finalLimit));
  if (input.exactRequired) {
    return {
      schema: 'atlas.qdrant-query-budget.v1',
      limit,
      oversampling: 1,
      rescoreOriginal: true,
      exact: true,
      hnswEf: null,
      policyRevision: input.policyRevision ?? 'qdrant-query-budget-v1',
    };
  }

  const resource = input.resourceClass ?? 'normal';
  const confidence = input.confidenceRequired ?? 'normal';
  const oversampling = resource === 'low'
    ? 1
    : confidence === 'high'
      ? (resource === 'high' ? 4 : 2)
      : (resource === 'high' ? 3 : 2);

  return {
    schema: 'atlas.qdrant-query-budget.v1',
    limit,
    oversampling,
    rescoreOriginal: resource !== 'low' || confidence === 'high',
    exact: false,
    hnswEf: Math.max(100, Math.ceil(limit * oversampling)),
    policyRevision: input.policyRevision ?? 'qdrant-query-budget-v1',
  };
}

export function qdrantPreselectLimit(budget: QdrantQueryBudgetV1): number {
  return Math.max(budget.limit, Math.ceil(budget.limit * budget.oversampling));
}
