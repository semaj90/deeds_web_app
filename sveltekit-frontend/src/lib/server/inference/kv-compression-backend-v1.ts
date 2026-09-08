/**
 * KV-cache compression backend interface — Stage 1/2 scaffolding only.
 *
 * OWNERSHIP AND SCOPE (openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md,
 * "KV-cache compression (Stage 1-2 only)")
 * -----------------------------------------------------------------------------------------
 * This is research scaffolding, isolated and testable in Node without touching the live
 * `llama-server.exe` process. It is NOT the runtime attention KV cache used by Ornith on
 * `:8090` (that stays `-ctk q8_0 -ctv q8_0`, unchanged by anything here) and it is NOT the
 * separate `src/lib/server/search/mla-kv-compress.ts` module — that file compresses
 * *retrieval-candidate embeddings* (768-dim -> 128-dim latents, cached in Redis, for ACE
 * reranking) via a DeepSeek-MLA-inspired projection; this file is a scaffold for
 * *LLM-decoding attention KV-cache* compression backends (the RotorQuant/TurboQuant/IsoQuant
 * research track). Same acronym ("KV"), genuinely different domain and data shape — read
 * both files before assuming either one supersedes the other.
 *
 * Stage 1 (block-diagonal rotation kernel) and Stage 2 (round-trip fixture over real KV
 * tensors extracted from a live model) remain separate, NOT-yet-done tasks in that same
 * tasks.md file. This file closes only the "define KvCompressionBackend interface... FP16
 * passthrough implementation as the only working backend initially" checkbox.
 *
 * `Fp16PassthroughKvBackend` performs a REAL fp16 round-trip (IEEE 754 binary16 encode then
 * decode via a manual bit-manipulation codec, since this repo's pinned Node runtime has no
 * native `Float16Array`) rather than an identity no-op mislabeled as fp16 — CLAUDE.md's
 * status-language discipline requires not describing a lossless passthrough as a real
 * precision format. Reconstruction error is therefore genuinely non-zero and bounded by
 * fp16's real ~3-4 significant decimal digits, not zero.
 */

// ── fp32 <-> fp16 (IEEE 754 binary16) bit-level codec ──────────────────────────────────────
//
// Manual implementation because this repo's pinned Node runtime (v22.17.1, checked live
// before writing this) does not expose a native `Float16Array`. Round-to-nearest-even is not
// implemented (round-to-nearest with ties rounding away from zero is used instead, via the
// `+= m & 1` rounding term below) -- acceptable for a research reconstruction-error fixture,
// but not claimed to be bit-identical to hardware fp16 rounding on every input.

const f32ScratchBuffer = new ArrayBuffer(4);
const f32View = new Float32Array(f32ScratchBuffer);
const i32View = new Int32Array(f32ScratchBuffer);

/** Encode one fp32 value to its IEEE 754 binary16 bit pattern (as a plain uint16 number). */
export function float32ToFloat16Bits(value: number): number {
  f32View[0] = value;
  const x = i32View[0];

  const sign = (x >> 16) & 0x8000;
  let exponent = (x >> 23) & 0xff;
  let mantissa = x & 0x7fffff;

  if (exponent === 0xff) {
    // Infinity or NaN
    return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  }

  // Rebase exponent to fp16's bias (15) from fp32's bias (127).
  exponent = exponent - 127 + 15;

  if (exponent >= 0x1f) {
    // Overflow -> infinity
    return sign | 0x7c00;
  }

  if (exponent <= 0) {
    if (exponent < -10) {
      // Too small even for a subnormal -> signed zero
      return sign;
    }
    // Subnormal fp16
    mantissa |= 0x800000;
    const shift = 14 - exponent;
    let halfMantissa = mantissa >> shift;
    const roundBit = (mantissa >> (shift - 1)) & 1;
    halfMantissa += roundBit;
    return sign | halfMantissa;
  }

  let halfMantissa = mantissa >> 13;
  const roundBit = (mantissa >> 12) & 1;
  let bits = sign | (exponent << 10) | halfMantissa;
  bits += roundBit;
  return bits;
}

/** Decode an IEEE 754 binary16 bit pattern back to its fp32 value. */
export function float16BitsToFloat32(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const mantissa = bits & 0x3ff;

  if (exponent === 0) {
    if (mantissa === 0) return sign * 0;
    // Subnormal
    return sign * mantissa * Math.pow(2, -24);
  }

  if (exponent === 0x1f) {
    return mantissa ? NaN : sign * Infinity;
  }

  return sign * (1 + mantissa / 1024) * Math.pow(2, exponent - 15);
}

/** Round-trip one fp32 value through fp16 precision. */
export function roundTripFloat32ThroughFloat16(value: number): number {
  return float16BitsToFloat32(float32ToFloat16Bits(value));
}

// ── KvCompressionBackend interface ─────────────────────────────────────────────────────────

/**
 * Shape of a single layer's KV cache slab. `attend()` operates on one layer at a time --
 * looping across `numLayers` is a caller concern, matching how llama.cpp's own per-layer
 * attention works. Included in the shape so a future multi-layer batching backend can use it
 * for metadata/validation without changing this interface.
 */
export interface KvTensorShapeV1 {
  numLayers: number;
  numHeads: number;
  seqLen: number;
  headDim: number;
}

/** Opaque compressed representation produced by a backend's `quantizeNewKv`. */
export interface KvCompressedBlockV1 {
  formatId: string;
  shape: KvTensorShapeV1;
  bytes: Uint8Array;
}

export interface KvCompressionMetricsV1 {
  formatId: string;
  quantizeCalls: number;
  attendCalls: number;
  totalOriginalBytes: number;
  totalCompressedBytes: number;
  compressionRatio: number;
}

/**
 * A KV-cache compression backend. `quantizeNewKv` is called once per new K (or V) slab as it
 * enters the cache; `attend` computes scaled dot-product attention for one query vector
 * against a compressed keys block and a compressed values block from the same layer.
 */
export interface KvCompressionBackend {
  readonly formatId: string;

  /** Compress one raw fp32 K or V slab (`shape.numHeads * shape.seqLen * shape.headDim` values). */
  quantizeNewKv(rawKv: Float32Array, shape: KvTensorShapeV1): KvCompressedBlockV1;

  /** Decompress a block back to fp32 -- required for the Stage 2 reconstruction-error fixture. */
  dequantizeKv(block: KvCompressedBlockV1): Float32Array;

  /**
   * Scaled dot-product attention for one query vector (`shape.numHeads * shape.headDim`
   * values) against a compressed keys block and compressed values block from the same layer.
   * Returns the attention output (`shape.numHeads * shape.headDim` values).
   */
  attend(
    query: Float32Array,
    keys: KvCompressedBlockV1,
    values: KvCompressedBlockV1,
    shape: KvTensorShapeV1,
  ): Float32Array;

  exportMetrics(): KvCompressionMetricsV1;
}

function assertSlabLength(kv: Float32Array, shape: KvTensorShapeV1, label: string): void {
  const expected = shape.numHeads * shape.seqLen * shape.headDim;
  if (kv.length !== expected) {
    throw new Error(
      `${label}: expected length ${expected} (numHeads*seqLen*headDim), got ${kv.length}`,
    );
  }
}

function softmaxInPlace(scores: Float32Array): void {
  let max = -Infinity;
  for (let i = 0; i < scores.length; i++) if (scores[i] > max) max = scores[i];
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    const e = Math.exp(scores[i] - max);
    scores[i] = e;
    sum += e;
  }
  const invSum = sum > 0 ? 1 / sum : 0;
  for (let i = 0; i < scores.length; i++) scores[i] *= invSum;
}

/**
 * `FP16` passthrough backend: the only working backend for this task. Real fp16 round-trip
 * (see codec above), no rotation, no blockwise grouping, no paging. This is the reference
 * backend Stage 1's rotation kernel and Stage 2's fixture compare against.
 */
export class Fp16PassthroughKvBackend implements KvCompressionBackend {
  readonly formatId = 'fp16_passthrough';

  private quantizeCalls = 0;
  private attendCalls = 0;
  private totalOriginalBytes = 0;
  private totalCompressedBytes = 0;

  quantizeNewKv(rawKv: Float32Array, shape: KvTensorShapeV1): KvCompressedBlockV1 {
    assertSlabLength(rawKv, shape, 'quantizeNewKv');

    const bytes = new Uint8Array(rawKv.length * 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < rawKv.length; i++) {
      view.setUint16(i * 2, float32ToFloat16Bits(rawKv[i]), true);
    }

    this.quantizeCalls += 1;
    this.totalOriginalBytes += rawKv.length * 4;
    this.totalCompressedBytes += bytes.length;

    return { formatId: this.formatId, shape, bytes };
  }

  dequantizeKv(block: KvCompressedBlockV1): Float32Array {
    if (block.formatId !== this.formatId) {
      throw new Error(
        `Fp16PassthroughKvBackend.dequantizeKv: format mismatch (expected ${this.formatId}, got ${block.formatId})`,
      );
    }
    const view = new DataView(block.bytes.buffer, block.bytes.byteOffset, block.bytes.byteLength);
    const count = block.bytes.length / 2;
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = float16BitsToFloat32(view.getUint16(i * 2, true));
    }
    return out;
  }

  attend(
    query: Float32Array,
    keys: KvCompressedBlockV1,
    values: KvCompressedBlockV1,
    shape: KvTensorShapeV1,
  ): Float32Array {
    if (query.length !== shape.numHeads * shape.headDim) {
      throw new Error(
        `attend: expected query length ${shape.numHeads * shape.headDim}, got ${query.length}`,
      );
    }

    const k = this.dequantizeKv(keys);
    const v = this.dequantizeKv(values);
    assertSlabLength(k, shape, 'attend keys');
    assertSlabLength(v, shape, 'attend values');

    const scale = 1 / Math.sqrt(shape.headDim);
    const output = new Float32Array(shape.numHeads * shape.headDim);

    for (let h = 0; h < shape.numHeads; h++) {
      const qOffset = h * shape.headDim;
      const scores = new Float32Array(shape.seqLen);

      for (let t = 0; t < shape.seqLen; t++) {
        const kOffset = (h * shape.seqLen + t) * shape.headDim;
        let dot = 0;
        for (let d = 0; d < shape.headDim; d++) {
          dot += query[qOffset + d] * k[kOffset + d];
        }
        scores[t] = dot * scale;
      }

      softmaxInPlace(scores);

      const outOffset = h * shape.headDim;
      for (let t = 0; t < shape.seqLen; t++) {
        const vOffset = (h * shape.seqLen + t) * shape.headDim;
        const weight = scores[t];
        for (let d = 0; d < shape.headDim; d++) {
          output[outOffset + d] += weight * v[vOffset + d];
        }
      }
    }

    this.attendCalls += 1;
    return output;
  }

  exportMetrics(): KvCompressionMetricsV1 {
    return {
      formatId: this.formatId,
      quantizeCalls: this.quantizeCalls,
      attendCalls: this.attendCalls,
      totalOriginalBytes: this.totalOriginalBytes,
      totalCompressedBytes: this.totalCompressedBytes,
      compressionRatio:
        this.totalOriginalBytes > 0
          ? this.totalOriginalBytes / Math.max(this.totalCompressedBytes, 1)
          : 0,
    };
  }
}
