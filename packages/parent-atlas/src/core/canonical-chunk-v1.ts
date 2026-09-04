import { createHash } from 'node:crypto';
import { z } from 'zod';

const nonEmpty = z.string().min(1);
const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sha256BareOrPrefixed = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);

export const CANONICAL_CHUNK_V1 = 'atlas.canonical-chunk.v1' as const;

export const canonicalChunkV1Schema = z.object({
  schema: z.literal(CANONICAL_CHUNK_V1),
  chunkId: nonEmpty,
  identityAuthority: z.literal('EXISTING_CANONICAL_OWNER'),
  sourceRef: nonEmpty,
  sourceRevision: sha256Revision,
  workspaceRevision: sha256Revision,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  textChecksum: sha256Revision,
  chunkerRevision: nonEmpty,
  headingPath: z.array(nonEmpty).optional(),
  stableSymbolId: nonEmpty.optional(),
  symbolVersionId: nonEmpty.optional(),
  treeNodeId: nonEmpty.optional(),
  astPath: z.array(nonEmpty).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.endByte <= value.startByte) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endByte'],
      message: 'endByte must be greater than startByte',
    });
  }
});

export type CanonicalChunkV1 = z.infer<typeof canonicalChunkV1Schema>;

/**
 * Compatibility shape for existing Parent Atlas / GIS / Graphify chunk bindings.
 * Extra projection fields are deliberately ignored by Zod. This adapter consumes
 * existing identity; it never derives a competing chunk or symbol identifier.
 */
export const existingCanonicalChunkBindingV1Schema = z.object({
  chunkId: nonEmpty,
  canonicalSourceRef: nonEmpty,
  sourceRevision: sha256Revision,
  workspaceRevision: sha256Revision,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().positive(),
  chunkContentHash: sha256BareOrPrefixed,
  stableSymbolId: nonEmpty.nullish(),
  symbolVersionId: nonEmpty.nullish(),
  treeNodeId: nonEmpty.nullish(),
});

export type ExistingCanonicalChunkBindingV1 = z.infer<typeof existingCanonicalChunkBindingV1Schema>;

function normalizeSha256(value: string): string {
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Adapts an already-owned source-code chunk identity into the directory-ingestion
 * contract. chunkId/source/symbol identities are copied from the existing owner.
 * No identity is inferred from path, ordinal, Qdrant ID, TreeNodeId, or text.
 */
export function adaptExistingCanonicalChunkV1(input: {
  binding: ExistingCanonicalChunkBindingV1 | Record<string, unknown>;
  chunkerRevision: string;
  headingPath?: string[];
  stableSymbolId?: string | null;
  astPath?: string[];
}): CanonicalChunkV1 {
  const binding = existingCanonicalChunkBindingV1Schema.parse(input.binding);
  return canonicalChunkV1Schema.parse({
    schema: CANONICAL_CHUNK_V1,
    chunkId: binding.chunkId,
    identityAuthority: 'EXISTING_CANONICAL_OWNER',
    sourceRef: binding.canonicalSourceRef,
    sourceRevision: binding.sourceRevision,
    workspaceRevision: binding.workspaceRevision,
    startByte: binding.startByte,
    endByte: binding.endByte,
    textChecksum: normalizeSha256(binding.chunkContentHash),
    chunkerRevision: input.chunkerRevision,
    headingPath: input.headingPath,
    stableSymbolId: input.stableSymbolId ?? binding.stableSymbolId ?? undefined,
    symbolVersionId: binding.symbolVersionId ?? undefined,
    treeNodeId: binding.treeNodeId ?? undefined,
    astPath: input.astPath,
  });
}

/** Compute the checksum of an exact UTF-8 byte span. */
export function computeCanonicalChunkTextChecksumV1(
  sourceBytes: Uint8Array,
  startByte: number,
  endByte: number,
): string {
  if (!Number.isInteger(startByte) || !Number.isInteger(endByte)
    || startByte < 0 || endByte <= startByte || endByte > sourceBytes.byteLength) {
    throw new Error('CANONICAL_CHUNK_BYTE_SPAN_INVALID');
  }
  return sha256Bytes(sourceBytes.subarray(startByte, endByte));
}

/**
 * Verifies that a CanonicalChunkV1 span still addresses the exact bytes recorded
 * by textChecksum. This uses byte offsets, not JavaScript character offsets.
 */
export function verifyCanonicalChunkSpanV1(
  chunkInput: CanonicalChunkV1,
  sourceBytes: Uint8Array,
): boolean {
  const chunk = canonicalChunkV1Schema.parse(chunkInput);
  if (chunk.endByte > sourceBytes.byteLength) return false;
  return computeCanonicalChunkTextChecksumV1(
    sourceBytes,
    chunk.startByte,
    chunk.endByte,
  ) === chunk.textChecksum;
}

/** Stable replay checksum independent of input enumeration order. */
export function computeCanonicalChunkSetChecksumV1(
  chunks: readonly CanonicalChunkV1[],
): string {
  const normalized = chunks
    .map((chunk) => canonicalChunkV1Schema.parse(chunk))
    .sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)
      || a.startByte - b.startByte
      || a.endByte - b.endByte
      || a.chunkId.localeCompare(b.chunkId));
  return sha256Bytes(Buffer.from(JSON.stringify(normalized), 'utf8'));
}
