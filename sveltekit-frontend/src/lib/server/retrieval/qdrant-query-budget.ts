export interface QdrantQueryBudgetV1 {
  schema: 'atlas.qdrant-query-budget.v1';
  /** Final number of semantic candidates returned to the caller. */
  limit: number;
  /** Internal quantized preselection multiplier. */
  oversampling: number;
  /** Re-evaluate quantized preselection with original vectors. */
  rescoreOriginal: boolean;
  /** Qdrant full vector scan. This is NOT Parent Atlas exact promotion. */
  exactVectorSearch: boolean;
  /** Per-query HNSW dynamic candidate-list size. */
  hnswEf: number | null;
  policyRevision: string;
}

export interface QdrantCompiledSearchParamsV1 {
  params: {
    exact: boolean;
    hnsw_ef?: number;
    quantization?: {
      ignore: false;
      rescore: boolean;
      oversampling: number;
    };
  };
  finalLimit: number;
  estimatedPreselected: number;
  quantizationApplied: boolean;
}

/** Runtime quality/cost policy inside ONE semantic_768 lane. */
export function chooseQdrantQueryBudget(input: {
  finalLimit: number;
  confidenceRequired?: 'low' | 'normal' | 'high';
  resourceClass?: 'low' | 'normal' | 'high';
  exactVectorSearch?: boolean;
  policyRevision?: string;
}): QdrantQueryBudgetV1 {
  const limit = Math.max(1, Math.floor(input.finalLimit));
  if (input.exactVectorSearch) {
    return {
      schema: 'atlas.qdrant-query-budget.v1',
      limit,
      oversampling: 1,
      rescoreOriginal: false,
      exactVectorSearch: true,
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
    exactVectorSearch: false,
    hnswEf: Math.max(100, Math.ceil(limit * oversampling)),
    policyRevision: input.policyRevision ?? 'qdrant-query-budget-v1',
  };
}

/**
 * Compile policy to Qdrant Query API params. Quantization options are emitted
 * only when collection metadata proves quantization is configured.
 */
export function compileQdrantSearchParams(
  budget: QdrantQueryBudgetV1,
  options: { quantizationAvailable: boolean },
): QdrantCompiledSearchParamsV1 {
  if (budget.exactVectorSearch) {
    return {
      params: { exact: true },
      finalLimit: budget.limit,
      estimatedPreselected: budget.limit,
      quantizationApplied: false,
    };
  }

  const params: QdrantCompiledSearchParamsV1['params'] = { exact: false };
  if (budget.hnswEf !== null) params.hnsw_ef = budget.hnswEf;

  const quantizationApplied = options.quantizationAvailable;
  if (quantizationApplied) {
    params.quantization = {
      ignore: false,
      rescore: budget.rescoreOriginal,
      oversampling: Math.max(1, budget.oversampling),
    };
  }

  return {
    params,
    finalLimit: budget.limit,
    estimatedPreselected: quantizationApplied
      ? Math.ceil(budget.limit * Math.max(1, budget.oversampling))
      : budget.limit,
    quantizationApplied,
  };
}
