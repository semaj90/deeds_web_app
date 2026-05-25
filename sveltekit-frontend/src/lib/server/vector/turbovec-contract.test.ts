import { describe, expect, it } from 'vitest';
import {
  assertTurboVecEmbedding,
  buildTurboVecMetadata,
  buildTurboVecPackedRef,
  TURBOVEC_EMBEDDING_DIMENSION,
  TURBOVEC_EMBEDDING_MODEL,
  TURBOVEC_QUANTIZER,
  TURBOVEC_ROTATION_SEED,
} from './turbovec-contract';

describe('turbovec contract', () => {
  it('locks the canonical embeddinggemma dimension and metadata fields', () => {
    expect(TURBOVEC_EMBEDDING_MODEL).toBe('embeddinggemma:latest');
    expect(TURBOVEC_EMBEDDING_DIMENSION).toBe(768);
    expect(TURBOVEC_QUANTIZER).toBe('turbovec-4bit');
    expect(TURBOVEC_ROTATION_SEED).toBe('rotorquant-v1');

    expect(() => assertTurboVecEmbedding(new Array(768).fill(0))).not.toThrow();
    expect(() => assertTurboVecEmbedding(new Array(384).fill(0))).toThrow(/768d/);

    expect(buildTurboVecPackedRef('chunk-123')).toBe('redis:turbovec:vec:chunk-123');

    const metadata = buildTurboVecMetadata({
      chunkId: 'chunk-123',
      clusterId: 'cluster_kag_12',
      sourceRef: 'src/lib/server/ai/kag-runner.ts#L10-L40',
    });

    expect(metadata.embeddingModel).toBe('embeddinggemma:latest');
    expect(metadata.dimension).toBe(768);
    expect(metadata.quantizer).toBe('turbovec-4bit');
    expect(metadata.rotationSeed).toBe('rotorquant-v1');
    expect(metadata.packedBytesRef).toBe('redis:turbovec:vec:chunk-123');
    expect(metadata.clusterId).toBe('cluster_kag_12');
  });
});
