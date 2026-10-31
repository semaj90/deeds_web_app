import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

export const EMBEDDINGGEMMA_REPRESENTATIONS = {
  semantic_768: { dim: 768, kind: 'canonical', model: 'embeddinggemma:latest' },
  mrl_512:      { dim: 512, kind: 'mrl_slice', parent: 'semantic_768' },
  mrl_256:      { dim: 256, kind: 'mrl_slice', parent: 'semantic_768' },
  mrl_128:      { dim: 128, kind: 'mrl_slice', parent: 'semantic_768' },
  latent256:    { dim: 256, kind: 'pytorch_latent', parent: 'semantic_768' },
  latent128:    { dim: 128, kind: 'pytorch_latent', parent: 'semantic_768' },
  latent64:     { dim: 64,  kind: 'pytorch_latent', parent: 'semantic_768' },
} as const;

export type EmbeddingGemmaRepId = keyof typeof EMBEDDINGGEMMA_REPRESENTATIONS;

export function l2Normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-12 || !Number.isFinite(norm)) {
    throw new Error('EMBEDDINGGEMMA_ZERO_OR_NONFINITE_NORM');
  }
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/**
 * Produces canonical 768-D vector and deterministic Matryoshka (MRL) 512, 256, 128 slices.
 * Rejects any input that is not exactly 768 floats.
 */
export function deriveCanonicalMrlBundleV1(raw768: Float32Array | number[]) {
  if (raw768.length !== 768) {
    throw new Error(`EMBEDDINGGEMMA_INVALID_DIM: expected 768, got ${raw768.length}`);
  }
  const f768 = raw768 instanceof Float32Array ? raw768 : new Float32Array(raw768);
  const semantic_768 = l2Normalize(f768);
  const mrl_512 = l2Normalize(semantic_768.subarray(0, 512));
  const mrl_256 = l2Normalize(semantic_768.subarray(0, 256));
  const mrl_128 = l2Normalize(semantic_768.subarray(0, 128));

  // Pack 128-bit sign bitset (16 bytes) from mrl_128 for AVX2 Hamming pre-filter
  const bitset128Bytes = new Uint8Array(16);
  for (let i = 0; i < 128; i++) {
    if (mrl_128[i] >= 0) {
      bitset128Bytes[i >> 3] |= 1 << (i & 7);
    }
  }

  const sha256 = createHash('sha256')
    .update(Buffer.from(semantic_768.buffer, semantic_768.byteOffset, semantic_768.byteLength))
    .digest('hex');

  return {
    semantic_768,
    mrl_512,
    mrl_256,
    mrl_128,
    bitset128Bytes,
    bitset128Hex: Buffer.from(bitset128Bytes).toString('hex'),
    sha256,
  };
}

/**
 * Qualified Bitset Batch Producer Contract for compute-worker.mjs AVX2 Scorer.
 * Enforces mandatory HMAC verification and ordinal-map checksum binding.
 */
export const QualifiedBitsetBatchSchemaV1 = z.object({
  workspaceId: z.string().uuid(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  representationId: z.literal('mrl_128'),
  ordinalMapChecksumSha256: z.string().length(64),
  candidateOrdinals: z.instanceof(Uint32Array),
  queryBitset16B: z.instanceof(Uint8Array).refine((b) => b.byteLength === 16),
  candidateBitsets16B: z.instanceof(Uint8Array).refine(
    (b) => b.byteLength > 0 && b.byteLength % 16 === 0 && b.byteLength / 16 <= 65536
  ),
  hmacSignatureHex: z.string().length(64),
});

export function verifyQualifiedBitsetBatchHmacV1(
  batch: z.infer<typeof QualifiedBitsetBatchSchemaV1>,
  secretKey: string
): boolean {
  if (!secretKey || secretKey.length < 16) {
    throw new Error('AVX2_BATCH_HMAC_SECRET_REQUIRED');
  }
  const parsed = QualifiedBitsetBatchSchemaV1.parse(batch);
  if (parsed.candidateOrdinals.length !== parsed.candidateBitsets16B.byteLength / 16) {
    throw new Error('AVX2_BATCH_ORDINAL_COUNT_MISMATCH');
  }
  const mac = createHmac('sha256', secretKey)
    .update(parsed.workspaceId)
    .update(parsed.workspaceRevision)
    .update(parsed.sourceRevision)
    .update(parsed.ordinalMapChecksumSha256)
    .update(Buffer.from(parsed.queryBitset16B))
    .update(Buffer.from(parsed.candidateBitsets16B))
    .digest('hex');

  return mac === parsed.hmacSignatureHex;
}
