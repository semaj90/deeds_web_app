import { describe, expect, it } from 'vitest';
import { argmax, planDecisionFunction, sigmoid, sparsemax, squaremaxExperimental, stableSoftmax, topK } from './decision-function-module.js';

describe('decision-function module', () => {
  it('routes multi-label classification to sigmoid', () => {
    const plan = planDecisionFunction({ purpose:'MULTILABEL_CLASSIFICATION', modelFamily:'PYTORCH', availableExecutors:['pytorch_cpu'] });
    expect(plan.decisionFunction).toBe('SIGMOID');
  });
  it('does not treat DPO as a decision function', () => {
    const plan = planDecisionFunction({ purpose:'CLASSIFICATION', modelFamily:'PYTORCH', trainingObjective:'DPO', availableExecutors:['pytorch_cpu'] });
    expect(plan.trainingObjective).toBe('DPO');
    expect(plan.decisionFunction).toBe('SOFTMAX');
  });
  it('requires proof before replacing attention with squaremax', () => {
    expect(() => planDecisionFunction({ purpose:'ATTENTION', modelFamily:'TRANSFORMER', attentionReplacementExperiment:true, hardwareFriendlyApproximation:true, availableExecutors:['pytorch_cpu'] })).toThrow(/quality\/training receipt/);
  });
  it('keeps probability functions normalized', () => {
    expect(stableSoftmax([1,2,3]).reduce((a,b)=>a+b,0)).toBeCloseTo(1, 8);
    expect(sparsemax([1,2,3]).reduce((a,b)=>a+b,0)).toBeCloseTo(1, 8);
    expect(squaremaxExperimental([1,2,3]).reduce((a,b)=>a+b,0)).toBeCloseTo(1, 8);
    expect(sigmoid([-1,0,1])).toHaveLength(3);
  });
  it('provides deterministic index selection', () => {
    expect(argmax([2,5,5])).toBe(1);
    expect(topK([2,5,5],2).map(x=>x.index)).toEqual([1,2]);
  });
});
