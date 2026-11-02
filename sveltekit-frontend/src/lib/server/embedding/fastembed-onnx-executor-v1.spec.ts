import { describe, expect, it } from 'vitest';
import { buildFastEmbedOnnxExecutorReceiptV1, evaluateFastEmbedParityV1 } from './fastembed-onnx-executor-v1.js';

const baseReceipt = {
  modelId: 'google/embeddinggemma-300m' as const,
  modelRevision: 'embeddinggemma-native-768-v1',
  executorId: 'fastembed_onnx' as const,
  executorRevision: 'fastembed-0.7.3-onnxruntime-1',
  artifactFormat: 'onnx' as const,
  artifactSha256: 'a'.repeat(64),
  representationId: 'semantic_768' as const,
  dimension: 768 as const,
  promptRevision: 'embeddinggemma-query-document-v1',
  tokenizerRevision: 'embeddinggemma-tokenizer-v1',
  pooling: 'mean' as const,
  normalization: 'l2' as const,
  customModelRegistration: true as const,
  runtimeStatus: 'CHALLENGER' as const,
};

const baseEvidence = {
  dimensionExact: true as const,
  finiteValues: true as const,
  l2Normalized: true as const,
  promptParity: true as const,
  modelRevisionMatch: true as const,
  tokenizerRevisionMatch: true as const,
  minCosineAgainstCanonical: 0.998,
  minTopKOverlap: 0.95,
  cosineThreshold: 0.995,
  topKOverlapThreshold: 0.8,
};

describe('FastEmbedOnnxExecutorV1', () => {
  it('keeps FastEmbed separate from canonical representation and promotion', () => {
    const receipt = buildFastEmbedOnnxExecutorReceiptV1(baseReceipt);
    expect(receipt.executorId).toBe('fastembed_onnx');
    expect(receipt.representationId).toBe('semantic_768');
    expect(receipt.canonicalPromotionAllowed).toBe(false);
  });

  it('passes parity evidence only when all required thresholds are met', () => {
    expect(evaluateFastEmbedParityV1(baseEvidence)).toEqual({ parity: 'PASS', canonicalPromotionAllowed: false, reasons: [] });
  });

  it('fails parity without changing the canonical model or lane', () => {
    const result = evaluateFastEmbedParityV1({ ...baseEvidence, minTopKOverlap: 0.4 });
    expect(result.parity).toBe('FAIL');
    expect(result.reasons).toContain('TOP_K_OVERLAP_BELOW_THRESHOLD');
    expect(result.canonicalPromotionAllowed).toBe(false);
  });
});
