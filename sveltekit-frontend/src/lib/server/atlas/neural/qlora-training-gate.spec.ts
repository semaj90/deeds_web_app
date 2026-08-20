import { describe, expect, it } from 'vitest';
import { evaluateQloraTrainingGate } from './qlora-training-gate.js';

const base = {
  baseModelRevision: 'ornith-9b-r1',
  policyRevision: 'policy-1',
  producerRevision: 'test',
};

describe('QLoRA training gate', () => {
  it('rejects insufficient evidence', () => {
    const gate = evaluateQloraTrainingGate({
      ...base,
      evidence: {
        datasetRevision: 'ds-1',
        evidenceReceiptCount: 100,
        validatedExecutionRate: 1,
        exactPromotionCoverage: 1,
        baselineRevision: 'base-1',
      },
    });
    expect(gate.state).toBe('DATASET_INSUFFICIENT');
    expect(gate.onlineTrainingAllowed).toBe(false);
  });

  it('requires an evaluation baseline before shadow training', () => {
    const gate = evaluateQloraTrainingGate({
      ...base,
      evidence: {
        datasetRevision: 'ds-1',
        evidenceReceiptCount: 2000,
        validatedExecutionRate: 0.99,
        exactPromotionCoverage: 1,
      },
    });
    expect(gate.state).toBe('EVAL_BASELINE_MISSING');
  });

  it('allows only shadow training after validated exact-promoted evidence', () => {
    const gate = evaluateQloraTrainingGate({
      ...base,
      evidence: {
        datasetRevision: 'ds-1',
        evidenceReceiptCount: 2000,
        validatedExecutionRate: 0.99,
        exactPromotionCoverage: 1,
        baselineRevision: 'base-1',
      },
    });
    expect(gate.state).toBe('READY_FOR_SHADOW_TRAINING');
    expect(gate.quantizationMode).toBe('NF4_4BIT');
    expect(gate.targetPolicy).toBe('ALL_LINEAR_CANDIDATE');
    expect(gate.trainableBaseWeights).toBe(false);
  });
});
