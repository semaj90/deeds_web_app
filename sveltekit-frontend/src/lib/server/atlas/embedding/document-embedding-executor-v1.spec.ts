import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createHttpDocumentEmbeddingExecutorV1, type AtlasSemanticDocumentV1 } from './document-embedding-executor-v1.js';

const document: AtlasSemanticDocumentV1 = {
  packetKey: 'packet:test',
  sourceRef: 'src/test.ts',
  sourceRevision: 'workspace:test',
  contentHash: null,
  documentKind: 'FUNCTION',
  title: 'test function',
  documentText: 'function test() { return true; }',
  embeddingRole: 'DOCUMENT',
};

const vector = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);

describe('document embedding executor v1', () => {
  it('normalizes both HTTP backends behind one semantic_768 contract', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: vector }] }), { status: 200 }));
    const executor = createHttpDocumentEmbeddingExecutorV1({
      executorId: 'LLAMA_CPP_CUDA',
      endpoint: 'http://embedding.test',
      model: 'embeddinggemma',
      modelRevision: 'model-v1',
      representationRevision: 'semantic_768@v1',
      fetchImpl,
    });
    const result = await executor.embedDocuments([document], { maxDocuments: 8, maxTokens: 512, maxBytes: 10_000 });
    expect(fetchImpl).toHaveBeenCalledWith('http://embedding.test/v1/embeddings', expect.objectContaining({ method: 'POST' }));
    expect(result.vectors[0]).toHaveLength(768);
    expect(result.receipt.representationId).toBe('semantic_768');
    expect(result.receipt.role).toBe('DOCUMENT');
    expect(result.receipt).toMatchObject({
      inputPolicyRevision: 'title-newline-text-v1',
      inputQualification: 'EXECUTION_INPUTS_HASHED',
      canonicalAuthority: false,
      inputs: [{
        packetKey: document.packetKey,
        sourceRef: document.sourceRef,
        sourceRevision: document.sourceRevision,
        contentHash: document.contentHash,
        inputChecksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }],
    });
    expect(result.receipt.inputs[0]?.inputChecksum).toBe(
      `sha256:${createHash('sha256').update(`${document.title}\n${document.documentText}`, 'utf8').digest('hex')}`,
    );
    const outputBytes = new Uint8Array(vector.length * Float32Array.BYTES_PER_ELEMENT);
    const outputView = new DataView(outputBytes.buffer);
    vector.forEach((value, index) => outputView.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true));
    expect(result.receipt.outputChecksum).toBe(`sha256:${createHash('sha256').update(outputBytes).digest('hex')}`);
  });

  it('rejects mixed query/document batches', async () => {
    const fetchImpl = vi.fn();
    const executor = createHttpDocumentEmbeddingExecutorV1({
      executorId: 'OLLAMA',
      endpoint: 'http://embedding.test',
      model: 'embeddinggemma',
      modelRevision: 'model-v1',
      representationRevision: 'semantic_768@v1',
      fetchImpl,
    });
    await expect(executor.embedDocuments([
      document,
      { ...document, embeddingRole: 'QUERY' },
    ], { maxDocuments: 8, maxTokens: 512, maxBytes: 10_000 })).rejects.toThrow('EMBEDDING_BATCH_ROLE_MIXED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
