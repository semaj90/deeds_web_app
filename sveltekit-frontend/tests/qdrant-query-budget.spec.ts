import { describe, expect, it } from 'vitest';
import {
  chooseQdrantQueryBudget,
  compileQdrantSearchParams,
} from '../src/lib/server/retrieval/qdrant-query-budget.js';

describe('QdrantQueryBudgetV1', () => {
  it('keeps final K separate from quantized oversampling', () => {
    const budget = chooseQdrantQueryBudget({
      finalLimit: 20,
      resourceClass: 'high',
      confidenceRequired: 'high',
    });
    expect(budget.limit).toBe(20);
    expect(budget.oversampling).toBe(4);

    const compiled = compileQdrantSearchParams(budget, { quantizationAvailable: true });
    expect(compiled.finalLimit).toBe(20);
    expect(compiled.estimatedPreselected).toBe(80);
    expect(compiled.params.quantization).toEqual({
      ignore: false,
      rescore: true,
      oversampling: 4,
    });
  });

  it('does not emit quantization params for an unquantized collection', () => {
    const budget = chooseQdrantQueryBudget({ finalLimit: 15, resourceClass: 'normal' });
    const compiled = compileQdrantSearchParams(budget, { quantizationAvailable: false });
    expect(compiled.finalLimit).toBe(15);
    expect(compiled.quantizationApplied).toBe(false);
    expect(compiled.params.quantization).toBeUndefined();
    expect(compiled.params.exact).toBe(false);
    expect(compiled.params.hnsw_ef).toBeGreaterThanOrEqual(100);
  });

  it('treats exact vector search as a Qdrant oracle, not oversampled ANN', () => {
    const budget = chooseQdrantQueryBudget({ finalLimit: 10, exactVectorSearch: true });
    const compiled = compileQdrantSearchParams(budget, { quantizationAvailable: true });
    expect(budget.exactVectorSearch).toBe(true);
    expect(compiled.params).toEqual({ exact: true });
    expect(compiled.finalLimit).toBe(10);
    expect(compiled.estimatedPreselected).toBe(10);
    expect(compiled.quantizationApplied).toBe(false);
  });

  it('uses a cheaper one-pass policy under low resources', () => {
    const budget = chooseQdrantQueryBudget({
      finalLimit: 30,
      resourceClass: 'low',
      confidenceRequired: 'normal',
    });
    expect(budget.oversampling).toBe(1);
    expect(budget.rescoreOriginal).toBe(false);
  });
});
