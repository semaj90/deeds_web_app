import { describe, expect, it } from 'vitest';
import {
  ATLAS_SEMANTIC_768_DIMENSION,
  compileSemantic768AtlasPacketBinding,
  semantic768Float32Digest,
} from './semantic-768-postgres-binding.js';

function normalizedVector(): number[] {
  const value = 1 / Math.sqrt(ATLAS_SEMANTIC_768_DIMENSION);
  return Array.from({ length: ATLAS_SEMANTIC_768_DIMENSION }, () => value);
}

function validInput() {
  return {
    packetKey: 'packet:emb3b1:1',
    sourceRef: 'sveltekit-frontend/src/lib/server/example.ts',
    sourceRevision: '12aa89f38ffdeb4cee50d36bce3ad33c4b0ba351',
    sourceVersionReceiptId: 'receipt:source-version:emb3b1:1',
    workspaceRevision: 742,
    representationRevision: 1,
    encoderRevision: 'embeddinggemma-native-768-v1',
    vector: normalizedVector(),
  };
}

describe('semantic_768 Postgres binding', () => {
  it('binds revision-qualified native 768 evidence to atlas_packets.embedding only', () => {
    const input = validInput();
    const receipt = compileSemantic768AtlasPacketBinding(input);

    expect(receipt.postgresTable).toBe('atlas_packets');
    expect(receipt.postgresVectorColumn).toBe('embedding');
    expect(receipt.representationId).toBe('semantic_768');
    expect(receipt.dimension).toBe(768);
    expect(receipt.patch.embedding).toHaveLength(768);
    expect(receipt.patch.sourceRevision).toBe(input.sourceRevision);
    expect(receipt.patch.sourceVersionReceiptId).toBe(input.sourceVersionReceiptId);
    expect(receipt.patch.sourceRepresentationId).toBe('semantic_768');
    expect(receipt.patch.sourceDimension).toBe(768);
    expect(receipt.patch.encoderRevision).toBe(input.encoderRevision);
    expect(receipt.patch.embeddingDigest).toBe(semantic768Float32Digest(receipt.patch.embedding ?? []));
    expect(receipt.canonicalWritesAllowed).toBe(false);
    expect(receipt.qdrantWritesAllowed).toBe(false);
    expect(receipt.valkeyWritesAllowed).toBe(false);
  });

  it('rejects vectors that are not exactly 768 dimensions', () => {
    const input = validInput();
    expect(() => compileSemantic768AtlasPacketBinding({ ...input, vector: input.vector.slice(0, 767) }))
      .toThrow(/DIMENSION_MISMATCH/);
  });

  it('rejects non-normalized vectors', () => {
    const input = validInput();
    expect(() => compileSemantic768AtlasPacketBinding({ ...input, vector: Array(768).fill(1) }))
      .toThrow(/NOT_NORMALIZED/);
  });

  it('rejects missing source revision proof', () => {
    const input = validInput();
    expect(() => compileSemantic768AtlasPacketBinding({ ...input, sourceRevision: '' }))
      .toThrow(/SOURCE_REVISION_REQUIRED/);
    expect(() => compileSemantic768AtlasPacketBinding({ ...input, sourceVersionReceiptId: '' }))
      .toThrow(/SOURCE_VERSION_RECEIPT_ID_REQUIRED/);
  });

  it('rejects representation revision zero for new semantic_768 writes', () => {
    const input = validInput();
    expect(() => compileSemantic768AtlasPacketBinding({ ...input, representationRevision: 0 }))
      .toThrow(/REPRESENTATION_REVISION_INVALID/);
  });
});
