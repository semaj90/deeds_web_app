import { describe, expect, it } from 'vitest';

import {
  AMPERE_SM86_INT4_CACHE_POLICY_V1,
  AmpereQuantizationPolicyV1Schema,
} from './gpu-quantization-v1';
import {
  CANONICAL_SEMANTIC_DIMENSION,
  CANONICAL_SEMANTIC_REPRESENTATION_ID,
} from './feature-extraction-v1';

describe('AmpereQuantizationPolicyV1', () => {
  it('accepts the canonical SM86 INT4 cache policy', () => {
    const result = AmpereQuantizationPolicyV1Schema.safeParse(
      AMPERE_SM86_INT4_CACHE_POLICY_V1,
    );

    expect(result.success).toBe(true);
  });

  it('keeps semantic_768 identity when physical storage is INT4', () => {
    const parsed = AmpereQuantizationPolicyV1Schema.parse(
      AMPERE_SM86_INT4_CACHE_POLICY_V1,
    );

    // Quantization is storage, not a new semantic representation.
    expect(parsed.representationId).toBe(
      CANONICAL_SEMANTIC_REPRESENTATION_ID,
    );
    expect(parsed.dimension).toBe(CANONICAL_SEMANTIC_DIMENSION);
    expect(parsed.cacheStorageEncoding).toBe(
      'int4_symmetric_blockwise',
    );
  });

  it('rejects dimension drift such as legacy 384', () => {
    const result = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      dimension: 384,
    });

    expect(result.success).toBe(false);
  });

  it('rejects representation drift such as semantic_int4', () => {
    const result = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      representationId: 'semantic_int4',
    });

    expect(result.success).toBe(false);
  });

  it('rejects FP8/FP4 native capability claims on SM86', () => {
    const fp8 = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      nativeTensorCore: {
        ...AMPERE_SM86_INT4_CACHE_POLICY_V1.nativeTensorCore,
        fp8: true,
      },
    });

    const fp4 = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      nativeTensorCore: {
        ...AMPERE_SM86_INT4_CACHE_POLICY_V1.nativeTensorCore,
        fp4: true,
      },
    });

    expect(fp8.success).toBe(false);
    expect(fp4.success).toBe(false);
  });

  it('requires blockSize for blockwise INT4/INT8 storage', () => {
    const { blockSize: _blockSize, ...withoutBlockSize } =
      AMPERE_SM86_INT4_CACHE_POLICY_V1;

    const result =
      AmpereQuantizationPolicyV1Schema.safeParse(withoutBlockSize);

    expect(result.success).toBe(false);
  });

  it('does not allow a blockSize on FP16 storage', () => {
    const result = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      cacheStorageEncoding: 'fp16',
      blockSize: 64,
      executionBackend: 'dequantize_then_mm',
    });

    expect(result.success).toBe(false);
  });

  it('keeps CUTLASS INT4 as an explicit experimental backend', () => {
    const valid = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      executionBackend: 'cutlass_int4_experimental',
    });

    const invalid = AmpereQuantizationPolicyV1Schema.safeParse({
      ...AMPERE_SM86_INT4_CACHE_POLICY_V1,
      cacheStorageEncoding: 'fp16',
      blockSize: undefined,
      executionBackend: 'cutlass_int4_experimental',
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('forces strict FP32 exact rescore and disables TF32 for oracle parity', () => {
    expect(AMPERE_SM86_INT4_CACHE_POLICY_V1.exactRescoreDtype).toBe(
      'fp32',
    );
    expect(AMPERE_SM86_INT4_CACHE_POLICY_V1.tf32ForOracle).toBe(false);
    expect(AMPERE_SM86_INT4_CACHE_POLICY_V1.int4Role).toBe(
      'cache_hint_only',
    );
  });
});
