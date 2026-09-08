import { describe, expect, it } from 'vitest';

import { EmbeddingTensorArtifactV2Schema } from './embedding-tensor-artifact-v2';
import {
  CANONICAL_SEMANTIC_DIMENSION,
  CANONICAL_SEMANTIC_REPRESENTATION_ID,
} from './feature-extraction-v1';

const baseFp32 = {
  schemaVersion: 'atlas.embedding-tensor-artifact.v2' as const,
  representationId: CANONICAL_SEMANTIC_REPRESENTATION_ID,
  dimension: CANONICAL_SEMANTIC_DIMENSION,
  representationRevision: 1,
  encoding: 'fp32' as const,
  byteLength: CANONICAL_SEMANTIC_DIMENSION * 4,
  contentChecksum: 'sha256:deadbeef',
};

describe('EmbeddingTensorArtifactV2', () => {
  it('accepts a valid fp32 artifact matching the frozen v1 byte contract', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse(baseFp32);
    expect(result.success).toBe(true);
  });

  it('rejects fp32 byteLength that does not equal dimension * 4', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      byteLength: 3071,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid fp16 artifact at half the fp32 byte length', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      encoding: 'fp16',
      byteLength: CANONICAL_SEMANTIC_DIMENSION * 2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects fp16 byteLength that does not equal dimension * 2', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      encoding: 'fp16',
      byteLength: CANONICAL_SEMANTIC_DIMENSION * 4,
    });
    expect(result.success).toBe(false);
  });

  it('requires blockSize for int8_symmetric_blockwise encoding', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      encoding: 'int8_symmetric_blockwise',
      byteLength: CANONICAL_SEMANTIC_DIMENSION,
    });
    expect(result.success).toBe(false);
  });

  it('accepts int4_symmetric_blockwise with a valid blockSize and does not assert a packed-byte formula', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      encoding: 'int4_symmetric_blockwise',
      blockSize: 64,
      // Deliberately not dimension/2 or any other specific formula -- this
      // encoding's real packed size depends on an encoder that doesn't exist
      // yet (see the file's own header comment). Any positive byteLength
      // must be accepted here since no formula is asserted for it.
      byteLength: 512,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a blockSize that does not divide semantic_768 exactly', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      encoding: 'int8_symmetric_blockwise',
      blockSize: 100,
      byteLength: CANONICAL_SEMANTIC_DIMENSION,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a blockSize supplied on a non-blockwise encoding', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      blockSize: 64,
    });
    expect(result.success).toBe(false);
  });

  it('rejects dimension drift such as legacy 384', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      dimension: 384,
      byteLength: 384 * 4,
    });
    expect(result.success).toBe(false);
  });

  it('rejects representation drift such as semantic_int4', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      representationId: 'semantic_int4',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional candidateOrdinal/packetKey identity references', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      candidateOrdinal: 0,
      packetKey: 'ace:packet:abc123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (strict schema)', () => {
    const result = EmbeddingTensorArtifactV2Schema.safeParse({
      ...baseFp32,
      extraField: 'not allowed',
    });
    expect(result.success).toBe(false);
  });
});
