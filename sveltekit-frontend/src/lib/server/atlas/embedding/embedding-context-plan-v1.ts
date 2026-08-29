import { createHash } from 'node:crypto';
import { z } from 'zod';

export const EmbeddingContextPlanV1Schema = z.object({
  schema: z.literal('atlas.embedding-context-plan.v1'),
  planRevision: z.string().min(1),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  tokenizerRevision: z.string().min(1),
  promptRevision: z.string().min(1),
  role: z.enum(['RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT', 'CODE_RETRIEVAL_QUERY', 'CLASSIFICATION_QUERY', 'CLUSTERING_QUERY']),
  text: z.string().min(1),
  title: z.string().nullable(),
  inputTextChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  renderedInput: z.string().min(1),
  renderedInputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  estimatedTokens: z.number().int().positive().max(2048),
  poolingPolicy: z.literal('MEAN'),
  normalizationPolicy: z.literal('L2'),
  sourceRef: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1).nullable(),
  packetKey: z.string().min(1).nullable(),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  canonicalAuthority: z.literal(false),
  planChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
}).strict();

export type EmbeddingContextPlanV1 = z.infer<typeof EmbeddingContextPlanV1Schema>;

export function digestEmbeddingInputV1(text: string): string {
  const normalized = text.trim();
  if (!normalized) throw new Error('EMBEDDING_CONTEXT_TEXT_REQUIRED');
  return `sha256:${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
}

export function digestTokenTensorV1(input: {
  tokenizerRevision: string;
  inputIds: readonly number[];
  attentionMask: readonly number[];
}): string {
  if (!input.tokenizerRevision.trim()) throw new Error('TOKENIZER_REVISION_REQUIRED');
  if (input.inputIds.length === 0 || input.inputIds.length !== input.attentionMask.length) {
    throw new Error('TOKEN_TENSOR_SHAPE_INVALID');
  }
  const ids = Buffer.alloc(input.inputIds.length * 8);
  const mask = Buffer.alloc(input.attentionMask.length * 8);
  input.inputIds.forEach((value, index) => ids.writeBigInt64LE(BigInt(value), index * 8));
  input.attentionMask.forEach((value, index) => mask.writeBigInt64LE(BigInt(value), index * 8));
  const hash = createHash('sha256');
  hash.update(input.tokenizerRevision);
  hash.update(`|ids:${input.inputIds.length}:[`);
  hash.update(ids);
  hash.update(`]|mask:${input.attentionMask.length}:[`);
  hash.update(mask);
  hash.update(']');
  return `sha256:${hash.digest('hex')}`;
}

export function estimateEmbeddingTokensV1(text: string): number {
  const normalized = text.trim();
  if (!normalized) throw new Error('EMBEDDING_CONTEXT_TEXT_REQUIRED');
  return Math.max(1, Math.ceil(Buffer.byteLength(normalized, 'utf8') / 4));
}
