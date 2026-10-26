import { describe, expect, it } from 'vitest';
import { evaluateQloraTrainingGate } from './qlora-training-gate.js';

const base = {
  baseModelRevision: 'ornith-9b-r1',
  policyRevision: 'policy-1',
  producerRevision: 'test',
};
const reviewedLabels = {
  reviewedLabelCount: 200,
  reviewedLabelGradeCounts: { 0: 50, 1: 50, 2: 50, 3: 50 },
  reviewedLabelCorpusChecksum: `sha256:${'a'.repeat(64)}`,
  reviewedLabelsRevisionBound: true,
};

describe('QLoRA training gate', () => {
  it('rejects insufficient evidence', () => {
    const gate = evaluateQloraTrainingGate({
      ...base,
      evidence: {
        ...reviewedLabels,
        reviewedLabelCount: 100,
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
        ...reviewedLabels,
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
        ...reviewedLabels,
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

  it('blocks shadow training when reviewed labels are unbalanced or unbound', () => {
    const insufficient = evaluateQloraTrainingGate({
      ...base,
      evidence: {
        ...reviewedLabels,
        reviewedLabelGradeCounts: { 0: 100, 1: 70, 2: 29, 3: 1 },
        datasetRevision: 'ds-1', evidenceReceiptCount: 2000, validatedExecutionRate: 0.99,
        exactPromotionCoverage: 1, baselineRevision: 'base-1',
      },
    });
    expect(insufficient.state).toBe('DATASET_INSUFFICIENT');
    expect(insufficient.reasonCodes).toContain('REVIEWED_LABEL_TRUST_FLOOR_NOT_MET');

    const unbound = evaluateQloraTrainingGate({
      ...base,
      evidence: {
        ...reviewedLabels, reviewedLabelsRevisionBound: false,
        datasetRevision: 'ds-1', evidenceReceiptCount: 2000, validatedExecutionRate: 0.99,
        exactPromotionCoverage: 1, baselineRevision: 'base-1',
      },
    });
    expect(unbound.state).toBe('DATASET_INSUFFICIENT');
    expect(unbound.reasonCodes).toContain('REVIEWED_LABELS_REVISION_UNQUALIFIED');
  });
});
