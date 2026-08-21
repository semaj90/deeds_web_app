import { describe, expect, it } from 'vitest';
import { chooseQdrantQueryBudget, qdrantPreselectLimit } from '../src/lib/server/retrieval/qdrant-query-budget.js';

describe('Qdrant query budget',()=>{
  it('keeps oversampling a runtime dial inside one semantic lane',()=>{const low=chooseQdrantQueryBudget({finalLimit:20,resourceClass:'low'});const high=chooseQdrantQueryBudget({finalLimit:20,resourceClass:'high',confidenceRequired:'high'});expect(low.oversampling).toBe(1);expect(high.oversampling).toBe(4);expect(qdrantPreselectLimit(high)).toBe(80);});
  it('uses exact execution without inventing a second lane',()=>{const exact=chooseQdrantQueryBudget({finalLimit:10,exactRequired:true});expect(exact.exact).toBe(true);expect(exact.limit).toBe(10);expect(exact.oversampling).toBe(1);});
});
