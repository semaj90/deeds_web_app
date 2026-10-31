import { describe, it, expect } from 'vitest';
import {
  EMBEDDINGGEMMA_REPRESENTATIONS,
  l2Normalize,
  deriveCanonicalMrlBundleV1,
  verifyQualifiedBitsetBatchHmacV1,
} from './embeddinggemma-canonical-contract-v1.js';
import { createHmac, randomUUID } from 'node:crypto';

describe('EmbeddingGemma Canonical Contract V1', () => {
  it('exposes exactly the 7 canonical representations', () => {
    expect(Object.keys(EMBEDDINGGEMMA_REPRESENTATIONS)).toEqual([
      'semantic_768',
      'mrl_512',
      'mrl_256',
      'mrl_128',
      'latent256',
      'latent128',
      'latent64',
    ]);
  });

  it('correctly L2-normalizes vectors', () => {
    const raw = new Float32Array([3, 4]);
    const norm = l2Normalize(raw);
    expect(norm[0]).toBeCloseTo(0.6);
    expect(norm[1]).toBeCloseTo(0.8);
    const sumSq = norm[0] * norm[0] + norm[1] * norm[1];
    expect(sumSq).toBeCloseTo(1.0);
  });

  it('rejects zero or non-finite vectors during normalization', () => {
    expect(() => l2Normalize(new Float32Array([0, 0, 0]))).toThrow('EMBEDDINGGEMMA_ZERO_OR_NONFINITE_NORM');
    expect(() => l2Normalize(new Float32Array([NaN, 1, 2]))).toThrow('EMBEDDINGGEMMA_ZERO_OR_NONFINITE_NORM');
  });

  it('derives canonical MRL bundle with exact dimensions and sign bitset', () => {
    const raw768 = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      raw768[i] = Math.sin(i);
    }
    const bundle = deriveCanonicalMrlBundleV1(raw768);
    expect(bundle.semantic_768.length).toBe(768);
    expect(bundle.mrl_512.length).toBe(512);
    expect(bundle.mrl_256.length).toBe(256);
    expect(bundle.mrl_128.length).toBe(128);
    expect(bundle.bitset128Bytes.byteLength).toBe(16);
    expect(bundle.bitset128Hex.length).toBe(32);
    expect(bundle.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects input that is not 768 floats', () => {
    expect(() => deriveCanonicalMrlBundleV1(new Float32Array(384))).toThrow('EMBEDDINGGEMMA_INVALID_DIM: expected 768, got 384');
  });

  it('verifies qualified bitset batch HMAC signature and rejects tampering', () => {
    const secretKey = 'my-super-secret-batch-key-12345';
    const workspaceId = randomUUID();
    const workspaceRevision = 'git:abcdef123456';
    const sourceRevision = 'sha256:' + 'a'.repeat(64);
    const ordinalMapChecksumSha256 = 'b'.repeat(64);
    const candidateOrdinals = new Uint32Array([0, 1]);
    const queryBitset16B = new Uint8Array(16).fill(0xaa);
    const candidateBitsets16B = new Uint8Array(32).fill(0x55);

    const validMac = createHmac('sha256', secretKey)
      .update(workspaceId)
      .update(workspaceRevision)
      .update(sourceRevision)
      .update(ordinalMapChecksumSha256)
      .update(Buffer.from(queryBitset16B))
      .update(Buffer.from(candidateBitsets16B))
      .digest('hex');

    const validBatch = {
      workspaceId,
      workspaceRevision,
      sourceRevision,
      representationId: 'mrl_128' as const,
      ordinalMapChecksumSha256,
      candidateOrdinals,
      queryBitset16B,
      candidateBitsets16B,
      hmacSignatureHex: validMac,
    };

    expect(verifyQualifiedBitsetBatchHmacV1(validBatch, secretKey)).toBe(true);

    const tamperedBatch = { ...validBatch, hmacSignatureHex: 'c'.repeat(64) };
    expect(verifyQualifiedBitsetBatchHmacV1(tamperedBatch, secretKey)).toBe(false);
  });
});
