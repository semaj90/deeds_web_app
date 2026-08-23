import { describe, expect, it } from 'vitest';
import {
  EmbeddingGemmaExecutorReceiptV1Schema,
  executorReceiptReadyForParity,
} from './embeddinggemma-executor-receipt-v1.js';

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.embeddinggemma-executor-receipt.v1',
    modelId: 'google/embeddinggemma-300m',
    modelRevision: 'model-revision-1',
    artifactPath: 'fixture/embeddinggemma/model.onnx',
    artifactChecksumSha256: 'a'.repeat(64),
    artifactSizeBytes: 1024,
    executor: 'onnxruntime',
    executorRevision: 'onnxruntime-node-1',
    backend: 'CUDA',
    quantization: 'Q8_0',
    nativeDimension: 768,
    pooling: 'MEAN',
    normalization: 'L2',
    maxInputTokens: 2048,
    retrievalQueryPromptRevision: 'prompt-retrieval-1',
    codeQueryPromptRevision: 'prompt-code-1',
    documentPromptRevision: 'prompt-document-1',
    classificationPromptRevision: 'prompt-classification-1',
    finiteOutputPass: true,
    nativeDimensionPass: true,
    normErrorMax: 0,
    repeatedRequestStable: true,
    coldWarmStable: true,
    referenceExecutor: 'fixture-reference',
    cosineParity: 1,
    recallAt10: 1,
    recallAt50: 1,
    recallAt100: 1,
    projectedRepresentations: ['retrieval_query_768', 'retrieval_query_mrl_128'],
    persistedRepresentationAuthority: 'semantic_768',
    persistenceAuthoritySource: 'fixture-only-no-writes',
    canonicalDefaultChanged: false,
    qdrantWritesPerformed: false,
    postgresWritesPerformed: false,
    createdAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('EmbeddingGemma executor receipt provider matrix', () => {
  it.each([
    ['llama.cpp', 'CUDA'],
    ['onnxruntime', 'CUDA'],
    ['onnxruntime', 'DIRECTML'],
    ['fastembed', 'CPU'],
  ] as const)('accepts %s on %s as a revisioned capability receipt', (executor, backend) => {
    const parsed = EmbeddingGemmaExecutorReceiptV1Schema.parse(receipt({ executor, backend }));
    expect(parsed.nativeDimension).toBe(768);
    expect(parsed.canonicalDefaultChanged).toBe(false);
    expect(parsed.qdrantWritesPerformed).toBe(false);
    expect(parsed.postgresWritesPerformed).toBe(false);
    expect(executorReceiptReadyForParity(parsed)).toBe(true);
  });

  it('does not treat a capability receipt as canonical promotion authority', () => {
    const parsed = EmbeddingGemmaExecutorReceiptV1Schema.parse(receipt({
      persistenceAuthoritySource: 'fixture-only-no-writes',
      qdrantWritesPerformed: false,
      postgresWritesPerformed: false,
    }));

    expect(parsed.persistenceAuthoritySource).toContain('no-writes');
    expect(parsed.qdrantWritesPerformed).toBe(false);
    expect(parsed.postgresWritesPerformed).toBe(false);
  });

  it('rejects non-768 native output and non-L2 normalization', () => {
    expect(() => EmbeddingGemmaExecutorReceiptV1Schema.parse(receipt({ nativeDimension: 512 }))).toThrow();
    expect(() => EmbeddingGemmaExecutorReceiptV1Schema.parse(receipt({ normalization: 'NONE' }))).toThrow();
  });
});
