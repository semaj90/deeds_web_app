import { describe, expect, it } from 'vitest';

import {
  Fp16PassthroughKvBackend,
  float16BitsToFloat32,
  float32ToFloat16Bits,
  roundTripFloat32ThroughFloat16,
  type KvTensorShapeV1,
} from './kv-compression-backend-v1';

describe('fp32 <-> fp16 bit codec', () => {
  // Known IEEE 754 binary16 bit patterns, independently verifiable against any
  // standard fp16 reference (e.g. numpy.float16(x).view(numpy.uint16)).
  const knownPairs: Array<[number, number]> = [
    [1.0, 0x3c00],
    [-1.0, 0xbc00],
    [2.0, 0x4000],
    [-2.0, 0xc000],
    [0.5, 0x3800],
    [0.0, 0x0000],
    [-0.0, 0x8000],
    [65504, 0x7bff], // max finite fp16
  ];

  it.each(knownPairs)('encodes %f to bit pattern 0x%s', (value, expectedBits) => {
    expect(float32ToFloat16Bits(value)).toBe(expectedBits);
  });

  it.each(knownPairs)('decodes bit pattern back to %f', (expectedValue, bits) => {
    expect(float16BitsToFloat32(bits)).toBeCloseTo(expectedValue, 5);
  });

  it('overflows large magnitude values to signed infinity', () => {
    expect(float32ToFloat16Bits(1e10)).toBe(0x7c00);
    expect(float32ToFloat16Bits(-1e10)).toBe(0xfc00);
    expect(float16BitsToFloat32(0x7c00)).toBe(Infinity);
    expect(float16BitsToFloat32(0xfc00)).toBe(-Infinity);
  });

  it('flushes subnormal-too-small values to signed zero', () => {
    expect(float32ToFloat16Bits(1e-10)).toBe(0x0000);
    expect(float32ToFloat16Bits(-1e-10)).toBe(0x8000);
  });

  it('round-trips a value that fp16 cannot represent exactly with a bounded, non-zero error', () => {
    const original = 1.0 / 3.0;
    const roundTripped = roundTripFloat32ThroughFloat16(original);
    const error = Math.abs(roundTripped - original);

    // fp16 has ~3-4 significant decimal digits; this must be a REAL, non-zero
    // reconstruction error, not a lossless passthrough mislabeled as fp16.
    expect(error).toBeGreaterThan(0);
    expect(error).toBeLessThan(1e-3);
  });

  it('is idempotent on values already exactly representable in fp16', () => {
    expect(roundTripFloat32ThroughFloat16(1.0)).toBe(1.0);
    expect(roundTripFloat32ThroughFloat16(0.5)).toBe(0.5);
    expect(roundTripFloat32ThroughFloat16(-2.0)).toBe(-2.0);
  });
});

describe('Fp16PassthroughKvBackend', () => {
  const shape: KvTensorShapeV1 = { numLayers: 1, numHeads: 1, seqLen: 2, headDim: 2 };

  it('rejects a raw KV slab of the wrong length', () => {
    const backend = new Fp16PassthroughKvBackend();
    expect(() => backend.quantizeNewKv(new Float32Array([1, 2, 3]), shape)).toThrow();
  });

  it('quantize -> dequantize round-trips within fp16 precision', () => {
    const backend = new Fp16PassthroughKvBackend();
    const raw = new Float32Array([1 / 3, -2 / 3, 0.5, -0.25]);
    const block = backend.quantizeNewKv(raw, shape);

    expect(block.formatId).toBe('fp16_passthrough');
    expect(block.bytes.length).toBe(raw.length * 2);

    const dequantized = backend.dequantizeKv(block);
    expect(dequantized.length).toBe(raw.length);
    for (let i = 0; i < raw.length; i++) {
      expect(Math.abs(dequantized[i] - raw[i])).toBeLessThan(1e-3);
    }
  });

  it('rejects dequantizing a block with a mismatched formatId', () => {
    const backend = new Fp16PassthroughKvBackend();
    const block = backend.quantizeNewKv(new Float32Array([1, 2, 3, 4]), shape);
    expect(() =>
      backend.dequantizeKv({ ...block, formatId: 'some_other_format' }),
    ).toThrow();
  });

  it('computes scaled dot-product attention matching a hand-computed reference', () => {
    const backend = new Fp16PassthroughKvBackend();
    // 1 head, seqLen=2, headDim=2. Keys/values chosen so the reference
    // softmax/weighted-sum can be computed by hand independently below.
    const keys = backend.quantizeNewKv(new Float32Array([1, 0, 0, 1]), shape); // k0=(1,0), k1=(0,1)
    const values = backend.quantizeNewKv(new Float32Array([10, 0, 0, 20]), shape); // v0=(10,0), v1=(0,20)
    const query = new Float32Array([1, 0]); // q=(1,0)

    const output = backend.attend(query, keys, values, shape);

    // Hand-computed reference: scale = 1/sqrt(2).
    const scale = 1 / Math.sqrt(2);
    const score0 = (1 * 1 + 0 * 0) * scale; // q . k0
    const score1 = (1 * 0 + 0 * 1) * scale; // q . k1
    const maxScore = Math.max(score0, score1);
    const e0 = Math.exp(score0 - maxScore);
    const e1 = Math.exp(score1 - maxScore);
    const sum = e0 + e1;
    const w0 = e0 / sum;
    const w1 = e1 / sum;
    const expectedOut0 = w0 * 10 + w1 * 0;
    const expectedOut1 = w0 * 0 + w1 * 20;

    expect(output.length).toBe(2);
    expect(output[0]).toBeCloseTo(expectedOut0, 2);
    expect(output[1]).toBeCloseTo(expectedOut1, 2);
  });

  it('rejects a query vector of the wrong length', () => {
    const backend = new Fp16PassthroughKvBackend();
    const keys = backend.quantizeNewKv(new Float32Array([1, 0, 0, 1]), shape);
    const values = backend.quantizeNewKv(new Float32Array([1, 0, 0, 1]), shape);
    expect(() => backend.attend(new Float32Array([1, 2, 3]), keys, values, shape)).toThrow();
  });

  it('tracks quantize/attend call counts and a real (non-1.0) compression ratio', () => {
    const backend = new Fp16PassthroughKvBackend();
    const raw = new Float32Array([1, 2, 3, 4]);
    const keys = backend.quantizeNewKv(raw, shape);
    const values = backend.quantizeNewKv(raw, shape);
    backend.attend(new Float32Array([1, 0]), keys, values, shape);

    const metrics = backend.exportMetrics();
    expect(metrics.formatId).toBe('fp16_passthrough');
    expect(metrics.quantizeCalls).toBe(2);
    expect(metrics.attendCalls).toBe(1);
    expect(metrics.totalOriginalBytes).toBe(raw.length * 4 * 2);
    expect(metrics.totalCompressedBytes).toBe(raw.length * 2 * 2);
    // fp32 (4 bytes/value) -> fp16 (2 bytes/value) is exactly a 2x compression ratio.
    expect(metrics.compressionRatio).toBeCloseTo(2, 5);
  });
});
