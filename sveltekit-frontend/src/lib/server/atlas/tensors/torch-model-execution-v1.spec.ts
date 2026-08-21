// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureMatrix } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import { buildTorchFeatureTensorV1 } from './torch-feature-tensor-v1.js';
import {
  assertTorchExecutionReceiptsComparableV1,
  buildTorchFeatureExecutionManifestV1,
  buildTorchModelExecutionReceiptV1,
  sha256StableJsonV1,
  validateTorchModelExecutionReceiptV1,
} from './torch-model-execution-v1.js';

const MODEL_SHA = 'a'.repeat(64);
const OUTPUT_SHA = 'b'.repeat(64);

function tensor() {
  return buildTorchFeatureTensorV1({
    matrix: buildCandidateFeatureMatrix([
      { packet_key: 'packet:a', semantic_similarity_768: 0.9, lexical_score: 0.5 },
      { packet_key: 'packet:b', semantic_similarity_768: 0.8, exact_symbol_match: 1 },
    ]),
    queryId: 'query:torch02',
    workspaceRevision: 'workspace:1',
    representationRevision: 'representation:1',
    featureRevision: 'features:1',
  }).artifact;
}

function manifest(executor: 'PYTORCH_CPU' | 'PYTORCH_CUDA' | 'LIBTORCH_CUDA') {
  return buildTorchFeatureExecutionManifestV1({
    tensor: tensor(),
    modelId: 'atlas/torch02-linear-probe',
    modelRevision: 'atlas/torch02-linear-probe.v1',
    modelArtifactSha256: MODEL_SHA,
    modelFormat: 'PYTORCH_STATE_DICT',
    modelRole: 'parity_probe',
    requestedExecutor: executor,
    executorRevision: executor === 'PYTORCH_CPU' ? 'torch:cpu:test' : executor === 'PYTORCH_CUDA' ? 'torch:cuda:test' : 'libtorch:test',
    outputRole: 'score_per_row',
    outputWidth: 1,
  });
}

function successReceipt(executor: 'PYTORCH_CPU' | 'PYTORCH_CUDA') {
  const m = manifest(executor);
  return buildTorchModelExecutionReceiptV1({
    manifestSha256: sha256StableJsonV1(m),
    modelId: m.modelId,
    modelRevision: m.modelRevision,
    modelArtifactSha256: m.modelArtifactSha256,
    modelRole: m.modelRole,
    inputTensorRevision: m.inputTensorRevision,
    inputFeatureBytesSha256: m.inputFeatureBytesSha256,
    inputRowKeysSha256: m.inputRowKeysSha256,
    inputRowCount: m.inputRowCount,
    requestedExecutor: m.requestedExecutor,
    actualExecutor: executor,
    executorRevision: m.executorRevision,
    status: 'SUCCESS',
    blockReason: null,
    outputRole: m.outputRole,
    outputWidth: m.outputWidth,
    outputCount: m.inputRowCount * m.outputWidth,
    outputBytesSha256: OUTPUT_SHA,
    outputsFinite: true,
    referenceReceiptSha256: null,
    maxAbsoluteDeltaVsReference: null,
    withinTolerance: null,
    atol: m.numericPolicy.atol,
    rtol: m.numericPolicy.rtol,
  });
}

describe('TorchModelExecutionV1', () => {
  it('binds model identity to exact tensor bytes and row ordering', () => {
    const m = manifest('PYTORCH_CPU');
    expect(m.inputFeatureBytesSha256).toBe(tensor().featureBytesSha256);
    expect(m.inputRowKeysSha256).toBe(tensor().rowKeysSha256);
    expect(m.logicalLaneVoteAdded).toBe(false);
    expect(m.canonicalOwnerChanged).toBe(false);
  });

  it('accepts comparable CPU and CUDA receipts for the same model and tensor', () => {
    const cpu = successReceipt('PYTORCH_CPU');
    const cuda = successReceipt('PYTORCH_CUDA');
    expect(() => assertTorchExecutionReceiptsComparableV1(cpu, cuda)).not.toThrow();
  });

  it('rejects comparison after model identity changes', () => {
    const cpu = successReceipt('PYTORCH_CPU');
    const cuda = successReceipt('PYTORCH_CUDA');
    const changed = buildTorchModelExecutionReceiptV1({
      ...cuda,
      modelRevision: 'atlas/torch02-linear-probe.v2',
    });
    expect(() => assertTorchExecutionReceiptsComparableV1(cpu, changed)).toThrow(
      'TORCH_EXECUTION_RECEIPT_NOT_COMPARABLE:modelRevision',
    );
  });

  it('allows an explicit blocked LibTorch capability receipt without claiming success', () => {
    const m = manifest('LIBTORCH_CUDA');
    const blocked = buildTorchModelExecutionReceiptV1({
      manifestSha256: sha256StableJsonV1(m),
      modelId: m.modelId,
      modelRevision: m.modelRevision,
      modelArtifactSha256: m.modelArtifactSha256,
      modelRole: m.modelRole,
      inputTensorRevision: m.inputTensorRevision,
      inputFeatureBytesSha256: m.inputFeatureBytesSha256,
      inputRowKeysSha256: m.inputRowKeysSha256,
      inputRowCount: m.inputRowCount,
      requestedExecutor: 'LIBTORCH_CUDA',
      actualExecutor: 'BLOCKED',
      executorRevision: m.executorRevision,
      status: 'BLOCKED',
      blockReason: 'CAPABILITY_NOT_PRESENT:TORCHSCRIPT_MODEL_LOADER',
      outputRole: m.outputRole,
      outputWidth: m.outputWidth,
      outputCount: 0,
      outputBytesSha256: null,
      outputsFinite: false,
      referenceReceiptSha256: null,
      maxAbsoluteDeltaVsReference: null,
      withinTolerance: null,
      atol: m.numericPolicy.atol,
      rtol: m.numericPolicy.rtol,
    });
    expect(validateTorchModelExecutionReceiptV1(blocked).status).toBe('BLOCKED');
  });

  it('detects receipt tampering', () => {
    const receipt = successReceipt('PYTORCH_CPU');
    expect(() => validateTorchModelExecutionReceiptV1({ ...receipt, outputCount: 999 })).toThrow(
      'TORCH_EXECUTION_RECEIPT_CHECKSUM_MISMATCH',
    );
  });
});
