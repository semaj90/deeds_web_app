import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

/** SUM-EMB-RMQ-02: typed domain outcomes (independent of RabbitMQ ack/nack) + the immutable, checksummed receipt. */
export const SUMMARY_EMBEDDING_OUTCOMES = [
  'PROCESSED', 'ALREADY_MATERIALIZED',
  'BLOCKED_JOB_SCHEMA', 'BLOCKED_JOB_PAYLOAD_DRIFT', 'BLOCKED_SOURCE_REVISION_CHANGED', 'BLOCKED_WORKSPACE_REVISION_CHANGED',
  'BLOCKED_SUMMARY_CHANGED', 'BLOCKED_SUMMARY_NOT_CURRENT', 'BLOCKED_SUMMARY_NOT_ADMITTED', 'BLOCKED_CANONICAL_CHUNK_CHANGED',
  'BLOCKED_EMBEDDER_DIMENSION', 'BLOCKED_EMBEDDER_NONFINITE', 'BLOCKED_EMBEDDER_NOT_NORMALIZED', 'BLOCKED_REPRESENTATION_MISMATCH', 'BLOCKED_MODEL_REVISION_MISSING',
  'BLOCKED_WRITE_RACE', 'BLOCKED_READBACK_MISMATCH',
  'RETRYABLE_EMBEDDER_UNAVAILABLE', 'RETRYABLE_REPOSITORY_UNAVAILABLE',
] as const;
export type SummaryEmbeddingOutcomeV1 = (typeof SUMMARY_EMBEDDING_OUTCOMES)[number];
export type SummaryEmbeddingDispositionV1 = 'ACK' | 'RETRY' | 'DLQ';

/** Transport mapping: permanent outcomes ACK (retrying can never make them correct); retryables RETRY until maxAttempts, then DLQ. */
export function dispositionFor(outcome: SummaryEmbeddingOutcomeV1, attempt: number, maxAttempts: number): SummaryEmbeddingDispositionV1 {
  if (!outcome.startsWith('RETRYABLE_')) return 'ACK';
  return attempt >= maxAttempts ? 'DLQ' : 'RETRY';
}

const sha256Prefixed = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const nstr = z.string().min(1).nullable();

const body = z.object({
  schema: z.literal('atlas.summary-embedding-receipt.v1'),
  jobId: nstr, chunkRowId: nstr, canonicalChunkId: nstr,
  sourceRevision: nstr, workspaceRevision: nstr, summaryDigest: nstr, routingPayloadChecksum: nstr,
  representationId: nstr, representationRevision: nstr, modelRevision: nstr, tokenizerRevision: nstr, promptRevision: nstr, executorId: nstr,
  vectorDigest: sha256Prefixed.nullable(), dimension: z.number().int().nullable(), normalized: z.boolean().nullable(),
  writeStatus: z.enum(['NOT_ATTEMPTED', 'WRITTEN', 'LOST_RACE']),
  readbackStatus: z.enum(['NOT_ATTEMPTED', 'MATCH', 'MISMATCH', 'ABSENT']),
  outcome: z.enum(SUMMARY_EMBEDDING_OUTCOMES),
  reasons: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.boolean(),
}).strict();
export const SummaryEmbeddingReceiptV1Schema = body.extend({ checksum: sha256Prefixed }).strict().superRefine((v, ctx) => {
  const { checksum, ...rest } = v;
  if (checksum !== `sha256:${canonicalSha256V1(rest)}`) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['checksum'], message: 'receipt checksum mismatch' });
});
export type SummaryEmbeddingReceiptV1 = z.infer<typeof SummaryEmbeddingReceiptV1Schema>;
export type SummaryEmbeddingReceiptInputV1 = Omit<z.input<typeof body>, 'schema' | 'canonicalAuthority'>;

export function buildSummaryEmbeddingReceiptV1(input: SummaryEmbeddingReceiptInputV1): SummaryEmbeddingReceiptV1 {
  const b = { ...input, schema: 'atlas.summary-embedding-receipt.v1' as const, canonicalAuthority: false as const };
  return SummaryEmbeddingReceiptV1Schema.parse({ ...body.parse(b), checksum: `sha256:${canonicalSha256V1(body.parse(b))}` });
}

export function vectorDigestV1(vector: Float32Array): string {
  return `sha256:${createHash('sha256').update(Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength)).digest('hex')}`;
}
