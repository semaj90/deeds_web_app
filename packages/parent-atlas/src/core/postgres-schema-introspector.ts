import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  deriveSchemaObjectKey,
  deriveSchemaObjectNominationId,
  schemaObjectNominationSchema,
  type SchemaObjectNominationV1,
} from './schema-object-registry.js';

const revision = z.string().min(1);

export const postgresSchemaIntrospectionReceiptSchema = z.object({
  schema: z.literal('atlas.postgres-schema-introspection-receipt.v1').default('atlas.postgres-schema-introspection-receipt.v1'),
  database_key: z.string().min(1),
  source_revision: revision,
  schema_revision: revision,
  schema_names: z.array(z.string().min(1)),
  nomination_count: z.number().int().nonnegative(),
  counts_by_kind: z.record(z.string(), z.number().int().nonnegative()),
  catalog_oids_recorded: z.number().int().nonnegative(),
  input_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  output_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
  canonical_identity_created: z.literal(false).default(false),
}).strict();

export type PostgresSchemaIntrospectionReceiptV1 = z.infer<typeof postgresSchemaIntrospectionReceiptSchema>;

function sha256(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

function quoteQualified(schemaName: string, objectName: string): string {
  return `${schemaName}.${objectName}`;
}

function definitionHash(value: unknown): string {
  return sha256(value);
}

function nomination(input: Omit<z.input<typeof schemaObjectNominationSchema>, 'nomination_id' | 'object_key' | 'definition_hash'> & {
  definition: unknown;
}): SchemaObjectNominationV1 {
  const objectKey = deriveSchemaObjectKey({
    database_key: input.database_key,
    schema_name: input.schema_name,
    kind: input.kind,
    qualified_name: input.qualified_name,
  });
  const hash = definitionHash(input.definition);
  return schemaObjectNominationSchema.parse({
    ...input,
    definition: undefined,
    object_key: objectKey,
    nomination_id: deriveSchemaObjectNominationId({
      object_key: objectKey,
      schema_revision: input.schema_revision,
      definition_hash: hash,
    }),
    definition_hash: hash,
    canonical_authority: false,
  });
}

async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { return await fn(client); } finally { client.release(); }
}

/**
 * PostgreSQL 18 catalog introspector.
 *
 * The query uses supported catalog/deparser surfaces:
 * - pg_class/pg_namespace for relations
 * - pg_attribute + pg_get_expr for columns/defaults
 * - pg_constraint + pg_get_constraintdef for constraints/FKs
 * - pg_index + pg_get_indexdef for indexes
 * - pg_policy + pg_get_expr for RLS policies
 * - pg_proc + pg_get_functiondef/identity arguments for functions/procedures
 * - pg_trigger + pg_get_triggerdef for non-internal triggers
 *
 * Catalog OIDs are copied to nomination/version provenance only. They are never
 * included in object_key, so dump/restore or catalog rebuilds cannot redefine
 * stable Atlas schema identity.
 */
export async function introspectPostgresSchema(pool: Pool, input: {
  database_key: string;
  source_ref: string;
  source_revision: string;
  schema_revision: string;
  schema_names?: string[];
  producer_revision: string;
}): Promise<{ nominations: SchemaObjectNominationV1[]; receipt: PostgresSchemaIntrospectionReceiptV1 }> {
  const schemaNames = [...new Set((input.schema_names?.length ? input.schema_names : ['public']).map((value) => value.trim()).filter(Boolean))].sort();
  if (schemaNames.length === 0) throw new Error('POSTGRES_SCHEMA_NAMES_REQUIRED');

  return withClient(pool, async (client) => {
    const rows = await client.query<{
      kind: SchemaObjectNominationV1['kind'];
      schema_name: string;
      object_name: string;
      qualified_name: string;
      parent_qualified_name: string | null;
      catalog_oid: number | null;
      definition: unknown;
    }>(`
      WITH target_namespaces AS (
        SELECT oid, nspname
        FROM pg_namespace
        WHERE nspname = ANY($1::text[])
      ), relation_rows AS (
        SELECT
          CASE c.relkind WHEN 'v' THEN 'view' ELSE 'table' END::text AS kind,
          n.nspname::text AS schema_name,
          c.relname::text AS object_name,
          (n.nspname || '.' || c.relname)::text AS qualified_name,
          NULL::text AS parent_qualified_name,
          c.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'relkind', c.relkind,
            'rowsecurity', c.relrowsecurity,
            'forcerowsecurity', c.relforcerowsecurity,
            'partitioned', c.relkind = 'p'
          ) AS definition
        FROM pg_class c
        JOIN target_namespaces n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p','v')
      ), column_rows AS (
        SELECT
          'column'::text AS kind,
          n.nspname::text AS schema_name,
          a.attname::text AS object_name,
          (n.nspname || '.' || c.relname || '.' || a.attname)::text AS qualified_name,
          (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
          c.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'table_oid', c.oid,
            'attnum', a.attnum,
            'type', format_type(a.atttypid, a.atttypmod),
            'not_null', a.attnotnull,
            'identity', a.attidentity,
            'generated', a.attgenerated,
            'default', pg_get_expr(d.adbin, d.adrelid, false)
          ) AS definition
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN target_namespaces n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE c.relkind IN ('r','p','v') AND a.attnum > 0 AND NOT a.attisdropped
      ), constraint_rows AS (
        SELECT
          CASE WHEN con.contype = 'f' THEN 'foreign_key' ELSE 'constraint' END::text AS kind,
          n.nspname::text AS schema_name,
          con.conname::text AS object_name,
          (n.nspname || '.' || c.relname || '.' || con.conname)::text AS qualified_name,
          (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
          con.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'contype', con.contype,
            'definition', pg_get_constraintdef(con.oid, false),
            'validated', con.convalidated,
            'enforced', con.conenforced,
            'deferrable', con.condeferrable,
            'deferred', con.condeferred,
            'referenced_table_oid', NULLIF(con.confrelid, 0)
          ) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN target_namespaces n ON n.oid = c.relnamespace
        WHERE con.conrelid <> 0
      ), index_rows AS (
        SELECT
          'index'::text AS kind,
          n.nspname::text AS schema_name,
          idx.relname::text AS object_name,
          (n.nspname || '.' || idx.relname)::text AS qualified_name,
          (n.nspname || '.' || tbl.relname)::text AS parent_qualified_name,
          idx.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'definition', pg_get_indexdef(idx.oid, 0, false),
            'unique', i.indisunique,
            'primary', i.indisprimary,
            'valid', i.indisvalid,
            'ready', i.indisready,
            'predicate', pg_get_expr(i.indpred, i.indrelid, false)
          ) AS definition
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_class tbl ON tbl.oid = i.indrelid
        JOIN target_namespaces n ON n.oid = tbl.relnamespace
      ), policy_rows AS (
        SELECT
          'database_policy'::text AS kind,
          n.nspname::text AS schema_name,
          p.polname::text AS object_name,
          (n.nspname || '.' || c.relname || '.' || p.polname)::text AS qualified_name,
          (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
          p.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'command', p.polcmd,
            'permissive', p.polpermissive,
            'roles', p.polroles,
            'using', pg_get_expr(p.polqual, p.polrelid, false),
            'with_check', pg_get_expr(p.polwithcheck, p.polrelid, false),
            'table_row_security_enabled', c.relrowsecurity
          ) AS definition
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN target_namespaces n ON n.oid = c.relnamespace
      ), function_rows AS (
        SELECT
          'database_function'::text AS kind,
          n.nspname::text AS schema_name,
          p.proname::text AS object_name,
          (n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text AS qualified_name,
          n.nspname::text AS parent_qualified_name,
          p.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'kind', p.prokind,
            'identity_arguments', pg_get_function_identity_arguments(p.oid),
            'result', pg_get_function_result(p.oid),
            'definition', pg_get_functiondef(p.oid)
          ) AS definition
        FROM pg_proc p
        JOIN target_namespaces n ON n.oid = p.pronamespace
      ), trigger_rows AS (
        SELECT
          'trigger'::text AS kind,
          n.nspname::text AS schema_name,
          t.tgname::text AS object_name,
          (n.nspname || '.' || c.relname || '.' || t.tgname)::text AS qualified_name,
          (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
          t.oid::bigint AS catalog_oid,
          jsonb_build_object(
            'definition', pg_get_triggerdef(t.oid, false),
            'enabled', t.tgenabled,
            'function_oid', t.tgfoid
          ) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN target_namespaces n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
      )
      SELECT * FROM relation_rows
      UNION ALL SELECT * FROM column_rows
      UNION ALL SELECT * FROM constraint_rows
      UNION ALL SELECT * FROM index_rows
      UNION ALL SELECT * FROM policy_rows
      UNION ALL SELECT * FROM function_rows
      UNION ALL SELECT * FROM trigger_rows
      ORDER BY schema_name, kind, qualified_name
    `, [schemaNames]);

    const nominations = rows.rows.map((row) => nomination({
      database_key: input.database_key,
      schema_name: row.schema_name,
      kind: row.kind,
      object_name: row.object_name,
      parent_object_key: row.parent_qualified_name
        ? deriveSchemaObjectKey({
          database_key: input.database_key,
          schema_name: row.schema_name,
          kind: row.kind === 'column' || row.kind === 'foreign_key' || row.kind === 'constraint' || row.kind === 'database_policy' || row.kind === 'trigger'
            ? 'table'
            : 'schema',
          qualified_name: row.parent_qualified_name,
        })
        : null,
      qualified_name: row.qualified_name,
      source_ref: input.source_ref,
      source_revision: input.source_revision,
      schema_revision: input.schema_revision,
      catalog_oid: row.catalog_oid,
      extractor_revision: input.producer_revision,
      definition: row.definition,
    }));

    const countsByKind: Record<string, number> = {};
    for (const item of nominations) countsByKind[item.kind] = (countsByKind[item.kind] ?? 0) + 1;
    const receipt = postgresSchemaIntrospectionReceiptSchema.parse({
      database_key: input.database_key,
      source_revision: input.source_revision,
      schema_revision: input.schema_revision,
      schema_names: schemaNames,
      nomination_count: nominations.length,
      counts_by_kind: countsByKind,
      catalog_oids_recorded: nominations.filter((item) => item.catalog_oid != null).length,
      input_checksum: sha256({ database_key: input.database_key, schemaNames, source_revision: input.source_revision, schema_revision: input.schema_revision }),
      output_checksum: sha256(nominations),
      producer_revision: input.producer_revision,
      canonical_identity_created: false,
    });

    return { nominations, receipt };
  });
}

export function describePostgresSchemaIntrospector(): string {
  return [
    'PostgreSQL system catalogs are read-only discovery inputs for Atlas schema nominations.',
    'Supported pg_get_* deparsers generate revision evidence for constraints, indexes, expressions, functions and triggers.',
    'Catalog OIDs are recorded as revision-local provenance only and never contribute to object_key.',
    'Schema nominations must resolve through atlas_schema_object_registry before becoming atlas_evidence_entities canonical join keys.',
  ].join(' ');
}
