import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * CONTEXT-COMPRESSION-V1 (Headroom-style post-admission compression layer)
 * 
 * Sits strictly downstream of the ContextManifest authority boundary and
 * upstream of PromptPlanV1.
 * 
 * Guarantees:
 * - canonicalAuthority: false
 * - Reversible segment links (evidenceRef + inputChecksum)
 * - Deterministic compressionChecksum
 * - BitFrost content-addressed key derived from manifest + policy revisions
 */

export const CompressedSegmentSchema = z
  .object({
    evidenceRef: z.string().min(1),
    inputChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    compressedText: z.string(),
    compressedChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    reversibleRef: z.string().optional(),
    originalTokens: z.number().int().min(0),
    compressedTokens: z.number().int().min(0),
  })
  .strict();

export const ContextCompressionV1Schema = z
  .object({
    schema: z.literal('atlas.context-compression.v1'),
    inputManifestChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    compressionPolicyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    segments: z.array(CompressedSegmentSchema),
    totalOriginalTokens: z.number().int().min(0),
    totalCompressedTokens: z.number().int().min(0),
    compressionRatio: z.number().min(0),
    compressionChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    canonicalAuthority: z.literal(false),
  })
  .strict();

export type CompressedSegment = z.infer<typeof CompressedSegmentSchema>;
export type ContextCompressionV1 = z.infer<typeof ContextCompressionV1Schema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function buildCompressedSegment(input: {
  evidenceRef: string;
  rawText: string;
  compressedText: string;
  originalTokens: number;
  compressedTokens: number;
  reversibleRef?: string;
}): CompressedSegment {
  const inputChecksum = sha256(input.rawText);
  const compressedChecksum = sha256(input.compressedText);

  return CompressedSegmentSchema.parse({
    evidenceRef: input.evidenceRef,
    inputChecksum,
    compressedText: input.compressedText,
    compressedChecksum,
    reversibleRef: input.reversibleRef,
    originalTokens: input.originalTokens,
    compressedTokens: input.compressedTokens,
  });
}

export function buildContextCompressionV1(input: {
  inputManifestChecksum: string;
  compressionPolicyRevision: string;
  segments: CompressedSegment[];
}): ContextCompressionV1 {
  const totalOriginalTokens = input.segments.reduce((acc, s) => acc + s.originalTokens, 0);
  const totalCompressedTokens = input.segments.reduce((acc, s) => acc + s.compressedTokens, 0);
  const compressionRatio = totalOriginalTokens > 0
    ? totalCompressedTokens / totalOriginalTokens
    : 1.0;

  const unsigned = {
    schema: 'atlas.context-compression.v1' as const,
    inputManifestChecksum: input.inputManifestChecksum,
    compressionPolicyRevision: input.compressionPolicyRevision,
    segments: input.segments,
    totalOriginalTokens,
    totalCompressedTokens,
    compressionRatio,
    canonicalAuthority: false as const,
  };

  const compressionChecksum = sha256(JSON.stringify(unsigned));

  return ContextCompressionV1Schema.parse({
    ...unsigned,
    compressionChecksum,
  });
}

/**
 * Builds the BitFrost content-addressed cache key for the compressed context.
 * Key changes automatically whenever manifestChecksum or policyRevision changes.
 */
export function buildCompressedContextCacheKeyV1(
  manifestChecksum: string,
  compressionPolicyRevision: string,
): string {
  const combined = sha256(`${manifestChecksum}:${compressionPolicyRevision}`);
  return `atlas:bitfrost:v1:compressed_context:${combined}`;
}
