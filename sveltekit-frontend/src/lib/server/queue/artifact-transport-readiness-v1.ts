import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';

export const WORKFLOW_ARTIFACTS_TABLE = 'public.workflow_artifacts' as const;

const REQUIRED_COLUMNS = new Map<string, { dataType: string; nullable: boolean }>([
  ['artifact_id', { dataType: 'text', nullable: false }],
  ['artifact_hash', { dataType: 'text', nullable: false }],
  ['schema_id', { dataType: 'text', nullable: false }],
  ['checksum', { dataType: 'text', nullable: false }],
  ['revision_set_hash', { dataType: 'text', nullable: false }],
  ['revisions', { dataType: 'jsonb', nullable: false }],
  ['payload', { dataType: 'jsonb', nullable: false }],
  ['payload_byte_length', { dataType: 'integer', nullable: false }],
  ['created_at', { dataType: 'timestamp with time zone', nullable: false }],
]);

export type ArtifactTransportReadinessStatusV1 =
  | 'READY'
  | 'TABLE_MISSING'
  | 'SCHEMA_MISMATCH';

export type ArtifactTransportReadinessV1 = {
  schema: 'atlas.artifact-transport-readiness.v1';
  status: ArtifactTransportReadinessStatusV1;
  ready: boolean;
  table: typeof WORKFLOW_ARTIFACTS_TABLE;
  missingColumns: string[];
  incompatibleColumns: string[];
  primaryKeyProven: boolean;
  artifactHashUniqueProven: boolean;
};

type SqlExecutor = { execute: typeof db.execute };

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
};

type ConstraintRow = {
  constraint_type: 'PRIMARY KEY' | 'UNIQUE';
  column_name: string;
};

/**
 * Read-only deployment gate for the reference-only artifact transport.
 *
 * The queue migration is intentionally manual. Producers must not infer that
 * `workflow_artifacts` exists merely because the TypeScript contract exists in
 * the checkout. This probe proves the live database has the columns and key
 * constraints required by `postgres-json-artifact-v1.ts` without mutating it.
 */
export async function inspectArtifactTransportReadiness(
  executor: SqlExecutor = db,
): Promise<ArtifactTransportReadinessV1> {
  const tableResult = await executor.execute<{ table_name: string | null }>(sql`
    SELECT to_regclass(${WORKFLOW_ARTIFACTS_TABLE})::text AS table_name
  `);

  if (!tableResult.rows?.[0]?.table_name) {
    return {
      schema: 'atlas.artifact-transport-readiness.v1',
      status: 'TABLE_MISSING',
      ready: false,
      table: WORKFLOW_ARTIFACTS_TABLE,
      missingColumns: [...REQUIRED_COLUMNS.keys()],
      incompatibleColumns: [],
      primaryKeyProven: false,
      artifactHashUniqueProven: false,
    };
  }

  const columnsResult = await executor.execute<ColumnRow>(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workflow_artifacts'
  `);
  const actualColumns = new Map(columnsResult.rows.map((row) => [row.column_name, row]));

  const missingColumns: string[] = [];
  const incompatibleColumns: string[] = [];
  for (const [name, expected] of REQUIRED_COLUMNS) {
    const actual = actualColumns.get(name);
    if (!actual) {
      missingColumns.push(name);
      continue;
    }
    const actualNullable = actual.is_nullable === 'YES';
    if (actual.data_type !== expected.dataType || actualNullable !== expected.nullable) {
      incompatibleColumns.push(
        `${name}:expected=${expected.dataType}/${expected.nullable ? 'NULL' : 'NOT_NULL'};` +
          `actual=${actual.data_type}/${actualNullable ? 'NULL' : 'NOT_NULL'}`,
      );
    }
  }

  const constraintsResult = await executor.execute<ConstraintRow>(sql`
    SELECT tc.constraint_type, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'workflow_artifacts'
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
  `);

  const primaryKeyProven = constraintsResult.rows.some(
    (row) => row.constraint_type === 'PRIMARY KEY' && row.column_name === 'artifact_id',
  );
  const artifactHashUniqueProven = constraintsResult.rows.some(
    (row) => row.constraint_type === 'UNIQUE' && row.column_name === 'artifact_hash',
  );

  const ready =
    missingColumns.length === 0 &&
    incompatibleColumns.length === 0 &&
    primaryKeyProven &&
    artifactHashUniqueProven;

  return {
    schema: 'atlas.artifact-transport-readiness.v1',
    status: ready ? 'READY' : 'SCHEMA_MISMATCH',
    ready,
    table: WORKFLOW_ARTIFACTS_TABLE,
    missingColumns,
    incompatibleColumns,
    primaryKeyProven,
    artifactHashUniqueProven,
  };
}

export async function assertArtifactTransportReady(
  executor: SqlExecutor = db,
): Promise<ArtifactTransportReadinessV1> {
  const readiness = await inspectArtifactTransportReadiness(executor);
  if (!readiness.ready) {
    throw new Error(
      `ARTIFACT_TRANSPORT_STORE_NOT_READY:${readiness.status}:` +
        `missing=${readiness.missingColumns.join(',') || 'none'}:` +
        `incompatible=${readiness.incompatibleColumns.join(',') || 'none'}`,
    );
  }
  return readiness;
}
