import { z } from 'zod';
import {
  CANONICAL_SEMANTIC_DIMENSION,
  CANONICAL_SEMANTIC_REPRESENTATION_ID,
} from './feature-extraction-v1.js';

/**
 * Parent Atlas Ampere quantization contract.
 *
 * IMPORTANT OWNERSHIP RULES
 * -------------------------
 * 1. This file does NOT own semantic representation identity.
 *    `semantic_768` remains the canonical representation declared by
 *    feature-extraction-v1.ts (CANONICAL_SEMANTIC_REPRESENTATION_ID /
 *    CANONICAL_SEMANTIC_DIMENSION, imported above).
 *
 * 2. Quantization is a STORAGE / RESIDENCY encoding only.
 *    INT4 does not create a new representation such as `semantic_int4`.
 *
 * 3. SM86 (RTX 3060 Ti / Ampere) policy:
 *      - FP32: canonical/oracle compute path
 *      - FP16/BF16: supported hot compute paths
 *      - INT8/INT4: supported cache / integer Tensor Core families
 *      - FP8: NOT native on SM86
 *      - FP4: NOT native on SM86
 *
 * 4. V1 INT4 execution deliberately uses:
 *      packed INT4 cache -> dequantize -> FP16/FP32 score -> FP32 exact rescore
 *
 *    A native CUTLASS INT4 MMA scorer is a later experimental backend and must
 *    not silently replace the exact FP32/cuVS oracle.
 */

export const AmpereStorageEncodingV1Schema = z.enum([
  'fp32',
  'fp16',
  'int8_symmetric_blockwise',
  'int4_symmetric_blockwise',
]);

export type AmpereStorageEncodingV1 = z.infer<
  typeof AmpereStorageEncodingV1Schema
>;

export const AmpereScoreDtypeV1Schema = z.enum([
  'fp32',
  'fp16',
  'bf16',
]);

export const AmpereExecutionBackendV1Schema = z.enum([
  // First proof path: safest implementation.
  'dequantize_then_mm',

  // Future experiment only. Hardware supports INT4 integer Tensor Core MMA,
  // but this backend must earn its own parity receipt before promotion.
  'cutlass_int4_experimental',
]);

export const AmpereQuantizationPolicyV1Schema = z
  .object({
    schemaVersion: z.literal('atlas.gpu-quantization.v1'),

    // The current workstation target. Do not silently run this contract as an
    // FP8/FP4 policy on Ada/Hopper/Blackwell.
    targetArchitecture: z.literal('sm_86'),

    // Semantic identity stays canonical regardless of physical encoding.
    representationId: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    dimension: z.literal(CANONICAL_SEMANTIC_DIMENSION),

    // FP32 remains the correctness/oracle representation.
    canonicalDtype: z.literal('fp32'),

    cacheStorageEncoding: AmpereStorageEncodingV1Schema,

    // Required for blockwise integer encodings.
    // 32/64/128 all divide 768 exactly.
    blockSize: z.union([
      z.literal(32),
      z.literal(64),
      z.literal(128),
    ]).optional(),

    // INT4/INT8 cache contents are promoted to one of these types for the
    // initial scoring implementation.
    scoreDtype: AmpereScoreDtypeV1Schema,

    // Exact final verification remains FP32 in V1.
    exactRescoreDtype: z.literal('fp32'),

    // Strict parity/oracle runs must not silently permit TF32 approximation.
    // Performance experiments can use a separate policy revision later.
    tf32ForOracle: z.literal(false),

    executionBackend: AmpereExecutionBackendV1Schema,

    // Hardware capability declaration for SM86.
    // These literals intentionally make impossible configurations fail schema
    // validation before a GPU worker starts.
    nativeTensorCore: z
      .object({
        fp16: z.literal(true),
        bf16: z.literal(true),
        tf32: z.literal(true),
        int8: z.literal(true),
        int4: z.literal(true),
        fp8: z.literal(false),
        fp4: z.literal(false),
      })
      .strict(),

    // Until a corpus-level T3a comparison promotes it, INT4 can influence
    // residency/candidate work but cannot become canonical ranking truth.
    int4Role: z.literal('cache_hint_only'),

    // Prevents a cache encoding from masquerading as a new semantic
    // representation revision.
    preserveSemanticRepresentationIdentity: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    const blockwise =
      value.cacheStorageEncoding === 'int8_symmetric_blockwise' ||
      value.cacheStorageEncoding === 'int4_symmetric_blockwise';

    if (blockwise && value.blockSize === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockSize'],
        message: 'Blockwise integer storage requires blockSize.',
      });
    }

    if (!blockwise && value.blockSize !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockSize'],
        message:
          'blockSize is only valid for INT8/INT4 blockwise storage encodings.',
      });
    }

    if (
      value.blockSize !== undefined &&
      CANONICAL_SEMANTIC_DIMENSION % value.blockSize !== 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockSize'],
        message: 'blockSize must divide semantic_768 exactly.',
      });
    }

    if (
      value.executionBackend === 'cutlass_int4_experimental' &&
      value.cacheStorageEncoding !== 'int4_symmetric_blockwise'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionBackend'],
        message:
          'CUTLASS INT4 execution is only valid with INT4 blockwise storage.',
      });
    }
  });

export type AmpereQuantizationPolicyV1 = z.infer<
  typeof AmpereQuantizationPolicyV1Schema
>;

/**
 * Canonical first-pass policy for the RTX 3060 Ti / SM86 workstation.
 *
 * This is intentionally boring:
 *   INT4 cache -> dequantize -> FP16 score -> FP32 exact rescore.
 *
 * Native INT4 MMA can be evaluated later without changing semantic identity.
 */
export const AMPERE_SM86_INT4_CACHE_POLICY_V1: AmpereQuantizationPolicyV1 = {
  schemaVersion: 'atlas.gpu-quantization.v1',
  targetArchitecture: 'sm_86',
  representationId: CANONICAL_SEMANTIC_REPRESENTATION_ID,
  dimension: CANONICAL_SEMANTIC_DIMENSION,
  canonicalDtype: 'fp32',
  cacheStorageEncoding: 'int4_symmetric_blockwise',
  blockSize: 64,
  scoreDtype: 'fp16',
  exactRescoreDtype: 'fp32',
  tf32ForOracle: false,
  executionBackend: 'dequantize_then_mm',
  nativeTensorCore: {
    fp16: true,
    bf16: true,
    tf32: true,
    int8: true,
    int4: true,
    fp8: false,
    fp4: false,
  },
  int4Role: 'cache_hint_only',
  preserveSemanticRepresentationIdentity: true,
};
