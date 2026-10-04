import { describe, expect, it, vi } from 'vitest';
import {
  executeEmbeddingInputV1,
  prepareEmbeddingInputV1,
  validateEmbeddingBatchV1,
} from './embedding-execution-adapter-v1.js';

const vector = Array.from({ length: 768 }, () => 1 / Math.sqrt(768));

describe('Embedding execution adapter V1', () => {
  it('preserves raw legacy text and labels it unprompted', async () => {
    const executor = vi.fn().mockResolvedValue(vector);
    const result = await executeEmbeddingInputV1({ text: ' query ', executor });

    expect(executor).toHaveBeenCalledWith(' query ');
    expect(result.inputRecipe.mode).toBe('unprompted_legacy');
    expect(result.inputRecipe.promptRevision).toBe('unprompted-v0');
    expect(result.persistencePerformed).toBe(false);
  });

  it('formats task modes through the shared formatter and binds both digests', async () => {
    const executor = vi.fn().mockResolvedValue(vector);
    const result = await executeEmbeddingInputV1({ text: ' find writer ', mode: 'retrieval_query', executor });

    expect(executor).toHaveBeenCalledWith('task: search result | query: find writer');
    expect(result.inputRecipe.mode).toBe('retrieval_query');
    expect(result.inputRecipe.promptRevision).toBe('embeddinggemma.task-prompts.google-v1');
    expect(result.inputRecipe.sourceTextDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.inputRecipe.formattedInputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed vectors before returning a result', async () => {
    await expect(executeEmbeddingInputV1({ text: 'query', executor: async () => [0, 1] })).rejects.toThrow(
      'EMBEDDING_EXECUTOR_VECTOR_INVALID:index=0:DIMENSIONS_NOT_768',
    );
  });

  it('prepares the same revisioned recipe for shared batch executors', () => {
    const prepared = prepareEmbeddingInputV1({ text: 'find writer', mode: 'retrieval_query' });
    expect(prepared.formattedText).toBe('task: search result | query: find writer');
    expect(prepared.inputRecipe.mode).toBe('retrieval_query');
    expect(prepared.inputRecipe.formattedInputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates batch cardinality and every vector shape', () => {
    expect(validateEmbeddingBatchV1([vector, vector], 2)).toHaveLength(2);
    expect(() => validateEmbeddingBatchV1([vector], 2)).toThrow('EMBEDDING_EXECUTOR_BATCH_INVALID:COUNT_MISMATCH');
    expect(() => validateEmbeddingBatchV1([vector, [0, 1]], 2)).toThrow(
      'EMBEDDING_EXECUTOR_VECTOR_INVALID:index=1:DIMENSIONS_NOT_768',
    );
  });
});
