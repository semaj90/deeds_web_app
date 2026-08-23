import { sql } from 'drizzle-orm';
import { z } from 'zod';

export const QDRANT_SYNC_LINEAGE_SCHEMA = 'atlas.qdrant-sync-lineage.v1' as const;
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const gitRevision = z.string().regex(/^[a-f0-9]{40,64}$/);

export const qdrantSyncLineageV1Schema = z.object({
  schema: z.literal(QDRANT_SYNC_LINEAGE_SCHEMA),
  status: z.enum([
    'LINEAGE_RESOLVED',
    'SOURCE_DIGEST_REQUIRED',
    'GRAPHIFY_LINEAGE_MISSING',
    'GRAPHIFY_LINEAGE_AMBIGUOUS',
    'GRAPHIFY_LINEAGE_INVALID',
  ]),
  sourceRef: z.string().min(1),
  sourceContentDigest: digest.nullable(),
  workspaceWorldRevision: sourceRevision.nullable(),
  repositoryRevision: gitRevision.nullable(),
  sourceRevision: sourceRevision.nullable(),
  sourceManifestDigest: digest.nullable(),
  rowsObserved: z.number().int().nonnegative(),
  mutationAllowed: z.boolean(),
  blocker: z.string().min(1).nullable(),
}).strict();
export type QdrantSyncLineageV1 = z.infer<typeof qdrantSyncLineageV1Schema>;

export interface QdrantSyncLineageSqlClientV1 {
  execute<T = unknown>(query: unknown): Promise<{ rows: T[] }>;
}

function normalizeDigest(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = /^(?:sha256:)?([a-f0-9]{64})$/.exec(raw);
  return match?.[1] ?? null;
}

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function blocked(input: {
  status: Exclude<QdrantSyncLineageV1['status'], 'LINEAGE_RESOLVED'>;
  sourceRef: string;
  digest: string | null;
  rowsObserved: number;
  blocker: string;
}): QdrantSyncLineageV1 {
  return qdrantSyncLineageV1Schema.parse({
    schema: QDRANT_SYNC_LINEAGE_SCHEMA,
    status: input.status,
    sourceRef: input.sourceRef,
    sourceContentDigest: input.digest,
    workspaceWorldRevision: null,
    repositoryRevision: null,
    sourceRevision: null,
    sourceManifestDigest: null,
    rowsObserved: input.rowsObserved,
    mutationAllowed: false,
    blocker: input.blocker,
  });
}

/**
 * Resolves revision authority for a packet payload projection without treating
 * atlas_packets.workspace_revision (cache epoch) as code-world identity.
 *
 * The exact packet source_ref + content digest must resolve to one logical
 * Graphify v2 lineage tuple. Multiple physical rows are allowed only if their
 * logical workspace/repository/source coordinates are identical.
 */
export async function resolveQdrantSyncLineageV1(input: {
  client: QdrantSyncLineageSqlClientV1;
  sourceRef: string;
  sourceContentDigest: string | null | undefined;
}): Promise<QdrantSyncLineageV1> {
  const sourceRef = normalizeSourceRef(z.string().min(1).parse(input.sourceRef));
  const contentDigest = normalizeDigest(input.sourceContentDigest);
  if (!contentDigest) {
    return blocked({
      status: 'SOURCE_DIGEST_REQUIRED',
      sourceRef,
      digest: null,
      rowsObserved: 0,
      blocker: 'PACKET_SOURCE_CONTENT_DIGEST_REQUIRED',
    });
  }

  const result = await input.client.execute<{
    source_ref: string;
    content_hash: string;
    code_source_revision: string;
    workspace_revision: string;
    repository_revision: string;
    source_manifest_digest: string;
  }>(sql`
    SELECT
      gf.source_ref,
      gf.content_hash,
      gf.code_source_revision,
      gr.workspace_revision,
      gr.repository_revision,
      gr.source_manifest_digest
    FROM graphify_files gf
    JOIN graphify_runs gr ON gr.run_id = gf.last_seen_run_id
    WHERE replace(gf.source_ref, '\\', '/') = ${sourceRef}
      AND lower(replace(gf.content_hash, 'sha256:', '')) = ${contentDigest}
      AND gf.code_source_revision IS NOT NULL
      AND gr.workspace_revision IS NOT NULL
      AND gr.repository_revision IS NOT NULL
      AND gr.source_manifest_digest IS NOT NULL
    ORDER BY gr.started_at DESC, gf.file_id
    LIMIT 16
  `);

  const rows = result.rows ?? [];
  if (rows.length === 0) {
    return blocked({
      status: 'GRAPHIFY_LINEAGE_MISSING',
      sourceRef,
      digest: contentDigest,
      rowsObserved: 0,
      blocker: 'EXACT_GRAPHIFY_V2_LINEAGE_NOT_FOUND',
    });
  }

  const valid = rows.flatMap((row) => {
    const rowDigest = normalizeDigest(row.content_hash);
    const candidate = {
      workspaceWorldRevision: String(row.workspace_revision ?? '').trim().toLowerCase(),
      repositoryRevision: String(row.repository_revision ?? '').trim().toLowerCase(),
      sourceRevision: String(row.code_source_revision ?? '').trim().toLowerCase(),
      sourceManifestDigest: normalizeDigest(row.source_manifest_digest),
      sourceRef: normalizeSourceRef(String(row.source_ref ?? '')),
      contentDigest: rowDigest,
    };
    const parsed = z.object({
      workspaceWorldRevision: sourceRevision,
      repositoryRevision: gitRevision,
      sourceRevision,
      sourceManifestDigest: digest,
      sourceRef: z.string().min(1),
      contentDigest: digest,
    }).safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });

  if (valid.length !== rows.length) {
    return blocked({
      status: 'GRAPHIFY_LINEAGE_INVALID',
      sourceRef,
      digest: contentDigest,
      rowsObserved: rows.length,
      blocker: 'GRAPHIFY_V2_LINEAGE_ROW_INVALID',
    });
  }

  const logical = new Map<string, typeof valid[number]>();
  for (const row of valid) {
    const key = [
      row.workspaceWorldRevision,
      row.repositoryRevision,
      row.sourceRevision,
      row.sourceManifestDigest,
      row.contentDigest,
    ].join('|');
    logical.set(key, row);
  }
  if (logical.size !== 1) {
    return blocked({
      status: 'GRAPHIFY_LINEAGE_AMBIGUOUS',
      sourceRef,
      digest: contentDigest,
      rowsObserved: rows.length,
      blocker: 'MULTIPLE_LOGICAL_GRAPHIFY_LINEAGES_MATCH_PACKET',
    });
  }

  const resolved = [...logical.values()][0]!;
  if (resolved.sourceRef !== sourceRef || resolved.contentDigest !== contentDigest) {
    return blocked({
      status: 'GRAPHIFY_LINEAGE_INVALID',
      sourceRef,
      digest: contentDigest,
      rowsObserved: rows.length,
      blocker: 'GRAPHIFY_LINEAGE_JOIN_KEY_DRIFT',
    });
  }

  return qdrantSyncLineageV1Schema.parse({
    schema: QDRANT_SYNC_LINEAGE_SCHEMA,
    status: 'LINEAGE_RESOLVED',
    sourceRef,
    sourceContentDigest: contentDigest,
    workspaceWorldRevision: resolved.workspaceWorldRevision,
    repositoryRevision: resolved.repositoryRevision,
    sourceRevision: resolved.sourceRevision,
    sourceManifestDigest: resolved.sourceManifestDigest,
    rowsObserved: rows.length,
    mutationAllowed: true,
    blocker: null,
  });
}
