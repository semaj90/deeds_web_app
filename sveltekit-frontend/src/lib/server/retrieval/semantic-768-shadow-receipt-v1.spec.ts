import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildEmbeddingReceiptV1 } from '../embedding/embedding-provider-v1.js';
import { buildRetrievalTextV1 } from './retrieval-text-v1.js';
import { buildSemantic768ShadowReceiptV1 } from './semantic-768-shadow-receipt-v1.js';

const text = buildRetrievalTextV1({
  canonicalChunkId: 'chunk:1', packetKey: 'packet:1', sourceRef: 'src/a.ts',
  sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
  repositoryRelativePath: 'src/a.ts', summary: 'search helper', sourceText: 'const value = 1;',
});
const vector = new Array(768).fill(1 / Math.sqrt(768));
const inputChecksum = createHash('sha256').update(text.text, 'utf8').digest('hex');

describe('Semantic768ShadowReceiptV1', () => {
  it('binds an EmbeddingReceiptV1 to retrieval text without promotion', () => {
    const result = buildSemantic768ShadowReceiptV1(text, buildEmbeddingReceiptV1(vector, text.text, 'embeddinggemma:latest', 'semantic_768:v1'));
    expect(result).toMatchObject({ representationId: 'semantic_768', dimensions: 768, modelId: 'embeddinggemma:latest', inputChecksum, shadowOnly: true, canonicalAuthority: false, writesPerformed: false, promotionAuthorized: false });
    expect(result.retrievalTextChecksum).toBe(text.textChecksum);
  });

  it('fails closed when the embedding was produced from different text or width', () => {
    const valid = buildEmbeddingReceiptV1(vector, text.text, 'embeddinggemma:latest');
    expect(() => buildSemantic768ShadowReceiptV1(text, { ...valid, inputChecksum: 'sha256:wrong' })).toThrow(/INPUT_CHECKSUM_MISMATCH/);
    expect(() => buildSemantic768ShadowReceiptV1(text, { ...valid, embedding: [1, 2] })).toThrow(/VECTOR_INVALID/);
  });
});
