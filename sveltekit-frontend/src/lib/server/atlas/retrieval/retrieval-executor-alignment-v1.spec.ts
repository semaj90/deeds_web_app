import { describe, expect, it } from 'vitest';
import { buildRetrievalExecutorAlignmentV1 } from './retrieval-executor-alignment-v1.js';

describe('retrieval executor alignment v1', () => {
  it('keeps Qdrant, GPU, TurboVec, and DiskANN in one semantic lane', () => {
    const alignment = buildRetrievalExecutorAlignmentV1();
    expect(alignment.logicalLane).toBe('semantic_768');
    expect(alignment.canonicalCollection).toBe('codebase_chunks_768_v2');
    expect(alignment.canonicalVector).toBe('content');
    expect(alignment.executors).toHaveLength(5);
    expect(alignment.executors.every((executor) => !executor.addsFusionVote)).toBe(true);
  });

  it('requires payload lineage and refuses unproven quantization promotion', () => {
    const alignment = buildRetrievalExecutorAlignmentV1();
    expect(alignment.requiredPayloadFields).toEqual(expect.arrayContaining([
      'representation_id', 'workspace_revision', 'source_revision', 'tags',
    ]));
    expect(alignment.quantization).toEqual({
      canonicalStorage: 'FP32',
      qdrant: 'UNPROVEN',
      turbovec: 'UNPROVEN',
      diskannVamana: 'UNPROVEN',
    });
    expect(alignment.rtxGpu.rawVectorsOverRpc).toBe(false);
    expect(alignment.canonicalWritesAllowed).toBe(false);
  });
});
