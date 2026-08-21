export interface QdrantQueryBudgetV1 {
  schema: 'atlas.qdrant-query-budget.v1';
  /** Final number of semantic candidates returned to the caller. */
  limit: number;
  /** Internal quantized preselection multiplier when quantization exists. */
  oversampling: number;
  /** Re-evaluate preselected candidates with original/full-precision vectors. */
  rescoreOriginal: boolean;
  /** Exact vector search in Qdrant. This is NOT Parent Atlas exact promotion. */
  exact: boolean;
  /** Per-query HNSW dynamic candidate-list size. Unused for exact search. */
  hnswEf: number | null;
  policyRevision: string;
}

export interface QdrantCompiledSearchParamsV1 {
  /** Qdrant Query API `params` payload. */
  params: {
    exact: boolean;
    hnsw_ef?: number;
    quantization?: {
      ignore: false;
      rescore: boolean;
      oversampling: number;
    };
  };
  /** Final requested K. Oversampling does not change this value. */
  finalLimit: number;
  /** Diagnostic only: approximate number considered before quantized rescore. */
  estimatedPreselected: number;
  quantizationApplied: boolean;
}

/**
 * Runtime quality/cost policy inside ONE semantic_768 lane.
 *
 * `exactRequired` means exact *vector* search for an ANN correctness oracle.
 * It must never be confused with Parent Atlas exact promotion, which verifies
 * canonical identity/revisions/source evidence after ranking.
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
      rescoreOriginal: false,
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

/**
 * Compile the policy contract into Qdrant Query API parameters.
 *
 * Quantization parameters are only sent when the collection is known to have
 * quantization configured. Qdrant stores that fact in collection info under
 * `config.quantization_config`; the search owner resolves/caches it.
 */
export function compileQdrantSearchParams(
  budget: QdrantQueryBudgetV1,
  options: { quantizationAvailable: boolean },
): QdrantCompiledSearchParamsV1 {
  if (budget.exact) {
    return {
      params: { exact: true },
      finalLimit: budget.limit,
      estimatedPreselected: budget.limit,
      quantizationApplied: false,
    };
  }

  const params: QdrantCompiledSearchParamsV1['params'] = {
    exact: false,
  };
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

/** Diagnostic helper only; do not pass this value as the Query API final limit. */
export function qdrantPreselectLimit(budget: QdrantQueryBudgetV1): number {
  return Math.max(budget.limit, Math.ceil(budget.limit * budget.oversampling));
}
