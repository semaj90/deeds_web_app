import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEncoderTrainingDatasetReceipt, encoderTrainingDatasetReceiptSchema } from '../dist/core/encoder-training-receipt.js';

const h = (value) => value.repeat(64);

test('encoder dataset receipt is lineage-qualified but cannot admit training', () => {
  const receipt = buildEncoderTrainingDatasetReceipt({
    dataset_revision: 'dataset:r1', dataset_checksum: h('a'),
    evidence_snapshot_revision: 'evidence:r1', matrix_snapshot_revision: 'matrix:r1',
    representation_revision: 'semantic_768:r1', encoder_model_revision: 'encoder:r1',
    prompt_revision: 'prompt:r1', label_revision: 'labels:r1', example_count: 2,
    verified_example_count: 2, exact_promotion_coverage: 1,
    source_receipt_refs: ['receipt:1'], phase_receipt_refs: ['phase:1'],
    admission: 'SHADOW_ONLY', producer_revision: 'test:r1',
  });
  assert.equal(receipt.training_example_admitted, false);
  assert.equal(receipt.canonical_writes_allowed, false);
  assert.doesNotThrow(() => encoderTrainingDatasetReceiptSchema.parse(receipt));
});

test('shadow admission fails closed without verified examples', () => {
  assert.throws(() => buildEncoderTrainingDatasetReceipt({
    dataset_revision: 'dataset:r1', dataset_checksum: h('a'),
    evidence_snapshot_revision: 'evidence:r1', matrix_snapshot_revision: 'matrix:r1',
    representation_revision: 'semantic_768:r1', encoder_model_revision: 'encoder:r1',
    prompt_revision: 'prompt:r1', label_revision: 'labels:r1', example_count: 1,
    verified_example_count: 0, exact_promotion_coverage: 0,
    source_receipt_refs: [], phase_receipt_refs: [], admission: 'SHADOW_ONLY', producer_revision: 'test:r1',
  }));
});
