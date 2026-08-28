import { createHash } from 'node:crypto';
import { z } from 'zod';

export const CHUNK_PROJECTION_IDENTITY_SCHEMA_V2 = 'atlas.chunk-projection-identity.v2' as const;

const id = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const chunkProjectionIdentityV2Schema = z.object({
  schema: z.literal(CHUNK_PROJECTION_IDENTITY_SCHEMA_V2),
  packetKey: id,
  chunkId: id,
  chunkOrdinal: z.number().int().nonnegative(),
  canonicalSourceRef: id,
  sourceRevision: id,
  workspaceRevision: id,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  chunkContentHash: digest,
  treeNodeId: id.nullable(),
  symbolVersionId: id.nullable(),
  representationId: id,
  representationRevision: id,
  projectionRevision: id,
  chunkIdentityChecksum: digest,
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});

export type ChunkProjectionIdentityV2 = z.infer<typeof chunkProjectionIdentityV2Schema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function deriveChunkIdentityChecksumV2(input: Omit<ChunkProjectionIdentityV2, 'chunkIdentityChecksum'>): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

export function createChunkProjectionIdentityV2(input: Omit<ChunkProjectionIdentityV2, 'chunkIdentityChecksum'>): ChunkProjectionIdentityV2 {
  const normalized = { ...input, chunkIdentityChecksum: deriveChunkIdentityChecksumV2(input) };
  return chunkProjectionIdentityV2Schema.parse(normalized);
}

export function verifyChunkProjectionIdentityV2(value: unknown): boolean {
  const parsed = chunkProjectionIdentityV2Schema.safeParse(value);
  if (!parsed.success) return false;
  const { chunkIdentityChecksum, ...identity } = parsed.data;
  return chunkIdentityChecksum === deriveChunkIdentityChecksumV2(identity);
}
