import { z } from 'zod';
import {
  CANONICAL_SEMANTIC_DIMENSION,
  CANONICAL_SEMANTIC_REPRESENTATION_ID,
} from './feature-extraction-v1.js';
import { AmpereStorageEncodingV1Schema } from './gpu-quantization-v1.js';

/**
 * `EmbeddingTensorArtifactV2` — TENSOR-QUANT-01
 * (openspec/changes/parent-atlas-tensor-residency-integration/tasks.md)
 *
 * OWNERSHIP RULES
 * ---------------
 * 1. This describes a materialized tensor BYTE ARTIFACT (dimension, encoding,
 *    byte layout, checksum). It does not describe quantization POLICY — that
 *    is `AmpereQuantizationPolicyV1` (gpu-quantization-v1.ts), reused here via
 *    `encoding: AmpereStorageEncodingV1Schema` rather than a second parallel
 *    encoding enum. `F32`/`F16`/`Q8_SYMMETRIC`/`Q4_GROUPED` (the review's own
 *    naming) map onto that existing schema's `fp32`/`fp16`/
 *    `int8_symmetric_blockwise`/`int4_symmetric_blockwise` values — do not
 *    reintroduce a differently-cased duplicate of the same four encodings.
 *
 * 2. This is additive. The existing FP32 tile contract in
 *    `scripts/atlas/arrow-batch-export.mjs` / `verify-arrow-batch-export.mjs`
 *    (`vector_dim`/`vector_f32` columns, `dimensions=768, bytes=3072` for the
 *    canonical semantic_768 FP32 vector) is untouched by this file and stays
 *    the frozen v1 contract. A V2 artifact is a distinct, separately
 *    versioned representation, never a silent reinterpretation of the V1
 *    columns' meaning.
 *
 * 3. Quantized (Q8/Q4) byte-length validation is intentionally NOT asserted
 *    here as an exact formula. Real blockwise INT8/INT4 packing carries
 *    per-block scale/zero-point metadata whose exact overhead depends on the
 *    encoder that produces it — no such encoder exists yet in this repo
 *    (see TENSOR-QUANT-ISOQUANT-01's own NOT_PROVEN framing). Asserting a
 *    specific packed-byte formula before one is built and proven would be an
 *    unverified numeric claim; F32/F16 byte-length IS checked exactly below,
 *    since those are simple, already-real formats with no packing ambiguity.
 */

export const EmbeddingTensorArtifactV2Schema = z
  .object({
    schemaVersion: z.literal('atlas.embedding-tensor-artifact.v2'),

    // Semantic identity stays canonical regardless of physical encoding —
    // same invariant as AmpereQuantizationPolicyV1.
    representationId: z.literal(CANONICAL_SEMANTIC_REPRESENTATION_ID),
    dimension: z.literal(CANONICAL_SEMANTIC_DIMENSION),
    representationRevision: z.number().int().nonnegative(),

    encoding: AmpereStorageEncodingV1Schema,

    // Required for blockwise integer encodings; same divisibility rule as
    // AmpereQuantizationPolicyV1 (32/64/128 all divide 768 exactly).
    blockSize: z.union([z.literal(32), z.literal(64), z.literal(128)]).optional(),

    // Declared total byte length of the encoded tensor payload. Checked
    // exactly for fp32/fp16 (see superRefine below); required but not
    // formula-checked for the two blockwise integer encodings.
    byteLength: z.number().int().positive(),

    // Integrity binding for the actual encoded bytes.
    contentChecksum: z.string().min(1),

    // Ties this artifact back to canonical candidate/packet identity without
    // duplicating CandidateOrdinalMapV1's own fields — a reference, not a
    // reimplementation.
    candidateOrdinal: z.number().int().nonnegative().optional(),
    packetKey: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const blockwise =
      value.encoding === 'int8_symmetric_blockwise' ||
      value.encoding === 'int4_symmetric_blockwise';

    if (blockwise && value.blockSize === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockSize'],
        message: 'Blockwise integer encoding requires blockSize.',
      });
    }

    if (!blockwise && value.blockSize !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockSize'],
        message: 'blockSize is only valid for int8/int4 blockwise encodings.',
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

    if (value.encoding === 'fp32' && value.byteLength !== value.dimension * 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byteLength'],
        message: 'fp32 byteLength must equal dimension * 4 exactly.',
      });
    }

    if (value.encoding === 'fp16' && value.byteLength !== value.dimension * 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['byteLength'],
        message: 'fp16 byteLength must equal dimension * 2 exactly.',
      });
    }
  });

export type EmbeddingTensorArtifactV2 = z.infer<
  typeof EmbeddingTensorArtifactV2Schema
>;
