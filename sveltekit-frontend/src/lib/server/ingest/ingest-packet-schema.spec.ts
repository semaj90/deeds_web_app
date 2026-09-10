import { describe, expect, it } from 'vitest';

import {
  CANONICAL_EMBEDDING_CONTRACTS,
  validateEmbeddingContract,
  buildIngestionWorkerDispatch,
  type IngestPacket,
} from './ingest-packet-schema.js';

function packetWithContract(embeddingContract: IngestPacket['embeddingContract']): IngestPacket {
  return {
    packetKey: '11111111-1111-4111-8111-111111111111',
    sourceRef: 'src/lib/server/example.ts',
    documentId: '22222222-2222-4222-8222-222222222222',
    documentVersion: 'sha256:document-v1',
    contentHash: 'a'.repeat(64),
    chunk: {
      chunkId: '33333333-3333-4333-8333-333333333333',
      ordinal: 0,
      text: 'export function example() { return true; }',
      tokenCount: 8,
      startOffset: 0,
      endOffset: 42,
      structuralPath: ['function', 'example'],
      contentHash: 'b'.repeat(64),
    },
    classification: {
      domainClass: 'code',
      confidence: 0.9,
      classifierVersion: 'fixture-v1',
    },
    embeddingContract,
  };
}

describe('canonical EmbeddingGemma ingest contract', () => {
  it('admits native semantic_768', () => {
    expect(validateEmbeddingContract(CANONICAL_EMBEDDING_CONTRACTS.NATIVE_768)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it.each([
    CANONICAL_EMBEDDING_CONTRACTS.MRL_512,
    CANONICAL_EMBEDDING_CONTRACTS.MRL_256,
    CANONICAL_EMBEDDING_CONTRACTS.MRL_128,
  ])('admits official MRL reference width $storedDimensions', (contract) => {
    expect(validateEmbeddingContract(contract).valid).toBe(true);
  });

  it('rejects the historical Atlas 384 direct-slice width as EmbeddingGemma MRL', () => {
    const result = validateEmbeddingContract({
      modelId: 'embeddinggemma',
      modelRevision: '20260720',
      nativeDimensions: 768,
      storedDimensions: 384,
      normalized: true,
      pooling: 'mean',
      projectionVersion: 'atlas-legacy-direct-slice384-v1',
      contractVersion: 'legacy',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('384 is not an admitted MRL representation');
  });

  it('rejects arbitrary reduced widths even when a projectionVersion is supplied', () => {
    const result = validateEmbeddingContract({
      modelId: 'embeddinggemma',
      modelRevision: '20260720',
      nativeDimensions: 768,
      storedDimensions: 640,
      normalized: true,
      pooling: 'mean',
      projectionVersion: 'invented-640-v1',
      contractVersion: '2.0',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('768/512/256/128');
  });

  it('fails dispatch closed before a 384 contract can queue an embedding job', () => {
    const packet = packetWithContract({
      modelId: 'embeddinggemma',
      modelRevision: '20260720',
      nativeDimensions: 768,
      storedDimensions: 384,
      normalized: true,
      pooling: 'mean',
      projectionVersion: 'legacy-384',
      contractVersion: 'legacy',
    });
    expect(() => buildIngestionWorkerDispatch(packet, 'auto-accept')).toThrow(
      'INVALID_EMBEDDING_CONTRACT',
    );
  });
});
