import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';

/**
 * Resolves code source revisions from the canonical Postgres source/chunk fabric.
 *
 * Contract:
 * - source_revision for repository files is a git commit/revision identity.
 * - content_hash is separate byte/content evidence and MUST NOT be substituted.
 * - atlas_packets.workspace_revision / representation_revision are not aliases.
 * - exact packet identity wins over source_ref fallback.
 * - source_ref fallback is accepted only when all matching versioned rows agree.
 */

export const SourceRevisionResolutionStatusSchema = z.enum([
  'EXACT_PACKET_KEY',
  'UNIQUE_SOURCE_REF',
  'AMBIGUOUS',
  'UNVERSIONED',
  'MISSING',
]);
export type SourceRevisionResolutionStatus = z.infer<typeof SourceRevisionResolutionStatusSchema>;

export const SourceRevisionResolveInputV1Schema = z.object({
  candidateId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
}).strict();
export type SourceRevisionResolveInputV1 = z.infer<typeof SourceRevisionResolveInputV1Schema>;

export const SourceRevisionEvidenceRowV1Schema = z.object({
  rowId: z.string().min(1),
  sourceRef: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRevision: z.string().min(1).nullable(),
  sourceRevisionField: z.string().min(1).nullable(),
  contentHash: z.string().min(1).nullable(),
  updatedAt: z.string().min(1).nullable(),
}).strict();
export type SourceRevisionEvidenceRowV1 = z.infer<typeof SourceRevisionEvidenceRowV1Schema>;

export const SourceRevisionResolutionV1Schema = z.object({
  schema: z.literal('atlas.source-revision-resolution.v1'),
  candidateId: z.string().min(1),
  packetKey: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  status: SourceRevisionResolutionStatusSchema,
  sourceRevision: z.string().min(1).nullable(),
  contentHashes: z.array(z.string().min(1)),
  matchedRowIds: z.array(z.string().min(1)),
  matchedRowCount: z.number().int().nonnegative(),
  distinctRevisionCount: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string().min(1)),
  exactIdentityMatched: z.boolean(),
  canonicalWritesAllowed: z.literal(false),
}).strict();
export type SourceRevisionResolutionV1 = z.infer<typeof SourceRevisionResolutionV1Schema>;

type RawChunkRow = {
  row_id: unknown;
  source_ref: unknown;
  metadata: unknown;
  output_meta: unknown;
  content_hash: unknown;
  updated_at: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pickStringWithField(
  candidates: Array<[string, unknown]>,
): { value: string | null; field: string | null } {
  for (const [field, raw] of candidates) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (value) return { value, field };
  }
  return { value: null, field: null };
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function normalizeSourceRevisionEvidenceRow(raw: RawChunkRow): SourceRevisionEvidenceRowV1 | null {
  const rowId = typeof raw.row_id === 'string' ? raw.row_id.trim() : String(raw.row_id ?? '').trim();
  const sourceRef = typeof raw.source_ref === 'string' ? raw.source_ref.trim() : '';
  if (!rowId || !sourceRef) return null;

  const metadata = asRecord(raw.metadata);
  const outputMeta = asRecord(raw.output_meta);
  const packet = pickStringWithField([
    ['metadata.packet_key', metadata.packet_key],
    ['metadata.packetKey', metadata.packetKey],
    ['output_meta.packet_key', outputMeta.packet_key],
    ['output_meta.packetKey', outputMeta.packetKey],
  ]);
  const revision = pickStringWithField([
    ['metadata.source_revision', metadata.source_revision],
    ['metadata.sourceRevision', metadata.sourceRevision],
    ['metadata.source_revision_id', metadata.source_revision_id],
    ['metadata.sourceRevisionId', metadata.sourceRevisionId],
    ['output_meta.source_revision', outputMeta.source_revision],
    ['output_meta.sourceRevision', outputMeta.sourceRevision],
    ['output_meta.source_revision_id', outputMeta.source_revision_id],
    ['output_meta.sourceRevisionId', outputMeta.sourceRevisionId],
  ]);
  const contentHash = typeof raw.content_hash === 'string' && raw.content_hash.trim()
    ? raw.content_hash.trim()
    : null;

  return SourceRevisionEvidenceRowV1Schema.parse({
    rowId,
    sourceRef,
    packetKey: packet.value,
    sourceRevision: revision.value,
    sourceRevisionField: revision.field,
    contentHash,
    updatedAt: toIsoString(raw.updated_at),
  });
}

function classifyRows(
  input: SourceRevisionResolveInputV1,
  rows: readonly SourceRevisionEvidenceRowV1[],
  exactIdentityMatched: boolean,
): SourceRevisionResolutionV1 {
  if (!rows.length) {
    return SourceRevisionResolutionV1Schema.parse({
      schema: 'atlas.source-revision-resolution.v1',
      ...input,
      status: 'MISSING',
      sourceRevision: null,
      contentHashes: [],
      matchedRowIds: [],
      matchedRowCount: 0,
      distinctRevisionCount: 0,
      evidenceRefs: [],
      exactIdentityMatched,
      canonicalWritesAllowed: false,
    });
  }

  const revisions = uniqueSorted(rows.flatMap((row) => row.sourceRevision ? [row.sourceRevision] : []));
  const contentHashes = uniqueSorted(rows.flatMap((row) => row.contentHash ? [row.contentHash] : []));
  const matchedRowIds = uniqueSorted(rows.map((row) => row.rowId));
  const evidenceRefs = uniqueSorted(rows.flatMap((row) => [
    `codebase_chunk_index:${row.rowId}`,
    ...(row.packetKey ? [`packet:${row.packetKey}`] : []),
    ...(row.sourceRevision && row.sourceRevisionField
      ? [`${row.sourceRevisionField}:${row.sourceRevision}`]
      : []),
    ...(row.contentHash ? [`content-hash:${row.contentHash}`] : []),
  ]));

  let status: SourceRevisionResolutionStatus;
  let sourceRevision: string | null = null;
  if (revisions.length > 1) {
    status = 'AMBIGUOUS';
  } else if (revisions.length === 0) {
    status = 'UNVERSIONED';
  } else {
    sourceRevision = revisions[0];
    status = exactIdentityMatched ? 'EXACT_PACKET_KEY' : 'UNIQUE_SOURCE_REF';
  }

  return SourceRevisionResolutionV1Schema.parse({
    schema: 'atlas.source-revision-resolution.v1',
    ...input,
    status,
    sourceRevision,
    contentHashes,
    matchedRowIds,
    matchedRowCount: rows.length,
    distinctRevisionCount: revisions.length,
    evidenceRefs,
    exactIdentityMatched,
    canonicalWritesAllowed: false,
  });
}

export function resolveSourceRevisionFromEvidence(
  value: SourceRevisionResolveInputV1,
  evidenceRows: readonly SourceRevisionEvidenceRowV1[],
): SourceRevisionResolutionV1 {
  const input = SourceRevisionResolveInputV1Schema.parse(value);
  const rows = evidenceRows.filter((row) => row.sourceRef === input.sourceRef || row.packetKey === input.packetKey);

  if (input.packetKey) {
    const exactRows = rows.filter((row) => row.rowId === input.packetKey || row.packetKey === input.packetKey);
    if (exactRows.length) {
      // Never fall through from a known exact identity to a weaker source_ref row
      // merely because the exact row lacks revision metadata.
      return classifyRows(input, exactRows, true);
    }
  }

  return classifyRows(input, rows.filter((row) => row.sourceRef === input.sourceRef), false);
}

function valueList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export async function resolveSourceRevisionsFromPostgres(
  values: readonly SourceRevisionResolveInputV1[],
): Promise<SourceRevisionResolutionV1[]> {
  const inputs = values.map((value) => SourceRevisionResolveInputV1Schema.parse(value));
  if (!inputs.length) return [];

  const packetKeys = uniqueSorted(inputs.flatMap((input) => input.packetKey ? [input.packetKey] : []));
  const sourceRefs = uniqueSorted(inputs.map((input) => input.sourceRef));

  const exactResult = packetKeys.length
    ? await db.execute(sql`
        SELECT
          id::text AS row_id,
          source_ref,
          metadata,
          output_meta,
          content_hash,
          updated_at
        FROM codebase_chunk_index
        WHERE id::text IN (${valueList(packetKeys)})
           OR (metadata->>'packet_key') IN (${valueList(packetKeys)})
           OR (metadata->>'packetKey') IN (${valueList(packetKeys)})
           OR (output_meta->>'packet_key') IN (${valueList(packetKeys)})
           OR (output_meta->>'packetKey') IN (${valueList(packetKeys)})
      `)
    : { rows: [] as unknown[] };

  const fallbackResult = sourceRefs.length
    ? await db.execute(sql`
        SELECT
          id::text AS row_id,
          source_ref,
          metadata,
          output_meta,
          content_hash,
          updated_at
        FROM codebase_chunk_index
        WHERE source_ref IN (${valueList(sourceRefs)})
      `)
    : { rows: [] as unknown[] };

  const rowsById = new Map<string, SourceRevisionEvidenceRowV1>();
  for (const raw of [...exactResult.rows, ...fallbackResult.rows]) {
    const normalized = normalizeSourceRevisionEvidenceRow(raw as RawChunkRow);
    if (normalized) rowsById.set(normalized.rowId, normalized);
  }
  const rows = [...rowsById.values()];

  return inputs.map((input) => resolveSourceRevisionFromEvidence(input, rows));
}
