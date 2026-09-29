import { describe, expect, it, vi } from 'vitest';
import {
  digestEmbeddingInputV1,
  type EmbeddingContextPlanV1,
} from '../atlas/embedding/embedding-context-plan-v1.js';
import { createOnnxChallengerBatchV1 } from './onnx-challenger-batch-v1.js';

const plan = (overrides: Partial<EmbeddingContextPlanV1> = {}): EmbeddingContextPlanV1 => {
  const text = 'source text';
  const renderedInput = 'DOCUMENT: source text';
  return {
    schema: 'atlas.embedding-context-plan.v1',
    planRevision: 'plan-r1',
    representationId: 'semantic_768',
    representationRevision: 'repr-r1',
    modelRevision: 'requested-model-r1',
    tokenizerRevision: 'requested-tokenizer-r1',
    promptRevision: 'prompt-r1',
    role: 'RETRIEVAL_DOCUMENT',
    text,
    title: null,
    inputTextChecksum: digestEmbeddingInputV1(text),
    renderedInput,
    renderedInputChecksum: digestEmbeddingInputV1(renderedInput),
    estimatedTokens: 6,
    poolingPolicy: 'MEAN',
    normalizationPolicy: 'L2',
    sourceRef: 'src/example.ts',
    sourceRevision: 'source-r1',
    workspaceRevision: 'workspace-r1',
    packetKey: 'packet:example',
    candidateOrdinal: 4,
    canonicalAuthority: false,
    planChecksum: `sha256:${'b'.repeat(64)}`,
    ...overrides,
  };
};

describe('ONNX CPU plan-bound challenger batch', () => {
  it('checks the shared plan and input checksums, then labels CPU output as nonpromotable', async () => {
    const vector = new Array(768).fill(1 / Math.sqrt(768));
    const embed = vi.fn(async () => vector);
    const run = createOnnxChallengerBatchV1(embed);
    const [result] = await run([plan({ renderedInput: '  DOCUMENT: source text  ' })]);

    expect(embed).toHaveBeenCalledExactlyOnceWith('DOCUMENT: source text');
    expect(result).toMatchObject({
      status: 'COMPLETE',
      executorId: 'ONNX_CPU_CHALLENGER',
      executionProvider: 'CPUExecutionProvider',
      requestedRepresentationId: 'semantic_768',
      semanticSpaceParity: 'UNPROVEN',
      canonicalAuthority: false,
      promotionEligible: false,
      planChecksumVerified: false,
      modelArtifactRevision: null,
      tokenizerRevision: null,
      validation: 'DIMENSION_FINITE_L2_ONLY',
      dimension: 768,
      normalized: true,
    });
    expect(result).not.toHaveProperty('representationId');
  });

  it('rejects checksum drift before calling the executor', async () => {
    const embed = vi.fn(async () => new Array(768).fill(1 / Math.sqrt(768)));
    const run = createOnnxChallengerBatchV1(embed);
    const [result] = await run([plan({ renderedInputChecksum: `sha256:${'c'.repeat(64)}` })]);

    expect(result).toMatchObject({ status: 'PLAN_REJECTED', reason: 'EMBEDDING_CONTEXT_INPUT_CHECKSUM_MISMATCH' });
    expect(embed).not.toHaveBeenCalled();
  });

  it('rejects invalid plan shape and over-budget input without inference', async () => {
    const embed = vi.fn(async () => new Array(768).fill(1 / Math.sqrt(768)));
    const run = createOnnxChallengerBatchV1(embed);
    const results = await run([
      { ...plan(), canonicalAuthority: true },
      plan({ estimatedTokens: 513 }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['PLAN_REJECTED', 'PLAN_REJECTED']);
    expect(embed).not.toHaveBeenCalled();
  });

  it('isolates unavailable, thrown, and invalid-vector executor outcomes per item', async () => {
    const unavailable = createOnnxChallengerBatchV1(vi.fn(async () => null));
    const badVector = createOnnxChallengerBatchV1(vi.fn(async () => new Array(512).fill(1)));
    const [noResult] = await unavailable([plan()]);
    const [invalidResult] = await badVector([plan()]);
    const throwThenSucceed = vi.fn()
      .mockRejectedValueOnce(new Error('private executor detail'))
      .mockResolvedValueOnce(new Array(768).fill(1 / Math.sqrt(768)));
    const [thrown, recovered] = await createOnnxChallengerBatchV1(throwThenSucceed)([plan(), plan()]);

    expect(noResult).toMatchObject({ status: 'UNAVAILABLE', canonicalAuthority: false, promotionEligible: false });
    expect(invalidResult).toMatchObject({ status: 'OUTPUT_REJECTED', canonicalAuthority: false, promotionEligible: false });
    expect(thrown).toMatchObject({ status: 'UNAVAILABLE', reason: 'EXECUTOR_CALL_FAILED' });
    expect(thrown).not.toHaveProperty('error');
    expect(recovered).toMatchObject({ status: 'COMPLETE', canonicalAuthority: false, promotionEligible: false });
  });
});
