import { describe, expect, it } from 'vitest';
import {
  chooseQdrantQueryBudget,
  compileQdrantSearchParams,
  qdrantPreselectLimit,
} from '../src/lib/server/retrieval/qdrant-query-budget.js';

describe('QdrantQueryBudgetV1', () => {
  it('keeps oversampling inside one semantic lane and final K unchanged', () => {
    const budget = chooseQdrantQueryBudget({
      finalLimit: 20,
      resourceClass: 'high',
      confidenceRequired: 'high',
    });
    const compiled = compileQdrantSearchParams(budget, { quantizationAvailable: true });

    expect(budget.oversampling).toBe(4);
    expect(qdrantPreselectLimit(budget)).toBe(80);
    expect(compiled.finalLimit).toBe(20);
    expect(compiled.estimatedPreselected).toBe(80);
    expect(compiled.params.quantization).toEqual({
      ignore: false,
      rescore: true,
      oversampling: 4,
    });
  });

  it('does not send quantization controls when the collection lacks quantization', () => {
    const budget = chooseQdrantQueryBudget({ finalLimit: 12, resourceClass: 'normal' });
    const compiled = compileQdrantSearchParams(budget, { quantizationAvailable: false });

    expect(compiled.params.quantization).toBeUndefined();
    expect(compiled.params.hnsw_ef).toBeGreaterThanOrEqual(100);
    expect(compiled.estimatedPreselected).toBe(12);
  });

  it('models exact Qdrant vector search separately from Parent Atlas exact promotion', () => {
    const budget = chooseQdrantQueryBudget({ finalLimit: 10, exactRequired: true });
    const compiled = compileQdrantSearchParams(budget, { quantizationAvailable: true });

    expect(budget.exact).toBe(true);
    expect(budget.rescoreOriginal).toBe(false);
    expect(compiled.params).toEqual({ exact: true });
    expect(compiled.quantizationApplied).toBe(false);
    expect(compiled.finalLimit).toBe(10);
  });
});
