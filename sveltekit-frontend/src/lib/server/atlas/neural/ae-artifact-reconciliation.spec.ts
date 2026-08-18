import { describe, expect, it } from 'vitest';
import {
  AE_EXPECTED_WEIGHT_FILES,
  reconcileAeArtifacts,
} from './ae-artifact-reconciliation.js';

const metadata = {
  input_dim: 768,
  hidden_dim: 128,
  latent_dim: 64,
  n_train: 9000,
  n_val: 1000,
  epochs_run: 60,
  best_val_loss: 0.0007358284494839609,
  cuda: true,
  device: 'cuda',
  timestamp: '2026-06-19T16:13:04Z',
  weight_files: [...AE_EXPECTED_WEIGHT_FILES],
};

describe('AE artifact reconciliation', () => {
  it('recognizes the existing trainer and latent producer without promoting online training', () => {
    const receipt = reconcileAeArtifacts({
      producerRevision: 'ae-reconcile-1',
      inventory: {
        trainerPresent: true,
        latentProducerPresent: true,
        metadata,
        presentWeightFiles: AE_EXPECTED_WEIGHT_FILES,
        exactRecallBaselinePresent: false,
        reconstructionValidationPresent: false,
      },
    });

    expect(receipt.state).toBe('LATENT_PRODUCER_PRESENT');
    expect(receipt.semanticRepresentation).toBe('semantic_768');
    expect(receipt.hiddenDimension).toBe(128);
    expect(receipt.latentDimension).toBe(64);
    expect(receipt.onlineTrainingAllowed).toBe(false);
    expect(receipt.routingOnlyUntilPromoted).toBe(true);
    expect(receipt.reasonCodes).toContain('EXACT_RECALL_BASELINE_MISSING');
    expect(receipt.reasonCodes).toContain('RECONSTRUCTION_VALIDATION_MISSING');
  });

  it('becomes shadow-ready only when both validation gates are present', () => {
    const receipt = reconcileAeArtifacts({
      producerRevision: 'ae-reconcile-1',
      inventory: {
        trainerPresent: true,
        latentProducerPresent: true,
        metadata,
        presentWeightFiles: AE_EXPECTED_WEIGHT_FILES,
        exactRecallBaselinePresent: true,
        reconstructionValidationPresent: true,
      },
    });

    expect(receipt.state).toBe('SHADOW_READY');
    expect(receipt.canonicalWritesAllowed).toBe(false);
    expect(receipt.reasonCodes).toContain('SHADOW_ONLY_UNTIL_PROMOTION');
  });

  it('rejects incomplete weight inventories', () => {
    const receipt = reconcileAeArtifacts({
      producerRevision: 'ae-reconcile-1',
      inventory: {
        trainerPresent: true,
        latentProducerPresent: true,
        metadata,
        presentWeightFiles: AE_EXPECTED_WEIGHT_FILES.slice(0, 7),
        exactRecallBaselinePresent: true,
        reconstructionValidationPresent: true,
      },
    });

    expect(receipt.state).toBe('WEIGHTS_INCOMPLETE');
    expect(receipt.presentWeightFiles).toHaveLength(7);
  });
});
