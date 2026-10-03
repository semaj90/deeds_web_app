import { describe, expect, it } from 'vitest';
import { evaluateDpoTrainingGateV1 } from './dpo-training-gate-v1.js';

const base = {
  baseModelRevision: 'ornith:r1',
  sftAdapterRevision: 'sft:r1',
  preferencePairCount: 100,
  minimumPreferencePairs: 100,
  trainSourceRevisions: ['src:a'],
  heldOutSourceRevisions: ['src:b'],
  producerRevision: 'test:r1',
};

describe('DPO training gate', () => {
  it('requires proven SFT and held-out evaluation before shadow training', () => {
    const gate = evaluateDpoTrainingGateV1({
      ...base,
      preferenceDatasetRevision: 'prefs:r1',
      sftEvaluationProven: false,
      heldOutEvaluationProven: false,
    });
    expect(gate.state).toBe('SFT_EVALUATION_REQUIRED');
    expect(gate.onlineWeightMutationAllowed).toBe(false);
  });

  it('admits only offline shadow training after both evaluations', () => {
    const gate = evaluateDpoTrainingGateV1({
      ...base,
      preferenceDatasetRevision: 'prefs:r1',
      sftEvaluationReceiptChecksum: 'a'.repeat(64),
      heldOutEvaluationReceiptChecksum: 'b'.repeat(64),
      sftEvaluationProven: true,
      heldOutEvaluationProven: true,
    });
    expect(gate.state).toBe('READY_FOR_SHADOW_TRAINING');
    expect(gate.offlineOnly).toBe(true);
    expect(gate.canonicalWritesAllowed).toBe(false);
  });

  it('rejects train/held-out source revision overlap', () => {
    const gate = evaluateDpoTrainingGateV1({
      ...base,
      heldOutSourceRevisions: ['src:a'],
      preferenceDatasetRevision: 'prefs:r1',
      sftEvaluationProven: true,
      heldOutEvaluationProven: true,
      sftEvaluationReceiptChecksum: 'a'.repeat(64),
      heldOutEvaluationReceiptChecksum: 'b'.repeat(64),
    });
    expect(gate.state).toBe('REJECTED');
    expect(gate.sourceRevisionOverlap).toBe(true);
  });

  it('keeps shadow validation non-promotional', () => {
    const gate = evaluateDpoTrainingGateV1({
      ...base,
      preferenceDatasetRevision: 'prefs:r1',
      sftEvaluationProven: true,
      heldOutEvaluationProven: true,
      sftEvaluationReceiptChecksum: 'a'.repeat(64),
      heldOutEvaluationReceiptChecksum: 'b'.repeat(64),
      shadowMetricsPassed: true,
    });
    expect(gate.state).toBe('SHADOW_VALIDATED');
    expect(gate.promotionAuthorized).toBe(false);
  });
});
